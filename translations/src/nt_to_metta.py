from collections import defaultdict

import hyperon
import rdflib
from rdflib import Graph, BNode
from rdflib.plugins.parsers.ntriples import W3CNTriplesParser as NTParser, NTGraphSink
# from csv_to_metta import parse_metta


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


def graph_to_tuples_3(g: Graph, bnodes: defaultdict) -> tuple[list[tuple], dict, defaultdict]:
    """
    work in progress/to be deleted (easier to translate straight into metta)
    convert rdflib graph to tuples and keep type information and literal languages
    """
    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    extra_info = defaultdict()
    for n in g.all_nodes():
        match n:
            case rdflib.term.Literal(x):
                if x.language:
                    extra_info[(x.value, "language")] = x.language
            case rdflib.term.BNode:
                pass
            case rdflib.term.URIRef:
                pass
            case rdflib.term.Variable:
                pass
            case _:
                pass

    def helper(i: rdflib.term.Node):
        match i:
            case BNode(i):
                return list(filter(lambda x: bnodes[x] == i, bnodes))[0]
            case _:
                return str(i)

    return ([(helper(subject), helper(predicate), helper(obj)) for subject, predicate, obj in g],
            {helper(n): trans[type(n)] for n in g.all_nodes()},
            extra_info)



g, bnodes = parse_nt2("../tests/wiki_example.nt")
# print("tuples 3", graph_to_tuples_3(g, bnodes))


def metta_bnode_representation(name):
    return '(' + 'BNode ' + name + ')'


def tuples_to_metta(ts: list[tuple]) -> str:
    return '\n'.join(['(' + ' '.join([f'"{e}"' for e in t]) + ')' for t in ts])


def graph_to_mettastr(g: Graph, bnodes: defaultdict) -> str:
    """
    take an RDFlib graph and convert straight away to MeTTa strings
    """
    string_dt = "http://www.w3.org/2001/XMLSchema#string"
    langstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
    dirlangstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString"

    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    def term_to_atom(t):
        match t:
            case rdflib.term.Literal(x):
                if x.language:
                    return f'((literal ({langstring_dt} {x.language})) "{x.value}")'
                elif not x.language and not x.datatype:
                    return f'((literal ({string_dt})) "{x.value}")'
                elif not x.language and x.datatype:
                    return f'((literal ({x.datatype})) "{x.value}")'
            case rdflib.term.BNode(b):
                    return f'(bnode "{list(filter(lambda x: bnodes[x] == b, bnodes))[0]}")'
            case x:
                return f'({trans[type(x)]} {x})'

    return '\n'.join(['(' + ' '.join([term_to_atom(t) for t in tup]) + ')' for tup in g])


g, bnodes = parse_nt2("../tests/wiki_example.nt")

# print('tup to met', tuples_to_metta_3(*graph_to_tuples_3(g, bnodes)))
# print('tup to met', graph_to_mettastr(g, bnodes))

def tuples_from_metta(metta: hyperon.MeTTa) -> list[tuple]:
    atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    return [(a.get_children()[0].get_object().value,
             a.get_children()[1].get_object().value,
             a.get_children()[2].get_object().value) for a in atoms]

# (s p o)
# (type s <type s>)
# (type p <type p>)
# (type o <type o>)

# ((<type s> s) (<type p> p) (<type o> o))

# (s p _:bert)
# ((<type s> s) (<type p> p) (BlindNode bert))

# (s p "N-Triples"^^int)
# ((<type s> s) (<type p> p) ((Literal ...int) o))

# (s p "N-Triples"@en-US)
# ((<type s> s) (<type p> p) ((Literal (...langString "en-US") o))

# (s p "N-Triples"@en-US^^dir)
# ((<type s> s) (<type p> p) ((Literal (...dirLangString "en-US" dir) o))

# ((<type s> s) (<type p> p) ($myboundtype $value))

def tuples_to_graph(ts: list[tuple], types: dict, extra: defaultdict) -> Graph:
    """
    Work in progress/to be deleted (easier to go straight from metta to graph)
    Take parsed nt triples, types and extra information and convert to a graph
    """
    g = Graph()

    trans = {'literal': rdflib.term.Literal, 'uriref': rdflib.term.URIRef, 'bnode': rdflib.term.BNode,
             'variable': rdflib.term.Variable}

    def make_node(s, types_):
        match types_[s]:
            case "literal":
                return rdflib.term.Literal(s, lang=extra[(s, "language")])

    for s, p, o in ts:
        g.add((trans[types[s]](s), rdflib.URIRef("someref"), rdflib.RDF.type))

    g.add((rdflib.BNode("art"), rdflib.URIRef("someref"), rdflib.RDF.type))
    # print(g.serialize(format='n3'))

    return g


def metta_to_graph(m: hyperon.MeTTa) -> Graph:
    atoms = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]

    def atom_to_term(r):
        match r.get_children()[0]:
            case hyperon.SymbolAtom():
                match r.get_children()[0].get_name():
                    case "bnode":
                        return rdflib.term.BNode(r.get_children()[1].get_object().value)
                    case "variable":
                        return rdflib.term.Variable(r.get_children()[1].get_name())
                    case "uriref":
                        return rdflib.term.URIRef(r.get_children()[1].get_name())
            case hyperon.ExpressionAtom():
                literal_type = r.get_children()[0]
                literal_uri = literal_type.get_children()[1].get_children()[0].get_name()
                literal_name = r.get_children()[1].get_object().value
                string_dt = "http://www.w3.org/2001/XMLSchema#string"
                langstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
                assert literal_type.get_children()[0].get_name() == "literal"
                match literal_uri:
                    case "http://www.w3.org/2001/XMLSchema#string":
                        return rdflib.term.Literal(literal_name)
                    case "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString":
                        language = literal_type.get_children()[1].get_children()[1].get_name()
                        return rdflib.term.Literal(literal_name, lang=language)
                    case _:
                        return rdflib.term.Literal(literal_name, datatype=literal_uri)

    g = Graph()
    for a in atoms:
        subj = a.get_children()[0]
        prop = a.get_children()[1]
        obj = a.get_children()[2]
        g.add((atom_to_term(subj), atom_to_term(prop), atom_to_term(obj)))

    return g
