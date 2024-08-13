use diesel::{Queryable, Selectable};
use rocket::serde::{Deserialize, Serialize};

use crate::schema::{namespaces, tokens, users};

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = namespaces)]
pub struct Namespace {
    pub id: i32,
    pub name: String,
    pub user_id: i32,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = users)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
}

#[derive(Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = tokens)]
#[diesel(belongs_to(Namespace))]
#[diesel(belongs_to(User))]
pub struct Token {
    pub id: i32,
    pub code: String,
    pub description: String,
    pub namespace_id: i32,
    pub user_id: i32,
}
