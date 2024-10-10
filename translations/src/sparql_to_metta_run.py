import sys
from sparql_to_metta import  

if __name__ == '__main__':
    filename = sys.argv[1]
    direction = sys.argv[2]
    delimiter = sys.argv[3]

    matrix = csv_to_matrix(f"{filename}.csv", delimiter=delimiter)

    if direction == '1':
        metta = matrix_to_row_based_metta(matrix)
    elif direction == '2':
        metta = matrix_to_column_based_metta(matrix)
    elif direction == '3':
        metta = matrix_to_cell_metta_unlabeled(matrix)
    else:
        raise Exception("Invalid parse direction")

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)
