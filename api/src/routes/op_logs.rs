use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;

use chrono::Utc;
use diesel::{ExpressionMethods, PgConnection, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::serde::json::{serde_json, Json};
use rocket::{get, post};
use tracing::{debug, error, info, warn};

use rocket::State;

use tokio::sync::broadcast;

use crate::db::{self, DbPool};
use crate::error::ApiError;
use crate::{
    events::{EventBus, SpaceEvent},
    lock::LockManager,
    model::{
        OpLog, OpLogClear, OpLogCopy, OpLogEdit, OpLogEntry, OpLogImport, OpLogTransform, Token,
    },
    schema::{op_log, op_log_clear, op_log_copy, op_log_edit, op_log_import, op_log_transform},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn augmented_path(raw: &str) -> PathBuf {
    let stripped = raw.trim_end_matches('/');
    let p = PathBuf::from(stripped);
    let root = PathBuf::from("space");
    if !p.as_os_str().is_empty() {
        root.join(p)
    } else {
        root
    }
}

pub fn fetch_details_pub(conn: &mut PgConnection, log: OpLog) -> OpLogEntry {
    fetch_details(conn, log)
}

fn fetch_details(conn: &mut PgConnection, log: OpLog) -> OpLogEntry {
    let import = if log.op_type == "Import" {
        op_log_import::table
            .select(OpLogImport::as_select())
            .filter(op_log_import::op_log_id.eq(log.id))
            .first(conn)
            .ok()
    } else {
        None
    };

    let clear = if log.op_type == "Clear" {
        op_log_clear::table
            .select(OpLogClear::as_select())
            .filter(op_log_clear::op_log_id.eq(log.id))
            .first(conn)
            .ok()
    } else {
        None
    };

    let copy = if log.op_type == "Copy" {
        op_log_copy::table
            .select(OpLogCopy::as_select())
            .filter(op_log_copy::op_log_id.eq(log.id))
            .first(conn)
            .ok()
    } else {
        None
    };

    let transform = if log.op_type == "Transform" {
        op_log_transform::table
            .select(OpLogTransform::as_select())
            .filter(op_log_transform::op_log_id.eq(log.id))
            .first(conn)
            .ok()
    } else {
        None
    };

    let edit = if log.op_type == "Edit" {
        op_log_edit::table
            .select(OpLogEdit::as_select())
            .filter(op_log_edit::op_log_id.eq(log.id))
            .first(conn)
            .ok()
    } else {
        None
    };

    OpLogEntry {
        id: log.id,
        op_type: log.op_type,
        created_at: log.created_at,
        rolled_back_at: log.rolled_back_at,
        token_id: log.token_id,
        sealed_at: log.sealed_at,
        import,
        clear,
        copy,
        transform,
        edit,
    }
}

// ─── Undo / redo (delegate to commands module) ───────────────────────────────

async fn undo_operation(_conn: &mut PgConnection, entry: &OpLogEntry) -> Result<(), ApiError> {
    match entry.op_type.as_str() {
        "Import" => {
            if let Some(imp) = &entry.import {
                if let Some(op_id) = &imp.operation_id {
                    return crate::commands::import::undo(&crate::commands::import::Params {
                        target_path: augmented_path(&imp.path),
                        uri: imp.uri.clone(),
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Clear" => {
            if let Some(clr) = &entry.clear {
                if let Some(op_id) = &clr.operation_id {
                    return crate::commands::clear::undo(&crate::commands::clear::Params {
                        target_path: augmented_path(&clr.path),
                        operation_id: op_id.clone(),
                        pattern: clr.pattern.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Copy" => {
            if let Some(cpy) = &entry.copy {
                if let Some(op_id) = &cpy.operation_id {
                    return crate::commands::copy::undo(&crate::commands::copy::Params {
                        src_path: augmented_path(&cpy.src),
                        dst_path: augmented_path(&cpy.dst),
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Transform" => {
            if let Some(tr) = &entry.transform {
                if let Some(op_id) = &tr.operation_id {
                    let (input, output) = parse_transform_spaces(tr)?;
                    return crate::commands::transform::undo(&crate::commands::transform::Params {
                        input,
                        output,
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Edit" => {
            if let Some(edit) = &entry.edit {
                let added: Vec<String> =
                    serde_json::from_value(edit.added.clone()).unwrap_or_default();
                let removed: Vec<String> =
                    serde_json::from_value(edit.removed.clone()).unwrap_or_default();
                return crate::commands::edit::undo(&crate::commands::edit::Params {
                    target_path: augmented_path(&edit.path),
                    added,
                    removed,
                    operation_id: String::new(),
                })
                .await;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

async fn redo_operation(_conn: &mut PgConnection, entry: &OpLogEntry) -> Result<(), ApiError> {
    match entry.op_type.as_str() {
        "Import" => {
            if let Some(imp) = &entry.import {
                if let Some(op_id) = &imp.operation_id {
                    return crate::commands::import::redo(&crate::commands::import::Params {
                        target_path: augmented_path(&imp.path),
                        uri: imp.uri.clone(),
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Clear" => {
            if let Some(clr) = &entry.clear {
                if let Some(op_id) = &clr.operation_id {
                    return crate::commands::clear::redo(&crate::commands::clear::Params {
                        target_path: augmented_path(&clr.path),
                        operation_id: op_id.clone(),
                        pattern: clr.pattern.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Copy" => {
            if let Some(cpy) = &entry.copy {
                if let Some(op_id) = &cpy.operation_id {
                    return crate::commands::copy::redo(&crate::commands::copy::Params {
                        src_path: augmented_path(&cpy.src),
                        dst_path: augmented_path(&cpy.dst),
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Transform" => {
            if let Some(tr) = &entry.transform {
                if let Some(op_id) = &tr.operation_id {
                    let (input, output) = parse_transform_spaces(tr)?;
                    return crate::commands::transform::redo(&crate::commands::transform::Params {
                        input,
                        output,
                        operation_id: op_id.clone(),
                    })
                    .await;
                }
            }
            Ok(())
        }
        "Edit" => {
            if let Some(edit) = &entry.edit {
                let added: Vec<String> =
                    serde_json::from_value(edit.added.clone()).unwrap_or_default();
                let removed: Vec<String> =
                    serde_json::from_value(edit.removed.clone()).unwrap_or_default();
                return crate::commands::edit::redo(&crate::commands::edit::Params {
                    target_path: augmented_path(&edit.path),
                    added,
                    removed,
                    operation_id: String::new(),
                })
                .await;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn parse_transform_spaces(
    tr: &crate::model::OpLogTransform,
) -> Result<(Vec<(PathBuf, String)>, Vec<(PathBuf, String)>), ApiError> {
    let prefix = PathBuf::from("space");

    let input: Vec<(PathBuf, String)> =
        serde_json::from_value::<Vec<serde_json::Value>>(tr.input_spaces.clone())
            .map_err(|e| ApiError::Internal(format!("invalid transform input_spaces: {}", e)))?
            .into_iter()
            .map(|s| {
                let p = PathBuf::from(s["path"].as_str().unwrap_or(""));
                let pat = s["pattern"].as_str().unwrap_or("$").to_string();
                (prefix.join(p), pat)
            })
            .collect();

    let output: Vec<(PathBuf, String)> =
        serde_json::from_value::<Vec<serde_json::Value>>(tr.output_spaces.clone())
            .map_err(|e| ApiError::Internal(format!("invalid transform output_spaces: {}", e)))?
            .into_iter()
            .map(|s| {
                let p = PathBuf::from(s["path"].as_str().unwrap_or(""));
                let tmpl = s["template"].as_str().unwrap_or("$").to_string();
                (prefix.join(p), tmpl)
            })
            .collect();

    Ok((input, output))
}

fn collect_lock_paths(entries: &[OpLogEntry]) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut paths = Vec::new();

    for entry in entries {
        let raw: Vec<String> = if let Some(imp) = &entry.import {
            vec![imp.path.clone()]
        } else if let Some(clr) = &entry.clear {
            vec![clr.path.clone()]
        } else if let Some(cpy) = &entry.copy {
            vec![cpy.src.clone(), cpy.dst.clone()]
        } else if let Some(ed) = &entry.edit {
            vec![ed.path.clone()]
        } else if let Some(tr) = &entry.transform {
            let mut tp = Vec::new();
            if let Ok(ins) =
                serde_json::from_value::<Vec<serde_json::Value>>(tr.input_spaces.clone())
            {
                tp.extend(
                    ins.iter()
                        .filter_map(|s| s["path"].as_str().map(str::to_string)),
                );
            }
            if let Ok(outs) =
                serde_json::from_value::<Vec<serde_json::Value>>(tr.output_spaces.clone())
            {
                tp.extend(
                    outs.iter()
                        .filter_map(|s| s["path"].as_str().map(str::to_string)),
                );
            }
            tp
        } else {
            vec![]
        };

        for p in raw {
            let key = p.trim_end_matches('/').to_string();
            if seen.insert(key.clone()) {
                paths.push(PathBuf::from(key));
            }
        }
    }

    paths
}

// ─── Direct-edge graph ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GraphEdge {
    pub source: i32,
    pub target: i32,
}

#[derive(serde::Serialize)]
pub struct GraphResponse {
    pub entries: Vec<OpLogEntry>,
    pub edges: Vec<GraphEdge>,
}

fn build_direct_edges(entries: &[OpLogEntry]) -> Vec<GraphEdge> {
    let adj = build_adj(entries);

    let mut edges = Vec::new();
    let mut sorted_ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    sorted_ids.sort();

    for &u in &sorted_ids {
        let neighbors = match adj.get(&u) {
            Some(n) if !n.is_empty() => n.clone(),
            _ => continue,
        };

        for &v in &neighbors {
            let mut visited = HashSet::new();
            let mut queue = VecDeque::new();
            for &other in &neighbors {
                if other != v && visited.insert(other) {
                    queue.push_back(other);
                }
            }
            while let Some(node) = queue.pop_front() {
                if let Some(next) = adj.get(&node) {
                    for &nbr in next {
                        if visited.insert(nbr) {
                            queue.push_back(nbr);
                        }
                    }
                }
            }

            if !visited.contains(&v) {
                edges.push(GraphEdge {
                    source: u,
                    target: v,
                });
            }
        }
    }

    edges
}

#[get("/logs/graph")]
pub fn get_logs_graph(
    _token: Token,
    pool: &State<DbPool>,
) -> Result<Json<GraphResponse>, ApiError> {
    debug!("Building op log dependency graph");
    let mut conn = db::get_conn(pool.inner())?;

    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(&mut conn)?;

    let entry_count = logs.len();
    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(&mut conn, log))
        .collect();

    let edges = build_direct_edges(&entries);
    debug!(
        entries = entry_count,
        edges = edges.len(),
        "Op log graph built"
    );

    Ok(Json(GraphResponse { entries, edges }))
}

// ─── Routes ──────────────────────────────────────────────────────────────────

#[get("/logs/<id>")]
pub fn get_log(_token: Token, id: i32, pool: &State<DbPool>) -> Result<Json<OpLogEntry>, ApiError> {
    debug!(id, "Fetching op log entry");
    let mut conn = db::get_conn(pool.inner())?;

    let log = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(&mut conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => ApiError::NotFound,
            e => ApiError::Db(e),
        })?;

    Ok(Json(fetch_details(&mut conn, log)))
}

#[get("/logs?<op_type>&<page>&<page_size>")]
pub fn get_logs(
    _token: Token,
    op_type: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    pool: &State<DbPool>,
) -> Result<Json<Vec<OpLogEntry>>, ApiError> {
    let mut conn = db::get_conn(pool.inner())?;

    let page = page.unwrap_or(0).max(0);
    let page_size = page_size.unwrap_or(20).clamp(1, 100);
    debug!(op_type = ?op_type, page, page_size, "Listing op logs");

    let mut query = op_log::table
        .select(OpLog::as_select())
        .order(op_log::id.desc())
        .into_boxed();

    if let Some(ref op) = op_type {
        query = query.filter(op_log::op_type.eq(op));
    }

    let logs: Vec<OpLog> = query
        .limit(page_size)
        .offset(page * page_size)
        .load(&mut conn)?;

    debug!(count = logs.len(), "Op logs fetched");
    let entries = logs
        .into_iter()
        .map(|log| fetch_details(&mut conn, log))
        .collect();

    Ok(Json(entries))
}

/// Space paths that `entry` writes to.
fn get_write_spaces(entry: &OpLogEntry) -> Vec<String> {
    if let Some(imp) = &entry.import {
        return vec![imp.path.clone()];
    }
    if let Some(clr) = &entry.clear {
        return vec![clr.path.clone()];
    }
    if let Some(cpy) = &entry.copy {
        return vec![cpy.dst.clone()];
    }
    if let Some(ed) = &entry.edit {
        return vec![ed.path.clone()];
    }
    if let Some(tr) = &entry.transform {
        if let Ok(outs) = serde_json::from_value::<Vec<serde_json::Value>>(tr.output_spaces.clone())
        {
            return outs
                .iter()
                .filter_map(|s| s["path"].as_str().map(str::to_string))
                .collect();
        }
    }
    vec![]
}

fn get_input_spaces(entry: &OpLogEntry) -> Vec<String> {
    if let Some(tr) = &entry.transform {
        if let Ok(ins) = serde_json::from_value::<Vec<serde_json::Value>>(tr.input_spaces.clone()) {
            return ins
                .iter()
                .filter_map(|s| s["path"].as_str().map(str::to_string))
                .collect();
        }
    }
    vec![]
}

fn is_subspace(child: &str, parent: &str) -> bool {
    let c = child.trim_end_matches('/');
    let p = parent.trim_end_matches('/');
    if p.is_empty() {
        return true;
    }
    c == p || c.starts_with(&format!("{}/", p))
}

fn build_adj(entries: &[OpLogEntry]) -> HashMap<i32, Vec<i32>> {
    let mut adj: HashMap<i32, Vec<i32>> = entries.iter().map(|e| (e.id, vec![])).collect();

    let mut sorted: Vec<&OpLogEntry> = entries.iter().collect();
    sorted.sort_by_key(|e| e.id);

    for j in 0..sorted.len() {
        let v = sorted[j];
        let v_writes = get_write_spaces(v);
        let v_inputs = get_input_spaces(v);
        if v_writes.is_empty() && v_inputs.is_empty() {
            continue;
        }
        for i in 0..j {
            let u = sorted[i];
            let u_writes = get_write_spaces(u);
            if u_writes.is_empty() {
                continue;
            }

            let rule1 = u_writes
                .iter()
                .any(|us| v_writes.iter().any(|vs| is_subspace(vs, us)));
            let rule2 = v.transform.is_some()
                && u_writes
                    .iter()
                    .any(|us| v_inputs.iter().any(|vi| is_subspace(us, vi)));
            let rule3 = v.transform.is_some()
                && u_writes
                    .iter()
                    .any(|us| v_inputs.iter().any(|vi| is_subspace(vi, us)));
            let rule4 = v.clear.is_some()
                && u_writes
                    .iter()
                    .any(|us| v_writes.iter().any(|vs| is_subspace(us, vs)));
            if rule1 || rule2 || rule3 || rule4 {
                adj.entry(u.id).or_default().push(v.id);
            }
        }
    }
    adj
}

fn reachable_from(adj: &HashMap<i32, Vec<i32>>, root: i32) -> HashSet<i32> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    if adj.contains_key(&root) {
        visited.insert(root);
        queue.push_back(root);
    }
    while let Some(node) = queue.pop_front() {
        if let Some(neighbors) = adj.get(&node) {
            for &nbr in neighbors {
                if visited.insert(nbr) {
                    queue.push_back(nbr);
                }
            }
        }
    }
    visited
}

fn topo_sort(adj: &HashMap<i32, Vec<i32>>, nodes: &HashSet<i32>) -> Vec<i32> {
    let mut in_degree: HashMap<i32, usize> = nodes.iter().map(|&id| (id, 0)).collect();
    for (&u, neighbors) in adj {
        if !nodes.contains(&u) {
            continue;
        }
        for &v in neighbors {
            if nodes.contains(&v) {
                *in_degree.get_mut(&v).unwrap() += 1;
            }
        }
    }
    let mut zero: Vec<i32> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&id, _)| id)
        .collect();
    zero.sort();
    let mut queue: VecDeque<i32> = zero.into_iter().collect();

    let mut order = Vec::with_capacity(nodes.len());
    while let Some(u) = queue.pop_front() {
        order.push(u);
        if let Some(neighbors) = adj.get(&u) {
            let mut next: Vec<i32> = Vec::new();
            for &v in neighbors {
                if !nodes.contains(&v) {
                    continue;
                }
                let d = in_degree.get_mut(&v).unwrap();
                *d -= 1;
                if *d == 0 {
                    next.push(v);
                }
            }
            next.sort();
            queue.extend(next);
        }
    }
    order
}

// ─── Undo / redo ordering ────────────────────────────────────────────────────

fn compute_undo_order(
    conn: &mut PgConnection,
    target_id: i32,
) -> Result<Vec<OpLogEntry>, ApiError> {
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.ge(target_id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(conn)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let adj = build_adj(&entries);
    let subgraph = reachable_from(&adj, target_id);
    let order = topo_sort(&adj, &subgraph);

    let mut by_id: HashMap<i32, OpLogEntry> = entries.into_iter().map(|e| (e.id, e)).collect();

    Ok(order
        .into_iter()
        .rev()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}

fn compute_redo_order(
    conn: &mut PgConnection,
    target_id: i32,
) -> Result<Vec<OpLogEntry>, ApiError> {
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::rolled_back_at.is_not_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(conn)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let adj = build_adj(&entries);

    let mut rev_adj: HashMap<i32, Vec<i32>> = entries.iter().map(|e| (e.id, vec![])).collect();
    for (&u, vs) in &adj {
        for &v in vs {
            rev_adj.entry(v).or_default().push(u);
        }
    }

    let subgraph = reachable_from(&rev_adj, target_id);
    let order = topo_sort(&adj, &subgraph);

    let mut by_id: HashMap<i32, OpLogEntry> = entries.into_iter().map(|e| (e.id, e)).collect();

    Ok(order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}

// ─── Event emission ──────────────────────────────────────────────────────────

fn emit_op_log_changed(bus: &broadcast::Sender<SpaceEvent>, entries: &[OpLogEntry]) {
    let mut by_token: HashMap<i32, Vec<OpLogEntry>> = HashMap::new();
    for e in entries {
        if let Some(tid) = e.token_id {
            by_token.entry(tid).or_default().push(e.clone());
        }
    }
    for (token_id, token_entries) in by_token {
        let _ = bus.send(SpaceEvent::OpLogChanged {
            token_id,
            entries: token_entries,
        });
    }
}

#[post("/logs/<id>/rollback")]
pub async fn rollback_log(
    _token: Token,
    id: i32,
    lock_manager: &State<LockManager>,
    bus: &State<EventBus>,
    pool: &State<DbPool>,
) -> Result<Json<Vec<OpLogEntry>>, ApiError> {
    if !_token.permission_write {
        warn!(
            id,
            token_id = _token.id,
            "Rollback denied: token lacks write permission"
        );
        return Err(ApiError::Forbidden);
    }
    info!(id, "Starting rollback");
    let mut conn = db::get_conn(pool.inner())?;

    // Verify the target entry exists.
    op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(&mut conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                warn!(id, "Rollback target not found");
                ApiError::NotFound
            }
            e => ApiError::Db(e),
        })?;

    let entries = compute_undo_order(&mut conn, id)?;

    info!(
        id,
        affected = entries.len(),
        "Executing rollback for entries"
    );

    let lock_paths = collect_lock_paths(&entries);
    let path_refs: Vec<&PathBuf> = lock_paths.iter().collect();

    let pool_ref = pool.inner();
    crate::routes::spaces::with_lock(lock_manager, &path_refs, || {
        let entries = &entries;
        let pool_ref = pool_ref;
        async move {
            let mut c = db::get_conn(pool_ref)?;
            for entry in entries {
                undo_operation(&mut c, entry).await?;
            }
            Ok::<(), ApiError>(())
        }
    })
    .await
    .map_err(|e| {
        error!(id, error = %e, "Rollback execution failed");
        e
    })?;

    // Re-acquire connection after the lock block (previous one was consumed)
    let mut conn = db::get_conn(pool.inner())?;

    // Stamp rolled_back_at
    let now = Utc::now().naive_utc();
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(Some(now)))
        .execute(&mut conn)?;

    // Re-fetch to return the updated entries
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(&mut conn)?;

    let updated_entries: Vec<OpLogEntry> = updated_logs
        .into_iter()
        .map(|log| fetch_details(&mut conn, log))
        .collect();

    info!(id, rolled_back = updated_entries.len(), "Rollback complete");
    emit_op_log_changed(&bus.inner().0, &updated_entries);

    Ok(Json(updated_entries))
}

// ─── Redo ────────────────────────────────────────────────────────────────────

#[post("/logs/<id>/redo?<force>")]
pub async fn redo_log(
    _token: Token,
    id: i32,
    force: Option<bool>,
    lock_manager: &State<LockManager>,
    bus: &State<EventBus>,
    pool: &State<DbPool>,
) -> Result<Json<Vec<OpLogEntry>>, ApiError> {
    if !_token.permission_write {
        warn!(
            id,
            token_id = _token.id,
            "Redo denied: token lacks write permission"
        );
        return Err(ApiError::Forbidden);
    }
    info!(id, force = ?force, "Starting redo");
    let mut conn = db::get_conn(pool.inner())?;

    // Verify the anchor entry exists.
    let anchor: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(&mut conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                warn!(id, "Redo target not found");
                ApiError::NotFound
            }
            e => ApiError::Db(e),
        })?;

    // Check if sealed
    if anchor.sealed_at.is_some() {
        warn!(id, "Redo attempted on sealed entry");
        return Err(ApiError::Unprocessable(
            "operation is sealed and cannot be redone".into(),
        ));
    }

    let anchor_entry = fetch_details(&mut conn, anchor);

    // Conflict guard
    if !force.unwrap_or(false) {
        let conflicts = check_redo_conflicts(&mut conn, &anchor_entry)?;
        if !conflicts.is_empty() {
            warn!(id, conflicting_ops = ?conflicts, "Redo blocked by conflicting operations");
            return Err(ApiError::RedoConflict {
                conflicting_ops: conflicts,
                message: "Redo conflicts with newer operations on the same space(s)".into(),
            });
        }
    } else if force.unwrap_or(false) {
        debug!(id, "Redo forced, skipping conflict check");
    }

    let entries = compute_redo_order(&mut conn, id)?;

    let lock_paths = collect_lock_paths(&entries);
    let path_refs: Vec<&PathBuf> = lock_paths.iter().collect();

    info!(id, count = entries.len(), "Executing redo for entries");

    let pool_ref = pool.inner();
    crate::routes::spaces::with_lock(lock_manager, &path_refs, || {
        let entries = &entries;
        let pool_ref = pool_ref;
        async move {
            let mut c = db::get_conn(pool_ref)?;
            for entry in entries {
                redo_operation(&mut c, entry).await?;
            }
            Ok::<(), ApiError>(())
        }
    })
    .await
    .map_err(|e| {
        error!(id, error = %e, "Redo execution failed");
        e
    })?;

    // Re-acquire connection
    let mut conn = db::get_conn(pool.inner())?;

    // Clear rolled_back_at
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(None::<chrono::NaiveDateTime>))
        .execute(&mut conn)?;

    // Re-fetch
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(&mut conn)?;

    let updated_entries: Vec<OpLogEntry> = updated_logs
        .into_iter()
        .map(|log| fetch_details(&mut conn, log))
        .collect();

    info!(id, redone = updated_entries.len(), "Redo complete");
    emit_op_log_changed(&bus.inner().0, &updated_entries);

    Ok(Json(updated_entries))
}

// ─── Redo conflict detection ──────────────────────────────────────────────

fn check_redo_conflicts(
    conn: &mut PgConnection,
    target: &OpLogEntry,
) -> Result<Vec<i32>, ApiError> {
    let rolled_back_at = match target.rolled_back_at {
        Some(ts) => ts,
        None => return Ok(vec![]),
    };

    let target_writes = get_write_spaces(target);
    if target_writes.is_empty() {
        return Ok(vec![]);
    }

    let live_ops: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .filter(op_log::created_at.gt(rolled_back_at))
        .order(op_log::id.asc())
        .load(conn)?;

    let live_entries: Vec<OpLogEntry> = live_ops
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let mut conflicts = Vec::new();
    for entry in &live_entries {
        let entry_writes = get_write_spaces(entry);
        let overlaps = target_writes.iter().any(|tw| {
            entry_writes
                .iter()
                .any(|ew| is_subspace(ew, tw) || is_subspace(tw, ew))
        });
        if overlaps {
            conflicts.push(entry.id);
        }
    }

    Ok(conflicts)
}

// ─── Checkpoint (seal old ops) ───────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct CheckpointResponse {
    pub sealed_count: usize,
}

#[post("/logs/checkpoint")]
pub fn create_checkpoint(
    _token: Token,
    pool: &State<DbPool>,
) -> Result<Json<CheckpointResponse>, ApiError> {
    if !_token.permission_write {
        warn!(
            token_id = _token.id,
            "Checkpoint denied: token lacks write permission"
        );
        return Err(ApiError::Forbidden);
    }
    info!("Creating checkpoint");
    let mut conn = db::get_conn(pool.inner())?;

    let max_id: Option<i32> = op_log::table
        .select(diesel::dsl::max(op_log::id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .first(&mut conn)?;

    let max_id = match max_id {
        Some(id) => id,
        None => {
            debug!("No live ops to seal; checkpoint is a no-op");
            return Ok(Json(CheckpointResponse { sealed_count: 0 }));
        }
    };

    let now = Utc::now().naive_utc();
    let sealed_count = diesel::update(
        op_log::table
            .filter(op_log::id.lt(max_id))
            .filter(op_log::sealed_at.is_null()),
    )
    .set(op_log::sealed_at.eq(Some(now)))
    .execute(&mut conn)?;

    info!(sealed = sealed_count, "Checkpoint created");
    Ok(Json(CheckpointResponse { sealed_count }))
}

// ─── Per-user undo/redo targets ──────────────────────────────────────────

#[get("/logs/my-last-undoable")]
pub fn my_last_undoable(token: Token, pool: &State<DbPool>) -> Result<Json<OpLogEntry>, ApiError> {
    debug!(token_id = token.id, "Fetching last undoable op");
    let mut conn = db::get_conn(pool.inner())?;

    let log: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::token_id.eq(token.id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.desc())
        .first(&mut conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => ApiError::NotFound,
            e => ApiError::Db(e),
        })?;

    Ok(Json(fetch_details(&mut conn, log)))
}

#[get("/logs/my-last-redoable")]
pub fn my_last_redoable(token: Token, pool: &State<DbPool>) -> Result<Json<OpLogEntry>, ApiError> {
    debug!(token_id = token.id, "Fetching last redoable op");
    let mut conn = db::get_conn(pool.inner())?;

    let log: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::token_id.eq(token.id))
        .filter(op_log::rolled_back_at.is_not_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.desc())
        .first(&mut conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => ApiError::NotFound,
            e => ApiError::Db(e),
        })?;

    Ok(Json(fetch_details(&mut conn, log)))
}
