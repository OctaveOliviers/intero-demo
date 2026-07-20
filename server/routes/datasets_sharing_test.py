"""Owner-or-grant enforcement on the Dataset reads/writes + the
grant→read→403→revoke vertical (#302), exercised through the public route
handlers.

Mirrors ``tables_sharing_test.py``'s harness: a tmp ``DATASETS_DIR`` seeded with
the real cord-pH Dataset fixture, a tmp ``AUTH_DB_PATH`` seeded via
``init_store()`` (so role permissions + the resource_grants table exist), and the
grant CRUD routes + the dataset reads driven directly with a ``SimpleNamespace``
request carrying ``state.user`` — identity is resolved server-side; a
client-supplied ``user_id`` is never trusted.

These tests prove the NEW per-resource gate (#302): a clinician who creates a
Dataset owns it (self-grant on POST); a non-grantee is fail-closed (403 + not
listed); a grant opens read; a revoke fail-closes the next request. The seeded
Dataset is owned by NO ONE here (no backfill in this harness), so a fresh
clinician cannot reach it until they own/are-granted — that is the peer model.
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
from server.auth import store as auth_store
from server.routes import datasets as datasets_route
from server.routes import grants as grants_route

SEED_DATASET = ROOT / "data" / "seed" / "datasets" / "dataset-cordph-term-nicu"


def _user(uid: str, role: str = "clinician"):
    # Role rides on the user dict (resolved server-side from users.role_id), never
    # derived from the username — RBAC, ADR 0003.
    return {"id": uid, "username": uid, "role": role}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class DatasetSharingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.datasets_dir = self.tmp_path / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        # Seed the demo Dataset (owned by NO ONE in this harness — no backfill).
        shutil.copytree(SEED_DATASET, self.datasets_dir / SEED_DATASET.name)
        self._orig_datasets_dir = datasets_route.DATASETS_DIR
        datasets_route.DATASETS_DIR = self.datasets_dir

        # Real cord-pH fixtures back the read-only COUNT (seeded by `make seed`).
        self._orig_databases_dir = datasets_route.DATABASES_DIR
        datasets_route.DATABASES_DIR = DATABASES_DIR

        # Freshly-seeded role catalog + the resource_grants table.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()
        for uid in ("u_owner", "u_b", "u_c", "u_stranger"):
            self._register_clinician(uid)

        self._orig_ground = datasets_route.ground_criteria

    def tearDown(self) -> None:
        datasets_route.DATASETS_DIR = self._orig_datasets_dir
        datasets_route.DATABASES_DIR = self._orig_databases_dir
        datasets_route.ground_criteria = self._orig_ground
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _register_clinician(self, uid: str) -> None:
        auth_store.create_user(uid, uid, "hash", "salt", "2026-01-01T00:00:00+00:00")
        auth_store.set_user_role(uid, auth_store.get_role_id("clinician"))

    def _patch_ground(self, result: dict) -> None:
        async def fake_ground(description, databases):
            return result

        datasets_route.ground_criteria = fake_ground

    def _create_dataset(self, owner, name="My slice"):
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
                "not_available": [],
            }
        )
        body = datasets_route.DatasetCreateRequest(
            name=name,
            databases=["cord-ph"],
            anchor="cord-ph -> cord_ph_birth_records.patient_code",
            text="NICU babies",
        )
        return asyncio.run(datasets_route.create_dataset(body, _request_for(owner)))

    def _grant(self, owner, *, to, dataset_id, grant_type="read", expires_at=None):
        body = grants_route.GrantCreateRequest(
            resource_type="dataset",
            resource_id=dataset_id,
            subject_id=to,
            grant_type=grant_type,
            expires_at=expires_at,
        )
        return asyncio.run(grants_route.create_grant(body, _request_for(owner)))

    # --- bullet 2: POST self-grants manage → creator (only) reaches it ---------

    def test_creator_owns_new_dataset_and_others_do_not(self) -> None:
        owner = _user("u_owner")
        d = self._create_dataset(owner)
        # Owner GET 200.
        got = asyncio.run(datasets_route.get_dataset(d["id"], _request_for(owner)))
        self.assertEqual(got["id"], d["id"])
        # Owner list includes it.
        summaries = asyncio.run(datasets_route.list_datasets(_request_for(owner)))
        self.assertIn(d["id"], [s.id for s in summaries])
        # A different clinician neither lists nor GETs it.
        cee = _user("u_c")
        c_list = asyncio.run(datasets_route.list_datasets(_request_for(cee)))
        self.assertNotIn(d["id"], [s.id for s in c_list])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.get_dataset(d["id"], _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 403)

    # --- bullet 1: owner grants read to B → B reads + lists; C is fail-closed --

    def test_grantee_reads_and_lists_after_grant(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        d = self._create_dataset(owner)
        grant = self._grant(owner, to="u_b", dataset_id=d["id"])
        self.assertEqual(grant["resource_type"], "dataset")
        self.assertEqual(grant["resource_id"], d["id"])
        self.assertEqual(grant["granted_by"], "u_owner")
        got = asyncio.run(datasets_route.get_dataset(d["id"], _request_for(bee)))
        self.assertEqual(got["id"], d["id"])
        summaries = asyncio.run(datasets_route.list_datasets(_request_for(bee)))
        self.assertIn(d["id"], [s.id for s in summaries])

    def test_revoke_fail_closes_grantees_next_request(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        d = self._create_dataset(owner)
        grant = self._grant(owner, to="u_b", dataset_id=d["id"])
        asyncio.run(datasets_route.get_dataset(d["id"], _request_for(bee)))
        resp = asyncio.run(grants_route.delete_grant(grant["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.get_dataset(d["id"], _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)
        summaries = asyncio.run(datasets_route.list_datasets(_request_for(bee)))
        self.assertNotIn(d["id"], [s.id for s in summaries])

    # --- bullet 3: PATCH/DELETE/add-filter need owner-or-manage ----------------

    def test_non_owner_clinician_cannot_patch_403(self) -> None:
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        d = self._create_dataset(owner)
        body = datasets_route.DatasetPatchRequest(name="Hijacked")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset(d["id"], body, _request_for(stranger))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_non_owner_clinician_cannot_delete_403(self) -> None:
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        d = self._create_dataset(owner)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.delete_dataset(d["id"], _request_for(stranger)))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue((self.datasets_dir / d["id"]).is_dir())

    def test_non_owner_clinician_cannot_remove_criterion_403(self) -> None:
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        d = self._create_dataset(owner)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.remove_dataset_criterion(
                    d["id"], "admitted_to_nicu", _request_for(stranger)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_non_owner_clinician_cannot_add_filter_403(self) -> None:
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        d = self._create_dataset(owner)
        body = datasets_route.DatasetFilterRequest(text="anything")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.add_dataset_filter(d["id"], body, _request_for(stranger))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_owner_can_patch_their_dataset(self) -> None:
        owner = _user("u_owner")
        d = self._create_dataset(owner)
        body = datasets_route.DatasetPatchRequest(name="Owner's rename")
        out = asyncio.run(
            datasets_route.patch_dataset(d["id"], body, _request_for(owner))
        )
        self.assertEqual(out["name"], "Owner's rename")

    def test_manage_grantee_can_patch(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        d = self._create_dataset(owner)
        self._grant(owner, to="u_b", dataset_id=d["id"], grant_type="manage")
        body = datasets_route.DatasetPatchRequest(name="Co-owner rename")
        out = asyncio.run(
            datasets_route.patch_dataset(d["id"], body, _request_for(bee))
        )
        self.assertEqual(out["name"], "Co-owner rename")

    # --- 404-before-403 ordering: a missing id is 404 even for a non-grantee ---

    def test_missing_dataset_is_404_before_403(self) -> None:
        cee = _user("u_c")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.get_dataset("dataset-nope", _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.patch_dataset(
                    "dataset-nope",
                    datasets_route.DatasetPatchRequest(name="x"),
                    _request_for(cee),
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                datasets_route.delete_dataset("dataset-nope", _request_for(cee))
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # --- read-grantee may NOT manage (read != manage) -------------------------

    def test_read_grantee_cannot_patch_403(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        d = self._create_dataset(owner)
        self._grant(owner, to="u_b", dataset_id=d["id"], grant_type="read")
        body = datasets_route.DatasetPatchRequest(name="nope")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(datasets_route.patch_dataset(d["id"], body, _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
