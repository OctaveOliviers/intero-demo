"""Read-only value profiling for database indexing.

The **read-only value profiler** (`readonly_connection` / `profile_column` /
`classify_column`) — salvaged from the superseded per-DB filter catalog
(closed PR #155, `core/mapping/build_criteria.py`) and trimmed to what database
indexing needs. It belongs at DB indexing, not at mapping: the filterable
surface is a property of the *database*, computed once. `classify_column`
turns a live column profile into the per-column annotation `model.json`
carries — `filterable` + `filter_type` + `values`/`range`, or
`filterable: false` + a `reason` (identifier / free-text / reference)
(mapping-artifact-redesign.md §3.2).

Schema validation against the S0 contracts lives in `core.contracts`.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# --- Read-only value profiling (salvaged from PR #155 / PR #152) --------------

# Bounds on the read-only profiling reads.
_DISTINCT_CAP = 200  # hard cap on a SELECT DISTINCT
_CATEGORY_MAX = 40  # above "a few dozen" distinct values it is not enumerable
_FREETEXT_LEN = 80  # any value longer than this marks the column free-text
_IDENTIFIER_MIN_ROWS = 3  # below this an all-distinct column is too small to call an id

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([T ].*)?$")
_NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")

# Columns that point at another entity rather than describe one. Filtering a
# cohort by a raw foreign-key pointer is never meaningful, so these are marked
# `reason: reference` regardless of their value distribution. Detected by name
# because the cord-ph fixtures (Synthea export) carry no declared FKs.
_REFERENCE_NAMES = {
    "patient",
    "encounter",
    "organization",
    "provider",
    "payer",
    "code",
    "baby_patient",
    "mother_patient",
    "nicu_encounter",
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

    def to_int(x: float) -> float | int:
        return int(x) if x == int(x) else x

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
        return {
            "filterable": True,
            "filter_type": "number",
            "range": _number_range(values),
        }

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
# identity bridge (A3) rests on a measurement. Within-database FKs are profiled
# by `discover_foreign_keys` below — `PRAGMA foreign_key_list` declares none on
# the Synthea-style exports (`build_emr_db` creates a `_row_id` rowid alias and
# no `FOREIGN KEY`), so they are measured the same way as cross-database links.

_LINK_MIN_DISTINCT = 5  # below this, containment is meaningless (code sets collide)
_LINK_THRESHOLD = 0.95  # containment ratio that proves a shared identity space
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
    # ORDER BY before LIMIT so a column with more distinct values than `cap`
    # yields the SAME subset every run — otherwise a borderline measured FK /
    # identity edge (containment near _LINK_THRESHOLD) could flip run-to-run,
    # churning foreign_keys + schema_fingerprint and triggering spurious
    # durable-merge re-derivation.
    rows = conn.execute(
        f'SELECT DISTINCT "{col}" FROM "{table}" '
        f'WHERE "{col}" IS NOT NULL AND "{col}" != \'\' '
        f'ORDER BY "{col}" LIMIT {cap}'
    ).fetchall()
    return sorted({str(r[0]).strip() for r in rows if str(r[0]).strip()})


def discover_identity_links(
    db_path: Path,
    schema: dict[str, Any],
    classifications: dict[str, dict[str, dict[str, Any]]],
    siblings: dict[str, Path],
) -> list[dict[str, Any]]:
    """Measure this database's cross-database identity links.

    For every identity-holding column, read its distinct
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
                # Full distinct set (capped high), not a 100-row lexicographic
                # prefix — a representative containment ratio, not a biased one.
                values = _sample_distinct(conn, tname, col["name"], _LINK_TARGET_CAP)
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
                            links.append(
                                {
                                    "column": f"{tname}.{cname}",
                                    "target": f"{sib_id} -> {s_table}.{s_col}",
                                    "evidence": (
                                        f"{matched}/{len(values)} sampled values "
                                        f"found in target"
                                    ),
                                }
                            )
        finally:
            sib_conn.close()
    links.sort(key=lambda link: (link["column"], link["target"]))
    return links


# --- Within-database foreign keys (measured + declared, deterministic) ---------
#
# The intra-database analogue of `identity_links`: which column in this database
# points at a key column of ANOTHER table in the SAME database. Declared SQL FKs
# (PRAGMA, captured by `extract_schema` into `schema["relationships"]`) are taken
# verbatim; everything else is MEASURED by the same value-overlap containment as
# the cross-database links. The compiler follows these to emit multi-hop direct
# JOINs; the mapping reads them as facts; the agent fetches them via `lookup`.


def _all_distinct_key(prof: dict[str, Any]) -> bool:
    """A column is a candidate key when every non-empty value is distinct and
    there are enough rows to mean it (the join 'one' side)."""
    return (
        prof["nonempty"] >= _IDENTIFIER_MIN_ROWS
        and prof["distinct"] == prof["nonempty"]
    )


def _fk_source_like(annotation: dict[str, Any], *, is_pk: bool) -> bool:
    """A within-database FK source candidate: any column that could hold a pointer
    to another table's key. Broader than `_identifier_like` (which gates the
    CROSS-database links): within ONE database a low-cardinality repeating pointer
    (e.g. ``measurements.visit_ref`` = ``V0001`` × many rows) is classed
    ``category`` by the filterable surface, so categories are admitted here; only
    free-text and continuous date ranges are excluded. The ``_LINK_MIN_DISTINCT``
    floor on the SOURCE's sampled values keeps tiny code sets (sex/ethnicity) out,
    and the containment measurement against an all-distinct target is the proof.

    A declared PRIMARY KEY is never a source: it identifies its OWN table's rows,
    so it is the parent (target) side of a relationship, never the pointer."""
    if is_pk:
        return False
    if not annotation.get("filterable"):
        return annotation.get("reason") in ("identifier", "reference")
    return annotation.get("filter_type") in ("category", "number")


def discover_foreign_keys(
    db_path: Path,
    schema: dict[str, Any],
    classifications: dict[str, dict[str, dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Measure this database's within-database foreign keys.

    Unions two sources, declared winning on conflict:

    1. DECLARED — every edge in ``schema["relationships"]`` that carries a target
       (``extract_schema`` reads ``PRAGMA foreign_key_list``). Emitted
       ``declared: true`` with no ``evidence``.
    2. MEASURED — for every identity-holding source column, count (read-only) how
       many sampled distinct values exist verbatim in each all-distinct key column
       of ANOTHER table. ``>= _LINK_THRESHOLD`` containment over
       ``>= _LINK_MIN_DISTINCT`` values is an edge; emitted ``declared: false``
       with ``evidence``. A measured edge duplicating a declared one is skipped.

    ``cardinality`` is ``to-one`` when the FK-bearing (source) column is itself
    all-distinct (one row per referenced key — a safe direct JOIN), else
    ``to-many`` (a join would fan out; Tier-1 must delegate the field). Computed
    identically for declared and measured edges. Returns ``[]`` when none found.
    """
    edges: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    conn = readonly_connection(db_path)
    try:
        card_cache: dict[tuple[str, str], str] = {}

        def cardinality(table: str, col: str) -> str:
            key = (table, col)
            if key not in card_cache:
                card_cache[key] = (
                    "to-one"
                    if _all_distinct_key(profile_column(conn, table, col))
                    else "to-many"
                )
            return card_cache[key]

        # 1. Declared FKs, taken verbatim (target captured by extract_schema).
        for rel in schema.get("relationships", []):
            ft, fc = rel.get("from_table"), rel.get("from_column")
            tt, tc = rel.get("to_table"), rel.get("to_column")
            if not (ft and fc and tt and tc):
                continue
            column, target = f"{ft}.{fc}", f"{tt}.{tc}"
            if (column, target) in seen:
                continue
            seen.add((column, target))
            edges.append(
                {
                    "column": column,
                    "target": target,
                    "cardinality": cardinality(ft, fc),
                    "declared": True,
                }
            )

        # 2. Measured edges. Build target key columns and source candidates once.
        targets: dict[tuple[str, str], set[str]] = {}
        sources: dict[tuple[str, str], list[str]] = {}
        for table in schema["tables"]:
            tname = table["name"]
            for col in table["columns"]:
                cname, is_pk = col["name"], bool(col.get("primary_key"))
                if _rowid_alias(is_pk=is_pk, col_type=col.get("type", "")):
                    continue
                annotation = classifications.get(tname, {}).get(cname, {})
                prof = profile_column(conn, tname, cname)
                # Target: an all-distinct KEY column (identifier/reference) — never
                # a filterable measurement, whose continuous values can be
                # all-distinct by coincidence (e.g. a cord-pH reading is not an FK
                # into observations.value).
                if (
                    not annotation.get("filterable")
                    and annotation.get("reason") in ("identifier", "reference")
                    and prof["distinct"] >= _LINK_MIN_DISTINCT
                    and _all_distinct_key(prof)
                ):
                    targets[(tname, cname)] = set(
                        _sample_distinct(conn, tname, cname, _LINK_TARGET_CAP)
                    )
                # Source: any pointer-like column with enough distinct values.
                # Read the FULL distinct set (capped high) — NOT a 100-row
                # lexicographic prefix — so the containment ratio is measured over
                # a representative sample, not a biased prefix that could clear the
                # threshold while true full-column containment is below it.
                if _fk_source_like(annotation, is_pk=is_pk):
                    values = _sample_distinct(conn, tname, cname, _LINK_TARGET_CAP)
                    if len(values) >= _LINK_MIN_DISTINCT:
                        sources[(tname, cname)] = values

        # Sorted iteration so the kept direction of an ambiguous 1:1 pair is
        # deterministic across runs.
        for (s_table, s_col), values in sorted(sources.items()):
            column = f"{s_table}.{s_col}"
            for t_table, t_col in sorted(targets):
                if s_table == t_table:  # skip same-table (incl. trivial self)
                    continue
                target = f"{t_table}.{t_col}"
                if (column, target) in seen:  # declared wins / already emitted
                    continue
                # Reverse suppression: in a 1:1 / all-distinct relationship both
                # columns contain each other, so both directions measure as edges.
                # Keep one. A declared FK (added to `seen` first) fixes the correct
                # direction on a real EHR; on synthetic fixtures with no declared
                # FK the first sorted direction wins — harmless, the compiler reads
                # the graph undirected (`_fk_adjacency`), but the model/LLM stop
                # seeing a backwards "fact".
                if (target, column) in seen:
                    continue
                matched = sum(1 for v in values if v in targets[(t_table, t_col)])
                if matched / len(values) >= _LINK_THRESHOLD:
                    seen.add((column, target))
                    edges.append(
                        {
                            "column": column,
                            "target": target,
                            "cardinality": cardinality(s_table, s_col),
                            "declared": False,
                            "evidence": (
                                f"{matched}/{len(values)} sampled values found in target"
                            ),
                        }
                    )
    finally:
        conn.close()
    edges.sort(key=lambda e: (e["column"], e["target"]))
    return edges


def grain_signal(db_path: Path, schema: dict[str, Any]) -> dict[str, str]:
    """Deterministic per-table grain hint from the all-distinct-key signal: a
    table with a non-rowid all-distinct column is one-row-per-entity, otherwise an
    event/measurement table (many rows per entity). The LLM step confirms/overrides
    into the final prose `grain`; this signal is the cross-check
    (`grain_cardinality_warnings`). Reads counts straight from the live data (it
    needs distinct/non-empty counts the filterable-surface `classifications` don't
    carry), so it takes no classifications argument."""
    out: dict[str, str] = {}
    conn = readonly_connection(db_path)
    try:
        for table in schema["tables"]:
            tname = table["name"]
            has_entity_key = False
            for col in table["columns"]:
                is_pk = bool(col.get("primary_key"))
                if _rowid_alias(is_pk=is_pk, col_type=col.get("type", "")):
                    continue
                if _all_distinct_key(profile_column(conn, tname, col["name"])):
                    has_entity_key = True
                    break
            out[tname] = (
                "one row per entity" if has_entity_key else "many rows per entity"
            )
    finally:
        conn.close()
    return out


def grain_cardinality_warnings(
    grain: dict[str, str], foreign_keys: list[dict[str, Any]]
) -> list[str]:
    """Non-fatal cross-check: a table whose grain says one-row-per-entity should
    not be the SOURCE of a `to-many` edge (its FK column repeats despite the
    claim). Returns human-readable warnings; never raises, never blocks a build."""
    warnings: list[str] = []
    for fk in foreign_keys:
        src_table = fk["column"].split(".", 1)[0]
        if (
            grain.get(src_table) == "one row per entity"
            and fk["cardinality"] == "to-many"
        ):
            warnings.append(
                f"{fk['column']} -> {fk['target']} is to-many but {src_table!r} grain "
                f"is one-row-per-entity"
            )
    return warnings


# --- Structural fingerprints (deterministic) ----------------------------------
#
# A hash of the database STRUCTURE (table/column names+types + edges) so re-index
# can trigger on drift, runtime can assert the model matches the live DB, and the
# durable-semantics merge can preserve asserted prose for unchanged tables.


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:16]


def _edges_touching(table_name: str, foreign_keys: list[dict[str, Any]]) -> list[dict]:
    touching = [
        {k: fk[k] for k in ("column", "target", "cardinality", "declared")}
        for fk in foreign_keys
        if fk["column"].split(".", 1)[0] == table_name
        or fk["target"].split(".", 1)[0] == table_name
    ]
    return sorted(touching, key=lambda e: (e["column"], e["target"]))


def table_fingerprint(table: dict[str, Any], foreign_keys: list[dict[str, Any]]) -> str:
    """Hash of one table's structure: its column names+types and the FK edges
    touching it."""
    return _stable_hash(
        {
            "columns": [
                {"name": c["name"], "type": c.get("type", "")} for c in table["columns"]
            ],
            "fks": _edges_touching(table["name"], foreign_keys),
        }
    )


def schema_fingerprint(
    schema: dict[str, Any],
    foreign_keys: list[dict[str, Any]],
    identity_links: list[dict[str, Any]] | None,
) -> str:
    """Hash of the whole database structure: every table fingerprint plus the
    foreign_keys and identity_links edge sets."""
    return _stable_hash(
        {
            "tables": {
                t["name"]: table_fingerprint(t, foreign_keys) for t in schema["tables"]
            },
            "foreign_keys": sorted(
                (
                    {k: fk[k] for k in ("column", "target", "cardinality", "declared")}
                    for fk in foreign_keys
                ),
                key=lambda e: (e["column"], e["target"]),
            ),
            "identity_links": sorted(
                (
                    {"column": link["column"], "target": link["target"]}
                    for link in (identity_links or [])
                ),
                key=lambda e: (e["column"], e["target"]),
            ),
        }
    )


