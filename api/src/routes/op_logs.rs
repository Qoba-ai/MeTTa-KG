use diesel::{ExpressionMethods, PgConnection, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::get;

use crate::{
    db::establish_connection,
    model::{
        OpLog, OpLogClear, OpLogCopy, OpLogEntry, OpLogImport, OpLogTransform, Token,
    },
    schema::{op_log, op_log_clear, op_log_copy, op_log_import, op_log_transform},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
        import,
        clear,
        copy,
        transform,
    }
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
