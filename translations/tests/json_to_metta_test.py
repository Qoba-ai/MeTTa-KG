import json
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

    def test_quotation_marks(self):
        out = StringIO()
        d = {"k": 'this is a "quote"', "l": "\"this\" is also a quote"}
        dict_to_metta(out, d)

        self.assertEqual(out.getvalue(), '(k "this is a \\"quote\\"")\n'
                                        '(l "\\"this\\" is also a quote")\n')

        out2 = StringIO()
        dict_list_to_metta(out2, [d])
        self.assertEqual(out2.getvalue(), '(json 0 (k "this is a \\"quote\\""))\n'
                                         '(json 0 (l "\\"this\\" is also a quote"))\n')

    def test_backslashes(self):
        out = StringIO()
        d = {"k1": 'item1\\item2', "k2": "item3\\"}
        dict_to_metta(out, d)

        print(out.getvalue())
        self.assertEqual(out.getvalue(), '(k1 "item1\\\\\\\\item2")\n'
                                         '(k2 "item3\\\\\\\\")\n')

    def test_escape_characters(self):
        out = StringIO()
        d = {"k1": 'item1\nitem2', "k2": "item3\t"}
        dict_to_metta(out, d)

        print(out.getvalue())
        self.assertEqual(out.getvalue(), '(k1 "item1\\\\nitem2")\n'
                                        '(k2 "item3\\\\t")\n')

    def test_jsonld_playground(self):
        with open("test_files/jsonld_files/contexts_person.jsonld") as f:
            data = json.load(f)
        print(data)
        out = StringIO()
        dict_to_metta(out, data)
        print(out.getvalue())

    def test_jsonld(self):
        s = """{
              "@context": "https://schema.org",
              "@type": "Person",
              "name": "Frodo Baggins",
              "jobTitle": "Ring-Bearer",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Bag End, Hobbiton",
                "addressLocality": "The Shire",
                "addressRegion": "Middle-earth"
              },
              "birthPlace": "The Shire, Middle-earth",
              "sameAs": [
                "https://en.wikipedia.org/wiki/Frodo_Baggins",
                "https://lotr.fandom.com/wiki/Frodo_Baggins"
              ],
              "image": "frodobaggins.jpg"
            }"""
        out = StringIO()
        data = json.load(StringIO(s))
        dict_to_metta(out, data)
        self.assertEqual(out.getvalue(), "(@context \"https://schema.org\")\n"
                                         "(@type \"Person\")\n"
                                         "(name \"Frodo Baggins\")\n"
                                         "(jobTitle \"Ring-Bearer\")\n"
                                         "(address (@type \"PostalAddress\"))\n"
                                         "(address (streetAddress \"Bag End, Hobbiton\"))\n"
                                         "(address (addressLocality \"The Shire\"))\n"
                                         "(address (addressRegion \"Middle-earth\"))\n"
                                         "(birthPlace \"The Shire, Middle-earth\")\n"
                                         "(sameAs 0 \"https://en.wikipedia.org/wiki/Frodo_Baggins\")\n"
                                         "(sameAs 1 \"https://lotr.fandom.com/wiki/Frodo_Baggins\")\n"
                                         "(image \"frodobaggins.jpg\")\n")




if __name__ == '__main__':
    unittest.main()
