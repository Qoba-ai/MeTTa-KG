use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::prelude::*;
use url::Url;
use uuid::Uuid;
use rocket::tokio::io::AsyncReadExt;

use rocket::{get, post, Data};
use rocket::response::status::Custom;
use std::path::PathBuf;

use crate::model::Token;
use crate::mork_api::{
    ExploreRequest, ImportRequest, MorkApiClient, ReadRequest, Request, TransformDetails, UploadRequest,
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

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreOutput {
    pub expr: String,
    pub token: String
}

#[post("/spaces/<path..>", data = "<transformation>", rank = 2)]
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

/// Handles file upload requests to MORK server with hierarchical namespace formatting.  
///   
/// This endpoint accepts data uploads and applies namespace transformations to ensure  
/// compatibility with MORK's S-expression parsing requirements. The namespace is  
/// automatically converted from filesystem-style paths to proper S-expressions.  
///   
/// # Arguments  
/// * `token` - Authentication token containing user permissions and namespace scope  
/// * `path` - Hierarchical namespace path (e.g., "/parent/child/")  
/// * `data` - Raw data stream containing MeTTa expressions, JSON, or CSV content  
///   
/// # Returns  
/// * `Ok(Json<String>)` - Success response from MORK server  
/// * `Err(Custom<String>)` - Error with appropriate HTTP status code  
///   
/// # Security  
/// - Validates token permissions for write access  
/// - Ensures upload path is within token's authorized namespace scope  
///   
/// # MORK Integration  
/// Uses the updated UploadRequest with automatic namespace formatting that generates  
/// proper S-expressions compatible with MORK's upload command parsing.  
#[post("/spaces/upload/<path..>", data = "<data>", rank=1)]  
pub async fn upload(  
    token: Token,  
    path: PathBuf,  
    data: Data<'_>,  
) -> Result<Json<String>, Custom<String>> {  
    // Extract and validate token namespace permissions  
    let token_namespace = token.namespace.strip_prefix("/").unwrap();  
    if !path.starts_with(token_namespace) || !token.permission_write {  
        return Err(Custom(Status::Unauthorized, "Unauthorized".to_string()));  
    }  
      
    // Read request body with size limit (20MB max)  
    let mut body = String::new();  
    if let Err(e) = data.open(rocket::data::ByteUnit::Mebibyte(20)).read_to_string(&mut body).await {  
        eprintln!("Failed to read body: {e}");  
        return Err(Custom(Status::BadRequest, format!("Failed to read body: {e}")));  
    }  
  
    // Create upload request with automatic namespace formatting  
    // by convert the filesystem-style path to proper S-expressions
    // using the get_formatted_template() method  
    let mork_api_client = MorkApiClient::new();  
    let request = UploadRequest::new()  
        .namespace(path)                  
        .pattern("$x".to_string())         
        .template("$x".to_string())         
        .data(body);                         
  
    // Dispatch to MORK server with properly formatted namespace expressions  
    match mork_api_client.dispatch(request).await {  
        Ok(text) => Ok(Json(text)),  
        Err(e) => Err(Custom(Status::InternalServerError, format!("Failed to contact backend: {e}"))),  
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