use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{get, post};

use super::TokenClaims;

use crate::{db::establish_connection, model::Namespace};

#[get("/namespaces")]
pub fn get_all() -> Result<Json<Vec<Namespace>>, Status> {
    use crate::schema::namespaces::dsl::*;

    let conn = &mut establish_connection();

    let results = namespaces.select(Namespace::as_select()).get_results(conn);

    match results {
        Ok(results) => Ok(Json(results)),
        Err(e) => return Err(Status::InternalServerError),
    }
}

#[post("/namespaces", data = "<namespace>")]
pub fn create(claims: TokenClaims, namespace: Json<Namespace>) -> Status {
    use crate::schema::namespaces::dsl::*;

    let conn = &mut establish_connection();

    // TODO: replace execute by get_result when switching to postgres
    let result = diesel::insert_into(namespaces)
        .values((name.eq(&namespace.name), user_id.eq(claims.user_id)))
        .execute(conn);

    match result {
        Ok(_) => Status::Ok,
        Err(_) => Status::InternalServerError,
    }
}
