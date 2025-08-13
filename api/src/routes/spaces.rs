use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::prelude::*;
use url::Url;
use uuid::Uuid;

use rocket::{get, post};
use std::path::PathBuf;

use crate::model::Token;
use crate::mork_api::{
    ExploreRequest, ImportRequest, MorkApiClient, ReadRequest, Request, TransformDetails,
    TransformRequest,
};

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Transformation {
    pub space: PathBuf,
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

#[post("/spaces/<path..>", data = "<transformation>")]
pub async fn transform(
    token: Token,
    path: PathBuf,
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
        .namespace(transformation.space.to_path_buf())
        .transform_input(
            TransformDetails::new()
                .patterns(transformation.patterns.clone())
                .templates(transformation.templates.clone()),
        );

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[post("/spaces/<path..>", data = "<space_data>")]
pub async fn upload(token: Token, path: PathBuf, space_data: String) -> Result<Json<bool>, Status> {
    // TODO: this is not a valid implementation of the API
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

    let _path_serialized = path.to_str().unwrap_or_default();
    let import_file_url = format!("/public/{}.metta", file_id);

    let mork_api_client = MorkApiClient::new();
    let request = ImportRequest::new().namespace(path).uri(import_file_url);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[post("/spaces/<path..>?<uri>")]
pub async fn import(token: Token, path: PathBuf, uri: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    // validate uri
    if Url::parse(&uri).is_err() {
        return Err(Status::BadRequest);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ImportRequest::new().namespace(path).uri(uri);

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
    let request = ReadRequest::new().namespace(path);

    let response = mork_api_client.dispatch(request).await.map(Json);
    response
}

#[post("/explore/spaces/<path..>", data = "<data>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    data: Json<ExploreInput>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExploreRequest::new()
        .namespace(path)
        .pattern(data.pattern.clone())
        .token(data.token.clone());

    println!("explore path: {:?}", request.path());

    let response = mork_api_client.dispatch(request).await.map(Json);
    println!("explore response: {:?}", response);
    response
}
