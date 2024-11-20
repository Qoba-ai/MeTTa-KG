import unittest
from io import StringIO

from translations.src.nt_to_metta import *
from rdflib.term import URIRef, Literal
from translations.src.csv_to_metta import parse_metta


class ReadNT(unittest.TestCase):
    def test_graph_to_metta(self):
        graph, bnodes = parse_nt("test_files/nt_files/wiki_example.nt")

        self.assertSetEqual(set(('((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "art"))\n'
                          '((bnode "art") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Art Barstow"))\n'
                          '((bnode "dave") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Dave Beckett"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://xmlns.com/foaf/0.1/maker) (bnode "dave"))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Document))\n'
                          '((uriref http://www.w3.org/2001/sw/RDFCore/ntriples/) (uriref http://purl.org/dc/terms/title) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en-US)) "N-Triples"))\n'
                          '((bnode "dave") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))\n'
                          '((bnode "art") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))').split('\n')),
                         set((graph_to_mettastr(graph, bnodes)).split('\n')))

        graph2, bnodes2 = parse_nt("test_files/nt_files/jena_res.nt")
        self.assertEqual(
            {'((uriref http://example/b) (uriref http://xmlns.com/foaf/0.1/knows) (uriref http://example/a))',
             '((uriref http://example/book) (uriref http://purl.org/dc/elements/1.1/author) (bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffe"))',
             '((uriref http://example/a) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))',
             '((bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7fff") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Bob"))',
             '((uriref http://example/a) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Alice"))',
             '((bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffe") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#rest) (bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffd"))',
             '((bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffe") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#first) (uriref http://example/a))',
             '((uriref http://example/a) (uriref http://xmlns.com/foaf/0.1/knows) (bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7fff"))',
             '((bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffd") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#rest) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#nil))',
             '((bnode "BX2Dc2b3371X3A13cf8faaf53X3AX2D7ffd") (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#first) (uriref http://example/b))'},
            set(graph_to_mettastr(graph2, bnodes2).split('\n')))

        graph3, bnodes3 = parse_nt("test_files/nt_files/AliceBob.nt")

        self.assertEqual({'((bnode "a") (uriref http://xmlns.com/foaf/0.1/interest) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en)) "Reading books"))',
                            '((bnode "a") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Alice"))',
                            '((bnode "b") (uriref http://xmlns.com/foaf/0.1/interest) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en)) "Hiking"))',
                            '((bnode "b") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Bob"))',
                            '((bnode "b") (uriref http://xmlns.com/foaf/0.1/age) ((literal (http://www.w3.org/2001/XMLSchema#integer)) "30"))',
                            '((bnode "a") (uriref http://xmlns.com/foaf/0.1/knows) (bnode "b"))',
                            '((bnode "b") (uriref http://xmlns.com/foaf/0.1/knows) (bnode "a"))',
                            '((bnode "a") (uriref http://xmlns.com/foaf/0.1/age) ((literal (http://www.w3.org/2001/XMLSchema#integer)) "25"))'},
                         set(graph_to_mettastr(graph3, bnodes3).split('\n')))


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
