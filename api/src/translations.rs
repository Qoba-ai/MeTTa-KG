use crate::error::ApiError;
use rocket::form::{FromForm, FromFormField};
use rocket::fs::TempFile;
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

    fn translate(&self, base_path: &str) -> Result<String, ApiError> {
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

fn run_python_translation(script: &str, path: &str, extra_args: &[&str]) -> Result<String, ApiError> {
    let mut cmd = Command::new("python");
    cmd.arg(script).arg(path);
    for arg in extra_args {
        cmd.arg(arg);
    }
    match cmd.status() {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, script, "Python translation script failed");
            return Err(ApiError::Internal(format!("translation script failed: {}", e)));
        }
    }
    let output_path = format!("{}-output.metta", path);
    match fs::read_to_string(&output_path) {
        Ok(contents) => {
            // TODO: re-enable cleanup after debugging
            // let _ = fs::remove_file(&output_path);
            Ok(contents)
        }
        Err(e) => {
            error!(error = %e, output_path, "Failed to read translation output");
            Err(ApiError::Internal(format!("failed to read translation output: {}", e)))
        }
    }
}

// ── Shared entry points ───────────────────────────────────────────────────────

pub async fn create(mut file: TempFile<'_>, fmt: ParseFormat) -> Result<String, ApiError> {
    if let Err(e) = fs::create_dir_all("temp") {
        error!(error = %e, "Failed to create temp directory");
        return Err(ApiError::Internal(e.to_string()));
    }
    let base_path = format!("temp/translations-{}", Uuid::new_v4());
    let path_with_ext = format!("{}.{}", base_path, fmt.ext());

    if let Err(e) = file.persist_to(&path_with_ext).await {
        error!(error = %e, "Failed to persist uploaded file");
        return Err(ApiError::Internal(e.to_string()));
    }

    let result = fmt.translate(&base_path);
    // TODO: re-enable cleanup after debugging
    // let _ = fs::remove_file(&path_with_ext);
    result
}

pub async fn create_from_bytes(bytes: Vec<u8>, fmt: ParseFormat) -> Result<String, ApiError> {
    if let Err(e) = fs::create_dir_all("temp") {
        error!(error = %e, "Failed to create temp directory");
        return Err(ApiError::Internal(e.to_string()));
    }
    let base_path = format!("temp/translations-{}", Uuid::new_v4());
    let path_with_ext = format!("{}.{}", base_path, fmt.ext());

    if let Err(e) = fs::write(&path_with_ext, &bytes) {
        error!(error = %e, "Failed to write bytes to temp file");
        return Err(ApiError::Internal(e.to_string()));
    }

    let result = fmt.translate(&base_path);
    // TODO: re-enable cleanup after debugging
    // let _ = fs::remove_file(&path_with_ext);
    result
}

// ── Helpers called by route handlers ─────────────────────────────────────────

pub async fn create_from_csv(
    file: TempFile<'_>,
    params: CsvParams,
) -> Result<Json<String>, ApiError> {
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

pub async fn create_from_nt(file: TempFile<'_>) -> Result<Json<String>, ApiError> {
    info!("Received NT translation request");
    create(file, ParseFormat::Nt).await.map(Json)
}

pub async fn create_from_jsonld(file: TempFile<'_>) -> Result<Json<String>, ApiError> {
    info!("Received JSONLD translation request");
    create(file, ParseFormat::JsonLd).await.map(Json)
}

pub async fn create_from_n3(file: TempFile<'_>) -> Result<Json<String>, ApiError> {
    info!("Received N3 translation request");
    create(file, ParseFormat::N3).await.map(Json)
}
