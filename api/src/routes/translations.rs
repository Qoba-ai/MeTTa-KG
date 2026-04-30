use rocket::form::{FromForm, FromFormField};
use rocket::fs::TempFile;
use rocket::http::Status;
use rocket::serde::json::Json;
use std::fs;
use std::process::Command;
use tracing::{error, info};
use uuid::Uuid;

fn translations_path(script: &str) -> String {
    let base = &crate::config::config().translations_path;
    format!("{}/{}", base.trim_end_matches('/'), script)
}

// ── Form types (query-string parsing only) ────────────────────────────────────

#[derive(FromFormField, Copy, Clone)]
pub enum CsvDirection {
    Row = 1,
    Column = 2,
    CellUnlabeled = 3,
    CellLabeled = 4,
}

#[derive(FromForm, Clone)]
pub struct CsvParams {
    pub direction: CsvDirection,
    pub delimiter: String,
}

// ── Internal format discriminant ──────────────────────────────────────────────

pub enum ParseFormat {
    Csv { direction: u8, delimiter: String },
    Nt,
    JsonLd,
    N3,
}

impl ParseFormat {
    fn ext(&self) -> &'static str {
        match self {
            Self::Csv { .. } => "csv",
            Self::Nt => "nt",
            Self::JsonLd => "jsonld",
            Self::N3 => "n3",
        }
    }

    fn translate(&self, base_path: &str) -> Result<String, Status> {
        match self {
            Self::Csv {
                direction,
                delimiter,
            } => {
                let dir_str = direction.to_string();
                run_python_translation(
                    &translations_path("csv_to_metta_run.py"),
                    base_path,
                    &[dir_str.as_str(), delimiter.as_str()],
                )
            }
            Self::Nt => {
                run_python_translation(&translations_path("nt_to_metta_run.py"), base_path, &[])
            }
            Self::JsonLd => {
                run_python_translation(&translations_path("jsonld_to_metta_run.py"), base_path, &[])
            }
            Self::N3 => {
                run_python_translation(&translations_path("n3_to_metta_run.py"), base_path, &[])
            }
        }
    }
}

// ── Python subprocess translators ─────────────────────────────────────────────

fn run_python_translation(script: &str, path: &str, extra_args: &[&str]) -> Result<String, Status> {
    let mut cmd = Command::new("python");
    cmd.arg(script).arg(path);
    for arg in extra_args {
        cmd.arg(arg);
    }
    match cmd.status() {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, script, "Python translation script failed");
            return Err(Status::InternalServerError);
        }
    }
    let output_path = format!("{}-output.metta", path);
    match fs::read_to_string(&output_path) {
        Ok(contents) => {
            let _ = fs::remove_file(&output_path);
            Ok(contents)
        }
        Err(e) => {
            error!(error = %e, output_path, "Failed to read translation output");
            Err(Status::InternalServerError)
        }
    }
}

// ── Shared entry points ───────────────────────────────────────────────────────

pub async fn create(mut file: TempFile<'_>, fmt: ParseFormat) -> Result<String, Status> {
    if let Err(e) = fs::create_dir_all("temp") {
        error!(error = %e, "Failed to create temp directory");
        return Err(Status::InternalServerError);
    }
    let base_path = format!("temp/translations-{}", Uuid::new_v4());
    let path_with_ext = format!("{}.{}", base_path, fmt.ext());

    if let Err(e) = file.persist_to(&path_with_ext).await {
        error!(error = %e, "Failed to persist uploaded file");
        return Err(Status::InternalServerError);
    }

    let result = fmt.translate(&base_path);
    let _ = fs::remove_file(&path_with_ext);
    result
}

pub async fn create_from_bytes(bytes: Vec<u8>, fmt: ParseFormat) -> Result<String, Status> {
    if let Err(e) = fs::create_dir_all("temp") {
        error!(error = %e, "Failed to create temp directory");
        return Err(Status::InternalServerError);
    }
    let base_path = format!("temp/translations-{}", Uuid::new_v4());
    let path_with_ext = format!("{}.{}", base_path, fmt.ext());

    if let Err(e) = fs::write(&path_with_ext, &bytes) {
        error!(error = %e, "Failed to write bytes to temp file");
        return Err(Status::InternalServerError);
    }

    let result = fmt.translate(&base_path);
    let _ = fs::remove_file(&path_with_ext);
    result
}

// ── Routes ────────────────────────────────────────────────────────────────────

pub async fn create_from_csv(
    file: TempFile<'_>,
    params: CsvParams,
) -> Result<Json<String>, Status> {
    info!(direction = params.direction as u8, delimiter = %params.delimiter, "Received CSV translation request");
    create(
        file,
        ParseFormat::Csv {
            direction: params.direction as u8,
            delimiter: params.delimiter,
        },
    )
    .await
    .map(Json)
}

pub async fn create_from_nt(file: TempFile<'_>) -> Result<Json<String>, Status> {
    info!("Received NT translation request");
    create(file, ParseFormat::Nt).await.map(Json)
}

pub async fn create_from_jsonld(file: TempFile<'_>) -> Result<Json<String>, Status> {
    info!("Received JSONLD translation request");
    create(file, ParseFormat::JsonLd).await.map(Json)
}

pub async fn create_from_n3(file: TempFile<'_>) -> Result<Json<String>, Status> {
    info!("Received N3 translation request");
    create(file, ParseFormat::N3).await.map(Json)
}
