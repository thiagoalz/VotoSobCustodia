"""Evita duplicar dados quando o ZIP oficial inclui BRASIL e UFs."""
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline.inventory import csv_rows


class InventoryTests(unittest.TestCase):
    def test_national_copy_is_not_added_to_state_copies(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "locations.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("locais_BRASIL.csv", 'SG_UF;QT\nDF;8\nSP;20\n')
                archive.writestr("locais_DF.csv", 'SG_UF;QT\nDF;8\n')
                archive.writestr("locais_SP.csv", 'SG_UF;QT\nSP;20\n')
            rows = list(csv_rows(path))
            self.assertEqual(len(rows), 2)
            self.assertEqual(sum(int(row["QT"]) for row in rows), 28)

    def test_state_files_are_combined_when_no_national_copy_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "locations.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("locais_DF.csv", 'SG_UF;QT\nDF;8\n')
                archive.writestr("locais_SP.csv", 'SG_UF;QT\nSP;20\n')
            rows = list(csv_rows(path))
            self.assertEqual({row["SG_UF"] for row in rows}, {"DF", "SP"})
            self.assertEqual(sum(int(row["QT"]) for row in rows), 28)
