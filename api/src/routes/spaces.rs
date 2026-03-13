use core::str;
use rocket::serde::json::Json;
use rocket::{http::Status, put};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::File;
use std::io::prelude::*;
use uuid::Uuid;

use rocket::{get, post};
use std::path::PathBuf;
use urlencoding::encode;

use crate::{model::Token, routes::path_to_metta_sexpr};

#[derive(Serialize, Deserialize, Clone)]
pub struct Transformation {
    input_space: PathBuf,
    output_space: PathBuf,
    pattern: String,
    template: String,
}

#[put("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix('/').unwrap_or(&token.namespace);

    let input_space_path = transformation.input_space.clone();
    let output_space_path = transformation.output_space.clone();
    let pattern = transformation.pattern.clone();
    let template = transformation.template.clone();

    if !input_space_path.starts_with(&token_namespace)
        || !output_space_path.starts_with(&token_namespace)
        || !token.permission_read
        || !token.permission_write
    {
        return Err(Status::Unauthorized);
    }

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let mork_base = mork_url.trim_end_matches('/');

    // Convert paths to sexpr structure
    let input_path_sexpr = path_to_metta_sexpr(&input_space_path);
    let output_path_sexpr = path_to_metta_sexpr(&output_space_path);

    // Nest the user's pattern and template within the path structures.
    // path_to_metta_sexpr returns something like (level (1 $x)), 
    // so we replace $x with the user's expression.
    let effective_pattern = input_path_sexpr.replace("$x", &pattern);
    let effective_template = output_path_sexpr.replace("$x", &template);

    // In MORK, transform body is:
    // (transform (, (pattern0 ...) ) (, (template0 ...) ) )
    let transform_body = format!(
        "(transform (, {}) (, {}) )",
        effective_pattern, effective_template
    );

    let mork_transform_url = format!("{}/transform", mork_base);

    let client = reqwest::Client::new();
    let resp = client
        .post(mork_transform_url)
        .body(transform_body)
        .send()
        .await;

    let data = match resp {
        Ok(resp) => resp.text().await,
        Err(e) => {
            eprintln!("Error sending MORK transform request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    match data {
        Ok(data) => {
            println!("MORK transform request response text: {}", data);
            Ok(Json(true))
        }
        Err(e) => {
            eprintln!(
                "Error converting MORK transform request response to textual string: {}",
                e
            );
            return Err(Status::InternalServerError);
        }
    }
}

#[post("/spaces", data = "<space>")]
pub async fn import_root(token: Token, space: String) -> Result<Json<bool>, Status> {
    import(token, PathBuf::new(), space).await
}

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(token: Token, path: PathBuf, space: String) -> Result<Json<bool>, Status> {
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

    let resp = reqwest::get(mork_import_url).await;

    let data = match resp {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("MORK import returned error status: {}", resp.status());
                return Err(Status::InternalServerError);
            }
            resp.text().await
        }
        Err(e) => {
            eprintln!("Error sending MORK import request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

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

#[rocket::post("/spaces/<src_path..>?<dst_path>")]
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

#[get("/explore/<path..>?<focus_token>")]
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
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
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
