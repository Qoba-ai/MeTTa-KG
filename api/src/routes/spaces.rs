use rocket::serde::json::{serde_json, Json};
use rocket::State;
use rocket::{get, http::Status, post, put};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::File;
use std::io::prelude::*;
use std::path::PathBuf;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    events::{EventBus, SpaceEvent},
    model::Token,
};
use mork_client::{ExploreResult, MorkClient, MorkError, NamespaceInfo, Permission};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn permission_from_token(token: &Token) -> Permission {
    let namespace = token
        .namespace
        .strip_prefix('/')
        .unwrap_or(&token.namespace)
        .to_string();
    Permission::new(namespace, token.permission_read, token.permission_write)
}

fn mork_error_to_status(e: MorkError) -> Status {
    match e {
        MorkError::Permission(_) => Status::Unauthorized,
        _ => Status::InternalServerError,
    }
}

fn get_mork_client() -> MorkClient {
    MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap())
}

fn path_to_event_path(path: &PathBuf) -> String {
    let s = path.to_string_lossy();
    if s.is_empty() {
        "/".to_string()
    } else {
        format!("/{}/", s)
    }
}

// ─── Transform ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Transformation {
    input_spaces: Vec<PathBuf>,
    output_spaces: Vec<PathBuf>,
    patterns: Vec<String>,
    templates: Vec<String>,
}

#[put("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    if transformation.input_spaces.len() != transformation.patterns.len()
        || transformation.output_spaces.len() != transformation.templates.len()
    {
        return Err(Status::BadRequest);
    }

    let perm = permission_from_token(&token);
    let input: Vec<(&std::path::Path, &str)> = transformation
        .input_spaces
        .iter()
        .zip(transformation.patterns.iter())
        .map(|(p, pat)| (p.as_path(), pat.as_str()))
        .collect();
    let output: Vec<(&std::path::Path, &str)> = transformation
        .output_spaces
        .iter()
        .zip(transformation.templates.iter())
        .map(|(p, tmpl)| (p.as_path(), tmpl.as_str()))
        .collect();

    get_mork_client()
        .transform(&perm, &input, &output)
        .await
        .map(|_| Json(true))
        .map_err(mork_error_to_status)
}

// ─── Import ──────────────────────────────────────────────────────────────────

#[post("/spaces", data = "<space>")]
pub async fn import_root(
    token: Token,
    space: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    do_import(&token, &PathBuf::new(), &space, &bus.0).await
}

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(
    token: Token,
    path: PathBuf,
    space: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    do_import(&token, &path, &space, &bus.0).await
}

pub async fn do_import(
    token: &Token,
    path: &PathBuf,
    space: &str,
    bus: &broadcast::Sender<SpaceEvent>,
) -> Result<Json<bool>, Status> {
    let perm = permission_from_token(token);

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);
    let mut file = File::create(&file_path).map_err(|e| {
        eprintln!("Error creating temp file: {}", e);
        Status::InternalServerError
    })?;
    file.write_all(space.as_bytes()).map_err(|e| {
        eprintln!("Error writing temp file: {}", e);
        Status::InternalServerError
    })?;
    drop(file);

    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();
    let uri = format!("{}/public/{}.metta", origin, file_id);

    let event_path = path_to_event_path(path);
    let _ = bus.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });

    let result = get_mork_client().import(&perm, path, &uri).await;
    let _ = bus.send(SpaceEvent::Unlocked { path: event_path });

    result.map(|_| Json(true)).map_err(mork_error_to_status)
}

// ─── Export ──────────────────────────────────────────────────────────────────

#[get("/spaces")]
pub async fn export_root(token: Token) -> Result<Json<String>, Status> {
    export(token, PathBuf::new()).await
}

#[get("/spaces/<path..>")]
pub async fn export(token: Token, path: PathBuf) -> Result<Json<String>, Status> {
    get_mork_client()
        .export(&permission_from_token(&token), &path)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Clear ───────────────────────────────────────────────────────────────────

#[rocket::delete("/spaces?<pattern>")]
pub async fn clear_root(token: Token, pattern: Option<String>) -> Result<Json<bool>, Status> {
    clear(token, PathBuf::new(), pattern).await
}

#[rocket::delete("/spaces/<path..>?<pattern>")]
pub async fn clear(token: Token, path: PathBuf, pattern: Option<String>) -> Result<Json<bool>, Status> {
    get_mork_client()
        .clear(&permission_from_token(&token), &path, pattern.as_deref())
        .await
        .map(|_| Json(true))
        .map_err(mork_error_to_status)
}

// ─── Copy ────────────────────────────────────────────────────────────────────

#[rocket::post("/spaces/<src_path..>?<dst_path>", rank = 1)]
pub async fn copy(token: Token, src_path: PathBuf, dst_path: String) -> Result<Json<bool>, Status> {
    get_mork_client()
        .copy(
            &permission_from_token(&token),
            &src_path,
            &PathBuf::from(&dst_path),
        )
        .await
        .map(|_| Json(true))
        .map_err(mork_error_to_status)
}

// ─── Explore ─────────────────────────────────────────────────────────────────

#[get("/explore?<focus_token>")]
pub async fn explore_root(
    token: Token,
    focus_token: String,
) -> Result<Json<ExploreResult>, Status> {
    explore(token, PathBuf::new(), focus_token).await
}

#[rocket::get("/explore/<path..>?<focus_token>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    focus_token: String,
) -> Result<Json<ExploreResult>, Status> {
    let perm = permission_from_token(&token);

    get_mork_client()
        .explore(&perm, &path, &focus_token)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

#[rocket::get("/namespaces/<path..>")]
pub async fn explore_namespaces(
    token: Token,
    path: PathBuf,
) -> Result<Json<NamespaceInfo>, Status> {
    let perm = permission_from_token(&token);

    get_mork_client()
        .explore_namespaces(&perm, &path)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Count ───────────────────────────────────────────────────────────────────

#[get("/count")]
pub async fn count_root(token: Token) -> Result<Json<usize>, Status> {
    count(token, PathBuf::new()).await
}

#[get("/count/<path..>")]
pub async fn count(token: Token, path: PathBuf) -> Result<Json<usize>, Status> {
    get_mork_client()
        .count(&permission_from_token(&token), &path)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Status ──────────────────────────────────────────────────────────────────

#[get("/status")]
pub async fn status_root(token: Token) -> Result<Json<serde_json::Value>, Status> {
    status(token, PathBuf::new()).await
}

#[get("/status/<path..>")]
pub async fn status(token: Token, path: PathBuf) -> Result<Json<serde_json::Value>, Status> {
    get_mork_client()
        .status(&permission_from_token(&token), &path)
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Busywait ────────────────────────────────────────────────────────────────

#[get("/busywait/<millis>/<path..>?<writer>")]
pub async fn busywait(
    token: Token,
    millis: u64,
    path: PathBuf,
    writer: Option<bool>,
) -> Result<Json<String>, Status> {
    get_mork_client()
        .busywait(
            &permission_from_token(&token),
            &path,
            millis,
            writer.unwrap_or(false),
        )
        .await
        .map(Json)
        .map_err(mork_error_to_status)
}

// ─── Import from uploaded files ───────────────────────────────────────────────

#[post("/spaces/import/csv/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_csv(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::CSVParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let space = crate::routes::translations::create_from_csv(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0).await
}

#[post("/spaces/import/nt/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_nt(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::NTParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let space = crate::routes::translations::create_from_nt(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0).await
}

#[post("/spaces/import/jsonld/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_jsonld(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::JSONLDParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let space = crate::routes::translations::create_from_jsonld(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0).await
}

#[post("/spaces/import/n3/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_n3(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::N3ParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let space = crate::routes::translations::create_from_n3(file, parse_parameters)
        .await?
        .into_inner();
    do_import(&token, &path, &space, &bus.0).await
}

// ─── Import from URL ─────────────────────────────────────────────────────────

async fn fetch_url_bytes(url: &str) -> Result<Vec<u8>, Status> {
    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| {
        eprintln!("Error fetching URL '{}': {}", url, e);
        Status::BadRequest
    })?;
    if !resp.status().is_success() {
        eprintln!("URL fetch returned error status: {}", resp.status());
        return Err(Status::BadRequest);
    }
    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| {
        eprintln!("Error reading URL response bytes: {}", e);
        Status::InternalServerError
    })
}

#[get("/spaces/import/url/metta/<path..>?<url>")]
pub async fn import_url_metta(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let perm = permission_from_token(&token);
    let event_path = path_to_event_path(&path);
    let _ = bus.0.send(SpaceEvent::Locked {
        path: event_path.clone(),
    });
    let result = get_mork_client().import(&perm, &path, &url).await;
    let _ = bus.0.send(SpaceEvent::Unlocked { path: event_path });
    result.map(|_| Json(true)).map_err(mork_error_to_status)
}

#[get("/spaces/import/url/csv/<path..>?<url>&<parse_parameters..>")]
pub async fn import_url_csv(
    token: Token,
    path: PathBuf,
    url: String,
    parse_parameters: crate::routes::translations::CSVParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "csv",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: Some(parse_parameters),
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/spaces/import/url/nt/<path..>?<url>")]
pub async fn import_url_nt(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "nt",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: Some(crate::routes::translations::NTParserParameters {
                dummy: String::new(),
            }),
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/spaces/import/url/jsonld/<path..>?<url>")]
pub async fn import_url_jsonld(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "jsonld",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: Some(crate::routes::translations::JSONLDParserParameters {
                dummy: String::new(),
            }),
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/spaces/import/url/n3/<path..>?<url>")]
pub async fn import_url_n3(
    token: Token,
    path: PathBuf,
    url: String,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "n3",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: Some(crate::routes::translations::N3ParserParameters {
                dummy: String::new(),
            }),
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}
