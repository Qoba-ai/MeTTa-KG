/// JSON-LD → S-expression conversion.
///
/// Parses JSON-LD to RDF triples and emits one S-expression per triple,
/// matching the output of the Python `jsonld_to_metta.py` script:
///
/// - Each triple: `(subject predicate object)`
/// - URIs: `(uriref <iri>)`
/// - Blank nodes: `(bnode <id>)` (unquoted, per Python convention)
/// - Literals: `((literal (<datatype> [<lang>])) "value")`
///
/// Named graphs in the JSON-LD dataset are flattened to plain triples
/// (matching the Python script which uses rdflib.Graph, not ConjunctiveGraph).
use oxrdfio::{JsonLdProfileSet, RdfFormat, RdfParser};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::rdf::{named_or_blank_to_sexpr_unquoted_bn, named_node_to_sexpr, term_to_sexpr_unquoted_bn};
use crate::sexpr::SExpr;

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct JsonLdConfig {
    // Reserved for future options (context URL, profile, etc.)
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Parse JSON-LD from a string, collecting all results eagerly.
pub fn parse_jsonld(_cfg: &JsonLdConfig, input: &str) -> Result<Vec<SExpr>> {
    let parser = RdfParser::from_format(RdfFormat::JsonLd {
        profile: JsonLdProfileSet::empty(),
    })
    .for_reader(input.as_bytes());

    let mut out = Vec::new();
    for result in parser {
        let quad = result.map_err(|e| Error::Rdf(e.to_string()))?;
        out.push(SExpr::list([
            named_or_blank_to_sexpr_unquoted_bn(&quad.subject),
            named_node_to_sexpr(&quad.predicate),
            term_to_sexpr_unquoted_bn(&quad.object),
        ]));
    }
    Ok(out)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_triple() {
        let jsonld = r#"{
            "@context": {"name": "http://xmlns.com/foaf/0.1/name"},
            "@id": "http://example.com/alice",
            "name": "Alice"
        }"#;
        let out = parse_jsonld(&JsonLdConfig::default(), jsonld).unwrap();
        assert_eq!(out.len(), 1);
        let s = out[0].to_string();
        assert!(s.contains("uriref http://example.com/alice"), "{s}");
        assert!(s.contains("uriref http://xmlns.com/foaf/0.1/name"), "{s}");
        assert!(s.contains("\"Alice\""), "{s}");
    }

    #[test]
    fn blank_node_unquoted() {
        // A JSON-LD object without @id gets an auto-generated blank node
        let jsonld = r#"{
            "@context": {"name": "http://xmlns.com/foaf/0.1/name"},
            "name": "Bob"
        }"#;
        let out = parse_jsonld(&JsonLdConfig::default(), jsonld).unwrap();
        assert_eq!(out.len(), 1);
        let s = out[0].to_string();
        // blank node should appear as (bnode <id>) with unquoted id
        assert!(s.contains("(bnode "), "{s}");
        // id should NOT be quoted (no " around the bnode id)
        let bnode_part = &s[s.find("(bnode ").unwrap()..];
        let after_bnode = &bnode_part["(bnode ".len()..];
        assert!(!after_bnode.starts_with('"'), "bnode id should be unquoted in JSONLD: {s}");
    }
}
