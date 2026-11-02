"""Arquiva somente os membros RDV dos ZIPs oficiais; não publica arquivos brutos.

HTTP Range e multipart/byteranges evitam transferir os logs e boletins dos pacotes.
Cada membro é conferido pelo CRC32 do ZIP de origem antes de ser preservado.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import struct
import time
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.request import Request, urlopen

from pipeline.import_votes import official_url
from pipeline.snapshot import fetch

ROOT = Path(__file__).resolve().parents[1] / "data/official/rdv-2026"
UFS = tuple("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split())


def prepare_sources(root=ROOT):
    """Aquisição manual explícita; reutiliza catálogo, versão e esquema já locais."""
    discovery_path = root / "discovery.json"
    if not discovery_path.exists():
        root.mkdir(parents=True, exist_ok=True)
        url = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026-arquivos-transmitidos-para-totalizacao"
        with urlopen(Request(url, headers={"User-Agent": "VotoSobCustodia/0.1 archive"}), timeout=60) as response:
            raw = response.read()
        (root / "catalogo.json").write_bytes(raw)
        package = json.loads(raw)["result"]
        resources = [r for r in package["resources"] if "Segundo turno" in r["name"] and r["name"].split(" - ")[0] in UFS]
        def inspect(resource):
            with urlopen(Request(official_url(resource["url"]), method="HEAD"), timeout=60) as response:
                return {"uf": resource["name"].split(" - ")[0], "url": resource["url"],
                        "archive_bytes": int(response.headers["Content-Length"]), "etag": response.headers.get("ETag"),
                        "range": response.headers.get("Accept-Ranges"), "status": "available"}
        with ThreadPoolExecutor(max_workers=6) as pool: states = list(pool.map(inspect, resources))
        if {state["uf"] for state in states} != set(UFS): raise ValueError("Catálogo não contém as 27 UFs")
        write_json(discovery_path, {"schema_version": 1, "year": 2026, "turn": 2, "scope": "all_brazil_sections",
                                   "catalog_url": url, "catalog_sha256": hashlib.sha256(raw).hexdigest(),
                                   "retrieved_at": datetime.now(timezone.utc).isoformat(), "states": states})
    schema_path = root / "spec/rdv.asn1"
    if not schema_path.exists():
        source = "https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital"
        path, _ = fetch(root, "especificacao-bu-rdv", 2026, source, "zip", max_bytes=30 * 1024 * 1024)
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as archive:
            for name in ["spec/rdv.asn1", "spec/bu.asn1"]:
                (root / name).write_bytes(archive.read(name))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def request_ranges(source, intervals):
    """Retorna intervalos exatos, recusando HTTP 200 e multipart incompleto."""
    ranges = ",".join(f"{start}-{end}" for start, end in intervals)
    headers = {"Range": "bytes=" + ranges, "User-Agent": "VotoSobCustodia/0.1 RDV archive"}
    if source.get("etag"):
        headers["If-Match"] = source["etag"]
    limit = sum(end - start + 1 for start, end in intervals) + 1024 * len(intervals) + 4096
    with urlopen(Request(official_url(source["url"]), headers=headers), timeout=60) as response:
        if response.status != 206:
            raise ValueError(f"Servidor não respeitou Range: HTTP {response.status}")
        content_type = response.headers.get("Content-Type", "")
        content_range = response.headers.get("Content-Range")
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Resposta de intervalos excedeu o tamanho esperado")
    expected = {f"bytes {start}-{end}/{source['archive_bytes']}": (start, end) for start, end in intervals}
    if len(intervals) == 1:
        parts = [(content_range, raw)]
    else:
        if not content_type.lower().startswith("multipart/byteranges;"):
            raise ValueError("Resposta não é multipart/byteranges")
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + raw)
        if not message.is_multipart():
            raise ValueError("Multipart inválido")
        parts = [(part.get("Content-Range"), part.get_payload(decode=True)) for part in message.iter_parts()]
    result = {}
    for content_range, data in parts:
        if content_range not in expected or content_range in result:
            raise ValueError(f"Intervalo inesperado ou duplicado: {content_range}")
        start, end = expected[content_range]
        if data is None or len(data) != end - start + 1:
            raise ValueError("Intervalo incompleto")
        result[content_range] = data
    if set(result) != set(expected):
        raise ValueError("Faltam intervalos na resposta")
    return [(start, result[key]) for key, (start, _) in expected.items()]


class RemoteZipReader(io.RawIOBase):
    def __init__(self, source):
        self.source, self.position = source, 0

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.source["archive_bytes"] + offset
        if self.position < 0: raise ValueError("Posição negativa")
        return self.position

    def read(self, size=-1):
        remaining = self.source["archive_bytes"] - self.position
        size = remaining if size < 0 else min(size, remaining)
        if size <= 0: return b""
        result = request_ranges(self.source, [(self.position, self.position + size - 1)])[0][1]
        self.position += size
        return result


def load_index(source, root=ROOT):
    path = root / "indexes" / f"{source['uf']}.json"
    if path.exists():
        index = json.loads(path.read_text())
        if index["source"] == source: return index
        raise ValueError(f"Versão da fonte mudou para {source['uf']}; não sobrescrever o arquivo local")
    with zipfile.ZipFile(RemoteZipReader(source)) as archive:
        all_infos = archive.infolist()
        records = [{"name": item.filename, "offset": item.header_offset, "size": item.file_size,
                    "compressed_size": item.compress_size, "crc32": item.CRC, "method": item.compress_type}
                   for item in all_infos if item.filename.lower().endswith(("-rdv.dat", "-rdvred.dat"))]
        index = {"source": source, "total_archive_members": len(all_infos),
                 "rdv_members": sorted(records, key=lambda row: row["offset"])}
    if not records: raise ValueError(f"Nenhum RDV encontrado para {source['uf']}")
    if len({r["name"] for r in records}) != len(records): raise ValueError("Nomes duplicados no ZIP")
    write_json(path, index)
    return index


def intervals_for(records, archive_size):
    intervals = []
    for row in records:
        start = row["offset"]
        end = min(archive_size - 1, start + 30 + len(row["name"].encode("utf-8")) + row["compressed_size"] + 256 - 1)
        if intervals and start <= intervals[-1][1] + 1:
            intervals[-1] = (intervals[-1][0], max(end, intervals[-1][1]))
        else: intervals.append((start, end))
    return intervals


def unpack_member(record, blocks):
    start, block = next((start, data) for start, data in blocks if start <= record["offset"] < start + len(data))
    offset = record["offset"] - start
    header = block[offset:offset + 30]
    if len(header) != 30 or header[:4] != b"PK\x03\x04": raise ValueError("Cabeçalho local ZIP inválido")
    flags, method = struct.unpack_from("<HH", header, 6)
    if flags & 1: raise ValueError("RDV ZIP criptografado não suportado")
    name_length, extra_length = struct.unpack_from("<HH", header, 26)
    name_bytes = block[offset + 30:offset + 30 + name_length]
    name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437")
    if name != record["name"] or method != record["method"]: raise ValueError("Índice e cabeçalho divergem")
    payload_offset = offset + 30 + name_length + extra_length
    payload = block[payload_offset:payload_offset + record["compressed_size"]]
    if len(payload) != record["compressed_size"]: raise ValueError("Membro incompleto; extra ZIP inesperado")
    if method == zipfile.ZIP_DEFLATED: raw = zlib.decompress(payload, -15)
    elif method == zipfile.ZIP_STORED: raw = payload
    else: raise ValueError(f"Compressão ZIP não suportada: {method}")
    if len(raw) != record["size"] or zlib.crc32(raw) & 0xffffffff != record["crc32"]:
        raise ValueError(f"CRC32 ou tamanho divergente: {name}")
    return raw


def download_state(source, root=ROOT, batch_size=128):
    uf = source["uf"]
    pack, status_path = root / "packs" / f"{uf}.zip", root / "status" / f"{uf}.json"
    if status_path.exists():
        status = json.loads(status_path.read_text())
        if status.get("status") == "complete" and status["source"] == source and pack.exists() and digest(pack) == status["sha256"]:
            print(f"{uf}: cópia local reutilizada ({status['downloaded_members']} RDVs)", flush=True)
            return status
    print(f"{uf}: lendo índice oficial", flush=True)
    index = load_index(source, root)
    pack.parent.mkdir(parents=True, exist_ok=True)
    if pack.exists() and not zipfile.is_zipfile(pack): raise ValueError(f"Pacote local inválido: {pack}")
    with zipfile.ZipFile(pack, "a", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
        existing = {item.filename: item for item in archive.infolist()}
        expected = {item["name"]: item for item in index["rdv_members"]}
        if not set(existing) <= set(expected): raise ValueError("Membro local ausente no índice da fonte")
        for name, item in existing.items():
            if item.CRC != expected[name]["crc32"] or item.file_size != expected[name]["size"]:
                raise ValueError("Membro local diverge da fonte")
        pending = [r for r in index["rdv_members"] if r["name"] not in existing]
        status = {"uf": uf, "source": source, "status": "downloading", "expected_members": len(expected),
                  "downloaded_members": len(existing), "acquisition": "all_rdv_members_extracted_via_http_ranges"}
        write_json(status_path, status)
        for position in range(0, len(pending), batch_size):
            batch = pending[position:position + batch_size]
            for attempt in range(4):
                try:
                    blocks = request_ranges(source, intervals_for(batch, source["archive_bytes"]))
                    decoded = [(record["name"], unpack_member(record, blocks)) for record in batch]
                    break
                except (OSError, ValueError) as error:
                    if attempt == 3: raise
                    print(f"{uf}: repetindo lote após {type(error).__name__}", flush=True)
                    time.sleep(0.5 * 2 ** attempt)
            for name, raw in decoded: archive.writestr(name, raw)
            status["downloaded_members"] += len(batch)
            if position % (batch_size * 8) == 0 or status["downloaded_members"] == len(expected):
                write_json(status_path, status)
                print(f"{uf}: {status['downloaded_members']}/{len(expected)} RDVs", flush=True)
    status.update(status="complete", sha256=digest(pack), bytes=pack.stat().st_size,
                  completed_at=datetime.now(timezone.utc).isoformat(), path=str(pack.relative_to(root)))
    write_json(status_path, status)
    print(f"{uf}: download concluído, {status['downloaded_members']} RDVs", flush=True)
    return status


def download_all(root=ROOT, workers=6):
    discovery = json.loads((root / "discovery.json").read_text())
    sources = discovery["states"]
    if {s["uf"] for s in sources} != set(UFS) or any(s["status"] != "available" for s in sources):
        raise ValueError("Catálogo não contém todas as 27 UFs disponíveis")
    results, failures = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {pool.submit(download_state, source, root): source["uf"] for source in sorted(sources, key=lambda s: s["archive_bytes"])}
        for future in as_completed(jobs):
            try: results.append(future.result())
            except Exception as error:
                failures.append({"uf": jobs[future], "error": str(error)})
                print(f"ERRO {jobs[future]}: {error}", flush=True)
    write_json(root / "download-report.json", {"states": sorted(results, key=lambda x: x["uf"]), "failures": failures})
    if failures: raise ValueError(f"Downloads incompletos: {failures}")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    prepare_sources()
    download_all(workers=args.workers)
