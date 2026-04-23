use std::fmt;
use std::sync::Arc;

use crate::sexpr::SExpr;

/// Identifies a column in the CSV source.
#[derive(Debug, Clone)]
pub enum ColumnSelector {
    ByName(String),
    ByIndex(usize),
}

/// Controls how a raw CSV field string is converted to an `SExpr` atom.
#[derive(Clone, Default)]
pub enum ValueType {
    /// Heuristic: integers and floats → `Symbol`; identifier-like strings
    /// (no whitespace, parens, quotes, or semicolons) → `Symbol`; everything
    /// else → quoted `Str`.
    #[default]
    Auto,
    /// Always produce `SExpr::Symbol` (unquoted).
    Symbol,
    /// Always produce `SExpr::Str` (quoted).
    Str,
    /// User-supplied transform closure.
    Custom(Arc<dyn Fn(&str) -> SExpr + Send + Sync>),
}

impl fmt::Debug for ValueType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValueType::Auto => write!(f, "Auto"),
            ValueType::Symbol => write!(f, "Symbol"),
            ValueType::Str => write!(f, "Str"),
            ValueType::Custom(_) => write!(f, "Custom(...)"),
        }
    }
}

impl ValueType {
    pub(crate) fn convert(&self, raw: &str) -> SExpr {
        match self {
            ValueType::Auto => auto_convert(raw),
            ValueType::Symbol => SExpr::sym(raw),
            ValueType::Str => SExpr::str_val(raw),
            ValueType::Custom(f) => f(raw),
        }
    }
}

fn auto_convert(s: &str) -> SExpr {
    if s.parse::<i64>().is_ok() || s.parse::<f64>().is_ok() {
        return SExpr::sym(s);
    }
    // Identifier-like: no whitespace, parens, quotes, or comment chars
    if !s.is_empty()
        && s.chars()
            .all(|c| !matches!(c, ' ' | '\t' | '\n' | '\r' | '(' | ')' | '"' | ';'))
    {
        return SExpr::sym(s);
    }
    SExpr::str_val(s)
}

/// Full per-column configuration, built with a fluent API.
///
/// # Examples
/// ```
/// use csv_sexpr::ColumnSpec;
///
/// // Select by header name, always emit as a quoted string
/// let spec = ColumnSpec::by_name("email").as_str();
///
/// // Select by index, apply a custom transform
/// let spec = ColumnSpec::by_index(2)
///     .label("score")
///     .with_transform(|v| {
///         let n: f64 = v.parse().unwrap_or(0.0);
///         csv_sexpr::SExpr::sym(format!("{:.2}", n))
///     });
/// ```
#[derive(Debug, Clone)]
pub struct ColumnSpec {
    pub selector: ColumnSelector,
    /// Override the label used in output (defaults to the CSV header or `colN`).
    pub label: Option<String>,
    pub value_type: ValueType,
}

impl ColumnSpec {
    pub fn by_name(name: impl Into<String>) -> Self {
        ColumnSpec {
            selector: ColumnSelector::ByName(name.into()),
            label: None,
            value_type: ValueType::Auto,
        }
    }

    pub fn by_index(idx: usize) -> Self {
        ColumnSpec {
            selector: ColumnSelector::ByIndex(idx),
            label: None,
            value_type: ValueType::Auto,
        }
    }

    /// Override the output label for this column.
    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }

    /// Emit values as unquoted symbols.
    pub fn as_symbol(mut self) -> Self {
        self.value_type = ValueType::Symbol;
        self
    }

    /// Emit values as quoted strings.
    pub fn as_str(mut self) -> Self {
        self.value_type = ValueType::Str;
        self
    }

    /// Apply a custom closure to convert raw field text to an `SExpr`.
    pub fn with_transform(mut self, f: impl Fn(&str) -> SExpr + Send + Sync + 'static) -> Self {
        self.value_type = ValueType::Custom(Arc::new(f));
        self
    }
}
