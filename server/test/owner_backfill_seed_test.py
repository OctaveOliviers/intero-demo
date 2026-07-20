"""Sharing slice 2 — owner self-grant backfill (§15) + seed a second clinician
(issue #301).

The §10.4 / §15 backfill makes every pre-existing dataset/template/table
reachable by its owner: for each resource WITHOUT an active owner ``manage``
grant, insert one ``manage`` self-grant to its owner. Owner resolution —

- **table** -> the wrapped table population's attributed user
  (``get_run_attribution(table['table_population_id'])['user_id']``); falls back to the
  seed/demo ``admin`` when no run/owner is resolvable.
- **dataset** / **template (audit)** -> the seed/demo ``admin`` (single-tenant
  demo owns everything; no recorded creator on disk).

It is idempotent (a second startup adds no duplicate grants, raises nothing) and
runs at startup AFTER ``seed_default_user`` so the demo ``admin`` id is
resolvable. A second ``clinician``-role account is also seeded so owner ->
colleague sharing is exercisable.

Harness mirrors ``rbac_seeding_test`` / ``clinicians_directory_test``: temp auth
DB + ``init_store()``, plus temp resource dirs passed into the backfill so it
never touches the real ``var/``.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.tables import store as table_store
from server.auth import grants, service, store
from server.auth.middleware import AuthMiddleware
from server.auth.routes import router as auth_router
from server.routes.clinicians import router as clinicians_router


class OwnerBackfillSeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"

        self.auth_db_patch = patch.object(store, "AUTH_DB_PATH", self.auth_db)
        self.auth_db_patch.start()
        self.legacy_auth_db_patch = patch.object(
            store, "LEGACY_AUTH_DB_PATH", self.legacy_auth_db
        )
        self.legacy_auth_db_patch.start()
        store.init_store()

        # Temp resource roots — the backfill enumerates these instead of var/.
        self.datasets_dir = self.tmp_path / "datasets"
        self.audits_dir = self.tmp_path / "audits"
        for d in (self.datasets_dir, self.audits_dir):
            d.mkdir()
        # Tables enumerate from the state store, not a directory.
        self.table_db_patch = patch.object(
            table_store, "TABLE_DB_PATH", self.tmp_path / "table-state.db"
        )
        self.table_db_patch.start()

    def tearDown(self) -> None:
        self.table_db_patch.stop()
        self.auth_db_patch.stop()
        self.legacy_auth_db_patch.stop()
        self.tmp.cleanup()

    # --- helpers -----------------------------------------------------------

    def _seed_admin(self) -> dict:
        """Provision the seed/demo admin like startup does, and return its
        principal dict (id + role) for grant checks."""
        store.seed_default_user()
        admin = store.get_user_by_username("clinician")
        return {"id": admin["id"], "role": service.role_for(admin["id"])}

    def _make_dataset(self, dataset_id: str) -> None:
        d = self.datasets_dir / dataset_id
        d.mkdir()
        (d / "dataset.json").write_text(json.dumps({"id": dataset_id, "name": "DS"}))

    def _make_table(self, table_id: str, table_population_id: str | None) -> None:
        table = table_store.new_table(
            title="T",
            source_template="cord-ph",
            table_population_id=table_population_id,
            status="in_progress" if table_population_id else "queued",
        )
        table["id"] = table_id
        table_store.save_table(table)

    def _backfill(self) -> None:
        grants.backfill_owner_self_grants(
            datasets_dir=self.datasets_dir,
            templates_dir=self.audits_dir,
        )

    # --- tracer bullet: a seeded dataset becomes reachable by the admin ----

    def test_backfill_grants_admin_manage_on_seeded_dataset(self) -> None:
        admin = self._seed_admin()
        self._make_dataset("dataset-abc")

        self.assertFalse(grants.has_resource_access(admin, "dataset", "dataset-abc"))

        self._backfill()

        self.assertTrue(grants.has_resource_access(admin, "dataset", "dataset-abc"))
        self.assertTrue(grants.can_manage_resource(admin, "dataset", "dataset-abc"))

    # --- datasets do NOT use the `_`-draft convention: a `_wip` dir is a real,
    #     listable dataset, so it must get an owner grant (not silently skipped) -

    def test_backfill_grants_admin_manage_on_underscore_dataset(self) -> None:
        admin = self._seed_admin()
        # A normally-named dataset and an `_`-prefixed one both exist on disk and
        # are both listed by the datasets route (which does NOT skip `_`-prefixed,
        # unlike the audits catalog). Both must receive an owner manage grant, so
        # neither is listable-but-unowned (§10.4: nothing the demo owns is unreachable).
        self._make_dataset("dataset-abc")
        self._make_dataset("_wip")

        self._backfill()

        self.assertTrue(grants.can_manage_resource(admin, "dataset", "dataset-abc"))
        self.assertTrue(grants.can_manage_resource(admin, "dataset", "_wip"))

    # --- idempotent: a second run adds no duplicate grant, raises nothing ---

    def _count_manage_grants(self, resource_type: str, resource_id: str) -> int:
        with store._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM resource_grants "
                "WHERE resource_type = ? AND resource_id = ? AND grant_type = 'manage'",
                (resource_type, resource_id),
            ).fetchone()
        return row["n"]

    def test_backfill_is_idempotent(self) -> None:
        self._seed_admin()
        self._make_dataset("dataset-abc")
        self._make_table("table-xyz", table_population_id=None)

        self._backfill()
        self._backfill()  # second startup — must add nothing, raise nothing

        self.assertEqual(self._count_manage_grants("dataset", "dataset-abc"), 1)
        self.assertEqual(self._count_manage_grants("table", "table-xyz"), 1)

    # --- a table's owner is its wrapped table population's attributed user --

    def test_table_with_attributed_run_grants_that_user_not_admin(self) -> None:
        admin = self._seed_admin()
        owner = service.register_user("owner", "secret")  # a clinician
        owner_principal = {"id": owner["id"], "role": service.role_for(owner["id"])}

        store.record_run(
            "run-1",
            owner["id"],
            audit_id=None,
            request=None,
            filters=None,
            started_at="2026-06-26T00:00:00+00:00",
        )
        self._make_table("table-owned", table_population_id="run-1")

        self._backfill()

        # The run's attributed user owns the table...
        self.assertTrue(
            grants.can_manage_resource(owner_principal, "table", "table-owned")
        )
        # ...and the demo admin does NOT (peer model, no implicit ownership).
        self.assertFalse(grants.can_manage_resource(admin, "table", "table-owned"))

    # --- a table with no resolvable run owner falls back to the admin -------

    def test_table_without_resolvable_run_owner_falls_back_to_admin(self) -> None:
        admin = self._seed_admin()
        # table_population_id is None (ad-hoc table, never spawned a table population).
        self._make_table("table-orphan", table_population_id=None)
        # table_population_id present but no attribution row exists for it.
        self._make_table("table-dangling", table_population_id="run-missing")

        self._backfill()

        self.assertTrue(grants.can_manage_resource(admin, "table", "table-orphan"))
        self.assertTrue(grants.can_manage_resource(admin, "table", "table-dangling"))

    # --- a template (audit) with no recorded creator -> the admin ----------

    def test_backfill_grants_admin_manage_on_template(self) -> None:
        admin = self._seed_admin()
        (self.audits_dir / "audit-1").mkdir()
        # A draft dir (`_`-prefixed) is NOT a registered resource and is skipped.
        (self.audits_dir / "_draft").mkdir()

        self._backfill()

        self.assertTrue(grants.can_manage_resource(admin, "template", "audit-1"))
        self.assertFalse(grants.can_manage_resource(admin, "template", "_draft"))

    # --- a second clinician account is seeded (peer of the demo admin) ------

    def test_second_clinician_is_seeded_active_and_in_directory(self) -> None:
        admin = self._seed_admin()
        store.seed_second_clinician()

        clinician2 = store.get_user_by_username("clinician2")
        self.assertIsNotNone(clinician2)
        self.assertEqual(service.role_for(clinician2["id"]), "clinician")
        self.assertTrue(bool(clinician2["is_active"]))
        self.assertNotEqual(clinician2["id"], admin["id"])

        # It is in the share-target directory (what GET /api/clinicians reads).
        directory_ids = {c["id"] for c in store.list_clinicians()}
        self.assertIn(clinician2["id"], directory_ids)

    def test_second_clinician_holds_none_of_demos_grants(self) -> None:
        # The demo admin owns a dataset via backfill; the colleague sees nothing
        # until something is shared with them (peer model).
        self._seed_admin()
        self._make_dataset("dataset-abc")
        self._backfill()
        store.seed_second_clinician()

        clinician2 = store.get_user_by_username("clinician2")
        principal = {"id": clinician2["id"], "role": "clinician"}
        self.assertFalse(
            grants.has_resource_access(principal, "dataset", "dataset-abc")
        )
        self.assertEqual(grants.active_grants_for_subject(principal), [])

    def test_second_clinician_seed_is_idempotent(self) -> None:
        self._seed_admin()
        store.seed_second_clinician()
        store.seed_second_clinician()  # second startup — no duplicate, no error

        with store._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM users WHERE username = ?", ("clinician2",)
            ).fetchone()
        self.assertEqual(row["n"], 1)

    # --- the seeded colleague can log in and reach GET /api/clinicians ------

    def test_seeded_clinician_appears_in_clinicians_route(self) -> None:
        self._seed_admin()
        store.seed_second_clinician()

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(auth_router)
        app.include_router(clinicians_router)
        client = TestClient(app)

        res = client.post(
            "/api/auth/login",
            json={"username": "clinician2", "password": "intero"},
        )
        self.assertEqual(res.status_code, 200, res.text)

        res = client.get("/api/clinicians")
        self.assertEqual(res.status_code, 200, res.text)
        usernames = {p["display_name"] for p in res.json()}
        self.assertIn("clinician2", usernames)


if __name__ == "__main__":
    unittest.main()
