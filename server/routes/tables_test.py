"""Auth + round-trip + pin/spawn tests for the /api/tables control-plane.

A table owns one table population; the spawn seam
(``_launch_table_population_session``) is monkeypatched so creating a table records
``table_population_id`` + ``status`` WITHOUT launching the worker or any opencode session (hard
constraint — a test NEVER hits a real LLM / sub-agent). Mirrors datasets_test
(auth helpers) and threads_test (temp auth DB + ``init_store()`` so role
permission checks resolve against a freshly-seeded catalog). The table store points at
a tmp dir so nothing touches the real ``var/tables/``.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.contracts import validate_against_schema
from core.tables import store as table_store
from server.auth import grants
from server.auth import store as auth_store
from server.routes import tables as tables_route


def _clinician():
    # Role rides on the user dict (resolved server-side from users.role_id), never
    # derived from the username — RBAC, ADR 0003.
    return {"id": "u_clin", "username": "clinician", "role": "clinician"}


def _agent():
    return {"id": "u_agent", "username": "agent", "role": "agent"}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


def _request_anon():
    return SimpleNamespace(state=SimpleNamespace(user=None, user_id=None))


class _FakeRun:
    """Minimal stand-in for core.store.Run with just the status field the GET
    detail refresh reads back."""

    def __init__(self, status: str) -> None:
        self.status = status


class TableRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.table_db = self.tmp_path / "table-state.db"

        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.table_db

        # A tmp DATASETS_DIR seeded with the tracked cord-ph Dataset fixture, so a
        # scoped table can load + translate its pinned criteria into filters
        # without touching the mutable real var/datasets/.
        self.datasets_dir = self.tmp_path / "datasets"
        ds_id = "dataset-cordph-term-nicu"
        (self.datasets_dir / ds_id).mkdir(parents=True, exist_ok=True)
        repo_root = Path(__file__).resolve().parents[2]
        fixture = (
            repo_root / "data" / "seed" / "datasets" / ds_id / "dataset.json"
        ).read_text(encoding="utf-8")
        (self.datasets_dir / ds_id / "dataset.json").write_text(fixture)
        self._orig_datasets_dir = tables_route.DATASETS_DIR
        tables_route.DATASETS_DIR = self.datasets_dir

        # A freshly-seeded role catalog (clinician holds table.read/table.manage,
        # agent holds nothing) so _require resolves permissions without make-seed.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # #303: pinning a Dataset onto a table now requires the creator to hold
        # DIRECT read access to that Dataset (else the table→Dataset cascade would
        # escalate table.manage into reading an ungranted cohort). The clinician here
        # legitimately owns the seeded Dataset, so grant them manage on it — the
        # scoped-create tests below assert filter/pin/immutability behavior, not the
        # access gate, so they keep their original meaning with the owner grant.
        grants.self_grant_manage(
            resource_type="dataset", resource_id=ds_id, user_id=_clinician()["id"]
        )

        # Monkeypatch the spawn seam: record the call, hand back a deterministic
        # population id, and NEVER launch the worker / an opencode session.
        self.spawn_calls: list[dict] = []
        self._orig_spawn = tables_route._spawn_table_population

        def fake_spawn(
            *,
            table,
            filters,
            user_id=None,
            artifact_dir=None,
        ):
            # The spawn seam now receives THE TABLE; record the same view the
            # old ingredient-shaped seam exposed so every assertion keeps its
            # meaning (the database still derives from the pinned Dataset).
            self.spawn_calls.append(
                {
                    "audit_id": table.get("source_template"),
                    "database_id": tables_route._scope_from_dataset(
                        table.get("dataset_id")
                    )[0],
                    "filters": filters,
                    "title": table.get("title"),
                    "user_id": user_id,
                    "brief": table.get("brief"),
                }
            )
            return "run-fake-1234"

        tables_route._spawn_table_population = fake_spawn

        # Stub the live table-population status read so GET detail can refresh deterministically.
        self.result_status_by_id: dict[str, str] = {}
        self._orig_result_status = tables_route._live_table_population_result_status

        def fake_live_status(run_id, store=None):
            return self.result_status_by_id.get(run_id)

        tables_route._live_table_population_result_status = fake_live_status

    def tearDown(self) -> None:
        table_store.TABLE_DB_PATH = self._orig_table_db
        tables_route.DATASETS_DIR = self._orig_datasets_dir
        tables_route._spawn_table_population = self._orig_spawn
        tables_route._live_table_population_result_status = self._orig_result_status
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _create_body(self, **over):
        base = dict(title="Term NICU audit", source_template="cord-ph")
        base.update(over)
        return tables_route.TableCreateRequest(**base)

    # --- 401 / 403 ---------------------------------------------------------

    def test_anonymous_user_is_rejected_401(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.list_tables(_request_anon()))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_agent_role_is_denied_read(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.list_tables(_request_for(_agent())))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("table.read", str(ctx.exception.detail))

    def test_agent_role_is_denied_create(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                tables_route.create_table(self._create_body(), _request_for(_agent()))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("table.manage", str(ctx.exception.detail))

    # --- create (pin + spawn, mocked engine) --------------------------------

    def test_create_template_backed_pins_and_spawns(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        # Spawned table population exactly once with the template as audit_id.
        self.assertEqual(len(self.spawn_calls), 1)
        self.assertEqual(self.spawn_calls[0]["audit_id"], "cord-ph")
        # The table records the population id + status from the spawn.
        self.assertEqual(table["table_population_id"], "run-fake-1234")
        self.assertEqual(table["status"], "in_progress")
        self.assertTrue(table["id"].startswith("table-"))
        # Persisted + schema valid; the pinned spec snapshot was derived.
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])
        self.assertTrue(len(table["spec"]["columns"]) > 0)
        self.assertIn("patient record", table["spec"]["grain"])

    def test_create_ad_hoc_persists_without_spawning(self):
        req = _request_for(_clinician())
        table = asyncio.run(
            tables_route.create_table(
                self._create_body(source_template="ad-hoc", title="Describe-it"), req
            )
        )
        # No worker spawn for an ad-hoc table (population is template-backed only).
        self.assertEqual(self.spawn_calls, [])
        self.assertIsNone(table["table_population_id"])
        self.assertEqual(table["status"], "queued")
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])

    def test_spawn_failure_leaves_no_orphaned_table(self):
        """Issue 8 — if _spawn_table_population raises (worker not ready → 503, mkdir
        collision, population error), the persisted table must be ROLLED BACK so no
        orphaned 'queued'/table_population_id=None table is left stuck. The error still
        propagates; the spawn never succeeded, so there is no live work to orphan."""

        def boom(**kw):
            raise HTTPException(
                status_code=503, detail="Table population worker is not ready."
            )

        tables_route._spawn_table_population = boom
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.create_table(self._create_body(), req))
        self.assertEqual(ctx.exception.status_code, 503)
        # No orphaned table is left on disk: the list is empty after the failure.
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries, [])

    def test_create_records_thread_provenance(self):
        req = _request_for(_clinician())
        table = asyncio.run(
            tables_route.create_table(self._create_body(thread_id="thread-abc"), req)
        )
        self.assertEqual(table["thread_id"], "thread-abc")

    def test_spawned_population_is_attributed_to_the_creator(self):
        """The blocker regression: spawned table population must be attributed to
        the creating user — both stamped on the durable state row
        (``_launch_table_population_session`` user_id, so the population is owned
        and the clinician can edit its cells) and recorded in the per-user history
        (``record_run``). Exercises the REAL ``_spawn_table_population`` while
        stubbing only the worker entry point + the attribution store."""
        # Un-stub the spawn so the real attribution wiring runs; redirect ARTIFACTS_DIR
        # so the directory mkdir is hermetic.
        tables_route._spawn_table_population = self._orig_spawn
        runs_dir = self.tmp_path / "runs"
        runs_dir.mkdir()
        orig_runs_dir = tables_route.ARTIFACTS_DIR
        tables_route.ARTIFACTS_DIR = runs_dir

        launch_calls: list[dict] = []
        record_calls: list[dict] = []
        orig_launch = (
            tables_route.table_populations_route._launch_table_population_session
        )
        orig_record = tables_route.auth_store.record_run

        def fake_launch(run_id, run_dir, table, *, user_id=None, **kw):
            launch_calls.append(
                {
                    "run_id": run_id,
                    "audit_id": table.get("source_template"),
                    "user_id": user_id,
                }
            )

        def fake_record(run_id, user_id, audit_id, request_text, filters, ts):
            record_calls.append(
                {"run_id": run_id, "user_id": user_id, "audit_id": audit_id}
            )

        tables_route.table_populations_route._launch_table_population_session = (
            fake_launch
        )
        tables_route.auth_store.record_run = fake_record
        try:
            req = _request_for(_clinician())
            table = asyncio.run(tables_route.create_table(self._create_body(), req))
        finally:
            tables_route.ARTIFACTS_DIR = orig_runs_dir
            tables_route.table_populations_route._launch_table_population_session = (
                orig_launch
            )
            tables_route.auth_store.record_run = orig_record

        # The population is stamped with the creator's id (owned → editable).
        self.assertEqual(len(launch_calls), 1)
        self.assertEqual(launch_calls[0]["user_id"], "u_clin")
        self.assertEqual(launch_calls[0]["audit_id"], "cord-ph")
        # And recorded in the per-user history.
        self.assertEqual(len(record_calls), 1)
        self.assertEqual(record_calls[0]["user_id"], "u_clin")
        self.assertEqual(table["table_population_id"], launch_calls[0]["run_id"])

    # --- scope binds to the table (decision 0004) ---------------------------

    def test_scoped_table_spawns_with_translated_dataset_filters(self):
        """A table pinned to a named Dataset spawns table population BOUNDED to that hard
        cohort: the Dataset's grounded criteria ({gestation_weeks >= 39,
        admitted_to_nicu = yes}) are translated into the table-population filters dict
        — NOT the empty {} Issue 2 left (which was the whole DB). The pinned
        database also rides through from the Dataset."""
        req = _request_for(_clinician())
        table = asyncio.run(
            tables_route.create_table(
                self._create_body(dataset_id="dataset-cordph-term-nicu"), req
            )
        )
        self.assertEqual(len(self.spawn_calls), 1)
        # Bounded to the pinned cohort — the translated, non-empty filters.
        self.assertEqual(
            self.spawn_calls[0]["filters"],
            {"gestation_weeks": ">=39", "admitted_to_nicu": "yes"},
        )
        # The pinned database came from the Dataset.
        self.assertEqual(self.spawn_calls[0]["database_id"], "cord-ph")
        # The dataset_id is pinned on the table for life (immutability provenance).
        self.assertEqual(table["dataset_id"], "dataset-cordph-term-nicu")

    def test_whole_db_table_spawns_with_empty_filters(self):
        """A whole-DB table (dataset_id=None) is an empty-but-valid scope (0004):
        it spawns with filters={} (unchanged) — no cohort injected."""
        req = _request_for(_clinician())
        asyncio.run(tables_route.create_table(self._create_body(dataset_id=None), req))
        self.assertEqual(len(self.spawn_calls), 1)
        self.assertEqual(self.spawn_calls[0]["filters"], {})

    def test_unfaithfully_scopeable_dataset_fails_closed_422(self):
        """FAIL-CLOSED (0004): a Dataset criterion the filter format cannot encode
        EXACTLY (here a category '=' value containing a comma, which the parser would
        split into OR'd values — a broader cohort) must NOT spawn a silently-wrong
        table. The translator raises and the spawn surfaces a 422 — no population starts."""
        import json as _json

        bad_id = "dataset-bad-scope"
        (self.datasets_dir / bad_id).mkdir(parents=True, exist_ok=True)
        (self.datasets_dir / bad_id / "dataset.json").write_text(
            _json.dumps(
                {
                    "schema_version": "1",
                    "id": bad_id,
                    "name": "Bad scope",
                    "databases": ["cord-ph"],
                    "cohort": {
                        "database": "cord-ph",
                        "from": "x",
                        "identity_select": "x",
                    },
                    "criteria": [
                        {
                            "criterion_id": "delivery",
                            "label": "Delivery",
                            "type": "category",
                            "source": "cord-ph -> t.c",
                            "predicate": {"op": "=", "value": "caesarean,forceps"},
                        }
                    ],
                }
            )
        )
        # The creator owns this Dataset (direct grant), so #303's dataset-read gate
        # passes and the assertion reaches the 422 scope-faithfulness failure it is
        # actually about (not the 403 access gate, which a separate test covers).
        grants.self_grant_manage(
            resource_type="dataset", resource_id=bad_id, user_id=_clinician()["id"]
        )
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                tables_route.create_table(self._create_body(dataset_id=bad_id), req)
            )
        self.assertEqual(ctx.exception.status_code, 422)
        # Fail-closed: NO population was spawned for the unfaithfully-scopeable table.
        self.assertEqual(self.spawn_calls, [])

    def test_pinned_dataset_that_cannot_load_fails_closed_422(self):
        """Issue 2 — a pinned Dataset whose dataset.json is unreadable/corrupt must
        FAIL CLOSED (422), never fall back to filters={} (the whole DB) under a
        narrow-cohort label. Mirrors the criterion-encoding path: a Dataset that
        cannot be honoured as the pinned hard cohort does not silently widen."""
        corrupt_id = "dataset-corrupt"
        (self.datasets_dir / corrupt_id).mkdir(parents=True, exist_ok=True)
        # Valid path, invalid JSON ⇒ load_dataset raises DatasetError.
        (self.datasets_dir / corrupt_id / "dataset.json").write_text("{ not json")
        # The creator owns this Dataset id, so the dataset-read gate passes and
        # the assertion reaches the corrupt-json 422 path this test covers.
        grants.self_grant_manage(
            resource_type="dataset",
            resource_id=corrupt_id,
            user_id=_clinician()["id"],
        )
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                tables_route.create_table(self._create_body(dataset_id=corrupt_id), req)
            )
        self.assertEqual(ctx.exception.status_code, 422)
        # Fail-closed: NO population was spawned with a silently-broader cohort.
        self.assertEqual(self.spawn_calls, [])

    def test_a_different_cohort_yields_a_new_table_id(self):
        """Scope is fixed for life (0004): asking for a different cohort is
        structurally a NEW table — there is no scope-edit path, so two creates with
        different dataset_ids mint two distinct table ids, each with its own population."""
        req = _request_for(_clinician())
        scoped = asyncio.run(
            tables_route.create_table(
                self._create_body(dataset_id="dataset-cordph-term-nicu"), req
            )
        )
        whole_db = asyncio.run(
            tables_route.create_table(self._create_body(dataset_id=None), req)
        )
        self.assertNotEqual(scoped["id"], whole_db["id"])
        self.assertEqual(scoped["dataset_id"], "dataset-cordph-term-nicu")
        self.assertIsNone(whole_db["dataset_id"])

    def test_rename_route_never_mutates_a_persisted_tables_scope(self):
        """Scope immutability guard (0004): the only write path on a persisted
        table is a TITLE rename — it must never touch the pinned dataset_id. Rename
        a scoped table and assert its dataset_id (and population binding) is unchanged."""
        req = _request_for(_clinician())
        scoped = asyncio.run(
            tables_route.create_table(
                self._create_body(dataset_id="dataset-cordph-term-nicu"), req
            )
        )
        body = tables_route.TableRenameRequest(title="A new title")
        renamed = asyncio.run(tables_route.rename_table(scoped["id"], body, req))
        self.assertEqual(renamed["title"], "A new title")
        self.assertEqual(renamed["dataset_id"], "dataset-cordph-term-nicu")
        self.assertEqual(renamed["table_population_id"], scoped["table_population_id"])

    # --- rename -------------------------------------------------------------

    def test_rename_updates_and_persists_the_title(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        body = tables_route.TableRenameRequest(title="Renamed audit")
        renamed = asyncio.run(tables_route.rename_table(table["id"], body, req))
        self.assertEqual(renamed["title"], "Renamed audit")
        # Persisted: a fresh load reads the new title back, surviving reload.
        reloaded = asyncio.run(tables_route.get_table(table["id"], req))
        self.assertEqual(reloaded["title"], "Renamed audit")
        # Validity preserved and updated_at bumped.
        self.assertEqual(validate_against_schema(renamed, "table.schema.json"), [])
        self.assertGreaterEqual(renamed["updated_at"], table["updated_at"])

    def test_rename_missing_table_is_404(self):
        req = _request_for(_clinician())
        body = tables_route.TableRenameRequest(title="x")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.rename_table("table-nope", body, req))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Table not found.")

    def test_rename_requires_manage_permission(self):
        table = asyncio.run(
            tables_route.create_table(self._create_body(), _request_for(_clinician()))
        )
        body = tables_route.TableRenameRequest(title="x")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                tables_route.rename_table(table["id"], body, _request_for(_agent()))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("table.manage", str(ctx.exception.detail))

    def test_rename_blank_title_is_422(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        body = tables_route.TableRenameRequest(title="   ")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.rename_table(table["id"], body, req))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_rename_traversal_id_is_refused_404(self):
        req = _request_for(_clinician())
        body = tables_route.TableRenameRequest(title="x")
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(tables_route.rename_table(bad, body, req))
            self.assertEqual(ctx.exception.status_code, 404)

    # --- get detail (status refreshed from table-population state) ----------

    def test_get_detail_refreshes_status_from_live_population(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        # The table population has since progressed.
        self.result_status_by_id["run-fake-1234"] = "complete"
        got = asyncio.run(tables_route.get_table(table["id"], req))
        self.assertEqual(got["status"], "complete")
        # The refresh is persisted so a re-list reflects it too.
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].status, "complete")

    def test_status_refresh_on_read_does_not_bump_updated_at(self):
        """Issue 3 — a status refresh on READ (GET detail) persists the new status
        WITHOUT touching updated_at: recency reflects user edits/creation, not
        passive status drift driven by who viewed the table when."""
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        created_updated_at = table["updated_at"]
        # The table population progressed; a GET refreshes + persists the new status.
        self.result_status_by_id["run-fake-1234"] = "complete"
        got = asyncio.run(tables_route.get_table(table["id"], req))
        self.assertEqual(got["status"], "complete")
        # Status changed and was persisted, but updated_at is unchanged.
        self.assertEqual(got["updated_at"], created_updated_at)
        reloaded = asyncio.run(tables_route.get_table(table["id"], req))
        self.assertEqual(reloaded["status"], "complete")
        self.assertEqual(reloaded["updated_at"], created_updated_at)

    def test_read_status_drift_does_not_reorder_the_list(self):
        """Issue 3 — viewing/listing an OLD table whose population has since completed must
        NOT jump it to the top of the sidebar. A passive status refresh keeps the
        recency order stable; only user edits/creation move a table."""
        req = _request_for(_clinician())
        first = asyncio.run(tables_route.create_table(self._create_body(), req))
        # Give the first table a distinct, still-running table population id.
        tables_route._spawn_table_population = lambda **kw: "run-fake-5678"
        second = asyncio.run(
            tables_route.create_table(self._create_body(title="Second"), req)
        )
        # Force a deterministic recency order: `first` is OLDER than `second`.
        data = table_store.load_table(first["id"])
        data["updated_at"] = "2026-01-01T00:00:00+00:00"
        table_store.save_table(data)
        # The OLD table's population has since completed — a list read refreshes its status.
        self.result_status_by_id["run-fake-1234"] = "complete"
        self.result_status_by_id["run-fake-5678"] = "in_progress"
        summaries = asyncio.run(tables_route.list_tables(req))
        # Order is unchanged by the passive refresh: `second` (newer) stays on top.
        self.assertEqual(summaries[0].id, second["id"])
        self.assertEqual(summaries[1].id, first["id"])
        # And the refreshed status was still reported.
        by_id = {s.id: s.status for s in summaries}
        self.assertEqual(by_id[first["id"]], "complete")

    def test_get_missing_table_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table("table-nope", req))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Table not found.")

    # --- list (recency) -----------------------------------------------------

    def test_list_refreshes_status_from_live_population(self):
        """The sidebar dot must be honest WITHOUT opening each table: list_tables
        reports each table's CURRENT result status, refreshed from table-population state (like
        get_table), not the stale persisted label. Here the table was persisted
        in_progress but its table population has since finished — the list reports the
        live 'complete'."""
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        self.assertEqual(table["status"], "in_progress")
        # The table population finished after the table was persisted in_progress.
        self.result_status_by_id["run-fake-1234"] = "complete"
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].status, "complete")

    def test_list_does_not_refresh_ad_hoc_tables(self):
        """An ad-hoc table has no table population (table_population_id=None); the list leaves its
        persisted status untouched (no live population to read)."""
        req = _request_for(_clinician())
        asyncio.run(
            tables_route.create_table(
                self._create_body(source_template="ad-hoc", title="Describe-it"), req
            )
        )
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].status, "queued")

    def test_list_refreshes_each_population_once_no_duplicate_store_reads(self):
        """Efficiency: the list refreshes each table population from a SINGLE batched
        status lookup — it never opens a fresh Store per table. Proven by counting
        the result-status reads for a two-table list (one per distinct population, not more)."""
        req = _request_for(_clinician())
        t1 = asyncio.run(tables_route.create_table(self._create_body(), req))
        # Give the second table a distinct population id so two rows are queried.
        tables_route._spawn_table_population = lambda **kw: "run-fake-5678"
        t2 = asyncio.run(
            tables_route.create_table(self._create_body(title="Second"), req)
        )
        self.assertNotEqual(t1["table_population_id"], t2["table_population_id"])
        self.result_status_by_id["run-fake-1234"] = "complete"
        self.result_status_by_id["run-fake-5678"] = "in_progress"

        reads: list[str] = []
        orig = tables_route._live_table_population_result_status

        def counting_status(run_id, store=None):
            reads.append(run_id)
            return orig(run_id, store=store)

        tables_route._live_table_population_result_status = counting_status
        try:
            summaries = asyncio.run(tables_route.list_tables(req))
        finally:
            tables_route._live_table_population_result_status = orig
        # Exactly one read per distinct table population — no per-table re-reads.
        self.assertEqual(sorted(reads), ["run-fake-1234", "run-fake-5678"])
        by_id = {s.id: s.status for s in summaries}
        self.assertEqual(by_id[t1["id"]], "complete")
        self.assertEqual(by_id[t2["id"]], "in_progress")

    def test_list_is_recency_ordered(self):
        req = _request_for(_clinician())
        first = asyncio.run(tables_route.create_table(self._create_body(), req))
        second = asyncio.run(
            tables_route.create_table(self._create_body(title="Second"), req)
        )
        # Force a deterministic recency order in the store.
        data = table_store.load_table(first["id"])
        data["updated_at"] = "2026-01-01T00:00:00+00:00"
        table_store.save_table(data)
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertEqual(summaries[0].id, second["id"])
        self.assertEqual(summaries[1].id, first["id"])

    # --- open (per-user 'seen') ---------------------------------------------

    def test_open_marks_the_table_opened_for_the_current_user(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        # Before opening, the list reports the table as NOT opened by this user.
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertFalse(summaries[0].opened)
        # Opening the full grid marks it opened (204) and the list now says so.
        resp = asyncio.run(tables_route.open_table(table["id"], req))
        self.assertEqual(resp.status_code, 204)
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertTrue(summaries[0].opened)

    def test_open_is_per_user_isolated(self):
        """User A opening a shared table does NOT set opened for user B — the
        blue dot is per-user, so B still sees the table as unopened."""
        a = {"id": "u_a", "username": "a", "role": "clinician"}
        b = {"id": "u_b", "username": "b", "role": "clinician"}
        table = asyncio.run(
            tables_route.create_table(self._create_body(), _request_for(a))
        )
        # B must hold a grant to SEE the shared table at all (#298 owner-or-grant
        # scoping); the per-user "opened" flag is then tested on top of that.
        from server.auth import grants as grants_store

        grants_store.create_grant(
            subject_type="user",
            subject_id="u_b",
            resource_type="table",
            resource_id=table["id"],
            grant_type="read",
            granted_by="u_a",
        )
        asyncio.run(tables_route.open_table(table["id"], _request_for(a)))
        a_list = asyncio.run(tables_route.list_tables(_request_for(a)))
        b_list = asyncio.run(tables_route.list_tables(_request_for(b)))
        self.assertTrue(a_list[0].opened)
        self.assertFalse(b_list[0].opened)

    def test_open_missing_table_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.open_table("table-nope", req))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Table not found.")

    def test_open_requires_read_permission(self):
        # Viewing requires table.read; the zero-permission agent is denied 403.
        table = asyncio.run(
            tables_route.create_table(self._create_body(), _request_for(_clinician()))
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.open_table(table["id"], _request_for(_agent())))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("table.read", str(ctx.exception.detail))

    def test_open_is_idempotent(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        asyncio.run(tables_route.open_table(table["id"], req))
        asyncio.run(tables_route.open_table(table["id"], req))
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertTrue(summaries[0].opened)

    def test_open_traversal_id_is_refused_404(self):
        req = _request_for(_clinician())
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(tables_route.open_table(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)

    def test_list_reports_opened_false_by_default(self):
        req = _request_for(_clinician())
        asyncio.run(tables_route.create_table(self._create_body(), req))
        summaries = asyncio.run(tables_route.list_tables(req))
        self.assertIn("opened", summaries[0].model_dump())
        self.assertFalse(summaries[0].opened)

    # --- delete -------------------------------------------------------------

    def test_delete_removes_the_table_dir(self):
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        resp = asyncio.run(tables_route.delete_table(table["id"], req))
        self.assertEqual(resp.status_code, 204)
        with self.assertRaises(table_store.TableError):
            table_store.load_table(table["id"])

    def test_delete_stops_table_population_and_drops_attribution(self):
        """Issue 4 — deleting a still-populating table must STOP the table population (so
        the background task stops writing cells to state.db) and drop its
        attribution history row, exactly like DELETE /api/table-populations.
        Otherwise live population leaks and the attribution row dangles in the
        sidebar history."""
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        table_population_id = table["table_population_id"]
        # The population was attributed to the creator (per-user history row).
        auth_store.record_run(
            table_population_id,
            "u_clin",
            "cord-ph",
            table["title"],
            {},
            "2026-06-27T00:00:00+00:00",
        )
        self.assertIsNotNone(auth_store.get_run_attribution(table_population_id))

        # Capture the stop call without launching/touching the worker.
        stop_calls: list[dict] = []
        orig_stop = tables_route.table_populations_route._stop_table_population_internal

        async def fake_stop(tpid, *, finalize=True):
            stop_calls.append({"table_population_id": tpid, "finalize": finalize})
            return True

        tables_route.table_populations_route._stop_table_population_internal = fake_stop
        try:
            resp = asyncio.run(tables_route.delete_table(table["id"], req))
        finally:
            tables_route.table_populations_route._stop_table_population_internal = (
                orig_stop
            )

        self.assertEqual(resp.status_code, 204)
        # The table population was hard-stopped (finalize=False), exactly once.
        self.assertEqual(len(stop_calls), 1)
        self.assertEqual(stop_calls[0]["table_population_id"], table_population_id)
        self.assertFalse(stop_calls[0]["finalize"])
        # The dir is gone, and the attribution row was dropped.
        with self.assertRaises(table_store.TableError):
            table_store.load_table(table["id"])
        self.assertIsNone(auth_store.get_run_attribution(table_population_id))

    def test_delete_removes_orphaned_per_user_table_views(self):
        """Issue 4 — deleting a table must also drop the PER-USER ``table_views``
        ('seen') rows, so a deleted table id leaves no orphaned 'opened' fact behind
        (it would otherwise dangle forever, keyed on a table that no longer exists)."""
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        table_id = table["id"]
        # Two users have opened this table's full grid (per-user 'seen' rows).
        auth_store.mark_table_opened("u_clin", table_id, "2026-06-27T00:00:00+00:00")
        auth_store.mark_table_opened("u_other", table_id, "2026-06-27T00:00:00+00:00")
        self.assertIn(table_id, auth_store.opened_table_ids_for_user("u_clin"))
        self.assertIn(table_id, auth_store.opened_table_ids_for_user("u_other"))

        # Don't launch/touch the worker on stop.
        orig_stop = tables_route.table_populations_route._stop_table_population_internal

        async def fake_stop(tpid, *, finalize=True):
            return True

        tables_route.table_populations_route._stop_table_population_internal = fake_stop
        try:
            asyncio.run(tables_route.delete_table(table_id, req))
        finally:
            tables_route.table_populations_route._stop_table_population_internal = (
                orig_stop
            )

        # Both users' 'seen' rows for the deleted table are gone.
        self.assertNotIn(table_id, auth_store.opened_table_ids_for_user("u_clin"))
        self.assertNotIn(table_id, auth_store.opened_table_ids_for_user("u_other"))

    def test_delete_ad_hoc_table_skips_run_stop(self):
        """An ad-hoc table has no table population (table_population_id=None) — delete
        must not try to stop population, but still removes the dir."""
        req = _request_for(_clinician())
        table = asyncio.run(
            tables_route.create_table(
                self._create_body(source_template="ad-hoc", title="Describe-it"), req
            )
        )

        stop_calls: list[dict] = []
        orig_stop = tables_route.table_populations_route._stop_table_population_internal

        async def fake_stop(tpid, *, finalize=True):
            stop_calls.append({"table_population_id": tpid})
            return True

        tables_route.table_populations_route._stop_table_population_internal = fake_stop
        try:
            asyncio.run(tables_route.delete_table(table["id"], req))
        finally:
            tables_route.table_populations_route._stop_table_population_internal = (
                orig_stop
            )

        # No table population ⇒ no stop attempt; the dir is still removed.
        self.assertEqual(stop_calls, [])
        with self.assertRaises(table_store.TableError):
            table_store.load_table(table["id"])

    def test_delete_missing_table_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.delete_table("table-nope", req))
        self.assertEqual(ctx.exception.status_code, 404)

    # --- path traversal -----------------------------------------------------

    def test_traversal_table_id_is_refused_and_siblings_survive(self):
        victim = self.tmp_path / "victim"
        victim.mkdir()
        req = _request_for(_clinician())
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(tables_route.delete_table(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(tables_route.get_table(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)
        self.assertTrue(victim.exists())

    # --- brief (the pinned delegation instruction) ---------------------------

    def test_table_with_brief_round_trips_through_the_store(self):
        """The Brief — the Table request's recorded user intent — persists as a
        first-class attribute: it passes schema validation on save and survives
        a reload unchanged."""
        table = table_store.new_table(title="Cord pH audit", source_template="ad-hoc")
        table["brief"] = "one row per patient with their cord pH"
        table_store.save_table(table)
        reloaded = table_store.load_table(table["id"])
        self.assertEqual(reloaded["brief"], "one row per patient with their cord pH")
        self.assertEqual(validate_against_schema(reloaded, "table.schema.json"), [])

    def test_table_without_brief_still_validates_and_round_trips(self):
        """``brief`` is OPTIONAL: a table created without one (a direct create,
        or a pre-existing table) validates, persists, and reloads with the field
        simply absent — never an empty string."""
        req = _request_for(_clinician())
        table = asyncio.run(tables_route.create_table(self._create_body(), req))
        self.assertNotIn("brief", table)
        self.assertEqual(validate_against_schema(table, "table.schema.json"), [])
        reloaded = asyncio.run(tables_route.get_table(table["id"], req))
        self.assertNotIn("brief", reloaded)
        self.assertEqual(validate_against_schema(reloaded, "table.schema.json"), [])


class InPlaceIterationPreservesReviewedCellsTest(unittest.TestCase):
    """In-place iteration over the SAME table never overwrites a reviewed /
    corrected cell (decision 0004 — a table iterates in place). ``_prepare_refresh_delta``
    reopens ONLY ``blocked`` cells to ``pending`` (``if cell.state != "blocked": continue``),
    so a filled cell carrying a clinician's review survives a re-run. Exercised
    through the public Store interface."""

    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._dir.name) / "state.db"

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_rerun_preserves_reviewed_cell_and_reopens_blocked(self) -> None:
        from core.store import Cell, Run, RunExecution, RunMember, Store
        from server.routes.table_populations import _prepare_refresh_delta

        store = Store(self.db_path)
        try:
            store.create_run(
                Run(
                    id="run_t",
                    audit_id="cord-ph",
                    database_ids=["cord-ph"],
                    status="in_progress",
                    prompt_versions={},
                    filters=[],
                    parameters={},
                )
            )
            store.create_execution(RunExecution(id="exec_2", run_id="run_t"))
            # A reviewed + corrected filled cell (a clinician's verdict) and a
            # blocked cell, each on its own cohort member.
            store.upsert_cell(
                Cell(
                    run_id="run_t",
                    ref="Cases!B2",
                    kind="interpret",
                    member="m1",
                    state="filled",
                    value="Yes",
                    review_state="reviewed",
                    corrected=True,
                    sources=[
                        {
                            "database": "cord-ph",
                            "query": "SELECT patient_code, note FROM notes",
                            "table_column": "notes.note",
                        }
                    ],
                )
            )
            store.upsert_cell(
                Cell(
                    run_id="run_t",
                    ref="Cases!B3",
                    kind="direct",
                    member="m2",
                    state="blocked",
                    reason_code="IDENTITY_UNRESOLVED",
                    reason_detail="join key missing",
                )
            )
            for member, row in (("m1", 0), ("m2", 1)):
                store.upsert_run_member(
                    RunMember(run_id="run_t", member=member, row_index=row)
                )

            # Re-run over the SAME cohort, no new columns (regions empty).
            _prepare_refresh_delta(
                store,
                table_population_id="run_t",
                execution_id="exec_2",
                executable={"regions": [], "first_data_row": 2},
                cohort=["m1", "m2"],
            )

            cells = {c.ref: c for c in store.get_cells("run_t")}
            # The reviewed/corrected cell is untouched.
            reviewed = cells["Cases!B2"]
            self.assertEqual(reviewed.state, "filled")
            self.assertEqual(reviewed.value, "Yes")
            self.assertEqual(reviewed.review_state, "reviewed")
            self.assertTrue(reviewed.corrected)
            # The blocked cell reopened to pending, its stale value cleared.
            blocked = cells["Cases!B3"]
            self.assertEqual(blocked.state, "pending")
            self.assertIsNone(blocked.value)
        finally:
            store.close()


class TableMiddleware401Test(unittest.TestCase):
    """The middleware 401s an anonymous /api/tables request for free — proved
    end-to-end through a TestClient (mirrors datasets_test / threads_test)."""

    def test_unauthenticated_list_tables_returns_401(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from server.auth.middleware import AuthMiddleware

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(tables_route.router)
        client = TestClient(app)

        res = client.get("/api/tables")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")


if __name__ == "__main__":
    unittest.main()
