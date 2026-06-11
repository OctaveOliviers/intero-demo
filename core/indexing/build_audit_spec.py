"""Deterministic builder for the audit specification (`spec.json`).

**CURRENTLY DEAD CODE IN THE MVP PATH (2026-06-07).** The MVP audit's
`spec.json` is hand-authored against the contract
(`docs/mvp/contracts/audit-spec.schema.json`); this LLM-driven builder is
unused. **Do not delete** — this code will be re-activated when the indexing
pipeline returns. The known bugs surfaced by the A5 review are left UNFIXED
so that the resumption work can address them deliberately
(see `docs/mvp/BUILD-PLAN.md` §A5):

  - #2 — ``_HEADER_ROW = "1"`` + ``ref.endswith()`` matches ``A11``,
    ``A21``, ``A101`` etc. as if they were header cells. The right altitude
    is structural (row index, not string suffix).
  - #3 — ``_coverage_problems`` runs after ``merge_preserved_state``;
    library-shortened ids break re-index because the coverage check is
    blind to the slug rename and reports false-positives.
  - #4 — ``slugify(header) ≠ slugify(name)`` when the LLM cleans header
    text into a name. The FK chain depends on the two slugs matching;
    until the builder copies ``header`` verbatim into ``name`` the seam
    is fragile.
  - #7 — ``_coverage_problems`` truncates the missing list to 20 entries
    in retry feedback; later-sheet misses are silently hidden from the
    LLM retry and the model never converges.
  - #8 (altitude) — the whole "EVERY SHEET, EVERY FIELD" prompt + coverage
    guard + token-cap bumps exist because the LLM is doing field
    enumeration. The right altitude is mechanically populating the
    ``fields[]`` skeleton from ``extract_layout`` and letting the LLM only
    fill prose. That becomes the rewrite premise when the indexer
    returns.

---

Emits the structured `spec.json` (mapping-artifact-redesign.md §3.1): the audit's
per-field specification plus its inclusion criteria. Database-agnostic — built
before any database is chosen, so it carries NO `kind` (direct/interpret is decided
at mapping, once the DB is known). The workbook layout is extracted mechanically
with openpyxl and flows through as data; one LLM call supplies the judgment — field
meanings, types, permitted value sets, notes (with any standard citation inline),
and the ~5 suggested inclusion criteria.

The field spec is REGENERABLE; the user-set state the document carries —
`inclusion_criteria[].default`, and any library-added `notes`/`permitted_values`
for a local template — is PRESERVED across re-index by a small merge on stable keys
(`field.number` / `criterion.id`, §6). The model is validated against the S0 schema
(`audit-spec.schema.json`) before it is returned, so the service never writes a
broken file.
"""

from __future__ import annotations

import json
import logging
import re
import warnings
from datetime import date, datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from core.clients import llm
from core.indexing.profile import validate_against_schema
from core.slug import slugify

# Header rows are conventionally row 1 — the audit-spec maps one header cell
# per field. Any non-empty header cell on any sheet contributes one expected
# field, so a multi-sheet workbook's coverage is the sum across sheets.
_HEADER_ROW = "1"

logger = logging.getLogger(__name__)

_SCHEMA_FILE = "audit-spec.schema.json"
_MAX_BUILD_ATTEMPTS = 3
_VALID_TYPES = {"category", "number", "date", "text", "boolean"}


class BuilderValidationError(RuntimeError):
    """Raised when the builder's LLM output cannot be made into a valid model
    after all retries. The caller (service.run_indexing) marks the entity
    `status: error` and no broken model is ever written."""


_PROMPT = """\
You write the specification for a clinical audit from its workbook layout. You are
given the extracted layout of an XLSX audit template (sheets, cells, headers,
merged ranges). Produce ONLY a single JSON object — no preamble, no markdown
fences, no commentary.

This is the AUDIT SPECIFICATION: what each field MEANS and EXPECTS, plus the
dimensions the audit can be filtered on. It is database-agnostic — you do NOT know
which database will source the values, so you MUST NOT name any table or column,
and you MUST NOT say whether a field is copied or interpreted (that is decided
later, at mapping). Describe only what each field is.

Output shape:

{
  "title": "<human-readable audit title>",
  "description": "<one paragraph: what this audit measures and its provenance>",
  "version": "<dataset/spec version if known, else omit>",
  "grain": "<what one row represents, e.g. 'one row per baby / birth record'>",
  "sections": [ { "id": "<slug>", "name": "<section name>" } ],
  "fields": [
    { "number": <1-based item number>, "section": "<section slug, optional>",
      "cell": "<column letter the field is written to, e.g. 'T'>",
      "name": "<field name>",
      "type": "category | number | date | text | boolean",
      "unit": "<unit if numeric, optional>", "format": "<entry format hint, optional>",
      "permitted_values": { "<code>": "<meaning>" },
      "notes": "<operational guidance + rationale + any standard citation inline, e.g. [NG18: 1.2.46]>" }
  ],
  "inclusion_criteria": [
    { "id": "<slug>", "label": "<human-readable label>",
      "type": "category | number | date | number | boolean" }
  ]
}

Rules:
1. **EVERY SHEET, EVERY FIELD.** Emit one `fields` entry for EVERY non-empty
   header cell in EVERY sheet listed under `sheets` in the input. Sheets are
   sections of the same audit; **never drop a sheet**. If the input has 3 sheets
   with 39 / 13 / 7 headers, you emit 59 `fields` entries. The example output
   block above shows a single sheet for brevity; that is NOT a license to flatten
   a multi-sheet workbook. Cross-check by summing headers per sheet before you
   start writing.
2. One `fields` entry per real data field in the template; `number` is its
   1-based item number across the WHOLE audit (start at 1 on the first sheet,
   keep counting on the second). Do NOT emit `id`; it is derived deterministically
   from `name` by the caller. Use `section` to mark which sheet/group a field
   belongs to (one section per sheet is the natural mapping).
- `type` is exactly one of: category, number, date, text, boolean.
- `permitted_values` is the audit's canonical CODED set as a code -> meaning map
  (e.g. {"1":"Male","2":"Female"}). Include it ONLY for category fields that have a
  fixed value set; omit it otherwise. Never write it as prose.
- `notes` is the ONE prose field — fold guidance, rationale, and any standard
  citation into it. Omit if there is nothing to say.
- `inclusion_criteria`: suggest only the ~5 MOST LIKELY dimensions a clinician
  would filter this audit's cohort on (e.g. gestation, mode of delivery, dates,
  NICU admission, patient age). Each is a database-agnostic CONCEPT — give it an
  id, a label, and a type. Do NOT pick default values; defaults are set later.
- Do NOT name any database table or column anywhere.
- Output only the JSON object, starting with `{`.
"""


# --- workbook layout extraction (deterministic skeleton) ----------------------

def _serialize_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _describe_sheet(worksheet: Any) -> dict[str, Any]:
    max_row = worksheet.max_row or 0
    max_col = worksheet.max_column or 0
    cells: list[dict[str, Any]] = []
    empty_row_flags: list[bool] = []

    for row_index in range(1, max_row + 1):
        row_fully_empty = True
        for col_index in range(1, max_col + 1):
            cell = worksheet.cell(row=row_index, column=col_index)
            value = _serialize_cell(cell.value)
            number_format = (
                cell.number_format
                if cell.number_format and cell.number_format != "General"
                else None
            )
            if value != "" and value is not None:
                row_fully_empty = False
                entry: dict[str, Any] = {"cell": cell.coordinate, "value": value}
                if number_format:
                    entry["numberFormat"] = number_format
                cells.append(entry)
            elif number_format:
                cells.append({"cell": cell.coordinate, "value": None, "numberFormat": number_format})
        empty_row_flags.append(row_fully_empty)

    empty_blocks: list[str] = []
    if max_col > 0:
        last_col_letter = get_column_letter(max_col)
        start: int | None = None
        for index, is_empty in enumerate(empty_row_flags, start=1):
            if is_empty and start is None:
                start = index
            elif not is_empty and start is not None:
                empty_blocks.append(f"A{start}:{last_col_letter}{index - 1}")
                start = None
        if start is not None:
            empty_blocks.append(f"A{start}:{last_col_letter}{max_row}")

    merged_ranges = (
        [str(ref) for ref in worksheet.merged_cells.ranges]
        if hasattr(worksheet, "merged_cells")
        else []
    )

    return {
        "name": worksheet.title,
        "dimensions": {"rows": max_row, "cols": max_col},
        "mergedRanges": merged_ranges,
        "cells": cells,
        "emptyBlocks": empty_blocks,
    }


def extract_layout(workbook_path: Path) -> list[dict[str, Any]]:
    # openpyxl warns about unsupported extensions (e.g. Data Validation) it will
    # drop on read. We only read layout, never write back, so the dropped
    # extensions are irrelevant — silence the noise.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=UserWarning)
        workbook = load_workbook(workbook_path, data_only=False, read_only=False)
    return [_describe_sheet(workbook[name]) for name in workbook.sheetnames]


# --- assembly + state preservation --------------------------------------------

def _parse_json(raw: str) -> dict[str, Any]:
    """Parse the model's JSON, tolerating ```json fences and stray prose."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def _clean_field(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Coerce one LLM field record into the schema shape; drop it if it has no
    usable number/name/type. `id` is filled later by `_assign_ids` (derived from
    `name` via `slugify`, with collision suffixes) so it's stable across re-index
    and matches the mapping FK convention (`build_populate_spec._slug(header)`)."""
    try:
        number = int(raw.get("number"))
    except (TypeError, ValueError):
        return None
    name = str(raw.get("name") or "").strip()
    ftype = str(raw.get("type") or "").strip().lower()
    if not name or number < 1 or ftype not in _VALID_TYPES:
        return None
    field: dict[str, Any] = {"number": number, "name": name, "type": ftype}
    for key in ("section", "cell", "unit", "format", "notes"):
        value = str(raw.get(key) or "").strip()
        if value:
            field[key] = value
    pv = raw.get("permitted_values")
    if isinstance(pv, dict) and pv:
        field["permitted_values"] = {str(k): str(v) for k, v in pv.items()}
    return field


def _assign_ids(fields: list[dict[str, Any]], *, multi_section: bool) -> None:
    """Derive `field.id` for every field. Convention mirrors the mapping compile
    (`build_populate_spec._field_slug`): multi-section audits prefix with the
    section slug (`{slugify(section)}/{slugify(name)}`); single-section audits
    use the bare slug. Same `core.slug.slugify` both sides — the A4↔A5 FK is
    one function. `slugify("")` returns `""`; an empty slug falls back to
    `field_<number>` so the FK is always non-empty.

    **Duplicates raise** — no `_2`/`_3` suffix. Two cells with the same header
    must be disambiguated at source (by section in a multi-section audit, by
    the author renaming a header otherwise). Silent suffixing left orphaned
    audit fields that no mapping cell FK'd into; raising forces the bug to
    surface at build time. Pure side-effect on each field dict."""
    seen: set[str] = set()
    for field in fields:
        base = slugify(field["name"]) or f"field_{field['number']}"
        section = field.get("section")
        slug = (
            f"{slugify(section)}/{base}"
            if multi_section and section
            else base
        )
        if slug in seen:
            raise BuilderValidationError(
                f"duplicate field id {slug!r} (field number {field['number']!r}, "
                f"name {field['name']!r}); two fields cannot share a slug — "
                f"rename one at source"
            )
        seen.add(slug)
        field["id"] = slug


def _clean_criterion(raw: dict[str, Any]) -> dict[str, Any] | None:
    cid = str(raw.get("id") or "").strip()
    label = str(raw.get("label") or "").strip()
    ctype = str(raw.get("type") or "").strip().lower()
    if not cid or not label or ctype not in _VALID_TYPES:
        return None
    # A1 suggests these at upload with no default yet (§6); the LLM never invents
    # a default value.
    return {"id": cid, "label": label, "type": ctype, "suggested": True, "default": None}


def _assemble(audit_id: str, prose: dict[str, Any]) -> dict[str, Any]:
    fields = [f for f in (_clean_field(r) for r in prose.get("fields", []) or [])
              if f is not None]
    # Multi-section audits (one section per workbook sheet) get sheet-prefixed
    # ids — mirrors `build_populate_spec._field_slug`'s multi-sheet detection,
    # so the FK chain is bijective without `_2` suffixes.
    multi_section = len({f.get("section") for f in fields if f.get("section")}) > 1
    _assign_ids(fields, multi_section=multi_section)
    criteria = [c for c in (_clean_criterion(r) for r in prose.get("inclusion_criteria", []) or [])
                if c is not None]
    model: dict[str, Any] = {
        "schema_version": "1",
        "audit": audit_id,
        "title": (prose.get("title") or audit_id).strip(),
        "description": (prose.get("description") or f"Audit specification for {audit_id}.").strip(),
        "grain": (prose.get("grain") or "one row per record").strip(),
        "fields": fields,
        "inclusion_criteria": criteria,
    }
    version = str(prose.get("version") or "").strip()
    if version:
        model["version"] = version
    sections = [
        {"id": str(s["id"]).strip(), "name": str(s["name"]).strip()}
        for s in prose.get("sections", []) or []
        if isinstance(s, dict) and s.get("id") and s.get("name")
    ]
    if sections:
        model["sections"] = sections
    return model


def merge_preserved_state(new_model: dict[str, Any], old_model: dict[str, Any] | None) -> dict[str, Any]:
    """Preserve user-set state across re-index (§6). The regenerated field spec is
    authoritative for structure, but durable user state is carried forward by
    stable key: `inclusion_criteria[].default` by `id`, and library-added
    `notes`/`permitted_values` + the **stable `field.id`** by `field.number`.
    `id` is preserved so a shortened library-set slug (e.g. `delivery` for
    "Mode of delivery") survives a re-index — the FK that downstream `mapping.json`
    executables already hold-onto cannot be broken by a rename. `notes` /
    `permitted_values` are kept only where the regenerated field left them empty,
    so a fresh spec never blows away a clinical lead's fill."""
    if not old_model:
        return new_model

    old_defaults = {
        c.get("id"): c.get("default")
        for c in old_model.get("inclusion_criteria", []) or []
        if isinstance(c, dict) and c.get("default") is not None
    }
    for crit in new_model.get("inclusion_criteria", []):
        preserved = old_defaults.get(crit["id"])
        if preserved is not None:
            crit["default"] = preserved

    old_fields = {
        f.get("number"): f
        for f in old_model.get("fields", []) or []
        if isinstance(f, dict) and isinstance(f.get("number"), int)
    }
    for field in new_model.get("fields", []):
        old = old_fields.get(field["number"])
        if not old:
            continue
        old_id = str(old.get("id") or "").strip()
        if old_id:
            field["id"] = old_id
        if not field.get("notes") and old.get("notes"):
            field["notes"] = old["notes"]
        if not field.get("permitted_values") and old.get("permitted_values"):
            field["permitted_values"] = old["permitted_values"]
    return new_model


def _expected_headers(sheets: list[dict[str, Any]]) -> list[tuple[str, str, str]]:
    """Every non-empty header cell across every sheet, as `(sheet, cell, value)`
    tuples in workbook order. This is the floor the LLM's `fields[]` must cover —
    a single sheet getting dropped is the failure mode the multi-sheet guard
    exists to catch."""
    headers: list[tuple[str, str, str]] = []
    for sheet in sheets:
        name = sheet.get("name", "?")
        for cell in sheet.get("cells", []):
            ref = str(cell.get("cell") or "")
            value = cell.get("value")
            if ref.endswith(_HEADER_ROW) and isinstance(value, str) and value.strip():
                headers.append((name, ref, value.strip()))
    return headers


def _coverage_problems(
    model: dict[str, Any], expected: list[tuple[str, str, str]]
) -> list[str]:
    """Report any expected header whose slug doesn't appear in `model.fields[].id`.
    The slug is the FK the executable will use, so this is the same identity test
    the A4↔A5 seam runs at verify time — moved upstream into the build loop, so
    the LLM gets a chance to fix the gap rather than the seam catching it later.
    The problem message names the missing slugs (concrete, retry-friendly)."""
    if not expected:
        return []
    have = {f.get("id") for f in model.get("fields", []) or []}
    missing: list[tuple[str, str, str]] = [
        (sheet, ref, header)
        for sheet, ref, header in expected
        if slugify(header) not in have
    ]
    if not missing:
        return []
    rendered = ", ".join(f"{sheet}!{ref} ({header!r})" for sheet, ref, header in missing[:20])
    if len(missing) > 20:
        rendered += f", … (+{len(missing) - 20} more)"
    return [
        f"emitted {len(have)} fields, expected at least {len(expected)} "
        f"(one per workbook header across all sheets); "
        f"missing: {rendered}"
    ]


async def build_audit_spec(
    workbook_path: Path,
    audit_id: str,
    *,
    display_name: str | None = None,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a validated `spec.json` document (a dict). One LLM call supplies the
    field spec + suggested inclusion criteria; deterministic code coerces it to the
    schema, merges preserved user state (`previous`), and validates against the S0
    schema. Retries on malformed LLM output; raises `BuilderValidationError` after
    `_MAX_BUILD_ATTEMPTS`."""
    sheets = extract_layout(workbook_path)
    expected = _expected_headers(sheets)
    hint = display_name or workbook_path.stem
    user_input = json.dumps(
        {"filename_hint": hint, "sheets": sheets}, ensure_ascii=False, indent=2
    )

    instructions = _PROMPT
    problems: list[str] = []
    for attempt in range(1, _MAX_BUILD_ATTEMPTS + 1):
        # 4000 (the default) truncates a multi-sheet workbook mid-JSON; the
        # audit-spec dominates output size with one ~50-token field per header.
        # 8000 carries ~150 fields comfortably; mirrors `build_audit_database_mapping`.
        raw = await llm.respond(instructions, user_input, max_output_tokens=8000, stage="index_audit")
        try:
            prose = _parse_json(raw)
            if not isinstance(prose, dict):
                raise ValueError("top-level JSON is not an object")
        except (json.JSONDecodeError, ValueError) as exc:
            problems = [f"LLM output was not parseable JSON: {exc}"]
        else:
            model = merge_preserved_state(_assemble(audit_id, prose), previous)
            problems = validate_against_schema(model, _SCHEMA_FILE)
            if not problems and not model["fields"]:
                problems = ["no usable fields were produced"]
            if not problems:
                # Multi-sheet coverage guard: the schema can't enforce this (it
                # doesn't know the input shape), so the build loop does. Failure
                # carries the missing slugs back into the LLM retry — a concrete
                # gap is far easier for the model to close than a generic "more".
                problems = _coverage_problems(model, expected)
            if not problems:
                return model
        logger.warning(
            "audit spec failed validation (attempt %d/%d): %s",
            attempt, _MAX_BUILD_ATTEMPTS, "; ".join(problems),
        )
        instructions = _PROMPT + _retry_feedback(problems)
    raise BuilderValidationError(
        f"audit spec failed validation after {_MAX_BUILD_ATTEMPTS} attempts: "
        + "; ".join(problems)
    )


def _retry_feedback(problems: list[str]) -> str:
    joined = "\n".join(f"- {p}" for p in problems)
    return (
        "\n\nYOUR PREVIOUS OUTPUT WAS REJECTED for these reasons:\n"
        f"{joined}\n"
        "Produce a corrected JSON object that fixes every issue. Output only the "
        "JSON object, starting with `{`, with at least one usable field."
    )
