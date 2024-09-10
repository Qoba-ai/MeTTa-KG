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


    def test_graph_to_mettastr_with_context(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)
        with open("wiki_example.jsonld") as f:
            c = read_context(f)     # context is not explicitly saved using the rdflib library

        self.assertSetEqual({'((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/workplaceHomepage) (uriref https://www.example.com/))',
                             '((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "John Smith"))',
                             '((uriref https://me.example.com) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))',
                             '(context ((name http://xmlns.com/foaf/0.1/name) (homepage ((@id http://xmlns.com/foaf/0.1/workplaceHomepage) (@type @id))) (Person http://xmlns.com/foaf/0.1/Person)))'},
                            set(graph_to_mettastr(g, c).split('\n')))


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
                            {(s, p, o) for s, p, o in metta_to_graph(m)[0]})

    def test_metta_to_graph_context(self):
        m = parse_metta('((name http://xmlns.com/foaf/0.1/name) (homepage ((@id http://xmlns.com/foaf/0.1/workplaceHomepage) (@type @id))) (Person http://xmlns.com/foaf/0.1/Person))')
        c = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)][0]

        self.assertEqual({'name': 'http://xmlns.com/foaf/0.1/name',
                          'homepage': {'@id': 'http://xmlns.com/foaf/0.1/workplaceHomepage',
                                       '@type': '@id'},
                          'Person': 'http://xmlns.com/foaf/0.1/Person'},
                         metta_context_to_dict(c))

    def test_back_forth(self):
        # works, but context disappears -> try to fix

        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)

        # graph is the same when translated to MeTTa and back
        self.assertEqual({(s, p, o) for s, p, o in g},
                         {(s, p, o) for s, p, o in metta_to_graph(parse_metta(graph_to_mettastr(g)))[0]})

        # MeTTa is the same when translated to graph and back
        m = ('((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/workplaceHomepage) (uriref https://www.example.com/))\n'
            '((uriref https://me.example.com) (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "John Smith"))\n'
            '((uriref https://me.example.com) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://xmlns.com/foaf/0.1/Person))')

        self.assertEqual(set(m.split('\n')), set(graph_to_mettastr(metta_to_graph(parse_metta(m))[0]).split('\n')))

    def test_serialize(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)

        context = {
                "name": "http://xmlns.com/foaf/0.1/name",
                "homepage": {
                  "@id": "http://xmlns.com/foaf/0.1/workplaceHomepage",
                  "@type": "@id"
                },
                "Person": "http://xmlns.com/foaf/0.1/Person"
              }

        self.assertEqual(('{\n'
                            '  "@context": {\n'
                            '    "Person": "http://xmlns.com/foaf/0.1/Person",\n'
                            '    "homepage": {\n'
                            '      "@id": "http://xmlns.com/foaf/0.1/workplaceHomepage",\n'
                            '      "@type": "@id"\n'
                            '    },\n'
                            '    "name": "http://xmlns.com/foaf/0.1/name"\n'
                            '  },\n'
                            '  "@id": "https://me.example.com",\n'
                            '  "@type": "Person",\n'
                            '  "homepage": "https://www.example.com/",\n'
                            '  "name": "John Smith"\n'
                            '}'), g.serialize(format="json-ld", context=context))

    def test_json_to_json_wiki_example(self):
        with open("wiki_example.jsonld") as f:
            json1 = f.readlines()
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)
        with open("wiki_example.jsonld") as f:
            c = read_context(f)


        m = graph_to_mettastr(g, c)
        g2, c2 = metta_to_graph(parse_metta(m))
        json2 = g2.serialize(format="json-ld", context=c2)


        # since order in the json can change, comma's new lines and spaces can differ
        self.assertSetEqual(set([s.replace(' ', '').replace(',', '') for s in json2.split('\n')]),
                            set([s.replace('\n', '').replace(' ', '').replace(',', '') for s in json1]))


    def from_json_to_json(self, filename):
        with open(filename) as f:
            g = jsonld_to_graph(f)
        with open(filename) as f:
            c = read_context(f)

        # when reading a json to a graph using RDFLib, and writing it back, some changes are already made (e.g. adding identifiers for some nodes),
        # therefore we compare with the json file after parsing to a graph instead of the original json file
        json1 = g.serialize(format="json-ld", context=c)

        m = graph_to_mettastr(g, c)

        g2, c2 = metta_to_graph(parse_metta(m))
        json2 = g2.serialize(format="json-ld", context=c)

        # since order in the json can change, comma's new lines and spaces can differ
        self.assertSetEqual(set([s.replace(' ', '').replace(',', '') for s in json2.split('\n')]),
                            set([s.replace(' ', '').replace(',', '') for s in json1.split('\n')]))

    def test_person_1_example(self):
        self.from_json_to_json("person1.jsonld")

    def test_person_2_example(self):
        self.from_json_to_json("person2.jsonld")


if __name__ == '__main__':
    unittest.main()
