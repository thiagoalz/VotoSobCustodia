"""Todos os dados deste arquivo são sintéticos e nunca são publicados no site."""
import csv
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline.import_votes import MAPPING_FIELDS, VOTE_FIELDS, build


class ImportVotesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.votes = self.root / "votes.csv"
        self.mapping = self.root / "mapping.csv"
        self.mapping_rows = [self.mapping_row(1, "teste-presidio", "presidio", 1),
                             self.mapping_row(2, "teste-socio", "socioeducativa", 1),
                             self.mapping_row(1, "teste-presidio", "presidio", 2)]
        self.vote_rows = [self.vote_row(1, 10, 8, 1), self.vote_row(1, 20, 2, 1),
                          self.vote_row(1, 95, 1, 1), self.vote_row(1, 96, 3, 1),
                          self.vote_row(2, 20, 4, 1), self.vote_row(1, 10, 5, 2),
                          self.vote_row(999, 10, 9000, 1)]

    @staticmethod
    def mapping_row(section, unit, kind, turn):
        return {"year": "2022", "turn": str(turn), "uf": "DF", "municipality_code": "97012", "zone": "001",
                "section": str(section), "unit_id": unit, "unit_name": unit, "kind": kind,
                "municipality": "MUNICÍPIO SINTÉTICO", "latitude": "", "longitude": "",
                "evidence_url": "https://www.tre-df.jus.br/fixture-inexistente", "reviewed_at": "2022-12-01", "reviewer": "TESTE SINTÉTICO"}

    @staticmethod
    def vote_row(section, number, votes, turn):
        return {"ANO_ELEICAO": "2022", "NR_TURNO": str(turn), "SG_UF": "DF", "CD_MUNICIPIO": "97012",
                "NR_ZONA": "1", "NR_SECAO": str(section), "DS_CARGO": "Presidente",
                "NR_VOTAVEL": str(number), "NM_VOTAVEL": f"CANDIDATO SINTÉTICO {number}", "QT_VOTOS": str(votes)}

    def run_import(self, zipped=False):
        with self.mapping.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=sorted(MAPPING_FIELDS))
            writer.writeheader(); writer.writerows(self.mapping_rows)
        text = io.StringIO(newline="")
        writer = csv.DictWriter(text, fieldnames=sorted(VOTE_FIELDS), delimiter=";")
        writer.writeheader(); writer.writerows(self.vote_rows)
        self.votes.write_bytes(text.getvalue().encode("latin-1"))
        votes = self.votes
        if zipped:
            votes = self.root / "votes.zip"
            with zipfile.ZipFile(votes, "w") as archive:
                archive.writestr("subdir/votes.csv", self.votes.read_bytes())
        return build(votes, self.mapping, 2022, "DF", "https://cdn.tse.jus.br/fixture-inexistente.csv", "2022-12-01")

    def test_separates_turns_categories_and_invalid_votes(self):
        data = self.run_import()
        self.assertEqual(len(data["units"]), 2)
        first = next(r for r in data["results"] if r["unit_id"] == "teste-presidio" and r["turn"] == 1)
        self.assertEqual((first["valid"], first["blank"], first["null"], first["total"]), (10, 1, 3, 14))
        self.assertEqual([c["votes"] for c in first["candidates"]], [8, 2])
        second = next(r for r in data["results"] if r["unit_id"] == "teste-presidio" and r["turn"] == 2)
        self.assertEqual(second["valid"], 5)
        socio = next(r for r in data["results"] if r["unit_id"] == "teste-socio")
        self.assertEqual(socio["valid"], 4)
        self.assertEqual(data["coverage"]["matched_sections"], 3)
        self.assertEqual(data["coverage"]["national_completeness"], "unknown")
        self.assertEqual(len(data["sources"][0]["sha256"]), 64)
        self.assertIsNone(data["units"][0]["latitude"])

    def test_streams_zip_without_extraction(self):
        data = self.run_import(zipped=True)
        self.assertEqual(len(data["results"]), 3)
        self.assertFalse((self.root / "subdir").exists())

    def test_rejects_duplicate_vote_rows(self):
        self.vote_rows.append(self.vote_rows[0].copy())
        with self.assertRaisesRegex(ValueError, "Votação duplicada"):
            self.run_import()

    def test_rejects_section_assigned_to_two_units(self):
        row = self.mapping_rows[0].copy(); row["unit_id"] = "outra-unidade"
        self.mapping_rows.append(row)
        with self.assertRaisesRegex(ValueError, "Seção duplicada"):
            self.run_import()

    def test_rejects_missing_mapped_section(self):
        self.vote_rows = [r for r in self.vote_rows if r["NR_SECAO"] != "2"]
        with self.assertRaisesRegex(ValueError, "sem votação presidencial"):
            self.run_import()

    def test_rejects_negative_votes(self):
        self.vote_rows[0]["QT_VOTOS"] = "-1"
        with self.assertRaisesRegex(ValueError, "Inteiro inválido"):
            self.run_import()

    def test_rejects_unknown_classification(self):
        self.mapping_rows[0]["kind"] = "inferido-pelo-nome"
        with self.assertRaisesRegex(ValueError, "Categoria"):
            self.run_import()

    def test_requires_official_evidence(self):
        self.mapping_rows[0]["evidence_url"] = "https://exemplo.com/fonte"
        with self.assertRaisesRegex(ValueError, "URL oficial HTTPS"):
            self.run_import()

    def test_rejects_incomplete_coordinates(self):
        self.mapping_rows[0]["latitude"] = "-15.8"
        with self.assertRaisesRegex(ValueError, "Coordenadas"):
            self.run_import()

    def test_rejects_inconsistent_unit_identity(self):
        self.mapping_rows[2]["kind"] = "socioeducativa"
        with self.assertRaisesRegex(ValueError, "Identificação inconsistente"):
            self.run_import()

    def test_rejects_future_review(self):
        self.mapping_rows[0]["reviewed_at"] = "2999-01-01"
        with self.assertRaisesRegex(ValueError, "futuro"):
            self.run_import()

    def test_does_not_use_other_offices_to_fill_missing_sections(self):
        for row in self.vote_rows:
            if row["NR_SECAO"] == "2": row["DS_CARGO"] = "Governador"
        with self.assertRaisesRegex(ValueError, "sem votação presidencial"):
            self.run_import()

    def test_rejects_unrecognised_special_vote_code(self):
        self.vote_rows[0]["NR_VOTAVEL"] = "97"
        with self.assertRaisesRegex(ValueError, "inesperado"):
            self.run_import()


if __name__ == "__main__":
    unittest.main()
