# Sources to get N3 examples
# https://github.com/eyereasoner/Notation3-By-Example
# https://github.com/w3c/N3/tree/master

import unittest
from translations.src.n3_to_metta import *
from translations.src.csv_to_metta import parse_metta, csv_to_matrix
import re


class TranslateN3(unittest.TestCase):
    def setUp(self) -> None:
        with open("check_list.n3") as f:
            self.g_check_list = n3_to_graph(f)
        with open("gedcom_relations.n3") as f:
            self.g_relations = n3_to_graph(f)
        with open("intersection.n3") as f:
            self.g_intersection = n3_to_graph(f)

        self.mettastr_check_list = ('((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB1) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#Completed)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA2) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#Completed)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#member) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA2)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#CompositeTask)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#CompositeTask)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#member) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB1)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#) (uriref http://www.w3.org/2000/01/rdf-schema#comment) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Check whether a condition holds for all elements in a select set")))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#member) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB2)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA1) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#NotCompleted)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskB2) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#Completed)))\n'
                                    '((Graph 0) ((uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#member) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#taskA1)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b2) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#rest) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#nil)))\n'
                                    '((Graph _:Formula2) ((variable t) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#CompositeTask)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#rest) (bnode ff4f31401590f44558d4e7c317ccd02e1b2)))\n'
                                    '((Graph _:Formula4) ((variable t2) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#Completed)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b2) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#first) (Graph _:Formula4)))\n'
                                    '((Graph _:Formula3) ((variable t) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#member) (variable t2)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#first) (Graph _:Formula3)))\n'
                                    '((Graph _:Formula2) ((bnode ff4f31401590f44558d4e7c317ccd02e1b1) (uriref http://www.w3.org/2000/10/swap/log#forAllIn) (bnode ff4f31401590f44558d4e7c317ccd02e1b3)))\n'
                                    '((Graph _:Formula5) ((variable t) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/check_list.n3#Completed)))\n'
                                    '((Graph 0) ((Graph _:Formula2) (uriref http://www.w3.org/2000/10/swap/log#implies) (Graph _:Formula5)))')

    def test_graph_to_metta(self):
        # replace the random bnode ids to compare the atoms
        # (note: information about equal bnodes is lost)
        self.assertSetEqual(set(re.sub("Formula[0-9]{1,2}", "Formula", re.sub('bnode .{35}', 'bnode', graph_to_mettastr(self.g_check_list, False))).split('\n')),
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
        for g in [self.g_check_list, self.g_relations, self.g_intersection]:
            # compare with serialized graph instead of original document,
            # because parsing and serializing does not exactly reproduce the original document using rdflib
            original = g.serialize(format="n3")
            back_and_forth = metta_to_graph(parse_metta(graph_to_mettastr(g))).serialize(format="n3")

            # order of lines in output string can change
            # better would be to split by meaningful blocks than to split by enters
            # but this already gives a good indication
            self.assertSetEqual(set(original.split("\n")), set(back_and_forth.split("\n")))

    def intersection(self):
        with open("intersection.n3") as f:
            g = n3_to_graph(f)

        print(graph_to_mettastr(g))


if __name__ == '__main__':
    unittest.main()
