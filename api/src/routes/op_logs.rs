use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;

use chrono::Utc;
use diesel::{ExpressionMethods, PgConnection, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::http::Status;
use rocket::response::status::Custom;
use rocket::serde::json::{serde_json, Json};
use rocket::{get, post};
use tracing::{debug, error, info, warn};

use rocket::State;

use tokio::sync::broadcast;

use crate::{
    db::establish_connection,
    events::{EventBus, SpaceEvent},
    lock::LockManager,
    model::{OpLog, OpLogClear, OpLogCopy, OpLogEdit, OpLogEntry, OpLogImport, OpLogTransform, Token},
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
                let added: Vec<String> = serde_json::from_value(edit.added.clone()).unwrap_or_default();
                let removed: Vec<String> = serde_json::from_value(edit.removed.clone()).unwrap_or_default();
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
                let added: Vec<String> = serde_json::from_value(edit.added.clone()).unwrap_or_default();
                let removed: Vec<String> = serde_json::from_value(edit.removed.clone()).unwrap_or_default();
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

/// Collect all unique raw space paths (without the `space/` prefix) that an
/// undo or redo operation touches, so they can all be locked at once.
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

/// Compute the transitive reduction of `adj`: for each edge U→V, keep it only
/// if V is not reachable from U via any other neighbour of U.
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
            // BFS from u through all neighbours *except* the direct u→v edge.
            // If v is reached, this edge is transitive and should be suppressed.
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

/// Returns all op log entries and the direct (non-transitive) dependency edges
/// between them.  This is the single source of truth for graph topology;
/// clients should use these edges rather than re-deriving them locally.
///
/// Sealed ops are excluded from the graph (they are read-only history).
#[get("/logs/graph")]
pub fn get_logs_graph(_token: Token) -> Result<Json<GraphResponse>, Status> {
    debug!("Building op log dependency graph");
    let conn = &mut establish_connection();

    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(conn)
        .map_err(|e| {
            error!(error = %e, "Failed to load op logs for graph");
            Status::InternalServerError
        })?;

    let entry_count = logs.len();
    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let edges = build_direct_edges(&entries);
    debug!(entries = entry_count, edges = edges.len(), "Op log graph built");

    Ok(Json(GraphResponse { entries, edges }))
}

// ─── Routes ──────────────────────────────────────────────────────────────────

#[get("/logs/<id>")]
pub fn get_log(_token: Token, id: i32) -> Result<Json<OpLogEntry>, Status> {
    debug!(id, "Fetching op log entry");
    let conn = &mut establish_connection();

    let log = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                debug!(id, "Op log entry not found");
                Status::NotFound
            }
            e => {
                error!(id, error = %e, "Failed to fetch op log entry");
                Status::InternalServerError
            }
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
        .load(conn)
        .map_err(|e| {
            error!(error = %e, "Failed to list op logs");
            Status::InternalServerError
        })?;

    debug!(count = logs.len(), "Op logs fetched");
    let entries = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
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

/// Input space paths of a transform operation (empty for import / clear).
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

/// True when `child` equals `parent` or is a subspace of it.
/// Trailing slashes are stripped before comparison so paths stored with or
/// without a trailing slash compare correctly.
fn is_subspace(child: &str, parent: &str) -> bool {
    let c = child.trim_end_matches('/');
    let p = parent.trim_end_matches('/');
    if p.is_empty() {
        return true;
    }
    c == p || c.starts_with(&format!("{}/", p))
}

/// Build a forward adjacency list (u → dependents) from `entries` using the
/// same rules as the frontend graph.
///
/// RULE1: edge U→V if V came after U and V writes to U's space or a subspace.
/// RULE2: edge U→V if V is a transform, V came after U, and U writes to one
///        of V's input spaces or a subspace thereof.
/// RULE3: edge U→V if V is a transform, V came after U, and an input space of
///        V is a subspace of U's write space (U wrote to a parent space V reads from).
/// RULE4: edge U→V if V is a clear, V came after U, and U writes to V's clear
///        target or any subspace of it (the clear covers U's output path from above).
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
            // RULE4: a clear at path P depends on any earlier write to P or any
            // descendant of P (the clear reaches down into subspaces).
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

/// BFS from `root` through `adj`; returns all reachable ids (including `root`).
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

/// Kahn's topological sort over the subgraph induced by `nodes`.
/// Returns ids in topological order (u before v when there is an edge u→v).
/// Ties are broken by ascending id for determinism.
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

/// Returns the entries to undo for rolling back `target_id`, in order:
/// leaves first (reverse topological), target last.
fn compute_undo_order(conn: &mut PgConnection, target_id: i32) -> Result<Vec<OpLogEntry>, Status> {
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.ge(target_id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let adj = build_adj(&entries);
    let subgraph = reachable_from(&adj, target_id);
    let order = topo_sort(&adj, &subgraph);

    let mut by_id: HashMap<i32, OpLogEntry> = entries.into_iter().map(|e| (e.id, e)).collect();

    // Reverse topological order: leaves first, target last.
    Ok(order
        .into_iter()
        .rev()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}

/// Returns the entries to redo for `target_id`, in order:
/// rolled-back ancestors first (dependencies), then target last.
///
/// Edges go U→V ("V depends on U"), so to redo target we traverse edges
/// *backwards* from target to find all rolled-back ancestors that must be
/// re-applied first.  The result is forward-topological order on the original
/// graph: ancestors before target.
fn compute_redo_order(conn: &mut PgConnection, target_id: i32) -> Result<Vec<OpLogEntry>, Status> {
    // Load ALL rolled-back, non-sealed entries — ancestors may have lower ids than target.
    let logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::rolled_back_at.is_not_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.asc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let entries: Vec<OpLogEntry> = logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let adj = build_adj(&entries);

    // Build reverse adjacency list so we can walk from target back to its
    // rolled-back dependencies.
    let mut rev_adj: HashMap<i32, Vec<i32>> = entries.iter().map(|e| (e.id, vec![])).collect();
    for (&u, vs) in &adj {
        for &v in vs {
            rev_adj.entry(v).or_default().push(u);
        }
    }

    // BFS on reversed edges: finds target + all its rolled-back ancestors.
    let subgraph = reachable_from(&rev_adj, target_id);

    // Topo-sort using the *forward* edges so dependencies come before target.
    let order = topo_sort(&adj, &subgraph);

    let mut by_id: HashMap<i32, OpLogEntry> = entries.into_iter().map(|e| (e.id, e)).collect();

    // Forward topological order: ancestors first, target last.
    Ok(order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}

// ─── Event emission ──────────────────────────────────────────────────────────

/// Emit one `OpLogChanged` event per distinct `token_id` found in `entries`.
/// Entries without a `token_id` (pre-migration) are silently skipped.
fn emit_op_log_changed(bus: &broadcast::Sender<SpaceEvent>, entries: &[OpLogEntry]) {
    // Group entries by token_id
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

/// Rolls back the operation identified by `id` and every operation that
/// depends on it (its descendants in the dependency DAG), in topological
/// order so that the most-dependent side-effects are undone first.
///
/// Log entries are **not** deleted — `rolled_back_at` is stamped on each one
/// so that a future `/logs/<id>/redo` endpoint can re-apply them.
#[post("/logs/<id>/rollback")]
pub async fn rollback_log(
    _token: Token,
    id: i32,
    lock_manager: &State<LockManager>,
    bus: &State<EventBus>,
) -> Result<Json<Vec<OpLogEntry>>, Status> {
    if !_token.permission_write {
        warn!(id, token_id = _token.id, "Rollback denied: token lacks write permission");
        return Err(Status::Forbidden);
    }
    info!(id, "Starting rollback");
    let conn = &mut establish_connection();

    // Verify the target entry exists.
    op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                warn!(id, "Rollback target not found");
                Status::NotFound
            }
            e => {
                error!(id, error = %e, "Failed to verify rollback target");
                Status::InternalServerError
            }
        })?;

    let entries = compute_undo_order(conn, id)?;

    info!(id, affected = entries.len(), "Executing rollback for entries");

    let lock_paths = collect_lock_paths(&entries);
    let path_refs: Vec<&PathBuf> = lock_paths.iter().collect();

    // Lock all affected spaces, then undo in reverse topological order.
    crate::routes::spaces::with_lock(lock_manager, &path_refs, || {
        let entries = &entries;
        async move {
            let mut c = establish_connection();
            for entry in entries {
                undo_operation(&mut c, entry).await?;
            }
            Ok::<(), Status>(())
        }
    })
    .await
    .map_err(|e| {
        error!(id, status = %e, "Rollback execution failed");
        e
    })?;

    // Stamp rolled_back_at so the client and a future redo endpoint can tell
    // which entries are currently in a rolled-back state.
    let now = Utc::now().naive_utc();
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(Some(now)))
        .execute(conn)
        .map_err(|e| {
            error!(id, error = %e, "Failed to stamp rolled_back_at");
            Status::InternalServerError
        })?;

    // Re-fetch to return the updated entries (with rolled_back_at populated).
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(conn)
        .map_err(|e| {
            error!(id, error = %e, "Failed to re-fetch rolled-back entries");
            Status::InternalServerError
        })?;

    let updated_entries: Vec<OpLogEntry> = updated_logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    info!(id, rolled_back = updated_entries.len(), "Rollback complete");
    emit_op_log_changed(&bus.inner().0, &updated_entries);

    Ok(Json(updated_entries))
}

// ─── Redo conflict detection ──────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct RedoConflict {
    pub conflicting_ops: Vec<i32>,
    pub message: String,
}

/// Find live (non-rolled-back, non-sealed) ops that were created after the
/// target was rolled back and write to any space the target writes to.
fn check_redo_conflicts(conn: &mut PgConnection, target: &OpLogEntry) -> Result<Vec<i32>, Status> {
    let rolled_back_at = match target.rolled_back_at {
        Some(ts) => ts,
        None => return Ok(vec![]), // not rolled back, no conflict possible
    };

    let target_writes = get_write_spaces(target);
    if target_writes.is_empty() {
        return Ok(vec![]);
    }

    // Load live, non-sealed ops created after the rollback timestamp
    let live_ops: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .filter(op_log::created_at.gt(rolled_back_at))
        .order(op_log::id.asc())
        .load(conn)
        .map_err(|_| Status::InternalServerError)?;

    let live_entries: Vec<OpLogEntry> = live_ops
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    let mut conflicts = Vec::new();
    for entry in &live_entries {
        let entry_writes = get_write_spaces(entry);
        let overlaps = target_writes.iter().any(|tw| {
            entry_writes.iter().any(|ew| is_subspace(ew, tw) || is_subspace(tw, ew))
        });
        if overlaps {
            conflicts.push(entry.id);
        }
    }

    Ok(conflicts)
}

/// Re-applies the operation `id` and every rolled-back descendant in the
/// dependency graph (RULE1 / RULE2 / RULE3), in topological order so that the target
/// is re-applied first and its dependents follow.
///
/// Returns 409 Conflict with a list of conflicting op IDs if newer live ops
/// write to the same spaces, unless `force=true` is passed.
#[post("/logs/<id>/redo?<force>")]
pub async fn redo_log(
    _token: Token,
    id: i32,
    force: Option<bool>,
    lock_manager: &State<LockManager>,
    bus: &State<EventBus>,
) -> Result<Json<Vec<OpLogEntry>>, Custom<Json<RedoConflict>>> {
    if !_token.permission_write {
        warn!(id, token_id = _token.id, "Redo denied: token lacks write permission");
        return Err(Custom(Status::Forbidden, Json(RedoConflict {
            conflicting_ops: vec![],
            message: "Token lacks write permission".into(),
        })));
    }
    info!(id, force = ?force, "Starting redo");
    let conn = &mut establish_connection();

    // Verify the anchor entry exists.
    let anchor: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq(id))
        .first(conn)
        .map_err(|e| {
            let status = match e {
                diesel::result::Error::NotFound => {
                    warn!(id, "Redo target not found");
                    Status::NotFound
                }
                ref e => {
                    error!(id, error = %e, "Failed to fetch redo target");
                    Status::InternalServerError
                }
            };
            Custom(status, Json(RedoConflict { conflicting_ops: vec![], message: "Not found".into() }))
        })?;

    // Check if sealed
    if anchor.sealed_at.is_some() {
        warn!(id, "Redo attempted on sealed entry");
        return Err(Custom(Status::UnprocessableEntity, Json(RedoConflict {
            conflicting_ops: vec![],
            message: "Operation is sealed and cannot be redone".into(),
        })));
    }

    let anchor_entry = fetch_details(conn, anchor);

    // Conflict guard: check for newer live ops on the same spaces
    if !force.unwrap_or(false) {
        let conflicts = check_redo_conflicts(conn, &anchor_entry)
            .map_err(|s| Custom(s, Json(RedoConflict {
                conflicting_ops: vec![],
                message: "Internal error checking conflicts".into(),
            })))?;
        if !conflicts.is_empty() {
            warn!(id, conflicting_ops = ?conflicts, "Redo blocked by conflicting operations");
            return Err(Custom(Status::Conflict, Json(RedoConflict {
                conflicting_ops: conflicts,
                message: "Redo conflicts with newer operations on the same space(s)".into(),
            })));
        }
    } else if force.unwrap_or(false) {
        debug!(id, "Redo forced, skipping conflict check");
    }

    let entries = compute_redo_order(conn, id)
        .map_err(|s| Custom(s, Json(RedoConflict {
            conflicting_ops: vec![],
            message: "Failed to compute redo order".into(),
        })))?;

    let lock_paths = collect_lock_paths(&entries);
    let path_refs: Vec<&PathBuf> = lock_paths.iter().collect();

    info!(id, count = entries.len(), "Executing redo for entries");

    // Lock all affected spaces, then redo in topological order.
    crate::routes::spaces::with_lock(lock_manager, &path_refs, || {
        let entries = &entries;
        async move {
            let mut c = establish_connection();
            for entry in entries {
                redo_operation(&mut c, entry).await?;
            }
            Ok::<(), Status>(())
        }
    })
    .await
    .map_err(|s| {
        error!(id, status = %s, "Redo execution failed");
        Custom(s, Json(RedoConflict {
            conflicting_ops: vec![],
            message: "Redo execution failed".into(),
        }))
    })?;

    // Clear rolled_back_at to mark these entries as active again.
    let ids: Vec<i32> = entries.iter().map(|e| e.id).collect();
    diesel::update(op_log::table.filter(op_log::id.eq_any(&ids)))
        .set(op_log::rolled_back_at.eq(None::<chrono::NaiveDateTime>))
        .execute(conn)
        .map_err(|e| {
            error!(id, error = %e, "Failed to clear rolled_back_at after redo");
            Custom(Status::InternalServerError, Json(RedoConflict {
                conflicting_ops: vec![],
                message: "Failed to update entries".into(),
            }))
        })?;

    // Re-fetch to return the updated entries (with rolled_back_at cleared).
    let updated_logs: Vec<OpLog> = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::id.eq_any(&ids))
        .order(op_log::id.desc())
        .load(conn)
        .map_err(|e| {
            error!(id, error = %e, "Failed to re-fetch redone entries");
            Custom(Status::InternalServerError, Json(RedoConflict {
                conflicting_ops: vec![],
                message: "Failed to fetch updated entries".into(),
            }))
        })?;

    let updated_entries: Vec<OpLogEntry> = updated_logs
        .into_iter()
        .map(|log| fetch_details(conn, log))
        .collect();

    info!(id, redone = updated_entries.len(), "Redo complete");
    emit_op_log_changed(&bus.inner().0, &updated_entries);

    Ok(Json(updated_entries))
}

// ─── Checkpoint (seal old ops) ───────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct CheckpointResponse {
    pub sealed_count: usize,
}

/// Seals all live (non-rolled-back) ops except the most recent one,
/// making them read-only and excluded from undo/redo/graph computations.
#[post("/logs/checkpoint")]
pub fn create_checkpoint(_token: Token) -> Result<Json<CheckpointResponse>, Status> {
    if !_token.permission_write {
        warn!(token_id = _token.id, "Checkpoint denied: token lacks write permission");
        return Err(Status::Forbidden);
    }
    info!("Creating checkpoint");
    let conn = &mut establish_connection();

    // Find the max id among live, non-sealed ops
    let max_id: Option<i32> = op_log::table
        .select(diesel::dsl::max(op_log::id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .first(conn)
        .map_err(|e| {
            error!(error = %e, "Failed to find max op log id for checkpoint");
            Status::InternalServerError
        })?;

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
    .execute(conn)
    .map_err(|e| {
        error!(error = %e, "Failed to seal ops during checkpoint");
        Status::InternalServerError
    })?;

    info!(sealed = sealed_count, "Checkpoint created");
    Ok(Json(CheckpointResponse { sealed_count }))
}

// ─── Per-user undo/redo targets ──────────────────────────────────────────

/// Returns the most recent live, non-sealed op created by the requesting token.
#[get("/logs/my-last-undoable")]
pub fn my_last_undoable(token: Token) -> Result<Json<OpLogEntry>, Status> {
    debug!(token_id = token.id, "Fetching last undoable op");
    let conn = &mut establish_connection();

    let log: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::token_id.eq(token.id))
        .filter(op_log::rolled_back_at.is_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.desc())
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                debug!(token_id = token.id, "No undoable ops found for token");
                Status::NotFound
            }
            e => {
                error!(token_id = token.id, error = %e, "Failed to fetch last undoable op");
                Status::InternalServerError
            }
        })?;

    Ok(Json(fetch_details(conn, log)))
}

/// Returns the most recently rolled-back, non-sealed op created by the
/// requesting token — i.e. the next op this user would want to redo.
#[get("/logs/my-last-redoable")]
pub fn my_last_redoable(token: Token) -> Result<Json<OpLogEntry>, Status> {
    debug!(token_id = token.id, "Fetching last redoable op");
    let conn = &mut establish_connection();

    let log: OpLog = op_log::table
        .select(OpLog::as_select())
        .filter(op_log::token_id.eq(token.id))
        .filter(op_log::rolled_back_at.is_not_null())
        .filter(op_log::sealed_at.is_null())
        .order(op_log::id.desc())
        .first(conn)
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                debug!(token_id = token.id, "No redoable ops found for token");
                Status::NotFound
            }
            e => {
                error!(token_id = token.id, error = %e, "Failed to fetch last redoable op");
                Status::InternalServerError
            }
        })?;

    Ok(Json(fetch_details(conn, log)))
}
