"""Verify Tier 2 (``try_llm``, A2): one cheap LLM pass per open cell, two looks
and one retry max, UPDATE-IN-PLACE, off-code rejected against ``spec.json``,
and a structured (Pydantic-validated) LLM reply that cannot crash the run.

The LLM authors only the interpretive part (value + verbatim ``citations`` +
``explanation``); the TIER grounds each citation to the retry row it came from
and builds the cell's ``sources[]`` (per-source ``citations`` + ``row_id``). There
is no ``record_id`` (identity is the cell's ``member``) and no flat
``evidence[]`` (it lives inside each source).

Verify cases (BUILD-PLAN.md §A2 + the provenance redesign):

1. A code-drift cell is filled IN PLACE at the first look (structured source, no
   citations) with the LLM's one-sentence ``explanation``.
2. An empty value is solved via one retry; the verbatim citation is grounded to
   its note row → ``sources[0].citations`` + ``row_id``.
3. An unresolvable cell is left open for Tier 3.
4. An off-code solution is rejected (validated against ``spec.json``) and rides
   on ``attempts[]``.
5. A blank-output 'solution' is coerced to a clean escalate (never an empty fill).
6. A malformed / failing LLM reply leaves the cell pending with the error.
7. A retry with no clinical DB bound is recorded and escalated — never faked.
8. A citation that is not an exact substring of the retry rows fails the solve
   (evidence not verifiable) → cell stays pending.

Run: ``python3 -m core.running.tests.try_llm``
"""

import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

import jsonschema  # noqa: E402

from core.running.orchestrator import RunStore, orchestrate_run  # noqa: E402
from core.running.provenance import Source  # noqa: E402
from core.running.try_llm import (  # noqa: E402
    TriageDecision,
    _load_canonical_model,
    _rows_for_prompt,
    _schema_hint_for_cell,
    make_tier_llm,
    try_llm,
)
from core.store import Cell, Run, Store  # noqa: E402

SCHEMA = json.loads(
    (REPO_ROOT / "docs/mvp/contracts/cell-resolution.schema.json").read_text(encoding="utf-8")
)


def _audit() -> dict:
    """Minimal audit-spec with one coded and one uncoded field."""
    return {"fields": [
        {"id": "delivery", "name": "Mode of delivery", "type": "category",
         "permitted_values": {"1": "Spontaneous vaginal", "2": "Emergency caesarean",
                              "3": "Forceps", "4": "Vacuum"}},
        {"id": "cord_arterial_ph", "name": "Cord arterial pH", "type": "number"},
    ]}


def _schema_cell(cell: Cell) -> dict:
    """Project a store Cell onto the cell-resolution schema's ``cell`` shape."""
    sheet, _, a1 = cell.ref.partition("!")
    out = {"sheet": sheet, "ref": a1, "field": cell.field,
           "member": cell.member, "kind": cell.kind, "state": cell.state}
    for k in ("value", "confidence", "resolved_by", "hypothesis", "attempts",
              "explanation", "sources", "review_state", "corrected",
              "reason_code", "reason_detail", "owner_needed", "outstanding_since",
              "prompt_version", "extracted_at"):
        v = getattr(cell, k)
        if v not in (None, [], {}):
            out[k] = v
    return out


class _FakeLLM:
    """Async LLM seam: routes by (field, member, look) to a canned response and
    VALIDATES it through TriageDecision — exactly like the production seam, so a
    canned blank/invalid reply raises here just as a real one would."""

    def __init__(self, responses):
        self._responses = responses
        self.calls: list[str] = []
        self._per_cell: dict[tuple[str, str], int] = {}

    async def __call__(self, prompt: str) -> TriageDecision:
        self.calls.append(prompt)
        field = _scan(prompt, "field: ")
        member = _scan(prompt, "patient (member): ")
        key = (field, member)
        look = self._per_cell.get(key, 0) + 1
        self._per_cell[key] = look
        try:
            canned = self._responses[(field, member, look)]
        except KeyError:
            raise AssertionError(
                f"FakeLLM has no canned reply for {field!r}/{member!r} look {look}"
            )
        if isinstance(canned, Exception):
            raise canned
        return TriageDecision.model_validate(canned)


def _scan(prompt: str, prefix: str) -> str:
    for line in prompt.splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    return ""


class TriageDecisionModelTest(unittest.TestCase):
    """The structured-output contract: shape constraints + citation/explanation rules."""

    def test_blank_solution_output_degrades_to_escalate(self):
        # No value to fill → escalate (never fabricate), not a parse failure.
        d = TriageDecision.model_validate({"decision": "solution", "output": "  ",
                                           "reason": "x"})
        self.assertEqual(d.decision, "escalate")
        self.assertIsNone(d.output)

    def test_solution_without_output_degrades_to_escalate(self):
        d = TriageDecision.model_validate({"decision": "solution", "reason": "x"})
        self.assertEqual(d.decision, "escalate")

    def test_escalate_with_stray_output_is_coerced_null(self):
        # A valid escalate must not be thrown away over a leftover output.
        d = TriageDecision.model_validate({"decision": "escalate", "output": "v",
                                           "reason": "x"})
        self.assertEqual(d.decision, "escalate")
        self.assertIsNone(d.output)

    def test_solution_only_fields_on_non_solution_are_dropped(self):
        # The exact failure that stranded every npda Tier-2 cell: a retry/escalate
        # carrying citations/explanation/source_column. Coerce, don't reject.
        d = TriageDecision.model_validate({"decision": "retry", "output": "SELECT 1",
                                           "reason": "x", "citations": ["q"],
                                           "explanation": "e", "source_column": "t.c"})
        self.assertEqual(d.decision, "retry")
        self.assertEqual(d.output, "SELECT 1")
        self.assertIsNone(d.citations)
        self.assertIsNone(d.explanation)
        self.assertIsNone(d.source_column)

    def test_surplus_unknown_field_is_ignored_not_rejected(self):
        d = TriageDecision.model_validate({"decision": "escalate", "output": None,
                                           "reason": "x", "confidence": "high"})
        self.assertEqual(d.decision, "escalate")

    def test_reason_must_be_non_empty(self):
        with self.assertRaises(ValueError):
            TriageDecision.model_validate({"decision": "escalate", "output": None,
                                          "reason": ""})

    def test_field_descriptions_reach_the_schema(self):
        schema = TriageDecision.model_json_schema()
        for token in ("solution", "retry", "escalate"):
            self.assertIn(token, schema["properties"]["decision"]["description"])
        self.assertIn("citations", schema["properties"])
        self.assertIn("explanation", schema["properties"])


class SourceModelTest(unittest.TestCase):
    """The shared Source model guards the contract for every tier that builds one."""

    def test_empty_citations_list_is_rejected(self):
        # citations=[] would persist a source violating citations.minItems:1; the
        # model is the single shared definition, so it must reject it (the DB
        # trigger checks sources presence, not source-internal shape).
        with self.assertRaises(ValueError):
            Source(database="d", query="Q", table_column="t.c", citations=[])

    def test_none_citations_is_fine(self):
        s = Source(database="d", query="Q", table_column="t.c")
        self.assertNotIn("citations", s.as_dict())


class RowsForPromptTest(unittest.TestCase):
    """Retry rows reach the LLM as plain text (item: encoding-safe grounding)."""

    def test_rows_rendered_one_line_not_json_escaped(self):
        # A value with an apostrophe + newline is rendered on ONE line (newline
        # collapsed to a space) so it can't blur the row/column structure, with no
        # JSON escaping — the same normalisation grounding matches against.
        text = "Patient declined; says she'd prefer\nexpectant management"
        rendered = _rows_for_prompt([{"note_id": "n1", "text": text}])
        self.assertIn("Patient declined; says she'd prefer expectant management", rendered)
        self.assertNotIn("\\n", rendered)      # not JSON-escaped
        self.assertNotIn('\\"', rendered)
        # The apostrophe survives (no escaping); the embedded newline is gone.
        self.assertIn("she'd", rendered)
        self.assertNotIn("prefer\nexpectant", rendered)


class Tier2SchemaHintTest(unittest.TestCase):
    def test_schema_hint_lists_joins_among_chosen_tables(self):
        cell = Cell(run_id="r1", ref="ALL!H2", field="diabetes_type", member="P1",
                    kind="interpret", state="pending",
                    attempts=[{"tier": "direct", "table_column": "registrations.x"}])
        model = {
            "tables": [
                {"name": "patients", "columns": [{"name": "patient_id", "type": "text"}]},
                {"name": "registrations",
                 "columns": [{"name": "patient_id", "type": "text"},
                             {"name": "diabetes_type", "type": "text"}]},
            ],
            "foreign_keys": [
                {"column": "registrations.patient_id", "target": "patients.patient_id",
                 "cardinality": "to-one", "declared": False, "evidence": "x"},
            ],
        }
        hint = _schema_hint_for_cell(cell, model)
        self.assertIn("joins:", hint)
        self.assertIn("registrations.patient_id -> patients.patient_id [to-one]", hint)

    def test_schema_hint_omits_joins_when_no_fk_among_chosen(self):
        cell = Cell(run_id="r1", ref="ALL!A2", field="visit_date", member="P1",
                    kind="direct", state="pending", attempts=[])
        model = {"tables": [{"name": "visits", "columns": [{"name": "visit_date", "type": "text"}]}]}
        self.assertNotIn("joins:", _schema_hint_for_cell(cell, model) or "")

    def test_load_canonical_model_reads_var_databases(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            canonical = root / "cord-ph"
            canonical.mkdir(parents=True)
            (canonical / "model.json").write_text(
                json.dumps({"database": "cord-ph", "tables": [{"name": "births", "columns": []}]}),
                encoding="utf-8",
            )
            with mock.patch("core.running.try_llm.DATABASES_DIR", root):
                model = _load_canonical_model("cord-ph")
            self.assertEqual(model["database"], "cord-ph")
            self.assertEqual(model["tables"][0]["name"], "births")

    def test_try_llm_loads_model_once_and_reuses_across_cells(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            store = Store(root / "state.db")
            store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
            store.materialize_field_codes("r1", _audit())
            db_path = root / "cord-ph.sqlite"
            sqlite3.connect(db_path).close()
            store.insert_pending_cells([
                Cell(run_id="r1", ref="ALL!T2", field="delivery", member="P001",
                     kind="direct", state="pending",
                     attempts=[{"tier": "direct", "database": "cord-ph",
                                "sql": "SELECT delivery FROM births WHERE patient_code='P001'",
                                "table_column": "births.delivery", "error": "x"}]),
                Cell(run_id="r1", ref="ALL!V2", field="cord_arterial_ph", member="P002",
                     kind="direct", state="pending",
                     attempts=[{"tier": "direct", "database": "cord-ph",
                                "sql": "SELECT cord_arterial_ph FROM births WHERE patient_code='P002'",
                                "table_column": "births.cord_arterial_ph", "error": "x"}]),
            ])
            rs = RunStore(store, "r1", cohort=["P001", "P002"],
                          database_paths={"cord-ph": db_path}, audit=_audit())
            llm = _FakeLLM({
                ("delivery", "P001", 1): {"decision": "escalate", "output": None, "reason": "agent"},
                ("cord_arterial_ph", "P002", 1): {"decision": "escalate", "output": None, "reason": "agent"},
            })
            model = {
                "tables": [{
                    "name": "births",
                    "description": "Birth records",
                    "columns": [
                        {"name": "delivery", "type": "text", "description": "Mode"},
                        {"name": "cord_arterial_ph", "type": "real", "description": "pH"},
                    ],
                }]
            }
            with mock.patch("core.running.try_llm._load_canonical_model",
                            wraps=lambda slug: model) as load:
                asyncio.run(try_llm(rs, llm=llm))
            self.assertEqual(load.call_count, 1)
            self.assertIn("schema hints (canonical model.json):", llm.calls[0])
            self.assertIn("births.delivery", llm.calls[0])
            self.assertIn("births.cord_arterial_ph", llm.calls[1])
            store.close()


class TryLlmVerifyTest(unittest.TestCase):
    """The verify cases plus the invariants."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())

        def t1cell(ref, field, member, error, value=None):
            # A realistic Tier-1 non-clean cell: its attempt carries database +
            # table_column (what A3 now writes) so Tier 2 reads provenance off it.
            attempt = {"tier": "direct", "database": "cord-ph",
                       "sql": f"SELECT {field} FROM births WHERE patient_code = '{member}'",
                       "table_column": f"births.{field}", "error": error}
            if value is not None:
                attempt["value"] = value
            return Cell(run_id="r1", ref=ref, field=field, member=member,
                        kind="direct", state="pending", attempts=[attempt])

        self.store.insert_pending_cells([
            t1cell("ALL!T2", "delivery", "P001",
                   "value 'Forceps' not in the code map for field 'delivery'", "Forceps"),
            t1cell("ALL!V2", "cord_arterial_ph", "P001",
                   "births.cord_arterial_ph is NULL for P001"),
            t1cell("ALL!T3", "delivery", "P002",
                   "value 'Unknown' not in the code map for field 'delivery'", "Unknown"),
            t1cell("ALL!T4", "delivery", "P003",
                   "value 'Caesarean' not in the code map for field 'delivery'", "Caesarean"),
            t1cell("ALL!T5", "delivery", "P004",
                   "births.delivery is NULL for P004"),
            t1cell("ALL!V3", "cord_arterial_ph", "P005",
                   "births.cord_arterial_ph is NULL for P005"),
        ])

        # A notes table WITH a primary key (note_id) so the tier can ground a
        # citation to its exact row.
        self.db_path = self.root / "cord-ph.sqlite"
        conn = sqlite3.connect(self.db_path)
        conn.executescript(
            "CREATE TABLE notes (note_id TEXT, patient_code TEXT, text TEXT);"
            "INSERT INTO notes VALUES "
            "('n-11', 'P001', 'Cord arterial pH 7.25 on delivery'),"
            "('n-50', 'P005', 'Baby pink and vigorous; no cord gases documented');"
        )
        conn.commit()
        conn.close()

        self.run_store = RunStore(
            self.store, "r1",
            cohort=["P001", "P002", "P003", "P004", "P005"],
            database_paths={"cord-ph": self.db_path},
            audit=_audit(),
        )

        self.llm = _FakeLLM({
            # Case 1 — code-drift (Forceps → "3") at first look; structured, no citations.
            ("delivery", "P001", 1): {
                "decision": "solution", "output": "3",
                "reason": "Tier 1 read raw 'Forceps'; permitted code for Forceps is 3",
                "explanation": "Mapped the raw delivery label 'Forceps' to its permitted code 3.",
            },
            # Case 2 — empty cord pH: retry, then solve with a grounded note citation.
            ("cord_arterial_ph", "P001", 1): {
                "decision": "retry",
                "output": "SELECT note_id, patient_code, text FROM notes WHERE patient_code = 'P001'",
                "reason": "free-text notes likely carry the cord-pH on delivery",
            },
            ("cord_arterial_ph", "P001", 2): {
                "decision": "solution", "output": "7.25",
                "reason": "found in the delivery note",
                "explanation": "Read the cord arterial pH from the delivery note.",
                "citations": ["Cord arterial pH 7.25 on delivery"],
            },
            # Case 3 — delivery P002: escalate.
            ("delivery", "P002", 1): {
                "decision": "escalate", "output": None,
                "reason": "raw 'Unknown' could match several codes; needs Tier 3",
            },
            # Case 4 — off-code solution: code "5" is not in {1..4}.
            ("delivery", "P003", 1): {
                "decision": "solution", "output": "5",
                "reason": "guessing — ad-hoc category",
                "explanation": "Picked 5 for an unrecognised delivery label.",
            },
            # Case 5 — blank-output 'solution' → invalid at parse → caught → pending.
            ("delivery", "P004", 1): {
                "decision": "solution", "output": "   ",
                "reason": "I think it is vaginal but cannot say",
            },
            # Case 8 — retry then a citation that does NOT match the rows → fail solve.
            ("cord_arterial_ph", "P005", 1): {
                "decision": "retry",
                "output": "SELECT note_id, patient_code, text FROM notes WHERE patient_code = 'P005'",
                "reason": "check the notes",
            },
            ("cord_arterial_ph", "P005", 2): {
                "decision": "solution", "output": "7.10",
                "reason": "from the note",
                "explanation": "Read it from the note.",
                "citations": ["cord arterial pH 7.10 recorded"],  # not in the row text
            },
        })

        asyncio.run(try_llm(self.run_store, llm=self.llm))
        self.cells = {c.ref: c for c in self.store.get_cells("r1")}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    # --- 1. code-drift filled IN PLACE at first look ------------------------
    def test_code_drift_filled_at_first_look(self):
        cell = self.cells["ALL!T2"]
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.value, "3")
        self.assertEqual(cell.resolved_by, "LLM")
        self.assertEqual(self.llm._per_cell[("delivery", "P001")], 1)  # one call, no retry
        self.assertEqual(len(cell.attempts), 1)                         # Tier 1 attempt preserved
        # Structured source from Tier 1's narrowed query: no citations, no record_id.
        src = cell.sources[0]
        self.assertEqual(src["table_column"], "births.delivery")
        self.assertNotIn("citations", src)
        self.assertNotIn("record_id", src)
        # The LLM's one-sentence explanation lands on the cell.
        self.assertIn("Forceps", cell.explanation)
        # A deterministic code translation on a coded field, no retry → high.
        self.assertEqual(cell.confidence, "high")

    # --- 2. empty solved via one retry; citation grounded to its note row ---
    def test_empty_solved_via_one_retry_citation_grounded(self):
        cell = self.cells["ALL!V2"]
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.value, "7.25")
        self.assertEqual(len(cell.attempts), 2)                # Tier 1 + one LLM retry
        self.assertEqual(cell.attempts[1]["tier"], "LLM")
        self.assertIn("7.25", cell.attempts[1]["result"])
        # The verbatim citation is grounded INTO the source, linked to its row.
        src = cell.sources[0]
        self.assertEqual(src["citations"], ["Cord arterial pH 7.25 on delivery"])
        self.assertEqual(src["row_id"], "n-11")
        self.assertEqual(src["table_column"], "notes.text")
        self.assertNotIn("record_id", src)
        self.assertEqual(self.llm._per_cell[("cord_arterial_ph", "P001")], 2)
        # A retry ran (interpreted, not a deterministic code translation) → medium.
        self.assertEqual(cell.confidence, "medium")

    # --- 3. unresolvable left open for Tier 3 -------------------------------
    def test_unresolvable_left_open_for_tier3(self):
        cell = self.cells["ALL!T3"]
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertIn("Tier 3", cell.hypothesis)
        self.assertEqual(len(cell.attempts), 1)

    # --- 4. off-code solution rejected by the DB trigger; rides on attempts[] --
    def test_off_code_solution_rejected_and_rides_attempts(self):
        cell = self.cells["ALL!T4"]
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertEqual(len(cell.attempts), 2)
        # The store's off-code trigger is the validator; the rejected value rides on
        # the attempt (the trigger message is generic, the value is the trail).
        self.assertIn("off-code", cell.attempts[1]["error"].lower())
        self.assertEqual(cell.attempts[1]["value"], "5")

    # --- 5. blank-output solution degrades to a clean escalate -------------
    def test_blank_solution_escalates_cleanly(self):
        # A 'solution' with no value is coerced to escalate (never fills an empty
        # string), and — unlike the old parse-rejection — leaves NO "triage
        # failed" noise: the cell is simply handed to Tier 3 with only its
        # Tier-1 attempt on record.
        cell = self.cells["ALL!T5"]
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertEqual(len(cell.attempts), 1)
        self.assertIn("is NULL", cell.attempts[0]["error"])

    # --- 8. ungroundable citation fails the solve --------------------------
    def test_unverifiable_citation_left_pending(self):
        cell = self.cells["ALL!V3"]
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertIn("not verifiable", cell.attempts[-1]["error"])
        self.assertEqual(self.llm._per_cell[("cord_arterial_ph", "P005")], 2)

    # --- invariants --------------------------------------------------------
    def test_every_cell_validates_against_the_contract(self):
        for cell in self.store.get_cells("r1"):
            jsonschema.validate({"cell": _schema_cell(cell)}, SCHEMA)

    def test_le_two_llm_calls_per_cell(self):
        for key, n in self.llm._per_cell.items():
            self.assertLessEqual(n, 2, f"too many looks for {key}")


class TryLlmProvenanceTest(unittest.TestCase):
    """Tier 2 reads the code-drift source's table.column from the Tier-1 attempt
    (A3 writes it), NOT by re-parsing the SQL — so a legal-but-unparseable
    narrowed query still yields a correct source for the FE highlight."""

    def test_code_drift_source_comes_from_attempt_table_column(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d) / "state.db")
            store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
            store.materialize_field_codes("r1", _audit())
            # A narrowed SQL the _NARROWED regex CANNOT parse (aliased table), but
            # Tier 1 wrote the real table.column onto the attempt.
            store.insert_pending_cells([
                Cell(run_id="r1", ref="ALL!T2", field="delivery", member="P001",
                     kind="direct", state="pending",
                     attempts=[{
                         "tier": "direct", "database": "cord-ph",
                         "sql": "SELECT b.delivery FROM births b WHERE b.patient_code = 'P001'",
                         "table_column": "births.delivery", "value": "Forceps",
                         "error": "value 'Forceps' not in the code map",
                     }]),
            ])
            rs = RunStore(store, "r1", cohort=["P001"], audit=_audit())
            llm = _FakeLLM({("delivery", "P001", 1): {
                "decision": "solution", "output": "3",
                "reason": "Forceps → 3", "explanation": "Mapped 'Forceps' to 3.",
            }})
            asyncio.run(try_llm(rs, llm=llm))
            cell = store.get_cell("r1", "ALL!T2")
            self.assertEqual(cell.state, "filled")
            # Read from the attempt's table_column, not the (unparseable) SQL.
            self.assertEqual(cell.sources[0]["table_column"], "births.delivery")
            store.close()


class TryLlmRobustnessTest(unittest.TestCase):
    """Findings 6–7: a failing LLM reply and a retry with no DB never abort the
    run — the cell is left pending with the reason recorded."""

    def _run_store(self, *, with_db: bool):
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!V2", field="cord_arterial_ph", member="P001",
                 kind="direct", state="pending",
                 attempts=[{"tier": "direct", "database": "cord-ph",
                            "sql": "SELECT cord_arterial_ph FROM births WHERE patient_code = 'P001'",
                            "table_column": "births.cord_arterial_ph",
                            "error": "births.cord_arterial_ph is NULL for P001"}]),
        ])
        paths = {}
        if with_db:
            self.db_path = self.root / "cord-ph.sqlite"
            sqlite3.connect(self.db_path).close()
            paths = {"cord-ph": self.db_path}
        return RunStore(self.store, "r1", cohort=["P001"],
                        database_paths=paths, audit=_audit())

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def test_llm_transport_error_leaves_cell_pending(self):
        rs = self._run_store(with_db=True)
        llm = _FakeLLM({("cord_arterial_ph", "P001", 1):
                        RuntimeError("LLM endpoint returned 503")})
        asyncio.run(try_llm(rs, llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("Tier-2 triage failed", cell.attempts[-1]["error"])
        self.assertIn("503", cell.attempts[-1]["error"])

    def test_retry_without_bound_db_is_recorded_and_escalated(self):
        rs = self._run_store(with_db=False)
        llm = _FakeLLM({("cord_arterial_ph", "P001", 1): {
            "decision": "retry",
            "output": "SELECT text FROM notes WHERE patient_code = 'P001'",
            "reason": "notes likely carry it",
        }})
        asyncio.run(try_llm(rs, llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        retry_attempt = cell.attempts[-1]
        self.assertIn("no clinical database is bound", retry_attempt["error"])
        self.assertNotIn("result", retry_attempt)   # not a faked success
        self.assertEqual(len(llm.calls), 1)          # only the first look ran


class TryLlmConfidenceAndEvidenceTest(unittest.TestCase):
    """Confidence by case + evidence-or-escalate guards (review round 3)."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.db_path = self.root / "cord-ph.sqlite"
        conn = sqlite3.connect(self.db_path)
        conn.executescript(
            "CREATE TABLE notes (note_id TEXT, patient_code TEXT, text TEXT);"
            # The SAME boilerplate sentence in two different notes → ambiguous.
            "INSERT INTO notes VALUES "
            "('n-1', 'P010', 'Routine delivery; cord gases sent'),"
            "('n-2', 'P010', 'Routine delivery; cord gases sent');"
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _pending(self, ref, field, member):
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref=ref, field=field, member=member, kind="direct",
                 state="pending",
                 attempts=[{"tier": "direct", "database": "cord-ph",
                            "sql": f"SELECT {field} FROM births",
                            "table_column": f"births.{field}",
                            "error": "NULL"}]),
        ])

    def _store_with(self, paths):
        return RunStore(self.store, "r1", cohort=["P010"],
                        database_paths=paths, audit=_audit())

    def test_first_look_solution_with_no_tier1_value_is_rejected(self):
        # Tier 1 read NULL (no `value`), so a first-look "solution" has nothing to
        # translate — it would fabricate a value with an empty source. Reject it.
        self._pending("ALL!V2", "cord_arterial_ph", "P010")
        llm = _FakeLLM({("cord_arterial_ph", "P010", 1): {
            "decision": "solution", "output": "7.20",
            "reason": "looks normal", "explanation": "Assumed a normal value."}})
        asyncio.run(try_llm(self._store_with({"cord-ph": self.db_path}), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertIn("read no value to translate", cell.attempts[-1]["error"])

    def test_structured_retry_with_no_rows_is_not_filled(self):
        # retry returns zero rows; look-2 solves with no citations → no evidence →
        # escalate, never fill.
        self._pending("ALL!V2", "cord_arterial_ph", "P010")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P010", 1): {
                "decision": "retry",
                "output": "SELECT note_id, text FROM notes WHERE patient_code = 'NOBODY'",
                "reason": "check notes"},
            ("cord_arterial_ph", "P010", 2): {
                "decision": "solution", "output": "7.20",
                "reason": "guessed", "explanation": "No rows but I'll guess."},
        })
        asyncio.run(try_llm(self._store_with({"cord-ph": self.db_path}), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIsNone(cell.value)
        self.assertIn("no supporting source", cell.attempts[-1]["error"])

    def test_ambiguous_citation_left_pending(self):
        # The citation matches BOTH notes → cannot say which → non-verifiable.
        self._pending("ALL!V2", "cord_arterial_ph", "P010")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P010", 1): {
                "decision": "retry",
                "output": "SELECT note_id, text FROM notes WHERE patient_code = 'P010'",
                "reason": "check notes"},
            ("cord_arterial_ph", "P010", 2): {
                "decision": "solution", "output": "7.20",
                "reason": "from the note", "explanation": "Read from the note.",
                "citations": ["Routine delivery; cord gases sent"]},  # in n-1 AND n-2
        })
        asyncio.run(try_llm(self._store_with({"cord-ph": self.db_path}), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("ambiguous", cell.attempts[-1]["error"])

    def test_multi_db_emits_per_cell_routing_activity(self):
        # T12: Tier 2 routes per cell — the activity says so (the old
        # "one database at a time" primary-DB routing is retired).
        self._pending("ALL!T2", "delivery", "P010")
        events = []
        rs = RunStore(self.store, "r1", cohort=["P010"], audit=_audit(),
                      database_paths={"cord-ph": self.db_path,
                                      "labs": self.root / "labs.sqlite"},
                      emit=events.append)
        llm = _FakeLLM({("delivery", "P010", 1): {
            "decision": "escalate", "output": None, "reason": "needs the agent"}})
        asyncio.run(try_llm(rs, llm=llm))
        headlines = [e.get("headline", "") for e in events if e.get("type") == "activity"]
        self.assertTrue(
            any("Routing each unresolved value to its own database" in h for h in headlines),
            headlines,
        )


class TryLlmMultiDbRoutingTest(unittest.TestCase):
    """T12 multi-DB runtime: each cell's retry runs against ITS OWN database,
    resolved from the Tier-1 attempt's provenance — and a multi-DB cell with no
    resolvable database keeps no runner and escalates (never guesses a DB)."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        # Two databases with DISJOINT tables: a retry routed to the wrong one
        # errors on a missing table, so a filled cell PROVES the routing.
        self.ehr_path = self.root / "ehr.sqlite"
        conn = sqlite3.connect(self.ehr_path)
        conn.executescript(
            "CREATE TABLE notes (note_id TEXT, patient_code TEXT, text TEXT);"
            "INSERT INTO notes VALUES ('n-1', 'P010', 'EHR note: thick meconium');"
        )
        conn.commit()
        conn.close()
        self.labs_path = self.root / "labs.sqlite"
        conn = sqlite3.connect(self.labs_path)
        conn.executescript(
            "CREATE TABLE results (result_id TEXT, patient_code TEXT, text TEXT);"
            "INSERT INTO results VALUES ('l-1', 'P010', 'Lab note: cord pH 7.01');"
        )
        conn.commit()
        conn.close()
        self.paths = {"ehr": self.ehr_path, "labs": self.labs_path}

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _run_store(self):
        return RunStore(self.store, "r1", cohort=["P010"], audit=_audit(),
                        database_paths=self.paths,
                        executable={"identity_keys": ["patient_code"]})

    def _pending(self, ref, field, member, attempt_db):
        attempts = []
        if attempt_db is not None:
            attempts = [{"tier": "direct", "database": attempt_db,
                         "sql": f"SELECT x FROM t", "table_column": "t.x",
                         "error": "NULL"}]
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref=ref, field=field, member=member, kind="direct",
                 state="pending", attempts=attempts),
        ])

    def test_cell_retry_routes_to_its_attempt_database(self):
        # The cell's Tier-1 provenance says "labs"; the retry's `results` table
        # exists ONLY in labs.sqlite. Filling succeeds iff routing is per-cell.
        self._pending("ALL!V2", "cord_arterial_ph", "P010", attempt_db="labs")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P010", 1): {
                "decision": "retry",
                "output": "SELECT result_id, patient_code, text FROM results WHERE patient_code = 'P010'",
                "reason": "check the lab results"},
            ("cord_arterial_ph", "P010", 2): {
                "decision": "solution", "output": "7.01",
                "reason": "from the lab note", "explanation": "Read from the lab note.",
                "citations": ["Lab note: cord pH 7.01"]},
        })
        asyncio.run(try_llm(self._run_store(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.value, "7.01")
        self.assertEqual(cell.sources[0]["database"], "labs")

    def test_unroutable_multi_db_cell_escalates_without_guessing(self):
        # No Tier-1 provenance + two bound databases: the retry cannot be
        # routed — recorded and left for Tier 3 (which sees every database).
        self._pending("ALL!V2", "cord_arterial_ph", "P010", attempt_db=None)
        llm = _FakeLLM({
            ("cord_arterial_ph", "P010", 1): {
                "decision": "retry",
                "output": "SELECT text FROM notes WHERE patient_code = 'P010'",
                "reason": "check notes"},
        })
        asyncio.run(try_llm(self._run_store(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("no clinical database is bound", cell.attempts[-1]["error"])


class TryLlmStructuredAndSliceTest(unittest.TestCase):
    """source_column-based structured solves (A4/P2), slice-consistent grounding
    (A1), empty-citations rejection (A2), and attempt.database presence (P1)."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.db_path = self.root / "cord-ph.sqlite"
        conn = sqlite3.connect(self.db_path)
        conn.executescript(
            "CREATE TABLE notes (note_id TEXT, patient_code TEXT, text TEXT);"
            "CREATE TABLE charts (chart_id TEXT, patient_code TEXT, value TEXT);"
            "INSERT INTO charts VALUES ('c-1', 'P020', '7.18');"
        )
        # 8 notes for P030: the boilerplate appears in note 2 (shown) AND note 7
        # (NOT shown — beyond the 5-row prompt slice).
        for i in range(1, 9):
            text = ("Routine delivery; cord gases sent" if i in (2, 7)
                    else f"unrelated note {i}")
            conn.execute("INSERT INTO notes VALUES (?, 'P030', ?)",
                         (f"n-{i:02d}", text))
        conn.commit()
        conn.close()

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _pending(self, ref, field, member, value=None):
        attempt = {"tier": "direct", "database": "cord-ph",
                   "sql": f"SELECT {field} FROM births",
                   "table_column": f"births.{field}", "error": "NULL"}
        if value is not None:
            attempt["value"] = value
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref=ref, field=field, member=member, kind="direct",
                 state="pending", attempts=[attempt]),
        ])

    def _rs(self):
        return RunStore(self.store, "r1", cohort=["P020", "P030"],
                        database_paths={"cord-ph": self.db_path}, audit=_audit())

    def test_structured_retry_with_source_column_fills(self):
        self._pending("ALL!V2", "cord_arterial_ph", "P020")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P020", 1): {
                "decision": "retry",
                "output": "SELECT chart_id, value FROM charts WHERE patient_code = 'P020'",
                "reason": "value lives in charts"},
            ("cord_arterial_ph", "P020", 2): {
                "decision": "solution", "output": "7.18",
                "reason": "from charts", "explanation": "Read it from the chart.",
                "source_column": "charts.value"},
        })
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.value, "7.18")
        self.assertEqual(cell.sources[0]["table_column"], "charts.value")
        self.assertNotIn("citations", cell.sources[0])

    def test_structured_retry_without_source_column_escalates(self):
        self._pending("ALL!V2", "cord_arterial_ph", "P020")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P020", 1): {
                "decision": "retry",
                "output": "SELECT chart_id, value FROM charts WHERE patient_code = 'P020'",
                "reason": "value lives in charts"},
            ("cord_arterial_ph", "P020", 2): {
                "decision": "solution", "output": "7.18",
                "reason": "from charts", "explanation": "Read it somewhere."},  # no column
        })
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("cannot record source", cell.attempts[-1]["error"])

    def test_citation_grounds_against_shown_slice_only(self):
        # The boilerplate is in note 2 (shown) and note 7 (unshown). Scanning only
        # the shown slice, it matches exactly once → grounds (not flagged ambiguous).
        self._pending("ALL!V3", "cord_arterial_ph", "P030")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P030", 1): {
                "decision": "retry",
                "output": "SELECT note_id, text FROM notes WHERE patient_code = 'P030' ORDER BY note_id",
                "reason": "check notes"},
            ("cord_arterial_ph", "P030", 2): {
                "decision": "solution", "output": "7.30",
                "reason": "from the note", "explanation": "Read it from the note.",
                "citations": ["Routine delivery; cord gases sent"]},
        })
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V3")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.sources[0]["row_id"], "n-02")  # the shown match

    def test_llm_empty_citations_list_left_pending(self):
        # citations=[] fails TriageDecision validation (min_length=1) → caught →
        # cell stays pending, never silently taking the structured branch.
        self._pending("ALL!V2", "cord_arterial_ph", "P020")
        llm = _FakeLLM({("cord_arterial_ph", "P020", 1): {
            "decision": "solution", "output": "7.20", "reason": "x",
            "explanation": "y", "citations": []}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("Tier-2 triage failed", cell.attempts[-1]["error"])

    def test_tier2_attempts_carry_database(self):
        # Tier 1 read "Caesarean" (a value), LLM maps to off-code "9" → the DB
        # trigger rejects; the off-code attempt carries the value + the bound DB.
        self._pending("ALL!T2", "delivery", "P020", value="Caesarean")
        llm = _FakeLLM({("delivery", "P020", 1): {
            "decision": "solution", "output": "9",
            "reason": "guess", "explanation": "guessed"}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!T2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("off-code", cell.attempts[-1]["error"].lower())
        self.assertEqual(cell.attempts[-1]["value"], "9")
        self.assertEqual(cell.attempts[-1]["database"], "cord-ph")

    def test_offcode_after_retry_preserves_attempt_trail(self):
        # Retry runs (attempt appended) then look-2 proposes an off-code value; the
        # DB trigger rejects on _settle_solution's UPDATE, and the off-code attempt
        # is appended AFTER the retry one — the full trail survives the rollback.
        self._pending("ALL!T2", "delivery", "P020")  # coded field, Tier-1 NULL
        llm = _FakeLLM({
            ("delivery", "P020", 1): {
                "decision": "retry",
                "output": "SELECT chart_id, value FROM charts WHERE patient_code='P020'",
                "reason": "look in charts"},
            ("delivery", "P020", 2): {
                "decision": "solution", "output": "9", "reason": "from chart",
                "explanation": "read it", "source_column": "charts.value"}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!T2")
        self.assertEqual(cell.state, "pending")
        self.assertEqual([a["tier"] for a in cell.attempts], ["direct", "LLM", "LLM"])
        self.assertIn("SELECT chart_id", cell.attempts[1]["sql"])   # retry preserved
        self.assertIn("off-code", cell.attempts[2]["error"].lower())

    def test_source_column_with_quotes_normalised(self):
        self._pending("ALL!V2", "cord_arterial_ph", "P020")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P020", 1): {
                "decision": "retry",
                "output": "SELECT chart_id, value FROM charts WHERE patient_code='P020'",
                "reason": "charts"},
            ("cord_arterial_ph", "P020", 2): {
                "decision": "solution", "output": "7.18", "reason": "chart",
                "explanation": "read it", "source_column": '"charts"."value"'}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.sources[0]["table_column"], "charts.value")

    def test_first_look_on_interpret_cell_says_no_anchor(self):
        # An interpret cell has no Tier-1 attempt; the rejection message should not
        # claim "Tier 1 read no value" — it should say there's nothing to anchor.
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref="ALL!S2", field="cord_arterial_ph", member="P020",
                 kind="interpret", state="pending")])
        llm = _FakeLLM({("cord_arterial_ph", "P020", 1): {
            "decision": "solution", "output": "7.2", "reason": "guess",
            "explanation": "guessed"}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!S2")
        self.assertEqual(cell.state, "pending")
        self.assertIn("no Tier-1 attempt to anchor", cell.attempts[-1]["error"])


class TryLlmScopeAndProvenanceTest(unittest.TestCase):
    """Cohort scoping (anchor set), numeric grounding, per-column attribution, and
    fan-out isolation."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.store = Store(self.root / "state.db")
        self.store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))
        self.store.materialize_field_codes("r1", _audit())
        self.db_path = self.root / "cord-ph.sqlite"
        conn = sqlite3.connect(self.db_path)
        conn.executescript(
            "CREATE TABLE notes (note_id TEXT, patient_id TEXT, patient_code TEXT, "
            "title TEXT, body TEXT);"
            "CREATE TABLE charts (chart_id TEXT, patient_code TEXT, value REAL);"
            # P001's note (title + body carry different citations); P002's note carries
            # a phrase that appears ONLY for P002 (the cross-patient leak case).
            "INSERT INTO notes VALUES ('n-1','pid-1','P001','Cord around neck','BP 140/90 on admission');"
            "INSERT INTO notes VALUES ('n-9','pid-9','P002','Meconium stained liquor','other');"
            "INSERT INTO charts VALUES ('c-1','P001',7.18);"
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.store.close()
        self._dir.cleanup()

    def _pending(self, ref, field, member):
        self.store.insert_pending_cells([
            Cell(run_id="r1", ref=ref, field=field, member=member, kind="direct",
                 state="pending",
                 attempts=[{"tier": "direct", "database": "cord-ph", "sql": "SELECT x",
                            "table_column": f"births.{field}", "error": "NULL"}])])

    def _rs(self):
        return RunStore(self.store, "r1", cohort=["P001", "P002"], anchor="patient_code",
                        database_paths={"cord-ph": self.db_path}, audit=_audit())

    def test_cross_patient_citation_rejected(self):
        # The cell is P001's; the LLM's unscoped retry returns BOTH patients' notes and
        # cites a phrase only in P002's row. Scoping skips foreign rows → the citation
        # grounds to nothing in-cohort → rejected (the dropped identity trigger's job).
        self._pending("ALL!V2", "cord_arterial_ph", "P001")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P001", 1): {
                "decision": "retry",
                "output": "SELECT note_id, patient_code, title FROM notes", "reason": "notes"},
            ("cord_arterial_ph", "P001", 2): {
                "decision": "solution", "output": "7.2", "reason": "note",
                "explanation": "from note", "citations": ["Meconium stained liquor"]}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "pending")  # P002's row can't fill P001's cell

    def test_numeric_column_citation_grounds(self):
        # A verbatim citation against a REAL column must still ground (no str-only guard).
        self._pending("ALL!V2", "cord_arterial_ph", "P001")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P001", 1): {
                "decision": "retry",
                "output": "SELECT chart_id, patient_code, value FROM charts WHERE patient_code='P001'",
                "reason": "charts"},
            ("cord_arterial_ph", "P001", 2): {
                "decision": "solution", "output": "7.18", "reason": "chart",
                "explanation": "from chart", "citations": ["7.18"]}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "filled")
        self.assertEqual(cell.sources[0]["table_column"], "charts.value")
        self.assertEqual(cell.sources[0]["row_id"], "c-1")  # PK, not the patient_code FK

    def test_two_citations_different_columns_same_row(self):
        # Two citations from one row's different columns → two sources, each labelled
        # with its OWN column (not both under the first).
        self._pending("ALL!V2", "cord_arterial_ph", "P001")
        llm = _FakeLLM({
            ("cord_arterial_ph", "P001", 1): {
                "decision": "retry",
                "output": "SELECT note_id, patient_code, title, body FROM notes WHERE patient_code='P001'",
                "reason": "notes"},
            ("cord_arterial_ph", "P001", 2): {
                "decision": "solution", "output": "7.2", "reason": "notes",
                "explanation": "from two fields",
                "citations": ["Cord around neck", "BP 140/90 on admission"]}})
        asyncio.run(try_llm(self._rs(), llm=llm))
        cell = self.store.get_cell("r1", "ALL!V2")
        self.assertEqual(cell.state, "filled")
        cols = {s["table_column"] for s in cell.sources}
        self.assertEqual(cols, {"notes.title", "notes.body"})

    def test_one_failing_cell_does_not_cancel_siblings(self):
        # A store error on one cell's write must not cancel the rest of the fan-out.
        self._pending("ALL!V2", "cord_arterial_ph", "P001")  # will be made to fail
        self._pending("ALL!V3", "cord_arterial_ph", "P002")  # must still escalate cleanly
        rs = self._rs()
        real_update = rs.update

        async def boom(ref, **f):
            if ref == "ALL!V2" and f.get("state") != "blocked":
                raise RuntimeError("simulated trigger ABORT")
            return await real_update(ref, **f)
        rs.update = boom
        llm = _FakeLLM({
            ("cord_arterial_ph", "P001", 1): {"decision": "retry", "output": "SELECT 1",
                                              "reason": "x"},
            ("cord_arterial_ph", "P001", 2): {"decision": "escalate", "output": None,
                                              "reason": "x"},
            ("cord_arterial_ph", "P002", 1): {"decision": "escalate", "output": None,
                                              "reason": "needs agent"}})
        # _resolve_one for V2 leaves it pending via update(attempts/hypothesis) → boom
        # raises; the _bounded guard catches it. V3 must be untouched-but-resolved.
        asyncio.run(try_llm(rs, llm=llm))
        self.assertEqual(self.store.get_cell("r1", "ALL!V3").state, "pending")
        self.assertIn("needs agent", self.store.get_cell("r1", "ALL!V3").hypothesis)


class TryLlmIntegrationTest(unittest.TestCase):
    """End-to-end through the orchestrator: Tier 1 stub leaves a pending cell,
    Tier 2 fills it, Tier 3 stub fires only on what Tier 2 leaves open."""

    def test_orchestrator_calls_try_llm_after_tier1_then_status_recomputes(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d) / "state.db")
            store.create_run(Run(id="r1", audit_id="cord-ph", status="in_progress"))

            executable = {
                "regions": [{
                    "id": "ALL", "sheet": "ALL", "kind": "direct",
                    "cell_map": [{
                        "field": "delivery", "column": "delivery",
                        "table": "births", "cell_template": "{col:T}{row}",
                    }],
                }],
            }
            cohort = ["P001"]

            async def tier_direct(rs):
                for c in rs.open_cells():
                    await rs.update(c.ref, attempts=[{
                        "tier": "direct", "database": "cord-ph",
                        "sql": "SELECT delivery FROM births WHERE patient_code = 'P001'",
                        "table_column": "births.delivery", "value": "Forceps",
                        "error": "value 'Forceps' not in the code map",
                    }])

            llm = _FakeLLM({
                ("delivery", "P001", 1): {
                    "decision": "solution", "output": "3",
                    "reason": "Forceps → code 3",
                    "explanation": "Mapped 'Forceps' to code 3.",
                },
            })
            tier_llm = make_tier_llm(llm=llm)
            agent_calls = []

            def tier_agent(rs):
                agent_calls.append([c.ref for c in rs.open_cells()])

            asyncio.run(orchestrate_run(
                store, "r1", executable, cohort,
                tier_direct=tier_direct, tier_llm=tier_llm, tier_agent=tier_agent,
                audit=_audit(),
            ))

            cell = store.get_cell("r1", "ALL!T2")
            self.assertEqual(cell.state, "filled")
            self.assertEqual(cell.value, "3")
            self.assertEqual(cell.resolved_by, "LLM")
            self.assertEqual(agent_calls, [])
            self.assertEqual(store.recompute_status("r1"), "complete")
            store.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
