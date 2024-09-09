use chrono::Utc;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use regex::Regex;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{delete, get, post};
use uuid::Uuid;

use crate::{db::establish_connection, model::Token, model::TokenInsert};

#[get("/tokens")]
pub fn get_all(token: Token) -> Result<Json<Vec<Token>>, Status> {
    use crate::schema::tokens::dsl::*;

    let conn = &mut establish_connection();

    // TODO: get all nested tokens
    let results = tokens
        .select(Token::as_select())
        .filter(parent.eq(&token.id))
        .get_results(conn);

    match results {
        Ok(results) => Ok(Json([results, vec![token]].concat())),
        Err(_) => Err(Status::InternalServerError),
    }
}

#[post("/tokens", data = "<new_token>")]
pub fn create(token: Token, new_token: Json<Token>) -> Result<Json<Token>, Status> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    // TODO: enforce constraints such as "tokens that have write permission should also have read
    // permission"

    if !token.permission_share_write && new_token.permission_write {
        println!("User tried to create write token without share_write permission");
        return Err(Status::BadRequest);
    }

    if !token.permission_share_read && new_token.permission_read {
        println!("User tried to create read token without share_read permission");
        return Err(Status::BadRequest);
    }

    if !new_token.namespace.starts_with(&token.namespace) {
        println!("User tried to create token for invalid namespace");
        return Err(Status::BadRequest);
    }

    if !new_token.namespace.ends_with("/") {
        println!("User tried to create token for invalid namespace (missing trailing '/')");
        return Err(Status::BadRequest);
    }

    let namespace_regex =
        Regex::new(r"^/(([a-zA-Z0-9])+([a-zA-Z0-9]|\-|_)*([a-zA-Z0-9])/)*$").unwrap();

    if !namespace_regex.is_match(&new_token.namespace) {
        println!("User tried to create token for invalid namespace (invalid characters)");
        return Err(Status::BadRequest);
    }

    let token_code = Uuid::new_v4();

    let to_insert = TokenInsert {
        code: token_code.to_string(),
        description: new_token.description.clone(),
        namespace: new_token.namespace.clone(),
        creation_timestamp: Utc::now().naive_utc(),
        permission_read: new_token.permission_read,
        permission_write: new_token.permission_write,
        permission_share_read: new_token.permission_share_read,
        permission_share_write: new_token.permission_share_write,
        permission_share_share: false,
        parent: Some(token.id),
    };

    let result = diesel::insert_into(tokens)
        .values(&to_insert)
        .get_result(conn);

    match result {
        Ok(token) => Ok(Json(token)),
        Err(_) => Err(Status::InternalServerError),
    }
}

#[delete("/tokens", data = "<token_ids>")]
pub fn delete_batch(token: Token, token_ids: Json<Vec<i32>>) -> Result<Json<i32>, Status> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    // filtering by parent ID prevents root token from being deleted

    let result = diesel::delete(
        tokens
            .filter(id.eq_any(token_ids.iter()))
            .filter(parent.eq(&token.id)),
    )
    .execute(conn);

    match result {
        Ok(rows_affected) => Ok(Json(rows_affected as i32)),
        Err(_) => Err(Status::NotFound),
    }
}

#[post("/tokens/<token_id>")]
pub fn update(token: Token, token_id: i32) -> Result<Json<Token>, Status> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    let token_code = Uuid::new_v4();

    if token.id == token_id && token.permission_share_share {
        let result = diesel::update(tokens.filter(id.eq(token_id)))
            .set(code.eq(token_code.to_string()))
            .get_result(conn);

        match result {
            Ok(result) => Ok(Json(result)),
            Err(_) => Err(Status::NotFound),
        }
    } else {
        let result = diesel::update(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id)))
            .set(code.eq(token_code.to_string()))
            .get_result(conn);

        match result {
            Ok(result) => Ok(Json(result)),
            Err(_) => Err(Status::NotFound),
        }
    }
}

/// delete child token
#[delete("/tokens/<token_id>")]
pub fn delete(token: Token, token_id: i32) -> Status {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    // filtering by parent ID prevents root token from being deleted

    let result =
        diesel::delete(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id))).execute(conn);

    match result {
        Ok(_) => Status::Ok,
        Err(_) => Status::NotFound,
    }
}
