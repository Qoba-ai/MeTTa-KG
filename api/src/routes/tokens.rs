use chrono::Utc;
use diesel::sql_types::Integer;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl};
use regex::Regex;
use rocket::serde::json::Json;
use rocket::State;
use rocket::{delete, get, post, put};
use tracing::instrument;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{db, db::DbPool, error::ApiError, model::Token, model::TokenInsert};

#[instrument]
#[get("/tokens")]
pub fn get_all(token: Token, pool: &State<DbPool>) -> Result<Json<Vec<Token>>, ApiError> {
    let conn = &mut db::get_conn(pool.inner())?;

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
    .get_results::<Token>(conn)?;

    Ok(Json(results))
}

#[instrument]
#[get("/tokens/me")]
pub fn get(token: Token) -> Json<Token> {
    Json(token)
}

#[instrument]
#[post("/tokens", data = "<new_token>")]
pub fn create(
    token: Token,
    new_token: Json<Token>,
    pool: &State<DbPool>,
) -> Result<Json<Token>, ApiError> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut db::get_conn(pool.inner())?;

    if !token.permission_share_write && new_token.permission_write {
        warn!("User tried to create write token without share_write permission");
        return Err(ApiError::BadRequest(
            "cannot create write token without share_write permission".into(),
        ));
    }

    if !token.permission_share_read && new_token.permission_read {
        warn!("User tried to create read token without share_read permission");
        return Err(ApiError::BadRequest(
            "cannot create read token without share_read permission".into(),
        ));
    }

    if !token.namespace.ends_with("/") {
        error!(
            "User tried to create new token using token on namespace that does not end with '/'"
        );
        return Err(ApiError::Internal(
            "parent token namespace does not end with '/'".into(),
        ));
    }

    // Normalize: ensure namespace ends with '/'
    let ns = if new_token.namespace.ends_with('/') {
        new_token.namespace.clone()
    } else {
        format!("{}/", new_token.namespace)
    };

    if !ns.starts_with(&token.namespace) {
        warn!("User tried to create token for invalid namespace");
        return Err(ApiError::BadRequest(
            "namespace outside parent token scope".into(),
        ));
    }

    let namespace_regex =
        Regex::new(r"^/(([a-zA-Z0-9])+([a-zA-Z0-9]|\-|_)*([a-zA-Z0-9])/)*$").unwrap();

    if !namespace_regex.is_match(&ns) {
        warn!("User tried to create token for invalid namespace (invalid characters)");
        return Err(ApiError::BadRequest("invalid namespace format".into()));
    }

    // Validate name: required, 3–32 characters
    let token_name = match &new_token.name {
        Some(n) => n.clone(),
        None => {
            warn!("User tried to create token without a name");
            return Err(ApiError::BadRequest("token name is required".into()));
        }
    };
    if token_name.len() < 3 || token_name.len() > 32 {
        warn!("User tried to create token with invalid name length");
        return Err(ApiError::BadRequest(
            "token name must be 3–32 characters".into(),
        ));
    }

    // Enforce uniqueness of name within the namespace
    let name_conflict = tokens
        .filter(namespace.eq(&ns))
        .filter(name.eq(&token_name))
        .first::<Token>(conn)
        .optional()?;
    if name_conflict.is_some() {
        warn!("User tried to create token with duplicate name in namespace");
        return Err(ApiError::Conflict(
            "token name already exists in namespace".into(),
        ));
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

    let result: Token = diesel::insert_into(tokens)
        .values(&to_insert)
        .get_result(conn)?;

    info!("Inserted token");
    Ok(Json(result))
}

#[instrument]
#[delete("/tokens", data = "<token_ids>")]
pub fn delete_batch(
    token: Token,
    token_ids: Json<Vec<i32>>,
    pool: &State<DbPool>,
) -> Result<Json<i32>, ApiError> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut db::get_conn(pool.inner())?;

    // filtering by parent ID prevents root token from being deleted
    let rows_affected = diesel::delete(
        tokens
            .filter(id.eq_any(token_ids.iter()))
            .filter(parent.eq(&token.id)),
    )
    .execute(conn)?;

    info!(n = rows_affected, "Deleted tokens");
    Ok(Json(rows_affected as i32))
}

#[instrument]
#[put("/tokens/<token_id>")]
pub fn update(token: Token, token_id: i32, pool: &State<DbPool>) -> Result<Json<Token>, ApiError> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut db::get_conn(pool.inner())?;

    let token_code = Uuid::new_v4();

    let result: Token = if token.id == token_id && token.permission_share_share {
        diesel::update(tokens.filter(id.eq(token_id)))
            .set(code.eq(token_code.to_string()))
            .get_result(conn)
    } else {
        diesel::update(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id)))
            .set(code.eq(token_code.to_string()))
            .get_result(conn)
    }
    .map_err(|e| {
        warn!(token_id, error = %e, "Token code rotation failed");
        ApiError::NotFound
    })?;

    info!(token_id, "Token code rotated");
    Ok(Json(result))
}

#[instrument]
#[delete("/tokens/<token_id>")]
pub fn delete(token: Token, token_id: i32, pool: &State<DbPool>) -> Result<(), ApiError> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut db::get_conn(pool.inner())?;

    let rows = diesel::delete(tokens.filter(id.eq(token_id)).filter(parent.eq(&token.id)))
        .execute(conn)?;

    if rows > 0 {
        info!(token_id, "Token deleted");
        Ok(())
    } else {
        warn!(token_id, "Token delete: not found or not owned");
        Err(ApiError::NotFound)
    }
}
