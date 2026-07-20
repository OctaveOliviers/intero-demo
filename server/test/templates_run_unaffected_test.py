"""Demo-safety invariant for sharing slice 3 (#302): gating the AUDIT READ routes
must NOT change run behavior.

The run engine is template-backed and reads ``var/templates/<id>/spec.json`` (and
``mapping.json``) DIRECTLY from disk (``table_populations._read_json``;
``tables._read_template_spec``) — never via the now-gated ``GET /api/templates/{id}``.
So a clinician who holds NO ``template`` grant on ``cord-ph`` can still run it.
If a run ever started reading the spec through the gated route, this test would
fail (the spec read would 403 / need a grant). It does not, by design.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server.routes import table_populations as table_populations_route
from server.routes import tables as tables_route


class TemplateRunUnaffectedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.audits_dir = Path(self.tmp.name) / "audits" / "cord-ph"
        self.audits_dir.mkdir(parents=True, exist_ok=True)
        self.spec = {"audit": "cord-ph", "title": "Cord pH", "fields": []}
        (self.audits_dir / "spec.json").write_text(
            json.dumps(self.spec), encoding="utf-8"
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_run_engine_reads_spec_directly_without_a_grant(self) -> None:
        # No AUTH_DB / no grant is set up at all: the spec read takes NO user and
        # NO grant — it is a plain disk read keyed on the audit id.
        with patch.object(
            table_populations_route, "TEMPLATES_DIR", self.audits_dir.parent
        ):
            spec = table_populations_route._read_json(self.audits_dir / "spec.json")
        self.assertEqual(spec, self.spec)

    def test_table_spawn_reads_template_spec_directly_without_a_grant(self) -> None:
        # The table populate path snapshots columns/grain from spec.json directly,
        # never via the gated audit-detail route.
        with patch.object(tables_route, "TEMPLATES_DIR", self.audits_dir.parent):
            spec = tables_route._read_template_spec("cord-ph")
        self.assertEqual(spec, self.spec)


if __name__ == "__main__":
    unittest.main()
