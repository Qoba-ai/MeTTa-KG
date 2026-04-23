/// N3 (Notation3) → S-expression conversion.
///
/// Matches the output of the Python `n3_to_metta.py` script:
///
/// - Each triple is wrapped in a graph label:
///   `((Graph <label>) (<subject> <predicate> <object>))`
/// - Default-graph triples use label `0`.
/// - Named-graph (formula) triples use the graph IRI or blank node ID.
/// - URI references are split at `#`:
///   `(uriref (<base_url> <fragment>))`
/// - Blank nodes: `(bnode <id>)` (unquoted)
/// - Literals: `((literal (<datatype> [<lang>])) "value")`
/// - Namespace prefixes are appended as:
///   `(Namespace ("<label>" "<iri>"))`
use oxrdf::{GraphName, Literal, NamedNode, NamedOrBlankNode, Term};
use oxrdfio::{RdfFormat, RdfParser};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::sexpr::SExpr;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct N3Config {
    // Reserved for future options (base IRI, namespace translation, etc.)
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Parse N3 from a string, collecting all results eagerly.
pub fn parse_n3(_cfg: &N3Config, input: &str) -> Result<Vec<SExpr>> {
    let mut parser = RdfParser::from_format(RdfFormat::N3)
        .with_base_iri("file:///input.n3")
        .map_err(|e| Error::Rdf(e.to_string()))?
        .for_reader(input.as_bytes());

    let mut out = Vec::new();
    for result in &mut parser {
        let quad = result.map_err(|e| Error::Rdf(e.to_string()))?;
        let graph_label = graph_name_label(&quad.graph_name);
        let s = named_or_blank_to_n3_sexpr(&quad.subject);
        let p = named_node_to_n3_sexpr(&quad.predicate);
        let o = term_to_n3_sexpr(&quad.object);
        out.push(SExpr::list([
            SExpr::list([SExpr::sym("Graph"), graph_label]),
            SExpr::list([s, p, o]),
        ]));
    }

    // Append namespace atoms collected during parsing
    for (label, iri) in parser.prefixes() {
        out.push(SExpr::list([
            SExpr::sym("Namespace"),
            SExpr::list([SExpr::str_val(label), SExpr::str_val(iri)]),
        ]));
    }

    Ok(out)
}

// ── N3-specific term converters ───────────────────────────────────────────────

fn graph_name_label(gn: &GraphName) -> SExpr {
    match gn {
        GraphName::DefaultGraph => SExpr::sym("0"),
        GraphName::NamedNode(n) => SExpr::sym(n.as_str()),
        GraphName::BlankNode(b) => SExpr::sym(b.as_str()),
    }
}

/// Split a URI at `#` into `(<base> <fragment>)`.
///
/// If no `#` is present the fragment is an empty symbol, matching Python's
/// `urldefrag` which always returns a two-tuple.
fn uri_parts(iri: &str) -> SExpr {
    if let Some(pos) = iri.rfind('#') {
        let base = &iri[..pos];
        let frag = &iri[pos + 1..];
        SExpr::list([SExpr::sym(base), SExpr::sym(frag)])
    } else {
        SExpr::list([SExpr::sym(iri), SExpr::sym("")])
    }
}

fn named_node_to_n3_sexpr(node: &NamedNode) -> SExpr {
    SExpr::list([SExpr::sym("uriref"), uri_parts(node.as_str())])
}

fn named_or_blank_to_n3_sexpr(node: &NamedOrBlankNode) -> SExpr {
    match node {
        NamedOrBlankNode::NamedNode(n) => named_node_to_n3_sexpr(n),
        NamedOrBlankNode::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::sym(b.as_str())])
        }
    }
}

fn literal_to_n3_sexpr(lit: &Literal) -> SExpr {
    let value = SExpr::str_val(lit.value());
    let datatype_sym = SExpr::sym(lit.datatype().as_str());
    let type_list = if let Some(lang) = lit.language() {
        SExpr::list([datatype_sym, SExpr::sym(lang)])
    } else {
        SExpr::list([datatype_sym])
    };
    SExpr::list([SExpr::list([SExpr::sym("literal"), type_list]), value])
}

fn term_to_n3_sexpr(term: &Term) -> SExpr {
    match term {
        Term::NamedNode(n) => named_node_to_n3_sexpr(n),
        Term::BlankNode(b) => {
            SExpr::list([SExpr::sym("bnode"), SExpr::sym(b.as_str())])
        }
        Term::Literal(l) => literal_to_n3_sexpr(l),
        #[allow(unreachable_patterns)]
        _ => SExpr::sym("_"),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_N3: &str = r#"
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex:   <http://example.com/> .

ex:alice foaf:name "Alice" .
ex:alice foaf:age  "30"^^<http://www.w3.org/2001/XMLSchema#integer> .
"#;

    #[test]
    fn parses_triples_as_graph_quads() {
        let out = parse_n3(&N3Config::default(), SIMPLE_N3).unwrap();
        // Should have 2 triples + 2 namespace atoms
        let triple_exprs: Vec<_> = out
            .iter()
            .filter(|e| e.to_string().starts_with("((Graph"))
            .collect();
        assert_eq!(triple_exprs.len(), 2);
    }

    #[test]
    fn default_graph_label_is_zero() {
        let out = parse_n3(&N3Config::default(), SIMPLE_N3).unwrap();
        let first = out[0].to_string();
        assert!(first.starts_with("((Graph 0)"), "expected Graph 0, got: {first}");
    }

    #[test]
    fn uri_split_at_hash() {
        let n3 = "@prefix ex: <http://example.com/> .\nex:a ex:b ex:c .\n";
        let out = parse_n3(&N3Config::default(), n3).unwrap();
        let s = out[0].to_string();
        // URIs like http://example.com/a have no #, so fragment is empty symbol
        assert!(s.contains("uriref"), "{s}");
    }

    #[test]
    fn namespace_atoms_appended() {
        let out = parse_n3(&N3Config::default(), SIMPLE_N3).unwrap();
        let ns_atoms: Vec<_> = out
            .iter()
            .filter(|e| e.to_string().starts_with("(Namespace"))
            .collect();
        assert!(!ns_atoms.is_empty(), "expected Namespace atoms");
        let ns_str = ns_atoms[0].to_string();
        assert!(ns_str.contains("foaf") || ns_str.contains("ex"), "{ns_str}");
    }

    #[test]
    fn language_literal() {
        let n3 = "@prefix ex: <http://example.com/> .\nex:a ex:b \"hello\"@en .\n";
        let out = parse_n3(&N3Config::default(), n3).unwrap();
        let s = out[0].to_string();
        assert!(s.contains("langString"), "{s}");
        assert!(s.contains("en"), "{s}");
    }
}
