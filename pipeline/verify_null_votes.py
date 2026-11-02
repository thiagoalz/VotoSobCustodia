"""Confere totais de nulos por UF no arquivo presidencial já arquivado; sem rede."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter
from pathlib import Path

from pipeline.rdv_download import ROOT, UFS, write_json

REPO = Path(__file__).resolve().parents[1]


def build_reference():
    manifest = json.loads((REPO / "data/official/manifest.json").read_text())
    source = next(item for item in manifest["snapshots"] if item["year"] == 2026 and item["source_id"] == "votacao-secao-presidente-br")
    target = ROOT / "reference-null-counts.json"
    if target.exists():
        existing = json.loads(target.read_text())
        if existing["source"]["sha256"] == source["sha256"]:
            return existing
    counts, sections = Counter(), Counter()
    with zipfile.ZipFile(REPO / "data/official" / source["path"]) as archive:
        with archive.open(next(name for name in archive.namelist() if name.endswith(".csv"))) as stream:
            reader = csv.reader(io.TextIOWrapper(stream, encoding="latin-1"), delimiter=";")
            header = next(reader)
            indexes = {key: header.index(key) for key in ["NR_TURNO", "SG_UF", "NR_VOTAVEL", "QT_VOTOS", "DS_CARGO"]}
            for row in reader:
                if (row[indexes["NR_TURNO"]] == "2" and row[indexes["SG_UF"]] in UFS and row[indexes["NR_VOTAVEL"]] == "96"
                        and row[indexes["DS_CARGO"]].upper() == "PRESIDENTE"):
                    counts[row[indexes["SG_UF"]]] += int(row[indexes["QT_VOTOS"]])
                    sections[row[indexes["SG_UF"]]] += 1
    if set(counts) != set(UFS): raise ValueError("Referência não contempla as 27 UFs")
    result = {"source": source, "counts": dict(counts), "null_section_records": dict(sections)}
    write_json(target, result)
    return result


if __name__ == "__main__":
    reference = build_reference()
    print(f"Referência local preservada: 27 UFs, {sum(reference['counts'].values())} votos nulos.")
