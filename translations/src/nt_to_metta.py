from collections import defaultdict

import hyperon
import rdflib
from rdflib import Graph, BNode
from rdflib.plugins.parsers.ntriples import W3CNTriplesParser as NTParser, NTGraphSink
from csv_to_metta import parse_metta


def parse_nt(filename: str) -> Graph:
    g = Graph()
    g.parse(filename)

    return g


# parse with blind node handling
def parse_nt2(filename: str) -> tuple[Graph, defaultdict]:
    with open(filename) as f:
        bnodes = defaultdict()
        g = Graph()
        sink = NTGraphSink(g)
        p = NTParser(sink, bnodes)

        p.parse(f)
        return g, bnodes


def graph_to_tuples(g: Graph) -> list[tuple]:
    return [(subject, predicate, object) for subject, predicate, object in g]


# tuples with blind node handling
def graph_to_tuples_2(g: Graph, bnodes: defaultdict) -> list[tuple]:
    def helper(i):
        match i:
            case BNode(i):
                return metta_bnode_representation(list(filter(lambda x: bnodes[x] == i, bnodes))[0])
            case _:
                return i
    return [(helper(subject), helper(predicate), helper(obj)) for subject, predicate, obj in g]


def graph_to_tuples_3(g: Graph, bnodes: defaultdict) -> tuple[list[tuple], dict]:
    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    extra_info = defaultdict()
    for n in g.all_nodes():
        match n:
            case rdflib.term.Literal:
                pass

    def helper(i: rdflib.term.Node):
        match i:
            case BNode(i):
                return list(filter(lambda x: bnodes[x] == i, bnodes))[0]
            case _:
                return str(i)

    return [(helper(subject), helper(predicate), helper(obj)) for subject, predicate, obj in g], {n: trans[type(n)] for n in g.all_nodes()}



g, bnodes = parse_nt2("../tests/wiki_example.nt")
print("tuples 3", graph_to_tuples_3(g, bnodes))


def metta_bnode_representation(name):
    return '(' + 'BNode ' + name + ')'


def tuples_to_metta(ts: list[tuple]) -> str:
    return '\n'.join(['(' + ' '.join([f'"{e}"' for e in t]) + ')' for t in ts])


def tuples_to_metta_2(ts: list[tuple[rdflib.term.Node]]) -> str:
    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    # return '\n'.join([f'type {n} {trans(n)}' for n in ])


def tuples_from_metta(metta: hyperon.MeTTa) -> list[tuple]:
    atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    return [(a.get_children()[0].get_object().value,
             a.get_children()[1].get_object().value,
             a.get_children()[2].get_object().value) for a in atoms]


def tuples_to_graph(ts: list[tuple], types: dict) -> Graph:
    g = Graph()
    g.add((rdflib.BNode("art"), rdflib.URIRef("someref"), rdflib.RDF.type))
    print(g.serialize(format='n3'))

    return g

m = ('("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://xmlns.com/foaf/0.1/maker" "(BNode dave)")\n'
    '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://xmlns.com/foaf/0.1/maker" "(BNode art)")\n'
    '("(BNode art)" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Person")\n'
    '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Document")\n'
    '("(BNode art)" "http://xmlns.com/foaf/0.1/name" "Art Barstow")\n'
    '("(BNode dave)" "http://xmlns.com/foaf/0.1/name" "Dave Beckett")\n'
    '("(BNode dave)" "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" "http://xmlns.com/foaf/0.1/Person")\n'
    '("http://www.w3.org/2001/sw/RDFCore/ntriples/" "http://purl.org/dc/terms/title" "N-Triples")')


# print(tuples_from_metta(parse_metta(m)))


print(tuples_to_graph([('test1', 't2', 't3')]))
