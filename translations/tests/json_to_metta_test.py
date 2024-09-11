import unittest
from io import StringIO
from translations.src.json_to_metta import *


basic_dict = {"outer":{"foo": {"a": 1, "b": 2, "c": 3}, "bar": {"x": 4, "y": 5}}}
basic_metta = """(outer (foo (a 1)))
(outer (foo (b 2)))
(outer (foo (c 3)))
(outer (bar (x 4)))
(outer (bar (y 5)))
"""


class MeTTaToJSON(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(basic_dict, metta_to_dict(StringIO(basic_metta)))


class JSONToMeTTa(unittest.TestCase):
    def setUp(self):
        self.nested_array = {"outer": [[{"a": [[["a", "b", "c"]]], "b": [["x", "y"]]}]]}

    def test_basic(self):
        out = StringIO()
        dict_to_metta(out, basic_dict)
        self.assertEqual(out.getvalue(), basic_metta)

    def test_nested_array(self):
        out = StringIO()
        dict_to_metta(out, basic_dict)
        self.assertEqual(out.getvalue(), "(outer (foo (a 1)))\n"
                                         "(outer (foo (b 2)))\n"
                                         "(outer (foo (c 3)))\n"
                                         "(outer (bar (x 4)))\n"
                                         "(outer (bar (y 5)))\n")


if __name__ == '__main__':
    unittest.main()
