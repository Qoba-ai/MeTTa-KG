# PLAYGROUND FILE!!!!!
# UNFINISHED!!!!!
import os.path
from io import StringIO

import rdflib
from hyperon import MatchableAtom
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
        case "LeftJoin":
            p1 = algebra["p1"]
            p2 = algebra["p2"]
            expr = algebra["expr"]
            print(set(p1["_vars"]).intersection(set(p2["_vars"])))
            # return f"{to_metta(p1)} (chain (collapse {to_metta(p2)} if  "
            return to_metta(p1)
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

q_optionals = parser.parseQuery(StringIO(examples.optionals))
q_optionals_alg = algebra.translateQuery(q_optionals)
print("optionals", to_metta(q_optionals_alg.algebra))

print("---")

q_optionals2 = parser.parseQuery(StringIO(examples.optional_dependent))
q_optionals2_alg = algebra.translateQuery(q_optionals2)
print("optionals", to_metta(q_optionals2_alg.algebra))


class IntermediateMetta:
    to_do: any
    vs: any

    def add_filter(self, expr):
        self.to_do = If(expr, self.to_do, "Empty", self.vs)
        return self
    def to_str(self):
        return str(self)
    def to_metta(self):
        pass

class Match(IntermediateMetta):
    to_match: list[tuple[rdflib.term.Literal | rdflib.term.Variable | rdflib.term.URIRef | rdflib.term.BNode]]
    to_do: IntermediateMetta

    def __init__(self, to_match, to_do, _vars):
        self.to_match = to_match
        self.to_do = to_do
        self.vs = _vars

    def to_str(self):
        return f"(Match [to_match = {', '.join([str(m) for m in self.to_match])}, to_do = {self.to_do.to_str()}])"

    def to_metta(self):
        print("to match", self.to_match)
        trips = ' '.join( [f"({' '.join([item_to_metta(i) for i in trip])})" for trip in self.to_match])
        return f"(match &self (, {trips}) {self.to_do.to_metta()})"

class If(IntermediateMetta):
    expr: str
    to_do: IntermediateMetta
    if_not: IntermediateMetta

    def __init__(self, expr, to_do, if_not, _vars):
        self.expr = expr
        self.to_do = to_do
        self.if_not = if_not
        self.vs = _vars

    def to_str(self):
        return f"(If [expr = {self.expr}, to_do = {self.to_do}, if_not = {self.if_not}])"

    def to_metta(self):
        return f"(if (...) {self.to_do.to_metta()} {self.if_not})"

class VarList:
    varlist: list[rdflib.Variable]
    def __init__(self, varlist):
        self.varlist = list(varlist)

    def to_str(self):
        return f"({', '.join([str(v) for v in self.varlist])})"

    def to_metta(self):
        if len(self.varlist) == 1:
            return item_to_metta(self.varlist[0])
        return f"({' '.join([item_to_metta(v) for v in self.varlist])})"

class Let(IntermediateMetta):
    var: VarList
    to_eval: IntermediateMetta
    to_do: IntermediateMetta

    def __init__(self, var, to_eval, to_do, _vars):
        self.to_eval = to_eval
        self.var = var
        self.to_do = to_do
        self.vs = _vars

    def to_str(self):
        return f"(Let [var = {self.var}, to_eval = {self.to_eval.to_str()}, to_do = {self.to_do.to_str()}])"

    def to_metta(self):
        if len(self.var.varlist) == 1:
            print("to eval", self.to_eval)
            return f"(let ${self.var.varlist[0].title()} {self.to_eval.to_metta()} {self.to_do.to_metta()})"
        return f"(let {self.var.to_metta()} {self.to_eval.to_metta()} {self.to_do.to_metta()})"

class Collapse:
    to_do: IntermediateMetta
    def __init__(self, to_do, _vars):
        self.to_do = to_do
        self.vs = _vars

    def to_str(self):
        return f"(Collapse [to_do = {self.to_do.to_str()}])"

    def to_metta(self):
        return f"(collapse {self.to_do.to_metta()})"

class Union:
    l: IntermediateMetta
    r: IntermediateMetta

    def __init__(self, l, r):
        print(l)
        print(r)
        self.l = l
        self.r = r

    def to_str(self):
        return f"(union [l = {self.l.to_str()}, r = {self.r.to_str()}])"

    def to_metta(self):
        return f"(union {self.l.to_metta()} {self.r.to_metta()})"

# hyperon.E(hyperon.S("one"), hyperon.S("two"))
def to_metta_second_try(algebra):
    match algebra.name:
        case "SelectQuery":
            p = algebra["p"]
            datasetClause = algebra["datasetClause"]
            PV = algebra["PV"]
            vs = algebra["_vars"]
            # print(f"(let* {to_metta(p)} ({' '.join(['$' + v.title() for v in PV])}))")
            # return f"(let* ({to_metta(p)}) ({' '.join(['$' + v.title() for v in PV])}))"
            return to_metta_second_try(p)

        case "Project":
            p = algebra["p"]
            PV = algebra["PV"]
            vs = algebra["_vars"]
            m = to_metta_second_try(p)
            # m.to_do = VarList(vs)
            return Let(VarList(vs), m, VarList(PV), vs)
        case "BGP":
            triples = algebra["triples"]
            vs = algebra["_vars"]
            return Match([t for t in triples], VarList(vs), vs)
        case "Filter":
            expr = algebra["expr"]
            p = algebra["p"]
            vs = algebra["_vars"]
            return to_metta_second_try(p).add_filter(expr)
        case "LeftJoin":
            p1 = algebra["p1"]
            p2 = algebra["p2"]
            expr = algebra["expr"]
            vs = algebra["_vars"]
            # (match &self ($person FN $name) (chain (collapse (match &self ($person age $age) $age)) $n1 ($name $n1)))
            # (match &self ($person FN $name) (let $n1 (collapse (match &self ($person age $age) $age)) ($name $n1)))
            lhs = to_metta_second_try(p1)
            rhs = to_metta_second_try(p2)

            optional_vars = set(rhs.vs).difference(lhs.vs)
            rhs.to_do = VarList(optional_vars)
            assert len(optional_vars) == 1

            lhs.to_do = Let(VarList([list(optional_vars)[0]]), Collapse(rhs, vs), VarList(vs), vs)
            return lhs
        case _:
            print("unmatched")
            print(type(algebra))

print("----------------------------------------------------")
print("SECOND TRY")
print("basic patterns", to_metta_second_try(q_basic_alg.algebra).to_str())

t = to_metta_second_try(q_filter_alg.algebra)
print(t.to_do.to_str())
print("filter", to_metta_second_try(q_filter_alg.algebra).to_str())
print("filter", to_metta_second_try(q_filter_alg.algebra).to_metta())

print("optional", to_metta_second_try(q_optionals2_alg.algebra).to_str())

print("basic patterns", to_metta_second_try(q_basic_alg.algebra).to_metta())
q_basic_qnode = parser.parseQuery(StringIO(examples.basic_pattern_qnode))
q_basic_qnode_alg = algebra.translateQuery(q_basic_qnode)
print("Basic Patterns: QNames / Blank Nodes", to_metta_second_try(q_basic_qnode_alg.algebra).to_metta())
print("optional", to_metta_second_try(q_optionals2_alg.algebra).to_metta())


print("OPTIONAL")
p = parser.parseQuery(StringIO(examples.optionals))
alg = algebra.translateQuery(p)
print("Optional information: OPTIONALs", to_metta_second_try(alg.algebra).to_metta())
print("Optional information: OPTIONALs with FILTERs", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.optionals_filter))).algebra).to_metta())
print("Optional information: OPTIONALs with FILTERs 2", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.optionals_filter_2))).algebra).to_metta())
print("Optional information: OPTIONALs and Order Dependent Queries", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.optional_dependent))).algebra).to_metta())
print("Optional information: OPTIONALs and Order Dependent Queries", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.optional_dependent))).algebra).to_metta())

print("UNION")
# print("UNION - two ways to the same data", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.union1))).algebra).to_metta())
# print("UNION - two ways to the same data 2", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.union2))).algebra).to_metta())
# print("UNION - remembering where the data was found.", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.union3))).algebra).to_metta())
# print("UNION - OPTIONAL and UNION", to_metta_second_try(algebra.translateQuery(parser.parseQuery(StringIO(examples.union4))).algebra).to_metta())
