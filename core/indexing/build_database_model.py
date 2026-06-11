"""Deterministic builder for the database model (`model.json`).

Emits the structured `model.json` (storage-layout §2 / mapping-artifact-redesign.md §3.2): the
schema model PLUS the per-column filterable surface. The skeleton is extracted
mechanically — SQLite introspection for the schema, a read-only value profiler
(`core.indexing.profile`) for the filterable surface — and flows through as data.
One LLM call supplies only judgment: the prose title/description and the clinical
column descriptions (+ any coded value sets). The model is validated against the
S0 schema (`database-model.schema.json`) before it is returned, so the service
never writes a broken file.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from pathlib import Path
from typing import Any

from core.clients import llm
from core.indexing.profile import (
    classify_column,
    discover_identity_links,
    readonly_connection,
    validate_against_schema,
)

logger = logging.getLogger(__name__)

_SCHEMA_FILE = "database-model.schema.json"
_MAX_BUILD_ATTEMPTS = 3

_INTERNAL_TABLES = {"import_metadata", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"}

# Map a raw SQLite declared type onto the canonical storage type the schema model
# records. The Synthea exports store almost everything as TEXT; keep it honest.
_CANONICAL_TYPES = {"integer": "integer", "int": "integer", "real": "real",
                    "float": "real", "blob": "blob", "text": "text"}


class BuilderValidationError(RuntimeError):
    """Raised when the builder's LLM output cannot be made into a valid model
    after all retries. The caller (service.run_indexing) marks the entity
    `status: error` and no broken model is ever written."""


_PROMPT = """\
You write the clinical prose for a database model. You are given a SQLite
database's tables and columns (with a few sample values per column). Produce ONLY
a single JSON object — no preamble, no markdown fences, no commentary.

The structured skeleton (types, which columns are filterable, their value sets and
ranges) is computed separately from the live data — you do NOT decide that. Your
job is the human judgment: a clear database title, a one-paragraph description of
what the database holds and where free-text lives, and a CLINICAL description for
every table and column (disambiguate cryptic names — say what the value actually
means in the clinical domain, e.g. "Mode of delivery", "Completed weeks of
gestation at birth", "Per-patient identifier for the birth record").

Where a column stores a CODED value set (e.g. sex as M/F, a status enum), capture
the whole mapping as a `codes` object of code -> meaning so the encoding is
recorded for mapping; omit `codes` otherwise.

Output shape:

{
  "title": "<human-readable database title>",
  "description": "<one paragraph: which tables hold what, the primary entity, where free-text lives>",
  "tables": [
    { "name": "<table name, verbatim>", "description": "<clinical role of the table>",
      "columns": [
        { "name": "<column name, verbatim>", "description": "<clinical meaning>",
          "codes": { "<code>": "<meaning>" } }
      ] }
  ]
}

Rules:
- Include every table and every column given in the input, names verbatim.
- Descriptions must be clinical, not technical restatements of the column name.
- Only include `codes` when the column genuinely stores a coded set.
- Output only the JSON object, starting with `{`.
"""


def extract_schema(db_path: Path) -> dict[str, Any]:
    """Introspect the SQLite schema: tables (with columns + pk flags + row count)
    and foreign-key relationships. Read-only."""
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        conn.row_factory = sqlite3.Row
        tables: list[dict[str, Any]] = []
        relationships: list[dict[str, str]] = []

        rows = conn.execute(
            "SELECT name, type FROM sqlite_master "
            "WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' "
            "ORDER BY type, name"
        ).fetchall()

        for row in rows:
            name = row["name"]
            if name in _INTERNAL_TABLES:
                continue

            columns_info = conn.execute(f'PRAGMA table_info("{name}")').fetchall()
            columns = [
                {
                    "name": c["name"],
                    "type": c["type"] or "",
                    "primary_key": bool(c["pk"]),
                }
                for c in columns_info
            ]

            try:
                row_count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            except sqlite3.DatabaseError:
                row_count = None

            for fk in conn.execute(f'PRAGMA foreign_key_list("{name}")').fetchall():
                relationships.append({"from_table": name, "from_column": fk["from"]})

            tables.append({
                "name": name,
                "row_count": row_count,
                "columns": columns,
            })

        return {"tables": tables, "relationships": relationships}
    finally:
        conn.close()


def _canonical_type(raw: str) -> str:
    return _CANONICAL_TYPES.get((raw or "").strip().lower(), "text")


def _humanize(name: str) -> str:
    """Fallback description from a column/table name (e.g. "gestation_weeks" ->
    "Gestation weeks."). Keeps the model complete when the LLM omits a column."""
    return name.replace("_", " ").strip().capitalize() + "."


def _hint(annotation: dict[str, Any]) -> str:
    """A short value hint for the LLM prompt, derived from the classification."""
    if annotation.get("filter_type") == "category":
        return "e.g. " + ", ".join(str(v) for v in annotation.get("values", [])[:6])
    if "range" in annotation:
        rng = annotation["range"]
        return f"range {rng.get('min')}..{rng.get('max')}"
    return f"({annotation.get('reason', 'not filterable')})"


def _render_for_llm(
    schema: dict[str, Any], classifications: dict[str, dict[str, dict]]
) -> str:
    """A clean view of the schema + value hints for the prompt (no raw braces)."""
    lines: list[str] = []
    for table in schema["tables"]:
        lines.append(f"Table {table['name']} ({table['row_count']} rows):")
        for col in table["columns"]:
            annotation = classifications[table["name"]][col["name"]]
            lines.append(
                f"  - {col['name']} [{_canonical_type(col['type'])}] {_hint(annotation)}"
            )
        lines.append("")
    return "\n".join(lines)


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


def _build_filterable_surface(
    db_path: Path, schema: dict[str, Any]
) -> dict[str, dict[str, dict]]:
    """Profile every column read-only: return the `model.json` filterable-surface
    annotations keyed by table then column."""
    fk_columns = {(r["from_table"], r["from_column"]) for r in schema["relationships"]}
    classifications: dict[str, dict[str, dict]] = {}
    conn = readonly_connection(db_path)
    try:
        for table in schema["tables"]:
            tname = table["name"]
            classifications[tname] = {}
            for col in table["columns"]:
                cname = col["name"]
                # A profiling error is data we don't understand — fail loud rather
                # than silently mislabeling the column as `reason: reference` (an
                # FK pointer it isn't), which would have mapping skip it for code
                # binding under a wrong assumption.
                annotation = classify_column(
                    conn, tname, cname,
                    is_pk=col["primary_key"],
                    is_fk=(tname, cname) in fk_columns,
                )
                classifications[tname][cname] = annotation
    finally:
        conn.close()
    return classifications


def _assemble(
    database_id: str,
    schema: dict[str, Any],
    classifications: dict[str, dict[str, dict]],
    prose: dict[str, Any],
    identity_links: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Merge the deterministic skeleton + filterable surface with the LLM prose
    into a `model.json` document."""
    prose_tables = {t.get("name"): t for t in prose.get("tables", []) if isinstance(t, dict)}
    out_tables: list[dict[str, Any]] = []
    for table in schema["tables"]:
        tname = table["name"]
        p_table = prose_tables.get(tname, {})
        p_columns = {
            c.get("name"): c for c in p_table.get("columns", []) if isinstance(c, dict)
        }
        out_columns: list[dict[str, Any]] = []
        for col in table["columns"]:
            cname = col["name"]
            p_col = p_columns.get(cname, {})
            record: dict[str, Any] = {
                "name": cname,
                "type": _canonical_type(col["type"]),
                "description": (p_col.get("description") or _humanize(cname)).strip(),
            }
            # Deterministic surface ALWAYS wins. `record.update()` overrides
            # anything the LLM may have leaked into `filterable`/`filter_type`/
            # `values`/`range`/`reason` — the prose pass only owns `title`,
            # per-table/column `description`, and (optionally) `codes`. The
            # invariant is enforced by ordering, not validation; see
            # SeedDatabaseSanityTest.test_llm_prose_cannot_override_classifications.
            record.update(classifications[tname][cname])
            codes = p_col.get("codes")
            if isinstance(codes, dict) and codes:
                record["codes"] = {str(k): str(v) for k, v in codes.items()}
            out_columns.append(record)

        out_table: dict[str, Any] = {
            "name": tname,
            "description": (p_table.get("description") or _humanize(tname)).strip(),
            "columns": out_columns,
        }
        if table["row_count"] is not None:
            out_table["row_count"] = table["row_count"]
        out_tables.append(out_table)

    model = {
        "schema_version": "1",
        "database": database_id,
        "title": (prose.get("title") or database_id).strip(),
        "description": (prose.get("description") or f"Database model for {database_id}.").strip(),
        "tables": out_tables,
    }
    # Measured, deterministic — set after the prose merge so the LLM can never
    # write or override an identity link (same invariant as the filterable surface).
    if identity_links:
        model["identity_links"] = identity_links
    return model


async def build_database_model(
    db_path: Path,
    database_id: str,
    *,
    display_name: str | None = None,
    sibling_databases: dict[str, Path] | None = None,
) -> dict[str, Any]:
    """Build a validated `model.json` document (a dict). The filterable surface
    AND the cross-database identity links are computed deterministically from the
    live data; one LLM call supplies the prose. `sibling_databases` maps the other
    databases' ids to their sqlite paths — when given, measured `identity_links`
    are profiled against them (see `profile.discover_identity_links`). Retries on
    malformed LLM output; raises `BuilderValidationError` after
    `_MAX_BUILD_ATTEMPTS` so the service marks the entity `status: error`."""
    schema = extract_schema(db_path)
    classifications = _build_filterable_surface(db_path, schema)
    identity_links = discover_identity_links(
        db_path, schema, classifications, sibling_databases or {}
    )
    user_input = _render_for_llm(schema, classifications)
    if display_name:
        user_input = f"database_name_hint: {display_name}\n\n{user_input}"

    instructions = _PROMPT
    problems: list[str] = []
    for attempt in range(1, _MAX_BUILD_ATTEMPTS + 1):
        # The clinical-prose pass dominates output size — every table + every
        # column gets a description, so a wide schema (Synthea-export shape:
        # ~14 tables × ~15 cols) easily fills 6k mid-JSON. 12k carries the
        # full cord-pH model end-to-end without truncation.
        raw = await llm.respond(instructions, user_input, max_output_tokens=12000, stage="index_db")
        try:
            prose = _parse_json(raw)
            if not isinstance(prose, dict):
                raise ValueError("top-level JSON is not an object")
        except (json.JSONDecodeError, ValueError) as exc:
            problems = [f"LLM output was not parseable JSON: {exc}"]
        else:
            model = _assemble(database_id, schema, classifications, prose, identity_links)
            problems = validate_against_schema(model, _SCHEMA_FILE)
            if not problems:
                return model
        logger.warning(
            "database model failed validation (attempt %d/%d): %s",
            attempt, _MAX_BUILD_ATTEMPTS, "; ".join(problems),
        )
        instructions = _PROMPT + _retry_feedback(problems)
    raise BuilderValidationError(
        f"database model failed validation after {_MAX_BUILD_ATTEMPTS} attempts: "
        + "; ".join(problems)
    )


def _retry_feedback(problems: list[str]) -> str:
    joined = "\n".join(f"- {p}" for p in problems)
    return (
        "\n\nYOUR PREVIOUS OUTPUT WAS REJECTED for these reasons:\n"
        f"{joined}\n"
        "Produce a corrected JSON object that fixes every issue. Output only the "
        "JSON object, starting with `{`, including every table and column."
    )
