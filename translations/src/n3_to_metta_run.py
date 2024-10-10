import sys
from n3_to_metta import n3_to_graph, graph_to_mettastr 

if __name__ == '__main__':
    filename = sys.argv[1]
   
    with open(f"{filename}.n3", "r") as f:
        g = n3_to_graph(f)

    metta = graph_to_mettastr(g)

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)
