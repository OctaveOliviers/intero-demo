"""#12 — the Tables list must not re-read each ``table.json`` to resolve the
wrapped table-population id.

Before the fix ``GET /api/tables`` read each ``table.json`` once via
``list_summaries`` and AGAIN via ``_table_population_id_for_table`` (plus a third
rewrite on the status-refresh path during active populates). The fix carries the
``table_population_id`` through ``list_summaries`` so the population id is resolved from
the already-loaded summary — one read per table on the resolve path.

Hermetic: the table store is a tmp state DB, the auth catalog is freshly seeded, and both
the spawn seam and the live status read are stubbed so no worker launches.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from core.tables import store as table_store
from server.auth import store as auth_store
from server.routes import tables as tables_route


def _clinician():
    return {"id": "u_clin", "username": "clinician", "role": "clinician"}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class ListReadsEachTableOncePerResolveTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # Deterministic spawn ids — no real worker.
        self._spawn_seq = iter(["run-aaa", "run-bbb", "run-ccc"])
        self._orig_spawn = tables_route._spawn_table_population
        tables_route._spawn_table_population = lambda **kw: next(self._spawn_seq)

        # Stub the live table-population status read so the list refresh is deterministic and
        # never opens a real Store.
        self.result_status_by_id: dict[str, str] = {}
        self._orig_result_status = tables_route._live_table_population_result_status
        tables_route._live_table_population_result_status = lambda run_id, store=None: (
            self.result_status_by_id.get(run_id)
        )

    def tearDown(self) -> None:
        table_store.TABLE_DB_PATH = self._orig_table_db
        tables_route._spawn_table_population = self._orig_spawn
        tables_route._live_table_population_result_status = self._orig_result_status
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _create_body(self, **over):
        base = dict(title="Audit", source_template="cord-ph")
        base.update(over)
        return tables_route.TableCreateRequest(**base)

    def test_paired_lister_carries_table_population_id(self):
        """list_summaries_with_population_id pairs each summary with its wrapped
        population id (read from the same load) so the route need not re-read the
        file to resolve it. The summary dict's wire shape is unchanged."""
        req = _request_for(_clinician())
        t = asyncio.run(tables_route.create_table(self._create_body(), req))
        records = table_store.list_summaries_with_population_id()
        by_id = {
            summary["id"]: (summary, rid, table) for summary, rid, table in records
        }
        summary, rid, table = by_id[t["id"]]
        self.assertEqual(rid, t["table_population_id"])
        self.assertEqual(table["id"], t["id"])
        # The summary itself keeps the exact list-card key set (no population id leaked).
        self.assertNotIn("table_population_id", summary)

    def test_list_reads_each_table_once_when_no_status_change(self):
        """When no live status differs from disk, the list resolves the population id
        from the loaded summary — exactly ONE load_table per table, no per-table
        re-read (the bug read each file twice)."""
        req = _request_for(_clinician())
        ids = [
            asyncio.run(tables_route.create_table(self._create_body(), req))["id"],
            asyncio.run(tables_route.create_table(self._create_body(title="Two"), req))[
                "id"
            ],
        ]
        # Live status equals the persisted in_progress ⇒ no _persist_status rewrite.
        self.result_status_by_id = {"run-aaa": "in_progress", "run-bbb": "in_progress"}

        reads: list[str] = []
        orig_load = table_store.load_table

        def counting_load(table_id, *, db_path=None):
            reads.append(table_id)
            return orig_load(table_id, db_path=db_path)

        table_store.load_table = counting_load
        try:
            summaries = asyncio.run(tables_route.list_tables(req))
        finally:
            table_store.load_table = orig_load

        # The list never re-loads a table one-by-one: the summaries and the
        # population ids come from ONE row scan (zero per-table load_table
        # calls) — the #12 regression (a second read per table) stays dead.
        for tid in ids:
            self.assertEqual(
                reads.count(tid), 0, f"table {tid} was read {reads.count(tid)}x"
            )
        # Behavioral equivalence: the list still returns both tables with status.
        got = {s.id: s.status for s in summaries}
        self.assertEqual(got[ids[0]], "in_progress")
        self.assertEqual(got[ids[1]], "in_progress")

    def test_list_status_refresh_still_works(self):
        """Behavioral equivalence: when a table population has progressed past the
        persisted status, the list still reports the live status (and persists
        it), exactly as before the read optimization."""
        req = _request_for(_clinician())
        t = asyncio.run(tables_route.create_table(self._create_body(), req))
        self.assertEqual(t["status"], "in_progress")
        self.result_status_by_id = {"run-aaa": "complete"}
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].status, "complete")
        # Persisted so a re-load reflects it.
        reloaded = table_store.load_table(t["id"])
        self.assertEqual(reloaded["status"], "complete")

    def test_list_reads_each_table_once_when_status_changes(self):
        """A live status refresh must not re-read the already loaded table.

        The list path loads each table once to build the summary. If that same
        request also persists a changed live status, it should save the loaded
        table payload instead of loading ``table.json`` again.
        """
        req = _request_for(_clinician())
        ids = [
            asyncio.run(tables_route.create_table(self._create_body(), req))["id"],
            asyncio.run(tables_route.create_table(self._create_body(title="Two"), req))[
                "id"
            ],
        ]
        self.result_status_by_id = {"run-aaa": "complete", "run-bbb": "complete"}

        reads: list[str] = []
        orig_load = table_store.load_table

        def counting_load(table_id, *, db_path=None):
            reads.append(table_id)
            return orig_load(table_id, db_path=db_path)

        table_store.load_table = counting_load
        try:
            summaries = asyncio.run(tables_route.list_tables(req))
        finally:
            table_store.load_table = orig_load

        # Zero per-table loads even when a status refresh persists (the refresh
        # re-saves the already-loaded payload; it never re-reads).
        for tid in ids:
            self.assertEqual(
                reads.count(tid), 0, f"table {tid} was read {reads.count(tid)}x"
            )
        got = {s.id: s.status for s in summaries}
        self.assertEqual(got[ids[0]], "complete")
        self.assertEqual(got[ids[1]], "complete")

    def test_list_leaves_ad_hoc_tables_untouched(self):
        """An ad-hoc table (table_population_id=None) has no live population; the list
        keeps its persisted status and never reads state for it."""
        req = _request_for(_clinician())
        asyncio.run(
            tables_route.create_table(
                self._create_body(source_template="ad-hoc", title="Describe-it"), req
            )
        )
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].status, "queued")


if __name__ == "__main__":
    unittest.main()
