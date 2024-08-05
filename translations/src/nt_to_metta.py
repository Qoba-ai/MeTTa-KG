from collections import defaultdict

from rdflib import Graph, BNode
from rdflib.plugins.parsers.ntriples import W3CNTriplesParser as NTParser, NTGraphSink


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


def metta_bnode_representation(name):
    return '(' + 'BNode ' + name + ')'


def tuples_to_metta(ts: list[tuple]):
    return '\n'.join(['(' + ' '.join([f'"{e}"' for e in t]) + ')' for t in ts])

