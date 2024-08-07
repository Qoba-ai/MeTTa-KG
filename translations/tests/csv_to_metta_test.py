import unittest

from translations.src.csv_to_metta import *


class ReadCSV(unittest.TestCase):
    def setUp(self):
        self.customers_csv = ('Index,Name,Phone,Website\r\n'
                              '1,Alice Johnson,384.555.0192x123,http://www.alicejservices.com/\r\n'
                              '2,Michael Smith,(512)987-6543x56789,http://www.msmithtech.net/\r\n'
                              '3,Emily Davis,+1-310-555-6789,http://www.emilydavisconsulting.org/\r\n')
        self.customers_matrix = [['Index', 'Name', 'Phone', 'Website'],
                                 ['1', 'Alice Johnson', '384.555.0192x123', 'http://www.alicejservices.com/'],
                                 ['2', 'Michael Smith', '(512)987-6543x56789', 'http://www.msmithtech.net/'],
                                 ['3', 'Emily Davis', '+1-310-555-6789', 'http://www.emilydavisconsulting.org/']]
        self.customers_dict = [{'Index': '1', 'Name': 'Alice Johnson', 'Phone': '384.555.0192x123',
                                'Website': 'http://www.alicejservices.com/'},
                               {'Index': '2', 'Name': 'Michael Smith', 'Phone': '(512)987-6543x56789',
                                'Website': 'http://www.msmithtech.net/'},
                               {'Index': '3', 'Name': 'Emily Davis', 'Phone': '+1-310-555-6789',
                                'Website': 'http://www.emilydavisconsulting.org/'}]

    def test_to_matrix(self):
        self.assertEqual(self.customers_matrix,
                         csv_to_matrix("customers-3.csv"))

    def test_to_dict(self):
        self.assertEqual(self.customers_dict,
                         csv_to_dict("customers-3.csv"))

    def test_from_dict(self):
        self.assertEqual(self.customers_csv, dict_to_csv(self.customers_dict))


class CSVToMetta(unittest.TestCase):
    def setUp(self):
        self.m = csv_to_matrix("customers-3.csv")
        self.d = csv_to_dict("customers-3.csv")

    def test_row_based_without_header(self):
        self.assertEqual('(0 ("Index" "Name" "Phone" "Website"))\n'
                         '(1 ("1" "Alice Johnson" "384.555.0192x123" "http://www.alicejservices.com/"))\n'
                         '(2 ("2" "Michael Smith" "(512)987-6543x56789" "http://www.msmithtech.net/"))\n'
                         '(3 ("3" "Emily Davis" "+1-310-555-6789" "http://www.emilydavisconsulting.org/"))',
                         matrix_to_row_based_metta(self.m))

    def test_row_based_with_header(self):
        self.assertEqual('(header ("Index" "Name" "Phone" "Website"))\n'
                         '(0 ("1" "Alice Johnson" "384.555.0192x123" "http://www.alicejservices.com/"))\n'
                         '(1 ("2" "Michael Smith" "(512)987-6543x56789" "http://www.msmithtech.net/"))\n'
                         '(2 ("3" "Emily Davis" "+1-310-555-6789" "http://www.emilydavisconsulting.org/"))',
                         matrix_to_header_row_based(self.m))

    def test_struct_based(self):
        self.assertEqual(
            '(("Index" "1") ("Name" "Alice Johnson") ("Phone" "384.555.0192x123") ("Website" "http://www.alicejservices.com/"))\n'
            '(("Index" "2") ("Name" "Michael Smith") ("Phone" "(512)987-6543x56789") ("Website" "http://www.msmithtech.net/"))\n'
            '(("Index" "3") ("Name" "Emily Davis") ("Phone" "+1-310-555-6789") ("Website" "http://www.emilydavisconsulting.org/"))',
            dict_to_struct_based_metta(self.d))

    def test_field_based(self):
        self.assertEqual('(0 "Index" "1")\n'
                         '(0 "Name" "Alice Johnson")\n'
                         '(0 "Phone" "384.555.0192x123")\n'
                         '(0 "Website" "http://www.alicejservices.com/")\n'
                         '(1 "Index" "2")\n'
                         '(1 "Name" "Michael Smith")\n'
                         '(1 "Phone" "(512)987-6543x56789")\n'
                         '(1 "Website" "http://www.msmithtech.net/")\n'
                         '(2 "Index" "3")\n'
                         '(2 "Name" "Emily Davis")\n'
                         '(2 "Phone" "+1-310-555-6789")\n'
                         '(2 "Website" "http://www.emilydavisconsulting.org/")',
                         dict_to_field_based_metta(self.d))


class ParseMeTTa(unittest.TestCase):
    def test_parse_metta(self):
        kb = hyperon.SpaceRef(hyperon.GroundingSpace())
        m = hyperon.MeTTa(space=kb)
        kb.add_atom(hyperon.E(hyperon.S("0"), hyperon.E(hyperon.S('"Index"'), hyperon.S('"Name"'), hyperon.S('"Phone"'),
                                                        hyperon.S('"Website"'))))
        kb.add_atom(hyperon.E(hyperon.S("1"),
                              hyperon.E(hyperon.S('"1"'), hyperon.S('"Alice Johnson"'), hyperon.S('"384.555.0192x123"'),
                                        hyperon.S('"http://www.alicejservices.com/"'))))

        # TODO better way of comparing
        self.assertEqual([str(a) for a in parse_metta('(0 ("Index" "Name" "Phone" "Website"))\n'
                                                      '(1 ("1" "Alice Johnson" "384.555.0192x123" "http://www.alicejservices.com/"))\n').space().get_atoms()],
                         [str(a) for a in kb.get_atoms()])


class MeTTaToCSV(unittest.TestCase):
    def setUp(self):
        self.customer_matrix = [["Index", "Name", "Phone", "Website"],
                  ["1", "Alice Johnson", "384.555.0192x123", "http://www.alicejservices.com/"],
                  ["2", "Michael Smith", "(512)987-6543x56789", "http://www.msmithtech.net/"],
                  ["3", "Emily Davis", "+1-310-555-6789", "http://www.emilydavisconsulting.org/"]]
        self.customers_dict = [{'Index': '1', 'Name': 'Alice Johnson', 'Phone': '384.555.0192x123',
                                'Website': 'http://www.alicejservices.com/'},
                               {'Index': '2', 'Name': 'Michael Smith', 'Phone': '(512)987-6543x56789',
                                'Website': 'http://www.msmithtech.net/'},
                               {'Index': '3', 'Name': 'Emily Davis', 'Phone': '+1-310-555-6789',
                                'Website': 'http://www.emilydavisconsulting.org/'}]


    def test_matrix_to_csv(self):
        self.assertEqual("Index,Name,Phone,Website\r\n"
                         "1,Alice Johnson,384.555.0192x123,http://www.alicejservices.com/\r\n"
                         "2,Michael Smith,(512)987-6543x56789,http://www.msmithtech.net/\r\n"
                         "3,Emily Davis,+1-310-555-6789,http://www.emilydavisconsulting.org/\r\n",
                         matrix_to_csv_str(self.customer_matrix)
                         )

    def test_row_based_to_matrix(self):
        customer_row_metta = parse_metta('(0 ("Index" "Name" "Phone" "Website"))\n'
                         '(1 ("1" "Alice Johnson" "384.555.0192x123" "http://www.alicejservices.com/"))\n'
                         '(2 ("2" "Michael Smith" "(512)987-6543x56789" "http://www.msmithtech.net/"))\n'
                         '(3 ("3" "Emily Davis" "+1-310-555-6789" "http://www.emilydavisconsulting.org/"))')

        self.assertEqual(self.customer_matrix,
                         matrix_from_row_based_metta(customer_row_metta))

    def test_header_row_based_to_matrix(self):
        customer_header_row_metta = parse_metta('(header ("Index" "Name" "Phone" "Website"))\n'
                         '(0 ("1" "Alice Johnson" "384.555.0192x123" "http://www.alicejservices.com/"))\n'
                         '(1 ("2" "Michael Smith" "(512)987-6543x56789" "http://www.msmithtech.net/"))\n'
                         '(2 ("3" "Emily Davis" "+1-310-555-6789" "http://www.emilydavisconsulting.org/"))')

        self.assertEqual(self.customer_matrix,
                         matrix_from_header_row_based(customer_header_row_metta))

    def test_struct_based_to_dict(self):
        customer_struct_metta = parse_metta(
            '(("Index" "1") ("Name" "Alice Johnson") ("Phone" "384.555.0192x123") ("Website" "http://www.alicejservices.com/"))\n'
            '(("Index" "2") ("Name" "Michael Smith") ("Phone" "(512)987-6543x56789") ("Website" "http://www.msmithtech.net/"))\n'
            '(("Index" "3") ("Name" "Emily Davis") ("Phone" "+1-310-555-6789") ("Website" "http://www.emilydavisconsulting.org/"))')

        self.assertEqual(self.customers_dict, dict_from_struct_based_metta(customer_struct_metta))

    def test_field_based_to_dict(self):
        customer_field_based = parse_metta('(0 "Index" "1")\n'
                                           '(0 "Name" "Alice Johnson")\n'
                                           '(0 "Phone" "384.555.0192x123")\n'
                                           '(0 "Website" "http://www.alicejservices.com/")\n'
                                           '(1 "Index" "2")\n'
                                           '(1 "Name" "Michael Smith")\n'
                                           '(1 "Phone" "(512)987-6543x56789")\n'
                                           '(1 "Website" "http://www.msmithtech.net/")\n'
                                           '(2 "Index" "3")\n'
                                           '(2 "Name" "Emily Davis")\n'
                                           '(2 "Phone" "+1-310-555-6789")\n'
                                           '(2 "Website" "http://www.emilydavisconsulting.org/")')

        self.assertEqual(self.customers_dict, dict_from_field_based_metta(customer_field_based))


if __name__ == '__main__':
    unittest.main()
