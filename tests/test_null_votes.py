import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from pipeline.publish_null_votes import rank_numbers, summarize_votes
from pipeline.rdv_download import digest, download_state, prepare_sources, request_ranges, unpack_member, write_json


class NullVoteTests(unittest.TestCase):
    def test_only_null_votes_count_and_leading_zero_is_preserved(self):
        numbers, missing, types = summarize_votes([
            {"tipoVoto": "nominal", "digitacao": "22"}, {"tipoVoto": "branco"},
            {"tipoVoto": "nulo", "digitacao": "00"}, {"tipoVoto": "nulo", "digitacao": "00"},
            {"tipoVoto": "nulo", "digitacao": "99"}, {"tipoVoto": "nuloAposSuspensao"},
            {"tipoVoto": "nuloPorRepeticao", "digitacao": "15"},
        ])
        self.assertEqual(dict(numbers), {"00": 2, "99": 1, "15": 1})
        self.assertEqual(missing, 1)
        self.assertEqual(types["nulo"], 3)
        with self.assertRaises(ValueError): summarize_votes([{"tipoVoto": "nulo", "digitacao": 0}])

    def test_total_order_and_all_tied_leaders_use_absolute_votes(self):
        states = [{"uf": "SP", "numbers": {"00": 12, "99": 2}},
                  {"uf": "MG", "numbers": {"00": 12, "99": 9}},
                  {"uf": "DF", "numbers": {"00": 1, "10": 3}}]
        rows = rank_numbers(states)
        self.assertEqual([(r["number"], r["votes"]) for r in rows], [("00", 25), ("99", 11), ("10", 3)])
        self.assertEqual(rows[0]["top_ufs"], ["MG", "SP"])
        self.assertEqual(rows[0]["top_uf_votes"], 12)
        self.assertEqual(rows[1]["top_ufs"], ["MG"])
        self.assertEqual(states[0]["numbers"]["00"], 12)

    def test_zip_member_is_recovered_byte_for_byte_and_crc_mismatch_is_rejected(self):
        raw = b"\x30\x00\r\n\x00binary\xff" * 30
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("sample-rdv.dat", raw)
            info = archive.getinfo("sample-rdv.dat")
        record = {"name": info.filename, "offset": info.header_offset, "compressed_size": info.compress_size,
                  "size": info.file_size, "crc32": info.CRC, "method": info.compress_type}
        self.assertEqual(unpack_member(record, [(0, stream.getvalue())]), raw)
        with self.assertRaisesRegex(ValueError, "CRC32"):
            unpack_member(record | {"crc32": info.CRC ^ 1}, [(0, stream.getvalue())])

    def test_complete_local_download_does_not_access_the_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); pack = root / "packs/DF.zip"; pack.parent.mkdir()
            with zipfile.ZipFile(pack, "w") as archive: archive.writestr("sample-rdv.dat", b"local")
            source = {"uf": "DF", "url": "https://cdn.tse.jus.br/test.zip", "archive_bytes": 999}
            write_json(root / "status/DF.json", {"source": source, "status": "complete", "sha256": digest(pack), "downloaded_members": 1})
            with patch("pipeline.rdv_download.urlopen") as network:
                self.assertEqual(download_state(source, root)["status"], "complete")
                network.assert_not_called()

    def test_multipart_preserves_binary_bytes_and_rejects_missing_ranges(self):
        source = {"url": "https://cdn.tse.jus.br/test.zip", "archive_bytes": 100}
        values = [(0, b"\x00\r\n\xff"), (20, b"\x80XYZ")]
        body = b""
        for start, value in values:
            body += b"--testboundary\r\nContent-Type: application/zip\r\n"
            body += f"Content-Range: bytes {start}-{start+len(value)-1}/100\r\n\r\n".encode() + value + b"\r\n"
        body += b"--testboundary--\r\n"
        class Response:
            status = 206
            headers = {"Content-Type": "multipart/byteranges; boundary=testboundary"}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return body[:size]
        with patch("pipeline.rdv_download.urlopen", return_value=Response()):
            self.assertEqual(request_ranges(source, [(0, 3), (20, 23)]), values)
            with self.assertRaises(ValueError): request_ranges(source, [(0, 3), (20, 24)])

    def test_cached_catalog_and_schema_do_not_make_network_requests(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / "spec").mkdir()
            (root / "discovery.json").write_text("{}")
            (root / "spec/rdv.asn1").write_text("local")
            with patch("pipeline.rdv_download.urlopen") as network:
                prepare_sources(root)
                network.assert_not_called()

    def test_http_200_is_rejected_before_downloading_a_full_archive(self):
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): raise AssertionError("Não deve ler um pacote integral")
        with patch("pipeline.rdv_download.urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, "HTTP 200"):
                request_ranges({"url": "https://cdn.tse.jus.br/test.zip", "archive_bytes": 999}, [(0, 10)])


if __name__ == "__main__": unittest.main()
