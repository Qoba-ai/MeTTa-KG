use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("column not found: {0:?}")]
    ColumnNotFound(String),

    #[error("column index {0} out of range (record has {1} fields)")]
    IndexOutOfRange(usize, usize),

    #[error("cannot select columns by name: CSV has no headers (call .has_headers(true))")]
    MissingHeaders,

    #[error("JSON error: {0}")]
    Json(String),

    #[error("RDF parse error: {0}")]
    Rdf(String),
}
