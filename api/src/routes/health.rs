use rocket::{get, serde::json::Json};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
}

/// Health check endpoint
/// Returns a simple JSON response indicating the service is running
#[get("/health")]
pub fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "metta-kg-api".to_string(),
    })
}
