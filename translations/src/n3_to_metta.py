import hyperon
import rdflib
from io import StringIO
import os

from rdflib import URIRef
from rdflib.graph import QuotedGraph


# ((graph 0) (subject1, predicate1, object1))
# ((graph 0) (subject2, predicate2, (graph 122)))
# ((graph 122) (subject122_1, predicate122_1, object122_1))
# ((graph 122) (subject122_2, predicate122_2, object122_2))
# ...


def n3_to_graph(f) -> (rdflib.Graph, str):
    g = rdflib.Graph()
    g.parse(f, format="n3")
    home = rdflib.Namespace('file://' + os.path.abspath(f.name) + '#')
    g.namespace_manager.bind("local", home, override=True, replace=False)

    return g, home


def graph_to_mettastr(graph: rdflib.Graph(), local_url, translate_namespaces: bool = True) -> str:

    """
        take an RDFlib graph and convert straight away to MeTTa strings
        can problably be merged with the nt_to_metta graph_to_metta function
    """
    string_dt = "http://www.w3.org/2001/XMLSchema#string"
    langstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
    dirlangstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString"

    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    quads = []

    def triple_to_atom(triple, graphlabel):
        quads.append(f'((Graph {graphlabel}) (' + ' '.join([term_to_atom(t) for t in triple]) + '))')

    def term_to_atom(t):
        match t:
            case rdflib.term.Literal(x):
                if x.language:
                    return f'((literal ({langstring_dt} {x.language})) "{x.value}")'
                elif not x.language and not x.datatype:
                    return f'((literal ({string_dt})) "{x.value}")'
                elif not x.language and x.datatype:
                    return f'((literal ({x.datatype})) "{x.value}")'
            case rdflib.graph.QuotedGraph():
                # TODO
                for triple in t:
                    triple_to_atom(triple, t.identifier.title())
                return f'(Graph {t.identifier.title()})'
            case rdflib.term.BNode(b):
                return f'(bnode {b})'
            case rdflib.term.URIRef(u):
                # TODO only works if # is between url and frag
                url, frag = rdflib.term.urldefrag(u)
                if local_url == url + "#":
                    # url = [k for k, v in dict(graph.namespaces()).items() if str(v) == local_url][0]
                    url = os.path.split(str(local_url))[-1].removesuffix("#")
                return f'(uriref ({url} {frag}))'
            case x:
                return f'({trans[type(x)]} {x})'

    for trip in graph:
        triple_to_atom(trip, 0)

    namespace_atoms = [f'(Namespace ("{label}" "{url}"))' if not label == "local"
                       else f'(Namespace ("local" "{os.path.split(str(local_url))[-1]}"))' for label, url in graph.namespaces()]

    return '\n'.join(quads) + ('\n' + '\n'.join(namespace_atoms) if translate_namespaces else '')


def atom_name(a: hyperon.Atom):
    match a:
        case hyperon.atoms.GroundedAtom() as ga:
            return ga.get_object().value
        case hyperon.atoms.SymbolAtom() as sa:
            return sa.get_name()
        case _:
            raise NotImplementedError(type(a))


def metta_to_graph(m: hyperon.MeTTa) -> rdflib.Graph:
    # atoms = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]

    ids = m.run("!(match &self ((Graph $id)($s $p $o)) $id)")[0]  # TODO use the unique atom here
    namespace_atoms = m.run("!(match &self (Namespace ($label $uri)) ($label $uri))")[0]
    ids_str = {atom_name(i) for i in ids}
    ids_str.remove(0)

    q_graphs: dict[str, rdflib.graph.QuotedGraph] = {i: rdflib.graph.QuotedGraph("default", i) for i in ids_str}

    def atom_to_term(r, q):
        match r.get_children()[0]:
            case hyperon.SymbolAtom():
                match r.get_children()[0].get_name():
                    case "bnode":
                        return rdflib.term.BNode(r.get_children()[1].get_name())
                    case "variable":
                        return rdflib.term.Variable(r.get_children()[1].get_name())
                    case "uriref":
                        tup = r.get_children()[1].get_children()
                        if len(tup) == 2:
                            u, frag = str(tup[0]), str(tup[1])
                        else:
                            u, frag = tup[0].get_name(), ""
                        # return rdflib.term.URIRef(r.get_children()[1].get_name())
                        return rdflib.term.URIRef(u + "#" + frag)
                        # return rdflib.term.URIRef(frag)
                    case "Graph":
                        return q_graphs[r.get_children()[1].get_name()]
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

    for idx, q_graph in q_graphs.items():
        atoms = m.run(f"!(match &self ((Graph {idx})($s $p $o)) ($s $p $o))")[0]

        for a in atoms:
            subj, pred, obj = a.get_children()
            q_graph.add((atom_to_term(subj, q_graphs), atom_to_term(pred, q_graphs), atom_to_term(obj, q_graphs)))


    g = rdflib.Graph()
    atoms_0 = m.run(f"!(match &self ((Graph 0)($s $p $o)) ($s $p $o))")[0]

    for a in atoms_0:
        subj, pred, obj = a.get_children()
        g.add((atom_to_term(subj, q_graphs), atom_to_term(pred, q_graphs), atom_to_term(obj, q_graphs)))

    for n_atom in namespace_atoms:
        label, url = n_atom.get_children()
        g.bind(label.get_object().value, rdflib.Namespace(url.get_object().value), override=True)

    return g

