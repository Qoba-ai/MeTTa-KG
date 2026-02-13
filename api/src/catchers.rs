use rocket::catch;
use rocket::serde::json::{json, Value};

#[catch(400)]
pub fn bad_request() -> Value {
    json!({
        "error": "Bad Request",
        "message": "The request was malformed or invalid."
    })
}

#[catch(401)]
pub fn unauthorized() -> Value {
    json!({
        "error": "Unauthorized",
        "message": "A valid authorization token is required."
    })
}

#[catch(404)]
pub fn not_found() -> Value {
    json!({
        "error": "Not Found",
        "message": "The requested resource was not found."
    })
}

#[catch(408)]
pub fn request_timeout() -> Value {
    json!({
        "error": "Request Timeout",
        "message": "The request timed out while processing."
    })
}

#[catch(500)]
pub fn internal_error() -> Value {
    json!({
        "error": "Internal Server Error",
        "message": "An unexpected error occurred. Please try again later."
    })
}
