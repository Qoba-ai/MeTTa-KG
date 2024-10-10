import sys
from nt_to_metta import parse_nt, graph_to_mettastr

if __name__ == '__main__':
    filename = sys.argv[1]

    g, bnodes = parse_nt(f"{filename}.nt")
    metta = graph_to_mettastr(g, bnodes) 

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)

