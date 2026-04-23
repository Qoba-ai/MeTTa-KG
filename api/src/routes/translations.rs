use csv_sexpr::csv_modes::{CsvMode, CsvModeConfig};
use csv_sexpr::jsonld::JsonLdConfig;
use csv_sexpr::n3::N3Config;
use csv_sexpr::rdf::NtConfig;
use csv_sexpr::{parse, FormatConfig};
use rocket::form::{FromForm, FromFormField};
use rocket::fs::TempFile;
use rocket::http::Status;
use rocket::post;
use rocket::serde::json::Json;
use std::fs;
use tracing::{error, info};
use uuid::Uuid;

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

    fn translate(&self, bytes: &[u8]) -> Result<String, Status> {
        match self {
            Self::Csv {
                direction,
                delimiter,
            } => translate_csv(bytes, *direction, delimiter),
            Self::Nt => translate_nt(bytes),
            Self::JsonLd => translate_jsonld(bytes),
            Self::N3 => translate_n3(bytes),
        }
    }
}

// ── In-process translators (csv_sexpr) ────────────────────────────────────────

fn translate_csv(bytes: &[u8], direction: u8, delimiter: &str) -> Result<String, Status> {
    let content = std::str::from_utf8(bytes).map_err(|e| {
        error!(error = %e, "CSV file is not valid UTF-8");
        Status::UnprocessableEntity
    })?;
    let mode = match direction {
        1 => CsvMode::RowBased,
        2 => CsvMode::ColumnBased,
        3 => CsvMode::CellUnlabeled,
        4 => CsvMode::CellLabeled,
        _ => {
            error!(direction, "Invalid CSV direction");
            return Err(Status::BadRequest);
        }
    };
    let delim_byte = delimiter.bytes().next().unwrap_or(b',');
    let cfg = FormatConfig::Csv(CsvModeConfig {
        mode,
        delimiter: delim_byte,
        ..Default::default()
    });
    parse(&cfg, content)
        .map(|exprs| {
            exprs
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| {
            error!(error = %e, "CSV translation failed");
            Status::InternalServerError
        })
}

fn translate_nt(bytes: &[u8]) -> Result<String, Status> {
    let content = std::str::from_utf8(bytes).map_err(|e| {
        error!(error = %e, "NT file is not valid UTF-8");
        Status::UnprocessableEntity
    })?;
    let cfg = FormatConfig::Nt(NtConfig::default());
    parse(&cfg, content)
        .map(|exprs| {
            exprs
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| {
            error!(error = %e, "NT translation failed");
            Status::InternalServerError
        })
}

fn translate_jsonld(bytes: &[u8]) -> Result<String, Status> {
    let content = std::str::from_utf8(bytes).map_err(|e| {
        error!(error = %e, "JSON-LD file is not valid UTF-8");
        Status::UnprocessableEntity
    })?;
    let cfg = FormatConfig::JsonLd(JsonLdConfig::default());
    parse(&cfg, content)
        .map(|exprs| {
            exprs
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| {
            error!(error = %e, "JSON-LD translation failed");
            Status::InternalServerError
        })
}

fn translate_n3(bytes: &[u8]) -> Result<String, Status> {
    let content = std::str::from_utf8(bytes).map_err(|e| {
        error!(error = %e, "N3 file is not valid UTF-8");
        Status::UnprocessableEntity
    })?;
    let cfg = FormatConfig::N3(N3Config::default());
    parse(&cfg, content)
        .map(|exprs| {
            exprs
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| {
            error!(error = %e, "N3 translation failed");
            Status::InternalServerError
        })
}

// ── Shared entry points ───────────────────────────────────────────────────────

pub async fn create(mut file: TempFile<'_>, fmt: ParseFormat) -> Result<String, Status> {
    if let Err(e) = fs::create_dir_all("temp") {
        error!(error = %e, "Failed to create temp directory");
        return Err(Status::InternalServerError);
    }
    let path_with_ext = format!("temp/translations-{}.{}", Uuid::new_v4(), fmt.ext());

    if let Err(e) = file.persist_to(&path_with_ext).await {
        error!(error = %e, "Failed to persist uploaded file");
        return Err(Status::InternalServerError);
    }

    let bytes = match fs::read(&path_with_ext) {
        Ok(b) => b,
        Err(e) => {
            error!(error = %e, "Failed to read uploaded file");
            let _ = fs::remove_file(&path_with_ext);
            return Err(Status::InternalServerError);
        }
    };
    let _ = fs::remove_file(&path_with_ext);

    fmt.translate(&bytes)
}

pub async fn create_from_bytes(bytes: Vec<u8>, fmt: ParseFormat) -> Result<String, Status> {
    fmt.translate(&bytes)
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
