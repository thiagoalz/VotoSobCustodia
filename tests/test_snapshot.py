"""Respostas sintéticas em diretórios temporários; nenhum acesso externo."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline.snapshot import OfficialRedirects, fetch, read_manifest, verify_all

URL = "https://cdn.tse.jus.br/fixture-inexistente.json"


class Response(io.BytesIO):
    def __init__(self, content, headers=None):
        super().__init__(content)
        self.headers = {"Content-Type": "application/json", **(headers or {})}

    def geturl(self):
        return URL


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "official"
        self.source = {"source_id": "teste-sintetico", "year": 2022, "url": URL, "kind": "json"}

    def acquire(self, content=b'{"synthetic": 1}', **kwargs):
        with patch("pipeline.snapshot.build_opener") as opener:
            opener.return_value.open.return_value = Response(content)
            return fetch(self.root, **self.source, **kwargs)

    def test_preserves_original_and_metadata(self):
        content = b'{"synthetic": 1}'
        path, downloaded = self.acquire(content)
        self.assertTrue(downloaded)
        self.assertEqual(path.read_bytes(), content)
        entry = read_manifest(self.root)["snapshots"][0]
        self.assertEqual(entry["url"], URL)
        self.assertEqual(entry["bytes"], len(content))
        self.assertEqual(len(entry["sha256"]), 64)
        self.assertTrue(entry["retrieved_at"])
        self.assertEqual(verify_all(self.root), 1)

    def test_reuse_and_verification_never_open_network(self):
        expected, _ = self.acquire()
        with patch("pipeline.snapshot.build_opener") as opener:
            path, downloaded = fetch(self.root, **self.source)
            self.assertEqual(path, expected)
            self.assertFalse(downloaded)
            self.assertEqual(verify_all(self.root), 1)
            opener.assert_not_called()

    def test_corruption_does_not_trigger_automatic_redownload(self):
        path, _ = self.acquire()
        path.write_bytes(b'{"synthetic": 2}')
        with patch("pipeline.snapshot.build_opener") as opener:
            with self.assertRaisesRegex(ValueError, "integridade"):
                fetch(self.root, **self.source)
            opener.assert_not_called()

    def test_explicit_update_keeps_both_versions(self):
        first, _ = self.acquire()
        second, downloaded = self.acquire(b'{"synthetic": 2}', refresh=True)
        self.assertTrue(downloaded)
        self.assertNotEqual(first, second)
        self.assertEqual(first.read_bytes(), b'{"synthetic": 1}')
        self.assertEqual(second.read_bytes(), b'{"synthetic": 2}')
        self.assertEqual(verify_all(self.root), 2)

    def test_invalid_json_does_not_enter_manifest(self):
        with self.assertRaises(ValueError):
            self.acquire(b'<html>erro da origem</html>')
        self.assertEqual(read_manifest(self.root)["snapshots"], [])
        self.assertFalse(list((self.root / ".downloads").iterdir()))

    def test_checksum_mismatch_is_not_saved(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 esperado"):
            self.acquire(expected_sha256="0" * 64)
        self.assertEqual(read_manifest(self.root)["snapshots"], [])

    def test_truncated_response_is_not_saved(self):
        with patch("pipeline.snapshot.build_opener") as opener:
            opener.return_value.open.return_value = Response(b'{}', {"Content-Length": "20"})
            with self.assertRaisesRegex(ValueError, "incompleto"):
                fetch(self.root, **self.source)
        self.assertEqual(read_manifest(self.root)["snapshots"], [])

    def test_download_limit_is_enforced_even_without_content_length(self):
        with self.assertRaisesRegex(ValueError, "limite"):
            self.acquire(max_bytes=2)
        self.assertEqual(read_manifest(self.root)["snapshots"], [])

    def test_empty_manifest_does_not_count_as_verified_data(self):
        with self.assertRaisesRegex(ValueError, "Nenhum arquivo oficial"):
            verify_all(self.root)

    def test_redirect_to_unofficial_host_is_rejected_before_following(self):
        with self.assertRaisesRegex(ValueError, "URL oficial HTTPS"):
            OfficialRedirects().redirect_request(None, None, 302, "", {}, "https://example.com/file")

    def test_manifest_cannot_read_outside_archive(self):
        self.root.mkdir()
        entry = {"path": "../other.json", "bytes": 0, "sha256": "0" * 64}
        (self.root / "manifest.json").write_text(json.dumps({"schema_version": 1, "snapshots": [entry]}))
        with self.assertRaisesRegex(ValueError, "fora"):
            verify_all(self.root)


if __name__ == "__main__":
    unittest.main()
