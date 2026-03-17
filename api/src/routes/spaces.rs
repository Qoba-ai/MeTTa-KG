use core::str;
use rocket::serde::json::{Json, serde_json};
use rocket::{http::Status, put};
use rocket::State;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::File;
use std::io::prelude::*;
use tokio::sync::broadcast;
use uuid::Uuid;

use rocket::{get, post};
use std::path::PathBuf;
use urlencoding::encode;

use crate::{events::{EventBus, SpaceEvent}, model::Token, routes::path_to_metta_sexpr};

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
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !token.permission_read || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    if transformation.input_spaces.len() != transformation.patterns.len() ||
       transformation.output_spaces.len() != transformation.templates.len() {
        return Err(Status::BadRequest);
    }

    for path in &transformation.input_spaces {
        if !path.starts_with(&token_namespace) {
            return Err(Status::Unauthorized);
        }
    }
    for path in &transformation.output_spaces {
        if !path.starts_with(&token_namespace) {
            return Err(Status::Unauthorized);
        }
    }

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');

    let mut effective_patterns = Vec::new();
    for (path, pattern) in transformation.input_spaces.iter().zip(transformation.patterns.iter()) {
        let path_sexpr = path_to_metta_sexpr(path);
        effective_patterns.push(path_sexpr.replace("$x", pattern));
    }

    let mut effective_templates = Vec::new();
    for (path, template) in transformation.output_spaces.iter().zip(transformation.templates.iter()) {
        let path_sexpr = path_to_metta_sexpr(path);
        effective_templates.push(path_sexpr.replace("$x", template));
    }

    // MORK multi-transform body:
    // (transform (, (p1) (p2) ...) (, (t1) (t2) ...) )
    let transform_body = format!(
        "(transform (, {}) (, {}) )",
        effective_patterns.join(" "),
        effective_templates.join(" ")
    );

    println!("Sending MORK transform: {}", transform_body);

    let mork_transform_url = format!("{}/transform", mork_base);

    let client = reqwest::Client::new();
    let resp = client
        .post(mork_transform_url)
        .body(transform_body)
        .send()
        .await;

    match resp {
        Ok(resp) => {
            let status = resp.status();
            let data = resp.text().await.unwrap_or_default();
            println!("MORK transform response ({}): {}", status, data);
            if status.is_success() {
                Ok(Json(true))
            } else {
                Err(Status::InternalServerError)
            }
        }
        Err(e) => {
            eprintln!("Error sending MORK transform request: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[post("/spaces", data = "<space>")]
pub async fn import_root(token: Token, space: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    do_import(&token, &PathBuf::new(), &space, &bus.0).await
}

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(token: Token, path: PathBuf, space: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    do_import(&token, &path, &space, &bus.0).await
}

fn path_to_event_path(path: &PathBuf) -> String {
    let s = path.to_string_lossy();
    if s.is_empty() {
        "/".to_string()
    } else {
        format!("/{}/", s)
    }
}

pub async fn do_import(
    token: &Token,
    path: &PathBuf,
    space: &str,
    bus: &broadcast::Sender<SpaceEvent>,
) -> Result<Json<bool>, Status> {
    if !path.starts_with(&token.namespace.strip_prefix('/').unwrap_or(&token.namespace)) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);

    let mut file = File::create(&file_path).unwrap();
    if let Err(e) = file.write_all(space.as_bytes()) {
        eprintln!("Error saving file for MORK import request: {}", e);
        return Err(Status::InternalServerError);
    }
    drop(file);
    println!("Successfully wrote MeTTa string to file {}", &file_path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();

    let pattern = String::from("$x");
    let template = path_to_metta_sexpr(&path);
    let uri = format!("{}/public/{}.metta", origin, file_id);

    let mork_import_url = format!(
        "{}/import/{}/{}?uri={}",
        mork_base,
        encode(&pattern),
        encode(&template),
        encode(&uri)
    );

    let event_path = path_to_event_path(path);
    let _ = bus.send(SpaceEvent::Locked { path: event_path.clone() });

    let resp = reqwest::get(mork_import_url).await;

    let data = match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK import returned error status: {}", resp.status());
                let _ = bus.send(SpaceEvent::Unlocked { path: event_path });
                return Err(Status::InternalServerError);
            }
            resp.text().await
        }
        Err(e) => {
            eprintln!("Error sending MORK import request: {}", e);
            let _ = bus.send(SpaceEvent::Unlocked { path: event_path });
            return Err(Status::InternalServerError);
        }
    };

    let _ = bus.send(SpaceEvent::Unlocked { path: event_path });

    match data {
        Ok(data) => {
            println!("MORK import request response text: {}", data);
            Ok(Json(true))
        }
        Err(e) => {
            eprintln!(
                "Error converting MORK import request response to textual string: {}",
                e
            );
            return Err(Status::InternalServerError);
        }
    }
}

#[get("/spaces")]
pub async fn export_root(token: Token) -> Result<Json<String>, Status> {
    export(token, PathBuf::new()).await
}

#[get("/spaces/<path..>")]
pub async fn export(token: Token, path: PathBuf) -> Result<Json<String>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let pattern = path_to_metta_sexpr(&path);
    let template = String::from("$x");

    let mork_export_url = format!("{}/export/{}/{}", mork_base, encode(&pattern), encode(&template));

    println!("{}", mork_export_url);

    let resp = reqwest::get(mork_export_url).await;

    let data = match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK export returned error status: {}", resp.status());
                return Err(Status::InternalServerError);
            }
            resp.text().await
        }
        Err(e) => {
            eprintln!("Error sending MORK export request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    match data {
        Ok(data) => {
            println!("MORK export request response text length: {}", data.len());
            Ok(Json(data))
        }
        Err(e) => {
            eprintln!(
                "Error converting MORK export request response to textual string: {}",
                e
            );
            return Err(Status::InternalServerError);
        }
    }
}

#[get("/busywait/<millis>/<path..>?<writer>")]
pub async fn busywait(
    token: Token,
    millis: u64,
    path: PathBuf,
    writer: Option<bool>,
) -> Result<Json<String>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) {
        return Err(Status::Unauthorized);
    }

    let is_writer = writer.unwrap_or(false);

    if is_writer && !token.permission_write {
        return Err(Status::Unauthorized);
    } else if !is_writer && !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path_to_metta_sexpr(&path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');

    let mut mork_busywait_url = format!(
        "{}/busywait/{}/?expr1={}",
        mork_base,
        millis,
        urlencoding::encode(&path_serialized)
    );

    if is_writer {
        mork_busywait_url.push_str("&writer1");
    }

    println!("{}", mork_busywait_url);

    let resp = reqwest::get(mork_busywait_url).await;

    let data = match resp {
        Ok(resp) => resp.text().await,
        Err(e) => {
            eprintln!("Error sending MORK busywait request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    match data {
        Ok(data) => {
            println!("MORK busywait request response text: {}", data);
            Ok(Json(data))
        }
        Err(e) => {
            eprintln!(
                "Error converting MORK busywait request response to textual string: {}",
                e
            );
            return Err(Status::InternalServerError);
        }
    }
}

#[rocket::delete("/spaces")]
pub async fn clear_root(token: Token) -> Result<Json<bool>, Status> {
    clear(token, PathBuf::new()).await
}

#[rocket::delete("/spaces/<path..>")]
pub async fn clear(token: Token, path: PathBuf) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path_to_metta_sexpr(&path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let mork_clear_url = format!("{}/clear/{}", mork_base, urlencoding::encode(&path_serialized));

    println!("{}", mork_clear_url);

    let resp = reqwest::get(mork_clear_url).await;

    match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK clear returned error status: {}", resp.status());
                return Err(Status::InternalServerError);
            }
            Ok(Json(true))
        }
        Err(e) => {
            eprintln!("Error sending MORK clear request: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[rocket::post("/spaces/<src_path..>?<dst_path>", rank = 1)]
pub async fn copy(token: Token, src_path: PathBuf, dst_path: String) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    let dst_path_buf = PathBuf::from(&dst_path);

    if !src_path.starts_with(&token_namespace) || !dst_path_buf.starts_with(&token_namespace) {
        return Err(Status::Unauthorized);
    }

    if !token.permission_read || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let src_path_serialized = path_to_metta_sexpr(&src_path);
    let dst_path_serialized = path_to_metta_sexpr(&dst_path_buf);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let mork_copy_url = format!(
        "{}/copy/{}/{}",
        mork_base,
        urlencoding::encode(&src_path_serialized),
        urlencoding::encode(&dst_path_serialized)
    );

    println!("{}", mork_copy_url);

    let resp = reqwest::get(mork_copy_url).await;

    match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK copy returned error status: {}", resp.status());
                return Err(Status::InternalServerError);
            }
            Ok(Json(true))
        }
        Err(e) => {
            eprintln!("Error sending MORK copy request: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[get("/explore?<focus_token>")]
pub async fn explore_root(token: Token, focus_token: Option<String>) -> Result<Json<String>, Status> {
    explore(token, PathBuf::new(), focus_token).await
}

#[rocket::get("/explore/<path..>?<focus_token>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    focus_token: Option<String>,
) -> Result<Json<String>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path_to_metta_sexpr(&path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');

    let focus = focus_token.unwrap_or_else(|| String::from(""));
    let mork_explore_url = if focus.is_empty() {
        format!(
            "{}/explore/{}//",
            mork_base,
            urlencoding::encode(&path_serialized)
        )
    } else {
        format!(
            "{}/explore/{}/{}",
            mork_base,
            urlencoding::encode(&path_serialized),
            urlencoding::encode(&focus)
        )
    };

    println!("{}", mork_explore_url);

    let resp = reqwest::get(mork_explore_url).await;

    let data = match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK explore returned error status: {}", resp.status());
                return Ok(Json(String::from("[]")));
            }
            resp.text().await
        }
        Err(e) => {
            eprintln!("Error sending MORK explore request: {}", e);
            return Ok(Json(String::from("[]")));
        }
    };

    match data {
        Ok(data) => {
            println!("MORK explore request response text length: {}", data.len());
            Ok(Json(data))
        }
        Err(e) => {
            eprintln!(
                "Error converting MORK explore request response to textual string: {}",
                e
            );
            return Err(Status::InternalServerError);
        }
    }
}

#[get("/count")]
pub async fn count_root(token: Token) -> Result<Json<usize>, Status> {
    count(token, PathBuf::new()).await
}

#[get("/count/<path..>")]
pub async fn count(token: Token, path: PathBuf) -> Result<Json<usize>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path_to_metta_sexpr(&path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    
    let mork_count_url = format!("{}/count/{}", mork_base, urlencoding::encode(&path_serialized));
    println!("Requesting MORK count: {}", mork_count_url);

    let resp = reqwest::get(mork_count_url).await;
    match resp {
        Ok(resp) if resp.status().is_success() => {
            // Success, now poll for status
            let mork_status_url = format!("{}/status/{}", mork_base, urlencoding::encode(&path_serialized));
            
            // Poll up to 10 times with 100ms delay
            for _ in 0..10 {
                rocket::tokio::time::sleep(rocket::tokio::time::Duration::from_millis(100)).await;
                let status_resp = reqwest::get(&mork_status_url).await;
                if let Ok(status_resp) = status_resp {
                    if let Ok(status_text) = status_resp.text().await {
                        // MORK status returns JSON like {"status": "countResult", "count": 123}
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&status_text) {
                            if json["status"] == "countResult" {
                                if let Some(count) = json["count"].as_u64() {
                                    return Ok(Json(count as usize));
                                }
                            }
                        }
                    }
                }
            }
            eprintln!("MORK count timed out or returned unexpected status");
            Err(Status::InternalServerError)
        }
        Ok(resp) => {
            eprintln!("MORK count returned error status: {}", resp.status());
            Err(Status::InternalServerError)
        }
        Err(e) => {
            eprintln!("Error sending MORK count request: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[post("/spaces/import/csv/<path..>?<parse_parameters..>", data = "<file>")]
pub async fn import_csv(
    token: Token,
    path: PathBuf,
    file: rocket::fs::TempFile<'_>,
    parse_parameters: crate::routes::translations::CSVParserParameters,
    bus: &State<EventBus>,
) -> Result<Json<bool>, Status> {
    let space = crate::routes::translations::create_from_csv(file, parse_parameters).await?.into_inner();
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
    let space = crate::routes::translations::create_from_nt(file, parse_parameters).await?.into_inner();
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
    let space = crate::routes::translations::create_from_jsonld(file, parse_parameters).await?.into_inner();
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
    let space = crate::routes::translations::create_from_n3(file, parse_parameters).await?.into_inner();
    do_import(&token, &path, &space, &bus.0).await
}

async fn fetch_url_bytes(url: &str) -> Result<Vec<u8>, Status> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| {
            eprintln!("Error fetching URL '{}': {}", url, e);
            Status::BadRequest
        })?;
    if !resp.status().is_success() {
        eprintln!("URL fetch returned error status: {}", resp.status());
        return Err(Status::BadRequest);
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| {
            eprintln!("Error reading URL response bytes: {}", e);
            Status::InternalServerError
        })
}

async fn do_import_from_url(
    token: &Token,
    path: &PathBuf,
    url: &str,
    bus: &broadcast::Sender<SpaceEvent>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let pattern = String::from("$x");
    let template = path_to_metta_sexpr(path);
    let mork_import_url = format!(
        "{}/import/{}/{}?uri={}",
        mork_base,
        encode(&pattern),
        encode(&template),
        encode(url)
    );

    println!("MORK import from URL: {}", mork_import_url);

    let event_path = path_to_event_path(path);
    let _ = bus.send(SpaceEvent::Locked { path: event_path.clone() });

    let resp = reqwest::get(mork_import_url).await;
    let result = match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK import returned error: {}", resp.status());
                Err(Status::InternalServerError)
            } else {
                Ok(Json(true))
            }
        }
        Err(e) => {
            eprintln!("Error sending MORK import from URL request: {}", e);
            Err(Status::InternalServerError)
        }
    };
    let _ = bus.send(SpaceEvent::Unlocked { path: event_path });
    result
}

#[get("/spaces/import/url/metta/<path..>?<url>")]
pub async fn import_url_metta(token: Token, path: PathBuf, url: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    do_import_from_url(&token, &path, &url, &bus.0).await
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
pub async fn import_url_nt(token: Token, path: PathBuf, url: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "nt",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: Some(crate::routes::translations::NTParserParameters { dummy: String::new() }),
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/spaces/import/url/jsonld/<path..>?<url>")]
pub async fn import_url_jsonld(token: Token, path: PathBuf, url: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "jsonld",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: Some(crate::routes::translations::JSONLDParserParameters { dummy: String::new() }),
            n3_parameters: None,
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/spaces/import/url/n3/<path..>?<url>")]
pub async fn import_url_n3(token: Token, path: PathBuf, url: String, bus: &State<EventBus>) -> Result<Json<bool>, Status> {
    let bytes = fetch_url_bytes(&url).await?;
    let space = crate::routes::translations::create_from_bytes(
        "n3",
        bytes,
        crate::routes::translations::ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: Some(crate::routes::translations::N3ParserParameters { dummy: String::new() }),
        },
    )
    .await?;
    do_import(&token, &path, &space, &bus.0).await
}

#[get("/status")]
pub async fn status_root(token: Token) -> Result<Json<serde_json::Value>, Status> {
    status(token, PathBuf::new()).await
}

#[get("/status/<path..>")]
pub async fn status(token: Token, path: PathBuf) -> Result<Json<serde_json::Value>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    if !path.starts_with(&token_namespace) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path_to_metta_sexpr(&path);

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');
    let mork_status_url = format!("{}/status/{}", mork_base, urlencoding::encode(&path_serialized));

    println!("{}", mork_status_url);

    let resp = reqwest::get(mork_status_url).await;

    match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK status returned error status: {}", resp.status());
                return Err(Status::InternalServerError);
            }
            let text = resp.text().await.unwrap_or_default();
            match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(json) => Ok(Json(json)),
                Err(e) => {
                    eprintln!("Error parsing MORK status response as JSON: {}", e);
                    Err(Status::InternalServerError)
                }
            }
        }
        Err(e) => {
            eprintln!("Error sending MORK status request: {}", e);
            Err(Status::InternalServerError)
        }
    }
}
