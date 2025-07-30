use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::prelude::*;
use uuid::Uuid;

use rocket::{get, post};
use std::path::PathBuf;

use crate::mork_api::{ImportRequest, MorkApiClient, ReadRequest, TransformRequest, TransformSetter};
use crate::model::Token;

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Transformation {
    pub input_space: PathBuf,
    pub output_space: PathBuf,
    pub pattern: String,
    pub template: String,
}

#[post("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

    if !transformation.input_space.starts_with(token_namespace)
        || !transformation.output_space.starts_with(token_namespace)
        || !token.permission_read
        || !token.permission_write
    {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new()
        .input_space(transformation.input_space.to_path_buf())
        .output_space(transformation.output_space.to_path_buf())
        .pattern(transformation.pattern.clone())
        .template(transformation.template.clone());

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(token: Token, path: PathBuf, space: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);

    if let Ok(mut file) = File::create(&file_path) {
        if file.write_all(space.as_bytes()).is_err() {
            return Err(Status::InternalServerError);
        }
    } else {
        return Err(Status::InternalServerError);
    }

    let _path_serialized = path.to_str().unwrap_or_default();
    let import_file_url = format!("/public/{}.metta", file_id);

    let mork_api_client = MorkApiClient::new();
    let request = ImportRequest::new()
        .uri(import_file_url);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[get("/spaces/<path..>")]
pub async fn read(token: Token, path: PathBuf) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ReadRequest::new();

    mork_api_client.dispatch(request).await.map(Json)
}
