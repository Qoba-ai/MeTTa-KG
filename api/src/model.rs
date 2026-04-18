use crate::schema::{op_log, op_log_clear, op_log_copy, op_log_import, op_log_transform, tokens};
use chrono::NaiveDateTime;
use diesel::{Insertable, Queryable, QueryableByName, Selectable};
use diesel::sql_types::{Int4, Timestamp, Varchar};
use rocket::serde::{Deserialize, Serialize};

// ─── Tokens ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Insertable, Clone)]
#[diesel(table_name = tokens)]
pub struct TokenInsert {
    pub code: String,
    pub description: String,
    pub namespace: String,
    pub creation_timestamp: NaiveDateTime,
    pub permission_read: bool,
    pub permission_write: bool,
    pub permission_share_share: bool,
    pub permission_share_read: bool,
    pub permission_share_write: bool,
    pub parent: Option<i32>,
}

#[derive(Serialize, Deserialize, Queryable, Selectable, Clone, QueryableByName)]
#[diesel(table_name = tokens)]
pub struct Token {
    pub id: i32,
    pub code: String,
    pub description: String,
    pub namespace: String,
    pub creation_timestamp: NaiveDateTime,
    pub permission_read: bool,
    pub permission_write: bool,
    pub permission_share_share: bool,
    pub permission_share_read: bool,
    pub permission_share_write: bool,
    pub parent: Option<i32>,
}

// ─── Op Log (base) ───────────────────────────────────────────────────────────

#[derive(Insertable)]
#[diesel(table_name = op_log)]
pub struct OpLogInsert {
    pub op_type: String,
    pub token_id: Option<i32>,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = op_log)]
pub struct OpLog {
    pub id: i32,
    pub op_type: String,
    pub created_at: NaiveDateTime,
    pub rolled_back_at: Option<NaiveDateTime>,
    pub token_id: Option<i32>,
    pub sealed_at: Option<NaiveDateTime>,
}

// ─── Op Log Import ───────────────────────────────────────────────────────────

#[derive(Insertable)]
#[diesel(table_name = op_log_import)]
pub struct OpLogImportInsert {
    pub op_log_id: i32,
    pub path: String,
    pub uri: String,
    pub operation_id: Option<String>,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = op_log_import)]
pub struct OpLogImport {
    pub id: i32,
    pub op_log_id: i32,
    pub path: String,
    pub uri: String,
    pub operation_id: Option<String>,
}

// ─── Op Log Clear ────────────────────────────────────────────────────────────

#[derive(Insertable)]
#[diesel(table_name = op_log_clear)]
pub struct OpLogClearInsert {
    pub op_log_id: i32,
    pub path: String,
    pub operation_id: Option<String>,
    pub pattern: String,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = op_log_clear)]
pub struct OpLogClear {
    pub id: i32,
    pub op_log_id: i32,
    pub path: String,
    pub operation_id: Option<String>,
    pub pattern: String,
}

// ─── Op Log Copy ─────────────────────────────────────────────────────────────

#[derive(Insertable)]
#[diesel(table_name = op_log_copy)]
pub struct OpLogCopyInsert {
    pub op_log_id: i32,
    pub src: String,
    pub dst: String,
    pub operation_id: Option<String>,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = op_log_copy)]
pub struct OpLogCopy {
    pub id: i32,
    pub op_log_id: i32,
    pub src: String,
    pub dst: String,
    pub operation_id: Option<String>,
}

// ─── Op Log Transform ────────────────────────────────────────────────────────

#[derive(Insertable)]
#[diesel(table_name = op_log_transform)]
pub struct OpLogTransformInsert {
    pub op_log_id: i32,
    pub input_spaces: serde_json::Value,
    pub output_spaces: serde_json::Value,
    pub operation_id: Option<String>,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = op_log_transform)]
pub struct OpLogTransform {
    pub id: i32,
    pub op_log_id: i32,
    pub input_spaces: serde_json::Value,
    pub output_spaces: serde_json::Value,
    pub operation_id: Option<String>,
}

// ─── Op Log Entry (API response) ─────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct OpLogEntry {
    pub id: i32,
    pub op_type: String,
    pub created_at: NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rolled_back_at: Option<NaiveDateTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sealed_at: Option<NaiveDateTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import: Option<OpLogImport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clear: Option<OpLogClear>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy: Option<OpLogCopy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<OpLogTransform>,
}
