import sys
from jsonld_to_metta import jsonld_to_graph, graph_to_mettastr

if __name__ == '__main__':
    filename = sys.argv[1]
   
    with open(f"{filename}.jsonld", "r") as f:
        g = jsonld_to_graph(f)

    metta = graph_to_mettastr(g)

    with open(f"{filename}-output.metta", "w+") as f:
        f.write(metta)
