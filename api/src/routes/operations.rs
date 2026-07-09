use rocket::serde::json::Json;
use rocket::{get, State};

use crate::error::ApiError;
use crate::model::Token;
use crate::operations::{OperationRecord, OperationStore};

#[get("/operations/<id>")]
pub async fn get_operation(
    _token: Token,
    id: String,
    ops: &State<OperationStore>,
) -> Result<Json<OperationRecord>, ApiError> {
    match ops.get(&id).await {
        Some(record) => Ok(Json(record)),
        None => Err(ApiError::NotFound),
    }
}
