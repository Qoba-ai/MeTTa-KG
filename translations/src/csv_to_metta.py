import csv
import hyperon
import numpy as np

from io import StringIO

from hyperon import ValueObject, GroundedAtom


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

# column based with header
def dict_to_column_based_header_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join(['(' + f'"{key}" ({" ".join([f"\"{d[key]}\"" for d in dictlist])})'  + ')' for key in dictlist[0].keys()])


def column_based_header_metta_to_dict(metta: hyperon.MeTTa) -> list[dict[str, str]]:
    atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    num_cols = len(atoms[0].get_children()[1].get_children())

    return [{a.get_children()[0].get_object().value: a.get_children()[1].get_children()[c].get_object().value for a in atoms} for c in range(num_cols)]




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


# row - function based
def dict_to_function_metta(dictlist: list[dict[str, str]]) -> str:
    return '\n'.join([f'(= (value ("{key}" {rownr})) "{value}")' for rownr, d in enumerate(dictlist) for key, value in d.items()])


def dict_from_function_metta(metta: hyperon.MeTTa) -> list[dict[str, str]]:
    atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    n_rows = max([a.get_children()[1].get_children()[1].get_children()[1].get_object().value for a in atoms]) + 1

    keys = metta.run(f'!(match &self (= (value ($k 1)) $v) $k)')[0]

    return [{k.get_object().value: metta.run(f'!(value ({k} {n}))')[0][0] for k in keys} for n in range(n_rows)]


# cell based unlabeled
def matrix_to_cell_metta_unlabeled(matrix: list[list[str]]) -> str:
    return '\n'.join([f'(= (value ({rownr} {colnr})) "{value}")' for rownr, row in enumerate(matrix) for colnr, value in enumerate(row)])


def matrix_from_cell_metta_unlabeled(metta: hyperon.MeTTa) -> list[list[str]]:
    # atoms = [r for r in metta.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    n_rows = max([a.get_object().value for a in metta.run(f'!(match &self (= (value ($rownr $colnr)) $v) $rownr)')[0]]) + 1
    n_cols = max([a.get_object().value for a in metta.run(f'!(match &self (= (value ($rownr $colnr)) $v) $colnr)')[0]]) + 1
    return [[metta.run(f'!(match &self (= (value ({rownr} {colnr})) $v) $v)')[0][0].get_object().value for colnr in range(n_cols)] for rownr in range(n_rows)]

    # n_cols = max([a.get_children()[1].get_children()[1].get_children()[1].get_object().value for a in atoms]) + 1


# cell based labeled
def matrix_to_cell_metta_labeled(matrix: list[list[str]]) -> str:
    # assume labels are in row 0 and column 0
    # TODO top-left corner of the matrix is not used
    collabels = matrix[0][1:]
    rowlabels = [r[0] for r in matrix[1:]]
    print("rowlabels", rowlabels)


    return '\n'.join([f'(= (value ("{rowlabel}" "{collabel}")) "{value}")'
                      for rowlabel, row in zip(rowlabels, matrix[1:])
                      for collabel, value in zip(collabels, row[1:])])

def matrix_from_cell_metta_labeled(metta: hyperon.MeTTa) -> list[list[str]]:
    rowlabels = list(set([a.get_object().value for a in metta.run(f'!(match &self (= (value ($rowlabel $collabel)) $v) $rowlabel)')[0]]))
    collabels = list(set([a.get_object().value for a in metta.run(f'!(match &self (= (value ($rowlabel $collabel)) $v) $collabel)')[0]]))

    return [[""] + collabels] + [[rowlabel] + [metta.run(f'!(match &self (= (value ("{rowlabel}" "{collabel}")) $v) $v)')[0][0].get_object().value
                                                     for collabel in collabels]
                                       for rowlabel in rowlabels]


