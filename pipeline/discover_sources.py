"""Pesquisa o catálogo oficial CKAN sem presumir URLs de arquivos históricos."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


def discover(year: int) -> dict:
    checks = []
    for topic in ("votação seção", "locais votação", "presos provisórios"):
        url = "https://dadosabertos.tse.jus.br/api/3/action/package_search?" + urlencode({"q": f"{topic} {year}", "rows": 20})
        check = {"topic": topic, "url": url, "status": "pending", "datasets": []}
        try:
            with urlopen(url, timeout=25) as response:
                payload = json.load(response)
            if not payload.get("success"):
                raise ValueError("Catálogo respondeu sem sucesso")
            check["status"] = "responded"
            check["total_found"] = payload["result"]["count"]
            check["datasets"] = [
                {"id": package["id"], "title": package["title"], "name": package["name"],
                 "resources": [{"name": r.get("name"), "format": r.get("format"), "url": r.get("url")} for r in package.get("resources", [])]}
                for package in payload["result"]["results"]
            ]
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, OSError) as error:
            check["status"] = "failed"
            check["error"] = str(error)
        checks.append(check)
    return {"checked_at": datetime.now(timezone.utc).isoformat(), "year": year, "checks": checks,
            "note": "Busca de fontes, não validação de cobertura ou de resultados eleitorais."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2022)
    parser.add_argument("--out", type=Path, default=Path("data/raw/discovery.json"))
    args = parser.parse_args()
    report = discover(args.year)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for check in report["checks"]:
        print(f"{check['topic']}: {check['status']} — {check.get('error', str(check.get('total_found')) + ' conjunto(s) encontrado(s)')}")
    raise SystemExit(2 if any(c["status"] == "failed" for c in report["checks"]) else 0)


if __name__ == "__main__":
    main()
