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

import logging
import sqlite3
from pathlib import Path
from typing import Any

from core.clients import llm
from core.clients.llm_builder import (
    build_validated,
    parse_json_object,
)
from core.contracts import validate_against_schema
from core.indexing.profile import (
    classify_column,
    discover_foreign_keys,
    discover_identity_links,
    grain_cardinality_warnings,
    grain_signal,
    readonly_connection,
    schema_fingerprint,
    table_fingerprint,
)

logger = logging.getLogger(__name__)

_SCHEMA_FILE = "database-model.schema.json"

_INTERNAL_TABLES = {"import_metadata", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"}

# Map a raw SQLite declared type onto the canonical storage type the schema model
# records. The Synthea exports store almost everything as TEXT; keep it honest.
_CANONICAL_TYPES = {"integer": "integer", "int": "integer", "real": "real",
                    "float": "real", "blob": "blob", "text": "text"}


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
      "grain": "<what ONE row represents, e.g. 'one row per patient registration'>",
      "columns": [
        { "name": "<column name, verbatim>", "description": "<clinical meaning>",
          "codes": { "<code>": "<meaning>" } }
      ] }
  ]
}

Rules:
- Include every table and every column given in the input, names verbatim.
- Descriptions must be clinical, not technical restatements of the column name.
- `grain` states what one row IS. Each table is tagged with a measured signal
  (one-row-per-entity vs many-rows-per-entity) — keep that distinction; you are
  only refining the phrasing (name the entity/event).
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
                # Capture the target too (fk["table"]/fk["to"]) so a declared FK
                # is a full edge for discover_foreign_keys; the filterable surface
                # only reads from_table/from_column, so the extra keys are inert.
                relationships.append({
                    "from_table": name, "from_column": fk["from"],
                    "to_table": fk["table"], "to_column": fk["to"],
                })

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
    schema: dict[str, Any],
    classifications: dict[str, dict[str, dict]],
    grain: dict[str, str] | None = None,
) -> str:
    """A clean view of the schema + value hints for the prompt (no raw braces)."""
    grain = grain or {}
    lines: list[str] = []
    for table in schema["tables"]:
        tname = table["name"]
        signal = grain.get(tname)
        head = f"Table {tname} ({table['row_count']} rows)"
        head += f" [grain signal: {signal}]:" if signal else ":"
        lines.append(head)
        for col in table["columns"]:
            annotation = classifications[table["name"]][col["name"]]
            lines.append(
                f"  - {col['name']} [{_canonical_type(col['type'])}] {_hint(annotation)}"
            )
        lines.append("")
    return "\n".join(lines)


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
    foreign_keys: list[dict[str, Any]] | None = None,
    grain: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Merge the deterministic skeleton + filterable surface with the LLM prose
    into a `model.json` document."""
    foreign_keys = foreign_keys or []
    grain = grain or {}
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
        # `grain` = the LLM's refined phrasing when given, else the deterministic
        # signal floor (so grain is always populated; the LLM only sharpens it).
        out_grain = (str(p_table.get("grain") or "").strip()) or grain.get(tname)
        if out_grain:
            out_table["grain"] = out_grain
        # Measured/deterministic structural fingerprint — set last so the LLM
        # cannot influence it (same invariant as identity_links/foreign_keys).
        out_table["fingerprint"] = table_fingerprint(table, foreign_keys)
        out_tables.append(out_table)

    model = {
        "schema_version": "1",
        "database": database_id,
        "title": (prose.get("title") or database_id).strip(),
        "description": (prose.get("description") or f"Database model for {database_id}.").strip(),
        "tables": out_tables,
    }
    # `conventions` is asserted (LLM/human), optional — keep the LLM's if valid.
    conventions = prose.get("conventions")
    if isinstance(conventions, dict) and conventions:
        model["conventions"] = conventions
    # Measured, deterministic — set after the prose merge so the LLM can never
    # write or override the graph/fingerprint (same invariant as the filterable surface).
    if identity_links:
        model["identity_links"] = identity_links
    if foreign_keys:
        model["foreign_keys"] = foreign_keys
    model["schema_fingerprint"] = schema_fingerprint(schema, foreign_keys, identity_links)
    return model


# Asserted prose preserved across re-index for a structurally-unchanged table, so
# re-indexing never churns hand-authored semantics (mapping-artifact-redesign §6).
# (Column-level durable fields — description, codes — are handled inline in
# `_merge_durable`, since `codes` needs a vocabulary-coverage check.)
_DURABLE_TABLE_FIELDS = ("description", "grain")


def _merge_durable(model: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    """Overlay the prior model's ASSERTED fields onto the freshly-built `model`,
    per the durable-semantics rule: an asserted field (db/table/column description,
    grain, column codes, conventions) is preserved from `previous` when that
    scope is structurally UNCHANGED — its fingerprint matches — OR when no prior
    fingerprint exists yet (the first re-index after this feature ships: the
    committed seeds carry hand-authored prose but no fingerprint, so preserve it
    rather than let a fresh build wipe it). A changed fingerprint re-derives.
    Measured blocks (foreign_keys, identity_links, fingerprints, the filterable
    surface) are never touched here."""
    if not previous:
        return model

    db_unchanged = (
        previous.get("schema_fingerprint") is None
        or previous.get("schema_fingerprint") == model.get("schema_fingerprint")
    )
    if db_unchanged:
        for field in ("description", "summary"):
            if previous.get(field) is not None:
                model[field] = previous[field]
        # conventions is asserted prose BUT its row_filters compile to SQL, so a
        # stale predicate referencing a renamed/dropped column would break every
        # emitted JOIN. Gate it on the structural fingerprint like the rest: carry
        # it forward only when the schema is unchanged, never across a schema drift.
        if previous.get("conventions") is not None:
            model["conventions"] = previous["conventions"]

    prev_tables = {t.get("name"): t for t in previous.get("tables", []) if isinstance(t, dict)}
    for table in model.get("tables", []):
        prev = prev_tables.get(table.get("name"))
        if not prev:
            continue
        prev_fp = prev.get("fingerprint")
        if prev_fp is not None and prev_fp != table.get("fingerprint"):
            continue  # structurally changed — re-derive from the fresh build
        for field in _DURABLE_TABLE_FIELDS:
            if prev.get(field) is not None:
                table[field] = prev[field]
        prev_cols = {c.get("name"): c for c in prev.get("columns", []) if isinstance(c, dict)}
        for col in table.get("columns", []):
            pcol = prev_cols.get(col.get("name"))
            if not pcol:
                continue
            if pcol.get("description") is not None:
                col["description"] = pcol["description"]
            # `codes` is durable too, BUT the fingerprint hashes only name+type —
            # not the value vocabulary — so a column that GAINED a value would
            # otherwise keep a stale codes map missing that value. Restore the
            # prior codes only when they still cover the freshly-observed values;
            # a grown vocabulary lets the fresh build's codes stand.
            prev_codes = pcol.get("codes")
            if prev_codes is not None and set(col.get("values") or []) <= set(prev_codes):
                col["codes"] = prev_codes
    return model


async def build_database_model(
    db_path: Path,
    database_id: str,
    *,
    display_name: str | None = None,
    sibling_databases: dict[str, Path] | None = None,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a validated `model.json` document (a dict). The filterable surface,
    the cross-database `identity_links` AND the within-database `foreign_keys`
    graph are computed deterministically from the live data; one LLM call supplies
    the prose. `sibling_databases` maps the other databases' ids to their sqlite
    paths — when given, measured `identity_links` are profiled against them.
    `previous` is the prior model (a ready model on re-index, the stub on first
    index); its asserted prose is preserved for structurally-unchanged tables
    (`_merge_durable`). Retries on malformed LLM output; raises
    `BuilderValidationError` when the attempts run out."""
    schema = extract_schema(db_path)
    classifications = _build_filterable_surface(db_path, schema)
    identity_links = discover_identity_links(
        db_path, schema, classifications, sibling_databases or {}
    )
    foreign_keys = discover_foreign_keys(db_path, schema, classifications)
    grain = grain_signal(db_path, schema)
    for warning in grain_cardinality_warnings(grain, foreign_keys):
        logger.warning("grain/cardinality check (%s): %s", database_id, warning)
    user_input = _render_for_llm(schema, classifications, grain)
    if display_name:
        user_input = f"database_name_hint: {display_name}\n\n{user_input}"

    async def _attempt(instructions: str) -> tuple[dict[str, Any] | None, list[str]]:
        # The clinical-prose pass dominates output size — every table + every
        # column gets a description, so a wide schema (Synthea-export shape:
        # ~14 tables × ~15 cols) easily fills 6k mid-JSON. 12k carries the
        # full cord-pH model end-to-end without truncation.
        raw = await llm.respond(instructions, user_input, max_output_tokens=12000, stage="index_db")
        try:
            prose = parse_json_object(raw)
        except ValueError as exc:
            return None, [f"LLM output was not parseable JSON: {exc}"]
        model = _merge_durable(
            _assemble(database_id, schema, classifications, prose,
                      identity_links, foreign_keys, grain),
            previous,
        )
        return model, validate_against_schema(model, _SCHEMA_FILE)

    return await build_validated(
        _attempt,
        prompt=_PROMPT,
        label="database model",
        guidance=(
            "Produce a corrected JSON object that fixes every issue. Output only "
            "the JSON object, starting with `{`, including every table and column."
        ),
    )
