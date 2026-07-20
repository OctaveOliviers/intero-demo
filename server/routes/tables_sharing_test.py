"""Owner-or-grant enforcement on the table reads + the grant→read→403→revoke
vertical (#298), exercised through the public route handlers.

Mirrors ``tables_test.py``'s harness: a tmp table store/``DATASETS_DIR``, a tmp
``AUTH_DB_PATH`` seeded via ``init_store()`` (so role permissions + the
resource_grants table exist), and the spawn seam stubbed so no run engine /
opencode session launches. The grant CRUD routes and the table reads are driven
directly with a ``SimpleNamespace`` request carrying ``state.user`` — identity is
resolved server-side; a client-supplied ``user_id`` is never trusted.
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from server.auth import store as auth_store
from server.routes import grants as grants_route
from core.tables import store as table_store
from server.routes import tables as tables_route


def _user(uid: str, role: str = "clinician"):
    # Role rides on the user dict (resolved server-side from users.role_id), never
    # derived from the username — RBAC, ADR 0003.
    return {"id": uid, "username": uid, "role": role}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


class TableSharingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmpdir.name)
        self.table_db = self.tmp_path / "table-state.db"
        self._orig_table_db = table_store.TABLE_DB_PATH
        table_store.TABLE_DB_PATH = self.table_db

        # A tmp DATASETS_DIR seeded with the tracked cord-ph Dataset fixture, so a
        # scoped table can translate its pinned criteria without touching var/.
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

        # Freshly-seeded role catalog + the resource_grants table.
        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()
        for uid, role, active in (
            ("u_owner", "clinician", True),
            ("u_b", "clinician", True),
            ("u_c", "clinician", True),
            ("u_stranger", "clinician", True),
            ("u_agent", "agent", True),
            ("u_inactive", "clinician", False),
            ("u_admin_subject", "admin", True),
            ("u_agent_subject", "agent", True),
        ):
            self._register_account(uid, role=role, active=active)

        # Stub the engine spawn so creating a table never launches a run.
        self._orig_spawn = tables_route._spawn_table_population
        tables_route._spawn_table_population = lambda **kw: "run-fake-1234"
        # Deterministic live status so a refresh never opens a real Store.
        self._orig_result_status = tables_route._live_table_population_result_status
        tables_route._live_table_population_result_status = (
            lambda table_population_id, store=None: "complete"
        )

    def tearDown(self) -> None:
        table_store.TABLE_DB_PATH = self._orig_table_db
        tables_route.DATASETS_DIR = self._orig_datasets_dir
        tables_route._spawn_table_population = self._orig_spawn
        tables_route._live_table_population_result_status = self._orig_result_status
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmpdir.cleanup()

    def _register_account(self, uid: str, *, role: str, active: bool = True) -> None:
        auth_store.create_user(uid, uid, "hash", "salt", "2026-01-01T00:00:00+00:00")
        auth_store.set_user_role(uid, auth_store.get_role_id(role))
        if not active:
            with auth_store._connect() as conn:
                conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (uid,))

    def _create_table(self, owner, **over):
        base = dict(title="Term NICU audit", source_template="cord-ph")
        base.update(over)
        body = tables_route.TableCreateRequest(**base)
        return asyncio.run(tables_route.create_table(body, _request_for(owner)))

    # --- tracer bullet 2: creation self-grants manage → owner sees it ---------

    def test_owner_sees_own_table_in_list_and_get(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        # Owner GET 200.
        got = asyncio.run(tables_route.get_table(table["id"], _request_for(owner)))
        self.assertEqual(got["id"], table["id"])
        # Owner list includes it.
        summaries = asyncio.run(tables_route.list_tables(_request_for(owner)))
        self.assertIn(table["id"], [s.id for s in summaries])

    def _grant(self, owner, *, to, table_id, grant_type="read", expires_at=None):
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table_id,
            subject_id=to,
            grant_type=grant_type,
            expires_at=expires_at,
        )
        return asyncio.run(grants_route.create_grant(body, _request_for(owner)))

    # --- tracer bullet 3: owner grants read to B → B can read + list ----------

    def test_grantee_reads_and_lists_after_grant(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        grant = self._grant(owner, to="u_b", table_id=table["id"])
        # The created grant echoes the expected shape.
        self.assertEqual(grant["resource_type"], "table")
        self.assertEqual(grant["resource_id"], table["id"])
        self.assertEqual(grant["subject_id"], "u_b")
        self.assertEqual(grant["grant_type"], "read")
        self.assertEqual(grant["granted_by"], "u_owner")
        self.assertIn("id", grant)
        # B now GET 200 and sees it listed.
        got = asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(got["id"], table["id"])
        summaries = asyncio.run(tables_route.list_tables(_request_for(bee)))
        self.assertIn(table["id"], [s.id for s in summaries])

    # --- tracer bullet 4: a non-grantee is fail-closed ------------------------

    def test_non_grantee_gets_403_and_table_absent_from_list(self) -> None:
        owner = _user("u_owner")
        cee = _user("u_c")
        table = self._create_table(owner)
        # C holds no grant: GET on the EXISTING table is a fail-closed 403.
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table(table["id"], _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 403)
        # And the table never appears in C's list.
        summaries = asyncio.run(tables_route.list_tables(_request_for(cee)))
        self.assertNotIn(table["id"], [s.id for s in summaries])

    # --- tracer bullet 5: revoke fail-closes the grantee's next request -------

    def test_revoke_fail_closes_grantees_next_request(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        grant = self._grant(owner, to="u_b", table_id=table["id"])
        # B can read while the grant is active.
        asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        # Owner revokes (204).
        resp = asyncio.run(grants_route.delete_grant(grant["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        # B's VERY NEXT GET is 403 — revoke fail-closes.
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)
        # And the table drops out of B's list too.
        summaries = asyncio.run(tables_route.list_tables(_request_for(bee)))
        self.assertNotIn(table["id"], [s.id for s in summaries])

    # --- tracer bullet 6: expiry + many grants --------------------------------

    def test_expired_grant_does_not_grant_access(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        # A grant that expired in the past is not active → no access.
        self._grant(
            owner,
            to="u_b",
            table_id=table["id"],
            expires_at="2000-01-01T00:00:00+00:00",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)
        summaries = asyncio.run(tables_route.list_tables(_request_for(bee)))
        self.assertNotIn(table["id"], [s.id for s in summaries])

    def test_past_expiry_with_offset_does_not_grant_access(self) -> None:
        """An owner-supplied ``expires_at`` that is chronologically in the PAST but
        expressed in a far-east UTC offset (``+14:00``) must NOT keep granting.

        The naive ``_now_iso() < expires_at`` TEXT compare is fail-OPEN here: the
        ``+14:00`` value sorts lexicographically AFTER the ``+00:00`` now-string
        (its date/time digits are shifted ~14h ahead) even though it is already
        past. The fix normalizes the stored value to ``+00:00`` so lexicographic
        order == chronological order."""
        from datetime import datetime, timedelta, timezone

        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        # A moment one hour ago, written in a +14:00 zone — chronologically past,
        # but the raw string sorts as "future" against a +00:00 now-string.
        tz14 = timezone(timedelta(hours=14))
        past_in_plus14 = (
            (datetime.now(timezone.utc) - timedelta(hours=1))
            .astimezone(tz14)
            .isoformat()
        )
        self._grant(owner, to="u_b", table_id=table["id"], expires_at=past_in_plus14)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)
        summaries = asyncio.run(tables_route.list_tables(_request_for(bee)))
        self.assertNotIn(table["id"], [s.id for s in summaries])

    def test_z_suffix_expiry_is_normalized_not_lexicographically_mis_ranked(
        self,
    ) -> None:
        """A ``Z``-suffixed ``expires_at`` at the CURRENT whole second is
        chronologically past (now carries sub-second microseconds) yet ``Z`` sorts
        lexicographically AFTER the ``.<micros>+00:00`` now-string — the naive TEXT
        compare keeps it "active" (fail-OPEN). Normalizing to ``+00:00`` makes the
        stored value share the now-string's form so order == chronology → denied."""
        from datetime import datetime, timezone

        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        # Whole-second-truncated 'now' with a Z suffix: <= now chronologically,
        # but Z (0x5A) > '.' (0x2E) so it lex-sorts as future against now.
        now_dt = datetime.now(timezone.utc)
        z_past = now_dt.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        self._grant(owner, to="u_b", table_id=table["id"], expires_at=z_past)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_z_suffix_future_expiry_still_grants_access(self) -> None:
        """A genuinely-future ``Z`` expiry is parsed (not rejected) and still
        grants — normalization must accept the ``Z`` form, not just reject it."""
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        self._grant(
            owner, to="u_b", table_id=table["id"], expires_at="2999-01-01T00:00:00Z"
        )
        got = asyncio.run(tables_route.get_table(table["id"], _request_for(bee)))
        self.assertEqual(got["id"], table["id"])

    def test_unparseable_expires_at_is_422(self) -> None:
        """A non-ISO ``expires_at`` is rejected at the create boundary (422) rather
        than stored as an un-normalizable string that the compare can't trust."""
        owner = _user("u_owner")
        table = self._create_table(owner)
        with self.assertRaises(HTTPException) as ctx:
            self._grant(
                owner, to="u_b", table_id=table["id"], expires_at="not-a-timestamp"
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_a_user_may_hold_many_grants(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        t1 = self._create_table(owner, title="First")
        t2 = self._create_table(owner, title="Second")
        self._grant(owner, to="u_b", table_id=t1["id"])
        self._grant(owner, to="u_b", table_id=t2["id"])
        # B holds two concurrent grants and reaches both tables.
        asyncio.run(tables_route.get_table(t1["id"], _request_for(bee)))
        asyncio.run(tables_route.get_table(t2["id"], _request_for(bee)))
        ids = {s.id for s in asyncio.run(tables_route.list_tables(_request_for(bee)))}
        self.assertEqual({t1["id"], t2["id"]}, ids)

    # --- open_table is gated the SAME as GET (no existence oracle) ------------

    def test_non_grantee_open_is_403_not_204(self) -> None:
        """``POST /api/tables/{id}/open`` must apply the SAME owner-or-grant gate as
        GET. Without it a non-grantee gets 204 (revealing the table EXISTS) while
        GET gives 403 — an existence oracle — and a phantom per-user seen-row is
        written. A non-grantee must get 403; a genuinely-missing table stays 404."""
        owner = _user("u_owner")
        cee = _user("u_c")
        table = self._create_table(owner)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.open_table(table["id"], _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_owner_and_grantee_open_is_204(self) -> None:
        """The owner (manage self-grant) and a read-grantee can still open (204)."""
        owner = _user("u_owner")
        bee = _user("u_b")
        table = self._create_table(owner)
        resp = asyncio.run(tables_route.open_table(table["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        self._grant(owner, to="u_b", table_id=table["id"])
        resp_b = asyncio.run(tables_route.open_table(table["id"], _request_for(bee)))
        self.assertEqual(resp_b.status_code, 204)

    def test_missing_table_open_is_404_before_403(self) -> None:
        """A genuinely-missing table 404s for a non-grantee — the 404 is ordered
        before the 403 so a non-existent id never discloses as a 403."""
        cee = _user("u_c")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.open_table("table-nope", _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 404)

    # --- rename/delete are gated on owner-or-manage (peer model, ADR-0003) ----

    def test_non_owner_clinician_cannot_rename_403(self) -> None:
        """``PATCH /api/tables/{id}`` requires owner-or-manage on the target, not
        just the ``table.manage`` role permission — else any clinician could rename
        another clinician's table. A non-owner clinician → 403."""
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        table = self._create_table(owner)
        body = tables_route.TableRenameRequest(title="Hijacked")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                tables_route.rename_table(table["id"], body, _request_for(stranger))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_owner_can_rename_their_table(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        body = tables_route.TableRenameRequest(title="Owner's new title")
        renamed = asyncio.run(
            tables_route.rename_table(table["id"], body, _request_for(owner))
        )
        self.assertEqual(renamed["title"], "Owner's new title")

    def test_non_owner_clinician_cannot_delete_403(self) -> None:
        """``DELETE /api/tables/{id}`` requires owner-or-manage too. A non-owner
        clinician → 403, and the table dir survives."""
        owner = _user("u_owner")
        stranger = _user("u_stranger")
        table = self._create_table(owner)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(tables_route.delete_table(table["id"], _request_for(stranger)))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue(table_store.load_table(table["id"]))

    def test_owner_can_delete_their_table(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        resp = asyncio.run(tables_route.delete_table(table["id"], _request_for(owner)))
        self.assertEqual(resp.status_code, 204)
        with self.assertRaises(table_store.TableError):
            table_store.load_table(table["id"])

    # --- tracer bullet 7: the POST /api/grants gates --------------------------

    def test_grant_without_manage_owned_permission_is_403(self) -> None:
        # The agent role holds no permissions (no grant.manage_owned) → 403 before
        # any ownership check.
        owner = _user("u_owner")
        table = self._create_table(owner)
        agent = _user("u_agent", role="agent")
        body = grants_route.GrantCreateRequest(
            resource_type="table", resource_id=table["id"], subject_id="u_b"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(agent)))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("grant.manage_owned", str(ctx.exception.detail))

    def test_non_owner_clinician_cannot_grant_403(self) -> None:
        # A clinician who is neither the creator nor a manage-grant holder holds
        # grant.manage_owned (role) but fails the §5 ownership predicate → 403.
        owner = _user("u_owner")
        table = self._create_table(owner)
        stranger = _user("u_stranger")
        body = grants_route.GrantCreateRequest(
            resource_type="table", resource_id=table["id"], subject_id="u_b"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(stranger)))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_grant_rejects_unknown_subject_422(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table["id"],
            subject_id="u_missing",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(owner)))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_grant_rejects_deactivated_clinician_422(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table["id"],
            subject_id="u_inactive",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(owner)))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_grant_rejects_admin_subject_422(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table["id"],
            subject_id="u_admin_subject",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(owner)))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_grant_rejects_agent_subject_422(self) -> None:
        owner = _user("u_owner")
        table = self._create_table(owner)
        body = grants_route.GrantCreateRequest(
            resource_type="table",
            resource_id=table["id"],
            subject_id="u_agent_subject",
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(owner)))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_thread_resource_type_is_rejected_422(self) -> None:
        # A non-grantable resource_type fails Pydantic validation at the edge.
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            grants_route.GrantCreateRequest(
                resource_type="thread", resource_id="thread-x", subject_id="u_b"
            )

    def test_unknown_grant_id_delete_is_404(self) -> None:
        owner = _user("u_owner")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.delete_grant("nope", _request_for(owner)))
        self.assertEqual(ctx.exception.status_code, 404)

    # --- tracer bullet 8: client-provided user_id is ignored ------------------

    def test_client_provided_user_id_is_ignored(self) -> None:
        """Identity (the granter) is resolved server-side from the session, never
        from the request body: a spurious ``user_id`` in the JSON is dropped by the
        model, and ``granted_by`` records the SESSION user. If the body's id were
        trusted, an attacker could impersonate the owner — so a body that names a
        DIFFERENT owner must NOT let a non-owner grant."""
        owner = _user("u_owner")
        table = self._create_table(owner)
        stranger = _user("u_stranger")
        # The model has no user_id field — Pydantic drops the extra key.
        body = grants_route.GrantCreateRequest(
            **{
                "resource_type": "table",
                "resource_id": table["id"],
                "subject_id": "u_b",
                "user_id": "u_owner",  # forged identity in the body
            }
        )
        self.assertFalse(hasattr(body, "user_id"))
        # The stranger is still the SESSION caller, so ownership fails → 403; the
        # forged body user_id buys nothing.
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(grants_route.create_grant(body, _request_for(stranger)))
        self.assertEqual(ctx.exception.status_code, 403)
        # And when the real owner grants, granted_by is the SESSION id (not a body
        # value), even if a body user_id were present.
        owner_body = grants_route.GrantCreateRequest(
            **{
                "resource_type": "table",
                "resource_id": table["id"],
                "subject_id": "u_b",
                "user_id": "u_someone_else",
            }
        )
        grant = asyncio.run(grants_route.create_grant(owner_body, _request_for(owner)))
        self.assertEqual(grant["granted_by"], "u_owner")


class GrantsHttpTest(unittest.TestCase):
    """The grants router behaves through a real TestClient + middleware: an
    anonymous POST is 401 (the login gate), and a non-grantable resource_type is a
    422 from the route's Pydantic model — proven end-to-end, not just at the
    handler (mirrors TableMiddleware401Test)."""

    def _app(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from server.auth.middleware import AuthMiddleware

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.include_router(grants_route.router)
        return TestClient(app)

    def test_unauthenticated_post_grant_returns_401(self) -> None:
        res = self._app().post(
            "/api/grants",
            json={"resource_type": "table", "resource_id": "t", "subject_id": "u_b"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("detail"), "Authentication required")


if __name__ == "__main__":
    unittest.main()
