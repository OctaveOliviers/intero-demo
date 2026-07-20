import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from server.routes import templates as templates_routes
from server.routes import databases as databases_routes
from server.test._audit_auth_helper import AuditAuthMixin


class LibraryLifecycleTest(AuditAuthMixin, unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._audit_auth_setup()

    def tearDown(self):
        self._audit_auth_teardown()

    async def test_empty_var_lists_return_empty_arrays(self):
        with (
            patch.object(templates_routes, "load_audit_registry", return_value=[]),
            patch.object(databases_routes, "load_database_catalog", return_value=[]),
        ):
            audits = await templates_routes.list_templates(self._owner_request())
            databases = await databases_routes.list_databases()
        self.assertEqual(audits, [])
        self.assertEqual(databases, [])

    async def test_audit_partial_drift_list_stable_detail_missing_spec_returns_404(
        self,
    ):
        audit = {
            "id": "a1",
            "name": "Audit",
            "description": "desc",
            "excel_path": "workbook.xlsx",
            "status": "ready",
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            # Partial drift: registry entry still exists, but spec.json is missing.
            (Path(tmpdir) / "a1").mkdir(parents=True, exist_ok=True)
            with (
                patch.object(
                    templates_routes, "load_audit_registry", return_value=[audit]
                ),
                patch.object(templates_routes, "get_audit_by_id", return_value=audit),
                patch.object(templates_routes, "TEMPLATES_DIR", Path(tmpdir)),
            ):
                rows = await templates_routes.list_templates(self._owner_request("a1"))
                self.assertEqual(len(rows), 1)
                with self.assertRaises(HTTPException) as ctx:
                    await templates_routes.get_template_detail(
                        "a1", self._owner_request("a1")
                    )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Template spec not found.")

    async def test_database_partial_drift_list_stable_detail_missing_model_returns_404(
        self,
    ):
        db = {
            "id": "d1",
            "name": "Database",
            "description": "desc",
            "type": "sqlite",
            "path": "var/databases/d1/database.sqlite",
            "status": "ready",
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            # Partial drift: catalog entry still exists, but model.json is missing.
            (Path(tmpdir) / "d1").mkdir(parents=True, exist_ok=True)
            with (
                patch.object(
                    databases_routes, "load_database_catalog", return_value=[db]
                ),
                patch.object(databases_routes, "_get_database_by_id", return_value=db),
                patch.object(databases_routes, "DATABASES_DIR", Path(tmpdir)),
            ):
                rows = await databases_routes.list_databases()
                self.assertEqual(len(rows), 1)
                with self.assertRaises(HTTPException) as ctx:
                    await databases_routes.get_database_detail("d1")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Database model not found.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
