"""Soma TODAS as seções dos municípios de interesse, incluindo as unidades.

Usa os ZIPs nacionais locais, nunca o catálogo restrito às seções de custódia.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pipeline.import_votes import integer
from pipeline.inventory import csv_rows
from pipeline.publish_catalog import section_key, write_json
from pipeline.snapshot import DEFAULT_ROOT, read_manifest, verify_entry


def targets_for_year(catalog: dict, year: int) -> dict:
    targets = {}
    for unit in catalog["units"]:
        codes = {s["municipality_code"] for s in unit["sections"] if s["year"] == year}
        if len(codes) > 1:
            raise ValueError("Unidade vinculada a mais de um município no mesmo ano")
        for code in codes:
            targets[(unit["uf"], int(code))] = unit["municipality"]
    return targets


def aggregate(rows, targets: dict, year: int) -> tuple[list, dict, dict]:
    totals, section_masks = {}, {}
    scanned = included = 0
    for row in rows:
        scanned += 1
        if row["DS_CARGO"].strip().upper() != "PRESIDENTE":
            continue
        town = (row["SG_UF"], integer(row["CD_MUNICIPIO"]))
        if town not in targets:
            continue
        key = section_key(row, year)
        number, votes = integer(row["NR_VOTAVEL"]), integer(row["QT_VOTOS"])
        if number not in (95, 96, 97) and not 10 <= number <= 94:
            raise ValueError(f"Votável inesperado no município: {number}")
        mask = section_masks.get(key, 0)
        bit = 1 << number
        if mask & bit:
            raise ValueError(f"Votação duplicada para seção/votável: {key}, {number}")
        section_masks[key] = mask | bit
        tally = totals.setdefault(key[:4], {
            "year": year, "turn": key[1], "uf": key[2], "municipality_code": key[3],
            "name": row["NM_MUNICIPIO"], "scope": "entire_municipality_including_units",
            "valid": 0, "blank": 0, "null": 0, "annulled_separate": 0, "total": 0, "section_count": 0, "candidates": {},
        })
        tally["section_count"] += int(mask == 0)
        tally["total"] += votes
        included += 1
        if number in (95, 96, 97):
            tally[{95: "blank", 96: "null", 97: "annulled_separate"}[number]] += votes
        else:
            name = row["NM_VOTAVEL"].strip()
            if not name:
                raise ValueError("Candidato municipal sem nome")
            tally["valid"] += votes
            candidate = tally["candidates"].setdefault(number, {"number": number, "name": name, "votes": 0})
            if candidate["name"] != name:
                raise ValueError("Nomes divergentes para candidato no município")
            candidate["votes"] += votes
    results = []
    for _, tally in sorted(totals.items()):
        tally["candidates"] = sorted(tally["candidates"].values(), key=lambda c: (-c["votes"], c["number"]))
        if sum(c["votes"] for c in tally["candidates"]) != tally["valid"] or tally["valid"] + tally["blank"] + tally["null"] + tally["annulled_separate"] != tally["total"]:
            raise ValueError("Totais municipais inconsistentes")
        results.append(tally)
    expected = {(year, turn, uf, code) for uf, code in targets for turn in (1, 2)}
    return results, section_masks, {
        "year": year, "target_municipalities": len(targets), "scanned_rows": scanned,
        "included_rows": included, "result_records": len(results),
        "missing_municipality_turns": sorted(expected - set(totals)),
    }


def validate_inclusion(catalog: dict, year: int, municipalities: list, section_masks: dict) -> dict:
    units = {u["id"]: u for u in catalog["units"]}
    municipal = {(r["year"], r["turn"], r["uf"], r["municipality_code"]): r for r in municipalities}
    custody_totals = defaultdict(lambda: {"valid": 0, "blank": 0, "null": 0, "total": 0, "candidates": defaultdict(int)})
    checked = set()
    checked_sections = set()
    for result in catalog["results"]:
        if result["year"] != year:
            continue
        identity = (result["unit_id"], year, result["turn"])
        if identity in checked:
            raise ValueError("Resultado de unidade duplicado no catálogo")
        checked.add(identity)
        unit = units[result["unit_id"]]
        sections = [s for s in unit["sections"] if s["year"] == year and s["turn"] == result["turn"] and s.get("matched")]
        if len(sections) != result["section_count"] or not sections:
            raise ValueError("Quantidade de seções da unidade inconsistente")
        for section in sections:
            key = (year, result["turn"], unit["uf"], section["municipality_code"], section["zone"], section["section"])
            if key not in section_masks or key in checked_sections:
                raise ValueError("Seção da unidade ausente do município ou contada duas vezes")
            checked_sections.add(key)
        city_key = (year, result["turn"], unit["uf"], sections[0]["municipality_code"])
        if city_key not in municipal:
            raise ValueError("Resultado municipal ausente para unidade com votos")
        subtotal = custody_totals[city_key]
        for field in ("valid", "blank", "null", "total"):
            subtotal[field] += result[field]
        for candidate in result["candidates"]:
            subtotal["candidates"][candidate["number"]] += candidate["votes"]
    for key, subtotal in custody_totals.items():
        city = municipal[key]
        if any(subtotal[field] > city[field] for field in ("valid", "blank", "null", "total")):
            raise ValueError("Votos das unidades excedem o total municipal")
        candidates = {c["number"]: c["votes"] for c in city["candidates"]}
        if any(votes > candidates.get(number, 0) for number, votes in subtotal["candidates"].items()):
            raise ValueError("Votos de candidato nas unidades excedem os votos municipais")
    return {"unit_results_checked": len(checked), "unit_sections_included": len(checked_sections)}


def build(root: Path, catalog: dict) -> tuple[dict, dict]:
    entries = read_manifest(root)["snapshots"]
    output = {"schema_version": 1, "scope": "entire_municipality_including_units",
              "generated_at": datetime.now(timezone.utc).isoformat(), "results": [], "sources": []}
    report = {"generated_at": output["generated_at"], "scope": output["scope"], "network_used": False, "years": []}
    for year in sorted({s["year"] for u in catalog["units"] for s in u["sections"]}):
        entry = next(e for e in reversed(entries) if e["year"] == year and e["source_id"] == "votacao-secao-presidente-br")
        if not any(s["url"] == entry["url"] and s["sha256"] == entry["sha256"] for s in catalog["sources"]):
            raise ValueError("Catálogo das unidades e arquivo municipal precisam usar a mesma versão da fonte")
        path = verify_entry(root, entry)
        results, masks, audit = aggregate(csv_rows(path), targets_for_year(catalog, year), year)
        audit.update(validate_inclusion(catalog, year, results, masks))
        audit["source_sha256"] = entry["sha256"]
        output["results"].extend(results)
        output["sources"].append({"year": year, "url": entry["url"], "retrieved_at": entry["retrieved_at"], "sha256": entry["sha256"]})
        report["years"].append(audit)
        print(f"{year}: {len(results)} resultados município/turno; {audit['unit_sections_included']} seções das unidades incluídas.", flush=True)
    output["limitations"] = [
        "Município inteiro conforme código eleitoral TSE e UF; inclui as seções da unidade e todas as demais seções presentes no arquivo oficial.",
        "Comparar percentuais de votos válidos separadamente em cada recorte. Diferença em pontos percentuais, não variação percentual relativa.",
        "A identificação municipal do DF é a do cadastro eleitoral; não equivale a uma região administrativa específica.",
    ]
    return output, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=Path("public/data/catalog.json"))
    parser.add_argument("--out", type=Path, default=Path("public/data/municipalities.json"))
    parser.add_argument("--report", type=Path, default=Path("data/reviewed/municipalities-report.json"))
    args = parser.parse_args()
    output, report = build(DEFAULT_ROOT, json.loads(args.catalog.read_text()))
    if not output["results"]:
        parser.exit(1, "Sem resultados municipais; saída anterior preservada.\n")
    write_json(args.report, report)
    write_json(args.out, output)
    print(f"Resultados municipais locais: {args.out}")


if __name__ == "__main__":
    main()
