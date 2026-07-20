"""The table→Dataset access-only cascade + threads-not-grantable (#303),
exercised through the public route handlers.

§10 / contract §5: granting `read`/`run` on a populated table CASCADES
access-only `read` on the table's pinned Dataset — a DERIVED check (no stored
dataset grant), so the grantee can resolve/see the cohort but the Dataset is NOT
added to their library (it must not appear in their `GET /api/datasets` list),
and revoking the table grant fail-closes the cascade automatically.

Mirrors ``datasets_sharing_test.py`` / ``tables_sharing_test.py``: a tmp
``DATASETS_DIR`` + ``TABLES_DIR``, a tmp ``AUTH_DB_PATH`` seeded via
``init_store()``, and the routes driven directly with a ``SimpleNamespace``
request carrying ``state.user``. The table spawn seam is stubbed so creating a
table never launches a run.
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.config import DATABASES_DIR, ROOT
from server.auth import grants
from server.auth import store as auth_store
from server.routes import datasets as datasets_route
from server.routes import grants as grants_route
from core.tables import store as table_store
from server.routes import tables as tables_route

SEED_DATASET = ROOT / "data" / "seed" / "datasets" / "dataset-cordph-term-nicu"


def _user(uid: str, role: str = "clinician"):
    return {"id": uid, "username": uid, "role": role}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class TableToDatasetCascadeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)

        # A tmp DATASETS_DIR seeded with the real cord-pH Dataset fixture, owned
        # by NO ONE here (no backfill), so reachability comes only from grants.
        self.datasets_dir = self.tmp_path / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(SEED_DATASET, self.datasets_dir / SEED_DATASET.name)
        self.seed_dataset_id = SEED_DATASET.name
        self._orig_datasets_dir = datasets_route.DATASETS_DIR
        datasets_route.DATASETS_DIR = self.datasets_dir
        self._orig_tables_datasets_dir = tables_route.DATASETS_DIR
        tables_route.DATASETS_DIR = self.datasets_dir

        # Real cord-pH fixtures back the read-only COUNT.
        self._orig_databases_dir = datasets_route.DATABASES_DIR
        datasets_route.DATABASES_DIR = DATABASES_DIR

        # A tmp table store; the cascade helper resolves a table's pinned
        # dataset_id from its state-store row.
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

        # Freshly-seeded role catalog + the resource_grants table.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()
        for uid in ("u_owner", "u_b", "u_c", "u_attacker"):
            self._register_clinician(uid)

        # `u_owner` OWNS the seeded Dataset (a `manage` self-grant), so they may
        # legitimately pin it onto a table — #303 fail-closes table creation behind
        # the SAME dataset read-access gate as GET, so only a user already allowed to
        # see the Dataset can pin/cascade it. The attacker (u_b/u_c) gets no dataset
        # grant, so they cannot pin it.
        grants.self_grant_manage(
            resource_type="dataset", resource_id=self.seed_dataset_id, user_id="u_owner"
        )

        # Stub the engine spawn so creating a table never launches a run.
        self._orig_spawn = tables_route._spawn_table_population
        tables_route._spawn_table_population = lambda **kw: "run-fake-1234"
        self._orig_result_status = tables_route._live_table_population_result_status
        tables_route._live_table_population_result_status = (
            lambda table_population_id, store=None: "complete"
        )

    def tearDown(self) -> None:
        datasets_route.DATASETS_DIR = self._orig_datasets_dir
        tables_route.DATASETS_DIR = self._orig_tables_datasets_dir
        datasets_route.DATABASES_DIR = self._orig_databases_dir
        table_store.TABLE_DB_PATH = self._orig_table_db
        tables_route._spawn_table_population = self._orig_spawn
        tables_route._live_table_population_result_status = self._orig_result_status
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _register_clinician(self, uid: str) -> None:
        auth_store.create_user(uid, uid, "hash", "salt", "2026-01-01T00:00:00+00:00")
        auth_store.set_user_role(uid, auth_store.get_role_id("clinician"))

    def _create_table(self, owner, *, dataset_id, title="Term NICU audit"):
        body = tables_route.TableCreateRequest(
            title=title, source_template="cord-ph", dataset_id=dataset_id
        )
        return asyncio.run(tables_route.create_table(body, _request_for(owner)))

    def _grant_table(self, owner, *, to, table_id, grant_type="read"):
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table_id,
            subject_id=to,
            grant_type=grant_type,
        )
        return asyncio.run(grants_route.create_grant(body, _request_for(owner)))

    # --- TDD 1: owner shares a populated, dataset-scoped table → B reads the ----
    # ---        table's pinned Dataset (sees the cohort) -----------------------

    def test_table_grantee_can_read_pinned_dataset(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        self.assertEqual(table["dataset_id"], self.seed_dataset_id)
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # B holds NO direct dataset grant, only the table grant — but the cascade
        # opens read on the table's pinned Dataset.
        got = asyncio.run(
            datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee))
        )
        self.assertEqual(got["id"], self.seed_dataset_id)

    # --- TDD 2: the cascaded Dataset is access-only — NOT in B's library -------

    def test_cascaded_dataset_absent_from_grantee_list(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # B can GET the dataset detail (cascade) but it must NOT appear in the
        # library list (access-only — list is direct-grant only, §10).
        summaries = asyncio.run(datasets_route.list_datasets(_request_for(bee)))
        self.assertNotIn(self.seed_dataset_id, [s.id for s in summaries])

    # --- TDD 3: a run-grant on the table cascades the same as read ------------

    def test_run_grant_on_table_also_cascades_dataset_read(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        self._grant_table(owner, to="u_b", table_id=table["id"], grant_type="run")
        got = asyncio.run(
            datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee))
        )
        self.assertEqual(got["id"], self.seed_dataset_id)

    # --- TDD 4 (issue: whole-DB table): a table with NO dataset_id cascades ----
    # ---        nothing and still shares fine ---------------------------------

    def test_whole_db_table_cascades_nothing_and_shares(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=None, title="Whole-DB audit")
        self.assertIsNone(table["dataset_id"])
        # Sharing the whole-DB table works (no cascade, no error)...
        grant = self._grant_table(owner, to="u_b", table_id=table["id"])
        self.assertEqual(grant["resource_type"], "table")
        # ...and B gets NO cascaded access to the seeded Dataset (the table pins
        # no Dataset, so there is nothing to cascade).
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    # --- TDD 5: revoking the table grant fail-closes the cascade --------------

    def test_revoking_table_grant_fail_closes_cascade(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        grant = self._grant_table(owner, to="u_b", table_id=table["id"])
        # While the table grant is active, the cascade opens the dataset.
        asyncio.run(datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee)))
        # Owner revokes the TABLE grant (no separate dataset grant to clean up).
        resp = asyncio.run(grants_route.delete_grant(grant["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        # B's VERY NEXT dataset GET is 403 — the derived cascade fail-closes.
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    # --- TDD 6: a non-grantee C never gets cascade access ---------------------

    def test_non_grantee_never_gets_cascade(self) -> None:
        owner = _user("u_owner")
        cee = _user("u_c")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        # B holds the table grant (so a real cascade exists); C holds nothing.
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # C holds no grant on the table → no cascade on the dataset (403)...
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(cee))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        # ...and the cascaded Dataset is absent from C's list too.
        summaries = asyncio.run(datasets_route.list_datasets(_request_for(cee)))
        self.assertNotIn(self.seed_dataset_id, [s.id for s in summaries])

    # --- TDD 7: the cascade is READ-ONLY — B cannot PATCH/DELETE the Dataset ---

    def test_cascade_is_read_only_no_patch_or_delete(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # B can read the cascaded Dataset...
        asyncio.run(datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee)))
        # ...but cannot manage it: PATCH is 403 (cascade confers read, never manage).
        body = datasets_route.DatasetPatchRequest(name="Hijacked via cascade")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset(
                    self.seed_dataset_id, body, _request_for(bee)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)
        # ...and DELETE is 403 too; the Dataset survives.
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.delete_dataset(self.seed_dataset_id, _request_for(bee))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue((self.datasets_dir / self.seed_dataset_id).is_dir())

    # --- a whole-DB table grant never cascades "access to None" ---------------

    def test_whole_db_table_grant_does_not_cascade_falsy_dataset(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=None, title="Whole-DB audit")
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # A whole-DB table pins dataset_id=None; the helper must NOT report cascade
        # access for a falsy dataset id (a None==None fail-open hazard).
        self.assertFalse(grants.has_dataset_access_via_table(bee, None))
        self.assertFalse(grants.has_dataset_access_via_table(bee, ""))
        # And it does cascade for B's actual (none-pinned) → there is no dataset to
        # reach, so any real dataset id is also False.
        self.assertFalse(grants.has_dataset_access_via_table(bee, self.seed_dataset_id))

    # --- SECURITY (#303): table-create cannot pin a Dataset you can't read -----
    # ---   else POST /api/tables {dataset_id: <victim>} is a dataset-read PE ----

    def test_create_table_over_unreadable_dataset_is_403_no_cascade(self) -> None:
        # The attacker holds NO grant on the victim-owned seeded Dataset. Pinning it
        # onto a freshly-created table (which self-grants them `manage` on the table)
        # would, via the table→Dataset cascade, open read on the Dataset — a
        # privilege escalation from the baseline `table.manage` permission alone.
        attacker = _user("u_attacker")
        # Pre-condition: the attacker cannot read the Dataset directly.
        with self.assertRaises(HTTPException) as before:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(attacker))
            )
        self.assertEqual(before.exception.status_code, 403)
        # The attack: POST /api/tables pinning the victim's Dataset → 403 at create.
        with self.assertRaises(HTTPException) as ctx:
            self._create_table(attacker, dataset_id=self.seed_dataset_id)
        self.assertEqual(ctx.exception.status_code, 403)
        # No table was created (so no cascade row, no manage self-grant minted).
        self.assertEqual(table_store.list_table_ids(), [])
        # And the cascade is still closed: a subsequent GET is still 403.
        with self.assertRaises(HTTPException) as after:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(attacker))
            )
        self.assertEqual(after.exception.status_code, 403)

    # --- a missing/unknown table grant never crashes the cascade --------------

    def test_unreadable_table_grant_does_not_crash_cascade(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner, dataset_id=self.seed_dataset_id)
        self._grant_table(owner, to="u_b", table_id=table["id"])
        # Delete the table row but leave the (still-active) grant: the cascade
        # must resolve gracefully (no dataset_id resolvable → no cascade).
        table_store.delete_table(table["id"])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.get_dataset(self.seed_dataset_id, _request_for(bee))
            )
        self.assertEqual(ctx.exception.status_code, 403)


class ThreadsNotGrantableTest(unittest.TestCase):
    """§10 / contract §5: ``thread`` and ``project`` are NOT grantable. The
    ``POST /api/grants`` model restricts ``resource_type`` to the three grantable
    values, so a ``thread``/``project`` value is rejected at the model edge with a
    422 (a stricter, equally fail-closed "not grantable" than the issue's 403/404)
    and NO grant row is ever created. Proven end-to-end through a real TestClient
    + auth middleware (an authenticated admin caller), and at the store."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.auth_db = Path(self.tmpdir.name) / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

    def tearDown(self) -> None:
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _client(self):
        from fastapi import FastAPI, Request
        from fastapi.testclient import TestClient

        app = FastAPI()

        # Inject an authenticated clinician so the 422 is the model rejection, not
        # the 401 login gate — proving the not-grantable verdict, not auth. FastAPI
        # validates ``resource_type`` against the model's Literal BEFORE the handler
        # runs, so a non-grantable value is a 422 ahead of any ownership work.
        @app.middleware("http")
        async def _inject_user(request: Request, call_next):
            request.state.user = _user("u_owner")
            request.state.user_id = "u_owner"
            return await call_next(request)

        app.include_router(grants_route.router)
        return TestClient(app, raise_server_exceptions=False)

    def _grant_rows(self, resource_type: str) -> int:
        import sqlite3

        conn = sqlite3.connect(str(self.auth_db))
        try:
            return conn.execute(
                "SELECT COUNT(*) FROM resource_grants WHERE resource_type = ?",
                (resource_type,),
            ).fetchone()[0]
        finally:
            conn.close()

    def test_thread_resource_type_rejected_422_no_row(self) -> None:
        res = self._client().post(
            "/api/grants",
            json={
                "resource_type": "thread",
                "resource_id": "thread-x",
                "subject_id": "u_b",
            },
        )
        self.assertEqual(res.status_code, 422)
        # NO grant row was created for the non-grantable type.
        self.assertEqual(self._grant_rows("thread"), 0)

    def test_project_resource_type_rejected_422_no_row(self) -> None:
        res = self._client().post(
            "/api/grants",
            json={
                "resource_type": "project",
                "resource_id": "project-x",
                "subject_id": "u_b",
            },
        )
        self.assertEqual(res.status_code, 422)
        self.assertEqual(self._grant_rows("project"), 0)

    def test_thread_and_project_fail_model_construction(self) -> None:
        # The not-grantable verdict is enforced at the Pydantic model edge — a
        # thread/project value never constructs a valid request.
        from pydantic import ValidationError

        for bad in ("thread", "project"):
            with self.assertRaises(ValidationError):
                grants_route.GrantCreateRequest(
                    resource_type=bad, resource_id=f"{bad}-x", subject_id="u_b"
                )


if __name__ == "__main__":
    unittest.main()
