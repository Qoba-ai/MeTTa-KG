use chrono::format;
use core::str;
use diesel::{ExpressionMethods, RunQueryDsl};
use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::env;
use std::fs::File;
use std::io::prelude::*;
use uuid::Uuid;

use rocket::{get, post};
use std::path::PathBuf;
use urlencoding::encode;

use crate::{db::establish_connection, model::Token};

#[derive(Serialize, Deserialize, Clone)]
pub struct Transformation {
    input_space: PathBuf,
    output_space: PathBuf,
    pattern: String,
    template: String,
}

#[post("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

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

    let input_path_serialized = input_space_path.into_os_string().into_string().unwrap();

    let output_path_serialized = output_space_path.into_os_string().into_string().unwrap();

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();

    let mork_transform_url = format!(
        "{}/transform/{}/{}/{}/{}",
        mork_url,
        encode(&input_path_serialized),
        encode(&output_path_serialized),
        encode(&pattern),
        encode(&template)
    );

    let resp = reqwest::get(mork_transform_url).await;

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

#[post("/spaces/<path..>", data = "<space>")]
pub async fn import(token: Token, path: PathBuf, space: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(&token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);

    let file = File::create(&file_path);

    let write_result = match file {
        Ok(mut a) => a.write_all(space.as_bytes()),
        Err(e) => {
            eprintln!("Error saving file for MORK import request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    match write_result {
        Ok(_) => println!("Successfully wrote MeTTa string to file {}", &file_path),
        Err(e) => {
            eprintln!("Error writing to file for MORK import request: {}", e);
            return Err(Status::InternalServerError);
        }
    }

    let path_serialized = path.into_os_string().into_string().unwrap();

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();

    let import_file_url = format!("{}/public/{}.metta", origin, file_id);

    let mork_import_url = format!(
        "{}/import/{}?uri={}",
        mork_url, path_serialized, import_file_url
    );

    let resp = reqwest::get(mork_import_url).await;

    let data = match resp {
        Ok(resp) => resp.text().await,
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

#[get("/spaces/<path..>")]
pub async fn read(token: Token, path: PathBuf) -> Result<Json<String>, Status> {
    if !path.starts_with(&token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let path_serialized = path.into_os_string().into_string().unwrap();

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();

    let mork_export_url = format!("{}/export/{}", mork_url, path_serialized);

    let resp = reqwest::get(mork_export_url).await;

    let data = match resp {
        Ok(resp) => resp.text().await,
        Err(e) => {
            eprintln!("Error sending MORK export request: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    match data {
        Ok(data) => {
            println!("MORK export request response text: {}", data);
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
