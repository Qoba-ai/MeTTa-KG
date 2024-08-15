import sys
from csv_to_metta import csv_to_matrix, matrix_to_row_based_metta

if __name__ == '__main__':
    filename = sys.argv[1]

    # TODO: support different delimiters 

    matrix = csv_to_matrix(f"{filename}.csv")
    metta = matrix_to_row_based_metta(matrix)

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)
