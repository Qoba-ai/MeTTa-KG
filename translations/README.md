# Translations to MeTTa
## Table of Contents

- [CSV Translations](#csv-translations)
  - [Row based](#row-based)
    - [Row based without header](#row-based-without-header)
    - [Row based with header](#row-based-with-header)
      - [Naive](#naive)
      - [Struct based](#struct-based)
      - [Field based](#field-based)
      - [Functional](#functional)
  - [Column based](#column-based)
    - [Column based without header](#column-based-without-header)
    - [Column based with header/without column numbers](#column-based-with-header/without-column-numbers)
  - [Cell based](#cell-based)
    - [Cell based unlabeled](#cell-based-unlabeled)
    - [Cell based labeled](#cell-based-labeled)
- [N3 Translations](#n3-translations)
  - [Using RDF triples](#using-rdf-triples)
  - [Syntactic translation - not yet implemented](#syntactic-translation---not-yet-implemented)
- [NTriples Translations](#ntriples-translations)
- [JSONLD Translations](#jsonld-translations)
  - [Using RDF triples](#using-rdf-triples)
  - [Using JSON parsing](#using-json-parsing)



## CSV Translations

### Row based
- For csv files that are structured per row
  - E.g. every row contains information about a person 
- one atom will contain the information of one row
- rows will be numbered in the atoms (enables isomorphism between CSV and MeTTa)

#### Row based without header
Example:
Csv:

|            |           |                            |
|------------|-----------|----------------------------|  
| Sheryl     | Johnson   | Sheryl.Johnson@example.com |  
| Preston    | Smidth    | P.Smidth@example.com       |  

MeTTa
```
(0 (Sheryl Johnson Sheryl.Johnson@example.com))
(1 (Preston Smidth P.Smidth@example.com))
```


#### Row based with header
| Customer Id     | First Name | Last Name |
|-----------------|------------|-----------|
| DD37Cf93aecA6Dc | Sheryl     | Johnson   |
| 1Ef7b82A4CAAD10 | Preston    | Smidth    |


##### Naive
- The first row labels the information that each column contains

MeTTa:

```
(Header ("Customer Id" "First Name" "Last Name))
(0 (DD37Cf93aecA6Dc Sheryl Johnson))
(1 (1Ef7b82A4CAAD10 Preston Smidth))
```


##### Struct based
- Every row is encoded as one MeTTa atom, in which every cell is labeled with its header

MeTTa:
```
(("Customer Id" DD37Cf93aecA6Dc) ("First Name" Sheryl) ("Last Name" Johnson))
(("Customer Id" 1Ef7b82A4CAAD10) ("First Name" Prestoner) ("Last Name" Smidth))
```

##### Field based
- I think Functional is a more elegant version of this one

MeTTa:
```
(1 "Customer Id" "DD37Cf93aecA6Dc")
(1 "First Name" "Sheryl")
(1 "Last Name" "Johnson")
(2 "Customer Id" "1Ef7b82A4CAAD10")
(2 "First Name" "Preston")
(2 "Last Name" "Smidth")
```

##### Functional
- Every cell is encoded as a function of its header and row number 

MeTTa:
```
(= (value ("Customer Id" 0)) "DD37Cf93aecA6Dc")
(= (value ("First Name" 0)) "Sheryl")
(= (value ("Last Name" 0)) "Johnson")
(= (value ("Customer Id" 1)) "1Ef7b82A4CAAD10")
(= (value ("First Name" 1)) "Preston")
(= (value ("Last Name" 1)) "Smidth")
```

### Column based
- idea: you want to parse the information per column
- one atom will contain the information of one column
- columns will be numbered in the atoms (enables isomorphism between CSV and MeTTa)

Example: Daily todo list

| Monday      | Tuesday               | Wednesday |
|-------------|-----------------------|-----------|  
| Programming | Learn category theory | Meeting   |  
| Piano class | Send e-mail           | Sleep     |  

#### Column based without header
```
(0 (Monday Programming "Piano class"))
(1 (Tuesday "Learn category theory" "Send e-mail"))
(2 (Wednesday Meeting Sleep))
```

#### Column based with header/without column numbers
```
(Monday (Programming "Piano class"))
(Tuesday ("Learn category theory" "Send e-mail"))
(Wednesday (Meeting Sleep))
```

### Cell based

#### Cell based unlabeled
e.g. unlabeled matrix

|     |     |     |
|-----|-----|-----|  
| a00 | a01 | a02 |  
| a10 | a11 | a12 |
| a20 | a21 | a22 |


```
(= (value (0 0)) a00)
(= (value (0 1)) a01)
(= (value (0 2)) a02)
(= (value (1 0)) a10)
(= (value (1 1)) a11)
(= (value (1 2)) a12)
...
```


#### Cell based labeled
- Question: what to do with top left corner?
- For CSV documents with both row and column labels
e.g. distances 

|           | Home | Bakery | DanceHall |
|-----------|------|--------|-----------|  
| Home      | a00  | a01    | a02       |  
| Bakery    | a10  | a11    | a12       |
| DanceHall | a20  | a21    | a22       |

```
(= (value (Home Home)) a00)
(= (value (Home Bakery)) a01)
(= (value (Home DanceHall)) a02)
(= (value (Bakery Home)) a10)
(= (value (Bakery Bakery)) a11)
(= (value (Bakery DanceHall)) a12)
...
```

## N3 Translations
The following N3 file describes the Lord of The Rings trilogy. If all books in the trilogy are read, the whole trilogy is read. 

N3 file:
```
@prefix log: <http://www.w3.org/2000/10/swap/log#> .

:LordOfTheRings a :Trilogy ;
    :member :TheFellowshipOfTheRing ;
    :member :TheTwoTowers ;
	:member :TheReturnOfTheKing .
:TheFellowshipOfTheRing a :Read .
:TheTwoTowers a :Read .
:TheReturnOfTheKing a :Read .

{ ?b a :Trilogy .
  ({ ?b :member ?b1 } { ?b1 a :Read }) log:forAllIn _:x .

} => { ?b a :Read } .
```

We have two translations to MeTTa:
### Using RDF triples
 - Upsides
   - Same MeTTa syntax as other RDF triples
 - Downsides:
   - A lot of the readability is lost 
   - Keywords like "forall" are represented as long IRI's


MeTTa translation:

```
((Graph 0) ((uriref (books.n3 TheTwoTowers)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Read))))
((Graph 0) ((uriref (books.n3 TheFellowshipOfTheRing)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Read))))
((Graph 0) ((uriref (books.n3 LordOfTheRings)) (uriref (books.n3 member)) (uriref (books.n3 TheReturnOfTheKing))))
((Graph 0) ((uriref (books.n3 LordOfTheRings)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Trilogy))))
((Graph _:Formula402) ((variable b) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Trilogy))))
((Graph _:Formula402) ((bnode fb3af1f10182946f39d17d057bb3036f4b1) (uriref (http://www.w3.org/2000/10/swap/log forAllIn)) (bnode fb3af1f10182946f39d17d057bb3036f4b3)))
((Graph _:Formula402) ((bnode fb3af1f10182946f39d17d057bb3036f4b1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (bnode fb3af1f10182946f39d17d057bb3036f4b2)))
((Graph _:Formula404) ((variable b1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Read))))
((Graph _:Formula402) ((bnode fb3af1f10182946f39d17d057bb3036f4b2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (Graph _:Formula404)))
((Graph _:Formula403) ((variable b) (uriref (books.n3 member)) (variable b1)))
((Graph _:Formula402) ((bnode fb3af1f10182946f39d17d057bb3036f4b1) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns first)) (Graph _:Formula403)))
((Graph _:Formula402) ((bnode fb3af1f10182946f39d17d057bb3036f4b2) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns rest)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns nil))))
((Graph _:Formula405) ((variable b) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Read))))
((Graph 0) ((Graph _:Formula402) (uriref (http://www.w3.org/2000/10/swap/log implies)) (Graph _:Formula405)))
((Graph 0) ((uriref (books.n3 LordOfTheRings)) (uriref (books.n3 member)) (uriref (books.n3 TheFellowshipOfTheRing))))
((Graph 0) ((uriref (books.n3 TheReturnOfTheKing)) (uriref (http://www.w3.org/1999/02/22-rdf-syntax-ns type)) (uriref (books.n3 Read))))
((Graph 0) ((uriref (books.n3 LordOfTheRings)) (uriref (books.n3 member)) (uriref (books.n3 TheTwoTowers))))
(Namespace ("log" "http://www.w3.org/2000/10/swap/log#"))
(Namespace ("local" "books.n3#"))
```

### Syntactic translation - not yet implemented
Future work!

 - Upsides:
   - Easier to read
   - Probably easier to work with
 - Downsides:
   - Harder to implement
   - Not confirm with translations of other RDF languages
   - We might need another library to parse the N3 files


```
(prefix log <http://www.w3.org/2000/10/swap/log#>)

(tripleN3 (LordOfTheRings a Trilogy))
(tripleN3 (LordOfTheRings member TheFellowshipOfTheRing))
(tripleN3 (LordOfTheRings member TheTwoTowers))
(tripleN3 (LordOfTheRings member TheReturnOfTheKing))

(tripleN3 (TheFellowshipOfTheRing a Read))
(tripleN3 (TheTwoTowers a Read))
(tripleN3 (TheReturnOfTheKing a Read))


(tripleN3 ((list (tripleN3 (b a trilogy)) (tripleN3 (list (tripleN3 (b member b1)) (tripleN3 (b1 a Read))) 
                                                     forAllIn 
                                                     x)) 
           implies 
           (tripleN3 (b a read)))

```

## NTriples Translations
The following NT example describes Alice and Bob.

NT file:
```
_:a <http://xmlns.com/foaf/0.1/name> "Alice" .
_:a <http://xmlns.com/foaf/0.1/age> "25"^^<http://www.w3.org/2001/XMLSchema#integer> .
_:a <http://xmlns.com/foaf/0.1/knows> _:b .
_:a <http://xmlns.com/foaf/0.1/interest> "Reading books"@en .

_:b <http://xmlns.com/foaf/0.1/name> "Bob" .
_:b <http://xmlns.com/foaf/0.1/age> "30"^^<http://www.w3.org/2001/XMLSchema#integer> .
_:b <http://xmlns.com/foaf/0.1/knows> _:a .
_:b <http://xmlns.com/foaf/0.1/interest> "Hiking"@en .
```

MeTTa translation:
```
((bnode "b") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Bob"))
((bnode "b") (uriref http://xmlns.com/foaf/0.1/interest) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en)) "Hiking"))
((bnode "b") (uriref http://xmlns.com/foaf/0.1/knows) (bnode "a"))
((bnode "a") (uriref http://xmlns.com/foaf/0.1/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Alice"))
((bnode "b") (uriref http://xmlns.com/foaf/0.1/age) ((literal (http://www.w3.org/2001/XMLSchema#integer)) "30"))
((bnode "a") (uriref http://xmlns.com/foaf/0.1/age) ((literal (http://www.w3.org/2001/XMLSchema#integer)) "25"))
((bnode "a") (uriref http://xmlns.com/foaf/0.1/interest) ((literal (http://www.w3.org/1999/02/22-rdf-syntax-ns#langString en)) "Reading books"))
((bnode "a") (uriref http://xmlns.com/foaf/0.1/knows) (bnode "b"))
```

## JSONLD Translations
example JSON-LD file:
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Frodo Baggins",
  "jobTitle": "Ring-Bearer",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Bag End, Hobbiton",
    "addressLocality": "The Shire",
    "addressRegion": "Middle-earth"
  },
  "birthPlace": "The Shire, Middle-earth",
  "sameAs": [
    "https://en.wikipedia.org/wiki/Frodo_Baggins",
    "https://lotr.fandom.com/wiki/Frodo_Baggins"
  ],
  "image": "frodobaggins.jpg"
}
```

### Using RDF triples
- upsides:
  - consistent with translations of other rdf formats
- downsides:
  - No context (in this example "https://schema.org"): context is not parsed by RDFlib library, we can parse it separately using JSON, but it gets overly complicated to match what rdf triples correspond to what part of the JSON-parsed context (although we think it is possible). 
    - This is easily fixed when only one context is present, as in this example. But in examples where multiple contexts are present (e.g. in "translations/tests/test_files/jsonld_files/multiple_contexts.jsonld"), this is much more difficult.
  - less readable

MeTTa translation:
```
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/birthPlace) ((literal (http://www.w3.org/2001/XMLSchema#string)) "The Shire, Middle-earth"))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/sameAs) (uriref https://en.wikipedia.org/wiki/Frodo_Baggins))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/name) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Frodo Baggins"))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/sameAs) (uriref https://lotr.fandom.com/wiki/Frodo_Baggins))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/image) (uriref file:///home/anneline/PycharmProjects/MeTTa-KG/translations/tests/frodobaggins.jpg))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/address) (bnode N485c157962df4c8ea8ce03abc371eec1))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://schema.org/Person))
((bnode N485c157962df4c8ea8ce03abc371eec1) (uriref http://www.w3.org/1999/02/22-rdf-syntax-ns#type) (uriref http://schema.org/PostalAddress))
((bnode N485c157962df4c8ea8ce03abc371eec1) (uriref http://schema.org/addressLocality) ((literal (http://www.w3.org/2001/XMLSchema#string)) "The Shire"))
((bnode N485c157962df4c8ea8ce03abc371eec1) (uriref http://schema.org/addressRegion) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Middle-earth"))
((bnode N485c157962df4c8ea8ce03abc371eec1) (uriref http://schema.org/streetAddress) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Bag End, Hobbiton"))
((bnode Nde9b20334f5e4986865e48252fe5834d) (uriref http://schema.org/jobTitle) ((literal (http://www.w3.org/2001/XMLSchema#string)) "Ring-Bearer"))
```

### Using JSON parsing
 - TODO: add keywords to the parser
 - upsides:
   - easier to read
 - downsides:
   - different format than other RDF languages
   - not all triples

MeTTa translation:
```
(@context "https://schema.org")
(@type "Person")
(name "Frodo Baggins")
(jobTitle "Ring-Bearer")
(address (@type "PostalAddress"))
(address (streetAddress "Bag End, Hobbiton"))
(address (addressLocality "The Shire"))
(address (addressRegion "Middle-earth"))
(birthPlace "The Shire, Middle-earth")
(sameAs 0 "https://en.wikipedia.org/wiki/Frodo_Baggins")
(sameAs 1 "https://lotr.fandom.com/wiki/Frodo_Baggins")
(image "frodobaggins.jpg")
```



