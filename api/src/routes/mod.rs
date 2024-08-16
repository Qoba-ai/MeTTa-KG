use std::env;

use hmac::{Hmac, Mac};
use jwt::VerifyWithKey;
use rocket::{
    self,
    http::Status,
    outcome::Outcome,
    request::{self, FromRequest},
    Request,
};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;

pub mod namespaces;
pub mod sessions;
pub mod tokens;
pub mod translations;

#[derive(Serialize, Deserialize)]
pub struct TokenClaims {
    pub user_id: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum AuthError {
    InvalidToken,
    Unknown,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for TokenClaims {
    type Error = AuthError;

    #[must_use]
    async fn from_request(request: &'r Request<'_>) -> request::Outcome<TokenClaims, Self::Error> {
        let token = match request.headers().get_one("authorization") {
            Some(token) => token,
            None => {
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken))
            }
        };

        let secret = match env::var("SECRET") {
            Ok(secret) => secret,
            Err(_) => {
                return request::Outcome::Error((Status::InternalServerError, Self::Error::Unknown))
            }
        };

        let key: Hmac<Sha256> = match Hmac::new_from_slice(secret.as_bytes()) {
            Ok(key) => key,
            Err(_) => {
                return request::Outcome::Error((Status::InternalServerError, Self::Error::Unknown))
            }
        };

        let claims: BTreeMap<String, String> = match token.verify_with_key(&key) {
            Ok(claims) => claims,
            Err(er) => {
                println!("{}", er);
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken));
            }
        };

        let user_id = match claims.get("id").and_then(|id| id.parse::<i32>().ok()) {
            Some(user_id) => user_id,
            None => {
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken))
            }
        };

        let token_claims = TokenClaims { user_id };

        Outcome::Success(token_claims)
    }
}
