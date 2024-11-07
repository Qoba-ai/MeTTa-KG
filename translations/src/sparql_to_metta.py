# PLAYGROUND FILE!!!!!
# UNFINISHED!!!!!
import os.path
from io import StringIO

import rdflib
from rdflib import Variable, URIRef, Literal
from rdflib.plugins.sparql import parser, algebra
from pprint import pprint

from rdflib.plugins.sparql.parser import SelectQuery
from rdflib.plugins.sparql.sparql import Query

import sparql_algebra_examples as examples

with open("wiki_example.sparql") as f:
    q = parser.parseQuery(f)
    q_alg = algebra.translateQuery(q)

# print([k for k in q_alg.algebra.keys()])
print("wiki example")
algebra.pprintAlgebra(q_alg)
print("start")
q.pprint()

print("-------------------")


# (match &self ($person (URI http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (URI http://xmlns.com/foaf/0.1/Person)))

def to_str(v):
    match v:
        case rdflib.term.Variable(n):
            return "$" + n
        case rdflib.URIRef(r):
            return f"(URI {r})"
    return str(v)

def to_metta(where, select):
    if where:
        return f"(match &self ({to_str(where[0][0])} {to_str(where[0][1])} {to_str(where[0][2])}) {to_metta(where[1:], select)})"
    else:
        return f"({' '.join([to_str(s) for s in select])})"


print("WHERE", q_alg.algebra["p"]["p"]["triples"])
print("SELECT", q_alg.algebra["PV"])

print(to_metta(q_alg.algebra["p"]["p"]["triples"], q_alg.algebra["PV"]))

# (Lily (URI http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (URI http://xmlns.com/foaf/0.1/Person))
# (Lily (URI http://xmlns.com/foaf/0.1/mbox) "l@example.com")
# (Lily (URI http://xmlns.com/foaf/0.1/name) "Lily")

# !(match &self ($person (URI http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (URI http://xmlns.com/foaf/0.1/Person)) (match &self ($person (URI http://xmlns.com/foaf/0.1/mbox) $email) (match &self ($person (URI http://xmlns.com/foaf/0.1/name) $name) ($name $email))))

print("-------------------------------------")

with open("jena_filter_regex.sparql") as f:
    filter_q = parser.parseQuery(f)
    filter_algebra = algebra.translateQuery(filter_q)

algebra.pprintAlgebra(filter_algebra)

print("-------------------------------------")

with open("jena_filter_testing_values.sparql") as f:
    filter_q = parser.parseQuery(f)
    filter_algebra = algebra.translateQuery(filter_q)

algebra.pprintAlgebra(filter_algebra)
print("Filter", filter_algebra.algebra["p"]["p"]["expr"])
print("WHERE", filter_algebra.algebra["p"]["p"]["p"]["triples"])
print("SELECT", filter_algebra.algebra["PV"])

def to_metta_with_filter_expressions(alg):
    print("BGP", alg.algebra.Graph)
    match alg.algebra.name:
        case "SelectQuery":
            print(alg.algebra["p"].name)
            match alg.algebra["p"].name:
                case "Project":
                    # print("Project keys", [k for k in alg.algebra["p"].keys()])
                    # print(alg.algebra["p"]["p"].name)
                    # print(alg.algebra["p"]["PV"])
                    # print(alg.algebra["p"]["_vars"])
                    print(alg.algebra["p"]["p"].name)
                    match alg.algebra["p"]["p"].name:
                        case "Filter":
                            # print("Filter keys", [k for k in alg.algebra["p"]["p"].keys()])
                            # print("Filter expr", alg.algebra["p"]["p"]["expr"])
                            # print("Filter p", alg.algebra["p"]["p"]["p"])
                            # print("Filter _vars", alg.algebra["p"]["p"]["_vars"])
                            # print("Filter expression kind", alg.algebra["p"]["p"]["expr"].name)
                            match alg.algebra["p"]["p"]["expr"].name:
                                case "RelationalExpression":
                                    print("Relational expression keys", [k for k in alg.algebra["p"]["p"]["expr"].keys()])
                                    print("Relational expression expr", alg.algebra["p"]["p"]["expr"]["expr"])
                                    print("Relational expression op", alg.algebra["p"]["p"]["expr"]["op"])
                                    print("Relational expression other", alg.algebra["p"]["p"]["expr"]["other"])
                                    print("Relational expression _vars", alg.algebra["p"]["p"]["expr"]["_vars"])


    print(alg.algebra.name)
    print([k for k in alg.algebra.keys()])
    select = alg.algebra["PV"]

print(to_metta_with_filter_expressions(filter_algebra))


print("--------------------------------------------------")
def to_metta(algebra, filter = None):
    match algebra.name:
        case "SelectQuery":
            p = algebra["p"]
            datasetClause = algebra["datasetClause"]
            PV = algebra["PV"]
            vs = algebra["_vars"]
            # print(f"(let* {to_metta(p)} ({' '.join(['$' + v.title() for v in PV])}))")
            # return f"(let* ({to_metta(p)}) ({' '.join(['$' + v.title() for v in PV])}))"
            return f"({to_metta(p)} ({' '.join(['$' + v.title() for v in PV])}))"

        case "Project":
            p = algebra["p"]
            PV = algebra["PV"]
            vs = algebra["_vars"]
            print("p", p)
            return to_metta(p)
        case "BGP":
            triples = algebra["triples"]
            vs = algebra["_vars"]
            parts = []
            meat = " ".join([f"({item_to_metta(s)} {item_to_metta(p)} {item_to_metta(o)})" for s, p, o in triples])
            var_list = " ".join([item_to_metta(v) for v in vs])
            if not filter:
                return f"let ({var_list}) (match &self (, {meat}) ({var_list}))"
            if filter:
                return f"let ({var_list}) (match &self (, {meat}) (if {to_metta(filter)} ({var_list}) ({' '.join(['Empty' for _ in vs])})))"

            for s, p, o in triples:
                current_vars = [v for v in vs if v in [s, p, o]]
                var_ids = " ".join([item_to_metta(v) for v in current_vars])
                match_part = f"(match &self ({item_to_metta(s)} {item_to_metta(p)} {item_to_metta(o)}) ({var_ids}))"
                parts.append(f"(({var_ids}) {match_part})")

            print(" ".join(parts))
            return " ".join(parts)
        case "Filter":
            expr = algebra["expr"]
            p = algebra["p"]
            vs = algebra["_vars"]
            vs_str = ' '.join([item_to_metta(v) for v in vs])
            return to_metta(p, expr)
        case "RelationalExpression":
            expr = algebra["expr"]
            op = algebra["op"]
            other = algebra["other"]
            vs = algebra["_vars"]
            return f"({op} {item_to_metta(expr)} {item_to_metta(other)})"
        case _:
            print("unmatched")
            print(type(algebra))


def item_to_metta(i):
    match i:
        case Variable():
            return f"${i.title()}"
        case URIRef():
            url, frag = rdflib.term.urldefrag(i.title())
            if not frag:
                url, frag = os.path.split(i.title())
            return f"(URI {frag})"
        case Literal():
            if i.isnumeric():
                return f'{i.title()}'
            return f'"{i.title()}"'


print(to_metta(q_alg.algebra))
q_basic = parser.parseQuery(StringIO(examples.basic_patterns))
q_basic_alg = algebra.translateQuery(q_basic)
print("basic patterns", to_metta(q_basic_alg.algebra))

q_q_node = parser.parseQuery(StringIO(examples.basic_pattern_qnode))
q_q_node_alg = algebra.translateQuery(q_q_node)
print("basic patterns qnode", to_metta(q_q_node_alg.algebra))

print("---")

q_filter = parser.parseQuery(StringIO(examples.filter_example_2))
q_filter_alg = algebra.translateQuery(q_filter)
print("filter", to_metta(q_filter_alg.algebra))

print("---")