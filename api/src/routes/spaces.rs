use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::File;
use std::io::prelude::*;
use uuid::Uuid;

use rocket::{get, post, put};
use std::path::PathBuf;

use crate::model::Token;
use crate::mork_api::{
    ImportRequest, MorkApiClient, ReadRequest, TransformRequest, TransformSetter,
};

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Transformation {
    pub space: PathBuf,
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[post("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

    if !transformation.space.starts_with(token_namespace)
        || !token.permission_read
        || !token.permission_write
    {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new()
        .space(transformation.space.to_path_buf())
        .patterns(transformation.patterns.clone())
        .templates(transformation.templates.clone());

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[put("/spaces/<path..>", data = "<space_data>")]
pub async fn import(token: Token, path: PathBuf, space_data: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);

    if let Ok(mut file) = File::create(&file_path) {
        if file.write_all(space_data.as_bytes()).is_err() {
            return Err(Status::InternalServerError);
        }
    } else {
        return Err(Status::InternalServerError);
    }

    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();

    let import_file_url = format!("{}/public/{}.metta", origin, file_id);

    let mork_api_client = MorkApiClient::new();
    let request = ImportRequest::new()
        .space(path.to_path_buf())
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
    let request = ReadRequest::new().space(path.to_path_buf());

    mork_api_client.dispatch(request).await.map(Json)
}
