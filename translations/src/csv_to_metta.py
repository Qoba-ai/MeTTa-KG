import csv
import hyperon
import numpy as np

from io import StringIO



def csv_to_matrix(filename, delimiter=",", quotechar='"') -> list[list[str]]:
    with open(filename, mode="r") as f:
        r = csv.reader(f, delimiter=delimiter, quotechar=quotechar)
        lines = [row for row in r]
    return lines


def matrix_to_csv_str(m: list[list[str]]) -> str:
    si = StringIO()
    employee_writer = csv.writer(si, delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
    for row in m:
        employee_writer.writerow(row)
    return si.getvalue()


def csv_to_dict(filename, delimiter=",", quotechar='"') -> list[dict[str, str]]:
    with open(filename, mode="r") as f:
        r = csv.DictReader(f, delimiter=delimiter, quotechar=quotechar)
        lines = [d for d in r]
    return lines


def dict_to_csv(datadict: list[dict[str, str]]) -> str:
    si = StringIO()
    writer = csv.DictWriter(si, fieldnames=datadict[0].keys(), delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    writer.writerows(datadict)

    return si.getvalue()


def parse_metta(mettastr: str, kb: hyperon.SpaceRef = None) -> hyperon.MeTTa:
    if not kb:
        kb = hyperon.SpaceRef(hyperon.GroundingSpace())
    metta = hyperon.MeTTa(space=kb)

    atoms: list[hyperon.ExpressionAtom] = metta.parse_all(mettastr)
    [kb.add_atom(a) for a in atoms]
    return metta


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

# => column based
# (0 ("Index" 1 2))
# (1 ("Customer Id" DD37Cf93aecA6Dc 1Ef7b82A4CAAD10))
# (2 ("First Name" Sheryl Preston))

# => (struct based, with header)
# ((Index 1) ("Customer Id" DD37Cf93aecA6Dc) (...))

# => (field based, with header)
# (1 "Index" "1")
# (1 "Customer Id" "DD37Cf93aecA6Dc")
# (1 "First Name" "Sheryl")
# (2 "Index" "2")
# (2 "Customer Id" "1Ef7b82A4CAAD10")
# (2 "First Name" "Preston")

# => Function based
# (= ("Index" 0) "1")
# (= ("Index" 1) "2")
# (= ("Customer Id" 0) "DD37Cf93aecA6Dc")
# (= ("Customer Id" 1) "1Ef7b82A4CAAD10")
# (= ("First Name" 0) "Sheryl")
# (= ("First Name" 1) "Preston")


# row based without header
def matrix_to_row_based_metta(csvlist: list[list[str]]) -> str:
    return '\n'.join(['(' + str(e) + ' (' + ' '.join(['"' + elem + '"' for elem in row]) + ')' + ')' for e, row in
                      enumerate(csvlist)])


def matrix_from_row_based_metta(m: hyperon.MeTTa) -> list[list[str]]:
    """Assume all atoms have the structure (rownr (string per column))"""
    atoms = [a for a in m.space().get_atoms() if isinstance(a, hyperon.ExpressionAtom)]
    atoms.sort(key=lambda x: int(x.get_children()[0].get_object().value))
    return [[c.get_object().value for c in a.get_children()[1].get_children()] for a in
            atoms]  # currently, this only works for GroundedAtoms


# row based with header
def matrix_to_header_row_based(csvlist: list[list[str]]) -> str:
    return '(' + 'header ' + '(' + ' '.join([f'"{t}"' for t in csvlist[0]]) + '))\n' + matrix_to_row_based_metta(
        csvlist[1:])


def matrix_from_header_row_based(m: hyperon.MeTTa) -> list[list[str]]:
    # print('atoms', kb.get_atoms())
    header = m.run('!(match &self (header $pattern) (header $pattern))')[0][0]
    atoms = m.run('!(match &self ($nr $pattern) ($nr $pattern))')[0]
    atoms.remove(header)
    atoms.sort(key=lambda x: int(x.get_children()[0].get_object().value))
    return [[c.get_object().value for c in header.get_children()[1].get_children()]] + [[c.get_object().value for c in a.get_children()[1].get_children()] for a in
                     atoms]  # currently, this only works for GroundedAtoms


# column based
def matrix_to_column_based_metta(csvmatrix: list[list[str]]) -> str:
    return matrix_to_row_based_metta([list(a) for a in np.transpose(csvmatrix)])


def matrix_from_column_based_metta(metta: hyperon.MeTTa) -> list[list[str, str]]:
    return [list(a) for a in np.transpose(matrix_from_row_based_metta(metta))]


# struct based with header
def dict_to_struct_based_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join(['(' + ' '.join([f'("{key}" "{value}")' for key, value in d.items()]) + ')' for d in dictlist])


def dict_from_struct_based_metta(metta: hyperon.MeTTa) -> list[dict[str, str]]:
    kb = metta.space()
    atoms = [r for r in kb.get_atoms() if isinstance(r, hyperon.ExpressionAtom)]

    return [{t.get_children()[0].get_object().value: t.get_children()[1].get_object().value for t in c.get_children()} for c in atoms]


# field based with header
def dict_to_field_based_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join(['\n'.join([f'({i} "{key}" "{value}")'
                                 for key, value in d.items()])
                      for i, d in enumerate(dictlist)])


def dict_from_field_based_metta(metta: hyperon.MeTTa) -> list[dict[str, str]]:
    atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    n_rows = max([a.get_children()[0].get_object().value for a in atoms]) + 1

    atom_dict = [dict() for _ in range(n_rows)]
    for a in atoms:
        cs = a.get_children()
        row_nr = cs[0].get_object().value
        label = cs[1].get_object().value
        value = cs[2].get_object().value

        atom_dict[row_nr][label] = value

    return atom_dict

