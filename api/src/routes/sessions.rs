use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use hmac::{Hmac, Mac};
use jwt::SignWithKey;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{self, post};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::env;

use crate::{db::establish_connection, model::User};

#[post("/sessions", data = "<user>")]
pub fn create(user: Json<User>) -> (Status, Option<String>) {
    use crate::schema::users::dsl::*;

    let conn = &mut establish_connection();

    let result = users
        .filter(username.eq(&user.username))
        .select(User::as_select())
        .get_result(conn);

    let user = match result {
        Ok(user) => user,
        Err(_) => return (Status::Unauthorized, None),
    };

    let secret = match env::var("SECRET") {
        Ok(secret) => secret,
        Err(_) => return (Status::InternalServerError, None),
    };

    let key: Hmac<Sha256> = match Hmac::new_from_slice(secret.as_bytes()) {
        Ok(key) => key,
        Err(_) => return (Status::InternalServerError, None),
    };

    let mut claims = BTreeMap::new();

    claims.insert("id", user.id.to_string());
    claims.insert("username", user.username);
    claims.insert("email", user.email);

    let token = claims.sign_with_key(&key);

    match token {
        Ok(token) => (Status::Ok, Some(token)),
        Err(_) => (Status::InternalServerError, None),
    }
}
