"""Guarda cópias imutáveis de fontes oficiais. Rede só no comando fetch explícito."""
from __future__ import annotations

import argparse
import json
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener

from pipeline.import_votes import checksum, official_url

DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "data" / "official"
FORMATS = {"zip", "csv", "json", "html", "pdf"}


class OfficialRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        official_url(newurl)  # Conferir o destino antes de seguir o redirecionamento.
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_manifest(root: Path) -> dict:
    path = root / "manifest.json"
    if not path.exists():
        return {"schema_version": 1, "snapshots": []}
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("snapshots"), list):
        raise ValueError("Manifesto local inválido")
    return manifest


def local_path(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Caminho do manifesto fora de data/official")
    return path


def verify_entry(root: Path, entry: dict) -> Path:
    path = local_path(root, entry["path"])
    if not path.is_file() or path.stat().st_size != entry["bytes"] or checksum(path) != entry["sha256"]:
        raise ValueError(f"Cópia local ausente ou com integridade divergente: {entry['path']}")
    return path


def verify_all(root: Path) -> int:
    entries = read_manifest(root)["snapshots"]
    if not entries:
        raise ValueError("Nenhum arquivo oficial foi armazenado ainda")
    for entry in entries:
        verify_entry(root, entry)
    return len(entries)


def validate_format(path: Path, kind: str):
    with path.open("rb") as stream:
        prefix = stream.read(1024).lstrip()
    if not prefix:
        raise ValueError("Resposta vazia")
    if kind == "zip" and not zipfile.is_zipfile(path):
        raise ValueError("Resposta não é um ZIP completo")
    if kind == "pdf" and not prefix.startswith(b"%PDF-"):
        raise ValueError("Resposta não é PDF")
    if kind == "json":
        with path.open(encoding="utf-8-sig") as stream:
            json.load(stream)
    if kind == "csv" and (b"<html" in prefix.lower() or b"<!doctype html" in prefix.lower()):
        raise ValueError("Resposta HTML recebida no lugar de CSV")


def fetch(root: Path, source_id: str, year: int, url: str, kind: str,
          refresh: bool = False, expected_sha256: str | None = None,
          max_bytes: int = 90 * 1024 * 1024) -> tuple[Path, bool]:
    official_url(url)
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", source_id):
        raise ValueError("ID precisa conter apenas letras minúsculas, números e hífens")
    if kind not in FORMATS or not 1989 <= year <= 2100 or max_bytes <= 0:
        raise ValueError("Formato, ano ou tamanho máximo inválido")
    if expected_sha256 and not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("SHA-256 esperado inválido")
    manifest = read_manifest(root)
    previous = [e for e in manifest["snapshots"] if e["source_id"] == source_id and e["year"] == year]
    if previous and not refresh:
        entry = previous[-1]
        if entry["url"] != url or entry["format"] != kind:
            raise ValueError("Fonte alterada: use outro ID ou atualização explícita --refresh")
        path = verify_entry(root, entry)
        if expected_sha256 and entry["sha256"] != expected_sha256:
            raise ValueError("Cópia local não corresponde ao SHA-256 esperado")
        return path, False  # Nenhuma consulta HTTP, nem HEAD, na reutilização.

    staging = root / ".downloads"
    staging.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        request = Request(url, headers={"User-Agent": "VotoSobCustodia/0.1 (public-data-archive)"})
        # Mantém proxies do ambiente e a verificação padrão dos certificados TLS.
        with build_opener(OfficialRedirects()).open(request, timeout=60) as response:
            resolved_url = official_url(response.geturl())
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > max_bytes:
                raise ValueError("Arquivo excede o limite local de tamanho; planeje Git LFS antes de aumentá-lo")
            with tempfile.NamedTemporaryFile(dir=staging, delete=False) as stream:
                temporary = Path(stream.name)
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise ValueError("Arquivo excede o limite local de tamanho")
                    stream.write(chunk)
            if content_length is not None and size != int(content_length):
                raise ValueError("Download incompleto: tamanho diferente do anunciado")
            metadata = {"media_type": response.headers.get("Content-Type"),
                        "etag": response.headers.get("ETag"), "last_modified": response.headers.get("Last-Modified")}
        validate_format(temporary, kind)
        digest = checksum(temporary)
        if expected_sha256 and digest != expected_sha256:
            raise ValueError("Download não corresponde ao SHA-256 esperado")
        relative = f"{year}/{source_id}/{digest}.{kind}"
        destination = local_path(root, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if checksum(destination) != digest:
                raise ValueError("Arquivo imutável já existente com integridade divergente")
        else:
            temporary.replace(destination)
        entry = {"source_id": source_id, "year": year, "url": url, "resolved_url": resolved_url,
                 "format": kind, "path": relative, "bytes": size, "sha256": digest,
                 "retrieved_at": datetime.now(timezone.utc).isoformat(), **metadata}
        manifest["snapshots"].append(entry)
        with tempfile.NamedTemporaryFile(dir=staging, mode="w", encoding="utf-8", delete=False) as stream:
            manifest_temp = Path(stream.name)
            json.dump(manifest, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        try:
            manifest_temp.replace(root / "manifest.json")
        finally:
            manifest_temp.unlink(missing_ok=True)
        return destination, True
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("verify", help="Confere todas as cópias sem acessar a internet")
    download = commands.add_parser("fetch", help="Download manual ou reutilização local")
    download.add_argument("--id", required=True, dest="source_id")
    download.add_argument("--year", required=True, type=int)
    download.add_argument("--url", required=True)
    download.add_argument("--format", required=True, choices=sorted(FORMATS), dest="kind")
    download.add_argument("--refresh", action="store_true", help="Busca nova versão sem excluir a anterior")
    download.add_argument("--sha256", dest="expected_sha256", help="Checksum publicado pela fonte, se houver")
    download.add_argument("--max-mib", type=int, default=90, help="Limite de download; padrão adequado para Git comum")
    args = parser.parse_args()
    try:
        if args.command == "verify":
            print(f"{verify_all(DEFAULT_ROOT)} registro(s) conferido(s) localmente; nenhuma consulta HTTP.")
        else:
            path, downloaded = fetch(DEFAULT_ROOT, args.source_id, args.year, args.url, args.kind,
                                     args.refresh, args.expected_sha256, args.max_mib * 1024 * 1024)
            print(f"{'Download preservado' if downloaded else 'Cópia local reutilizada sem rede'}: {path}")
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(2, f"Arquivo não disponibilizado: {error}\n")


if __name__ == "__main__":
    main()
