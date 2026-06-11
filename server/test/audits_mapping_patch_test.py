"""PATCH /api/audits/{id}/mapping — the fixed-criteria persistence contract
(doc 4 §The fixed inclusion criteria; doc 9 §Card detail section 1; T6).

Drives the route function directly against a real seed-shaped mapping.json in
a temp AUDITS_DIR, with a stub user: round-trip persist, unknown criterion_id
-> 422 naming the id, schema-invalid entry -> 422, read-only audit -> 403,
missing mapping -> 404, unauthenticated -> 401.
"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from server.models import AuditMappingPatchRequest
from server.routes import audits as audits_routes


def _seed_mapping() -> dict:
    """A minimal mapping.json that validates against mapping.schema.json."""
    seed_path = Path(__file__).resolve().parents[2] / "seed" / "audits" / "cord-ph" / "mapping.json"
    return json.loads(seed_path.read_text(encoding="utf-8"))


def _audit_row(read_only: bool = False) -> dict:
    return {
        "id": "cord-ph",
        "name": "Cord pH",
        "description": "d",
        "excel_path": "workbook.xlsx",
        "read_only": read_only,
    }


class _FakeRequest:
    pass


def _user():
    return {"id": "u1", "username": "clinician"}


class AuditMappingPatchTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.audits_dir = Path(self._tmp.name)
        audit_dir = self.audits_dir / "cord-ph"
        audit_dir.mkdir(parents=True)
        self.mapping = _seed_mapping()
        (audit_dir / "mapping.json").write_text(
            json.dumps(self.mapping), encoding="utf-8",
        )
        self.known_id = (self.mapping["criteria_bindings"][0])["criterion_id"]
        self.valid_entry = next(
            (e for e in self.mapping.get("fixed_criteria", []) if isinstance(e, dict)),
            None,
        )
        assert self.valid_entry is not None, "seed mapping must carry a fixed_criteria example"

    def tearDown(self):
        self._tmp.cleanup()

    async def _call(self, fixed_criteria, *, user=..., read_only=False):
        body = AuditMappingPatchRequest(fixed_criteria=fixed_criteria)
        resolved_user = _user() if user is ... else user
        with (
            patch.object(audits_routes, "AUDITS_DIR", self.audits_dir),
            patch.object(audits_routes, "get_audit_by_id", return_value=_audit_row(read_only)),
            patch.object(audits_routes, "current_user", return_value=resolved_user),
        ):
            return await audits_routes.patch_audit_mapping("cord-ph", body, _FakeRequest())

    async def test_round_trip_persists_and_rereads(self):
        response = await self._call([self.valid_entry])
        self.assertEqual(response.id, "cord-ph")
        self.assertEqual(response.fixed_criteria, [self.valid_entry])

        on_disk = json.loads(
            (self.audits_dir / "cord-ph" / "mapping.json").read_text(encoding="utf-8"),
        )
        self.assertEqual(on_disk["fixed_criteria"], [self.valid_entry])
        # The rest of the mapping is untouched.
        self.assertEqual(on_disk["criteria_bindings"], self.mapping["criteria_bindings"])

    async def test_unknown_criterion_id_is_422_and_names_the_id(self):
        bogus = {**self.valid_entry, "criterion_id": "no-such-criterion"}
        with self.assertRaises(HTTPException) as ctx:
            await self._call([bogus])
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("no-such-criterion", ctx.exception.detail)
        # Nothing was written.
        on_disk = json.loads(
            (self.audits_dir / "cord-ph" / "mapping.json").read_text(encoding="utf-8"),
        )
        self.assertEqual(on_disk["fixed_criteria"], self.mapping["fixed_criteria"])

    async def test_schema_invalid_entry_is_422(self):
        # Right criterion_id but the entry violates mapping.schema.json
        # (fixed_criteria entries have required fields beyond the id).
        with self.assertRaises(HTTPException) as ctx:
            await self._call([{"criterion_id": self.known_id}])
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("mapping.schema.json", ctx.exception.detail)

    async def test_read_only_audit_is_403(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._call([self.valid_entry], read_only=True)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("read-only", ctx.exception.detail)

    async def test_missing_mapping_is_404(self):
        (self.audits_dir / "cord-ph" / "mapping.json").unlink()
        with self.assertRaises(HTTPException) as ctx:
            await self._call([self.valid_entry])
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_unauthenticated_is_401(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._call([self.valid_entry], user=None)
        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
