"""Read-only value profiling for database indexing + S0 schema validation.

Two indexing utilities live here:

1. The **read-only value profiler** (`readonly_connection` / `profile_column` /
   `classify_column`) — salvaged from the superseded per-DB filter catalog
   (closed PR #155, `core/mapping/build_criteria.py`) and trimmed to what database
   indexing needs. It belongs at DB indexing, not at mapping: the filterable
   surface is a property of the *database*, computed once. `classify_column`
   turns a live column profile into the per-column annotation `model.json`
   carries — `filterable` + `filter_type` + `values`/`range`, or
   `filterable: false` + a `reason` (identifier / free-text / reference)
   (mapping-artifact-redesign.md §3.2).

2. A thin **JSON Schema validator** (`validate_against_schema`) the builders and
   the service use to validate every emitted model against the S0 contracts
   (`docs/mvp/contracts/*.schema.json`) before writing — malformed output is
   never persisted.
"""

from __future__ import annotations

import functools
import json
import logging
import re
import sqlite3
from pathlib import Path
from typing import Any

import jsonschema

from core.config import ROOT

logger = logging.getLogger(__name__)

# --- Read-only value profiling (salvaged from PR #155 / PR #152) --------------

# Bounds on the read-only profiling reads.
_DISTINCT_CAP = 200          # hard cap on a SELECT DISTINCT
_CATEGORY_MAX = 40           # above "a few dozen" distinct values it is not enumerable
_FREETEXT_LEN = 80           # any value longer than this marks the column free-text
_IDENTIFIER_MIN_ROWS = 3     # below this an all-distinct column is too small to call an id

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([T ].*)?$")
_NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")

# Columns that point at another entity rather than describe one. Filtering a
# cohort by a raw foreign-key pointer is never meaningful, so these are marked
# `reason: reference` regardless of their value distribution. Detected by name
# because the cord-ph fixtures (Synthea export) carry no declared FKs.
_REFERENCE_NAMES = {
    "patient", "encounter", "organization", "provider", "payer", "code",
    "baby_patient", "mother_patient", "nicu_encounter",
}
_REFERENCE_SUFFIXES = ("_patient", "_encounter")


def readonly_connection(db_path: Path) -> sqlite3.Connection:
    """A read-only SQLite connection — `mode=ro`, `PRAGMA query_only`, and an
    authorizer that blocks dangerous functions. Mirrors the agent plane's
    `_sql_runtime.readonly_connection` so value profiling can never mutate the DB."""
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")

    def _authorizer(action, _a1, arg2, _db, _trigger):
        if action == sqlite3.SQLITE_FUNCTION and (arg2 or "").lower() in {
            "load_extension",
            "writefile",
        }:
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    conn.set_authorizer(_authorizer)
    return conn


def profile_column(conn: sqlite3.Connection, table: str, col: str) -> dict[str, Any]:
    """Read-only profile of one column: non-empty/distinct counts and a bounded
    sample of its distinct non-empty values (NULLs and blanks excluded)."""
    where = f'"{col}" IS NOT NULL AND "{col}" != \'\''
    n, d = conn.execute(
        f'SELECT COUNT("{col}"), COUNT(DISTINCT "{col}") FROM "{table}" WHERE {where}'
    ).fetchone()
    values = [
        r[0]
        for r in conn.execute(
            f'SELECT DISTINCT "{col}" FROM "{table}" WHERE {where} '
            f'ORDER BY "{col}" LIMIT {_DISTINCT_CAP}'
        ).fetchall()
    ]
    return {"nonempty": n or 0, "distinct": d or 0, "values": values}


def _is_reference_name(name: str) -> bool:
    lower = name.lower()
    return lower in _REFERENCE_NAMES or lower.endswith(_REFERENCE_SUFFIXES)


def _is_identifier_name(name: str) -> bool:
    lower = name.lower()
    return lower == "id" or lower.endswith(("_id", "_code"))


def _number_range(values: list[Any]) -> dict[str, Any]:
    nums = [float(v) for v in values]
    lo, hi = min(nums), max(nums)
    to_int = lambda x: int(x) if x == int(x) else x
    return {"min": to_int(lo), "max": to_int(hi)}


def classify_column(
    conn: sqlite3.Connection,
    table: str,
    name: str,
    *,
    is_pk: bool,
    is_fk: bool,
) -> dict[str, Any]:
    """Classify one column's filterable surface for `model.json`.

    Returns the annotation merged onto the column record: either
    `{"filterable": True, "filter_type": ..., "values"|"range": ...}` for a real
    category/number/date dimension, or `{"filterable": False, "reason": ...}` for
    an identifier / free-text / reference column. Type-based and audit-independent
    (§3.2): never min/max an id, never enumerate an identifier, never list a
    free-text column.

    Order matters — structural non-filterables (primary key, reference pointer)
    are settled first, then date/number are recognised before the all-distinct
    identifier heuristic (a date column is all-distinct but is a real filter).
    """
    if is_pk:
        return {"filterable": False, "reason": "identifier"}
    if is_fk or _is_reference_name(name):
        return {"filterable": False, "reason": "reference"}

    prof = profile_column(conn, table, name)
    nonempty, distinct, values = prof["nonempty"], prof["distinct"], prof["values"]

    if nonempty == 0:
        # Nothing to filter on; fall back to a name-based reason so the model
        # stays complete and schema-valid.
        reason = "identifier" if _is_identifier_name(name) else "reference"
        return {"filterable": False, "reason": reason}

    if any(len(str(v)) > _FREETEXT_LEN for v in values):
        return {"filterable": False, "reason": "free-text"}

    str_values = [str(v) for v in values]
    if all(_DATE_RE.match(v) for v in str_values):
        return {
            "filterable": True,
            "filter_type": "date",
            "range": {"min": str_values[0], "max": str_values[-1]},
        }
    if all(_NUMBER_RE.match(v) for v in str_values):
        return {"filterable": True, "filter_type": "number", "range": _number_range(values)}

    # Non-numeric/non-date: an all-distinct column (or an id-named one) is an
    # identifier, never an enumerable category.
    if _is_identifier_name(name):
        return {"filterable": False, "reason": "identifier"}
    if distinct == nonempty and nonempty >= _IDENTIFIER_MIN_ROWS:
        return {"filterable": False, "reason": "identifier"}

    if distinct <= _CATEGORY_MAX:
        return {"filterable": True, "filter_type": "category", "values": str_values}

    # Too many distinct values to enumerate and not a numeric/date range — treat
    # as unbounded free-text rather than fabricate a category.
    return {"filterable": False, "reason": "free-text"}


# --- Cross-database identity links (measured, deterministic) -------------------
#
# Whether two databases share an identity space is a DATA FACT, not a judgment:
# sample an identifier column's values and count how many exist verbatim in a
# sibling database's column. Real links are overwhelming (>95% containment),
# non-links are near zero — so the link can be measured once at indexing time
# and carried on `model.json` as `identity_links[]`. The mapping LLM then reads
# the link as a fact instead of guessing it from column names, and the compiled
# identity bridge (A3) rests on a measurement. Within-database links are NOT
# profiled here — `PRAGMA foreign_key_list` already declares those.

_LINK_SAMPLE = 100        # distinct values sampled from each candidate column
_LINK_MIN_DISTINCT = 5    # below this, containment is meaningless (code sets collide)
_LINK_THRESHOLD = 0.95    # containment ratio that proves a shared identity space
_LINK_TARGET_CAP = 50000  # bound on a target column's distinct values read


def _rowid_alias(*, is_pk: bool, col_type: str) -> bool:
    """An INTEGER PRIMARY KEY is (almost always) a rowid alias: its values are
    row POSITIONS (1..N), not identities — two such columns in different
    databases overlap perfectly while meaning nothing. Excluded on both sides."""
    return is_pk and "int" in (col_type or "").lower()


def _identifier_like(annotation: dict[str, Any], *, is_pk: bool) -> bool:
    """Source candidates are the columns that may HOLD identities: primary keys,
    identifier/reference columns, and NUMBER columns (an NHS number is all
    digits, so the filterable surface classes it `number`; a repeating pointer —
    many visits per patient — is still an identity holder). Category, date and
    free-text columns are excluded — small value sets and date domains collide
    across databases without meaning anything. The real proof is the containment
    measurement against a target that is itself a key column."""
    if is_pk:
        return True
    if not annotation.get("filterable"):
        return annotation.get("reason") in ("identifier", "reference")
    return annotation.get("filter_type") == "number"


def _sample_distinct(
    conn: sqlite3.Connection, table: str, col: str, cap: int
) -> list[str]:
    rows = conn.execute(
        f'SELECT DISTINCT "{col}" FROM "{table}" '
        f'WHERE "{col}" IS NOT NULL AND "{col}" != \'\' LIMIT {cap}'
    ).fetchall()
    return sorted({str(r[0]).strip() for r in rows if str(r[0]).strip()})


def discover_identity_links(
    db_path: Path,
    schema: dict[str, Any],
    classifications: dict[str, dict[str, dict[str, Any]]],
    siblings: dict[str, Path],
) -> list[dict[str, Any]]:
    """Measure this database's cross-database identity links.

    For every identity-holding column, sample up to ``_LINK_SAMPLE`` distinct
    values and count (read-only) how many exist verbatim — after a trim — in
    each KEY column (all-distinct, non-rowid) of each sibling database. A
    containment ratio of at least ``_LINK_THRESHOLD`` over at least
    ``_LINK_MIN_DISTINCT`` values is a link:

        {"column": "clinic_visits.patient_ref",
         "target": "npda-demographics -> patients.nhs_number",
         "evidence": "24/24 sampled values found in target"}

    Directional by design: the FK side (a repeating pointer) links TO the key
    side, the reverse containment is partial (only patients with visits) and may
    legitimately not fire — one direction is enough for the mapping to read the
    fact. Pure measurement — no LLM, no name matching. Returns ``[]`` when there
    are no siblings.
    """
    if not siblings:
        return []

    samples: dict[tuple[str, str], list[str]] = {}
    conn = readonly_connection(db_path)
    try:
        for table in schema["tables"]:
            tname = table["name"]
            for col in table["columns"]:
                is_pk = bool(col.get("primary_key"))
                if _rowid_alias(is_pk=is_pk, col_type=col.get("type", "")):
                    continue
                annotation = classifications.get(tname, {}).get(col["name"], {})
                if not _identifier_like(annotation, is_pk=is_pk):
                    continue
                values = _sample_distinct(conn, tname, col["name"], _LINK_SAMPLE)
                if len(values) >= _LINK_MIN_DISTINCT:
                    samples[(tname, col["name"])] = values
    finally:
        conn.close()
    if not samples:
        return []

    links: list[dict[str, Any]] = []
    for sib_id, sib_path in sorted(siblings.items()):
        sib_conn = readonly_connection(sib_path)
        try:
            for srow in sib_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall():
                s_table = srow[0]
                if s_table.startswith("sqlite_"):
                    continue
                for cinfo in sib_conn.execute(
                    f'PRAGMA table_info("{s_table}")'
                ).fetchall():
                    s_col = cinfo["name"]
                    if _rowid_alias(
                        is_pk=bool(cinfo["pk"]), col_type=cinfo["type"] or ""
                    ):
                        continue
                    # A link points AT an identity: the target must be a key
                    # column there (every non-empty value distinct).
                    prof = profile_column(sib_conn, s_table, s_col)
                    if (
                        prof["distinct"] < _LINK_MIN_DISTINCT
                        or prof["distinct"] != prof["nonempty"]
                    ):
                        continue
                    target_values = set(
                        _sample_distinct(sib_conn, s_table, s_col, _LINK_TARGET_CAP)
                    )
                    for (tname, cname), values in samples.items():
                        matched = sum(1 for v in values if v in target_values)
                        if matched / len(values) >= _LINK_THRESHOLD:
                            links.append({
                                "column": f"{tname}.{cname}",
                                "target": f"{sib_id} -> {s_table}.{s_col}",
                                "evidence": (
                                    f"{matched}/{len(values)} sampled values "
                                    f"found in target"
                                ),
                            })
        finally:
            sib_conn.close()
    links.sort(key=lambda link: (link["column"], link["target"]))
    return links


# --- S0 schema validation -----------------------------------------------------

_CONTRACTS_DIR = ROOT / "docs" / "mvp" / "contracts"


@functools.lru_cache(maxsize=None)
def _load_schema(schema_filename: str) -> dict[str, Any]:
    path = _CONTRACTS_DIR / schema_filename
    return json.loads(path.read_text(encoding="utf-8"))


def validate_against_schema(instance: Any, schema_filename: str) -> list[str]:
    """Validate `instance` against an S0 contract schema; return a list of
    human-readable problems (empty means valid). Used as the final guard before
    any model is written, so a malformed document is never persisted."""
    schema = _load_schema(schema_filename)
    validator = jsonschema.Draft202012Validator(schema)
    problems: list[str] = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in error.path) or "(root)"
        problems.append(f"{location}: {error.message}")
    return problems
