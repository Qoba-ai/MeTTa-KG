use std::collections::HashMap;
use std::io::{BufReader, Read};
use std::path::Path;

use crate::column::{ColumnSelector, ColumnSpec, ValueType};
use crate::error::{Error, Result};
use crate::sexpr::SExpr;
use crate::template::{RowFields, RowTemplate};

// ── Builder ───────────────────────────────────────────────────────────────────

/// Builder and executor for CSV → S-expression parsing.
///
/// All setter methods consume and return `Self` for fluent chaining.
/// Call one of the `parse_*` methods to collect results eagerly, or
/// [`into_iter`](CsvParser::into_iter) to drive parsing lazily.
///
/// # Quick start
///
/// ```
/// use csv_sexpr::{CsvParser, SExpr, RowTemplate};
///
/// let csv = "name,age\nAlice,30\nBob,25\n";
///
/// let exprs = CsvParser::new()
///     .template(RowTemplate::Record { head: SExpr::sym("Person") })
///     .parse_str(csv)
///     .unwrap();
///
/// assert_eq!(exprs[0].to_string(), "(Person Alice 30)");
/// ```
#[derive(Clone)]
pub struct CsvParser {
    delimiter: u8,
    quote: u8,
    has_headers: bool,
    flexible: bool,
    comment: Option<u8>,
    trim: csv::Trim,
    null_sentinels: Vec<String>,
    skip_empty_rows: bool,
    columns: Vec<ColumnSpec>,
    template: RowTemplate,
}

impl Default for CsvParser {
    fn default() -> Self {
        Self::new()
    }
}

impl CsvParser {
    /// Create a parser with sensible defaults:
    /// - comma delimiter, double-quote quoting, headers enabled
    /// - `""`, `"NULL"`, `"null"`, `"NA"`, `"N/A"` treated as null
    /// - empty rows skipped
    /// - `Flat` row template
    pub fn new() -> Self {
        Self {
            delimiter: b',',
            quote: b'"',
            has_headers: true,
            flexible: false,
            comment: None,
            trim: csv::Trim::None,
            null_sentinels: vec![
                String::new(),
                "NULL".into(),
                "null".into(),
                "NA".into(),
                "N/A".into(),
            ],
            skip_empty_rows: true,
            columns: vec![],
            template: RowTemplate::Flat,
        }
    }

    // ── CSV reader options ────────────────────────────────────────────────────

    /// Field delimiter byte (default: `b','`).
    pub fn delimiter(mut self, d: u8) -> Self {
        self.delimiter = d;
        self
    }

    /// Quote character byte (default: `b'"'`).
    pub fn quote(mut self, q: u8) -> Self {
        self.quote = q;
        self
    }

    /// Whether the first row contains headers (default: `true`).
    pub fn has_headers(mut self, v: bool) -> Self {
        self.has_headers = v;
        self
    }

    /// Allow rows with a variable number of fields (default: `false`).
    pub fn flexible(mut self, v: bool) -> Self {
        self.flexible = v;
        self
    }

    /// Byte that starts a comment line (e.g. `b'#'`). No comment detection by default.
    pub fn comment(mut self, c: u8) -> Self {
        self.comment = Some(c);
        self
    }

    /// Whitespace trimming behaviour for headers and/or field values.
    pub fn trim(mut self, t: csv::Trim) -> Self {
        self.trim = t;
        self
    }

    // ── Null / empty-row handling ─────────────────────────────────────────────

    /// Replace the default null-sentinel list with a custom set.
    pub fn null_sentinels(mut self, vals: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.null_sentinels = vals.into_iter().map(Into::into).collect();
        self
    }

    /// Append a single null sentinel to the existing list.
    pub fn null_sentinel(mut self, s: impl Into<String>) -> Self {
        self.null_sentinels.push(s.into());
        self
    }

    /// Skip rows where every field is whitespace-only (default: `true`).
    pub fn skip_empty_rows(mut self, v: bool) -> Self {
        self.skip_empty_rows = v;
        self
    }

    // ── Column selection ──────────────────────────────────────────────────────

    /// Add a column to include in output.
    ///
    /// If no columns are added, all CSV columns are included in order.
    pub fn column(mut self, spec: ColumnSpec) -> Self {
        self.columns.push(spec);
        self
    }

    // ── Row template ──────────────────────────────────────────────────────────

    /// Set the row template that controls the shape of output expressions.
    pub fn template(mut self, t: RowTemplate) -> Self {
        self.template = t;
        self
    }

    // ── Streaming execution ───────────────────────────────────────────────────

    /// Consume the parser and return a lazy row iterator over `reader`.
    ///
    /// Each `next()` call reads and processes one CSV data row, yielding
    /// the S-expressions produced by the template for that row.  No results
    /// are buffered beyond the current row.
    ///
    /// ```
    /// use csv_sexpr::{CsvParser, SExpr, RowTemplate};
    ///
    /// let csv = "x,y\n1,2\n3,4\n";
    /// let mut iter = CsvParser::new()
    ///     .template(RowTemplate::Record { head: SExpr::sym("Point") })
    ///     .into_iter(csv.as_bytes())
    ///     .unwrap();
    ///
    /// assert_eq!(iter.next().unwrap().unwrap()[0].to_string(), "(Point 1 2)");
    /// assert_eq!(iter.next().unwrap().unwrap()[0].to_string(), "(Point 3 4)");
    /// assert!(iter.next().is_none());
    /// ```
    pub fn into_iter<R: Read>(self, reader: R) -> Result<CsvRowIter<R>> {
        let Self {
            delimiter,
            quote,
            has_headers,
            flexible,
            comment,
            trim,
            null_sentinels,
            skip_empty_rows,
            columns,
            template,
        } = self;

        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(delimiter)
            .quote(quote)
            .has_headers(has_headers)
            .flexible(flexible)
            .comment(comment)
            .trim(trim)
            .from_reader(reader);

        // Resolve headers before consuming the reader into its record iterator.
        let headers: Vec<String> = if has_headers {
            rdr.headers()?.iter().map(|s| s.to_string()).collect()
        } else {
            vec![]
        };

        // Validate: ByName selectors require headers.
        if !has_headers {
            for spec in &columns {
                if let ColumnSelector::ByName(_) = &spec.selector {
                    return Err(Error::MissingHeaders);
                }
            }
            match &template {
                RowTemplate::EntityAttrVal { id_col: ColumnSelector::ByName(_) }
                | RowTemplate::MeTTaFacts { id_col: ColumnSelector::ByName(_) } => {
                    return Err(Error::MissingHeaders);
                }
                _ => {}
            }
        }

        let header_index: HashMap<String, usize> =
            headers.iter().cloned().enumerate().map(|(i, h)| (h, i)).collect();

        Ok(CsvRowIter {
            records: rdr.into_records(),
            headers,
            header_index,
            columns,
            template,
            null_sentinels,
            skip_empty: skip_empty_rows,
        })
    }

    // ── Eager execution ───────────────────────────────────────────────────────

    /// Parse CSV from a string slice, collecting all results.
    pub fn parse_str(self, s: &str) -> Result<Vec<SExpr>> {
        self.parse_reader(s.as_bytes())
    }

    /// Parse CSV from a file path, collecting all results.
    pub fn parse_file(self, path: impl AsRef<Path>) -> Result<Vec<SExpr>> {
        let file = std::fs::File::open(path.as_ref())?;
        self.parse_reader(BufReader::new(file))
    }

    /// Parse CSV from any `Read` source, collecting all results.
    pub fn parse_reader<R: Read>(self, reader: R) -> Result<Vec<SExpr>> {
        let mut out = Vec::new();
        for result in self.into_iter(reader)? {
            out.extend(result?);
        }
        Ok(out)
    }
}

// ── CsvRowIter ────────────────────────────────────────────────────────────────

/// A lazy row-by-row iterator produced by [`CsvParser::into_iter`].
///
/// Each item is `Result<Vec<SExpr>>` — the S-expressions the template
/// produces for one CSV data row.  An `Err` is returned if the CSV reader
/// encounters a parse error or a column selector fails to resolve.
///
/// Because the iterator yields a `Vec` per row rather than individual
/// expressions, templates that produce multiple expressions per row (e.g.
/// [`RowTemplate::MeTTaFacts`]) are handled correctly.  To flatten to a
/// single `SExpr` per `next()` call, call `.flat_map(|r| r.unwrap())` or
/// use the config-level [`parse_iter`](crate::parse_iter) function.
pub struct CsvRowIter<R: Read> {
    records: csv::StringRecordsIntoIter<R>,
    headers: Vec<String>,
    header_index: HashMap<String, usize>,
    columns: Vec<ColumnSpec>,
    template: RowTemplate,
    null_sentinels: Vec<String>,
    skip_empty: bool,
}

impl<R: Read> Iterator for CsvRowIter<R> {
    type Item = Result<Vec<SExpr>>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let record = match self.records.next()? {
                Ok(r) => r,
                Err(e) => return Some(Err(Error::Csv(e))),
            };

            if self.skip_empty && record.iter().all(|f| f.trim().is_empty()) {
                continue;
            }

            return Some(
                resolve_fields(
                    &record,
                    &self.columns,
                    &self.headers,
                    &self.header_index,
                    &self.null_sentinels,
                )
                .map(|fields| self.template.apply(&fields)),
            );
        }
    }
}

// ── Field resolution (shared) ─────────────────────────────────────────────────

pub(crate) fn resolve_fields(
    record: &csv::StringRecord,
    columns: &[ColumnSpec],
    headers: &[String],
    header_index: &HashMap<String, usize>,
    null_sentinels: &[String],
) -> Result<RowFields> {
    let is_null = |raw: &str| null_sentinels.iter().any(|s| s == raw);

    if columns.is_empty() {
        return Ok(record
            .iter()
            .enumerate()
            .filter_map(|(i, raw)| {
                if is_null(raw) {
                    return None;
                }
                let label = headers.get(i).cloned().unwrap_or_else(|| format!("col{i}"));
                Some((label, ValueType::Auto.convert(raw)))
            })
            .collect());
    }

    let mut fields = Vec::with_capacity(columns.len());
    for spec in columns {
        let idx = match &spec.selector {
            ColumnSelector::ByName(n) => header_index
                .get(n.as_str())
                .copied()
                .ok_or_else(|| Error::ColumnNotFound(n.clone()))?,
            ColumnSelector::ByIndex(i) => *i,
        };

        let raw = record
            .get(idx)
            .ok_or_else(|| Error::IndexOutOfRange(idx, record.len()))?;

        if is_null(raw) {
            continue;
        }

        let label = spec
            .label
            .clone()
            .or_else(|| headers.get(idx).cloned())
            .unwrap_or_else(|| format!("col{idx}"));

        fields.push((label, spec.value_type.convert(raw)));
    }
    Ok(fields)
}
