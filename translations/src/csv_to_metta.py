import csv


def csv_to_matrix(filename, delimiter=",", quotechar='"') -> list[list[str]]:
    with open(filename, mode="r") as f:
        r = csv.reader(f, delimiter=delimiter, quotechar=quotechar)
        lines = [row for row in r]
    return lines


def csv_to_dict(filename, delimiter=",", quotechar='"') -> list[dict[str, str]]:
    with open(filename, mode="r") as f:
        r = csv.DictReader(f, delimiter=delimiter, quotechar=quotechar)
        lines = [d for d in r]
    return lines


# Index, Customer Id, First Name
# 1, DD37Cf93aecA6Dc, Sheryl
# 2, 1Ef7b82A4CAAD10, Preston

# => (row based, without header)
# (0 ("Index" "Customer Id" "First Name"))
# (1 (1 DD37Cf93aecA6Dc Sheryl))
# (2 (2 1Ef7b82A4CAAD10 Preston))

# => (row based, with header)
# (Header ("Index" "Customer Id" "First Name"))
# (0 (1 DD37Cf93aecA6Dc Sheryl))
# (1 (2 1Ef7b82A4CAAD10 Preston))

# => (struct based, with header)
# ((Index 1) ("Customer Id" DD37Cf93aecA6Dc) (...))

# => (field based, with header)
# (1 "Index" "1")
# (1 "Customer Id" "DD37Cf93aecA6Dc")
# (1 "First Name" "Sheryl")
# (2 "Index" "2")
# (2 "Customer Id" "1Ef7b82A4CAAD10")
# (2 "First Name" "Preston")


# row based without header
def matrix_to_row_based_metta(csvlist: list[list[str]]) -> str:
    return '\n'.join(['(' + str(e) + ' (' + ' '.join(['"' + elem + '"' for elem in row]) + ')' + ')' for e, row in enumerate(csvlist)])


# row based with header
def matrix_to_header_row_based(csvlist: list[list[str]]) -> str:
    return '(' + 'header ' + '(' + ' '.join([f'"{t}"' for t in csvlist[0]]) + '))\n' + matrix_to_row_based_metta(csvlist[1:])


# struct based with header
def dict_to_struct_based_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join(['(' + ' '.join([f'("{key}" "{value}")' for key, value in d.items()]) + ')' for d in dictlist])


# field based with header
def dict_to_field_based_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join(['\n'.join([f'({i} "{key}" "{value}")'
                                 for key, value in d.items()])
                      for i, d in enumerate(dictlist)])