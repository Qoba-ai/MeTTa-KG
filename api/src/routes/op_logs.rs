use std::path::PathBuf;

use chrono::Utc;
use diesel::{ExpressionMethods, PgConnection, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::http::Status;
use rocket::serde::json::{serde_json, Json};
use rocket::{get, post};

use crate::{
    db::establish_connection,
    model::{OpLog, OpLogClear, OpLogCopy, OpLogEntry, OpLogImport, OpLogTransform, Token},
    schema::{op_log, op_log_clear, op_log_copy, op_log_import, op_log_transform},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn augmented_path(raw: &str) -> PathBuf {
    let p = PathBuf::from(raw);
    let root = PathBuf::from("space");
    if !p.as_os_str().is_empty() {
        root.join(p)
    } else {
        root
    }
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

    let copy = if log.op_type == "Cpy" {
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

    OpLogEntry {
        id: log.id,
        op_type: log.op_type,
        created_at: log.created_at,
        rolled_back_at: log.rolled_back_at,
        import,
        clear,
        copy,
        transform,
    }
}

// ─── Undo / redo (delegate to commands module) ───────────────────────────────

async fn undo_operation(_conn: &mut PgConnection, entry: &OpLogEntry) -> Result<(), Status> {
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
        _ => Ok(()),
    }
}

async fn redo_operation(_conn: &mut PgConnection, entry: &OpLogEntry) -> Result<(), Status> {
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
        _ => Ok(()),
    }
}

/// Parse `input_spaces` / `output_spaces` JSON back into the Vec<(PathBuf, String)>
/// format expected by `commands::transform::Params`.  Paths are re-prefixed with
/// `space/` to match the augmented form used at execution time.
fn parse_transform_spaces(
    tr: &crate::model::OpLogTransform,
) -> Result<(Vec<(PathBuf, String)>, Vec<(PathBuf, String)>), Status> {
    let prefix = PathBuf::from("space");

    let input: Vec<(PathBuf, String)> =
        serde_json::from_value::<Vec<serde_json::Value>>(tr.input_spaces.clone())
            .map_err(|_| Status::InternalServerError)?
            .into_iter()
            .map(|s| {
                let p = PathBuf::from(s["path"].as_str().unwrap_or(""));
                let pat = s["pattern"].as_str().unwrap_or("$").to_string();
                (prefix.join(p), pat)
            })
            .collect();

    let output: Vec<(PathBuf, String)> =
        serde_json::from_value::<Vec<serde_json::Value>>(tr.output_spaces.clone())
            .map_err(|_| Status::InternalServerError)?
            .into_iter()
            .map(|s| {
                let p = PathBuf::from(s["path"].as_str().unwrap_or(""));
                let tmpl = s["template"].as_str().unwrap_or("$").to_string();
                (prefix.join(p), tmpl)
            })
            .collect();

    Ok((input, output))
}

// ─── Routes ──────────────────────────────────────────────────────────────────

#[get("/logs/<id>")]
pub fn get_log(_token: Token, id: i32) -> Result<Json<OpLogEntry>, Status> {
    let conn = &mut establish_connection();

    let log = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => Status::NotFound,
            _ => Status::InternalServerError,
        })?;

    Ok(Json(fetch_details(conn, log)))
}

#[get("/logs?<op_type>&<page>&<page_size>")]
pub fn get_logs(
    _token: Token,
    op_type: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<Json<Vec<OpLogEntry>>, Status> {
    let conn = &mut establish_connection();

    let page = page.unwrap_or(0).max(0);
    let page_size = page_size.unwrap_or(20).clamp(1, 100);

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
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let entries = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    Ok(Json(entries))
}

// ─── Rollback ordering ───────────────────────────────────────────────────────

/// Returns the space paths that `entry` writes to.
/// These are the paths that can create dependencies on subsequent operations.
fn get_write_spaces(entry: &OpLogEntry) -> Vec<String> {
    if let Some(imp) = &entry.import {
        return vec![imp.path.clone()];
    }
    if let Some(clr) = &entry.clear {
        return vec![clr.path.clone()];
    }
    if let Some(cp) = &entry.copy {
        return vec![cp.dst.clone()];
    }
    if let Some(tr) = &entry.transform {
        if let Ok(outs) =
            serde_json::from_value::<Vec<serde_json::Value>>(tr.output_spaces.clone())
        {
            return outs
                .iter()
                .filter_map(|s| s["path"].as_str().map(str::to_string))
                .collect();
        }
    }
    vec![]
}

/// True when `child` equals `parent` or is a subspace of it
/// (e.g. `"a/b"` is a subspace of `"a"`).
fn is_subspace(child: &str, parent: &str) -> bool {
    if parent.is_empty() {
        return true; // root contains everything
    }
    child == parent || child.starts_with(&format!("{}/", parent))
}

/// Returns the entries to undo when rolling back `target_id`, in the order
/// they should be undone.
///
/// Rule: to roll back operation A that writes to space S, every subsequent
/// write operation on S or any subspace of S must be undone first.
/// Reverse-chronological order is a valid topological sort of this DAG
/// (later ids are always leaves relative to earlier ones).
fn compute_rollback_order(
    conn: &mut PgConnection,
    target_id: i32,
) -> Result<Vec<OpLogEntry>, Status> {
    // Load the target to determine which spaces it writes to.
    let target_log: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(target_id))
        .first(conn)
        .map_err(|_| Status::InternalServerError)?;
    let target_entry = fetch_details(conn, target_log);
    let target_spaces = get_write_spaces(&target_entry);

    // Load all candidates (target + everything after it), newest first.
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.ge(target_id))
        .order(op_log::id.desc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    // Keep the target itself plus any later entry that writes to one of the
    // target's spaces or a subspace of it.
    let to_rollback = entries
        .into_iter()
        .filter(|entry| {
            if entry.id == target_id {
                return true;
            }
            get_write_spaces(entry)
                .iter()
                .any(|ws| target_spaces.iter().any(|ts| is_subspace(ws, ts)))
        })
        .collect();

    Ok(to_rollback)
}

/// Rolls back the operation identified by `id` and every operation that
/// depends on it (its descendants in the dependency DAG), in topological
/// order so that the most-dependent side-effects are undone first.
///
/// Log entries are **not** deleted — `rolled_back_at` is stamped on each one
/// so that a future `/logs/<id>/redo` endpoint can re-apply them.
#[post("/logs/<id>/rollback")]
pub async fn rollback_log(_token: Token, id: i32) -> Result<Json<Vec<OpLogEntry>>, Status> {
    let conn = &mut establish_connection();

    // Verify the target entry exists.
    op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => Status::NotFound,
            _ => Status::InternalServerError,
        })?;

    let entries = compute_rollback_order(conn, id)?;

    // Undo each operation in topological order (leaves first).
    for entry in &entries {
        undo_operation(conn, entry).await?;
    }

    // Stamp rolled_back_at so the client and a future redo endpoint can tell
    // which entries are currently in a rolled-back state.
    let now = Utc::now().naive_utc();
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(Some(now)))
        .execute(conn)
        .map_err(|_| Status::InternalServerError)?;

    // Re-fetch to return the updated entries (with rolled_back_at populated).
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let updated_entries = updated_logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    Ok(Json(updated_entries))
}

/// Re-applies all operations starting from `id` that are currently in a
/// rolled-back state (i.e. `rolled_back_at IS NOT NULL`), in ascending
/// chronological order so that earlier operations are re-applied first.
///
/// Only entries with `id >= given_id` and a non-null `rolled_back_at` are
/// touched; any entry that was never rolled back is left alone.
#[post("/logs/<id>/redo")]
pub async fn redo_log(_token: Token, id: i32) -> Result<Json<Vec<OpLogEntry>>, Status> {
    let conn = &mut establish_connection();

    // Verify the anchor entry exists.
    op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => Status::NotFound,
            _ => Status::InternalServerError,
        })?;

    // Fetch the rolled-back entries from id onwards, oldest first so we
    // re-apply them in the original chronological order.
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.ge(id))
        .filter(op_log::rolled_back_at.is_not_null())
        .order(op_log::id.asc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    // Re-apply each operation (stubs — implementations are per-type above).
    for entry in &entries {
        redo_operation(conn, entry).await?;
    }

    // Clear rolled_back_at to mark these entries as active again.
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(None::<chrono::NaiveDateTime>))
        .execute(conn)
        .map_err(|_| Status::InternalServerError)?;

    // Re-fetch to return the updated entries (with rolled_back_at cleared).
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let updated_entries = updated_logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    Ok(Json(updated_entries))
}
