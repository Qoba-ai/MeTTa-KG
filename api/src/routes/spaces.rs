use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::tokio::io::AsyncReadExt;
use serde::{Deserialize, Serialize};
use url::Url;

use rocket::response::status::Custom;
use rocket::{get, post, Data};
use std::path::PathBuf;

use crate::model::Token;
use crate::mork_api::{
    ClearRequest, ExploreRequest, ExportFormat, ExportRequest, ImportRequest, MorkApiClient,
    ReadRequest, Request, TransformDetails, TransformRequest, UploadRequest,
};

/// The input for a transformation operation.
/// see mm2 operations for more    // TODO: Add links
#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Mm2InputMulti {
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Mm2Input {
    pub pattern: String,
    pub template: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

/// Fetches the `<path..>` space content. Use cautously as it will load everything.
/// It is recommended to use the `/spaces/<path..>?op=explore` instead for large queries
#[get("/spaces/<path..>", rank = 1)]
pub async fn read(token: Token, path: PathBuf) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ReadRequest::new().namespace(path);

    let response = mork_api_client.dispatch(request).await.map(Json);
    response
}

/// Performs a transformation operation on the `<path..>` space
#[post("/spaces/transform/<path..>", data = "<mm2>")]
pub async fn transform(
    token: Token,
    path: PathBuf,
    mm2: Json<Mm2InputMulti>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

    if !path.starts_with(token_namespace) || !token.permission_read || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new()
        .namespace(path.to_path_buf())
        .transform_input(
            TransformDetails::new()
                .patterns(mm2.patterns.clone())
                .templates(mm2.templates.clone()),
        );

    // TODO: use server sent events instead
    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

/// Upload to the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/upload/<path..>", data = "<data>")]
pub async fn upload(
    token: Token,
    path: PathBuf,
    data: Data<'_>,
) -> Result<Json<String>, Custom<String>> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Custom(Status::Unauthorized, "Unauthorized".to_string()));
    }

    let mut body = String::new();
    if let Err(e) = data
        .open(rocket::data::ByteUnit::Mebibyte(20))
        .read_to_string(&mut body)
        .await
    {
        eprintln!("Failed to read body: {e}");
        return Err(Custom(
            Status::BadRequest,
            format!("Failed to read body: {e}"),
        ));
    }

    let pattern = "$x";
    let namespace = crate::mork_api::Namespace::from(path.clone());
    let template = namespace.with_namespace("$x");

    let mork_api_client = MorkApiClient::new();
    let request = UploadRequest::new()
        .namespace(path)
        .pattern(pattern.to_string())
        .template(template)
        .data(body);

    match mork_api_client.dispatch(request).await {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(Custom(
            Status::InternalServerError,
            format!("Failed to contact backend: {e}"),
        )),
    }
}

/// Imports data from `<uri>` into the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/import/<path..>?<uri>")]
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

/// Performs an explore operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/explore/<path..>", data = "<explore_input>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    explore_input: Json<ExploreInput>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExploreRequest::new()
        .namespace(path)
        .pattern(explore_input.pattern.clone())
        .token(explore_input.token.clone());

    println!("explore path: {:?}", request.path());

    let response = mork_api_client.dispatch(request).await.map(Json);
    println!("explore response: {response:?}");
    response
}

/// Performs an export operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/export/<path..>", data = "<export_input>")]
pub async fn export(
    token: Token,
    path: PathBuf,
    export_input: Json<Mm2Input>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExportRequest::new()
        .namespace(path)
        .pattern(export_input.pattern.clone())
        .template(export_input.template.clone())
        .format(ExportFormat::Metta);

    println!("Dispatching export request to Mork: {}", request.path());

    match mork_api_client.dispatch(request).await {
        Ok(data) => {
            println!("Received export response from Mork: {data:?}");
            Ok(Json(data))
        }
        Err(e) => Err(e),
    }
}

#[post("/spaces/clear/<path..>")]
pub async fn clear(token: Token, path: PathBuf) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    // TODO: pass a pattern instead of the whole namespace
    let request = ClearRequest::new().namespace(path).expr("$x".to_string());

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}
