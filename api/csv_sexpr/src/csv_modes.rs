/// All nine CSV→MeTTa modes from the Python `csv_to_metta` package.
///
/// Each mode produces a different S-expression shape. Values are always
/// emitted as quoted strings; row/column indices are unquoted symbols.
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::sexpr::SExpr;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvModeConfig {
    pub mode: CsvMode,
    /// Field delimiter byte value (default: 44 = `','`).
    #[serde(default = "default_delimiter")]
    pub delimiter: u8,
    /// Quote character byte value (default: 34 = `'"'`).
    #[serde(default = "default_quote")]
    pub quote: u8,
    /// Field values that should be treated as null and omitted.
    #[serde(default = "default_null_sentinels")]
    pub null_sentinels: Vec<String>,
}

fn default_delimiter() -> u8 { b',' }
fn default_quote() -> u8 { b'"' }
fn default_null_sentinels() -> Vec<String> {
    vec!["NULL".into(), "null".into(), "NA".into(), "N/A".into()]
}

impl Default for CsvModeConfig {
    fn default() -> Self {
        Self {
            mode: CsvMode::RowBased,
            delimiter: default_delimiter(),
            quote: default_quote(),
            null_sentinels: default_null_sentinels(),
        }
    }
}

// ── Mode enum ─────────────────────────────────────────────────────────────────

/// Named CSV transformation modes, matching the Python `csv_to_metta` package.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CsvMode {
    /// `(idx ("v1" "v2" ...))` — one list atom per row, no header used.
    RowBased,

    /// `(header ("c1" "c2" ...))` then `(idx ("v1" "v2" ...))`.
    RowBasedWithHeader,

    /// Transpose the matrix: `(idx ("c_header" "v1" "v2" ...))`.
    ColumnBased,

    /// `("col_name" ("v1" "v2" ...))` — header name is the head atom.
    ColumnBasedWithHeader,

    /// `(("k1" "v1") ("k2" "v2") ...)` — key-value pairs per row.
    StructBased,

    /// `(row_idx "field" "value")` — one triple per cell.
    FieldBased,

    /// `(= (value ("field" row_idx)) "value")` — functional / predicate form.
    FunctionBased,

    /// `(= (value (row_idx col_idx)) "value")` — matrix cell with numeric indices.
    CellUnlabeled,

    /// `(= (value ("row_label" "col_label")) "value")`.
    /// The first CSV row contains column labels; the first column contains row labels.
    /// The top-left cell `[0][0]` is ignored.
    CellLabeled,
}

// ── Entry point ───────────────────────────────────────────────────────────────

pub fn parse_csv_mode(cfg: &CsvModeConfig, input: &str) -> Result<Vec<SExpr>> {
    let matrix = read_matrix(input, cfg.delimiter, cfg.quote)?;
    apply_mode(&cfg.mode, matrix, &cfg.null_sentinels)
}

// ── CSV → matrix ──────────────────────────────────────────────────────────────

fn read_matrix(input: &str, delimiter: u8, quote: u8) -> Result<Vec<Vec<String>>> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .quote(quote)
        .has_headers(false)
        .flexible(true)
        .from_reader(input.as_bytes());

    let mut matrix = Vec::new();
    for record in rdr.records() {
        let record = record?;
        let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
        if row.iter().all(|s| s.trim().is_empty()) {
            continue;
        }
        matrix.push(row);
    }
    Ok(matrix)
}

// ── Mode dispatch ─────────────────────────────────────────────────────────────

fn apply_mode(mode: &CsvMode, matrix: Vec<Vec<String>>, nulls: &[String]) -> Result<Vec<SExpr>> {
    let is_null = |s: &str| nulls.iter().any(|n| n == s);

    match mode {
        // (idx ("v1" "v2" ...))
        CsvMode::RowBased => Ok(matrix
            .into_iter()
            .enumerate()
            .map(|(i, row)| {
                let inner = SExpr::list(row.iter().map(|v| SExpr::str_val(v)));
                SExpr::list([SExpr::sym(i.to_string()), inner])
            })
            .collect()),

        // (header ("c1" ...)) then (idx ("v1" ...))
        CsvMode::RowBasedWithHeader => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let mut out = Vec::new();
            let header_inner = SExpr::list(matrix[0].iter().map(|v| SExpr::str_val(v)));
            out.push(SExpr::list([SExpr::sym("header"), header_inner]));
            for (i, row) in matrix[1..].iter().enumerate() {
                let inner = SExpr::list(row.iter().map(|v| SExpr::str_val(v)));
                out.push(SExpr::list([SExpr::sym(i.to_string()), inner]));
            }
            Ok(out)
        }

        // Transpose: (col_idx ("v1" "v2" ...))
        CsvMode::ColumnBased => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let ncols = matrix.iter().map(|r| r.len()).max().unwrap_or(0);
            Ok((0..ncols)
                .map(|col| {
                    let vals: Vec<SExpr> = matrix
                        .iter()
                        .map(|row| SExpr::str_val(row.get(col).map(|s| s.as_str()).unwrap_or("")))
                        .collect();
                    SExpr::list([SExpr::sym(col.to_string()), SExpr::list(vals)])
                })
                .collect())
        }

        // ("col_name" ("v1" "v2" ...))
        CsvMode::ColumnBasedWithHeader => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let headers = &matrix[0];
            let data = &matrix[1..];
            Ok(headers
                .iter()
                .enumerate()
                .map(|(col, name)| {
                    let vals: Vec<SExpr> = data
                        .iter()
                        .map(|row| SExpr::str_val(row.get(col).map(|s| s.as_str()).unwrap_or("")))
                        .collect();
                    SExpr::list([SExpr::str_val(name), SExpr::list(vals)])
                })
                .collect())
        }

        // (("k1" "v1") ("k2" "v2") ...)
        CsvMode::StructBased => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let headers = &matrix[0];
            Ok(matrix[1..]
                .iter()
                .map(|row| {
                    let pairs: Vec<SExpr> = headers
                        .iter()
                        .zip(row.iter())
                        .filter(|(_, v)| !is_null(v.as_str()))
                        .map(|(k, v)| SExpr::list([SExpr::str_val(k), SExpr::str_val(v)]))
                        .collect();
                    SExpr::list(pairs)
                })
                .collect())
        }

        // (row_idx "field" "value")
        CsvMode::FieldBased => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let headers = &matrix[0];
            let mut out = Vec::new();
            for (row_idx, row) in matrix[1..].iter().enumerate() {
                for (col, val) in row.iter().enumerate() {
                    if is_null(val.as_str()) {
                        continue;
                    }
                    let field = headers.get(col).map(|s| s.as_str()).unwrap_or("");
                    out.push(SExpr::list([
                        SExpr::sym(row_idx.to_string()),
                        SExpr::str_val(field),
                        SExpr::str_val(val),
                    ]));
                }
            }
            Ok(out)
        }

        // (= (value ("field" row_idx)) "value")
        CsvMode::FunctionBased => {
            if matrix.is_empty() {
                return Ok(vec![]);
            }
            let headers = &matrix[0];
            let mut out = Vec::new();
            for (row_idx, row) in matrix[1..].iter().enumerate() {
                for (col, val) in row.iter().enumerate() {
                    if is_null(val.as_str()) {
                        continue;
                    }
                    let field = headers.get(col).map(|s| s.as_str()).unwrap_or("");
                    out.push(SExpr::list([
                        SExpr::sym("="),
                        SExpr::list([
                            SExpr::sym("value"),
                            SExpr::list([
                                SExpr::str_val(field),
                                SExpr::sym(row_idx.to_string()),
                            ]),
                        ]),
                        SExpr::str_val(val),
                    ]));
                }
            }
            Ok(out)
        }

        // (= (value (row_idx col_idx)) "value")
        CsvMode::CellUnlabeled => {
            let mut out = Vec::new();
            for (row_idx, row) in matrix.iter().enumerate() {
                for (col_idx, val) in row.iter().enumerate() {
                    if is_null(val.as_str()) {
                        continue;
                    }
                    out.push(SExpr::list([
                        SExpr::sym("="),
                        SExpr::list([
                            SExpr::sym("value"),
                            SExpr::list([
                                SExpr::sym(row_idx.to_string()),
                                SExpr::sym(col_idx.to_string()),
                            ]),
                        ]),
                        SExpr::str_val(val),
                    ]));
                }
            }
            Ok(out)
        }

        // (= (value ("row_label" "col_label")) "value")
        CsvMode::CellLabeled => {
            if matrix.len() < 2 || matrix[0].len() < 2 {
                return Ok(vec![]);
            }
            let col_labels = &matrix[0][1..];
            let mut out = Vec::new();
            for row in &matrix[1..] {
                let row_label = &row[0];
                for (col, val) in row[1..].iter().enumerate() {
                    if is_null(val.as_str()) {
                        continue;
                    }
                    let col_label = col_labels.get(col).map(|s| s.as_str()).unwrap_or("");
                    out.push(SExpr::list([
                        SExpr::sym("="),
                        SExpr::list([
                            SExpr::sym("value"),
                            SExpr::list([SExpr::str_val(row_label), SExpr::str_val(col_label)]),
                        ]),
                        SExpr::str_val(val),
                    ]));
                }
            }
            Ok(out)
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "Name,Age,Role\nAlice,30,admin\nBob,25,user\n";

    fn cfg(mode: CsvMode) -> CsvModeConfig {
        CsvModeConfig { mode, ..Default::default() }
    }

    #[test]
    fn row_based() {
        let out = parse_csv_mode(&cfg(CsvMode::RowBased), CSV).unwrap();
        // No header consumed — row 0 is the header row itself
        assert_eq!(out[0].to_string(), r#"(0 ("Name" "Age" "Role"))"#);
        assert_eq!(out[1].to_string(), r#"(1 ("Alice" "30" "admin"))"#);
    }

    #[test]
    fn row_based_with_header() {
        let out = parse_csv_mode(&cfg(CsvMode::RowBasedWithHeader), CSV).unwrap();
        assert_eq!(out[0].to_string(), r#"(header ("Name" "Age" "Role"))"#);
        assert_eq!(out[1].to_string(), r#"(0 ("Alice" "30" "admin"))"#);
    }

    #[test]
    fn column_based() {
        let out = parse_csv_mode(&cfg(CsvMode::ColumnBased), "A,B\n1,2\n3,4\n").unwrap();
        // col 0: A 1 3, col 1: B 2 4
        assert_eq!(out[0].to_string(), r#"(0 ("A" "1" "3"))"#);
        assert_eq!(out[1].to_string(), r#"(1 ("B" "2" "4"))"#);
    }

    #[test]
    fn column_based_with_header() {
        let out = parse_csv_mode(&cfg(CsvMode::ColumnBasedWithHeader), CSV).unwrap();
        assert_eq!(out[0].to_string(), r#"("Name" ("Alice" "Bob"))"#);
        assert_eq!(out[1].to_string(), r#"("Age" ("30" "25"))"#);
    }

    #[test]
    fn struct_based() {
        let out = parse_csv_mode(&cfg(CsvMode::StructBased), CSV).unwrap();
        assert_eq!(
            out[0].to_string(),
            r#"(("Name" "Alice") ("Age" "30") ("Role" "admin"))"#
        );
    }

    #[test]
    fn field_based() {
        let out = parse_csv_mode(&cfg(CsvMode::FieldBased), CSV).unwrap();
        assert_eq!(out[0].to_string(), r#"(0 "Name" "Alice")"#);
        assert_eq!(out[1].to_string(), r#"(0 "Age" "30")"#);
    }

    #[test]
    fn function_based() {
        let out = parse_csv_mode(&cfg(CsvMode::FunctionBased), CSV).unwrap();
        assert_eq!(out[0].to_string(), r#"(= (value ("Name" 0)) "Alice")"#);
        assert_eq!(out[1].to_string(), r#"(= (value ("Age" 0)) "30")"#);
    }

    #[test]
    fn cell_unlabeled() {
        let out = parse_csv_mode(&cfg(CsvMode::CellUnlabeled), "a,b\n1,2\n").unwrap();
        assert_eq!(out[0].to_string(), r#"(= (value (0 0)) "a")"#);
        assert_eq!(out[3].to_string(), r#"(= (value (1 1)) "2")"#);
    }

    #[test]
    fn cell_labeled() {
        let csv = ",X,Y\nA,1,2\nB,3,4\n";
        let out = parse_csv_mode(&cfg(CsvMode::CellLabeled), csv).unwrap();
        assert_eq!(out[0].to_string(), r#"(= (value ("A" "X")) "1")"#);
        assert_eq!(out[1].to_string(), r#"(= (value ("A" "Y")) "2")"#);
        assert_eq!(out[2].to_string(), r#"(= (value ("B" "X")) "3")"#);
    }

    #[test]
    fn null_omitted() {
        let cfg = CsvModeConfig {
            mode: CsvMode::FieldBased,
            null_sentinels: vec!["NULL".into()],
            ..Default::default()
        };
        let out = parse_csv_mode(&cfg, "k,v\nfoo,NULL\n").unwrap();
        // The "v" field has null value → omitted
        assert_eq!(out.len(), 1); // only "k" field
    }
}
