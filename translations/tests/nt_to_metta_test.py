import unittest
from translations.src.nt_to_metta import *
from rdflib.term import URIRef, Literal
from translations.src.csv_to_metta import parse_metta


class ReadNT(unittest.TestCase):
    def test_nt_to_tuples(self):
        wiki_ex = parse_nt2("wiki_example.nt")
        self.assertSetEqual({('(BNode art)', URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), URIRef('http://xmlns.com/foaf/0.1/Person')),
                          (URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), URIRef('http://xmlns.com/foaf/0.1/Document')),
                          ('(BNode dave)', URIRef('http://xmlns.com/foaf/0.1/name'), Literal('Dave Beckett')),
                          (URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), URIRef('http://xmlns.com/foaf/0.1/maker'), '(BNode dave)'),
                          (URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), URIRef('http://xmlns.com/foaf/0.1/maker'), '(BNode art)'),
                          (URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), URIRef('http://purl.org/dc/terms/title'), Literal('N-Triples', lang='en-US')),
                          ('(BNode dave)', URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), URIRef('http://xmlns.com/foaf/0.1/Person')),
                          ('(BNode art)', URIRef('http://xmlns.com/foaf/0.1/name'), Literal('Art Barstow'))},
                         set(graph_to_tuples_2(*wiki_ex)))

    def test_tuples_to_metta(self):
        wiki_ex = parse_nt2("wiki_example.nt")
        self.assertSetEqual({'("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://xmlns.com/foaf/0.1/maker" "(BNode dave)")',
                         '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://xmlns.com/foaf/0.1/maker" "(BNode art)")',
                         '("(BNode art)" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Person")',
                         '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Document")',
                         '("(BNode art)" "http://xmlns.com/foaf/0.1/name" "Art Barstow")',
                         '("(BNode dave)" "http://xmlns.com/foaf/0.1/name" "Dave Beckett")',
                         '("(BNode dave)" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Person")',
                         '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://purl.org/dc/terms/title" "N-Triples")'},
                            set(tuples_to_metta(graph_to_tuples_2(*wiki_ex)).split('\n')))  # add assertion here

    def test_graph_to_metta(self):
        graph, bnodes = parse_nt2("wiki_example.nt")

        self.assertSetEqual(set(('((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "art"))\n'
                          '((bnode "art") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Art Barstow"))\n'
                          '((bnode "dave") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Dave Beckett"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "dave"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Document))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://purl.org/dc/terms/title) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en-US)) "N-Triples"))\n'
                          '((bnode "dave") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))\n'
                          '((bnode "art") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))').split('\n')),
                         set((graph_to_mettastr(graph, bnodes)).split('\n')))

    def test_metta_to_graph(self):
        metta = parse_metta(('((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "art"))\n'
                          '((bnode "art") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Art Barstow"))\n'
                          '((bnode "dave") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Dave Beckett"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "dave"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Document))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://purl.org/dc/terms/title) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en-US)) "N-Triples"))\n'
                          '((bnode "dave") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))\n'
                          '((bnode "art") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))'))

        self.assertSetEqual({(rdflib.term.BNode('dave'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/name'), rdflib.term.Literal('Dave Beckett')),
                             (rdflib.term.BNode('art'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/name'), rdflib.term.Literal('Art Barstow')),
                             (rdflib.term.URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), rdflib.term.URIRef('http://purl.org/dc/terms/title'), rdflib.term.Literal('N-Triples', lang='en-US')),
                             (rdflib.term.URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/maker'), rdflib.term.BNode('art')),
                             (rdflib.term.BNode('dave'), rdflib.term.URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/Person')),
                             (rdflib.term.URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/maker'), rdflib.term.BNode('dave')),
                             (rdflib.term.URIRef('http://www.w3.org/2001/sw/RDFCore/ntriples/'), rdflib.term.URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/Document')),
                             (rdflib.term.BNode('art'), rdflib.term.URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/Person'))},
                            set([a for a in metta_to_graph(metta)]))

        self.assertEqual({'<http://www.w3.org/2001/sw/RDFCore/ntriples/> <http://xmlns.com/foaf/0.1/maker> _:art .',
                          '<http://www.w3.org/2001/sw/RDFCore/ntriples/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Document> .',
                          '<http://www.w3.org/2001/sw/RDFCore/ntriples/> <http://purl.org/dc/terms/title> "N-Triples"@en-US .',
                          '_:dave <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Person> .',
                          '_:art <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Person> .',
                          '<http://www.w3.org/2001/sw/RDFCore/ntriples/> <http://xmlns.com/foaf/0.1/maker> _:dave .',
                          '_:dave <http://xmlns.com/foaf/0.1/name> "Dave Beckett" .',
                          '_:art <http://xmlns.com/foaf/0.1/name> "Art Barstow" .'},
                         set(metta_to_graph(metta).serialize(format="nt").removesuffix('\n').split('\n')))


if __name__ == '__main__':
    unittest.main()
