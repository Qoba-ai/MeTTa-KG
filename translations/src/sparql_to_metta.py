import rdflib
from rdflib.plugins.sparql import parser, algebra
from pprint import pprint

with open("wiki_example.sparql") as f:
    q = parser.parseQuery(f)
    q_alg = algebra.translateQuery(q)

# print([k for k in q_alg.algebra.keys()])
# algebra.pprintAlgebra(q_alg)


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