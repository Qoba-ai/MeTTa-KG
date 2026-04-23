/// Shared RDF term → S-expression helpers and the N-Triples parser.
///
/// All RDF formats produce triples/quads whose terms are converted using the
/// helpers below.  The exact output format matches the Python translation
/// scripts in `translations/src/`.
///
/// | RDF term            | S-expression                                             |
/// |---------------------|----------------------------------------------------------|
/// | URI reference       | `(uriref <iri>)`                                         |
/// | Blank node          | `(bnode "<id>")` (quoted)                                |
/// | Plain literal       | `((literal (xsd:string)) "value")`                       |
/// | Typed literal       | `((literal (<datatype_iri>)) "value")`                   |
/// | Language literal    | `((literal (rdf:langString <lang>)) "value")`            |
///
/// Each NT triple is emitted as `(subject predicate object)`.
use oxrdf::{GraphName, Literal, NamedNode, NamedOrBlankNode, Term};
use oxrdfio::{RdfFormat, RdfParser};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::sexpr::SExpr;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NtConfig {
    // Reserved for future options (base IRI, prefix shortening, etc.)
}

// ── Public entry points ───────────────────────────────────────────────────────

/// Parse N-Triples from a string, collecting all triples eagerly.
///
/// Each triple is emitted as `(subject predicate object)`.
pub fn parse_nt(_cfg: &NtConfig, input: &str) -> Result<Vec<SExpr>> {
    nt_iter(input.as_bytes()).collect()
}

/// Return a lazy iterator over N-Triple S-expressions.
pub fn nt_iter<R: std::io::Read>(reader: R) -> NtIter<R> {
    NtIter {
        inner: RdfParser::from_format(RdfFormat::NTriples).for_reader(reader),
    }
}

// ── NtIter ────────────────────────────────────────────────────────────────────

pub struct NtIter<R: std::io::Read> {
    inner: oxrdfio::ReaderQuadParser<R>,
}

impl<R: std::io::Read> Iterator for NtIter<R> {
    type Item = Result<SExpr>;

    fn next(&mut self) -> Option<Self::Item> {
        let result = self.inner.next()?;
        Some(match result {
            Err(e) => Err(Error::Rdf(e.to_string())),
            Ok(quad) => Ok(SExpr::list([
                named_or_blank_to_sexpr_quoted_bn(&quad.subject),
                named_node_to_sexpr(&quad.predicate),
                term_to_sexpr_quoted_bn(&quad.object),
            ])),
        })
    }
}

// ── Shared term converters ────────────────────────────────────────────────────

/// `(uriref <iri>)` — IRI is an unquoted symbol.
pub fn named_node_to_sexpr(node: &NamedNode) -> SExpr {
    SExpr::list([SExpr::sym("uriref"), SExpr::sym(node.as_str())])
}

/// `(bnode "<id>")` — ID is quoted (NT convention, matches Python nt_to_metta).
pub fn named_or_blank_to_sexpr_quoted_bn(node: &NamedOrBlankNode) -> SExpr {
    match node {
        NamedOrBlankNode::NamedNode(n) => named_node_to_sexpr(n),
        NamedOrBlankNode::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::str_val(b.as_str())])
        }
    }
}

/// `(bnode <id>)` — ID is unquoted (JSON-LD / N3 convention).
pub fn named_or_blank_to_sexpr_unquoted_bn(node: &NamedOrBlankNode) -> SExpr {
    match node {
        NamedOrBlankNode::NamedNode(n) => named_node_to_sexpr(n),
        NamedOrBlankNode::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::sym(b.as_str())])
        }
    }
}

/// Convert a `GraphName` to an unquoted symbol label (used by N3).
pub fn graph_name_label(gn: &GraphName) -> SExpr {
    match gn {
        GraphName::DefaultGraph => SExpr::sym("0"),
        GraphName::NamedNode(n) => SExpr::sym(n.as_str()),
        GraphName::BlankNode(b) => SExpr::sym(b.as_str()),
    }
}

pub fn literal_to_sexpr(lit: &Literal) -> SExpr {
    let value = SExpr::str_val(lit.value());
    let datatype_sym = SExpr::sym(lit.datatype().as_str());

    let type_list = if let Some(lang) = lit.language() {
        SExpr::list([datatype_sym, SExpr::sym(lang)])
    } else {
        SExpr::list([datatype_sym])
    };

    SExpr::list([SExpr::list([SExpr::sym("literal"), type_list]), value])
}

pub fn term_to_sexpr_quoted_bn(term: &Term) -> SExpr {
    match term {
        Term::NamedNode(n) => named_node_to_sexpr(n),
        Term::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::str_val(b.as_str())])
        }
        Term::Literal(l) => literal_to_sexpr(l),
        #[allow(unreachable_patterns)]
        _ => SExpr::sym("_"),
    }
}

pub fn term_to_sexpr_unquoted_bn(term: &Term) -> SExpr {
    match term {
        Term::NamedNode(n) => named_node_to_sexpr(n),
        Term::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::sym(b.as_str())])
        }
        Term::Literal(l) => literal_to_sexpr(l),
        #[allow(unreachable_patterns)]
        _ => SExpr::sym("_"),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_triple() {
        let nt = "<http://example.com/a> <http://example.com/b> <http://example.com/c> .\n";
        let out = parse_nt(&NtConfig::default(), nt).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0].to_string(),
            "((uriref http://example.com/a) (uriref http://example.com/b) (uriref http://example.com/c))"
        );
    }

    #[test]
    fn blank_node_and_literal() {
        let nt = "_:a <http://xmlns.com/foaf/0.1/name> \"Alice\" .\n";
        let out = parse_nt(&NtConfig::default(), nt).unwrap();
        assert_eq!(out.len(), 1);
        let s = out[0].to_string();
        assert!(s.starts_with("((bnode"), "subject should be bnode: {s}");
        assert!(s.contains("(uriref http://xmlns.com/foaf/0.1/name)"), "{s}");
        assert!(s.contains("\"Alice\""), "{s}");
    }

    #[test]
    fn typed_literal() {
        let nt = "_:a <http://example.com/age> \"30\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n";
        let out = parse_nt(&NtConfig::default(), nt).unwrap();
        let s = out[0].to_string();
        assert!(s.contains("xsd") || s.contains("XMLSchema"), "{s}");
        assert!(s.contains("\"30\""), "{s}");
    }

    #[test]
    fn language_literal() {
        let nt = "_:a <http://example.com/note> \"hello\"@en .\n";
        let out = parse_nt(&NtConfig::default(), nt).unwrap();
        let s = out[0].to_string();
        assert!(s.contains("langString"), "{s}");
        assert!(s.contains("en"), "{s}");
        assert!(s.contains("\"hello\""), "{s}");
    }
}
