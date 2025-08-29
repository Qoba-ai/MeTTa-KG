use crate::{db::establish_connection, model::Token};
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use rocket::{
    self,
    http::Status,
    outcome::Outcome,
    request::{self, FromRequest},
    Request,
};
use serde::{Deserialize, Serialize};

pub mod spaces;
pub mod tokens;
pub mod translations;


#[derive(Serialize, Deserialize, Debug)]
pub enum AuthError {
    InvalidToken,
    Unknown,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Token {
    type Error = AuthError;

    #[must_use]
    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Token, Self::Error> {
        use crate::schema::tokens::dsl::*;

        /*
        
        return Outcome::Success(Token {
            id: 0,
            code: "aaa".to_string(),
            description: "".to_string(),
            namespace: "".to_string(),
            creation_timestamp: Utc::now().naive_utc(),
            permission_read: true,
            permission_write: true,
            permission_share_share: true,
            permission_share_read: true,
            permission_share_write: true,
            parent: None,
        }); */

        let token = match request.headers().get_one("authorization") {
            Some(token) => token,
            None => {
                return request::Outcome::Error((Status::Unauthorized, Self::Error::InvalidToken))
            }
        };

        let conn = &mut establish_connection();

        let result = tokens
            .select(Token::as_select())
            .filter(code.eq(token))
            .get_result(conn);

        match result {
            Ok(claims) => Outcome::Success(claims),
            Err(_) => Outcome::Error((Status::Unauthorized, Self::Error::Unknown)),
        }
    }
}
