from click import option
from rdflib.plugins.sparql import parser, algebra
from io import StringIO

def print_example(name: str, query:str):
    q = parser.parseQuery(StringIO(query))
    q_alg = algebra.translateQuery(q)
    print(name, "-"*(100 - len(name)))
    print()
    print(query)
    print("---")
    q.pprint()
    print("---")
    algebra.pprintAlgebra(q_alg)
    print("-" * 100)

basic_patterns = """SELECT ?x ?fname

WHERE {?x  <http://www.w3.org/2001/vcard-rdf/3.0#FN>  ?fname}"""


basic_pattern_qnode = """PREFIX vcard:  	<http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?y ?givenName
WHERE
 { ?y vcard:Family "Smith" .
   ?y vcard:Given  ?givenName .
 }
"""



filter_example = """PREFIX vcard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?g
WHERE
{ ?y vcard:Given ?g .
  FILTER regex(?g, "r", "i") }
"""

filter_example_2 = """PREFIX info: <http://somewhere/peopleInfo#>

SELECT ?resource
WHERE
  {
	?resource info:age ?age .
	FILTER (?age >= 24)
  }
"""

optionals = """PREFIX info:	<http://somewhere/peopleInfo#>
PREFIX vcard:   <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name ?age
WHERE
{
	?person vcard:FN  ?name .
	OPTIONAL { ?person info:age ?age }
}
"""
optionals_filter = """PREFIX info:    	<http://somewhere/peopleInfo#>
PREFIX vcard:  	<http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name ?age
WHERE
{
	?person vcard:FN  ?name .
	OPTIONAL { ?person info:age ?age . FILTER ( ?age > 24 ) }
}
"""

optionals_filter_2 = """PREFIX info:    	<http://somewhere/peopleInfo#>
PREFIX vcard:  	<http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name ?age
WHERE
{
	?person vcard:FN  ?name .
	OPTIONAL { ?person info:age ?age . }
	FILTER ( !bound(?age) || ?age > 24 )
}
"""

optional_dependent = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name
WHERE
{
  ?x a foaf:Person .
  OPTIONAL { ?x foaf:name ?name }
  OPTIONAL { ?x vCard:FN  ?name }
}
"""

union1 = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name
WHERE
{
   { [] foaf:name ?name } UNION { [] vCard:FN ?name }
}
"""

union2 = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name
WHERE
{
  [] ?p ?name
  FILTER ( ?p = foaf:name || ?p = vCard:FN )
}
"""

union3 = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name1 ?name2
WHERE
{
   { [] foaf:name ?name1 } UNION { [] vCard:FN ?name2 }
}

"""

union4 = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name1 ?name2
WHERE
{
  ?x a foaf:Person
  OPTIONAL { ?x  foaf:name  ?name1 }
  OPTIONAL { ?x  vCard:FN   ?name2 }
}
"""


limit = """PREFIX GOT: <https://tutorial.linked.data.world/d/sparqltutorial/>
SELECT ?ID ?FName ?LName

WHERE {
  ?person GOT:col-got-id ?ID .
  ?person GOT:col-got-fname ?FName .
  ?person GOT:col-got-lname ?LName .
}
LIMIT 5
"""



optional_dependent2 = """PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vCard: <http://www.w3.org/2001/vcard-rdf/3.0#>

SELECT ?name
WHERE
{
  OPTIONAL { ?x foaf:name ?name }
  OPTIONAL { ?x vCard:FN  ?name }
  ?x a foaf:Person .
}
"""

print_example("hsqoghqr", optional_dependent2)






print("BASIC PATTERNS")
print_example("basic pattern example", basic_patterns)
print_example("Basic Patterns: QNames / Blank Nodes", basic_pattern_qnode)

print("FILTERS")
print_example("Filters: String matching", filter_example)
print_example("Filters: Testing Values", filter_example_2)

print("OPTIONAL INFORMATION")
print_example("Optional information: OPTIONALs", optionals)
print_example("Optional information: OPTIONALs with FILTERs", optionals_filter)
print_example("Optional information: OPTIONALs with FILTERs 2", optionals_filter_2)
print_example("Optional information: OPTIONALs and Order Dependent Queries", optional_dependent)


print("UNION")
print_example("UNION - two ways to the same data", union1)
print_example("UNION - two ways to the same data 2", union2)
print_example("UNION - remembering where the data was found.", union3)
print_example("UNION - OPTIONAL and UNION", union4)

print_example("Retrieving a specific number of results", limit)

