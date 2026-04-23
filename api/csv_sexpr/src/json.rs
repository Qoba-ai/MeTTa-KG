/// JSON and JSON-Lines (JSONL) → S-expression conversion.
///
/// Matches the behaviour of the Python `json_to_metta` / `dict_to_metta`
/// functions:
/// - Nested objects are flattened: each leaf value becomes its own top-level
///   expression, with the key path encoded as nested lists.
/// - Strings are quoted; numbers and booleans are unquoted symbols; `null`
///   becomes the symbol `Nil`.
/// - Array indices become unquoted symbols (`0`, `1`, …).
/// - JSONL records are wrapped: `(json <idx> (key value))`.
use serde_json::Value;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::sexpr::SExpr;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct JsonConfig {
    /// Wrap each expression with `(json <idx> ...)` as in JSONL mode.
    #[serde(default)]
    pub jsonl: bool,
}

// ── Eager entry points ────────────────────────────────────────────────────────

/// Parse a JSON object/array string and flatten it to S-expressions.
pub fn parse_json(cfg: &JsonConfig, input: &str) -> Result<Vec<SExpr>> {
    let value: Value =
        serde_json::from_str(input).map_err(|e| Error::Json(e.to_string()))?;
    if cfg.jsonl {
        Ok(flatten_value(&value)
            .into_iter()
            .map(|e| SExpr::list([SExpr::sym("json"), SExpr::sym("0"), e]))
            .collect())
    } else {
        Ok(flatten_value(&value))
    }
}

/// Parse a JSON-Lines (JSONL) string — one JSON object per non-empty line.
pub fn parse_jsonl(input: &str) -> Result<Vec<SExpr>> {
    jsonl_iter(input).collect()
}

// ── Streaming entry points ────────────────────────────────────────────────────

/// Return a lazy iterator over S-expressions for a single JSON value.
///
/// Each `next()` call yields the expression for one leaf path.
pub fn json_value_iter(value: Value) -> impl Iterator<Item = SExpr> {
    flatten_value(&value).into_iter()
}

/// Return a lazy iterator over S-expressions for a JSONL string.
///
/// Processes one line per `next()` call; wraps each leaf as `(json <idx> expr)`.
pub fn jsonl_iter(input: &str) -> JsonlIter<'_> {
    JsonlIter {
        lines: input.lines(),
        idx: 0,
        buf: vec![].into_iter(),
        buf_idx: 0,
    }
}

// ── JsonlIter ─────────────────────────────────────────────────────────────────

/// Lazy iterator over JSONL S-expressions produced by [`jsonl_iter`].
pub struct JsonlIter<'a> {
    lines: std::str::Lines<'a>,
    idx: usize,
    buf: std::vec::IntoIter<SExpr>,
    buf_idx: usize,
}

impl<'a> Iterator for JsonlIter<'a> {
    type Item = Result<SExpr>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            // Drain the current line's expressions first.
            if let Some(expr) = self.buf.next() {
                let idx = self.buf_idx;
                return Some(Ok(SExpr::list([
                    SExpr::sym("json"),
                    SExpr::sym(idx.to_string()),
                    expr,
                ])));
            }

            // Advance to the next non-empty line.
            let line = loop {
                let l = self.lines.next()?;
                if !l.trim().is_empty() {
                    break l;
                }
            };

            match serde_json::from_str::<Value>(line) {
                Err(e) => return Some(Err(Error::Json(e.to_string()))),
                Ok(value) => {
                    self.buf_idx = self.idx;
                    self.idx += 1;
                    self.buf = flatten_value(&value).into_iter();
                }
            }
        }
    }
}

// ── Flattening logic ──────────────────────────────────────────────────────────

/// Flatten a JSON value: each leaf path becomes one top-level S-expression.
pub fn flatten_value(value: &Value) -> Vec<SExpr> {
    let mut out = Vec::new();
    walk(value, &[], &mut out);
    out
}

fn walk(value: &Value, path: &[SExpr], out: &mut Vec<SExpr>) {
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let mut p = path.to_vec();
                // Object keys: symbol if identifier-like, quoted string otherwise
                p.push(key_atom(key));
                walk(val, &p, out);
            }
        }
        Value::Array(arr) => {
            for (idx, val) in arr.iter().enumerate() {
                let mut p = path.to_vec();
                p.push(SExpr::sym(idx.to_string()));
                walk(val, &p, out);
            }
        }
        leaf => {
            // Build (k1 (k2 (k3 leaf))) from the accumulated path
            let expr = nested(path, leaf_atom(leaf));
            out.push(expr);
        }
    }
}

/// Build a nested S-expression from a path and a leaf: `(k1 (k2 (k3 leaf)))`.
fn nested(path: &[SExpr], leaf: SExpr) -> SExpr {
    path.iter().rev().fold(leaf, |acc, key| SExpr::list([key.clone(), acc]))
}

fn key_atom(k: &str) -> SExpr {
    // Use symbol for clean identifiers, quoted string otherwise
    if !k.is_empty()
        && k.chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '-'))
    {
        SExpr::sym(k)
    } else {
        SExpr::str_val(k)
    }
}

fn leaf_atom(v: &Value) -> SExpr {
    match v {
        Value::Null => SExpr::sym("Nil"),
        Value::Bool(b) => SExpr::sym(if *b { "True" } else { "False" }),
        Value::Number(n) => SExpr::sym(n.to_string()),
        Value::String(s) => SExpr::str_val(s),
        _ => unreachable!("walk only calls leaf_atom on scalar values"),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_object() {
        let json = r#"{"outer": {"foo": {"a": 1, "b": 2}}}"#;
        let out = parse_json(&JsonConfig::default(), json).unwrap();
        assert_eq!(out[0].to_string(), "(outer (foo (a 1)))");
        assert_eq!(out[1].to_string(), "(outer (foo (b 2)))");
    }

    #[test]
    fn array_values() {
        let json = r#"{"items": [10, 20]}"#;
        let out = parse_json(&JsonConfig::default(), json).unwrap();
        assert_eq!(out[0].to_string(), "(items (0 10))");
        assert_eq!(out[1].to_string(), "(items (1 20))");
    }

    #[test]
    fn leaf_types() {
        let json = r#"{"s": "hello", "n": 3.14, "b": true, "nil": null}"#;
        let out = parse_json(&JsonConfig::default(), json).unwrap();
        let strs: Vec<String> = out.iter().map(|e| e.to_string()).collect();
        assert!(strs.contains(&r#"(s "hello")"#.to_string()));
        assert!(strs.contains(&"(n 3.14)".to_string()));
        assert!(strs.contains(&"(b True)".to_string()));
        assert!(strs.contains(&"(nil Nil)".to_string()));
    }

    #[test]
    fn jsonl() {
        let input = "{\"a\": 1}\n{\"a\": 2}\n";
        let out = parse_jsonl(input).unwrap();
        assert_eq!(out[0].to_string(), "(json 0 (a 1))");
        assert_eq!(out[1].to_string(), "(json 1 (a 2))");
    }

    #[test]
    fn string_escaping() {
        let json = r#"{"msg": "say \"hi\""}"#;
        let out = parse_json(&JsonConfig::default(), json).unwrap();
        assert_eq!(out[0].to_string(), r#"(msg "say \"hi\"")"#);
    }
}
