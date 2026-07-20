from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.threads import store as thread_store
from server.auth import service, store
from server.auth.middleware import AuthMiddleware
from server.auth.routes import router as auth_router
from server.routes import sql as sql_route


class ChatCitationEvidenceRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self.databases_dir = self.tmp_path / "databases"
        self.databases_dir.mkdir()
        self.threads_dir = self.tmp_path / "threads"
        self.threads_dir.mkdir()

        self._auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self._legacy_auth_db_patch = patch.object(
            store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db
        )
        self._databases_patch = patch.object(
            sql_route, "DATABASES_DIR", self.databases_dir
        )
        self._threads_patch = patch.object(sql_route, "THREADS_DIR", self.threads_dir)
        self._auth_db_patch.start()
        self._legacy_auth_db_patch.start()
        self._databases_patch.start()
        self._threads_patch.start()
        store.init_store()
        service.register_user("alice", "secret")

        self._seed_database("cord-ph", [("P001", 7.2)])
        self._seed_database("npda-clinical", [("P002", 7.1)])

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(sql_route.router)
        self.client = TestClient(app)
        login = self.client.post(
            "/api/auth/login", json={"username": "alice", "password": "secret"}
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.thread = self._seed_thread()

    def tearDown(self) -> None:
        self._threads_patch.stop()
        self._databases_patch.stop()
        self._legacy_auth_db_patch.stop()
        self._auth_db_patch.stop()
        self.tmp.cleanup()

    def _seed_database(self, slug: str, rows: list[tuple[str, float]]) -> None:
        db_dir = self.databases_dir / slug
        db_dir.mkdir()
        with closing(sqlite3.connect(db_dir / "database.sqlite")) as conn:
            conn.execute("CREATE TABLE patients (patient_code TEXT, ph REAL)")
            conn.executemany("INSERT INTO patients VALUES (?, ?)", rows)
            conn.commit()

    def _seed_thread(self) -> dict:
        thread = thread_store.new_thread()
        thread_store.append_user_message(thread, "Show me the citation")
        thread_store.append_agent_message(
            thread,
            "There is a value [1].",
            resolution={
                "output": "chat",
                "scope": {
                    "kind": "whole_db",
                    "dataset_id": None,
                    "disclosure": "answered across the whole hospital database",
                },
                "artifact_id": None,
                "seam": None,
                "citations": [
                    {
                        "marker": "1",
                        "database": "cord-ph",
                        "query": "SELECT patient_code, ph FROM patients",
                        "table_column": "patients.ph",
                        "explanation": "pH values",
                        "covered_rows": [
                            {
                                "database": "npda-clinical",
                                "query": "SELECT patient_code FROM patients",
                                "table_column": "patients.patient_code",
                                "explanation": "covered sibling row",
                            }
                        ],
                    },
                    {
                        "marker": "2",
                        "database": "cord-ph",
                        "query": 'SELECT patient_code FROM "npda-clinical".patients',
                        "table_column": "patients.patient_code",
                        "explanation": "attached sibling read",
                    },
                    {
                        "marker": "3",
                        "database": "cord-ph",
                        "query": "SELECT name FROM sqlite_master",
                        "table_column": "sqlite_master.name",
                        "explanation": "schema dump should never be evidence",
                    },
                    {
                        "marker": "4",
                        "database": "cord-ph",
                        "query": "SELECT * FROM pragma_table_info('patients')",
                        "table_column": "pragma_table_info.name",
                        "explanation": "table-valued PRAGMA should never be evidence",
                    },
                    {
                        "marker": "5",
                        "database": "cord-ph",
                        "query": "SELECT * FROM pragma_database_list",
                        "table_column": "pragma_database_list.name",
                        "explanation": "bare PRAGMA table should never be evidence",
                    },
                ],
            },
        )
        thread_store.save_thread(thread, threads_dir=self.threads_dir)
        return thread

    def test_chat_citation_evidence_reads_registered_database_slug(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "1",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["rows"], [["P001", 7.2]])

    def test_chat_citation_evidence_can_read_attached_registered_sibling(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "2",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["rows"], [["P002"]])

    def test_chat_citation_evidence_accepts_one_cte_select(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "1",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["rows"], [["P001", 7.2]])

    def test_chat_citation_evidence_rejects_multiple_statements(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "missing",
            },
        )
        self.assertEqual(res.status_code, 404)

    def test_chat_citation_evidence_rejects_raw_query_payload(self) -> None:
        rogue = self.tmp_path / "rogue.sqlite"
        with closing(sqlite3.connect(rogue)) as conn:
            conn.execute("CREATE TABLE secret (value TEXT)")
            conn.execute("INSERT INTO secret VALUES ('nope')")
            conn.commit()
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "database": str(rogue),
                "query": "SELECT value FROM secret",
                "table_column": "secret.value",
            },
        )
        self.assertEqual(res.status_code, 422)

    def test_chat_citation_evidence_rejects_schema_catalog_query(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "3",
            },
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("catalog", res.text.lower())

    def test_chat_citation_evidence_rejects_table_valued_schema_pragma(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "4",
            },
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("catalog", res.text.lower())

    def test_chat_citation_evidence_rejects_bare_schema_pragma_table(self) -> None:
        res = self.client.post(
            "/api/chat/evidence",
            json={
                "thread_id": self.thread["id"],
                "message_index": 1,
                "marker": "5",
            },
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("catalog", res.text.lower())

    def test_generic_sql_reads_registered_database_slug(self) -> None:
        res = self.client.post(
            "/api/sql",
            json={"database": "cord-ph", "query": "SELECT patient_code FROM patients"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["rows"], [["P001"]])

    def test_generic_sql_rejects_path_style_database(self) -> None:
        rogue = self.tmp_path / "rogue.sqlite"
        with closing(sqlite3.connect(rogue)) as conn:
            conn.execute("CREATE TABLE secret (value TEXT)")
            conn.execute("INSERT INTO secret VALUES ('nope')")
            conn.commit()
        res = self.client.post(
            "/api/sql",
            json={"database": str(rogue), "query": "SELECT value FROM secret"},
        )
        self.assertEqual(res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
