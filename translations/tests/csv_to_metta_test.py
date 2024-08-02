import unittest

from translations.src.csv_to_metta import *


class ReadCSV(unittest.TestCase):
    def test_to_matrix(self):
        self.assertEqual([['Index', 'Name', 'Phone', 'Website'],
                          ['1', 'Alice Johnson', '384.555.0192x123', 'http://www.alicejservices.com/'],
                          ['2', 'Michael Smith', '(512)987-6543x56789', 'http://www.msmithtech.net/'],
                          ['3', 'Emily Davis', '+1-310-555-6789', 'http://www.emilydavisconsulting.org/']],
                         csv_to_matrix("customers-3.csv"))

    def test_to_dict(self):
        self.assertEqual([{'Index': '1', 'Name': 'Alice Johnson', 'Phone': '384.555.0192x123', 'Website': 'http://www.alicejservices.com/'},
                          {'Index': '2', 'Name': 'Michael Smith', 'Phone': '(512)987-6543x56789', 'Website': 'http://www.msmithtech.net/'},
                          {'Index': '3', 'Name': 'Emily Davis', 'Phone': '+1-310-555-6789', 'Website': 'http://www.emilydavisconsulting.org/'}],
                         csv_to_dict("customers-3.csv"))


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
        self.assertEqual('(("Index" "1") ("Name" "Alice Johnson") ("Phone" "384.555.0192x123") ("Website" "http://www.alicejservices.com/"))\n'
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


if __name__ == '__main__':
    unittest.main()
