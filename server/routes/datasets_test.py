"""Auth + round-trip tests for the Dataset control-plane endpoints.

Mirrors table_populations_edit_cells_test's tempdir redirection: DATASETS_DIR points at a
temp dir seeded with the demo cord-pH Dataset, and ``ground_criteria`` is always
monkeypatched — a test NEVER hits a real LLM (hard constraint).
"""

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from core.config import DATABASES_DIR, ROOT
from server.auth import grants as grant_store
from server.auth import store as auth_store
from server.routes import datasets as datasets_route

SEED_DATASET = ROOT / "data" / "seed" / "datasets" / "dataset-cordph-term-nicu"


def _clinician():
    # Role rides on the user dict (resolved server-side from users.role_id), never
    # derived from the username — RBAC change, ADR 0003.
    return {"id": "u_clin", "username": "clinician", "role": "clinician"}


def _agent():
    return {"id": "u_agent", "username": "agent", "role": "agent"}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


def _request_anon():
    return SimpleNamespace(state=SimpleNamespace(user=None, user_id=None))


class DatasetRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.datasets_dir = self.tmp_path / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        # Seed the demo Dataset into the temp DATASETS_DIR.
        shutil.copytree(SEED_DATASET, self.datasets_dir / SEED_DATASET.name)

        self._orig_datasets_dir = datasets_route.DATASETS_DIR
        datasets_route.DATASETS_DIR = self.datasets_dir

        # Real cord-pH fixtures back the read-only COUNT (seeded by `make seed`).
        self._orig_databases_dir = datasets_route.DATABASES_DIR
        datasets_route.DATABASES_DIR = DATABASES_DIR

        # #302 added owner-or-grant enforcement to every Dataset route. Seed a tmp
        # control-plane store and make the test `clinician` (`u_clin`) the OWNER of
        # the seeded Dataset (a `manage` self-grant — the same grant a creator gets
        # on POST), so these tests keep exercising their ORIGINAL read/write
        # behavior. A non-grantee being denied is proven separately in
        # `datasets_sharing_test.py`.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self.legacy_auth_db = self.tmp_path / "legacy-auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        self._orig_legacy_auth_db = auth_store.LEGACY_AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.LEGACY_AUTH_DB_PATH = self.legacy_auth_db
        auth_store.init_store()
        grant_store.self_grant_manage(
            resource_type="dataset",
            resource_id="dataset-cordph-term-nicu",
            user_id="u_clin",
        )

        self.ground_calls: list[tuple] = []
        self._orig_ground = datasets_route.ground_criteria

    def tearDown(self) -> None:
        datasets_route.DATASETS_DIR = self._orig_datasets_dir
        datasets_route.DATABASES_DIR = self._orig_databases_dir
        datasets_route.ground_criteria = self._orig_ground
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        auth_store.LEGACY_AUTH_DB_PATH = self._orig_legacy_auth_db
        self.tmpdir.cleanup()

    def _patch_ground(self, result: dict) -> None:
        async def fake_ground(description, databases):
            self.ground_calls.append((description, databases))
            return result

        datasets_route.ground_criteria = fake_ground

    # --- 403 / 401 -----------------------------------------------------------

    def test_agent_role_is_denied_read(self):
        req = _request_for(_agent())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.list_datasets(req))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("dataset.read", str(ctx.exception.detail))

    def test_agent_role_is_denied_create(self):
        req = _request_for(_agent())
        body = datasets_route.DatasetCreateRequest(
            name="x",
            databases=["cord-ph"],
            anchor="cord-ph -> cord_ph_birth_records.patient_code",
            text="term babies",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.create_dataset(body, req))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("dataset.manage", str(ctx.exception.detail))

    def test_agent_role_is_denied_patch_and_delete(self):
        req = _request_for(_agent())
        patch = datasets_route.DatasetPatchRequest(
            criterion_id="gestation_weeks", value=35
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset("dataset-cordph-term-nicu", patch, req)
            )
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.delete_dataset("dataset-cordph-term-nicu", req))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_anonymous_user_is_rejected_401(self):
        req = _request_anon()
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.list_datasets(req))
        self.assertEqual(ctx.exception.status_code, 401)

    # --- happy path: list / get ----------------------------------------------

    def test_clinician_lists_seeded_dataset(self):
        req = _request_for(_clinician())
        summaries = asyncio.run(datasets_route.list_datasets(req))
        ids = {s.id for s in summaries}
        self.assertIn("dataset-cordph-term-nicu", ids)
        demo = next(s for s in summaries if s.id == "dataset-cordph-term-nicu")
        self.assertEqual(demo.count, 1)
        self.assertEqual(demo.databases, ["cord-ph"])

    def test_clinician_gets_full_dataset_and_it_re_derives_identically(self):
        req = _request_for(_clinician())
        d = asyncio.run(datasets_route.get_dataset("dataset-cordph-term-nicu", req))
        self.assertEqual(d["count"], 1)
        self.assertIn("CAST(b.gestation_weeks AS REAL) >= :c0", d["cohort_sql"])

    def test_get_missing_dataset_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.get_dataset("nope", req))
        self.assertEqual(ctx.exception.status_code, 404)

    # --- create (ground_criteria monkeypatched) ------------------------------

    def test_create_persists_and_round_trips(self):
        self._patch_ground(
            {
                "criteria": [
                    {
                        "criterion_id": "gestation_weeks",
                        "label": "Gestation (weeks)",
                        "type": "number",
                        "source": "cord-ph -> cord_ph_birth_records.gestation_weeks",
                        "predicate": {"op": ">=", "value": 39},
                    },
                    {
                        "criterion_id": "admitted_to_nicu",
                        "label": "Admitted to NICU",
                        "type": "category",
                        "source": "cord-ph -> cord_ph_birth_records.admitted_to_nicu",
                        "predicate": {"op": "=", "value": "yes"},
                    },
                ],
                "not_available": [],
            }
        )
        req = _request_for(_clinician())
        body = datasets_route.DatasetCreateRequest(
            name="My term NICU slice",
            databases=["cord-ph"],
            anchor="cord-ph -> cord_ph_birth_records.patient_code",
            text="term babies admitted to NICU",
        )
        d = asyncio.run(datasets_route.create_dataset(body, req))
        self.assertEqual(len(self.ground_calls), 1)
        self.assertTrue(d["id"].startswith("dataset-"))
        self.assertEqual(d["count"], 1)

        # Persisted file re-derives an identical cohort_sql + count.
        reloaded = asyncio.run(datasets_route.get_dataset(d["id"], req))
        self.assertEqual(reloaded["cohort_sql"], d["cohort_sql"])
        self.assertEqual(reloaded["count"], d["count"])

    def test_create_keeps_free_text_phrase_in_not_available_never_a_predicate(self):
        self._patch_ground(
            {
                "criteria": [
                    {
                        "criterion_id": "admitted_to_nicu",
                        "label": "Admitted to NICU",
                        "type": "category",
                        "source": "cord-ph -> cord_ph_birth_records.admitted_to_nicu",
                        "predicate": {"op": "=", "value": "yes"},
                    },
                ],
                "not_available": [
                    {
                        "phrase": "babies with a documented clinical concern",
                        "reason": "only in free-text notes; no structured column",
                    }
                ],
            }
        )
        req = _request_for(_clinician())
        body = datasets_route.DatasetCreateRequest(
            name="NICU with concern",
            databases=["cord-ph"],
            anchor="cord-ph -> cord_ph_birth_records.patient_code",
            text="NICU babies with a documented clinical concern",
        )
        d = asyncio.run(datasets_route.create_dataset(body, req))
        phrases = [n["phrase"] for n in d.get("not_available", [])]
        self.assertIn("babies with a documented clinical concern", phrases)
        self.assertNotIn("clinical concern", d["cohort_sql"])
        self.assertEqual(
            [c["criterion_id"] for c in d["criteria"]], ["admitted_to_nicu"]
        )

    # --- PATCH re-derive (NO LLM) --------------------------------------------

    def test_patch_re_derives_without_an_llm(self):
        # Editing gestation 39 -> 35 moves the count 1 -> 4, with NO grounding call.
        def _boom(*_a, **_k):
            raise AssertionError("ground_criteria must NOT be called on a value edit")

        datasets_route.ground_criteria = _boom
        req = _request_for(_clinician())
        patch = datasets_route.DatasetPatchRequest(
            criterion_id="gestation_weeks", value=35
        )
        d = asyncio.run(
            datasets_route.patch_dataset("dataset-cordph-term-nicu", patch, req)
        )
        self.assertEqual(d["count"], 4)
        gest = next(c for c in d["criteria"] if c["criterion_id"] == "gestation_weeks")
        self.assertEqual(gest["predicate"]["value"], 35)
        self.assertEqual(gest["display"], "Gestation (weeks) ≥ 35")

    def test_patch_unknown_criterion_is_404(self):
        req = _request_for(_clinician())
        patch = datasets_route.DatasetPatchRequest(criterion_id="nope", value=1)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset("dataset-cordph-term-nicu", patch, req)
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # --- DELETE --------------------------------------------------------------

    def test_delete_removes_the_dataset_dir(self):
        req = _request_for(_clinician())
        resp = asyncio.run(
            datasets_route.delete_dataset("dataset-cordph-term-nicu", req)
        )
        self.assertEqual(resp.status_code, 204)
        self.assertFalse((self.datasets_dir / "dataset-cordph-term-nicu").exists())

    # --- add-filter row ------------------------------------------------------

    def test_add_filter_grounds_appends_and_re_derives(self):
        # Start from a Dataset with only the NICU criterion, then add gestation.
        single = json.loads(
            (
                self.datasets_dir / "dataset-cordph-term-nicu" / "dataset.json"
            ).read_text()
        )
        single["criteria"] = [
            c for c in single["criteria"] if c["criterion_id"] == "admitted_to_nicu"
        ]
        from core.datasets.store import rederive, save_dataset

        single = rederive(
            single, {"cord-ph": DATABASES_DIR / "cord-ph" / "database.sqlite"}
        )
        save_dataset(single, datasets_dir=self.datasets_dir)
        self.assertEqual(single["count"], 4)  # all NICU babies

        self._patch_ground(
            {
                "criteria": [
                    {
                        "criterion_id": "gestation_weeks",
                        "label": "Gestation (weeks)",
                        "type": "number",
                        "source": "cord-ph -> cord_ph_birth_records.gestation_weeks",
                        "predicate": {"op": ">=", "value": 39},
                    },
                ],
                "not_available": [],
            }
        )
        req = _request_for(_clinician())
        body = datasets_route.DatasetFilterRequest(text="born at term")
        d = asyncio.run(
            datasets_route.add_dataset_filter("dataset-cordph-term-nicu", body, req)
        )
        self.assertEqual(len(self.ground_calls), 1)
        self.assertEqual(d["count"], 1)  # narrowed back to term NICU babies
        self.assertEqual(
            sorted(c["criterion_id"] for c in d["criteria"]),
            ["admitted_to_nicu", "gestation_weeks"],
        )

    def test_rename_changes_the_name(self):
        req = _request_for(_clinician())
        body = datasets_route.DatasetPatchRequest(name="Renamed cohort")
        d = asyncio.run(
            datasets_route.patch_dataset("dataset-cordph-term-nicu", body, req)
        )
        self.assertEqual(d["name"], "Renamed cohort")
        reloaded = asyncio.run(
            datasets_route.get_dataset("dataset-cordph-term-nicu", req)
        )
        self.assertEqual(reloaded["name"], "Renamed cohort")

    def test_remove_criterion_re_derives(self):
        req = _request_for(_clinician())
        # Seed has gestation>=39 + nicu=yes (count 1). Remove gestation → all NICU (4).
        d = asyncio.run(
            datasets_route.remove_dataset_criterion(
                "dataset-cordph-term-nicu", "gestation_weeks", req
            )
        )
        ids = [c["criterion_id"] for c in d["criteria"]]
        self.assertNotIn("gestation_weeks", ids)
        self.assertEqual(d["count"], 4)

    def test_remove_unknown_criterion_is_404(self):
        req = _request_for(_clinician())
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.remove_dataset_criterion(
                    "dataset-cordph-term-nicu", "nope", req
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_grounding_failure_is_502_not_500(self):
        from core.clients.llm import LLMRequestError

        async def boom(*a, **k):
            raise LLMRequestError("endpoint returned 400: unsupported parameter")

        datasets_route.ground_criteria = boom
        req = _request_for(_clinician())
        body = datasets_route.DatasetFilterRequest(text="anything")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.add_dataset_filter("dataset-cordph-term-nicu", body, req)
            )
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("Grounding model unavailable", str(ctx.exception.detail))

    def test_add_filter_on_same_column_gets_a_unique_criterion_id(self):
        # The seed already has a `gestation_weeks` criterion (>=39). Adding another
        # gestation filter must NOT collide — a duplicate criterion_id breaks PATCH
        # (find-by-id) and crashes the keyed list in the UI.
        self._patch_ground(
            {
                "criteria": [
                    {
                        "criterion_id": "gestation_weeks",
                        "label": "Gestation (weeks)",
                        "type": "number",
                        "source": "cord-ph -> cord_ph_birth_records.gestation_weeks",
                        "predicate": {"op": ">=", "value": 37},
                    }
                ],
                "not_available": [],
            }
        )
        req = _request_for(_clinician())
        body = datasets_route.DatasetFilterRequest(text="at least 37 weeks")
        d = asyncio.run(
            datasets_route.add_dataset_filter("dataset-cordph-term-nicu", body, req)
        )
        ids = [c["criterion_id"] for c in d["criteria"]]
        self.assertEqual(len(ids), len(set(ids)), f"duplicate criterion_ids: {ids}")
        self.assertIn("gestation_weeks", ids)
        self.assertIn("gestation_weeks_2", ids)


class DatasetSecurityTest(unittest.TestCase):
    """Path-traversal + error-mapping hardening of the control plane.

    Reuses the route harness (the same tempdir DATASETS_DIR + monkeypatched
    grounding) without inheriting the parent's test methods, so the suite is not
    re-run.
    """

    setUp = DatasetRouteTest.setUp
    tearDown = DatasetRouteTest.tearDown
    _patch_ground = DatasetRouteTest._patch_ground

    def test_traversal_slug_in_databases_is_refused(self):
        # The OTHER caller-controlled path component: a database slug must not
        # traverse out of var/databases/ either.
        self._patch_ground({"criteria": [], "not_available": []})
        for bad in (["../../etc"], ["a/b"], [".."]):
            body = datasets_route.DatasetCreateRequest(
                name="x", databases=bad, anchor="x -> t.c", text="anything"
            )
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    datasets_route.create_dataset(body, _request_for(_clinician()))
                )
            self.assertEqual(ctx.exception.status_code, 422)

    def test_traversal_dataset_id_is_refused_and_siblings_survive(self):
        # A sibling artifact dir that a traversal DELETE must never reach.
        victim = self.tmp_path / "victim"
        victim.mkdir()
        seeded = self.datasets_dir / "dataset-cordph-term-nicu"
        req = _request_for(_clinician())
        for bad in ("..", "../victim", "foo/bar", ".", "a/../b"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(datasets_route.delete_dataset(bad, req))
            self.assertEqual(ctx.exception.status_code, 404)
        # Neither the sibling dir nor the real Dataset was touched.
        self.assertTrue(victim.exists())
        self.assertTrue(seeded.exists())
        # get / patch refuse a traversal id too (404, never a path op).
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.get_dataset("..", req))
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset(
                    "..",
                    datasets_route.DatasetPatchRequest(criterion_id="x", value=1),
                    req,
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_missing_database_sqlite_is_422_not_500(self):
        # A database with a model.json but no database.sqlite must fail cleanly.
        dbs = self.tmp_path / "databases"
        (dbs / "phantom").mkdir(parents=True)
        (dbs / "phantom" / "model.json").write_text(
            json.dumps(
                {
                    "schema_version": "1",
                    "database": "phantom",
                    "identity_links": [],
                    "tables": [{"name": "t", "columns": [{"name": "pid"}]}],
                }
            ),
            encoding="utf-8",
        )
        datasets_route.DATABASES_DIR = dbs
        self._patch_ground({"criteria": [], "not_available": []})
        body = datasets_route.DatasetCreateRequest(
            name="x", databases=["phantom"], anchor="phantom -> t.pid", text="anything"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.create_dataset(body, _request_for(_clinician())))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_patch_with_invalid_value_is_422_not_500(self):
        body = datasets_route.DatasetPatchRequest(
            criterion_id="gestation_weeks", value="not-a-number"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset(
                    "dataset-cordph-term-nicu", body, _request_for(_clinician())
                )
            )
        self.assertEqual(ctx.exception.status_code, 422)


class DatasetMiddleware401Test(unittest.TestCase):
    """The middleware 401s an anonymous /api/datasets request for free — proved
    end-to-end through a TestClient (mirrors auth_smoke_test)."""

    def test_unauthenticated_list_datasets_returns_401(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from server.auth.middleware import AuthMiddleware

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(datasets_route.router)
        client = TestClient(app)

        res = client.get("/api/datasets")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")


if __name__ == "__main__":
    unittest.main()
