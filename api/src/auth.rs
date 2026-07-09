use crate::{db::DbPool, model::Token};
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::{
    self,
    http::Status,
    outcome::Outcome,
    request::{self, FromRequest},
    Request,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub enum AuthError {
    InvalidToken,
    Unknown,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Token {
    type Error = AuthError;

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Token, Self::Error> {
        use crate::schema::tokens::dsl::*;

        let auth_header = match request.headers().get_one("authorization") {
            Some(h) => h,
            None => {
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken))
            }
        };
        let token_code = match auth_header.strip_prefix("Bearer ") {
            Some(t) => t,
            None => {
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken))
            }
        };

        let pool = match request.rocket().state::<DbPool>() {
            Some(p) => p,
            None => return Outcome::Error((Status::InternalServerError, Self::Error::Unknown)),
        };

        let mut conn = match pool.get() {
            Ok(c) => c,
            Err(_) => return Outcome::Error((Status::InternalServerError, Self::Error::Unknown)),
        };

        let result = tokens
            .select(Token::as_select())
            .filter(code.eq(token_code))
            .get_result(&mut conn);

        match result {
            Ok(claims) => Outcome::Success(claims),
            Err(_) => Outcome::Error((Status::Unauthorized, Self::Error::Unknown)),
        }
    }
}
