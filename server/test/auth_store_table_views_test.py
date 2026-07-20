"""Per-user 'table opened' (seen) store tests.

The blue "finished, unopened" dot is driven by a PER-USER record of which tables
a user has opened the full grid for. It lives in the auth store's
``table_views`` table (mirroring the per-user ``run_attributions`` pattern):
``mark_table_opened`` is an idempotent upsert, ``opened_table_ids_for_user``
reads back the set. The schema gains the table on init — forward-only, safe on an
existing DB (no destructive migration).
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server.auth import store


class TableViewsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_db = self.tmp_path / "state.db"
        self._ctx = patch.object(store, "AUTH_DB_PATH", self.state_db)
        self._ctx.start()
        store.init_store()

    def tearDown(self) -> None:
        self._ctx.stop()
        self.tmp.cleanup()

    def test_mark_table_opened_records_it_for_the_user(self) -> None:
        store.mark_table_opened("u1", "table-abc", "2026-06-26T00:00:00+00:00")
        self.assertEqual(store.opened_table_ids_for_user("u1"), {"table-abc"})

    def test_mark_table_opened_is_idempotent(self) -> None:
        store.mark_table_opened("u1", "table-abc", "2026-06-26T00:00:00+00:00")
        store.mark_table_opened("u1", "table-abc", "2026-06-26T01:00:00+00:00")
        self.assertEqual(store.opened_table_ids_for_user("u1"), {"table-abc"})

    def test_opened_is_per_user_isolated(self) -> None:
        # User A opening a (shared) table must NOT mark it opened for user B —
        # the blue dot is per-user, so B still sees their own unopened state.
        store.mark_table_opened("uA", "table-shared", "2026-06-26T00:00:00+00:00")
        self.assertEqual(store.opened_table_ids_for_user("uA"), {"table-shared"})
        self.assertEqual(store.opened_table_ids_for_user("uB"), set())

    def test_unseen_user_has_empty_opened_set(self) -> None:
        self.assertEqual(store.opened_table_ids_for_user("nobody"), set())


class TableViewsForwardMigrationTests(unittest.TestCase):
    """An existing auth DB created BEFORE table_views existed gains the table on
    the next init_store — forward-only, no destructive migration, no data loss."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_db = self.tmp_path / "state.db"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_existing_db_without_table_views_gains_it_on_init(self) -> None:
        # Seed a pre-table_views auth DB: the prior schema MINUS table_views.
        conn = sqlite3.connect(self.state_db)
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
                CREATE TABLE run_attributions (
                    run_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    audit_id TEXT,
                    request TEXT,
                    filters TEXT,
                    started_at TEXT NOT NULL
                );
                """
            )
            conn.commit()
        finally:
            conn.close()

        with patch.object(store, "AUTH_DB_PATH", self.state_db):
            store.init_store()  # forward-only: should CREATE table_views
            store.mark_table_opened("u1", "table-x", "2026-06-26T00:00:00+00:00")
            self.assertEqual(store.opened_table_ids_for_user("u1"), {"table-x"})


class ThreadViewsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_db = self.tmp_path / "state.db"
        self._ctx = patch.object(store, "AUTH_DB_PATH", self.state_db)
        self._ctx.start()
        store.init_store()

    def tearDown(self) -> None:
        self._ctx.stop()
        self.tmp.cleanup()

    def test_mark_thread_opened_records_the_latest_open_time_for_the_user(self) -> None:
        store.mark_thread_opened("u1", "thread-abc", "2026-06-26T00:00:00+00:00")
        store.mark_thread_opened("u1", "thread-abc", "2026-06-26T01:00:00+00:00")
        self.assertEqual(
            store.thread_opened_at_for_user("u1"),
            {"thread-abc": "2026-06-26T01:00:00+00:00"},
        )

    def test_thread_opened_is_per_user_isolated(self) -> None:
        store.mark_thread_opened("uA", "thread-shared", "2026-06-26T00:00:00+00:00")
        self.assertEqual(
            store.thread_opened_at_for_user("uA"),
            {"thread-shared": "2026-06-26T00:00:00+00:00"},
        )
        self.assertEqual(store.thread_opened_at_for_user("uB"), {})


class ThreadViewsForwardMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.state_db = self.tmp_path / "state.db"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_existing_db_without_thread_views_gains_it_on_init(self) -> None:
        conn = sqlite3.connect(self.state_db)
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
                CREATE TABLE run_attributions (
                    run_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    audit_id TEXT,
                    request TEXT,
                    filters TEXT,
                    started_at TEXT NOT NULL
                );
                """
            )
            conn.commit()
        finally:
            conn.close()

        with patch.object(store, "AUTH_DB_PATH", self.state_db):
            store.init_store()
            store.mark_thread_opened("u1", "thread-x", "2026-06-26T00:00:00+00:00")
            self.assertEqual(
                store.thread_opened_at_for_user("u1"),
                {"thread-x": "2026-06-26T00:00:00+00:00"},
            )


if __name__ == "__main__":
    unittest.main()
