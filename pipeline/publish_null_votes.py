"""Agrega RDVs locais para presidente, 2º turno de 2026. Não acessa a rede."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
import zipfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
from pathlib import Path

from pipeline.rdv_download import ROOT, UFS, digest, write_json

REPO = Path(__file__).resolve().parents[1]
OUTPUT = REPO / "public/data/null-votes.json"
YEAR, TURN, ELECTION = 2026, 2, 6258
VERSION = 1


def summarize_votes(votes):
    digits, without_digits, types = Counter(), 0, Counter()
    for vote in votes:
        kind = vote["tipoVoto"]
        if not kind.startswith("nulo"): continue
        types[kind] += 1
        value = vote.get("digitacao")
        if value is None:
            without_digits += 1
        elif not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,5}", value):
            raise ValueError(f"Digitação inválida de nulo: {value!r}")
        else: digits[value] += 1
    return digits, without_digits, types


def rank_numbers(states):
    counts = {}
    for state in states:
        for number, votes in state["numbers"].items():
            if votes <= 0: continue
            counts.setdefault(number, {})[state["uf"]] = votes
    rows = []
    for number, by_uf in counts.items():
        total, largest = sum(by_uf.values()), max(by_uf.values())
        rows.append({"number": number, "votes": total,
                     "top_ufs": sorted(uf for uf, votes in by_uf.items() if votes == largest),
                     "top_uf_votes": largest, "by_uf": dict(sorted(by_uf.items()))})
    return sorted(rows, key=lambda row: (-row["votes"], int(row["number"]), row["number"]))


def process_state(uf, root=ROOT):
    import asn1tools
    status = json.loads((root / "status" / f"{uf}.json").read_text())
    if status["status"] != "complete": raise ValueError(f"Download não concluído: {uf}")
    pack = root / status["path"]
    if digest(pack) != status["sha256"]: raise ValueError(f"Pacote local alterado: {uf}")
    schema_path = root / "spec/rdv.asn1"
    schema_hash = digest(schema_path)
    cache_path = root / "processed" / f"{uf}.json"
    if cache_path.exists():
        cache = json.loads(cache_path.read_text())
        if cache["pack_sha256"] == status["sha256"] and cache["schema_sha256"] == schema_hash and cache["version"] == VERSION:
            return cache
    schema = asn1tools.compile_files(str(schema_path), codec="ber")
    numbers, types = Counter(), Counter()
    without_digits, no_president, duplicates, processed = 0, 0, 0, 0
    seen = {}
    with zipfile.ZipFile(pack) as archive:
        for info in archive.infolist():
            raw = archive.read(info)  # Também valida o CRC32 do pacote local.
            decoded = schema.decode("EntidadeResultadoRDV", raw, check_constraints=True)
            rdv = decoded["rdv"]
            if rdv["fase"] != "oficial": raise ValueError(f"Fase não oficial: {uf}/{info.filename}")
            section = rdv["identificacao"]
            key = (section["municipioZona"]["municipio"], section["municipioZona"]["zona"], section["secao"])
            filename = Path(info.filename).name
            match = re.fullmatch(r"o[0-9]{5}([a-z]{2})([0-9]{5})([0-9]{4})([0-9]{4})-rdv(?:red)?\.dat", filename)
            if not match or match[1].upper() != uf or tuple(map(int, match.groups()[1:])) != key:
                raise ValueError(f"Identificação do RDV e nome do arquivo divergem: {filename}")
            if rdv["eleicoes"][0] != "eleicoesVota": raise ValueError(f"Origem de apuração exige revisão: {filename}")
            presidential = [(e["idEleicao"], cargo) for e in rdv["eleicoes"][1] for cargo in e["votosCargos"]
                            if cargo["idCargo"] == ("cargoConstitucional", "presidente")]
            processed += 1
            if not presidential:
                no_president += 1
                continue
            if len(presidential) != 1 or presidential[0][0] != ELECTION:
                raise ValueError(f"Eleição presidencial inesperada: {filename}")
            cargo = presidential[0][1]
            if cargo["quantidadeEscolhas"] != 1: raise ValueError("Mais de uma escolha para presidente")
            # A ordem de armazenamento não é a ordem de votação. Só os agregados são utilizados.
            fingerprint = tuple(sorted(Counter((v["tipoVoto"], v.get("digitacao", "")) for v in cargo["votos"]).items()))
            if key in seen:
                if seen[key] != fingerprint: raise ValueError(f"RDVs conflitantes para a mesma seção: {uf}/{key}")
                duplicates += 1
                continue
            seen[key] = fingerprint
            local, missing, kinds = summarize_votes(cargo["votos"])
            numbers.update(local); types.update(kinds); without_digits += missing
            if processed % 10000 == 0: print(f"{uf}: {processed} RDVs processados", flush=True)
    if processed != status["expected_members"]: raise ValueError(f"Quantidade de RDVs diverge em {uf}")
    result = {"version": VERSION, "uf": uf, "year": YEAR, "turn": TURN, "election_id": ELECTION,
              "scope": "all_brazil_sections", "pack_sha256": status["sha256"], "schema_sha256": schema_hash,
              "files_processed": processed, "sections_processed": len(seen), "duplicate_files": duplicates,
              "files_without_president": no_president, "null_with_digits": sum(numbers.values()),
              "null_without_digits": without_digits, "null_types": dict(types), "numbers": dict(numbers),
              "source_url": status["source"]["url"]}
    write_json(cache_path, result)
    print(f"{uf}: processamento concluído; {sum(numbers.values())} nulos com número", flush=True)
    return result


def publish(states, failures=None, output=OUTPUT):
    states = sorted(states, key=lambda state: state["uf"])
    rows = rank_numbers(states)
    covered = {state["uf"] for state in states}
    complete = covered == set(UFS) and not failures
    validation = {"status": "not_available", "checked_ufs": 0}
    reference_path = ROOT / "reference-null-counts.json"
    if reference_path.exists():
        reference = json.loads(reference_path.read_text())
        differences = [{"uf": state["uf"], "rdv_nulls": state["null_with_digits"] + state["null_without_digits"],
                        "reference_nulls": reference["counts"].get(state["uf"])} for state in states
                       if state["null_with_digits"] + state["null_without_digits"] != reference["counts"].get(state["uf"])]
        if differences: raise ValueError(f"Contagens divergem da apuração oficial: {differences}")
        validation = {"status": "matched" if complete else "partial_match", "checked_ufs": len(states),
                      "reference_nulls": sum(reference["counts"].get(uf, 0) for uf in covered),
                      "source_url": reference["source"]["url"], "source_sha256": reference["source"]["sha256"]}
    value = {"schema_version": VERSION, "status": "complete" if complete else "processing",
             "scope": "all_brazil_sections", "year": YEAR, "turn": TURN, "election_id": ELECTION,
             "cargo": "presidente", "includes_exterior": False, "generated_at": datetime.now(timezone.utc).isoformat(),
             "expected_ufs": list(UFS), "processed_ufs": sorted(covered), "failures": failures or [],
             "summary": {key: sum(state[key] for state in states) for key in ["files_processed", "sections_processed", "duplicate_files", "files_without_president", "null_with_digits", "null_without_digits"]},
             "rows": rows, "reference_validation": validation,
             "states": [{key: state[key] for key in state if key not in ["numbers", "version"]} for state in states],
             "sources": [{"label": "Arquivos transmitidos para totalização — 2026", "url": "https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao"},
                         {"label": "Especificação técnica de 2026 — RDV", "url": "https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital"},
                         {"label": "Resultados e apuração por seção — 2026", "url": "https://dadosabertos.tse.jus.br/dataset/resultados-2026"}],
             "limitations": ["Recorte dos RDVs oficiais disponíveis nas 27 UFs, para presidente no segundo turno de 2026. Exterior (ZZ) não incluído.",
                             "Somente nulos com campo digitacao entram na lista de números; tipos sem digitação são informados separadamente.",
                             "A UF líder usa quantidade absoluta de votos, sem ajuste pelo tamanho do eleitorado. Empates mostram todas as UFs.",
                             "Os números não identificam eleitores nem a ordem de comparecimento. Os arquivos brutos permanecem locais."]}
    assert sum(row["votes"] for row in rows) == value["summary"]["null_with_digits"]
    write_json(output, value)
    csv_path = output.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream, delimiter=";", quoting=csv.QUOTE_ALL)
        writer.writerow(["Número digitado", "Total de votos", "UFs com maior quantidade", "Votos em cada UF líder"])
        writer.writerows((row["number"], row["votes"], ", ".join(row["top_ufs"]), row["top_uf_votes"]) for row in rows)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Processa UFs à medida que os downloads locais terminam")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    finished, scheduled, failures = {}, set(), []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        running = {}
        while True:
            for uf in UFS:
                path = ROOT / "status" / f"{uf}.json"
                if uf not in scheduled and path.exists() and json.loads(path.read_text()).get("status") == "complete":
                    running[pool.submit(process_state, uf)] = uf
                    scheduled.add(uf)
            if running:
                done, _ = wait(running, timeout=5, return_when=FIRST_COMPLETED)
                for future in done:
                    uf = running.pop(future)
                    try: finished[uf] = future.result()
                    except Exception as error:
                        failures.append({"uf": uf, "error": str(error)})
                        print(f"ERRO {uf}: {error}", flush=True)
                if done: publish(list(finished.values()), failures)
            elif not args.watch or len(scheduled) == len(UFS): break
            else:
                report = ROOT / "download-report.json"
                if report.exists() and json.loads(report.read_text()).get("failures"):
                    raise ValueError("Downloads falharam; confira o relatório local")
                time.sleep(5)
            if len(scheduled) == len(UFS) and not running: break
    result = publish(list(finished.values()), failures)
    if result["status"] != "complete": raise ValueError(f"Consolidação incompleta: {len(finished)}/27 UFs; {failures}")
    print(f"Concluído: 27 UFs, {len(result['rows'])} números, {result['summary']['null_with_digits']} votos nulos com dígitos.", flush=True)


if __name__ == "__main__": main()
