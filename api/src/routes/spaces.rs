use rocket::serde::json::{serde_json, Json};
use rocket::State;
use rocket::{get, http::Status, post, put};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::prelude::*;
use std::path::PathBuf;
use std::{env, vec};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::lock::{LockEntry, LockManager};
use crate::{
    db::establish_connection,
    events::{EventBus, SpaceEvent},
    model::{OpLogClearInsert, OpLogImportInsert, OpLogInsert, OpLogTransformInsert, Token},
    schema::{op_log, op_log_clear, op_log_import, op_log_transform},
};
use diesel::{RunQueryDsl, SelectableHelper};
use mork_client::{path_to_sexpr, ExploreResult, MorkClient, MorkError, NamespaceInfo};

// ─── Log helpers ─────────────────────────────────────────────────────────────

fn insert_op_log(op_type: &str, token_id: i32) -> Option<i32> {
    diesel::insert_into(op_log::table)
        .values(&OpLogInsert {
            op_type: op_type.to_string(),
            token_id: Some(token_id),
        })
        .returning(op_log::id)
        .get_result::<i32>(&mut establish_connection())
        .ok()
}

// ─── Permission ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum PermissionError {
    ReadRequired,
    WriteRequired,
    NamespaceMismatch { path: String, namespace: String },
}

#[derive(Debug, Clone)]
pub struct Permission {
    pub namespace: String,
    pub can_read: bool,
    pub can_write: bool,
}

impl Permission {
    pub fn new(namespace: impl Into<String>, can_read: bool, can_write: bool) -> Self {
        Self {
            namespace: namespace.into(),
            can_read,
            can_write,
        }
    }

    pub fn require_read(&self) -> Result<(), PermissionError> {
        if self.can_read {
            Ok(())
        } else {
            Err(PermissionError::ReadRequired)
        }
    }

    pub fn require_write(&self) -> Result<(), PermissionError> {
        if self.can_write {
            Ok(())
        } else {
            Err(PermissionError::WriteRequired)
        }
    }

    pub fn check_namespace(&self, path: &std::path::Path) -> Result<(), PermissionError> {
        if self.namespace.is_empty() {
            return Ok(());
        }
        if !path.starts_with(&self.namespace) {
            return Err(PermissionError::NamespaceMismatch {
                path: path.to_string_lossy().into_owned(),
                namespace: self.namespace.clone(),
            });
        }
        Ok(())
    }
}

fn permission_error_to_status(_: PermissionError) -> Status {
    Status::Unauthorized
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn permission_from_token(token: &Token) -> Permission {
    let namespace = token
        .namespace
        .strip_prefix('/')
        .unwrap_or(&token.namespace)
        .to_string();
    Permission::new(namespace, token.permission_read, token.permission_write)
}

fn mork_error_to_status(e: MorkError) -> Status {
    match e {
        _ => Status::InternalServerError,
    }
}

fn get_mork_client() -> MorkClient {
    MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap())
}

fn path_to_event_path(path: &PathBuf) -> String {
    let s = path.to_string_lossy();
    if s.is_empty() {
        "/".to_string()
    } else {
        format!("/{}/", s)
    }
}

/// Returns true if a MORK error indicates a lock conflict (path temporarily unavailable).
fn is_lock_conflict(e: &MorkError) -> bool {
    matches!(e, MorkError::BadStatus(401))
}

/// Default wait per retry attempt (5 seconds).
const LOCK_WAIT_MS: u64 = 5_000;
/// Default number of retries before giving up.
const LOCK_MAX_RETRIES: u32 = 2;

/// Retries an async operation if it fails due to a lock conflict.
///
/// On each conflict: waits for the path to become available (up to `wait_ms`),
/// then retries. After `max_retries` exhausted, returns 409 Conflict.
async fn with_retry<F, Fut, T>(
    path: &PathBuf,
    wait_ms: u64,
    max_retries: u32,
    operation: F,
) -> Result<T, Status>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, MorkError>>,
{
    let mut attempts = 0;
    loop {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) if is_lock_conflict(&e) && attempts < max_retries => {
                attempts += 1;
                // Wait for the path to become available before retrying
                let _ = get_mork_client().wait_for_available(path, wait_ms).await;
            }
            Err(e) if is_lock_conflict(&e) => {
                return Err(Status::Conflict);
            }
            Err(e) => return Err(mork_error_to_status(e)),
        }
    }
}

pub(crate) async fn with_lock<F, Fut, T>(
    lock_manager: &State<LockManager>,
    paths: &[&PathBuf],
    operation: F,
) -> Result<T, Status>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, Status>>,
{
    let _l = lock_manager.op_mutex.lock().await;

    for &path in paths {
        for ancestor in path.ancestors() {
            if let Some(entry) = lock_manager
                .cache
                .get(&ancestor.to_string_lossy().to_string())
                .await
            {
                if entry.is_locked {
                    return Err(Status::Conflict);
                }
            }
        }

        if let Some(entry) = lock_manager
            .cache
            .get(&path.to_string_lossy().to_string())
            .await
        {
            if entry.descendants_locked > 0 {
                return Err(Status::Conflict);
            }
        }
    }

    for &path in paths {
        for ancestor in path.ancestors() {
            lock_manager
                .cache
                .entry(ancestor.to_string_lossy().to_string())
                .and_upsert_with(|maybe_entry| {
                    let mut entry = match maybe_entry {
                        Some(entry_ref) => entry_ref.value().clone(),
                        None => LockEntry::default(),
                    };
                    if ancestor == path.as_path() {
                        entry.is_locked = true;
                    } else {
                        entry.descendants_locked += 1;
                    }
                    std::future::ready(entry)
                })
                .await;
        }
    }

    let result = operation().await;

    for &path in paths {
        for ancestor in path.ancestors() {
            lock_manager
                .cache
                .entry(ancestor.to_string_lossy().to_string())
                .and_upsert_with(|maybe_entry| {
                    let mut entry = match maybe_entry {
                        Some(entry_ref) => entry_ref.value().clone(),
                        None => LockEntry::default(),
                    };
                    if ancestor == path.as_path() {
                        entry.is_locked = false;
                    }
                    entry.descendants_locked = entry.descendants_locked.saturating_sub(1);
                    std::future::ready(entry)
                })
                .await;
        }
    }

    result
}

// ─── Transform ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Transformation {
    input_spaces: Vec<PathBuf>,
    output_spaces: Vec<PathBuf>,
    patterns: Vec<String>,
    templates: Vec<String>,
}

#[put("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    if transformation.input_spaces.len() != transformation.patterns.len()
        || transformation.output_spaces.len() != transformation.templates.len()
    {
        return Err(Status::BadRequest);
    }

    let all_balanced = transformation
        .patterns
        .iter()
        .chain(transformation.templates.iter())
        .all(|s| mork_client::is_balanced(s));
    if !all_balanced {
        return Err(Status::UnprocessableEntity);
    }

    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.require_write().map_err(permission_error_to_status)?;
    for path in transformation
        .input_spaces
        .iter()
        .chain(transformation.output_spaces.iter())
    {
        perm.check_namespace(path)
            .map_err(permission_error_to_status)?;
    }

    let prefix_path = PathBuf::from("space");

    let input: Vec<(std::path::PathBuf, &str)> = transformation
        .input_spaces
        .iter()
        .zip(transformation.patterns.iter())
        .map(|(p, pat)| (prefix_path.join(p), pat.as_str()))
        .collect();
    let output: Vec<(std::path::PathBuf, &str)> = transformation
        .output_spaces
        .iter()
        .zip(transformation.templates.iter())
        .map(|(p, tmpl)| (prefix_path.join(p), tmpl.as_str()))
        .collect();

    // Use the first output space as the event path (primary write target)
    let event_path = transformation
        .output_spaces
        .first()
        .map(|p| {
            let skipped: PathBuf = p.components().skip(1).collect();
            path_to_event_path(&skipped)
        })
        .unwrap_or_else(|| "/".to_string());

    let _ = bus.0.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });

    let operation_id = Uuid::new_v4();

    let input_for_cmd: Vec<(std::path::PathBuf, String)> = input
        .iter()
        .map(|(p, pat)| (p.clone(), pat.to_string()))
        .collect();
    let output_for_cmd: Vec<(std::path::PathBuf, String)> = output
        .iter()
        .map(|(p, tmpl)| (p.clone(), tmpl.to_string()))
        .collect();

    let transform_command = crate::commands::transform::Params {
        input: input_for_cmd,
        output: output_for_cmd,
        operation_id: operation_id.to_string(),
    };

    let lock_paths: Vec<&PathBuf> = transformation
        .input_spaces
        .iter()
        .chain(transformation.output_spaces.iter())
        .collect();

    let result = with_lock(lock_manager, &lock_paths, || {
        crate::commands::transform::execute(&transform_command)
    })
    .await;

    match result {
        Ok(()) => {
            if let Some(log_id) = insert_op_log("Transform", token.id) {
                let input_json = serde_json::to_value(
                    transformation
                        .input_spaces
                        .iter()
                        .zip(transformation.patterns.iter())
                        .map(|(p, pat)| {
                            serde_json::json!({"path": p.to_string_lossy(), "pattern": pat})
                        })
                        .collect::<Vec<_>>(),
                )
                .unwrap_or_default();
                let output_json = serde_json::to_value(
                    transformation
                        .output_spaces
                        .iter()
                        .zip(transformation.templates.iter())
                        .map(|(p, tmpl)| {
                            serde_json::json!({"path": p.to_string_lossy(), "template": tmpl})
                        })
                        .collect::<Vec<_>>(),
                )
                .unwrap_or_default();
                let _ = diesel::insert_into(op_log_transform::table)
                    .values(&OpLogTransformInsert {
                        op_log_id: log_id,
                        input_spaces: input_json,
                        output_spaces: output_json,
                        operation_id: Some(operation_id.to_string()),
                    })
                    .execute(&mut establish_connection());
            }

            let bus_tx = bus.0.clone();
            let monitor_path = transformation
                .output_spaces
                .first()
                .cloned()
                .unwrap_or_default();
            tokio::spawn(async move {
                match get_mork_client()
                    .wait_for_available(&monitor_path, MONITOR_TIMEOUT_MS)
                    .await
                {
                    Ok(()) => {
                        let _ = bus_tx.send(SpaceEvent::TransformComplete {
                            path: event_path.clone(),
                        });
                    }
                    Err(_) => {
                        let _ = bus_tx.send(SpaceEvent::TransformError {
                            path: event_path.clone(),
                            message: "Timed out waiting for transform to complete".into(),
                        });
                    }
                }
                let _ = bus_tx.send(SpaceEvent::Unlocked { path: event_path });
            });
            Ok(Json(true))
        }
        Err(e) => {
            let _ = bus.0.send(SpaceEvent::TransformError {
                path: event_path.clone(),
                message: format!("{:?}", e),
            });
            let _ = bus.0.send(SpaceEvent::Unlocked { path: event_path });
            Err(e)
        }
    }
}

// ─── Import ──────────────────────────────────────────────────────────────────

#[post("/spaces", data = "<space>")]
pub async fn import_root(
    token: Token,
    space: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    do_import(&token, &PathBuf::new(), &space, &bus.0, &lock_manager).await
}

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(
    token: Token,
    path: PathBuf,
    space: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

/// Default timeout (5 minutes) for monitoring MORK operations.
const MONITOR_TIMEOUT_MS: u64 = 300_000;

pub async fn do_import(
    token: &Token,
    path: &PathBuf,
    space: &str,
    bus: &broadcast::Sender<SpaceEvent>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let perm = permission_from_token(token);
    perm.require_write().map_err(permission_error_to_status)?;
    perm.check_namespace(path)
        .map_err(permission_error_to_status)?;

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);
    let mut file = File::create(&file_path).map_err(|e| {
        eprintln!("Error creating temp file: {}", e);
        Status::InternalServerError
    })?;
    file.write_all(space.as_bytes()).map_err(|e| {
        eprintln!("Error writing temp file: {}", e);
        Status::InternalServerError
    })?;
    drop(file);

    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();
    let uri = format!("{}/public/{}.metta", origin, file_id);

    let operation_id = Uuid::new_v4();

    let root = PathBuf::from("space");
    let augmented_path = if !path.as_os_str().is_empty() {
        root.join(path.clone())
    } else {
        root.clone()
    };

    let event_path = path_to_event_path(path);
    let _ = bus.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });

    let import_command = crate::commands::import::Params {
        target_path: augmented_path.clone(),
        uri: uri.clone(),
        operation_id: operation_id.to_string(),
    };

    let cmd_result = with_lock(lock_manager, &[path], || {
        crate::commands::import::execute(&import_command)
    })
    .await;

    match cmd_result {
        Ok(()) => {
            if let Some(log_id) = insert_op_log("Import", token.id) {
                let _ = diesel::insert_into(op_log_import::table)
                    .values(&OpLogImportInsert {
                        op_log_id: log_id,
                        path: path.to_string_lossy().into_owned(),
                        uri: uri.clone(),
                        operation_id: Some(operation_id.to_string()),
                    })
                    .execute(&mut establish_connection());
            }

            // Spawn background monitor: wait for MORK to finish, then emit events
            let bus_clone = bus.clone();
            let monitor_path = augmented_path.clone();
            tokio::spawn(async move {
                match get_mork_client()
                    .wait_for_available(&monitor_path, MONITOR_TIMEOUT_MS)
                    .await
                {
                    Ok(()) => {
                        let _ = bus_clone.send(SpaceEvent::ImportComplete {
                            path: event_path.clone(),
                        });
                    }
                    Err(_) => {
                        let _ = bus_clone.send(SpaceEvent::ImportError {
                            path: event_path.clone(),
                            message: "Timed out waiting for import to complete".into(),
                        });
                    }
                }
                let _ = bus_clone.send(SpaceEvent::Unlocked { path: event_path });
                // Clean up temp file
                let _ = std::fs::remove_file(&file_path);
            });
            Ok(Json(operation_id.to_string()))
        }
        Err(status) => {
            let _ = bus.send(SpaceEvent::ImportError {
                path: event_path.clone(),
                message: "Import failed".into(),
            });
            let _ = bus.send(SpaceEvent::Unlocked { path: event_path });
            Err(status)
        }
    }
}

// ─── Clear ───────────────────────────────────────────────────────────────────

#[rocket::delete("/spaces?<pattern>")]
pub async fn clear_root(
    token: Token,
    pattern: Option<String>,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    clear_inner(token, PathBuf::new(), pattern, bus, lock_manager).await
}

#[rocket::delete("/spaces/<path..>?<pattern>")]
pub async fn clear(
    token: Token,
    path: PathBuf,
    pattern: Option<String>,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    clear_inner(token, path, pattern, bus, lock_manager).await
}

async fn clear_inner(
    token: Token,
    path: PathBuf,
    pattern: Option<String>,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    let pattern = pattern.unwrap_or_else(|| "$".to_string());
    let perm = permission_from_token(&token);
    perm.require_write().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    let event_path = path_to_event_path(&path);
    let _ = bus.0.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });
    let root = PathBuf::from("space");
    let augmented_path = if !path.as_os_str().is_empty() {
        root.join(path.clone())
    } else {
        root.clone()
    };

    let operation_id = Uuid::new_v4();

    let clear_command = crate::commands::clear::Params {
        target_path: augmented_path.clone(),
        operation_id: operation_id.to_string(),
        pattern: pattern.clone(),
    };

    let cmd_result = with_lock(&lock_manager, &[&path], || {
        crate::commands::clear::execute(&clear_command)
    })
    .await;

    match cmd_result {
        Ok(()) => {
            if let Some(log_id) = insert_op_log("Clear", token.id) {
                let _ = diesel::insert_into(op_log_clear::table)
                    .values(&OpLogClearInsert {
                        op_log_id: log_id,
                        path: if path.as_os_str().is_empty() {
                            String::new()
                        } else {
                            format!("{}/", path.to_string_lossy())
                        },
                        operation_id: Some(operation_id.to_string()),
                        pattern,
                    })
                    .execute(&mut establish_connection());
            }

            let bus_tx = bus.0.clone();
            let monitor_path = augmented_path.clone();
            tokio::spawn(async move {
                match get_mork_client()
                    .wait_for_available(&monitor_path, MONITOR_TIMEOUT_MS)
                    .await
                {
                    Ok(()) => {
                        let _ = bus_tx.send(SpaceEvent::ClearComplete {
                            path: event_path.clone(),
                        });
                    }
                    Err(_) => {
                        let _ = bus_tx.send(SpaceEvent::ClearError {
                            path: event_path.clone(),
                            message: "Timed out waiting for clear to complete".into(),
                        });
                    }
                }
                let _ = bus_tx.send(SpaceEvent::Unlocked { path: event_path });
            });
            Ok(Json(true))
        }
        Err(status) => {
            let _ = bus.0.send(SpaceEvent::ClearError {
                path: event_path.clone(),
                message: "Clear failed".into(),
            });
            let _ = bus.0.send(SpaceEvent::Unlocked { path: event_path });
            Err(status)
        }
    }
}
// ─── Explore ─────────────────────────────────────────────────────────────────

#[get("/explore?<focus_token>")]
pub async fn explore_root(
    token: Token,
    focus_token: String,
) -> Result<Json<ExploreResult>, Status> {
    explore(token, PathBuf::new(), focus_token).await
}

#[rocket::get("/explore/<path..>?<focus_token>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    focus_token: String,
) -> Result<Json<ExploreResult>, Status> {
    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    with_retry(&path, LOCK_WAIT_MS, LOCK_MAX_RETRIES, || {
        let path = path.clone();
        let root = PathBuf::from("space");

        let augmented_path = if !path.as_os_str().is_empty() {
            root.join(path.clone())
        } else {
            root.clone()
        };

        let focus_token = focus_token.clone();
        async move {
            get_mork_client()
                .explore(&augmented_path, &root, &focus_token)
                .await
                .map(Json)
        }
    })
    .await
}

#[rocket::get("/namespaces/<path..>")]
pub async fn explore_namespaces(
    token: Token,
    path: PathBuf,
) -> Result<Json<NamespaceInfo>, Status> {
    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    with_retry(&path, LOCK_WAIT_MS, LOCK_MAX_RETRIES, || {
        let root = PathBuf::from("space");

        let augmented_path = if !path.as_os_str().is_empty() {
            root.join(path.clone())
        } else {
            root.clone()
        };

        async move {
            get_mork_client()
                .explore_namespaces(&augmented_path, &root)
                .await
                .map(Json)
        }
    })
    .await
}

// ─── Count ───────────────────────────────────────────────────────────────────

#[get("/count")]
pub async fn count_root(token: Token) -> Result<Json<usize>, Status> {
    count(token, PathBuf::new()).await
}

#[get("/count/<path..>")]
pub async fn count(token: Token, path: PathBuf) -> Result<Json<usize>, Status> {
    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    with_retry(&path, LOCK_WAIT_MS, LOCK_MAX_RETRIES, || {
        let path = path.clone();

        let root = PathBuf::from("space");
        let augmented_path = if !path.as_os_str().is_empty() {
            root.join(path.clone())
        } else {
            root.clone()
        };

        async move { get_mork_client().count(&augmented_path).await.map(Json) }
    })
    .await
}

// ─── Status ──────────────────────────────────────────────────────────────────

#[get("/status")]
pub async fn status_root(token: Token) -> Result<Json<serde_json::Value>, Status> {
    status(token, PathBuf::new()).await
}

#[get("/status/<path..>")]
pub async fn status(token: Token, path: PathBuf) -> Result<Json<serde_json::Value>, Status> {
    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    let root = PathBuf::from("space");
    let augmented_path = if !path.as_os_str().is_empty() {
        root.join(path.clone())
    } else {
        root.clone()
    };

    get_mork_client()
        .status(&augmented_path)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Subtract ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct SubtractRequest {
    pub input_spaces: Vec<PathBuf>,
    pub output_spaces: Vec<PathBuf>,
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[post("/subtract", data = "<req>")]
pub async fn subtract(
    token: Token,
    req: Json<SubtractRequest>,
    _bus: &State<EventBus>,
    _lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    if req.input_spaces.len() != req.patterns.len()
        || req.output_spaces.len() != req.templates.len()
    {
        return Err(Status::BadRequest);
    }

    let all_balanced = req
        .patterns
        .iter()
        .chain(req.templates.iter())
        .all(|s| mork_client::is_balanced(s));
    if !all_balanced {
        return Err(Status::UnprocessableEntity);
    }

    let perm = permission_from_token(&token);
    perm.require_read().map_err(permission_error_to_status)?;
    perm.require_write().map_err(permission_error_to_status)?;
    for path in req.input_spaces.iter().chain(req.output_spaces.iter()) {
        perm.check_namespace(path).map_err(permission_error_to_status)?;
    }

    let root = PathBuf::from("space");

    let input: Vec<(PathBuf, &str)> = req
        .input_spaces
        .iter()
        .zip(req.patterns.iter())
        .map(|(p, pat)| (root.join(p), pat.as_str()))
        .collect();

    let output: Vec<(PathBuf, &str)> = req
        .output_spaces
        .iter()
        .zip(req.templates.iter())
        .map(|(p, tmpl)| (root.join(p), tmpl.as_str()))
        .collect();

    let last_output = output.last().map(|(p, _)| p.clone());

    get_mork_client()
        .subtract(&input, &output)
        .await
        .map_err(mork_error_to_status)?;

    if let Some(monitor_path) = last_output {
        get_mork_client()
            .wait_for_available(&monitor_path, 5_000)
            .await
            .map_err(mork_error_to_status)?;
    }

    Ok(Json(true))
}

// ─── Import from uploaded files ───────────────────────────────────────────────

#[post("/spaces/import/csv/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_csv(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::CSVParserParameters,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let space = crate::routes::translations::create_from_csv(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[post("/spaces/import/nt/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_nt(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::NTParserParameters,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let space = crate::routes::translations::create_from_nt(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[post("/spaces/import/jsonld/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_jsonld(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::JSONLDParserParameters,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let space = crate::routes::translations::create_from_jsonld(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[post("/spaces/import/n3/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_n3(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::N3ParserParameters,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let space = crate::routes::translations::create_from_n3(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

// ─── Import from URL ─────────────────────────────────────────────────────────

async fn fetch_url_bytes(url: &str) -> Result<Vec<u8>, Status> {
    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| {
        eprintln!("Error fetching URL '{}': {}", url, e);
        Status::BadRequest
    })?;
    if !resp.status().is_success() {
        eprintln!("URL fetch returned error status: {}", resp.status());
        return Err(Status::BadRequest);
    }
    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| {
        eprintln!("Error reading URL response bytes: {}", e);
        Status::InternalServerError
    })
}

#[get("/spaces/import/url/metta/<path..>?<url>")]
pub async fn import_url_metta(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<bool>, Status> {
    let perm = permission_from_token(&token);
    perm.require_write().map_err(permission_error_to_status)?;
    perm.check_namespace(&path)
        .map_err(permission_error_to_status)?;
    let event_path = path_to_event_path(&path);
    let _ = bus.0.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });

    let result = get_mork_client().import(&path, "$", "$", &url).await;

    match result {
        Ok(_) => {
            let bus_tx = bus.0.clone();
            let monitor_path = path.clone();
            tokio::spawn(async move {
                match get_mork_client()
                    .wait_for_available(&monitor_path, MONITOR_TIMEOUT_MS)
                    .await
                {
                    Ok(()) => {
                        let _ = bus_tx.send(SpaceEvent::ImportComplete {
                            path: event_path.clone(),
                        });
                    }
                    Err(_) => {
                        let _ = bus_tx.send(SpaceEvent::ImportError {
                            path: event_path.clone(),
                            message: "Timed out waiting for import to complete".into(),
                        });
                    }
                }
                let _ = bus_tx.send(SpaceEvent::Unlocked { path: event_path });
            });
            Ok(Json(true))
        }
        Err(e) => {
            let _ = bus.0.send(SpaceEvent::ImportError {
                path: event_path.clone(),
                message: format!("{:?}", e),
            });
            let _ = bus.0.send(SpaceEvent::Unlocked { path: event_path });
            Err(mork_error_to_status(e))
        }
    }
}

#[get("/spaces/import/url/csv/<path..>?<url>&<parse_parameters..>")]
pub async fn import_url_csv(
    token: Token,
    path: PathBuf,
    url: String,
    parse_parameters: crate::routes::translations::CSVParserParameters,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "csv",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: Some(parse_parameters),
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[get("/spaces/import/url/nt/<path..>?<url>")]
pub async fn import_url_nt(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "nt",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: Some(crate::routes::translations::NTParserParameters {
                dummy: String::new(),
            }),
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[get("/spaces/import/url/jsonld/<path..>?<url>")]
pub async fn import_url_jsonld(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "jsonld",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: Some(crate::routes::translations::JSONLDParserParameters {
                dummy: String::new(),
            }),
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}

#[get("/spaces/import/url/n3/<path..>?<url>")]
pub async fn import_url_n3(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
    lock_manager: &State<LockManager>,
) -> Result<Json<String>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "n3",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: Some(crate::routes::translations::N3ParserParameters {
                dummy: String::new(),
            }),
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0, &lock_manager).await
}
