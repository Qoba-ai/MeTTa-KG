use rocket::form::{FromForm, FromFormField};
use rocket::fs::TempFile;
use rocket::http::Status;
use rocket::post;
use rocket::serde::json::Json;
use std::fs;
use std::process::Command;
use uuid::Uuid;

#[derive(FromFormField, Copy, Clone)]
pub enum CSVParseDirection {
    Row = 1,
    Column = 2,
    CellUnlabeled = 3,
    CellLabeled = 4,
}

#[derive(FromForm, Clone)]
pub struct CSVParserParameters {
    pub direction: CSVParseDirection,
    pub delimiter: String,
}

#[derive(FromForm, Clone)]
pub struct NTParserParameters {
    // TODO: figure out how to deal with this normally empty struct
    pub dummy: String,
}

#[derive(FromForm, Clone)]
pub struct N3ParserParameters {
    // TODO: figure out how to deal with this normally empty struct
    pub dummy: String,
}

#[derive(FromForm, Clone)]
pub struct JSONLDParserParameters {
    // TODO: figure out how to deal with this normally empty struct
    pub dummy: String,
}

#[derive(FromForm, Clone)]
pub struct ParserParameters {
    csv_parameters: Option<CSVParserParameters>,
    nt_parameters: Option<NTParserParameters>,
    jsonld_parameters: Option<JSONLDParserParameters>,
    n3_parameters: Option<N3ParserParameters>,
}

pub async fn create(
    ext: &str,
    mut file: TempFile<'_>,
    parse_parameters: ParserParameters,
) -> Result<String, Status> {
    let id = Uuid::new_v4();

    if let Err(e) = fs::create_dir_all("temp") {
        eprintln!("Failed to create temp directory: {}", e);
        return Err(Status::InternalServerError);
    }

    let path = format!("temp/translations-{}", id);

    let path_with_extension = format!("{}.{}", path, ext);

    let result = file.persist_to(&path_with_extension).await;

    match result {
        Ok(_) => (),
        Err(err) => {
            eprintln!("Failed to persist file: {}", err);
            return Err(Status::InternalServerError);
        }
    }

    let status = match parse_parameters {
        ParserParameters {
            csv_parameters: Some(parameters),
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: None,
        } => {
            let direction = (parameters.direction as u8).to_string();
            let delimiter = parameters.delimiter;

            Command::new("python3")
                .arg("translations/src/csv_to_metta_run.py")
                .arg(&path)
                .arg(&direction)
                .arg(&delimiter)
                .status()
        }
        ParserParameters {
            csv_parameters: None,
            nt_parameters: Some(_parameters),
            jsonld_parameters: None,
            n3_parameters: None,
        } => Command::new("python3")
            .arg("translations/src/nt_to_metta_run.py")
            .arg(&path)
            .status(),
        ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: Some(_parameters),
            n3_parameters: None,
        } => Command::new("python3")
            .arg("translations/src/jsonld_to_metta_run.py")
            .arg(&path)
            .status(),
        ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: Some(_parameters),
        } => Command::new("python3")
            .arg("translations/src/n3_to_metta_run.py")
            .arg(&path)
            .status(),
        _ => {
            eprintln!("Invalid parser parameters combination");
            return Err(Status::InternalServerError);
        }
    };

    match status {
        Ok(s) if s.success() => (),
        Ok(s) => {
            eprintln!("Python translation script failed with status: {}", s);
            return Err(Status::InternalServerError);
        }
        Err(e) => {
            eprintln!("Failed to execute python translation script: {}", e);
            return Err(Status::InternalServerError);
        }
    };

    let contents = fs::read_to_string(format!("{}-output.metta", path));

    match contents {
        Ok(contents) => {
            // Clean up files
            let _ = fs::remove_file(&path_with_extension);
            let _ = fs::remove_file(format!("{}-output.metta", path));
            Ok(contents)
        }
        Err(e) => {
            eprintln!("Failed to read translation output: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[post("/translations/csv?<parse_parameters..>", data = "<file>")]
pub async fn create_from_csv(
    file: TempFile<'_>,
    parse_parameters: CSVParserParameters,
) -> Result<Json<String>, Status> {
    println!("Received CSV translation request: direction={:?}, delimiter='{}'", parse_parameters.direction as u8, parse_parameters.delimiter);
    create(
        "csv",
        file,
        ParserParameters {
            csv_parameters: Some(parse_parameters),
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await
    .map(|r| Json(r))
}

#[post("/translations/nt?<parse_parameters..>", data = "<file>")]
pub async fn create_from_nt(
    file: TempFile<'_>,
    parse_parameters: NTParserParameters,
) -> Result<Json<String>, Status> {
    println!("Received NT translation request");
    create(
        "nt",
        file,
        ParserParameters {
            csv_parameters: None,
            nt_parameters: Some(parse_parameters),
            jsonld_parameters: None,
            n3_parameters: None,
        },
    )
    .await
    .map(|r| Json(r))
}

#[post("/translations/jsonld?<parse_parameters..>", data = "<file>")]
pub async fn create_from_jsonld(
    file: TempFile<'_>,
    parse_parameters: JSONLDParserParameters,
) -> Result<Json<String>, Status> {
    println!("Received JSONLD translation request");
    create(
        "jsonld",
        file,
        ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: Some(parse_parameters),
            n3_parameters: None,
        },
    )
    .await
    .map(|r| Json(r))
}

#[post("/translations/n3?<parse_parameters..>", data = "<file>")]
pub async fn create_from_n3(
    file: TempFile<'_>,
    parse_parameters: N3ParserParameters,
) -> Result<Json<String>, Status> {
    println!("Received N3 translation request");
    create(
        "n3",
        file,
        ParserParameters {
            csv_parameters: None,
            nt_parameters: None,
            jsonld_parameters: None,
            n3_parameters: Some(parse_parameters),
        },
    )
    .await
    .map(|r| Json(r))
}
