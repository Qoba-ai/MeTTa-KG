import hyperon
import rdflib


def jsonld_to_graph(f):
    g = rdflib.Graph()
    g.parse(f, format="json-ld")

    return g


def graph_to_mettastr(graph: rdflib.Graph) -> str:
    """
    take an RDFlib graph and convert straight away to MeTTa strings
    method almost the same as for nt translation
    only difference are the randomly labeled bnodes
    -> eventually merge them with both n3 and nt methods
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
                    return f'(bnode {b})'
            case x:
                return f'({trans[type(x)]} {x})'

    return '\n'.join(['(' + ' '.join([term_to_atom(t) for t in tup]) + ')' for tup in graph])


def metta_to_graph(m: hyperon.MeTTa) -> rdflib.Graph:
    atoms = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]

    def atom_to_term(r):
        match r.get_children()[0]:
            case hyperon.SymbolAtom():
                match r.get_children()[0].get_name():
                    case "bnode":
                        return rdflib.term.BNode(r.get_children()[1].get_name())
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

