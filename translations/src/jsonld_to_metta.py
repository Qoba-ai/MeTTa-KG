import hyperon
import rdflib
import json

# from csv_to_metta import parse_metta


def jsonld_to_graph(f):
    g = rdflib.Graph()
    g.parse(f, format="json-ld")

    return g


def read_context(f):
    #FIXME multiple contexts
    return json.load(f)['@context']


def graph_to_mettastr(graph: rdflib.Graph, context=None) -> str:
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
                # when using x.value instead of str(x), dates like "1979-10-12" become "None"
                # not sure why, might be a bug in the library
                if x.language:
                    return f'((literal ({langstring_dt} {x.language})) "{str(x)}")'
                elif not x.language and not x.datatype:
                    return f'((literal ({string_dt})) "{str(x)}")'
                elif not x.language and x.datatype:
                    return f'((literal ({x.datatype})) "{str(x)}")'
            case rdflib.term.BNode(b):
                    return f'(bnode {b})'
            case x:
                return f'({trans[type(x)]} {x})'


    def dict_to_str(d):
        match d:
            case dict():
                return '(' + ' '.join([f'({dict_to_str(k)} {dict_to_str(v)})' for k, v in d.items()]) + ')'
            case _:
                return str(d)

    return '\n'.join(['(' + ' '.join([term_to_atom(t) for t in tup]) + ')' for tup in graph]) \
        + ('\n' + f'(context {dict_to_str(context)})' if context else '')


def metta_context_to_dict(c: hyperon.Atom) -> dict:
    # input is one context atom, e.g. ((name http://xmlns.com/foaf/0.1/name) (homepage ((@id http://xmlns.com/foaf/0.1/workplaceHomepage) (@type @id))) (Person http://xmlns.com/foaf/0.1/Person))
    match c:
        case hyperon.ExpressionAtom():
            return {child.get_children()[0].get_name(): metta_context_to_dict(child.get_children()[1]) for child in
                    c.get_children()}
        case hyperon.SymbolAtom():
            return c.get_name()
        case _:
            raise NotImplemented


def metta_to_graph(m: hyperon.MeTTa) -> tuple[rdflib.Graph, dict]:
    atoms = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    context_full = m.run('!(match &self (context $c) (context $c))')[0]
    if context_full:
        atoms.remove(context_full[0])
        context = context_full[0].get_children()[1]
    else:
        context = None
    # assert len(context) < 2
    # if len(context) == 0:
    #     context = None

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

    return g, (metta_context_to_dict(context) if context else None)

