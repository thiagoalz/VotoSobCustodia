"""Cruza votação por seção do TSE com um cadastro histórico revisado.

Não classifica locais por palavras-chave e não infere votos individuais.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import unicodedata
import zipfile
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

MAPPING_FIELDS = {
    "year", "turn", "uf", "municipality_code", "zone", "section",
    "unit_id", "unit_name", "kind", "municipality", "evidence_url",
    "reviewed_at", "reviewer", "latitude", "longitude",
}
VOTE_FIELDS = {
    "ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA",
    "NR_SECAO", "DS_CARGO", "NR_VOTAVEL", "NM_VOTAVEL", "QT_VOTOS",
}
KINDS = {"presidio", "socioeducativa"}
UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())


def official_url(value: str) -> str:
    parsed = urlparse(value)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or not host.endswith((".jus.br", ".gov.br"))):
        raise ValueError(f"É necessária uma URL oficial HTTPS: {value!r}")
    return value


def integer(value: str) -> int:
    # Aceita zeros à esquerda, mas não decimais, sinal ou campos ausentes.
    if not value or not value.isascii() or not value.isdigit():
        raise ValueError(f"Inteiro inválido: {value!r}")
    return int(value)


def key(row: dict, mapping: bool = False) -> tuple:
    names = ("year", "turn", "uf", "municipality_code", "zone", "section") if mapping else (
        "ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO")
    values = [row[name].strip() for name in names]
    return (integer(values[0]), integer(values[1]), values[2].upper(),
            integer(values[3]), integer(values[4]), integer(values[5]))


def load_mapping(path: Path, year: int, uf: str) -> dict:
    selected: dict = {}
    identities: dict = {}
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not MAPPING_FIELDS.issubset(reader.fieldnames or []):
            raise ValueError(f"Cadastro precisa das colunas: {sorted(MAPPING_FIELDS)}")
        for raw in reader:
            row = {k: (v or "").strip() for k, v in raw.items() if k}
            section_key = key(row, mapping=True)
            if section_key[0] != year or section_key[2] != uf:
                continue
            if section_key[1] not in (1, 2):
                raise ValueError("Turno deve ser 1 ou 2")
            if section_key in selected:
                raise ValueError(f"Seção duplicada ou vinculada a mais de uma unidade: {section_key}")
            if row["kind"] not in KINDS:
                raise ValueError("Categoria deve ser presidio ou socioeducativa")
            for name in ("unit_id", "unit_name", "municipality", "reviewer"):
                if not row[name]:
                    raise ValueError(f"Campo obrigatório vazio: {name}")
            official_url(row["evidence_url"])
            if date.fromisoformat(row["reviewed_at"]) > datetime.now(timezone.utc).date():
                raise ValueError("Data de revisão não pode estar no futuro")
            if bool(row["latitude"]) != bool(row["longitude"]):
                raise ValueError("Coordenadas devem estar completas ou ambas vazias")
            if row["latitude"]:
                lat, lon = float(row["latitude"]), float(row["longitude"])
                if not (-34 <= lat <= 6 and -74 <= lon <= -28):
                    raise ValueError("Coordenadas fora dos limites aproximados do Brasil")
            identity = tuple(row[n] for n in ("unit_name", "kind", "municipality", "latitude", "longitude"))
            previous = identities.setdefault(row["unit_id"], identity)
            if previous != identity:
                raise ValueError("Identificação inconsistente para a mesma unidade")
            selected[section_key] = row
    if not selected:
        raise ValueError("Nenhuma seção revisada para este ano e UF")
    return selected


def vote_streams(path: Path, encoding: str):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                if not member.is_dir() and member.filename.lower().endswith(".csv"):
                    # Leitura em fluxo; nenhum caminho do ZIP é extraído para o disco.
                    with archive.open(member) as raw:
                        with io.TextIOWrapper(raw, encoding=encoding, newline="") as stream:
                            yield stream
    else:
        with path.open(encoding=encoding, newline="") as stream:
            yield stream


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(votes: Path, mapping: Path, year: int, uf: str, source_url: str,
          retrieved_at: str, encoding: str = "latin-1") -> dict:
    uf = uf.upper()
    if uf not in UFS:
        raise ValueError("UF inválida")
    official_url(source_url)
    if date.fromisoformat(retrieved_at) > datetime.now(timezone.utc).date():
        raise ValueError("Data de obtenção não pode estar no futuro")
    sections = load_mapping(mapping, year, uf)
    seen: set = set()
    matched: set = set()
    totals: dict = defaultdict(lambda: {"valid": 0, "blank": 0, "null": 0, "candidates": {}})
    candidate_names: dict = {}
    for stream in vote_streams(votes, encoding):
        reader = csv.DictReader(stream, delimiter=";")
        if not VOTE_FIELDS.issubset(reader.fieldnames or []):
            raise ValueError("Arquivo de votação sem as colunas esperadas do TSE")
        for row in reader:
            office = unicodedata.normalize("NFKD", row["DS_CARGO"]).encode("ascii", "ignore").decode().strip().upper()
            if office != "PRESIDENTE":
                continue
            section_key = key(row)
            if section_key not in sections:
                continue
            number = integer(row["NR_VOTAVEL"].strip())
            votes_count = integer(row["QT_VOTOS"].strip())
            identity = (*section_key, number)
            if identity in seen:
                raise ValueError(f"Votação duplicada para seção e votável: {identity}")
            if number not in (95, 96) and not 10 <= number <= 94:
                raise ValueError(f"Código de votável presidencial inesperado: {number}")
            seen.add(identity)
            matched.add(section_key)
            unit = sections[section_key]
            tally = totals[(unit["unit_id"], section_key[1])]
            if number == 95:
                tally["blank"] += votes_count
            elif number == 96:
                tally["null"] += votes_count
            else:
                name = row["NM_VOTAVEL"].strip()
                if not name:
                    raise ValueError("Candidato sem nome")
                candidate_key = (section_key[1], number)
                if candidate_names.setdefault(candidate_key, name) != name:
                    raise ValueError("Nomes divergentes para o mesmo candidato e turno")
                candidate = tally["candidates"].setdefault(number, {"number": number, "name": name, "votes": 0})
                candidate["votes"] += votes_count
                tally["valid"] += votes_count
    missing = set(sections) - matched
    if missing:
        raise ValueError(f"{len(missing)} seção(ões) revisada(s) sem votação presidencial correspondente: {sorted(missing)[:5]}")
    units: dict = {}
    for section_key, row in sections.items():
        unit = units.setdefault(row["unit_id"], {
            "id": row["unit_id"], "name": row["unit_name"], "kind": row["kind"],
            "uf": uf, "municipality": row["municipality"],
            "latitude": float(row["latitude"]) if row["latitude"] else None,
            "longitude": float(row["longitude"]) if row["longitude"] else None,
            "sections": [],
        })
        unit["sections"].append({
            "year": year, "turn": section_key[1], "municipality_code": section_key[3],
            "zone": section_key[4], "section": section_key[5],
            "evidence_url": row["evidence_url"], "reviewed_at": row["reviewed_at"], "reviewer": row["reviewer"],
        })
    results = []
    for (unit_id, turn), tally in sorted(totals.items()):
        candidates = sorted(tally.pop("candidates").values(), key=lambda c: (-c["votes"], c["number"]))
        results.append({"unit_id": unit_id, "year": year, "turn": turn,
                        **tally, "total": tally["valid"] + tally["blank"] + tally["null"], "candidates": candidates})
    return {
        "schema_version": 1, "status": "partial", "generated_at": datetime.now(timezone.utc).isoformat(),
        "pilot": {"year": year, "uf": uf, "status": "reviewed_mapping"},
        "elections": [{"year": year, "status": "partial"}],
        "units": sorted(units.values(), key=lambda unit: unit["id"]), "results": results,
        "sources": [{"url": source_url, "retrieved_at": retrieved_at, "sha256": checksum(votes),
                     "mapping_sha256": checksum(mapping)}],
        "coverage": {"reviewed_sections": len(sections), "matched_sections": len(matched),
                     "national_completeness": "unknown"},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--votes", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--uf", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--retrieved-at", required=True, help="Data real de obtenção, AAAA-MM-DD")
    parser.add_argument("--encoding", default="latin-1", help="Codificação do CSV de votos")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        data = build(args.votes, args.mapping, args.year, args.uf, args.source_url, args.retrieved_at, args.encoding)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.out.with_suffix(args.out.suffix + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(args.out)
    except (ValueError, OSError, UnicodeError, csv.Error, zipfile.BadZipFile) as error:
        parser.exit(1, f"Importação recusada: {error}\n")
    print(f"Publicado arquivo local: {args.out}; {len(data['results'])} resultados de unidade/turno; cobertura parcial.")


if __name__ == "__main__":
    main()
