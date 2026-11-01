"""Inventário e cruzamento preliminar DF/2022, exclusivamente com arquivos locais."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pipeline.snapshot import DEFAULT_ROOT, read_manifest, verify_all

OUT = DEFAULT_ROOT.parent / "reviewed" / "acquisition-report.json"


def csv_rows(path: Path):
    with zipfile.ZipFile(path) as archive:
        files = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        # Alguns ZIPs trazem BRASIL e cada UF: ler ambos duplicaria os registros.
        national = [name for name in files if "BRASIL" in name.upper()]
        for name in national or files:
            with archive.open(name) as raw:
                with io.TextIOWrapper(raw, encoding="latin-1", newline="") as stream:
                    yield from csv.DictReader(stream, delimiter=";")


def build_inventory(root: Path) -> dict:
    verified = verify_all(root)
    entries = read_manifest(root)["snapshots"]
    inventory = []
    for entry in entries:
        record = {key: entry[key] for key in ("source_id", "year", "path", "url", "bytes", "sha256", "retrieved_at")}
        if entry["format"] == "zip":
            with zipfile.ZipFile(root / entry["path"]) as archive:
                record["members"] = [{"name": info.filename, "bytes": info.file_size} for info in archive.infolist()]
            if entry["source_id"] == "votacao-secao-presidente-br":
                rows = csv_rows(root / entry["path"])
                try:
                    first = next(rows)
                    if int(first["ANO_ELEICAO"]) != entry["year"] or first["DS_CARGO"].strip().upper() != "PRESIDENTE":
                        raise ValueError("Ano ou cargo inesperado no arquivo presidencial")
                    record["first_row_check"] = {key: first[key] for key in ("ANO_ELEICAO", "NR_TURNO", "DS_CARGO", "DT_ELEICAO")}
                finally:
                    rows.close()
        inventory.append(record)

    def source(source_id: str) -> dict:
        return next(e for e in entries if e["year"] == 2022 and e["source_id"] == source_id)

    locations = source("eleitorado-local-votacao")
    votes = source("votacao-secao-presidente-br")
    special = {}
    for row in csv_rows(root / locations["path"]):
        if row["SG_UF"] == "DF" and row["CD_TIPO_LOCAL"] == "3":
            key = (int(row["NR_TURNO"]), int(row["NR_ZONA"]), int(row["NR_SECAO"]))
            if key in special:
                raise ValueError(f"Seção repetida no cadastro: {key}")
            special[key] = {key: row[key] for key in (
                "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_TURNO", "NR_ZONA", "NR_SECAO",
                "NR_LOCAL_VOTACAO", "NM_LOCAL_VOTACAO", "DS_TIPO_LOCAL", "CD_TIPO_LOCAL",
                "DS_ENDERECO", "NR_LATITUDE", "NR_LONGITUDE", "QT_ELEITOR_SECAO")}
    matched = defaultdict(list)
    counts = Counter()
    scanned = 0
    for row in csv_rows(root / votes["path"]):
        scanned += 1
        if row["SG_UF"] != "DF":
            continue
        key = (int(row["NR_TURNO"]), int(row["NR_ZONA"]), int(row["NR_SECAO"]))
        if key not in special:
            continue
        if row["DS_CARGO"].strip().upper() != "PRESIDENTE" or row["ANO_ELEICAO"] != "2022":
            raise ValueError("Cargo/ano incompatível com o piloto")
        if row["CD_MUNICIPIO"] != special[key]["CD_MUNICIPIO"]:
            raise ValueError("Código municipal incompatível com o cadastro")
        identity = (*key, row["NR_VOTAVEL"])
        counts[identity] += 1
        if counts[identity] > 1:
            raise ValueError("Votação duplicada no cruzamento preliminar")
        matched[key].append({k: row[k] for k in ("NR_VOTAVEL", "NM_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO", "NM_LOCAL_VOTACAO")})
    records = []
    for key, location in sorted(special.items()):
        rows = matched.get(key, [])
        records.append({"location": location, "kind": "not_reviewed", "matched": bool(rows), "votes": rows})
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "acquired_pending_editorial_validation", "network_used": False,
        "verified_snapshots": verified, "total_bytes": sum(e["bytes"] for e in entries),
        "files": inventory,
        "pilot": {"year": 2022, "uf": "DF", "status": "preliminary_not_published",
                  "national_vote_rows_scanned": scanned, "registered_section_turns": len(special),
                  "matched_section_turns": len(matched),
                  "distinct_locations": len({(r["NR_ZONA"], r["NR_LOCAL_VOTACAO"]) for r in special.values()}),
                  "locations_source": locations["path"], "votes_source": votes["path"], "records": records,
                  "limitations": [
                      "A categoria oficial Preso provisório inclui unidades que precisam ser classificadas separadamente como prisionais ou socioeducativas; subtipo não inferido pelo nome.",
                      "Cruzamento não equivale a conferência independente com boletins de urna nem comprova cobertura nacional.",
                      "Há coordenadas sentinela -1/-1 e eleitorado zero no cadastro; não calcular comparecimento ou pontos geográficos a partir desses valores sem investigação.",
                      "A verificação de ano/cargo em 2018 e 2026 usa apenas o primeiro registro; os demais resultados desses anos ainda não foram processados.",
                  ]},
    }


def main():
    report = build_inventory(DEFAULT_ROOT)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Inventário local: {OUT}")
    print(f"{report['verified_snapshots']} arquivos; {report['total_bytes']} bytes; sem acesso à rede.")
    print(f"Piloto: {report['pilot']['matched_section_turns']}/{report['pilot']['registered_section_turns']} seções/turnos com correspondência; revisão editorial pendente.")


if __name__ == "__main__":
    main()
