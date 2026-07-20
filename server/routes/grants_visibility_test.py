"""§10 grant-visibility lists — ``shared-with-me`` / ``shared-by-me`` (issue #304).

The two read endpoints that back the front-end shared views, exercised through
the public route handlers (mirrors ``tables_sharing_test`` / ``clinicians_directory_test``):

- ``GET /api/grants/shared-with-me`` — the active grants OTHERS issued to the
  caller (their inbound shares), EXCLUDING the caller's own ownership self-grants.
- ``GET /api/grants/shared-by-me`` — for resources the caller owns, the active
  grants the caller issued to OTHERS, each carrying the grantee identity + the
  revocable grant id.

Both gated by ``grant.manage_owned`` (403 without; 401 unauthenticated); identity
is resolved server-side from the session. Harness: a tmp ``AUTH_DB_PATH`` seeded
via ``init_store()`` (role catalog + the resource_grants table), tmp resource
dirs for best-effort label resolution, and synthetic-session requests driven
straight at the handlers. The grantee is a REAL registered account so its
``display_name`` resolves via ``store.get_user_by_id``.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from server.auth import grants as grant_store
from server.auth import service
from server.auth import store as auth_store
from core.tables import store as table_store
from server.routes import grants as grants_route


def _user(uid: str, role: str = "clinician"):
    # Role rides on the user dict (resolved server-side from users.role_id), never
    # derived from the username — RBAC, ADR 0003.
    return {"id": uid, "username": uid, "role": role}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class GrantVisibilityTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)

        # Freshly-seeded role catalog + the resource_grants table.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()

        # Tmp resource roots for best-effort label resolution.
        self.datasets_dir = self.tmp_path / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        self._orig_datasets_dir = grants_route.DATASETS_DIR
        grants_route.DATASETS_DIR = self.datasets_dir
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.tmp_path / "table-state.db"

    def tearDown(self) -> None:
        grants_route.DATASETS_DIR = self._orig_datasets_dir
        table_store.TABLE_DB_PATH = self._orig_table_db
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    # --- helpers -----------------------------------------------------------

    def _own(self, owner, *, resource_type, resource_id):
        """The owner's ``manage`` self-grant (what resource creation writes)."""
        grant_store.self_grant_manage(
            resource_type=resource_type, resource_id=resource_id, user_id=owner["id"]
        )

    def _grant(
        self,
        owner,
        *,
        to,
        resource_type,
        resource_id,
        grant_type="read",
        expires_at=None,
    ):
        body = grants_route.GrantCreateRequest(
            resource_type=resource_type,
            resource_id=resource_id,
            subject_id=to["id"],
            grant_type=grant_type,
            expires_at=expires_at,
        )
        return asyncio.run(grants_route.create_grant(body, _request_for(owner)))

    def _shared_with_me(self, user):
        return asyncio.run(grants_route.shared_with_me(_request_for(user)))

    def _shared_by_me(self, user):
        return asyncio.run(grants_route.shared_by_me(_request_for(user)))

    def _register(self, username):
        """A REAL account so display_name resolves; returns a session-user dict."""
        rec = service.register_user(username, "secret")
        return _user(rec["id"])

    def _write_dataset(self, ds_id, name):
        d = self.datasets_dir / ds_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "dataset.json").write_text(json.dumps({"name": name}), encoding="utf-8")

    # --- tracer bullet 1: shared-with-me lists exactly inbound grants ------

    def test_shared_with_me_lists_inbound_grant_only(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        # Owner creates a dataset (self-grant manage) and shares read with B.
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-1")
        # B ALSO owns something of their own (a self-grant) — that is NOT "shared
        # with me", so it must not appear.
        self._own(bee, resource_type="dataset", resource_id="ds-bee-own")

        rows = self._shared_with_me(bee)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["resource_type"], "dataset")
        self.assertEqual(row["resource_id"], "ds-1")
        self.assertEqual(row["grant_type"], "read")
        self.assertIn("grant_id", row)
        self.assertIn("expires_at", row)
        # The caller's OWN self-grant is excluded.
        self.assertNotIn("ds-bee-own", [r["resource_id"] for r in rows])

    # --- tracer bullet 2: shared-by-me carries grantee + grant_id ----------

    def test_shared_by_me_lists_grant_with_grantee_and_id(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        grant = self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-1")

        rows = self._shared_by_me(owner)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["grant_id"], grant["id"])
        self.assertEqual(row["resource_type"], "dataset")
        self.assertEqual(row["resource_id"], "ds-1")
        self.assertEqual(row["grant_type"], "read")
        self.assertIn("expires_at", row)
        self.assertEqual(row["grantee"]["subject_id"], bee["id"])
        self.assertEqual(row["grantee"]["display_name"], "bee")
        # The owner's own ``manage`` self-grant (granted to self) is NOT a
        # "shared-by-me" row — only grants issued to OTHERS.
        self.assertEqual([r["resource_id"] for r in rows], ["ds-1"])

    def test_manage_grantee_sees_existing_shares_on_resource(self) -> None:
        owner = self._register("owner")
        editor = self._register("editor")
        bee = self._register("bee")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        self._grant(
            owner,
            to=editor,
            resource_type="dataset",
            resource_id="ds-1",
            grant_type="manage",
        )
        grant_to_bee = self._grant(
            owner, to=bee, resource_type="dataset", resource_id="ds-1"
        )

        rows = self._shared_by_me(editor)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["grant_id"], grant_to_bee["id"])
        self.assertEqual(row["resource_type"], "dataset")
        self.assertEqual(row["resource_id"], "ds-1")
        self.assertEqual(row["grantee"]["subject_id"], bee["id"])
        # The owner self-grant and the editor's own manage grant are not chips.
        self.assertNotIn(owner["id"], [r["grantee"]["subject_id"] for r in rows])
        self.assertNotIn(editor["id"], [r["grantee"]["subject_id"] for r in rows])

    # --- tracer bullet 3: revoke removes from BOTH lists -------------------

    def test_revoke_removes_from_both_lists(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        grant = self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-1")
        # Present in both before revoke.
        self.assertEqual(len(self._shared_with_me(bee)), 1)
        self.assertEqual(len(self._shared_by_me(owner)), 1)
        # Owner revokes.
        resp = asyncio.run(grants_route.delete_grant(grant["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        # Gone from both (active-only).
        self.assertEqual(self._shared_with_me(bee), [])
        self.assertEqual(self._shared_by_me(owner), [])

    # --- tracer bullet 4: expired grant excluded from both -----------------

    def test_expired_grant_excluded_from_both(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        self._grant(
            owner, to=bee, resource_type="dataset", resource_id="ds-1", expires_at=past
        )
        self.assertEqual(self._shared_with_me(bee), [])
        self.assertEqual(self._shared_by_me(owner), [])

    # --- tracer bullet 5: grant.manage_owned required (403 / 401) ----------

    def test_shared_lists_require_grant_manage_owned_403(self) -> None:
        # The zero-permission ``agent`` role holds no grant.manage_owned.
        agent = _user("u_agent", role="agent")
        for handler in (grants_route.shared_with_me, grants_route.shared_by_me):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(handler(_request_for(agent)))
            self.assertEqual(ctx.exception.status_code, 403)
            self.assertIn("grant.manage_owned", str(ctx.exception.detail))

    def test_shared_lists_unauthenticated_401(self) -> None:
        anon = SimpleNamespace(state=SimpleNamespace(user=None, user_id=None))
        for handler in (grants_route.shared_with_me, grants_route.shared_by_me):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(handler(anon))
            self.assertEqual(ctx.exception.status_code, 401)

    # --- tracer bullet 6: best-effort label --------------------------------

    def test_label_present_for_resolvable_dataset(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        self._write_dataset("ds-1", "Term NICU cohort")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-1")
        # Label surfaces on both the inbound and outbound view.
        self.assertEqual(self._shared_with_me(bee)[0]["label"], "Term NICU cohort")
        self.assertEqual(self._shared_by_me(owner)[0]["label"], "Term NICU cohort")

    def test_label_empty_when_resource_file_missing(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        # No dataset.json on disk → label resolves empty, never raises.
        self._own(owner, resource_type="dataset", resource_id="ds-ghost")
        self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-ghost")
        self.assertEqual(self._shared_with_me(bee)[0]["label"], "")
        self.assertEqual(self._shared_by_me(owner)[0]["label"], "")

    # --- defense-in-depth: a traversal resource_id never escapes the sandbox

    def test_label_empty_for_traversal_resource_id(self) -> None:
        # A crafted ``resource_id`` like ``../secret`` would, without a flat-slug
        # guard, join into ``<DATASETS_DIR>/../secret/dataset.json`` and read an
        # arbitrary artifact's name. Plant a "secret" dataset OUTSIDE the sandbox
        # (a sibling of DATASETS_DIR) so a successful traversal would leak its name.
        secret = self.tmp_path / "secret"
        secret.mkdir(parents=True, exist_ok=True)
        (secret / "dataset.json").write_text(
            json.dumps({"name": "LEAKED"}), encoding="utf-8"
        )
        # Insert the grant straight into the store (route-level creation would refuse
        # the id via can_manage_resource; the helper must not rely on that upstream
        # invariant) — owner shares the traversal id with bee.
        owner = self._register("owner")
        bee = self._register("bee")
        grant_store.self_grant_manage(
            resource_type="dataset", resource_id="../secret", user_id=owner["id"]
        )
        grant_store.create_grant(
            subject_type="user",
            subject_id=bee["id"],
            resource_type="dataset",
            resource_id="../secret",
            grant_type="read",
            granted_by=owner["id"],
        )
        # The helper itself fails soft: a non-slug id reads NO file and yields "".
        self.assertEqual(grants_route._resource_label("dataset", "../secret"), "")
        # And the rendered rows carry an empty label, never the leaked name.
        self.assertEqual(self._shared_with_me(bee)[0]["label"], "")
        self.assertEqual(self._shared_by_me(owner)[0]["label"], "")

    # --- symmetry: a role-subject grant is not a person-to-person "shared-by-me"

    def test_shared_by_me_excludes_role_subject_grant(self) -> None:
        owner = self._register("owner")
        bee = self._register("bee")
        self._own(owner, resource_type="dataset", resource_id="ds-1")
        # A normal person-to-person grant DOES surface.
        self._grant(owner, to=bee, resource_type="dataset", resource_id="ds-1")
        # A role-subject grant the owner issued is NOT a share to a person — it must
        # not appear as a fake grantee (role name with an empty display_name).
        grant_store.create_grant(
            subject_type="role",
            subject_id="clinician",
            resource_type="dataset",
            resource_id="ds-1",
            grant_type="read",
            granted_by=owner["id"],
        )
        rows = self._shared_by_me(owner)
        self.assertEqual([r["grantee"]["subject_id"] for r in rows], [bee["id"]])
        self.assertNotIn("clinician", [r["grantee"]["subject_id"] for r in rows])


class GrantVisibilityHttpTest(unittest.TestCase):
    """The visibility routes through a real TestClient + middleware: an anonymous
    GET is 401 (the login gate) — proven end-to-end, not just at the handler."""

    def _app(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from server.auth.middleware import AuthMiddleware

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(grants_route.router)
        return TestClient(app)

    def test_unauthenticated_shared_with_me_returns_401(self) -> None:
        res = self._app().get("/api/grants/shared-with-me")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")

    def test_unauthenticated_shared_by_me_returns_401(self) -> None:
        res = self._app().get("/api/grants/shared-by-me")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")


if __name__ == "__main__":
    unittest.main()
