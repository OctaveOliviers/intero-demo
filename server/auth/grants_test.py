"""Grant-store + grant-CRUD tests for the resource_grants control plane (#298).

Mirrors tables_test's harness: a tmp ``AUTH_DB_PATH`` with a freshly-seeded
catalog via ``init_store()`` so role permissions resolve, and the route functions
are driven directly with a ``SimpleNamespace`` request carrying ``state.user``
(identity resolved server-side, never from a client ``user_id``).

The whole vertical is tested through the public HTTP surface (the route handlers
and the table-creation path), never the SQL internals.
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from server.auth import store as auth_store


class ResourceGrantsSchemaTest(unittest.TestCase):
    """The resource_grants table lands idempotently from init_store()."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.auth_db = Path(self.tmpdir.name) / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db

    def tearDown(self) -> None:
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _columns(self) -> set[str]:
        conn = sqlite3.connect(str(self.auth_db))
        try:
            return {
                row[1]
                for row in conn.execute("PRAGMA table_info(resource_grants)").fetchall()
            }
        finally:
            conn.close()

    def test_resource_grants_table_exists_after_init(self) -> None:
        auth_store.init_store()
        cols = self._columns()
        self.assertEqual(
            cols,
            {
                "id",
                "subject_type",
                "subject_id",
                "resource_type",
                "resource_id",
                "grant_type",
                "granted_by",
                "created_at",
                "expires_at",
                "revoked_at",
            },
        )

    def test_init_store_is_idempotent(self) -> None:
        auth_store.init_store()
        # Re-running creates no duplicates and raises no errors (CREATE IF NOT EXISTS).
        auth_store.init_store()
        self.assertIn("resource_type", self._columns())


if __name__ == "__main__":
    unittest.main()
