# example files from https://jsonld.com/person/ and https://en.wikipedia.org/wiki/JSON-LD

import unittest
from translations.src.jsonld_to_metta import *
from translations.src.csv_to_metta import parse_metta


class TranslateJSONLD(unittest.TestCase):
    def test_JSONLD_to_graph(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)
        self.assertEqual(3, len(g))
        self.assertSetEqual({(rdflib.term.URIRef('https://me.example.com'), rdflib.term.URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/Person')),
                             (rdflib.term.URIRef('https://me.example.com'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/name'), rdflib.term.Literal('John Smith')),
                             (rdflib.term.URIRef('https://me.example.com'), rdflib.term.URIRef('http://xmlns.com/foaf/0.1/workplaceHomepage'), rdflib.term.URIRef('https://www.example.com/'))},
                            {(s, p, o) for s, p, o in g})

    def test_graph_to_mettastr(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)
        self.assertSetEqual({'((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/workplaceHomepage) (uriref https://www.example.com/))',
                             '((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "John Smith"))',
                             '((uriref https://me.example.com) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))'},
                            set(graph_to_mettastr(g).split("\n")))

    def test_metta_to_graph(self):
        m = parse_metta('((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/workplaceHomepage) (uriref https://www.example.com/))\n'
                        '((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "John Smith"))\n'
                        '((uriref https://me.example.com) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))')

        self.assertSetEqual({(rdflib.term.URIRef('https://me.example.com'),
                              rdflib.term.URIRef('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                              rdflib.term.URIRef('http://xmlns.com/foaf/0.1/Person')),
                             (rdflib.term.URIRef('https://me.example.com'),
                              rdflib.term.URIRef('http://xmlns.com/foaf/0.1/name'), rdflib.term.Literal('John Smith')),
                             (rdflib.term.URIRef('https://me.example.com'),
                              rdflib.term.URIRef('http://xmlns.com/foaf/0.1/workplaceHomepage'),
                              rdflib.term.URIRef('https://www.example.com/'))},
                            {(s, p, o) for s, p, o in metta_to_graph(m)})

    def test_back_forth(self):
        # works, but context disappears -> try to fix

        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)

        self.assertEqual({(s, p, o) for s, p, o in g},
                         {(s, p, o) for s, p, o in metta_to_graph(parse_metta(graph_to_mettastr(g)))})

        m = ('((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/workplaceHomepage) (uriref https://www.example.com/))\n'
            '((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "John Smith"))\n'
            '((uriref https://me.example.com) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))')

        self.assertEqual(set(m.split('\n')), set(graph_to_mettastr(metta_to_graph(parse_metta(m))).split('\n')))

    def test_serialize(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)

        self.assertEqual(('[\n'
                          '  {\n'
                          '    "@id": "https://me.example.com",\n'
                          '    "@type": [\n'
                          '      "http://xmlns.com/foaf/0.1/Person"\n'
                          '    ],\n'
                          '    "http://xmlns.com/foaf/0.1/name": [\n'
                          '      {\n'
                          '        "@value": "John Smith"\n'
                          '      }\n'
                          '    ],\n'
                          '    "http://xmlns.com/foaf/0.1/workplaceHomepage": [\n'
                          '      {\n'
                          '        "@id": "https://www.example.com/"\n'
                          '      }\n'
                          '    ]\n'
                          '  }\n'
                          ']'),
                         g.serialize(format="json-ld"))


if __name__ == '__main__':
    unittest.main()
