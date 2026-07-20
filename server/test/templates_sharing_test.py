"""Owner-or-grant enforcement on the template (audit) reads/writes + the
upload→own→share→403→revoke vertical (#302), exercised through the public route
handlers.

Templates ARE grantable (``resource_type='template'``, ``resource_id`` = the
audit id). Mirrors ``tables_sharing_test.py`` / ``datasets_sharing_test.py``: a
tmp ``TEMPLATES_DIR`` seeded with a couple of on-disk audit dirs, a tmp
``AUTH_DB_PATH`` seeded via ``init_store()`` (role permissions + the
resource_grants table), and the grant CRUD + audit routes driven directly with a
``SimpleNamespace`` request carrying ``state.user``.

Peer model (§13): an ungranted template is absent from the library and a deep
link to it 403s — for ``admin`` and ``clinician`` alike. The seeded
``cord-ph``/``npda`` templates are owned by the demo admin via the #301 backfill,
so the demo admin still lists+reads them; a different clinician does not (until
granted). Running an audit reads ``spec.json`` directly, so the gate never
affects a run (demo-safety invariant — covered in ``templates_run_unaffected_test``).
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from server.auth import grants as grant_store
from server.auth import store as auth_store
from server.routes import templates as templates_routes
from server.routes import grants as grants_route


def _user(uid: str, role: str = "clinician"):
    return {"id": uid, "username": uid, "role": role}


def _request_for(user):
    return SimpleNamespace(state=SimpleNamespace(user=user, user_id=user["id"]))


def _audit_row(audit_id: str, *, read_only: bool = False, name: str = "Audit") -> dict:
    return {
        "id": audit_id,
        "name": name,
        "description": "d",
        "excel_path": "workbook.xlsx",
        "read_only": read_only,
    }


class TemplateSharingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.audits_dir = self.tmp_path / "audits"
        self.audits_dir.mkdir(parents=True, exist_ok=True)

        # Two on-disk audits. `seeded` stands in for cord-ph/npda (a real audit dir
        # with a spec.json + mapping.json); `owned` is what a clinician uploads.
        for aid in ("seeded", "owned"):
            d = self.audits_dir / aid
            d.mkdir()
            (d / "spec.json").write_text('{"fields": []}', encoding="utf-8")
            (d / "mapping.json").write_text(
                '{"criteria_bindings": [], "fixed_criteria": []}', encoding="utf-8"
            )

        self._orig_audits_dir = templates_routes.TEMPLATES_DIR
        templates_routes.TEMPLATES_DIR = self.audits_dir

        self.auth_db = self.tmp_path / "auth.sqlite"
        self._orig_auth_db = auth_store.AUTH_DB_PATH
        auth_store.AUTH_DB_PATH = self.auth_db
        auth_store.init_store()
        for uid, role in (
            ("u_admin", "admin"),
            ("u_owner", "clinician"),
            ("u_b", "clinician"),
            ("u_c", "clinician"),
            ("u_stranger", "clinician"),
            ("u_uploader", "clinician"),
        ):
            self._register_account(uid, role=role)

        # The registry is the on-disk catalog; stub it to the two audits so the
        # list route enumerates them without scanning var/.
        self._registry = [
            _audit_row("seeded", name="Cord pH"),
            _audit_row("owned", name="My Upload"),
        ]
        self._registry_patch = patch.object(
            templates_routes, "load_audit_registry", return_value=self._registry
        )
        self._registry_patch.start()
        self._by_id_patch = patch.object(
            templates_routes,
            "get_audit_by_id",
            side_effect=lambda aid: next(
                (a for a in self._registry if a["id"] == aid), None
            ),
        )
        self._by_id_patch.start()

    def tearDown(self) -> None:
        self._registry_patch.stop()
        self._by_id_patch.stop()
        templates_routes.TEMPLATES_DIR = self._orig_audits_dir
        auth_store.AUTH_DB_PATH = self._orig_auth_db
        self.tmp.cleanup()

    def _register_account(self, uid: str, *, role: str) -> None:
        auth_store.create_user(uid, uid, "hash", "salt", "2026-01-01T00:00:00+00:00")
        auth_store.set_user_role(uid, auth_store.get_role_id(role))

    def _own(self, user_id: str, audit_id: str) -> None:
        grant_store.self_grant_manage(
            resource_type="template", resource_id=audit_id, user_id=user_id
        )

    def _grant(self, owner, *, to, audit_id, grant_type="read", expires_at=None):
        body = grants_route.GrantCreateRequest(
            resource_type="template",
            resource_id=audit_id,
            subject_id=to,
            grant_type=grant_type,
            expires_at=expires_at,
        )
        return asyncio.run(grants_route.create_grant(body, _request_for(owner)))

    # --- bullet 5: the demo admin owns the seeded templates -> lists + reads ---

    def test_owner_lists_and_reads_owned_template(self) -> None:
        admin = _user("u_admin", role="admin")
        self._own("u_admin", "seeded")
        rows = asyncio.run(templates_routes.list_templates(_request_for(admin)))
        self.assertIn("seeded", [r.id for r in rows])
        detail = asyncio.run(
            templates_routes.get_template_detail("seeded", _request_for(admin))
        )
        self.assertEqual(detail.id, "seeded")

    # --- peer model: a non-grantee neither lists nor reads an ungranted one ----

    def test_non_grantee_does_not_list_and_403s_on_detail(self) -> None:
        self._own("u_admin", "seeded")
        cee = _user("u_c")
        rows = asyncio.run(templates_routes.list_templates(_request_for(cee)))
        self.assertNotIn("seeded", [r.id for r in rows])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                templates_routes.get_template_detail("seeded", _request_for(cee))
            )
        self.assertEqual(ctx.exception.status_code, 403)

    # --- bullet 4: a grant opens read for B; revoke fail-closes ----------------

    def test_grant_then_revoke_read(self) -> None:
        owner = _user("u_owner")
        bee = _user("u_b")
        self._own("u_owner", "owned")
        grant = self._grant(owner, to="u_b", audit_id="owned")
        self.assertEqual(grant["resource_type"], "template")
        # B reads + lists while the grant is active.
        detail = asyncio.run(
            templates_routes.get_template_detail("owned", _request_for(bee))
        )
        self.assertEqual(detail.id, "owned")
        rows = asyncio.run(templates_routes.list_templates(_request_for(bee)))
        self.assertIn("owned", [r.id for r in rows])
        # Owner revokes → B's next request 403s and the row drops out.
        asyncio.run(grants_route.delete_grant(grant["id"], _request_for(owner)))
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                templates_routes.get_template_detail("owned", _request_for(bee))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        rows = asyncio.run(templates_routes.list_templates(_request_for(bee)))
        self.assertNotIn("owned", [r.id for r in rows])

    # --- 404-before-403: a genuinely-missing template is 404 for a non-grantee -

    def test_missing_template_detail_is_404_before_403(self) -> None:
        cee = _user("u_c")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(templates_routes.get_template_detail("nope", _request_for(cee)))
        self.assertEqual(ctx.exception.status_code, 404)

    # --- bullet 4 (write side): rename/delete/mapping need owner-or-manage ------

    def test_non_owner_clinician_cannot_rename_403(self) -> None:
        self._own("u_owner", "owned")
        stranger = _user("u_stranger")
        body = templates_routes.TemplateRenameRequest(name="Hijacked")
        with patch.object(templates_routes.indexing, "exists", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    templates_routes.rename_template(
                        "owned", body, _request_for(stranger)
                    )
                )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_owner_can_rename(self) -> None:
        self._own("u_owner", "owned")
        owner = _user("u_owner")
        body = templates_routes.TemplateRenameRequest(name="Renamed")
        with (
            patch.object(templates_routes.indexing, "exists", return_value=True),
            patch.object(
                templates_routes.indexing, "set_display_name", return_value=True
            ),
        ):
            out = asyncio.run(
                templates_routes.rename_template("owned", body, _request_for(owner))
            )
        self.assertEqual(out.id, "owned")

    def test_non_owner_clinician_cannot_delete_403(self) -> None:
        self._own("u_owner", "owned")
        stranger = _user("u_stranger")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                templates_routes.delete_template("owned", _request_for(stranger))
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue((self.audits_dir / "owned").is_dir())

    def test_owner_can_delete(self) -> None:
        self._own("u_owner", "owned")
        owner = _user("u_owner")
        with patch.object(templates_routes.indexing, "cancel", return_value=None):
            asyncio.run(templates_routes.delete_template("owned", _request_for(owner)))
        # The route returns None (the 204 is set by the decorator); the dir is gone.
        self.assertFalse((self.audits_dir / "owned").exists())

    def test_non_owner_clinician_cannot_reindex_403(self) -> None:
        self._own("u_owner", "owned")
        stranger = _user("u_stranger")
        with (
            patch.object(templates_routes.indexing, "exists", return_value=True),
            patch.object(templates_routes.indexing, "reindex") as reindex,
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    templates_routes.reindex_template("owned", _request_for(stranger))
                )
        self.assertEqual(ctx.exception.status_code, 403)
        # The 403 fires before any indexing job is launched.
        reindex.assert_not_called()

    def test_owner_can_reindex(self) -> None:
        self._own("u_owner", "owned")
        owner = _user("u_owner")
        with (
            patch.object(templates_routes.indexing, "exists", return_value=True),
            patch.object(
                templates_routes.indexing, "reindex", return_value="My Upload"
            ),
        ):
            out = asyncio.run(
                templates_routes.reindex_template("owned", _request_for(owner))
            )
        self.assertEqual(out.id, "owned")
        self.assertEqual(out.status, "indexing")

    def test_non_owner_clinician_cannot_patch_mapping_403(self) -> None:
        self._own("u_owner", "owned")
        stranger = _user("u_stranger")
        body = templates_routes.TemplateMappingPatchRequest(fixed_criteria=[])
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                templates_routes.patch_template_mapping(
                    "owned", body, _request_for(stranger)
                )
            )
        self.assertEqual(ctx.exception.status_code, 403)

    # --- bullet 4: upload self-grants the uploader manage -> they own it -------

    def test_upload_self_grants_uploader(self) -> None:
        uploader = _user("u_uploader")

        captured: dict[str, str] = {}

        def _fake_stub(audit_id, name):
            captured["id"] = audit_id

        class _FakeFile:
            filename = "new_audit.xlsx"

            async def read(self):
                return b"xlsx-bytes"

        with (
            patch.object(templates_routes.indexing, "write_audit_stub", _fake_stub),
            patch.object(templates_routes.indexing, "launch", return_value=None),
        ):
            resp = asyncio.run(
                templates_routes.upload_template(_request_for(uploader), _FakeFile())
            )
        new_id = resp.id
        self.assertEqual(new_id, captured["id"])
        # The uploader now owns the new template (manage self-grant) and others do not.
        self.assertTrue(grant_store.can_manage_resource(uploader, "template", new_id))
        self.assertFalse(
            grant_store.has_resource_access(_user("u_other"), "template", new_id)
        )


if __name__ == "__main__":
    unittest.main()
