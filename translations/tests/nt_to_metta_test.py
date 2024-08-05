import unittest
from translations.src.nt_to_metta import *
from rdflib.term import URIRef, Literal


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


if __name__ == '__main__':
    unittest.main()
