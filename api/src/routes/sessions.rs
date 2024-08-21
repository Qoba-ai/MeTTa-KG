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
pub fn create(user: Json<User>) -> Result<String, Status> {
    use crate::schema::users::dsl::*;

    let conn = &mut establish_connection();

    let result = users
        .filter(username.eq(&user.username))
        .select(User::as_select())
        .get_result(conn);

    let user = match result {
        Ok(user) => user,
        Err(_) => return Err(Status::Unauthorized),
    };

    let secret = match env::var("SECRET") {
        Ok(secret) => secret,
        Err(_) => return Err(Status::InternalServerError),
    };

    let key: Hmac<Sha256> = match Hmac::new_from_slice(secret.as_bytes()) {
        Ok(key) => key,
        Err(_) => return Err(Status::InternalServerError),
    };

    let mut claims = BTreeMap::new();

    claims.insert("id", user.id.to_string());
    claims.insert("username", user.username);
    claims.insert("email", user.email);

    let token = claims.sign_with_key(&key);

    match token {
        Ok(token) => Ok(token),
        Err(_) => Err(Status::InternalServerError),
    }
}
