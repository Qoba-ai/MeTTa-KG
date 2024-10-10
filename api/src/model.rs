use crate::schema::tokens;
use chrono::NaiveDateTime;
use diesel::{QueryableByName, Insertable, Queryable, Selectable};
use rocket::serde::{Deserialize, Serialize};

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
