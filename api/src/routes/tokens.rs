use chrono::Utc;
use diesel::sql_types::Integer;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl};
use regex::Regex;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{delete, get, post};
use tracing::instrument;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{db::establish_connection, model::Token, model::TokenInsert};

#[instrument]
#[get("/tokens")]
pub fn get_all(token: Token) -> Result<Json<Vec<Token>>, Status> {
    let conn = &mut establish_connection();

    let results = diesel::sql_query(
        "WITH RECURSIVE rectree AS (
        SELECT * 
            FROM tokens 
        WHERE id = $1
        UNION ALL 
        SELECT t.* 
            FROM tokens t 
            JOIN rectree
            ON t.parent = rectree.id
        ) SELECT * FROM rectree;",
    )
    .bind::<Integer, _>(token.id)
    .get_results::<Token>(conn);

    match results {
        Ok(results) => Ok(Json(results)),
        Err(e) => {
            error!(error = %e, "Failed to get tokens recursively");
            Err(Status::InternalServerError)
        }
    }
}

#[instrument]
#[get("/token")]
pub fn get(token: Token) -> Result<Json<Token>, Status> {
    return Ok(Json(token));
}

#[instrument]
#[post("/tokens", data = "<new_token>")]
pub fn create(token: Token, new_token: Json<Token>) -> Result<Json<Token>, Status> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    // TODO: enforce constraints such as "tokens that have write permission should also have read
    // permission"

    if !token.permission_share_write && new_token.permission_write {
        warn!("User tried to create write token without share_write permission");
        return Err(Status::BadRequest);
    }

    if !token.permission_share_read && new_token.permission_read {
        warn!("User tried to create read token without share_read permission");
        return Err(Status::BadRequest);
    }

    if !token.namespace.ends_with("/") {
        error!(
            "User tried to create new token using token on namespace that does not end with '/'"
        );
        return Err(Status::InternalServerError);
    }

    // Normalize: ensure namespace ends with '/'
    let ns = if new_token.namespace.ends_with('/') {
        new_token.namespace.clone()
    } else {
        format!("{}/", new_token.namespace)
    };

    if !ns.starts_with(&token.namespace) {
        warn!("User tried to create token for invalid namespace");
        return Err(Status::BadRequest);
    }

    let namespace_regex =
        Regex::new(r"^/(([a-zA-Z0-9])+([a-zA-Z0-9]|\-|_)*([a-zA-Z0-9])/)*$").unwrap();

    if !namespace_regex.is_match(&ns) {
        warn!("User tried to create token for invalid namespace (invalid characters)");
        return Err(Status::BadRequest);
    }

    // Validate name: required, 3–10 characters
    let token_name = match &new_token.name {
        Some(n) => n.clone(),
        None => {
            warn!("User tried to create token without a name");
            return Err(Status::BadRequest);
        }
    };
    if token_name.len() < 3 || token_name.len() > 32 {
        warn!("User tried to create token with invalid name length");
        return Err(Status::BadRequest);
    }

    // Enforce uniqueness of name within the namespace
    let name_conflict = tokens
        .filter(namespace.eq(&ns))
        .filter(name.eq(&token_name))
        .first::<Token>(conn)
        .optional();
    match name_conflict {
        Ok(Some(_)) => {
            warn!("User tried to create token with duplicate name in namespace");
            return Err(Status::Conflict);
        }
        Err(e) => {
            error!(error = %e, "Failed to check new token name uniqueness");
            return Err(Status::InternalServerError);
        }
        _ => {}
    }

    let token_code = Uuid::new_v4();

    let to_insert = TokenInsert {
        code: token_code.to_string(),
        description: new_token.description.clone(),
        namespace: ns,
        creation_timestamp: Utc::now().naive_utc(),
        permission_read: new_token.permission_read,
        permission_write: new_token.permission_write,
        permission_share_read: new_token.permission_share_read,
        permission_share_write: new_token.permission_share_write,
        permission_share_share: false,
        parent: Some(token.id),
        name: Some(token_name),
    };

    let result = diesel::insert_into(tokens)
        .values(&to_insert)
        .get_result(conn);

    match result {
        Ok(token) => {
            info!("Inserted token");
            Ok(Json(token))
        }
        Err(e) => {
            error!(error = %e, "Failed to insert new token");
            Err(Status::InternalServerError)
        }
    }
}

#[instrument]
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
        Ok(rows_affected) => {
            info!(n = rows_affected, "Deleted tokens");
            Ok(Json(rows_affected as i32))
        }
        Err(_) => Err(Status::NotFound),
    }
}

#[instrument]
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
            Ok(result) => {
                info!(token_id, "Token code rotated (self)");
                Ok(Json(result))
            }
            Err(e) => {
                warn!(token_id, error = %e, "Token code rotation failed: not found");
                Err(Status::NotFound)
            }
        }
    } else {
        let result = diesel::update(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id)))
            .set(code.eq(token_code.to_string()))
            .get_result(conn);

        match result {
            Ok(result) => {
                info!(token_id, "Token code rotated");
                Ok(Json(result))
            }
            Err(e) => {
                warn!(token_id, error = %e, "Token code rotation failed: not found or not owned");
                Err(Status::NotFound)
            }
        }
    }
}

#[instrument]
#[delete("/tokens/<token_id>")]
pub fn delete(token: Token, token_id: i32) -> Status {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();

    let result =
        diesel::delete(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id))).execute(conn);

    match result {
        Ok(rows) if rows > 0 => {
            info!(token_id, "Token deleted");
            Status::Ok
        }
        Ok(_) => {
            warn!(token_id, "Token delete: not found or not owned");
            Status::NotFound
        }
        Err(e) => {
            error!(token_id, error = %e, "Failed to delete token");
            Status::NotFound
        }
    }
}
