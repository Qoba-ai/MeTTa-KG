use core::str;
use rocket::http::Status;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::prelude::*;
use std::{env, path::Path};
use uuid::Uuid;

use rocket::{get, patch, post};
use std::path::{Component, PathBuf};

use crate::model::Token;

#[derive(Serialize, Deserialize, Clone)]
pub struct Transformation {
    input_space: PathBuf,
    output_space: PathBuf,
    pattern: String,
    template: String,
}

fn path_to_expr(path: &Path) -> String {
    let components: Vec<_> = path.components().collect();
    path_components_to_expr(&components)
}

fn path_components_to_expr(components: &[Component]) -> String {
    if components.is_empty() {
        return "$s".to_string();
    }

    let head = match components[0] {
        Component::Normal(ref s) => s.to_string_lossy().to_string(),
        _ => String::new(),
    };

    let tail = path_components_to_expr(&components[1..]);

    return format!("({} {})", head, tail);
}

#[post("/spaces", data = "<transformation>")]
pub async fn transform(
    token: Token,
    transformation: Json<Transformation>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace;

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

    let prepended_path_1 = Path::new("/root/").join(input_space_path.strip_prefix("/").unwrap());

    let iter = prepended_path_1
        .strip_prefix("/")
        .unwrap()
        .iter()
        .map(|x| x.to_str().unwrap().to_string())
        .chain(vec![pattern])
        .rev();

    let pat = iter.clone().enumerate().fold("".to_string(), |a, (i, s)| {
        if i == 0 {
            format!("{} {}", s, a)
        } else {
            format!("({} {})", s, a)
        }
    });

    let prepended_path_2 = Path::new("/root/").join(output_space_path.strip_prefix("/").unwrap());

    let iter2 = prepended_path_2
        .strip_prefix("/")
        .unwrap()
        .iter()
        .map(|x| x.to_str().unwrap().to_string())
        .chain(vec![template])
        .rev();

    let tmp = iter2.clone().enumerate().fold("".to_string(), |a, (i, s)| {
        if i == 0 {
            format!("{} {}", s, a)
        } else {
            format!("({} {})", s, a)
        }
    });

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();

    let mork_transform_url: String = format!("{}/transform_multi_multi", mork_url,);

    let client = reqwest::Client::new();

    println!("pattern: {}\ntemplate: {}\n", pat, tmp);

    let resp = client
        .post(mork_transform_url.clone())
        .body(format!(
            "
        (transform
            (, {})
            (, {})
        )
        ",
            pat, tmp
        ))
        .send()
        .await;

    println!(
        "The body: {}",
        format!(
            "
    (transform
        (, {})
        (, {})
    )
    ",
            pat, tmp
        )
    );

    println!("mork_transform_url: {}", mork_transform_url);

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

#[patch("/spaces/<path..>", data = "<space>")]
pub async fn import(token: Token, path: PathBuf, space: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(&token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let file_id = Uuid::new_v4();
    let file_path = format!("static/{}.metta", file_id);

    let file = File::create(&file_path);

    let write_result = match file {
        Ok(mut a) => a.write_all(space.trim().to_string().as_bytes()),
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

    let file_expr = "$s".to_string();

    let prepended_path = Path::new("/root/").join(path);
    let in_expr = path_to_expr(&prepended_path.strip_prefix("/").unwrap());

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();
    let origin = env::var("METTA_KG_ORIGIN_URL").unwrap();

    let import_file_url = format!("{}/public/{}.metta", origin, file_id);

    let mork_import_url = format!(
        "{}/import/{}/{}/?uri={}",
        mork_url, file_expr, in_expr, import_file_url
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

    let prepended_path = Path::new("/root/").join(path);

    let expr = path_to_expr(&prepended_path.strip_prefix("/").unwrap());

    let mork_url = env::var("METTA_KG_MORK_URL").unwrap();

    let mork_export_url = format!("{}/export/{}/{}", mork_url, expr, "$s");

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
            Ok(Json(data.trim().to_string()))
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
