use diesel::result::Error as DieselError;
use rocket::http::Status;
use rocket::request::Request;
use rocket::response::{self, Responder};
use rocket::serde::json::{serde_json, Json};
use tracing::error;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not found")]
    NotFound,

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("unprocessable: {0}")]
    Unprocessable(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("payload too large")]
    PayloadTooLarge,

    #[error("redo conflict")]
    RedoConflict {
        conflicting_ops: Vec<i32>,
        message: String,
    },

    #[error("{0}")]
    Db(#[from] DieselError),

    #[error("{0}")]
    Mork(#[from] mork_client::MorkError),

    #[error("{0}")]
    Internal(String),
}

impl ApiError {
    pub fn status(&self) -> Status {
        match self {
            Self::NotFound | Self::Db(DieselError::NotFound) => Status::NotFound,
            Self::Unauthorized => Status::Unauthorized,
            Self::Forbidden => Status::Forbidden,
            Self::BadRequest(_) => Status::BadRequest,
            Self::Unprocessable(_) => Status::UnprocessableEntity,
            Self::Conflict(_) => Status::Conflict,
            Self::PayloadTooLarge => Status::PayloadTooLarge,
            Self::RedoConflict { .. } => Status::Conflict,
            _ => Status::InternalServerError,
        }
    }
}

impl<'r> Responder<'r, 'static> for ApiError {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'static> {
        let status = self.status();

        match &self {
            Self::Db(e) if !matches!(e, DieselError::NotFound) => {
                error!(error = %e, "Database error");
            }
            Self::Mork(e) => error!(error = %e, "MORK error"),
            Self::Internal(msg) => error!(error = %msg, "Internal error"),
            _ => {}
        }

        let body = match &self {
            Self::NotFound | Self::Db(DieselError::NotFound) => {
                serde_json::json!({"error": "not_found", "message": "resource not found"})
            }
            Self::Unauthorized => {
                serde_json::json!({"error": "unauthorized", "message": "valid Bearer token required"})
            }
            Self::Forbidden => {
                serde_json::json!({"error": "forbidden", "message": "insufficient permissions"})
            }
            Self::BadRequest(msg) => {
                serde_json::json!({"error": "bad_request", "message": msg})
            }
            Self::Unprocessable(msg) => {
                serde_json::json!({"error": "unprocessable", "message": msg})
            }
            Self::Conflict(msg) => {
                serde_json::json!({"error": "conflict", "message": msg})
            }
            Self::PayloadTooLarge => {
                serde_json::json!({"error": "payload_too_large", "message": "File is too large. Maximum upload size is configured via METTA_KG_MAX_UPLOAD_BYTES."})
            }
            Self::RedoConflict {
                conflicting_ops,
                message,
            } => {
                serde_json::json!({"error": "redo_conflict", "message": message, "conflicting_ops": conflicting_ops})
            }
            Self::Db(_) => {
                serde_json::json!({"error": "internal_error", "message": "a database error occurred"})
            }
            Self::Mork(e) => {
                serde_json::json!({"error": "upstream_error", "message": e.to_string()})
            }
            Self::Internal(msg) => {
                serde_json::json!({"error": "internal_error", "message": msg})
            }
        };

        rocket::response::status::Custom(status, Json(body)).respond_to(req)
    }
}
