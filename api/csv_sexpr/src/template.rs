use std::fmt;
use std::sync::Arc;

use crate::column::ColumnSelector;
use crate::sexpr::SExpr;

/// A resolved row: ordered `(label, value)` pairs ready for template application.
pub type RowFields = Vec<(String, SExpr)>;

/// Defines the shape of S-expressions produced for each CSV row.
///
/// Every variant except `Flat` and `Custom` wraps all per-row output in a
/// single `SExpr::List`. `Flat` emits one expression per field. `Custom` can
/// emit any number of expressions.
///
/// # Examples
///
/// Given a CSV row `id=alice, age=30, role=admin`:
///
/// | Template | Output |
/// |---|---|
/// | `Record { head: sym("Person") }` | `(Person alice 30 admin)` |
/// | `Assoc { head: sym("Person") }` | `(Person (id alice) (age 30) (role admin))` |
/// | `Flat` | `(alice 30 admin)` |
/// | `EntityAttrVal { id_col: ByName("id") }` | `(alice age 30)` `(alice role admin)` |
/// | `MeTTaFacts { id_col: ByName("id") }` | `(= (age alice) 30)` `(= (role alice) admin)` |
#[derive(Clone)]
pub enum RowTemplate {
    /// `(head v1 v2 … vN)` — positional record with a head symbol.
    Record { head: SExpr },

    /// `(head (label1 v1) (label2 v2) … (labelN vN))` — associative record.
    Assoc { head: SExpr },

    /// `(v1 v2 … vN)` — bare list, no head symbol.
    Flat,

    /// For each non-id column: `(id_val label val)` — EAV triple.
    EntityAttrVal { id_col: ColumnSelector },

    /// For each non-id column: `(= (label id_val) val)` — MeTTa-style facts.
    MeTTaFacts { id_col: ColumnSelector },

    /// Fully user-supplied: receives `(label, value)` pairs for the row and
    /// returns zero or more `SExpr`s to emit.
    Custom(Arc<dyn Fn(&RowFields) -> Vec<SExpr> + Send + Sync>),
}

impl fmt::Debug for RowTemplate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RowTemplate::Record { head } => write!(f, "Record({head})"),
            RowTemplate::Assoc { head } => write!(f, "Assoc({head})"),
            RowTemplate::Flat => write!(f, "Flat"),
            RowTemplate::EntityAttrVal { id_col } => {
                write!(f, "EntityAttrVal(id_col={id_col:?})")
            }
            RowTemplate::MeTTaFacts { id_col } => write!(f, "MeTTaFacts(id_col={id_col:?})"),
            RowTemplate::Custom(_) => write!(f, "Custom(...)"),
        }
    }
}

impl RowTemplate {
    pub(crate) fn apply(&self, fields: &RowFields) -> Vec<SExpr> {
        match self {
            RowTemplate::Record { head } => {
                let mut items = vec![head.clone()];
                items.extend(fields.iter().map(|(_, v)| v.clone()));
                vec![SExpr::list(items)]
            }

            RowTemplate::Assoc { head } => {
                let pairs: Vec<SExpr> = fields
                    .iter()
                    .map(|(k, v)| SExpr::list([SExpr::sym(k), v.clone()]))
                    .collect();
                let mut items = vec![head.clone()];
                items.extend(pairs);
                vec![SExpr::list(items)]
            }

            RowTemplate::Flat => {
                vec![SExpr::list(fields.iter().map(|(_, v)| v.clone()))]
            }

            RowTemplate::EntityAttrVal { id_col } => {
                let (id_pos, id_val) = find_id(id_col, fields);
                fields
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| Some(*i) != id_pos)
                    .map(|(_, (label, val))| {
                        SExpr::list([id_val.clone(), SExpr::sym(label), val.clone()])
                    })
                    .collect()
            }

            RowTemplate::MeTTaFacts { id_col } => {
                let (id_pos, id_val) = find_id(id_col, fields);
                fields
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| Some(*i) != id_pos)
                    .map(|(_, (label, val))| {
                        SExpr::list([
                            SExpr::sym("="),
                            SExpr::list([SExpr::sym(label), id_val.clone()]),
                            val.clone(),
                        ])
                    })
                    .collect()
            }

            RowTemplate::Custom(f) => f(fields),
        }
    }
}

/// Resolve the id column: returns its position index and value (or `_` if absent).
fn find_id(sel: &ColumnSelector, fields: &RowFields) -> (Option<usize>, SExpr) {
    match sel {
        ColumnSelector::ByName(name) => {
            if let Some(pos) = fields.iter().position(|(k, _)| k == name) {
                (Some(pos), fields[pos].1.clone())
            } else {
                (None, SExpr::sym("_"))
            }
        }
        ColumnSelector::ByIndex(idx) => {
            if let Some(field) = fields.get(*idx) {
                (Some(*idx), field.1.clone())
            } else {
                (None, SExpr::sym("_"))
            }
        }
    }
}
