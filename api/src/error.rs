use diesel::result::Error as DieselError;
use rocket::http::Status;
use rocket::request::Request;
use rocket::response::{self, Responder};
use rocket::serde::json::{serde_json, Json};
use serde::Serialize;
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

#[derive(Serialize)]
struct RedoConflictBody {
    conflicting_ops: Vec<i32>,
    message: String,
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

        match self {
            Self::RedoConflict {
                conflicting_ops,
                message,
            } => rocket::response::status::Custom(
                status,
                Json(RedoConflictBody {
                    conflicting_ops,
                    message,
                }),
            )
            .respond_to(req),
            Self::PayloadTooLarge => rocket::response::status::Custom(
                status,
                Json(serde_json::json!({ "error": "payload_too_large", "message": "File is too large. Maximum upload size is 256 MiB." })),
            )
            .respond_to(req),
            _ => status.respond_to(req),
        }
    }
}
