# example files from https://jsonld.com/person/ and https://en.wikipedia.org/wiki/JSON-LD

import unittest
from translations.src.jsonld_to_metta import *
from translations.src.csv_to_metta import parse_metta


class MyTestCase(unittest.TestCase):
    def test_something(self):
        with open("wiki_example.jsonld") as f:
            g = jsonld_to_graph(f)
            print(g.context_aware)

        print(graph_to_mettastr(g))
        for s, p, o in metta_to_graph(parse_metta(graph_to_mettastr(g))):
            print((s, p, o))

        # works, but context disappears -> try to fix
        print(metta_to_graph(parse_metta(graph_to_mettastr(g))).serialize(format="json-ld"))


if __name__ == '__main__':
    unittest.main()
