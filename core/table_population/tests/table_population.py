"""Package-seam tests for table population.

These tests intentionally call the public ``core.table_population`` interface
instead of the internal steps. ``populate_table`` takes THE REQUEST — the
table identity dict — and derives its own ingredients, so each test lays the
request's world on disk (an audits dir with ``spec.json``, a databases dir
with the source SQLite) and stubs only ``core.mapping.ensure_mapping`` (the
LLM edge) to hand back the cached-mapping JSON. The contract we care about at
this module boundary is: a population run assembles its ingredients from the
identity, prepopulates from the executable against a real source SQLite,
hands anything still open to the agent (faked here at its natural boundary,
the opencode client), mutates the durable store, projects back to a workbook
shape, and emits the stream frames the app consumes.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import core.mapping as core_mapping  # noqa: E402
import core.table_population as table_population  # noqa: E402
from core.filters import cohort as cohort_filters  # noqa: E402
from core.table_population.populate import build_pending_table_cells  # noqa: E402
from core.store import Run, Store  # noqa: E402

AUDIT_SPEC = {
    "fields": [
        {"id": "patient_code", "name": "Patient code"},
        {"id": "gestation_weeks", "name": "Gestation weeks"},
        {
            "id": "delivery",
            "name": "Delivery",
            "permitted_values": {
                "1": "Spontaneous vaginal",
                "3": "Forceps",
            },
        },
    ]
}

EXECUTABLE = {
    "schema_version": "2",
    "audit_id": "births",
    "workbook": "births.xlsx",
    "identity_keys": ["patient_code"],
    "cohort": {
        "database": "testdb",
        "from": "births b",
        "identity_select": "b.patient_code AS patient_code",
        "where": [],
    },
    "regions": [
        {
            "id": "ALL",
            "sheet": "ALL",
            "kind": "direct",
            "queries": [
                {
                    "database": "testdb",
                    "sql": "SELECT patient_code, gestation_weeks, delivery FROM births "
                    "WHERE patient_code IN (:cohort)",
                }
            ],
            "row_anchor": "patient_code",
            "cell_map": [
                {
                    "field": "patient_code",
                    "column": "patient_code",
                    "table": "births",
                    "cell_template": "{col:A}{row}",
                },
                {
                    "field": "gestation_weeks",
                    "column": "gestation_weeks",
                    "table": "births",
                    "cell_template": "{col:B}{row}",
                },
                {
                    "field": "delivery",
                    "column": "delivery",
                    "table": "births",
                    "cell_template": "{col:C}{row}",
                    "translate": "delivery",
                },
            ],
        }
    ],
    "code_sets": {
        "delivery": {
            "Spontaneous vaginal": "1",
            "Forceps": "3",
        }
    },
}


class _IdleAgentClient:
    """The agent faked at its natural boundary: one opencode session that goes
    idle immediately without writing a cell. Whatever prepopulation left open
    then falls to the session-end fallback (blocked / NOT_LOCATED)."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def create_session(self, title=None, directory=None) -> str:
        return "s1"

    async def subscribe(self, session_id):
        queue: asyncio.Queue = asyncio.Queue()
        queue.put_nowait({"type": "session.idle"})
        return queue

    async def prompt_async(self, session_id, prompt, directory=None) -> None:
        self.prompts.append(prompt)

    async def unsubscribe(self, session_id) -> None:
        pass

    async def delete_session(self, session_id, directory=None) -> None:
        pass


def _make_db(path: Path, rows: list[tuple[str, int | None, str]]) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            "CREATE TABLE births ("
            "patient_code TEXT, gestation_weeks INTEGER, delivery TEXT"
            ");"
        )
        conn.executemany("INSERT INTO births VALUES (?, ?, ?)", rows)
        conn.commit()
    finally:
        conn.close()


class TablePopulationSeamTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        # The request's world on disk: the audit spec populate_table arms the
        # off-code guard from, and the bound database's SQLite at its canonical
        # <databases_dir>/<slug>/database.sqlite location.
        self.audits_dir = self.root / "audits"
        (self.audits_dir / "births").mkdir(parents=True)
        # spec.json::databases is the seed-time binding hint the assembly
        # defaults the database from when no mapping.json is cached yet.
        (self.audits_dir / "births" / "spec.json").write_text(
            json.dumps({**AUDIT_SPEC, "databases": ["testdb"]}), encoding="utf-8"
        )
        self.databases_dir = self.root / "databases"
        (self.databases_dir / "testdb").mkdir(parents=True)
        self.db_path = self.databases_dir / "testdb" / "database.sqlite"
        self.store = Store(self.root / "state.db")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def _create_run(self, run_id: str) -> None:
        self.store.create_run(Run(id=run_id, audit_id="births", status="in_progress"))

    def _populate(
        self,
        run_id: str,
        *,
        source_template: str = "births",
        executable: dict | None = None,
        agent_client=None,
    ) -> list[dict]:
        """Populate from the request identity. The mapping is 'cached': the LLM
        edge (ensure_mapping) is stubbed to return it; everything downstream —
        spec load, binding, cohort SQL, prepopulate, agent — is real."""
        events: list[dict] = []
        mapping_json = json.dumps(
            {
                "databases": ["testdb"],
                "executable": EXECUTABLE if executable is None else executable,
            }
        )

        async def fake_ensure_mapping(*_a, **_k):
            return mapping_json

        table = {
            "table_population_id": run_id,
            "source_template": source_template,
            "dataset_id": None,
        }
        with patch.object(core_mapping, "ensure_mapping", fake_ensure_mapping):
            asyncio.run(
                table_population.populate_table(
                    self.store,
                    table,
                    emit=events.append,
                    agent_client=agent_client,
                    artifact_dir=self.root / run_id,
                    templates_dir=self.audits_dir,
                    databases_dir=self.databases_dir,
                )
            )
        return events

    def test_populate_table_writes_store_workbook_and_stream_outcomes(self) -> None:
        _make_db(
            self.db_path,
            [
                ("P001", 39, "Spontaneous vaginal"),
                ("P002", 40, "Forceps"),
            ],
        )
        self._create_run("r1")

        events = self._populate("r1")

        cells = {(cell.field, cell.member): cell for cell in self.store.get_cells("r1")}
        self.assertEqual(len(cells), 6)
        self.assertEqual(cells[("patient_code", "P001")].value, "P001")
        self.assertEqual(cells[("gestation_weeks", "P002")].value, "40")
        self.assertEqual(cells[("delivery", "P001")].value, "1")
        self.assertEqual(cells[("delivery", "P002")].value, "3")
        self.assertTrue(all(cell.state == "filled" for cell in cells.values()))
        self.assertTrue(
            all(cell.resolved_by == "prepopulated" for cell in cells.values())
        )
        self.assertEqual(self.store.get_run("r1").status, "complete")

        wire = table_population.cell_wire(cells[("delivery", "P001")])
        self.assertEqual(
            wire,
            {
                "ref": "C2",
                "value": "1",
                "meta": {
                    "field": "delivery",
                    "member": "P001",
                    "kind": "direct",
                    "state": "filled",
                    "confidence": "high",
                    "resolved_by": "prepopulated",
                    "attempts": cells[("delivery", "P001")].attempts,
                    "sources": cells[("delivery", "P001")].sources,
                    "explanation": "Copied directly from births.delivery for P001.",
                },
            },
        )

        sheets = table_population.sheets_from_cells(
            self.store.get_cells("r1"),
            table_population.field_display_names(AUDIT_SPEC),
        )
        self.assertEqual(
            sheets[0]["data"],
            [
                ["Patient code", "Gestation weeks", "Delivery"],
                ["P001", "39", "1"],
                ["P002", "40", "3"],
            ],
        )

        kinds = [event["type"] for event in events]
        self.assertEqual(kinds[-2:], ["review_summary", "done"])
        self.assertEqual(kinds.count("cell_update"), 6)
        self.assertTrue(any(kind == "activity" for kind in kinds))
        review = events[-2]
        self.assertEqual(
            review["totals"],
            {
                "cells": 6,
                "filled": 6,
                "blocked": 0,
                "needs_verification": 0,
                "low_confidence": 0,
            },
        )

        persisted_kinds = [event.type for event in self.store.get_events("r1")]
        self.assertIn("status_change", persisted_kinds)
        self.assertIn("review_summary", persisted_kinds)
        self.assertEqual(persisted_kinds.count("cell_update"), 6)

    def test_agent_settles_what_prepopulation_left_open(self) -> None:
        # P002's gestation_weeks is NULL: prepopulation leaves that one cell
        # pending, so the agent runs — the faked session goes idle without
        # writing, and the session-end fallback settles the leftover blocked.
        _make_db(
            self.db_path,
            [
                ("P001", 39, "Spontaneous vaginal"),
                ("P002", None, "Forceps"),
            ],
        )
        self._create_run("r2")
        client = _IdleAgentClient()

        events = self._populate("r2", agent_client=client)

        self.assertEqual(len(client.prompts), 1)
        self.assertIn("table-fill", client.prompts[0])
        leftover = self.store.get_cell("r2", "ALL!B3")
        self.assertEqual(leftover.state, "blocked")
        self.assertEqual(leftover.resolved_by, "agent")
        self.assertEqual(leftover.reason_code, "NOT_LOCATED")
        self.assertIn("empty/NULL", leftover.attempts[0]["error"])
        self.assertEqual(leftover.attempts[0]["by"], "prepopulate")
        self.assertEqual(leftover.attempts[-1]["by"], "agent")
        # The agent worktree was provisioned as the session's project root.
        self.assertTrue((self.root / "r2" / "context.json").is_file())
        self.assertEqual(events[-1]["type"], "done")

    def test_pending_agent_work_without_a_client_fails_loudly(self) -> None:
        _make_db(
            self.db_path,
            [
                ("P001", 39, "Spontaneous vaginal"),
                ("P002", None, "Forceps"),
            ],
        )
        self._create_run("r3")

        with self.assertRaises(RuntimeError):
            self._populate("r3", agent_client=None)

        # The prepopulated cells landed durably before the failure.
        pending = self.store.get_cell("r3", "ALL!B3")
        self.assertEqual(pending.state, "pending")
        self.assertEqual(self.store.get_cell("r3", "ALL!B2").value, "39")

    def test_table_without_an_executable_goes_straight_to_the_agent(self) -> None:
        # A table whose mapping carries no precomputed plan (an EMPTY
        # executable): no database lookup runs (no "Looking up values"
        # heartbeat), every cell goes to the agent. An empty executable has no
        # cohort block, so the cohort resolver is stubbed at its core seam.
        _make_db(self.db_path, [("P001", 39, "Spontaneous vaginal")])
        self._create_run("r4")
        self.store.insert_pending_cells(
            build_pending_table_cells("r4", EXECUTABLE, ["P001"])
        )
        client = _IdleAgentClient()

        with patch.object(cohort_filters, "resolve_cohort", lambda *a, **k: ["P001"]):
            events = self._populate("r4", executable={}, agent_client=client)

        self.assertEqual(len(client.prompts), 1)
        labels = [e.get("label") for e in events if e["type"] == "activity"]
        self.assertNotIn("Looking up values", labels)
        states = {c.state for c in self.store.get_cells("r4")}
        self.assertEqual(states, {"blocked"})
        self.assertEqual(events[-1]["type"], "done")

    def test_missing_audit_spec_fails_before_population_starts(self) -> None:
        # The off-code guard is armed from spec.json: a request whose source
        # template has no spec on disk fails FAST — before any cell persists.
        _make_db(self.db_path, [("P001", 39, "Spontaneous vaginal")])
        self._create_run("r5")

        with self.assertRaises(ValueError):
            self._populate("r5", source_template="no-such-audit")

        self.assertEqual(self.store.get_cells("r5"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
