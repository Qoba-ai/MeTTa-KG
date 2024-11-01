# Sources to get N3 examples
# https://github.com/eyereasoner/Notation3-By-Example
# https://github.com/w3c/N3/tree/master

import unittest
from translations.src.n3_to_metta import *
from translations.src.csv_to_metta import parse_metta, csv_to_matrix
import re


class TranslateN3(unittest.TestCase):
    def setUp(self) -> None:
        with open("test_files/n3_files/check_list.n3") as f:
            self.g_check_list, self.url_check_list = n3_to_graph(f)
        with open("test_files/n3_files/gedcom_relations.n3") as f:
            self.g_relations, self.url_relations = n3_to_graph(f)
        with open("test_files/n3_files/intersection.n3") as f:
            self.g_intersection, self.url_intersection = n3_to_graph(f)

        self.mettastr_check_list = ('((Graph 0) ((uriref (check_list.n3 taskB1)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 Completed))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskA2)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 Completed))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskA)) (uriref (check_list.n3 member)) (uriref (check_list.n3 taskA2))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskA)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 CompositeTask))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskB)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 CompositeTask))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskB)) (uriref (check_list.n3 member)) (uriref (check_list.n3 taskB1))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 )) (uriref (http://www.w3.org/2000/01/rdf-schema comment)) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Check whether a condition holds for all elements in a select set")))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskB)) (uriref (check_list.n3 member)) (uriref (check_list.n3 taskB2))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskA1)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 NotCompleted))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskB2)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 Completed))))\n'
                                    '((Graph 0) ((uriref (check_list.n3 taskA)) (uriref (check_list.n3 member)) (uriref (check_list.n3 taskA1))))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns nil))))\n'
                                    '((Graph _:Formula2) ((variable t) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 CompositeTask))))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (bnode ff4f31401590f44558d4e7c317ccd02e1b2)))\n'
                                    '((Graph _:Formula4) ((variable t2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 Completed))))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (Graph _:Formula4)))\n'
                                    '((Graph _:Formula3) ((variable t) (uriref (check_list.n3 member)) (variable t2)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (Graph _:Formula3)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref (http://www.w3.org/2000/10/swap/log forAllIn)) (bnode ff4f31401590f44558d4e7c317ccd02e1b3)))\n'
                                    '((Graph _:Formula5) ((variable t) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (check_list.n3 Completed))))\n'
                                    '((Graph 0) ((Graph _:Formula2) (uriref (http://www.w3.org/2000/10/swap/log implies)) (Graph _:Formula5)))')

    def test_graph_to_metta(self):
        # replace the random bnode ids to compare the atoms
        # (note: information about equal bnodes is lost)
        # print(graph_to_mettastr(self.g_check_list, self.url_check_list, True))
        self.assertSetEqual(set(re.sub("Formula[0-9]{1,2}", "Formula", re.sub('bnode .{35}', 'bnode', graph_to_mettastr(self.g_check_list, self.url_check_list, False))).split('\n')),
                            set(re.sub("Formula[0-9]{1,2}", "Formula", re.sub('bnode .{35}', 'bnode', self.mettastr_check_list)).split('\n')))

    def test_metta_to_graph(self):
        # compare properties of the graph
        g = metta_to_graph(parse_metta(self.mettastr_check_list))

        # nodes cannot be compared directly since quotedgraphs get a random formula number (identifier _:FormulaXX)
        # when the setup method is called multiple times, the formula get a different identifier each time
        self.assertEqual(len(self.g_check_list.all_nodes()),
                         len(g.all_nodes()))
        self.assertEqual(len([triple for triple in self.g_check_list]),
                         len([triple for triple in g]))

    def test_back_and_forth(self):
        for g, u in [(self.g_check_list, self.url_check_list), (self.g_relations, self.url_relations), (self.g_intersection, self.url_intersection)]:
            # compare with serialized graph instead of original document,
            # because parsing and serializing does not exactly reproduce the original document using rdflib
            original = g.serialize(format="n3")
            back_and_forth = metta_to_graph(parse_metta(graph_to_mettastr(g, u))).serialize(format="n3")
            # order of lines in output string can change
            # better would be to split by meaningful blocks than to split by enters
            # but this already gives a good indication
            self.assertSetEqual({l for l in original.split("\n") if not l.startswith("@prefix local")},
                                {l for l in back_and_forth.split("\n") if not l.startswith("@prefix local")})

    def test_intersection(self):
        metta_str = "((Graph _:Formula246) ((variable X) (uriref (urn:example intersection)) (bnode ub10bL32C22)))\n" +\
                    "((Graph _:Formula247) ((uriref (urn:example A)) (uriref (urn:example X)) (uriref (urn:example C))))\n" +\
                    "((Graph _:Formula246) ((bnode ub10bL32C22) (uriref (http://www.w3.org/2000/10/swap/log equalTo)) (Graph _:Formula247)))\n"+\
                    "((Graph _:Formula248) ((uriref (urn:example test)) (uriref (urn:example is)) ((literal (http://www.w3.org/2001/XMLSchema#boolean)) \"True\")))\n"+\
                    "((Graph 0) ((Graph _:Formula246) (uriref (http://www.w3.org/2000/10/swap/log implies)) (Graph _:Formula248)))\n"+\
                    "((Graph _:Formula244) ((uriref (urn:example Let)) (uriref (urn:example param2)) (variable X2)))\n"+\
                    "((Graph _:Formula244) ((bnode fdf65c093912640ea9dd55ac771b939bab2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns nil))))\n"+\
                    "((Graph _:Formula244) ((bnode fdf65c093912640ea9dd55ac771b939bab1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (bnode fdf65c093912640ea9dd55ac771b939bab2)))\n"+\
                    "((Graph _:Formula244) ((bnode fdf65c093912640ea9dd55ac771b939bab2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (variable X2)))\n"+\
                    "((Graph _:Formula244) ((bnode fdf65c093912640ea9dd55ac771b939bab1) (uriref (http://www.w3.org/2000/10/swap/graph intersection)) (variable Y)))\n"+\
                    "((Graph _:Formula244) ((bnode fdf65c093912640ea9dd55ac771b939bab1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (variable X1)))\n"+\
                    "((Graph _:Formula244) ((uriref (urn:example Let)) (uriref (urn:example param1)) (variable X1)))\n"+\
                    "((Graph _:Formula245) ((bnode fb82913935e5b40f994e67365cf159fbbb2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (variable X2)))\n"+\
                    "((Graph _:Formula245) ((bnode fb82913935e5b40f994e67365cf159fbbb1) (uriref (urn:example intersection)) (variable Y)))\n"+\
                    "((Graph _:Formula245) ((bnode fb82913935e5b40f994e67365cf159fbbb2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns nil))))\n"+\
                    "((Graph _:Formula245) ((bnode fb82913935e5b40f994e67365cf159fbbb1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (bnode fb82913935e5b40f994e67365cf159fbbb2)))\n"+\
                    "((Graph _:Formula245) ((bnode fb82913935e5b40f994e67365cf159fbbb1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (variable X1)))\n"+\
                    "((Graph 0) ((Graph _:Formula244) (uriref (http://www.w3.org/2000/10/swap/log implies)) (Graph _:Formula245)))\n"+\
                    "((Graph _:Formula243) ((uriref (urn:example A)) (uriref (urn:example X)) (uriref (urn:example C))))\n"+\
                    "((Graph 0) ((uriref (urn:example Let)) (uriref (urn:example param2)) (Graph _:Formula243)))\n"+\
                    "((Graph _:Formula242) ((uriref (urn:example A)) (uriref (urn:example B)) (uriref (urn:example C))))\n"+\
                    "((Graph _:Formula242) ((uriref (urn:example D)) (uriref (urn:example E)) (uriref (urn:example F))))\n"+\
                    "((Graph _:Formula242) ((uriref (urn:example A)) (uriref (urn:example X)) (uriref (urn:example C))))\n"+\
                    "((Graph 0) ((uriref (urn:example Let)) (uriref (urn:example param1)) (Graph _:Formula242)))\n"+\
                    "(Namespace (\"brick\" \"https://brickschema.org/schema/Brick#\"))\n"+\
                    "(Namespace (\"csvw\" \"http://www.w3.org/ns/csvw#\"))\n"+\
                    "(Namespace (\"dc\" \"http://purl.org/dc/elements/1.1/\"))\n"+\
                    "(Namespace (\"dcat\" \"http://www.w3.org/ns/dcat#\"))\n"+\
                    "(Namespace (\"dcmitype\" \"http://purl.org/dc/dcmitype/\"))\n"+\
                    "(Namespace (\"dcterms\" \"http://purl.org/dc/terms/\"))\n"+\
                    "(Namespace (\"dcam\" \"http://purl.org/dc/dcam/\"))\n"+\
                    "(Namespace (\"doap\" \"http://usefulinc.com/ns/doap#\"))\n"+\
                    "(Namespace (\"foaf\" \"http://xmlns.com/foaf/0.1/\"))\n"+\
                    "(Namespace (\"geo\" \"http://www.opengis.net/ont/geosparql#\"))\n"+\
                    "(Namespace (\"odrl\" \"http://www.w3.org/ns/odrl/2/\"))\n"+\
                    "(Namespace (\"org\" \"http://www.w3.org/ns/org#\"))\n"+\
                    "(Namespace (\"prof\" \"http://www.w3.org/ns/dx/prof/\"))\n"+\
                    "(Namespace (\"prov\" \"http://www.w3.org/ns/prov#\"))\n"+\
                    "(Namespace (\"qb\" \"http://purl.org/linked-data/cube#\"))\n"+\
                    "(Namespace (\"schema\" \"https://schema.org/\"))\n"+\
                    "(Namespace (\"sh\" \"http://www.w3.org/ns/shacl#\"))\n"+\
                    "(Namespace (\"skos\" \"http://www.w3.org/2004/02/skos/core#\"))\n"+\
                    "(Namespace (\"sosa\" \"http://www.w3.org/ns/sosa/\"))\n"+\
                    "(Namespace (\"ssn\" \"http://www.w3.org/ns/ssn/\"))\n"+\
                    "(Namespace (\"time\" \"http://www.w3.org/2006/time#\"))\n"+\
                    "(Namespace (\"vann\" \"http://purl.org/vocab/vann/\"))\n"+\
                    "(Namespace (\"void\" \"http://rdfs.org/ns/void#\"))\n"+\
                    "(Namespace (\"wgs\" \"https://www.w3.org/2003/01/geo/wgs84_pos#\"))\n"+\
                    "(Namespace (\"owl\" \"http://www.w3.org/2002/07/owl#\"))\n"+\
                    "(Namespace (\"rdf\" \"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"))\n"+\
                    "(Namespace (\"rdfs\" \"http://www.w3.org/2000/01/rdf-schema#\"))\n"+\
                    "(Namespace (\"xsd\" \"http://www.w3.org/2001/XMLSchema#\"))\n"+\
                    "(Namespace (\"xml\" \"http://www.w3.org/XML/1998/namespace\"))\n"+\
                    "(Namespace (\"\" \"urn:example#\"))\n"+\
                    "(Namespace (\"graph\" \"http://www.w3.org/2000/10/swap/graph#\"))\n"+\
                    "(Namespace (\"log\" \"http://www.w3.org/2000/10/swap/log#\"))\n"+\
                    "(Namespace (\"local\" \"intersection.n3#\"))"

        self.assertSetEqual(set(re.sub("Formula[0-9]{1,3}", "Formula", re.sub('bnode ([A-Za-z0-9]){10,35}', 'bnode',
                                                                              graph_to_mettastr(self.g_intersection,
                                                                                                self.url_intersection,
                                                                                                True))).split('\n')),
                            set(re.sub("Formula[0-9]{1,3}", "Formula", re.sub('bnode ([A-Za-z0-9]){10,35}', 'bnode', metta_str)).split('\n')))


if __name__ == '__main__':
    unittest.main()
