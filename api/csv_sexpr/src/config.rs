/// Top-level serializable configuration and unified parse entry points.
use serde::{Deserialize, Serialize};

use crate::csv_modes::{parse_csv_mode, CsvModeConfig};
use crate::error::Result;
use crate::json::{parse_json, parse_jsonl, JsonConfig};
use crate::jsonld::{JsonLdConfig, parse_jsonld};
use crate::n3::{N3Config, parse_n3};
use crate::rdf::{parse_nt, NtConfig};
use crate::sexpr::SExpr;

// ── Top-level config ──────────────────────────────────────────────────────────

/// Selects an input format and carries its format-specific options.
///
/// This type is fully `serde`-serializable: send it as JSON from the
/// frontend, deserialize on the server, and pass to [`parse`] or
/// [`parse_iter`].
///
/// # JSON representation
///
/// The `"format"` key selects the variant; remaining keys are format options:
///
/// ```json
/// { "format": "csv",    "mode": "field_based", "delimiter": 44 }
/// { "format": "nt" }
/// { "format": "json_ld" }
/// { "format": "n3" }
/// { "format": "jsonl" }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "format", rename_all = "snake_case")]
pub enum FormatConfig {
    /// CSV with one of the nine named modes.
    Csv(CsvModeConfig),
    /// Single JSON object — flattened to one expression per leaf.
    Json(JsonConfig),
    /// JSON Lines — one JSON object per line.
    Jsonl(JsonConfig),
    /// N-Triples RDF (`.nt`) — one triple expression per line.
    Nt(NtConfig),
    /// JSON-LD — parsed to flat RDF triples.
    JsonLd(JsonLdConfig),
    /// N3 (Notation3) — parsed to graph-wrapped quads with namespace atoms.
    N3(N3Config),
}

// ── Eager parse ───────────────────────────────────────────────────────────────

/// Parse `input` according to `config`, collecting all results into a `Vec`.
pub fn parse(config: &FormatConfig, input: &str) -> Result<Vec<SExpr>> {
    match config {
        FormatConfig::Csv(cfg) => parse_csv_mode(cfg, input),
        FormatConfig::Json(cfg) => parse_json(cfg, input),
        FormatConfig::Jsonl(_) => parse_jsonl(input),
        FormatConfig::Nt(cfg) => parse_nt(cfg, input),
        FormatConfig::JsonLd(cfg) => parse_jsonld(cfg, input),
        FormatConfig::N3(cfg) => parse_n3(cfg, input),
    }
}

// ── Streaming parse ───────────────────────────────────────────────────────────

/// Return a lazy iterator that yields one `Result<SExpr>` at a time.
///
/// Formats that are naturally row-oriented (N-Triples, JSONL) process each
/// record on demand.  Formats that require the full document first (single
/// JSON, column-based CSV modes) buffer internally but present the same
/// iterator interface.
///
/// # Example
///
/// ```
/// use csv_sexpr::{FormatConfig, parse_iter};
/// use csv_sexpr::rdf::NtConfig;
///
/// let nt = "<http://a.example/s> <http://a.example/p> <http://a.example/o> .\n";
/// let cfg = FormatConfig::Nt(NtConfig::default());
///
/// let mut iter = parse_iter(&cfg, nt).unwrap();
/// let first = iter.next().unwrap().unwrap();
/// assert!(first.to_string().contains("uriref"));
/// ```
pub fn parse_iter<'a>(
    config: &FormatConfig,
    input: &'a str,
) -> Result<Box<dyn Iterator<Item = Result<SExpr>> + 'a>> {
    match config {
        FormatConfig::Csv(cfg) => {
            // CSV modes are internally row-based; column-based modes need the
            // full matrix first.  Either way we present a consistent iterator.
            let exprs = parse_csv_mode(cfg, input)?;
            Ok(Box::new(exprs.into_iter().map(Ok)))
        }
        FormatConfig::Json(cfg) => {
            let exprs = parse_json(cfg, input)?;
            Ok(Box::new(exprs.into_iter().map(Ok)))
        }
        FormatConfig::Jsonl(_) => Ok(Box::new(crate::json::jsonl_iter(input))),
        FormatConfig::Nt(_) => Ok(Box::new(crate::rdf::nt_iter(input.as_bytes()))),
        FormatConfig::JsonLd(cfg) => {
            let exprs = parse_jsonld(cfg, input)?;
            Ok(Box::new(exprs.into_iter().map(Ok)))
        }
        FormatConfig::N3(cfg) => {
            let exprs = parse_n3(cfg, input)?;
            Ok(Box::new(exprs.into_iter().map(Ok)))
        }
    }
}

// ── Flatten adapter ───────────────────────────────────────────────────────────

/// Adapts an `Iterator<Item = Result<Vec<SExpr>>>` into
/// `Iterator<Item = Result<SExpr>>`, draining each `Vec` before pulling
/// the next row.
///
/// An `Err` from the source is forwarded immediately and terminates the
/// iteration for that error site; the next `next()` call continues from the
/// source.
pub struct Flatten<I: Iterator<Item = Result<Vec<SExpr>>>> {
    source: I,
    buf: std::vec::IntoIter<SExpr>,
}

impl<I: Iterator<Item = Result<Vec<SExpr>>>> Flatten<I> {
    pub fn new(source: I) -> Self {
        Self { source, buf: vec![].into_iter() }
    }
}

impl<I: Iterator<Item = Result<Vec<SExpr>>>> Iterator for Flatten<I> {
    type Item = Result<SExpr>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if let Some(expr) = self.buf.next() {
                return Some(Ok(expr));
            }
            match self.source.next()? {
                Err(e) => return Some(Err(e)),
                Ok(v) => self.buf = v.into_iter(),
            }
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::csv_modes::CsvMode;

    #[test]
    fn roundtrip_csv_config_json() {
        let cfg = FormatConfig::Csv(CsvModeConfig {
            mode: CsvMode::FunctionBased,
            ..Default::default()
        });
        let json = serde_json::to_string(&cfg).unwrap();
        let back: FormatConfig = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, FormatConfig::Csv(_)));
    }

    #[test]
    fn roundtrip_nt_config_json() {
        let cfg = FormatConfig::Nt(NtConfig::default());
        let json = serde_json::to_string(&cfg).unwrap();
        let back: FormatConfig = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, FormatConfig::Nt(_)));
    }

    #[test]
    fn parse_csv_via_config() {
        let cfg = FormatConfig::Csv(CsvModeConfig {
            mode: CsvMode::StructBased,
            ..Default::default()
        });
        let out = parse(&cfg, "name,age\nAlice,30\n").unwrap();
        assert_eq!(out[0].to_string(), r#"(("name" "Alice") ("age" "30"))"#);
    }

    #[test]
    fn parse_json_via_config() {
        let cfg = FormatConfig::Json(JsonConfig::default());
        let out = parse(&cfg, r#"{"x": 1}"#).unwrap();
        assert_eq!(out[0].to_string(), "(x 1)");
    }

    #[test]
    fn parse_iter_nt() {
        let nt = "<http://a.example/s> <http://a.example/p> <http://a.example/o> .\n";
        let cfg = FormatConfig::Nt(NtConfig::default());
        let results: Vec<_> = parse_iter(&cfg, nt)
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].to_string().contains("uriref"));
    }

    #[test]
    fn parse_iter_jsonl() {
        let jsonl = "{\"a\": 1}\n{\"b\": 2}\n";
        let cfg = FormatConfig::Jsonl(JsonConfig::default());
        let results: Vec<_> = parse_iter(&cfg, jsonl)
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].to_string(), "(json 0 (a 1))");
        assert_eq!(results[1].to_string(), "(json 1 (b 2))");
    }

    #[test]
    fn parse_iter_csv() {
        let cfg = FormatConfig::Csv(CsvModeConfig {
            mode: CsvMode::FieldBased,
            ..Default::default()
        });
        let results: Vec<_> = parse_iter(&cfg, "k,v\nfoo,bar\n")
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();
        assert_eq!(results[0].to_string(), r#"(0 "k" "foo")"#);
    }

    #[test]
    fn flatten_adapter() {
        let rows: Vec<Result<Vec<SExpr>>> = vec![
            Ok(vec![SExpr::sym("a"), SExpr::sym("b")]),
            Ok(vec![SExpr::sym("c")]),
        ];
        let flat: Vec<_> = Flatten::new(rows.into_iter())
            .collect::<Result<Vec<_>>>()
            .unwrap();
        assert_eq!(flat.len(), 3);
        assert_eq!(flat[0].to_string(), "a");
        assert_eq!(flat[2].to_string(), "c");
    }
}
