import csv
from io import StringIO

import hyperon


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
    # !!! fieldnames here don't have a particular order (yet)
    writer = csv.DictWriter(si, fieldnames=datadict[0].keys(), delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    writer.writerows(datadict)

    return si.getvalue()


def parse_metta(mettastr: str, kb: hyperon.SpaceRef = None) -> hyperon.MeTTa:
    if not kb:
        kb = hyperon.SpaceRef(hyperon.GroundingSpace())
    m = hyperon.MeTTa(space=kb)

    atoms: list[hyperon.ExpressionAtom] = m.parse_all(mettastr)
    [kb.add_atom(a) for a in atoms]
    return m


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
    return '\n'.join(['(' + str(e) + ' (' + ' '.join(['"' + elem + '"' for elem in row]) + ')' + ')' for e, row in
                      enumerate(csvlist)])


def matrix_from_row_based_metta(m: hyperon.MeTTa) -> list[list[str]]:
    """Assume all atoms have the structure (rownr (string per column))"""
    atoms = [a for a in m.space().get_atoms() if isinstance(a, hyperon.ExpressionAtom)]
    print(atoms)
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
