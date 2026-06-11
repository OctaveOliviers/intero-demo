import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from server.routes.audits import _load_json_file as load_audit_json_file
from server.routes.databases import _load_json_file as load_database_json_file


class LibraryDetailArtifactErrorsTest(unittest.TestCase):
    def test_missing_artifact_returns_404_for_audits_and_databases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_path = Path(tmpdir) / "missing.json"
            for loader, label in (
                (load_audit_json_file, "Audit spec"),
                (load_database_json_file, "Database model"),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    loader(missing_path, label=label)
                self.assertEqual(ctx.exception.status_code, 404)
                self.assertEqual(ctx.exception.detail, f"{label} not found.")

    def test_malformed_artifact_returns_422_for_audits_and_databases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            broken_path = Path(tmpdir) / "broken.json"
            broken_path.write_text("{not-json", encoding="utf-8")
            for loader, label in (
                (load_audit_json_file, "Audit spec"),
                (load_database_json_file, "Database model"),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    loader(broken_path, label=label)
                self.assertEqual(ctx.exception.status_code, 422)
                self.assertEqual(ctx.exception.detail, f"{label} is invalid JSON.")

    def test_non_object_artifact_returns_422_for_audits_and_databases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            array_path = Path(tmpdir) / "array.json"
            array_path.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
            for loader, label in (
                (load_audit_json_file, "Audit spec"),
                (load_database_json_file, "Database model"),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    loader(array_path, label=label)
                self.assertEqual(ctx.exception.status_code, 422)
                self.assertEqual(ctx.exception.detail, f"{label} must be a JSON object.")

    def test_valid_object_artifact_loads_for_audits_and_databases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            valid_path = Path(tmpdir) / "valid.json"
            payload = {"ok": True}
            valid_path.write_text(json.dumps(payload), encoding="utf-8")
            for loader, label in (
                (load_audit_json_file, "Audit spec"),
                (load_database_json_file, "Database model"),
            ):
                self.assertEqual(loader(valid_path, label=label), payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
