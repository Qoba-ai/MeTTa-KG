from typing import IO
from json import load, loads
import hyperon


def dict_generator(d, pre=None):
    pre = pre[:] if pre else []
    if isinstance(d, dict):
        for key, value in d.items():
            if isinstance(value, dict):
                yield from dict_generator(value, pre + [key])
            elif isinstance(value, list) or isinstance(value, tuple):
                for k0, v0 in enumerate(value):
                    if isinstance(v0, list) or isinstance(v0, tuple):
                        for k1, v1 in enumerate(v0):
                            if isinstance(v1, list) or isinstance(v1, tuple):
                                for k2, v2 in enumerate(v1):
                                    if isinstance(v2, list) or isinstance(v2, tuple):
                                        for k3, v3 in enumerate(v2):
                                            if isinstance(v3, list) or isinstance(v3, tuple):
                                                for k4, v4 in enumerate(v3):
                                                    if isinstance(v4, list) or isinstance(v4, tuple):
                                                        raise NotImplementedError()
                                                    else:
                                                        yield from dict_generator(v4, pre + [(key, k0, k1, k2, k3, k4)])
                                            else:
                                                yield from dict_generator(v3, pre + [(key, k0, k1, k2, k3)])
                                    else:
                                        yield from dict_generator(v2, pre + [(key, k0, k1, k2)])
                            else:
                                yield from dict_generator(v1, pre + [(key, k0, k1)])
                    else:
                        yield from dict_generator(v0, pre + [(key, k0)])
            else:
                yield pre + [key, value]
    else:
        yield pre + [d]


def json_to_dict(f: IO[str | bytes]) -> dict:
    return load(f)


def jsonl_to_dict_list(f: IO[str | bytes]) -> list[dict]:
    return [loads(line) for line in f.readlines()]


def dict_to_metta(f: IO[str], d: dict) -> None:
    for path in dict_generator(d):
        s = path[-1]
        # TODO escape strings
        if isinstance(s, str):
            # s = '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
            s = f'"{repr(s)[1:-1].replace("\\", "\\\\").replace('"', '\\"')}"'

        for item in reversed(path[:-1]):
            if isinstance(item, tuple):
                s = f"({' '.join(map(str, item))} {s})"
            else:
                s = f"({item} {s})"
        f.write(s + "\n")


def dict_list_to_metta(f: IO[str], ds: list[dict]) -> None:
    for i, d in enumerate(ds):
        for path in dict_generator(d):
            s = path[-1]
            # TODO escape strings
            if isinstance(s, str):
                # s = '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
                s = f'"{repr(s)[1:-1].replace("\\", "\\\\").replace('"', '\\"')}"'

            for item in reversed(path[:-1]):
                if isinstance(item, tuple):
                    s = f"({' '.join(map(str, item))} {s})"
                else:
                    s = f"({item} {s})"
            f.write(f"(json {i} {s})\n")


def expr_to_path(e: hyperon.Atom) -> list:
    if isinstance(e, hyperon.ExpressionAtom):
        return sum(map(expr_to_path, e.get_children()), [])
    elif isinstance(e, hyperon.SymbolAtom):
        return [e.get_name()]
    elif isinstance(e, hyperon.VariableAtom):
        raise NotImplementedError(f"variables not supported yet")
    elif isinstance(e, hyperon.GroundedAtom):
        return [e.get_object().value]
    else:
        raise NotImplementedError(f"{type(e)} type not recognized")


def metta_to_dict(f: IO[str]) -> dict:
    # it feels too hard to recognize arrays unhinted
    m = hyperon.MeTTa()
    es = m.parse_all(f.read())
    d = {}
    # print("atoms", len(es))
    for e in es:
        path = expr_to_path(e)
        d_ = d
        for k in path[:-2]:
            # print("k", k)
            if k in d_: d_ = d_[k]
            else: d_[k] = {}; d_ = d_[k]
        d_[path[-2]] = path[-1]
    return d
