from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.config import STATE_DB_PATH
from server.auth import service, store


class AuthStoreMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_db = self.tmp_path / "state.db"
        self.legacy_db = self.tmp_path / "auth.sqlite"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _seed_legacy_auth_db(self) -> None:
        conn = sqlite3.connect(self.legacy_db)
        try:
            conn.executescript(
                """
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE run_attributions (
                    run_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    audit_id TEXT,
                    request TEXT,
                    filters TEXT,
                    started_at TEXT NOT NULL
                );
                CREATE TABLE query_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    run_id TEXT,
                    database TEXT,
                    query TEXT NOT NULL,
                    ts TEXT NOT NULL
                );
                """
            )
            conn.execute(
                "INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
                ("u1", "alice", "hash", "salt", "2026-01-01T00:00:00+00:00"),
            )
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (
                    "tok-1",
                    "u1",
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T08:00:00+00:00",
                ),
            )
            conn.execute(
                "INSERT INTO run_attributions (run_id, user_id, audit_id, request, filters, started_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "run-1",
                    "u1",
                    "audit-1",
                    "prompt",
                    '{"cohort":"all"}',
                    "2026-01-01T00:01:00+00:00",
                ),
            )
            conn.execute(
                "INSERT INTO query_log (user_id, run_id, database, query, ts) VALUES (?, ?, ?, ?, ?)",
                ("u1", "run-1", "ehr-db", "SELECT 1", "2026-01-01T00:02:00+00:00"),
            )
            conn.commit()
        finally:
            conn.close()

    def test_store_points_to_state_db_contract_path(self) -> None:
        self.assertEqual(store.AUTH_DB_PATH, STATE_DB_PATH)

    def test_migrate_legacy_auth_store_is_idempotent(self) -> None:
        self._seed_legacy_auth_db()

        with (
            patch.object(store, "AUTH_DB_PATH", self.state_db),
            patch.object(store, "LEGACY_AUTH_DB_PATH", self.legacy_db),
        ):
            store.init_store()
            store.init_store()

            with sqlite3.connect(self.state_db) as conn:
                conn.row_factory = sqlite3.Row
                users = conn.execute("SELECT * FROM users").fetchall()
                sessions = conn.execute("SELECT * FROM sessions").fetchall()
                runs = conn.execute("SELECT * FROM run_attributions").fetchall()
                queries = conn.execute("SELECT * FROM query_log").fetchall()

            self.assertEqual(len(users), 1)
            self.assertEqual(users[0]["id"], "u1")
            # Slice 5: the migrated legacy user arrives role-less and the
            # init_store backfill must resolve it to the clinician default.
            self.assertEqual(service.role_for("u1"), "clinician")
            self.assertEqual(len(sessions), 1)
            self.assertEqual(sessions[0]["token"], "tok-1")
            self.assertEqual(sessions[0]["last_seen_at"], "2026-01-01T00:00:00+00:00")
            self.assertIsNone(sessions[0]["invalidated_at"])
            self.assertIsNone(sessions[0]["invalidation_reason"])
            self.assertEqual(len(runs), 1)
            self.assertEqual(runs[0]["run_id"], "run-1")
            self.assertEqual(len(queries), 1)
            self.assertEqual(queries[0]["user_id"], "u1")

    def test_migrated_user_display_name_defaults_to_username(self) -> None:
        # Contract §2 marks users.display_name required; the legacy-migration
        # path must default it to the username like every other creation path.
        self._seed_legacy_auth_db()

        with (
            patch.object(store, "AUTH_DB_PATH", self.state_db),
            patch.object(store, "LEGACY_AUTH_DB_PATH", self.legacy_db),
        ):
            store.init_store()

            with sqlite3.connect(self.state_db) as conn:
                conn.row_factory = sqlite3.Row
                user = conn.execute(
                    "SELECT username, display_name FROM users WHERE id = ?", ("u1",)
                ).fetchone()

            self.assertEqual(user["display_name"], user["username"])


if __name__ == "__main__":
    unittest.main()
