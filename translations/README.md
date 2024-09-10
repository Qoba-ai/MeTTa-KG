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

### Cell based
e.g. unlabeled matrix



## N3 Translations

## NTriples Translations

## JSONLD Translations


