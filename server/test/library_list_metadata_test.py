import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server.routes import templates as templates_routes
from server.routes import databases as databases_routes
from server.test._audit_auth_helper import AuditAuthMixin


class LibraryListMetadataTest(AuditAuthMixin, unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._audit_auth_setup()

    def tearDown(self):
        self._audit_auth_teardown()

    async def test_audits_list_returns_complete_metadata_with_deterministic_defaults(
        self,
    ):
        audit_with_meta = {
            "id": "a1",
            "name": "Audit One",
            "description": "desc",
            "excel_path": "workbook.xlsx",
            "icon": "📄",
            "database": None,
            "level": "Regional",
            "read_only": True,
            "stale": True,
            "version": "2026.1",
            "scheme": "NNAP 2026",
            "last_pulled": "2026-06-01",
            "provenance_ref": "RCPCH",
            "provenance_url": "https://example.test/nnap",
            "status": "ready",
        }
        audit_defaults = {
            "id": "a2",
            "name": "Audit Two",
            "description": "desc2",
            "excel_path": "workbook.xlsx",
        }
        with patch.object(
            templates_routes,
            "load_audit_registry",
            return_value=[audit_with_meta, audit_defaults],
        ):
            rows = await templates_routes.list_templates(
                self._owner_request("a1", "a2")
            )
        self.assertEqual(len(rows), 2)

        first = rows[0].model_dump(by_alias=True)
        self.assertEqual(first["level"], "Regional")
        self.assertTrue(first["readOnly"])
        self.assertTrue(first["stale"])
        self.assertEqual(first["scheme"], "NNAP 2026")
        self.assertEqual(first["version"], "2026.1")
        self.assertEqual(first["lastPulled"], "2026-06-01")
        self.assertEqual(first["provenanceRef"], "RCPCH")
        self.assertEqual(first["provenanceUrl"], "https://example.test/nnap")
        self.assertEqual(first["status"], "ready")

        second = rows[1].model_dump(by_alias=True)
        self.assertEqual(second["level"], "Local")
        self.assertFalse(second["readOnly"])
        self.assertFalse(second["stale"])
        self.assertIsNone(second["scheme"])
        self.assertIsNone(second["version"])
        self.assertIsNone(second["lastPulled"])
        self.assertIsNone(second["provenanceRef"])
        self.assertIsNone(second["provenanceUrl"])
        self.assertEqual(second["status"], "ready")

    async def test_databases_list_returns_complete_metadata_with_deterministic_defaults(
        self,
    ):
        db_with_meta = {
            "id": "d1",
            "name": "Database One",
            "description": "db desc",
            "type": "sqlite",
            "path": "var/databases/d1/database.sqlite",
            "level": "National",
            "read_only": True,
            "stale": True,
            "version": "v2",
            "scheme": "Source 2026",
            "last_pulled": "2026-06-02",
            "provenance_ref": "Source Org",
            "provenance_url": "https://example.test/db",
            "status": "ready",
        }
        db_defaults = {
            "id": "d2",
            "name": "Database Two",
            "description": "db desc2",
            "type": "sqlite",
            "path": "var/databases/d2/database.sqlite",
        }
        with patch.object(
            databases_routes,
            "load_database_catalog",
            return_value=[db_with_meta, db_defaults],
        ):
            rows = await databases_routes.list_databases()
        self.assertEqual(len(rows), 2)

        first = rows[0].model_dump(by_alias=True)
        self.assertEqual(first["level"], "National")
        self.assertTrue(first["readOnly"])
        self.assertTrue(first["stale"])
        self.assertEqual(first["scheme"], "Source 2026")
        self.assertEqual(first["version"], "v2")
        self.assertEqual(first["lastPulled"], "2026-06-02")
        self.assertEqual(first["provenanceRef"], "Source Org")
        self.assertEqual(first["provenanceUrl"], "https://example.test/db")
        self.assertEqual(first["status"], "ready")

        second = rows[1].model_dump(by_alias=True)
        self.assertEqual(second["level"], "Local")
        self.assertFalse(second["readOnly"])
        self.assertFalse(second["stale"])
        self.assertIsNone(second["scheme"])
        self.assertIsNone(second["version"])
        self.assertIsNone(second["lastPulled"])
        self.assertIsNone(second["provenanceRef"])
        self.assertIsNone(second["provenanceUrl"])
        self.assertEqual(second["status"], "ready")

    async def test_list_and_detail_metadata_are_consistent_for_audits_and_databases(
        self,
    ):
        audit = {
            "id": "a1",
            "name": "Audit",
            "description": "desc",
            "excel_path": "workbook.xlsx",
            "level": "Regional",
            "read_only": True,
            "stale": True,
            "version": "2026.1",
            "scheme": "Scheme",
            "last_pulled": "2026-06-01",
            "provenance_ref": "Ref",
            "provenance_url": "https://example.test/ref",
            "status": "ready",
        }
        db = {
            "id": "d1",
            "name": "DB",
            "description": "desc",
            "type": "sqlite",
            "path": "var/databases/d1/database.sqlite",
            "level": "National",
            "read_only": True,
            "stale": True,
            "version": "v2",
            "scheme": "Scheme",
            "last_pulled": "2026-06-02",
            "provenance_ref": "Ref",
            "provenance_url": "https://example.test/ref",
            "status": "ready",
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            audit_dir = Path(tmpdir) / "a1"
            audit_dir.mkdir(parents=True, exist_ok=True)
            (audit_dir / "spec.json").write_text("{}", encoding="utf-8")
            db_dir = Path(tmpdir) / "d1"
            db_dir.mkdir(parents=True, exist_ok=True)
            (db_dir / "model.json").write_text("{}", encoding="utf-8")

            with (
                patch.object(
                    templates_routes, "load_audit_registry", return_value=[audit]
                ),
                patch.object(templates_routes, "get_audit_by_id", return_value=audit),
                patch.object(templates_routes, "TEMPLATES_DIR", audit_dir.parent),
                patch.object(
                    databases_routes, "load_database_catalog", return_value=[db]
                ),
                patch.object(databases_routes, "_get_database_by_id", return_value=db),
                patch.object(databases_routes, "DATABASES_DIR", db_dir.parent),
            ):
                audit_list = (
                    await templates_routes.list_templates(self._owner_request("a1"))
                )[0].model_dump(by_alias=True)
                audit_detail = (
                    await templates_routes.get_template_detail(
                        "a1", self._owner_request("a1")
                    )
                ).model_dump(by_alias=True)
                db_list = (await databases_routes.list_databases())[0].model_dump(
                    by_alias=True
                )
                db_detail = (
                    await databases_routes.get_database_detail("d1")
                ).model_dump(by_alias=True)

        for key in (
            "level",
            "readOnly",
            "stale",
            "version",
            "scheme",
            "lastPulled",
            "provenanceRef",
            "provenanceUrl",
            "status",
            "name",
            "description",
        ):
            self.assertEqual(
                audit_list[key], audit_detail[key], f"audit mismatch on {key}"
            )
            self.assertEqual(
                db_list[key], db_detail[key], f"database mismatch on {key}"
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
