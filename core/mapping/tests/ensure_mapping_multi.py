"""T12: ``ensure_mapping`` binds the FULL database list (multi-DB runtime).

Run: ``python3 -m core.mapping.tests.ensure_mapping_multi``
"""

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from core.mapping import build_audit_database_map as mapping_mod  # noqa: E402


class EnsureMappingMultiDbTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        root = Path(self._dir.name)
        self.audits = root / "audits"
        self.databases = root / "databases"
        (self.audits / "npda").mkdir(parents=True)
        (self.audits / "npda" / "spec.json").write_text(json.dumps({"audit": "npda"}))
        for db in ("npda-demographics", "npda-clinical"):
            (self.databases / db).mkdir(parents=True)
            (self.databases / db / "model.json").write_text(
                json.dumps({"database": db})
            )

    def tearDown(self):
        self._dir.cleanup()

    def _patched(self):
        return (
            mock.patch.object(mapping_mod, "TEMPLATES_DIR", self.audits),
            mock.patch.object(mapping_mod, "DATABASES_DIR", self.databases),
        )

    def test_builds_across_the_full_database_list(self):
        captured: dict = {}

        async def fake_build(audit, databases, *, audit_id):
            captured["databases"] = databases
            return {"audit": audit_id, "databases": [d for d, _ in databases]}

        p1, p2 = self._patched()
        with (
            p1,
            p2,
            mock.patch.object(
                mapping_mod, "build_audit_database_mapping", side_effect=fake_build
            ),
        ):
            result = asyncio.run(
                mapping_mod.ensure_mapping(
                    "npda", ["npda-demographics", "npda-clinical"]
                )
            )
        self.assertIsNotNone(result)
        self.assertEqual(
            [d for d, _ in captured["databases"]],
            ["npda-demographics", "npda-clinical"],
        )
        written = json.loads((self.audits / "npda" / "mapping.json").read_text())
        self.assertEqual(written["databases"], ["npda-demographics", "npda-clinical"])

    def test_single_string_id_still_accepted(self):
        async def fake_build(audit, databases, *, audit_id):
            return {"audit": audit_id, "databases": [d for d, _ in databases]}

        p1, p2 = self._patched()
        with (
            p1,
            p2,
            mock.patch.object(
                mapping_mod, "build_audit_database_mapping", side_effect=fake_build
            ),
        ):
            result = asyncio.run(mapping_mod.ensure_mapping("npda", "npda-clinical"))
        self.assertIsNotNone(result)
        self.assertEqual(json.loads(result)["databases"], ["npda-clinical"])

    def test_cached_mapping_short_circuits(self):
        (self.audits / "npda" / "mapping.json").write_text(
            json.dumps(
                {"databases": ["npda-demographics", "npda-clinical"], "cached": True}
            )
        )
        p1, p2 = self._patched()
        with (
            p1,
            p2,
            mock.patch.object(
                mapping_mod,
                "build_audit_database_mapping",
                side_effect=AssertionError("must not rebuild a cached mapping"),
            ),
        ):
            result = asyncio.run(
                mapping_mod.ensure_mapping("npda", ["npda-demographics"])
            )
        self.assertTrue(json.loads(result)["cached"])

    def test_missing_model_returns_none(self):
        p1, p2 = self._patched()
        with p1, p2:
            result = asyncio.run(mapping_mod.ensure_mapping("npda", ["nope"]))
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
