from collections import defaultdict

import hyperon
import rdflib
from rdflib.plugins.parsers.ntriples import W3CNTriplesParser as NTParser, NTGraphSink


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



# parse with blind node handling
def parse_nt(filename: str) -> tuple[rdflib.Graph, defaultdict]:
    with open(filename) as f:
        bnodes = defaultdict()
        g = rdflib.Graph()
        sink = NTGraphSink(g)
        p = NTParser(sink, bnodes)

        p.parse(f)
        return g, bnodes


def graph_to_mettastr(g: rdflib.Graph, bnodes: defaultdict) -> str:
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


def metta_to_graph(m: hyperon.MeTTa) -> rdflib.Graph:
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

    g = rdflib.Graph()
    for a in atoms:
        subj = a.get_children()[0]
        prop = a.get_children()[1]
        obj = a.get_children()[2]
        g.add((atom_to_term(subj), atom_to_term(prop), atom_to_term(obj)))

    return g
