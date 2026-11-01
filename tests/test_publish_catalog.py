import unittest

from pipeline.publish_catalog import process_year, apply_classifications, coordinates


def location(section=1, turn=1, local=100, kind="3", aggregate="1"):
    return {"AA_ELEICAO": "2022", "NR_TURNO": str(turn), "SG_UF": "DF", "CD_MUNICIPIO": "97012",
            "NR_ZONA": "1", "NR_SECAO": str(section), "NR_LOCAL_VOTACAO": str(local),
            "CD_TIPO_LOCAL": kind, "DS_TIPO_LOCAL": "Preso provisório", "CD_TIPO_SECAO_AGREGADA": aggregate,
            "NM_LOCAL_VOTACAO": "UNIDADE SINTÉTICA", "NM_MUNICIPIO": "BRASÍLIA", "NR_LATITUDE": "-1", "NR_LONGITUDE": "-1"}


def vote(section=1, turn=1, number=10, count=5, local=100):
    return {"ANO_ELEICAO": "2022", "NR_TURNO": str(turn), "SG_UF": "DF", "CD_MUNICIPIO": "97012",
            "NR_ZONA": "1", "NR_SECAO": str(section), "NR_LOCAL_VOTACAO": str(local),
            "DS_CARGO": "Presidente", "NR_VOTAVEL": str(number), "QT_VOTOS": str(count), "NM_VOTAVEL": f"SINTÉTICO {number}"}


def process(locations, votes):
    return process_year(iter(locations), iter(votes), 2022, "https://cdn.tse.jus.br/fixture-inexistente.zip")


class PublishCatalogTests(unittest.TestCase):
    def test_official_scope_aggregation_and_turn_separation(self):
        data = process([location(), location(2), location(turn=2), location(3, kind="1")],
                       [vote(), vote(2, number=20, count=3), vote(number=95, count=2), vote(number=96, count=1),
                        vote(turn=2, count=9), vote(3, count=9000)])
        self.assertEqual(len(data["results"]), 2)
        first = next(r for r in data["results"] if r["turn"] == 1)
        self.assertEqual((first["valid"], first["blank"], first["null"], first["total"]), (8, 2, 1, 11))
        self.assertEqual(first["section_count"], 2)
        self.assertEqual(next(r for r in data["results"] if r["turn"] == 2)["total"], 9)
        self.assertEqual(data["units"][0]["kind"], "unclassified")
        self.assertIsNone(data["units"][0]["latitude"])

    def test_missing_sections_are_not_counted_as_zero(self):
        data = process([location(), location(2, local=200)], [vote()])
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["coverage"][0]["registered_principal_sections"], 2)
        self.assertEqual(data["coverage"][0]["matched_sections"], 1)
        self.assertFalse(data["units"][1]["sections"][0]["matched"])
        self.assertTrue(any(e["reason"] == "no_corresponding_vote_rows" for e in data["excluded"]))

    def test_aggregated_sections_are_not_added_to_principal(self):
        data = process([location(), location(2, aggregate="2")], [vote(), vote(2, count=8000)])
        self.assertEqual(data["results"][0]["total"], 5)
        self.assertTrue(any(e["reason"] == "aggregated_section_not_attributed" for e in data["excluded"]))

    def test_conflicting_location_excludes_whole_section(self):
        data = process([location()], [vote(), vote(number=20, local=999)])
        self.assertEqual(data["results"], [])
        self.assertFalse(data["units"][0]["sections"][0]["matched"])

    def test_duplicate_vote_row_fails_instead_of_doubling(self):
        with self.assertRaisesRegex(ValueError, "Votação duplicada"):
            process([location()], [vote(), vote()])

    def test_duplicate_section_assignment_is_excluded(self):
        data = process([location(), location(local=999)], [vote()])
        self.assertEqual(data["results"], [])

    def test_subtype_requires_explicit_official_review(self):
        data = process([location()], [vote()])
        unit = data["units"][0]
        self.assertEqual(unit["kind"], "unclassified")
        review = {"unit_id": unit["id"], "kind": "socioeducativa", "reviewer": "TESTE", "reviewed_at": "2022-12-01",
                  "evidence_url": "https://www.tre-df.jus.br/fixture-inexistente"}
        apply_classifications(data["units"], [review])
        self.assertEqual(unit["kind"], "socioeducativa")
        review["evidence_url"] = "https://example.com/nao-oficial"
        with self.assertRaises(ValueError):
            apply_classifications(data["units"], [review])

    def test_coordinates_accept_decimal_comma_and_reject_sentinels(self):
        self.assertEqual(coordinates({"NR_LATITUDE": "-15,8", "NR_LONGITUDE": "-47,9"}), (-15.8, -47.9))
        self.assertEqual(coordinates({"NR_LATITUDE": "-1", "NR_LONGITUDE": "-1"}), (None, None))
        self.assertEqual(coordinates({"NR_LATITUDE": "NaN", "NR_LONGITUDE": "-47"}), (None, None))


if __name__ == "__main__":
    unittest.main()
