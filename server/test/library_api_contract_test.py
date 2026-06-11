import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from server.routes import audits as audits_routes
from server.routes import databases as databases_routes


class LibraryApiContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_get_audits_list_item_contract_keys_and_types(self):
        audit = {
            "id": "a1",
            "name": "Audit",
            "description": "desc",
            "excel_path": "workbook.xlsx",
            "status": "ready",
            "level": "Local",
            "read_only": False,
            "stale": False,
            "version": None,
            "scheme": None,
            "last_pulled": None,
            "provenance_ref": None,
            "provenance_url": None,
        }
        with patch.object(audits_routes, "load_audit_registry", return_value=[audit]):
            rows = await audits_routes.list_audits()
        item = rows[0].model_dump(by_alias=True)
        expected_keys = {
            "id",
            "name",
            "description",
            "excelPath",
            "status",
            "level",
            "readOnly",
            "stale",
            "version",
            "scheme",
            "lastPulled",
            "provenanceRef",
            "provenanceUrl",
            "deadline",
        }
        self.assertEqual(set(item.keys()), expected_keys)
        self.assertIsInstance(item["id"], str)
        self.assertIsInstance(item["name"], str)
        self.assertIsInstance(item["description"], str)
        self.assertIsInstance(item["excelPath"], str)
        self.assertIsInstance(item["status"], str)
        self.assertIsInstance(item["level"], str)
        self.assertIsInstance(item["readOnly"], bool)
        self.assertIsInstance(item["stale"], bool)

    async def test_get_audit_detail_contract_and_error_statuses(self):
        audit = {
            "id": "a1",
            "name": "Audit",
            "description": "desc",
            "excel_path": "workbook.xlsx",
            "status": "ready",
            "level": "Local",
            "read_only": False,
            "stale": False,
            "version": None,
            "scheme": None,
            "last_pulled": None,
            "provenance_ref": None,
            "provenance_url": None,
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            audit_dir = Path(tmpdir) / "a1"
            audit_dir.mkdir(parents=True, exist_ok=True)
            (audit_dir / "spec.json").write_text('{"fields":[]}', encoding="utf-8")
            (audit_dir / "mapping.json").write_text('{"fields":[]}', encoding="utf-8")
            with (
                patch.object(audits_routes, "get_audit_by_id", return_value=audit),
                patch.object(audits_routes, "AUDITS_DIR", Path(tmpdir)),
            ):
                detail = await audits_routes.get_audit_detail("a1")
            payload = detail.model_dump(by_alias=True)
            expected_keys = {
                "id",
                "name",
                "description",
                "excelPath",
                "status",
                "level",
                "readOnly",
                "stale",
                "version",
                "scheme",
                "lastPulled",
                "provenanceRef",
                "provenanceUrl",
                "deadline",
                "spec",
                "mapping",
            }
            self.assertEqual(set(payload.keys()), expected_keys)
            self.assertIsInstance(payload["spec"], dict)
            self.assertIsInstance(payload["mapping"], dict)

            with patch.object(audits_routes, "get_audit_by_id", return_value=None):
                with self.assertRaises(HTTPException) as not_found:
                    await audits_routes.get_audit_detail("missing")
            self.assertEqual(not_found.exception.status_code, 404)
            self.assertEqual(not_found.exception.detail, "Audit not found.")

            (audit_dir / "spec.json").write_text("{not-json", encoding="utf-8")
            with (
                patch.object(audits_routes, "get_audit_by_id", return_value=audit),
                patch.object(audits_routes, "AUDITS_DIR", Path(tmpdir)),
            ):
                with self.assertRaises(HTTPException) as malformed:
                    await audits_routes.get_audit_detail("a1")
            self.assertEqual(malformed.exception.status_code, 422)
            self.assertEqual(malformed.exception.detail, "Audit spec is invalid JSON.")

    async def test_get_databases_list_item_contract_keys_and_types(self):
        db = {
            "id": "d1",
            "name": "Database",
            "description": "desc",
            "type": "sqlite",
            "path": "var/databases/d1/database.sqlite",
            "status": "ready",
            "level": "Local",
            "read_only": False,
            "stale": False,
            "version": None,
            "scheme": None,
            "last_pulled": None,
            "provenance_ref": None,
            "provenance_url": None,
        }
        with patch.object(databases_routes, "load_database_catalog", return_value=[db]):
            rows = await databases_routes.list_databases()
        item = rows[0].model_dump(by_alias=True)
        expected_keys = {
            "id",
            "name",
            "description",
            "type",
            "path",
            "status",
            "level",
            "readOnly",
            "stale",
            "version",
            "scheme",
            "lastPulled",
            "provenanceRef",
            "provenanceUrl",
        }
        self.assertEqual(set(item.keys()), expected_keys)
        self.assertIsInstance(item["id"], str)
        self.assertIsInstance(item["name"], str)
        self.assertIsInstance(item["description"], str)
        self.assertIsInstance(item["type"], str)
        self.assertIsInstance(item["path"], str)
        self.assertIsInstance(item["status"], str)
        self.assertIsInstance(item["level"], str)
        self.assertIsInstance(item["readOnly"], bool)
        self.assertIsInstance(item["stale"], bool)

    async def test_get_database_detail_contract_and_error_statuses(self):
        db = {
            "id": "d1",
            "name": "Database",
            "description": "desc",
            "type": "sqlite",
            "path": "var/databases/d1/database.sqlite",
            "status": "ready",
            "level": "Local",
            "read_only": False,
            "stale": False,
            "version": None,
            "scheme": None,
            "last_pulled": None,
            "provenance_ref": None,
            "provenance_url": None,
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            db_dir = Path(tmpdir) / "d1"
            db_dir.mkdir(parents=True, exist_ok=True)
            (db_dir / "model.json").write_text('{"tables":[]}', encoding="utf-8")
            with (
                patch.object(databases_routes, "_get_database_by_id", return_value=db),
                patch.object(databases_routes, "DATABASES_DIR", Path(tmpdir)),
            ):
                detail = await databases_routes.get_database_detail("d1")
            payload = detail.model_dump(by_alias=True)
            expected_keys = {
                "id",
                "name",
                "description",
                "type",
                "path",
                "status",
                "level",
                "readOnly",
                "stale",
                "version",
                "scheme",
                "lastPulled",
                "provenanceRef",
                "provenanceUrl",
                "model",
            }
            self.assertEqual(set(payload.keys()), expected_keys)
            self.assertIsInstance(payload["model"], dict)

            with patch.object(databases_routes, "_get_database_by_id", return_value=None):
                with self.assertRaises(HTTPException) as not_found:
                    await databases_routes.get_database_detail("missing")
            self.assertEqual(not_found.exception.status_code, 404)
            self.assertEqual(not_found.exception.detail, "Database not found.")

            (db_dir / "model.json").write_text("{not-json", encoding="utf-8")
            with (
                patch.object(databases_routes, "_get_database_by_id", return_value=db),
                patch.object(databases_routes, "DATABASES_DIR", Path(tmpdir)),
            ):
                with self.assertRaises(HTTPException) as malformed:
                    await databases_routes.get_database_detail("d1")
            self.assertEqual(malformed.exception.status_code, 422)
            self.assertEqual(malformed.exception.detail, "Database model is invalid JSON.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
