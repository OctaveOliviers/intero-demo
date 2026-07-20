"""Verify the `templates` collection — navigation over saved table templates.

The same three navigation verbs (``catalog`` / ``search`` / ``describe``) over the
``templates`` collection: each saved table template is an audit ``spec.json``
(``audit-spec.schema.json``). ``catalog`` lists every template + a one-line
summary; ``search`` greps template/field names, descriptions, and code labels →
candidate ``template[.field]``s; ``describe`` reads a whole template (fields each
``{name, type/format, description, codes}`` + the template's description + grain)
or a single field.

Each call runs the SAME tool entrypoint (``catalog.py`` / ``search.py`` /
``describe.py``) as a subprocess with ``{"collection": "templates", ...}``,
cwd set to a temp run worktree holding ``templates/<id>/spec.json`` — built from the
REAL seeded ``var/templates/<id>/spec.json`` (``cd intero && make seed``) so the
assertions pin concrete clinical fields/codes, not hand-authored stand-ins. This
mirrors how the databases tests build ``cwd/database/`` from the seeded models.

It reads ``spec.json`` ONLY — never a SQLite database, never SQL — and returns
metadata, never clinical cell values.

Run: ``python3 -m core.agent.test.templates_collection_test`` (from intero/).
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS = REPO_ROOT / "core" / "agent" / "tools"
SEEDED = REPO_ROOT / "var" / "templates"


def _seeded_spec(audit_id: str) -> Path:
    path = SEEDED / audit_id / "spec.json"
    if not path.is_file():
        raise unittest.SkipTest(
            f"seeded spec missing: {path} — run `cd intero && make seed` first"
        )
    return path


def _run(tool: str, worktree: Path, request: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / tool), json.dumps(request)],
        capture_output=True,
        text=True,
        cwd=worktree,
    )
    return json.loads(proc.stdout.strip() or proc.stderr.strip())


class TemplatesCatalogTest(unittest.TestCase):
    """`catalog` over the seeded cord-ph + npda templates."""

    TEMPLATES = ("cord-ph", "npda")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        for audit_id in self.TEMPLATES:
            dest = self.worktree / "templates" / audit_id
            dest.mkdir(parents=True)
            shutil.copyfile(_seeded_spec(audit_id), dest / "spec.json")

    def tearDown(self):
        self._dir.cleanup()

    def _catalog(self, request: dict | None = None) -> dict:
        return _run(
            "catalog.py", self.worktree, {"collection": "templates", **(request or {})}
        )

    # --- tracer bullet: lists every template as {id, title, summary} ----------

    def test_lists_all_templates_sorted_by_id(self):
        res = self._catalog()
        self.assertTrue(res["ok"], res)
        ids = [t["id"] for t in res["templates"]]
        self.assertEqual(ids, ["cord-ph", "npda"])

    def test_cord_ph_carries_its_real_title_and_summary(self):
        res = self._catalog()
        cord = next(t for t in res["templates"] if t["id"] == "cord-ph")
        self.assertEqual(cord["title"], "Cord pH Audit")
        # cord-ph's spec has no `summary`, so it falls back to the first sentence
        # of `description` (split on the first ". ").
        self.assertEqual(
            cord["summary"],
            "This audit measures the quality and adherence to protocols regarding "
            "cord care, including cord pH, delivery management, and neonatal "
            "outcomes in the Neonatal Intensive Care Unit (NICU)",
        )

    # --- the defining constraint: NEVER lists a template's fields -------------

    def test_never_lists_fields(self):
        res = self._catalog()
        # Each entry carries only {id, title, summary}; no `fields` key, and no
        # field name leaks into the serialized output (cord-ph has 52 fields).
        for entry in res["templates"]:
            self.assertEqual(set(entry), {"id", "title", "summary"}, entry)
        blob = json.dumps(res)
        cord_fields = [
            f["name"]
            for f in json.loads(_seeded_spec("cord-ph").read_text(encoding="utf-8"))[
                "fields"
            ]
        ]
        self.assertEqual(len(cord_fields), 52, cord_fields)
        # "Delivery" is a real field name distinct from any catalog string.
        self.assertIn("Delivery", cord_fields)
        self.assertNotIn("Delivery", blob)


class TemplatesDescribeTest(unittest.TestCase):
    """`describe` over the seeded cord-ph + npda templates."""

    TEMPLATES = ("cord-ph", "npda")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        for audit_id in self.TEMPLATES:
            dest = self.worktree / "templates" / audit_id
            dest.mkdir(parents=True)
            shutil.copyfile(_seeded_spec(audit_id), dest / "spec.json")

    def tearDown(self):
        self._dir.cleanup()

    def _describe(self, request: dict) -> dict:
        return _run(
            "describe.py", self.worktree, {"collection": "templates", **request}
        )

    # --- tracer bullet: a whole template -> description + grain + fields[] -----

    def test_whole_template_returns_description_grain_and_fields(self):
        res = self._describe({"template": "cord-ph"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["template"], "cord-ph")
        self.assertEqual(res["grain"], "one row per patient record")
        self.assertIn("cord care", res["description"])
        # All 52 fields, each mapped to the navigation field shape.
        self.assertEqual(len(res["fields"]), 52)
        by_name = {f["name"]: f for f in res["fields"]}
        # `Patient code` is a text field: name/type/description from the spec,
        # description carried from the field's `notes`.
        pc = by_name["Patient code"]
        self.assertEqual(pc["name"], "Patient code")
        self.assertEqual(pc["type"], "text")
        self.assertEqual(pc["description"], "Unique identifier for the patient record.")

    # --- a coded field carries its permitted-value codes ----------------------

    def test_whole_template_coded_field_carries_codes(self):
        res = self._describe({"template": "cord-ph"})
        by_name = {f["name"]: f for f in res["fields"]}
        # cord-ph's only coded field. Its codes come from `permitted_values`; its
        # `notes` is empty, so codes are present even with no description.
        delivery = by_name["Delivery"]
        self.assertEqual(delivery["type"], "category")
        self.assertEqual(
            delivery["codes"],
            {
                "1": "Spontaneous vaginal",
                "2": "Emergency caesarean",
                "3": "Forceps",
                "4": "Vacuum",
            },
        )
        # An uncoded field has no `codes` key at all (mirrors a DB column).
        self.assertNotIn("codes", by_name["Patient code"])

    # --- a single field -> just that one field, located by its id -------------

    def test_single_field_returns_just_that_field(self):
        res = self._describe({"template": "cord-ph", "field": "all/delivery"})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["template"], "cord-ph")
        self.assertEqual(res["field"]["name"], "Delivery")
        self.assertEqual(res["field"]["type"], "category")
        self.assertEqual(res["field"]["codes"]["3"], "Forceps")
        # A single-field read does NOT inline the template's whole field list.
        self.assertNotIn("fields", res)
        # ... but still carries the template's description + grain for context.
        self.assertEqual(res["grain"], "one row per patient record")

    def test_single_field_located_by_name_too(self):
        # A field may be addressed by its published `name` as well as its `id`,
        # so the agent can use whichever `search` surfaced.
        by_id = self._describe({"template": "cord-ph", "field": "all/delivery"})
        by_name = self._describe({"template": "cord-ph", "field": "Delivery"})
        self.assertTrue(by_name["ok"], by_name)
        self.assertEqual(by_name["field"], by_id["field"])

    # --- unknown template / field are actionable errors (exit 2) --------------

    def test_unknown_template_errors_and_lists_available(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "describe.py"),
                json.dumps({"collection": "templates", "template": "no-such"}),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such", res["error"])
        # The available templates are named so the agent can self-correct.
        self.assertIn("cord-ph", res["error"])

    def test_unknown_field_errors_and_lists_real_fields(self):
        res = self._describe({"template": "cord-ph", "field": "all/not_a_field"})
        self.assertFalse(res["ok"], res)
        self.assertIn("all/not_a_field", res["error"])
        # The template's real field ids are listed so the agent can correct.
        self.assertIn("all/delivery", res["error"])

    def test_missing_template_is_a_tool_error(self):
        res = self._describe({})
        self.assertFalse(res["ok"], res)
        self.assertIn("template", res["error"])

    # --- read-only / metadata-only: never row values, never SQL ---------------

    def test_response_carries_no_row_values(self):
        res = self._describe({"template": "cord-ph"})
        blob = json.dumps(res)
        self.assertNotIn('"rows"', blob)
        self.assertNotIn('"cells"', blob)


class TemplatesDescribeDegenerateTest(unittest.TestCase):
    """Hand-authored specs: a field's `codes` shape must match what search
    treats as codes — a non-dict `permitted_values` is not a code dictionary."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)

    def tearDown(self):
        self._dir.cleanup()

    def _write(self, audit_id: str, spec: dict) -> None:
        dest = self.worktree / "templates" / audit_id
        dest.mkdir(parents=True)
        (dest / "spec.json").write_text(json.dumps(spec), encoding="utf-8")

    def _describe(self, request: dict) -> dict:
        return _run(
            "describe.py", self.worktree, {"collection": "templates", **request}
        )

    def test_non_dict_permitted_values_yields_no_codes(self):
        # A malformed `permitted_values` that is a list (not a code->meaning map)
        # must NOT surface as `codes` — describe and search agree on what a code
        # dictionary is (search already guards isinstance(codes, dict)).
        self._write(
            "weird",
            {
                "audit": "weird",
                "fields": [
                    {
                        "id": "s/a",
                        "name": "A",
                        "type": "category",
                        "permitted_values": ["x", "y"],
                    },
                ],
            },
        )
        res = self._describe({"template": "weird", "field": "s/a"})
        self.assertTrue(res["ok"], res)
        self.assertNotIn("codes", res["field"])


class TemplatesSearchTest(unittest.TestCase):
    """`search` over the seeded cord-ph + npda templates."""

    TEMPLATES = ("cord-ph", "npda")

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)
        for audit_id in self.TEMPLATES:
            dest = self.worktree / "templates" / audit_id
            dest.mkdir(parents=True)
            shutil.copyfile(_seeded_spec(audit_id), dest / "spec.json")

    def tearDown(self):
        self._dir.cleanup()

    def _search(self, query) -> dict:
        request = {"collection": "templates"}
        if query is not None:
            request["query"] = query
        return _run("search.py", self.worktree, request)

    # --- a keyword over a field name surfaces template.field ------------------

    def test_field_name_match_locates_template_field(self):
        res = self._search("arterial")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["query"], "arterial")
        self.assertEqual(res["match_count"], len(res["matches"]))
        hit = next(
            m
            for m in res["matches"]
            if m["template"] == "cord-ph"
            and m["field"] == "all/cord_arterial_ph"
            and m["matched_on"] == "field_name"
        )
        self.assertIn("arterial", hit["context"].lower())

    # --- a field description (`notes`) match ----------------------------------

    def test_field_description_match(self):
        res = self._search("Unique identifier for the patient record")
        hit = next(
            m
            for m in res["matches"]
            if m["template"] == "cord-ph"
            and m["field"] == "all/patient_code"
            and m["matched_on"] == "field_description"
        )
        self.assertIn("Unique identifier", hit["context"])

    # --- a code-set label hit carries the "code: meaning" context -------------

    def test_code_label_match_returns_code_meaning_context(self):
        res = self._search("Forceps")
        hit = next(
            m
            for m in res["matches"]
            if m["matched_on"] == "code_label"
            and m["template"] == "cord-ph"
            and m["field"] == "all/delivery"
        )
        self.assertIn("Forceps", hit["context"])
        # The label is rendered as "code: meaning" like the databases collection.
        self.assertIn("3: Forceps", hit["context"])

    # --- a template-level match (title/description) -> field is null ----------

    def test_template_description_match_has_null_field(self):
        # "cord care" appears in cord-ph's description but in no field, so it is a
        # template-level hit located as the template (field null).
        res = self._search("cord care")
        hit = next(
            m
            for m in res["matches"]
            if m["template"] == "cord-ph" and m["matched_on"] == "template_description"
        )
        self.assertIsNone(hit["field"])
        self.assertIn("cord care", hit["context"].lower())

    # --- searches ALL saved templates ----------------------------------------

    def test_term_in_both_templates_returns_candidates_from_both(self):
        # "audit" appears in both templates' descriptions/titles.
        res = self._search("audit")
        templates = {m["template"] for m in res["matches"]}
        self.assertEqual(templates, {"cord-ph", "npda"}, res["matches"])

    # --- no match is a clean empty result, NOT an error ----------------------

    def test_non_matching_query_is_clean_empty_not_error(self):
        res = self._search("zzqqxx_no_such_token")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["match_count"], 0)
        self.assertEqual(res["matches"], [])

    # --- empty / missing query is a ToolError --------------------------------

    def test_empty_query_is_a_tool_error(self):
        res = self._search("")
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    def test_missing_query_is_a_tool_error(self):
        res = self._search(None)
        self.assertFalse(res["ok"], res)
        self.assertIn("query", res["error"])

    # --- deterministic / byte-stable + case-insensitive ----------------------

    def test_result_is_byte_stable_and_sorted_by_template(self):
        a = self._search("a")
        b = self._search("a")
        self.assertEqual(json.dumps(a), json.dumps(b))
        templates = [m["template"] for m in a["matches"]]
        self.assertEqual(templates, sorted(templates))

    def test_match_is_case_insensitive(self):
        lower = self._search("forceps")
        upper = self._search("FORCEPS")
        self.assertEqual(lower["match_count"], upper["match_count"])
        self.assertGreater(lower["match_count"], 0)

    # --- read-only / metadata-only -------------------------------------------

    def test_search_carries_no_row_values(self):
        res = self._search("ph")
        blob = json.dumps(res)
        self.assertNotIn('"rows"', blob)
        self.assertNotIn('"cells"', blob)


class TemplatesCatalogDegenerateTest(unittest.TestCase):
    """An empty worktree and a spec with no summary/description."""

    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.worktree = Path(self._dir.name)

    def tearDown(self):
        self._dir.cleanup()

    def _write(self, audit_id: str, spec: dict) -> None:
        dest = self.worktree / "templates" / audit_id
        dest.mkdir(parents=True)
        (dest / "spec.json").write_text(json.dumps(spec), encoding="utf-8")

    def _catalog(self) -> dict:
        return _run("catalog.py", self.worktree, {"collection": "templates"})

    # --- zero saved templates -> a clean empty list, NOT an error ------------

    def test_no_templates_is_clean_empty_list(self):
        res = self._catalog()
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["templates"], [])

    # --- neither summary nor description -> summary null; absent title null ---

    def test_no_summary_no_description_yields_nulls(self):
        self._write("bare", {"audit": "bare", "fields": []})
        res = self._catalog()
        self.assertTrue(res["ok"], res)
        entry = next(t for t in res["templates"] if t["id"] == "bare")
        self.assertIsNone(entry["summary"])
        self.assertIsNone(entry["title"])

    # --- a spec whose top level is not a JSON object fails cleanly -----------

    def test_non_object_spec_returns_error_not_crash(self):
        # A spec.json whose top level is a JSON array (not an object) must be
        # rejected at the shared loader with the {"ok": false, "error": …}
        # contract — never a raw AttributeError + exit 1.
        dest = self.worktree / "templates" / "broken"
        dest.mkdir(parents=True)
        (dest / "spec.json").write_text(
            json.dumps(["not", "an", "object"]), encoding="utf-8"
        )
        res = self._catalog()
        self.assertFalse(res["ok"], res)
        self.assertIn("not a JSON object", res["error"], res)

    # --- an unknown `collection` is still the standard actionable error ------

    def test_unknown_collection_is_actionable_error_exit_2(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(TOOLS / "catalog.py"),
                json.dumps({"collection": "no-such-collection"}),
            ],
            capture_output=True,
            text=True,
            cwd=self.worktree,
        )
        self.assertEqual(proc.returncode, 2, proc.stderr)
        res = json.loads(proc.stdout.strip() or proc.stderr.strip())
        self.assertFalse(res["ok"], res)
        self.assertIn("no-such-collection", res["error"])
        # Both collections are now named so the agent can self-correct.
        self.assertIn("templates", res["error"])
        self.assertIn("databases", res["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
