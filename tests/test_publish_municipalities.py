import unittest

from pipeline.publish_municipalities import aggregate, targets_for_year, validate_inclusion


def vote(section=1, number=10, votes=5, turn=1, zone=1, uf="DF", city=97012, name="A"):
    return {"ANO_ELEICAO": "2022", "NR_TURNO": str(turn), "SG_UF": uf, "CD_MUNICIPIO": str(city),
            "NM_MUNICIPIO": "MUNICÍPIO SINTÉTICO", "NR_ZONA": str(zone), "NR_SECAO": str(section),
            "DS_CARGO": "Presidente", "NR_VOTAVEL": str(number), "QT_VOTOS": str(votes), "NM_VOTAVEL": name}


def catalog():
    return {"units": [{"id": "unit", "uf": "DF", "municipality": "BRASÍLIA", "sections": [
        {"year": 2022, "turn": 1, "municipality_code": 97012, "zone": 1, "section": 1, "matched": True}]}],
        "results": [{"unit_id": "unit", "year": 2022, "turn": 1, "section_count": 1,
                     "valid": 5, "blank": 0, "null": 0, "total": 5, "candidates": [{"number": 10, "votes": 5}]}]}


class MunicipalitiesTests(unittest.TestCase):
    def test_entire_municipality_includes_unit_and_ordinary_sections(self):
        rows = [vote(), vote(section=2, votes=100), vote(section=2, number=95, votes=2), vote(section=2, number=96, votes=3)]
        result, masks, audit = aggregate(rows, {("DF", 97012): "BRASÍLIA"}, 2022)
        city = result[0]
        self.assertEqual((city["valid"], city["blank"], city["null"], city["total"]), (105, 2, 3, 110))
        self.assertEqual(city["section_count"], 2)
        self.assertEqual(city["scope"], "entire_municipality_including_units")
        self.assertEqual(validate_inclusion(catalog(), 2022, result, masks)["unit_sections_included"], 1)

    def test_turns_and_zones_are_not_mixed_or_deduplicated_incorrectly(self):
        result, _, _ = aggregate([vote(), vote(zone=2, votes=10), vote(turn=2, votes=30)], {("DF", 97012): "BRASÍLIA"}, 2022)
        self.assertEqual([(r["turn"], r["valid"], r["section_count"]) for r in result], [(1, 15, 2), (2, 30, 1)])

    def test_same_municipality_code_in_another_uf_does_not_leak_into_total(self):
        result, _, _ = aggregate([vote(), vote(uf="SP", votes=9999), vote(city=12345, votes=8888)], {("DF", 97012): "BRASÍLIA"}, 2022)
        self.assertEqual(result[0]["valid"], 5)

    def test_duplicate_candidate_in_same_section_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicada"):
            aggregate([vote(), vote()], {("DF", 97012): "BRASÍLIA"}, 2022)

    def test_code_97_is_kept_separate_and_never_treated_as_valid_candidate(self):
        result, _, _ = aggregate([vote(), vote(number=97, votes=3, name="Voto anulado e apurado em separado")], {("DF", 97012): "BRASÍLIA"}, 2022)
        self.assertEqual(result[0]["valid"], 5)
        self.assertEqual(result[0]["null"], 0)
        self.assertEqual(result[0]["annulled_separate"], 3)
        self.assertEqual(result[0]["total"], 8)
        self.assertEqual([c["number"] for c in result[0]["candidates"]], [10])

    def test_missing_city_is_reported_instead_of_inventing_zero_result(self):
        result, _, audit = aggregate([], {("DF", 97012): "BRASÍLIA"}, 2022)
        self.assertEqual(result, [])
        self.assertEqual(len(audit["missing_municipality_turns"]), 2)

    def test_custody_sections_must_be_present_in_municipal_archive(self):
        result, masks, _ = aggregate([vote(section=2, votes=100)], {("DF", 97012): "BRASÍLIA"}, 2022)
        with self.assertRaisesRegex(ValueError, "ausente"):
            validate_inclusion(catalog(), 2022, result, masks)

    def test_unit_totals_cannot_exceed_city_totals(self):
        result, masks, _ = aggregate([vote(votes=1)], {("DF", 97012): "BRASÍLIA"}, 2022)
        with self.assertRaisesRegex(ValueError, "excedem"):
            validate_inclusion(catalog(), 2022, result, masks)

    def test_target_uses_electoral_code_from_selected_year(self):
        self.assertEqual(targets_for_year(catalog(), 2022), {("DF", 97012): "BRASÍLIA"})
        self.assertEqual(targets_for_year(catalog(), 2018), {})
