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
use std::path::{Component, Path};

pub mod events;
pub mod health;
pub mod op_logs;
pub mod spaces;
pub mod tokens;
pub mod translations;

#[derive(Serialize, Deserialize, Debug)]
pub enum AuthError {
    InvalidToken,
    Unknown,
}

pub fn path_to_metta_sexpr(path: &Path) -> String {
    let mut sexpr = String::from("$");

    for component in path.components().rev() {
        if let Component::Normal(name) = component {
            let name_str = name.to_string_lossy();
            sexpr = format!("({} {})", name_str, sexpr);
        }
    }

    sexpr
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Token {
    type Error = AuthError;

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Token, Self::Error> {
        use crate::schema::tokens::dsl::*;

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
