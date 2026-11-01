"""Publica o recorte explícito CD_TIPO_LOCAL=3 do TSE, sem inferir subtipos.

Lê apenas os originais locais verificados. Seções agregadas, vínculos ambíguos e
seções sem correspondência ficam documentados, sem contagem artificial de zero.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from pipeline.import_votes import integer, official_url
from pipeline.inventory import csv_rows
from pipeline.snapshot import DEFAULT_ROOT, read_manifest, verify_entry


def section_key(row: dict, year: int, location: bool = False) -> tuple:
    year_field = "AA_ELEICAO" if location else "ANO_ELEICAO"
    if integer(row[year_field]) != year:
        raise ValueError("Arquivo contém ano diferente do solicitado")
    turn = integer(row["NR_TURNO"])
    if turn not in (1, 2):
        raise ValueError("Turno inesperado")
    return (year, turn, row["SG_UF"], integer(row["CD_MUNICIPIO"]),
            integer(row["NR_ZONA"]), integer(row["NR_SECAO"]))


def coordinates(row: dict) -> tuple:
    try:
        lat = float(row.get("NR_LATITUDE", "").replace(",", "."))
        lon = float(row.get("NR_LONGITUDE", "").replace(",", "."))
        if math.isfinite(lat) and math.isfinite(lon) and -34 <= lat <= 6 and -74 <= lon <= -28:
            return lat, lon
    except ValueError:
        pass
    return None, None


def process_year(location_rows, vote_rows, year: int, location_url: str) -> dict:
    sections, units, excluded, conflicts = {}, {}, [], set()
    for row in location_rows:
        if row.get("CD_TIPO_LOCAL") != "3":
            continue
        key = section_key(row, year, location=True)
        local = integer(row["NR_LOCAL_VOTACAO"])
        uid = f"{year}-{key[2]}-{key[3]}-{key[4]}-{local}"
        if row.get("CD_TIPO_SECAO_AGREGADA") != "1":
            excluded.append({"key": key, "reason": "aggregated_section_not_attributed", "principal": row.get("NR_SECAO_PRINCIPAL")})
            continue
        if key in sections:
            conflicts.add(key)
            excluded.append({"key": key, "reason": "duplicate_location_assignment"})
            continue
        lat, lon = coordinates(row)
        unit = units.setdefault(uid, {
            "id": uid, "name": row["NM_LOCAL_VOTACAO"], "kind": "unclassified",
            "classification_status": "subtype_not_reviewed", "official_type": row["DS_TIPO_LOCAL"],
            "uf": key[2], "municipality": row["NM_MUNICIPIO"],
            "latitude": lat, "longitude": lon, "sections": [],
        })
        if unit["name"] != row["NM_LOCAL_VOTACAO"]:
            conflicts.add(key)
            excluded.append({"key": key, "reason": "inconsistent_location_name"})
        section = {
            "year": year, "turn": key[1], "municipality_code": key[3], "zone": key[4],
            "section": key[5], "local_code": local, "evidence_url": location_url,
            "official_type_code": 3, "matched": False,
        }
        sections[key] = (uid, section)
        unit["sections"].append(section)
    rows_by_section, seen = defaultdict(list), set()
    scanned = 0
    for row in vote_rows:
        scanned += 1
        if row["DS_CARGO"].strip().upper() != "PRESIDENTE":
            continue
        key = section_key(row, year)
        if key not in sections or key in conflicts:
            continue
        _, section = sections[key]
        vote_local = row.get("NR_LOCAL_VOTACAO")
        if vote_local is not None and integer(vote_local) != section["local_code"]:
            conflicts.add(key)
            excluded.append({"key": key, "reason": "vote_location_differs_from_registry"})
            continue
        number, count = integer(row["NR_VOTAVEL"]), integer(row["QT_VOTOS"])
        if number not in (95, 96) and not 10 <= number <= 94:
            raise ValueError(f"Votável inesperado: {number}, seção {key}")
        identity = (*key, number)
        if identity in seen:
            raise ValueError(f"Votação duplicada: {identity}")
        seen.add(identity)
        name = row["NM_VOTAVEL"].strip()
        if not name:
            raise ValueError("Votável sem nome")
        rows_by_section[key].append((number, name, count))
    totals = {}
    for key, (uid, section) in sections.items():
        if key in conflicts:
            section["status"] = "excluded_conflicting_link"
            continue
        rows = rows_by_section.get(key)
        if not rows:
            section["status"] = "no_corresponding_vote_rows"
            excluded.append({"key": key, "reason": section["status"]})
            continue
        section["matched"] = True
        section["status"] = "matched_official_files"
        tally = totals.setdefault((uid, key[1]), {
            "unit_id": uid, "year": year, "turn": key[1], "valid": 0, "blank": 0,
            "null": 0, "total": 0, "section_count": 0, "candidates": {},
        })
        tally["section_count"] += 1
        for number, name, count in rows:
            tally["total"] += count
            if number in (95, 96):
                tally["blank" if number == 95 else "null"] += count
            else:
                tally["valid"] += count
                candidate = tally["candidates"].setdefault(number, {"number": number, "name": name, "votes": 0})
                if candidate["name"] != name:
                    raise ValueError("Nomes divergentes para o mesmo votável no local")
                candidate["votes"] += count
    results = []
    for tally in totals.values():
        tally["candidates"] = sorted(tally["candidates"].values(), key=lambda c: (-c["votes"], c["number"]))
        assert sum(c["votes"] for c in tally["candidates"]) == tally["valid"]
        assert tally["valid"] + tally["blank"] + tally["null"] == tally["total"]
        results.append(tally)
    coverage = []
    for turn in (1, 2):
        registered = [s for _, s in sections.values() if s["turn"] == turn]
        current_results = [r for r in results if r["turn"] == turn]
        coverage.append({
            "year": year, "turn": turn, "registered_principal_sections": len(registered),
            "matched_sections": sum(s["matched"] for s in registered),
            "locations_with_results": len(current_results),
            "valid": sum(r["valid"] for r in current_results),
            "blank": sum(r["blank"] for r in current_results),
            "null": sum(r["null"] for r in current_results),
            "total": sum(r["total"] for r in current_results),
        })
    return {"units": list(units.values()), "results": results, "coverage": coverage,
            "excluded": excluded, "scanned_vote_rows": scanned}


def apply_classifications(units: list, records: list):
    indexed, seen = {unit["id"]: unit for unit in units}, set()
    for record in records:
        uid = record["unit_id"]
        if uid not in indexed or uid in seen or record["kind"] not in ("presidio", "socioeducativa"):
            raise ValueError("Classificação duplicada, desconhecida ou inválida")
        official_url(record["evidence_url"])
        if date.fromisoformat(record["reviewed_at"]) > datetime.now(timezone.utc).date() or not record["reviewer"].strip():
            raise ValueError("Revisão de subtipo inválida")
        seen.add(uid)
        indexed[uid].update(kind=record["kind"], classification_status="reviewed",
                            classification_evidence={k: record[k] for k in ("evidence_url", "reviewed_at", "reviewer")})


def build(root: Path, years: list[int], classifications: list | None = None) -> tuple[dict, dict]:
    entries = read_manifest(root)["snapshots"]
    catalog = {"schema_version": 1, "status": "partial_official_section_join",
               "generated_at": datetime.now(timezone.utc).isoformat(),
               "units": [], "results": [], "elections": [], "sources": [], "coverage": []}
    report = {"generated_at": catalog["generated_at"], "network_used": False, "years": []}
    for year in years:
        selected = {}
        for source_id in ("eleitorado-local-votacao", "votacao-secao-presidente-br"):
            entry = next(e for e in reversed(entries) if e["year"] == year and e["source_id"] == source_id)
            selected[source_id] = (entry, verify_entry(root, entry))
            catalog["sources"].append({"url": entry["url"], "retrieved_at": entry["retrieved_at"][:10],
                                       "label": f"{year} · {source_id}", "sha256": entry["sha256"]})
        loc, loc_path = selected["eleitorado-local-votacao"]
        _, vote_path = selected["votacao-secao-presidente-br"]
        data = process_year(csv_rows(loc_path), csv_rows(vote_path), year, loc["url"])
        catalog["units"].extend(data["units"])
        catalog["results"].extend(data["results"])
        catalog["coverage"].extend(data["coverage"])
        catalog["elections"].append({"year": year, "status": "partial_official_section_join"})
        report["years"].append({"year": year, "coverage": data["coverage"], "excluded": data["excluded"],
                                "scanned_vote_rows": data["scanned_vote_rows"]})
        print(f"{year}: {len(data['units'])} locais; {len(data['results'])} resultados local/turno.", flush=True)
    apply_classifications(catalog["units"], classifications or [])
    catalog["units"].sort(key=lambda u: (u["uf"], u["name"], u["id"]))
    catalog["results"].sort(key=lambda r: (r["year"], r["turn"], r["unit_id"]))
    catalog["limitations"] = [
        "Recorte dos locais com CD_TIPO_LOCAL=3 no cadastro histórico do TSE, sem inferir o subtipo pelo nome.",
        "A classificar identifica locais cujo subtipo prisional/socioeducativo ainda não foi revisado.",
        "Totais apenas de seções principais com correspondência nos arquivos oficiais. Lacunas e conflitos são excluídos e documentados.",
        "Não houve conferência independente com todos os boletins de urna. Cobertura nacional completa não estabelecida.",
        "Votos agregados podem incluir servidores e mesários. Não representam votos individuais de pessoas presas.",
    ]
    return catalog, report


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, nargs="+", default=[2018, 2022, 2026])
    parser.add_argument("--classifications", type=Path)
    parser.add_argument("--out", type=Path, default=Path("public/data/catalog.json"))
    parser.add_argument("--report", type=Path, default=Path("data/reviewed/publication-report.json"))
    args = parser.parse_args()
    classifications = json.loads(args.classifications.read_text()) if args.classifications else []
    catalog, report = build(DEFAULT_ROOT, sorted(set(args.years)), classifications)
    if not catalog["results"]:
        parser.exit(1, "Nenhum resultado encontrado; catálogo anterior preservado.\n")
    write_json(args.report, report)
    write_json(args.out, catalog)
    print(f"Catálogo local atualizado: {args.out}")


if __name__ == "__main__":
    main()
