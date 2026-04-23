use std::fmt;

/// An S-expression value.
#[derive(Debug, Clone, PartialEq)]
pub enum SExpr {
    /// An unquoted atom / symbol: `foo`, `42`, `my-entity`.
    Symbol(String),
    /// A quoted string: `"hello world"`.
    Str(String),
    /// A parenthesised list: `(a b c)`.
    List(Vec<SExpr>),
}

impl SExpr {
    /// Create a `Symbol` atom.
    pub fn sym(s: impl Into<String>) -> Self {
        SExpr::Symbol(s.into())
    }

    /// Create a quoted `Str` atom.
    pub fn str_val(s: impl Into<String>) -> Self {
        SExpr::Str(s.into())
    }

    /// Create a `List` from any iterable of `SExpr`.
    pub fn list(items: impl IntoIterator<Item = SExpr>) -> Self {
        SExpr::List(items.into_iter().collect())
    }

    /// The empty list `()`.
    pub fn nil() -> Self {
        SExpr::List(vec![])
    }

    /// Returns `true` if this is the empty list.
    pub fn is_nil(&self) -> bool {
        matches!(self, SExpr::List(v) if v.is_empty())
    }
}

impl fmt::Display for SExpr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SExpr::Symbol(s) => write!(f, "{s}"),
            SExpr::Str(s) => {
                write!(f, "\"")?;
                for c in s.chars() {
                    match c {
                        '"' => write!(f, "\\\"")?,
                        '\\' => write!(f, "\\\\")?,
                        '\n' => write!(f, "\\n")?,
                        '\r' => write!(f, "\\r")?,
                        '\t' => write!(f, "\\t")?,
                        other => write!(f, "{other}")?,
                    }
                }
                write!(f, "\"")
            }
            SExpr::List(items) => {
                write!(f, "(")?;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        write!(f, " ")?;
                    }
                    write!(f, "{item}")?;
                }
                write!(f, ")")
            }
        }
    }
}

impl From<String> for SExpr {
    fn from(s: String) -> Self {
        SExpr::Str(s)
    }
}

impl From<&str> for SExpr {
    fn from(s: &str) -> Self {
        SExpr::Str(s.to_string())
    }
}

impl From<i64> for SExpr {
    fn from(n: i64) -> Self {
        SExpr::Symbol(n.to_string())
    }
}

impl From<f64> for SExpr {
    fn from(n: f64) -> Self {
        SExpr::Symbol(n.to_string())
    }
}

impl From<bool> for SExpr {
    fn from(b: bool) -> Self {
        SExpr::Symbol(if b { "True" } else { "False" }.to_string())
    }
}
