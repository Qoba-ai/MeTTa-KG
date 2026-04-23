//! Parse CSV, JSON, JSON-Lines, and N-Triples RDF files into S-expressions
//! with a highly configurable builder API.
//!
//! # Two APIs
//!
//! ## 1. Named modes (serializable — designed for frontend UI)
//!
//! [`FormatConfig`] is a `serde`-serializable enum that covers every input
//! format and all named transformation modes.  Send it as JSON from the
//! frontend; call [`parse`] on the server side.
//!
//! ```
//! use csv_sexpr::{FormatConfig, parse};
//! use csv_sexpr::csv_modes::{CsvMode, CsvModeConfig};
//!
//! let cfg = FormatConfig::Csv(CsvModeConfig {
//!     mode: CsvMode::FunctionBased,
//!     ..Default::default()
//! });
//!
//! let exprs = parse(&cfg, "id,name,age\nalice,Alice,30\n").unwrap();
//! // exprs[0] = (= (value ("id" 0)) "alice")
//! // exprs[1] = (= (value ("name" 0)) "Alice")
//! assert_eq!(exprs.len(), 3); // 3 fields × 1 row
//! ```
//!
//! ## 2. Flexible custom CSV parser
//!
//! [`CsvParser`] with [`RowTemplate`] gives full control over column
//! selection, value transforms, and output shape.
//!
//! ```
//! use csv_sexpr::{CsvParser, ColumnSpec, RowTemplate, SExpr};
//!
//! let exprs = CsvParser::new()
//!     .column(ColumnSpec::by_name("name").as_symbol())
//!     .column(ColumnSpec::by_name("age"))
//!     .template(RowTemplate::Record { head: SExpr::sym("Person") })
//!     .parse_str("name,age\nAlice,30\n")
//!     .unwrap();
//!
//! assert_eq!(exprs[0].to_string(), "(Person Alice 30)");
//! ```

pub mod column;
pub mod csv_modes;
pub mod json;
pub mod jsonld;
pub mod n3;
pub mod rdf;

mod config;
mod error;
mod parser;
mod sexpr;
mod template;

pub use column::{ColumnSelector, ColumnSpec, ValueType};
pub use config::{parse, parse_iter, Flatten, FormatConfig};
pub use csv_modes::{CsvMode, CsvModeConfig};
pub use error::{Error, Result};
pub use json::{flatten_value as json_flatten, jsonl_iter, JsonConfig, JsonlIter};
pub use jsonld::{parse_jsonld, JsonLdConfig};
pub use n3::{parse_n3, N3Config};
pub use parser::{CsvParser, CsvRowIter};
pub use rdf::{nt_iter, NtConfig, NtIter};
pub use sexpr::SExpr;
pub use template::RowTemplate;

#[cfg(test)]
mod tests {
    use super::*;
    use csv_modes::CsvMode;

    // ── CsvParser (flexible API) ──────────────────────────────────────────────

    const BASIC_CSV: &str = "id,name,age\nalice,Alice,30\nbob,Bob,25\n";

    #[test]
    fn flexible_flat_all_columns() {
        let exprs = CsvParser::new().parse_str(BASIC_CSV).unwrap();
        assert_eq!(exprs.len(), 2);
        assert_eq!(exprs[0].to_string(), "(alice Alice 30)");
    }

    #[test]
    fn flexible_record_template() {
        let exprs = CsvParser::new()
            .template(RowTemplate::Record { head: SExpr::sym("Person") })
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(Person alice Alice 30)");
    }

    #[test]
    fn flexible_assoc_template() {
        let exprs = CsvParser::new()
            .template(RowTemplate::Assoc { head: SExpr::sym("Person") })
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(Person (id alice) (name Alice) (age 30))");
    }

    #[test]
    fn flexible_metta_facts() {
        let exprs = CsvParser::new()
            .template(RowTemplate::MeTTaFacts {
                id_col: ColumnSelector::ByName("id".into()),
            })
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs.len(), 4);
        assert_eq!(exprs[0].to_string(), "(= (name alice) Alice)");
        assert_eq!(exprs[1].to_string(), "(= (age alice) 30)");
    }

    #[test]
    fn flexible_entity_attr_val() {
        let exprs = CsvParser::new()
            .template(RowTemplate::EntityAttrVal {
                id_col: ColumnSelector::ByName("id".into()),
            })
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(alice name Alice)");
        assert_eq!(exprs[1].to_string(), "(alice age 30)");
    }

    #[test]
    fn flexible_column_selection_and_rename() {
        let exprs = CsvParser::new()
            .column(ColumnSpec::by_name("name").as_symbol())
            .column(ColumnSpec::by_name("age").label("years"))
            .template(RowTemplate::Assoc { head: SExpr::sym("P") })
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(P (name Alice) (years 30))");
    }

    #[test]
    fn flexible_custom_transform() {
        let exprs = CsvParser::new()
            .column(ColumnSpec::by_name("age").with_transform(|v| {
                let n: i64 = v.parse().unwrap_or(0);
                SExpr::sym(format!("{}", n * 2))
            }))
            .parse_str(BASIC_CSV)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(60)");
    }

    #[test]
    fn flexible_custom_template() {
        use std::sync::Arc;
        let exprs = CsvParser::new()
            .template(RowTemplate::Custom(Arc::new(|fields| {
                fields
                    .iter()
                    .map(|(k, v)| SExpr::list([SExpr::sym(k), v.clone()]))
                    .collect()
            })))
            .parse_str("x,y\n1,2\n")
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(x 1)");
        assert_eq!(exprs[1].to_string(), "(y 2)");
    }

    #[test]
    fn flexible_null_sentinel_omits_field() {
        let csv = "a,b,c\n1,NULL,3\n";
        let exprs = CsvParser::new().parse_str(csv).unwrap();
        assert_eq!(exprs[0].to_string(), "(1 3)");
    }

    #[test]
    fn flexible_tab_delimited_no_headers() {
        let tsv = "Alice\t30\nBob\t25\n";
        let exprs = CsvParser::new()
            .delimiter(b'\t')
            .has_headers(false)
            .parse_str(tsv)
            .unwrap();
        assert_eq!(exprs[0].to_string(), "(Alice 30)");
    }

    // ── SExpr display ─────────────────────────────────────────────────────────

    #[test]
    fn sexpr_display_quoting() {
        assert_eq!(SExpr::sym("foo").to_string(), "foo");
        assert_eq!(SExpr::str_val("hello world").to_string(), "\"hello world\"");
        assert_eq!(SExpr::str_val("say \"hi\"").to_string(), r#""say \"hi\"""#);
        assert_eq!(SExpr::nil().to_string(), "()");
    }

    // ── FormatConfig (named modes) ────────────────────────────────────────────

    #[test]
    fn named_mode_function_based() {
        let cfg = FormatConfig::Csv(CsvModeConfig {
            mode: CsvMode::FunctionBased,
            ..Default::default()
        });
        let exprs = parse(&cfg, BASIC_CSV).unwrap();
        // BASIC_CSV has columns: id, name, age — so exprs[0] = id field
        assert_eq!(exprs[0].to_string(), r#"(= (value ("id" 0)) "alice")"#);
        assert_eq!(exprs[1].to_string(), r#"(= (value ("name" 0)) "Alice")"#);
    }

    #[test]
    fn named_mode_json() {
        let cfg = FormatConfig::Json(JsonConfig::default());
        let exprs = parse(&cfg, r#"{"a": {"b": 42}}"#).unwrap();
        assert_eq!(exprs[0].to_string(), "(a (b 42))");
    }

    #[test]
    fn config_serializes_to_json() {
        let cfg = FormatConfig::Csv(CsvModeConfig {
            mode: CsvMode::FieldBased,
            ..Default::default()
        });
        let s = serde_json::to_string(&cfg).unwrap();
        assert!(s.contains("\"format\":\"csv\""));
        assert!(s.contains("\"field_based\""));
    }
}
