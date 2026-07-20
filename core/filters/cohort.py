"""The read-only, cross-database cohort resolver for Datasets.

Composes a Dataset's grounded predicates onto a joinable cohort base and proves
the slice with a read-only ``COUNT(DISTINCT <identity>)`` — the single resolver
that serves both the build-time validity count and table-population scoping
(inclusion-criteria-setup.md §Cross-database resolution).

Each criterion binds to a real ``<db> -> <table>.<column>``; the column is
alias-qualified against the cohort base's ``FROM`` (the same alias convention
table population uses) and compared through a bind parameter from
:mod:`core.filters.predicates` — never an inlined value. Several source databases
are ``ATTACH``ed read-only into one connection so predicates can join across them
on measured identity bridges (the multi-database case mirrors the agent runtime's
read-only ``ATTACH``); a single-database Dataset just opens its one database.

Read-only is enforced the same three ways as the rest of the run plane: a
statement guard (``validate_sql``), ``PRAGMA query_only``, and an authorizer that
also blocks ``ATTACH``/``DETACH`` from the composed query itself.
"""

from __future__ import annotations

import contextlib
import re
import sqlite3
from pathlib import Path
from typing import Any

from core import table_population
from core.filters.predicates import build_predicate
from core.source_ref import try_parse_source
from core.tables.scope import _date_to_iso

# Strip the ``AS <alias>`` tail of an identity_select to get the bare identity
# expression for ``COUNT(DISTINCT <expr>)``.
_AS_TAIL = re.compile(r"\s+AS\s+\w+\s*$", re.IGNORECASE)


class CohortError(ValueError):
    """A cohort that cannot be composed or counted read-only."""


def _parse_source(source: str) -> tuple[str, str, str]:
    parsed = try_parse_source(source)
    if parsed is None:
        raise CohortError(f"unparseable source reference: {source!r}")
    return parsed


# SQL words that may follow a table and must never be mistaken for its alias.
_NOT_AN_ALIAS = frozenset(
    {
        "join",
        "on",
        "as",
        "where",
        "and",
        "or",
        "inner",
        "left",
        "right",
        "outer",
        "cross",
        "using",
        "group",
        "order",
        "limit",
        "having",
    }
)
# One table reference in a cohort FROM: an optional **quoted** database prefix
# (``"npda-clinical".`` — quoted because a real slug is hyphenated and not a bare
# SQL identifier), then the table, then an optional alias.
_TABLE_REF = (
    r'(?:"(?P<db>[^"]+)"\s*\.\s*)?(?P<table>[A-Za-z_]\w*)'
    r"(?:\s+(?:AS\s+)?(?P<alias>[A-Za-z_]\w*))?"
)
_LEAD_RE = re.compile(r"^\s*" + _TABLE_REF, re.IGNORECASE)
_JOIN_RE = re.compile(r"\bJOIN\s+" + _TABLE_REF, re.IGNORECASE)


def _cohort_aliases(from_clause: str) -> dict[str, str]:
    """``{table_key: alias}`` for every table named in a cohort ``FROM`` clause.

    Mirrors the table-population alias parser so a Dataset predicate qualifies its
    column exactly as the executable's cohort block does. A table may be aliased
    (``patients p``) or bare (``patients``). A **cross-database** table is written
    db-qualified with a quoted, hyphen-bearing slug (``"npda-clinical".measurements
    m``) and is keyed by ``<slug>.<table>`` — the same key :func:`_col_ref` derives
    for a criterion on an attached database.
    """
    aliases: dict[str, str] = {}
    matches = list(_LEAD_RE.finditer(from_clause)) + list(
        _JOIN_RE.finditer(from_clause)
    )
    for m in matches:
        table = m.group("table")
        if not table or table.lower() in _NOT_AN_ALIAS:
            continue
        key = f"{m.group('db')}.{table}" if m.group("db") else table
        alias = m.group("alias")
        if alias and alias.lower() not in _NOT_AN_ALIAS:
            aliases[key] = alias
        else:
            aliases.setdefault(key, key)
    return aliases


def _col_ref(criterion: dict[str, Any], aliases: dict[str, str], cohort_db: str) -> str:
    """The alias-qualified column for a criterion, resolved against the cohort
    ``FROM``. A criterion on the cohort database is keyed by its bare table; a
    criterion on an attached database is keyed by ``<slug>.<table>``."""
    db, table, column = _parse_source(str(criterion.get("source") or ""))
    candidates = [table] if db == cohort_db else []
    candidates.append(f"{db}.{table}")
    for key in candidates:
        alias = aliases.get(key)
        if alias is not None:
            return f"{alias}.{column}"
    available = ", ".join(sorted(aliases)) if aliases else "(none)"
    raise CohortError(
        f"criterion source table {table!r} (database {db!r}) is not present in the "
        f"cohort FROM clause (joined tables: {available}); this cohort only filters "
        f"across explicitly measured joins, and adding an implicit join here could "
        f"mix entities (e.g. baby vs mother rows)."
    )


def criterion_clauses(
    cohort_block: dict[str, Any], criteria: list[dict[str, Any]]
) -> list[tuple[str, dict[str, Any]]]:
    """The per-criterion ``(sql, params)`` clauses, alias-qualified against the
    cohort ``FROM``. Each criterion ``i`` binds under a distinct ``c{i}`` prefix so
    binds never collide. This is the single place a grounded criterion becomes
    SQL — the Dataset store reuses it so a persisted criterion's ``sql`` and the
    composed cohort agree exactly.
    """
    from_clause = str(cohort_block.get("from") or "").strip()
    if not from_clause:
        raise CohortError("cohort block is missing its `from` clause")
    cohort_db = str(cohort_block.get("database") or "").strip()
    aliases = _cohort_aliases(from_clause)
    clauses: list[tuple[str, dict[str, Any]]] = []
    for i, criterion in enumerate(criteria):
        col_ref = _col_ref(criterion, aliases, cohort_db)
        clauses.append(build_predicate(criterion, col_ref, bind=f"c{i}"))
    return clauses


def _compose(
    cohort_block: dict[str, Any], criteria: list[dict[str, Any]]
) -> tuple[str, str, dict[str, Any]]:
    """Return ``(from_clause, where_sql, params)`` for a cohort + its criteria.

    ``where_sql`` is empty when there are no criteria. Each criterion becomes one
    parenthesised, parameterised, alias-qualified clause, ANDed together.
    """
    from_clause = str(cohort_block.get("from") or "").strip()
    terms: list[str] = []
    params: dict[str, Any] = {}
    for sql, bound in criterion_clauses(cohort_block, criteria):
        terms.append(f"({sql})")
        params.update(bound)
    where_sql = " AND ".join(terms)
    return from_clause, where_sql, params


def compose_cohort(
    cohort_block: dict[str, Any], criteria: list[dict[str, Any]]
) -> tuple[str, dict[str, Any]]:
    """Compose the cohort's identity ``SELECT DISTINCT`` + its predicates.

    Returns ``(sql, params)`` — the parameterised, read-only statement that
    enumerates the slice's identities. This is what the Dataset persists as its
    transparent ``cohort_sql`` (the read-only raw-SQL view) and what run-time
    scoping ANDs into the executable's cohort block.
    """
    identity_select = str(cohort_block.get("identity_select") or "").strip()
    if not identity_select:
        raise CohortError("cohort block is missing its `identity_select`")
    from_clause, where_sql, params = _compose(cohort_block, criteria)
    sql = f"SELECT DISTINCT {identity_select} FROM {from_clause}"
    if where_sql:
        sql += f" WHERE {where_sql}"
    table_population.validate_sql(sql)
    return sql, params


def count_cohort(
    database_paths: dict[str, Path],
    cohort_block: dict[str, Any],
    criteria: list[dict[str, Any]],
) -> int:
    """Run the read-only ``COUNT(DISTINCT <identity>)`` proving the slice.

    ``database_paths`` maps each database slug the cohort touches to its SQLite
    file. The cohort database is the main connection; any others are ``ATTACH``ed
    read-only under their slug so a cross-database predicate joins in one
    statement. Raises :class:`CohortError` if the cohort database has no path or
    the composed query is not read-only.
    """
    identity_select = str(cohort_block.get("identity_select") or "").strip()
    if not identity_select:
        raise CohortError("cohort block is missing its `identity_select`")
    identity_expr = _AS_TAIL.sub("", identity_select).strip()

    cohort_db = str(cohort_block.get("database") or "").strip()
    main_path = database_paths.get(cohort_db)
    if main_path is None:
        raise CohortError(
            f"no database path supplied for cohort database {cohort_db!r}"
        )

    from_clause, where_sql, params = _compose(cohort_block, criteria)
    # COUNT(DISTINCT <identity>) ignores NULL identities — a row with no identity
    # cannot be attributed to a cohort member, so it is excluded from the count and
    # the enumerated slice (matching table-population cohort resolution, which
    # drops None-identity rows). The number is therefore distinct *identifiable* members.
    sql = f"SELECT COUNT(DISTINCT {identity_expr}) AS n FROM {from_clause}"
    if where_sql:
        sql += f" WHERE {where_sql}"
    table_population.validate_sql(sql)

    attach = {slug: p for slug, p in database_paths.items() if slug != cohort_db}
    # A missing/unreadable SQLite (or an ATTACH/exec failure) surfaces as a clean
    # CohortError, never a raw sqlite3 error leaking to the caller.
    try:
        # sqlite3.Connection.__exit__ only commits/rolls back — it never closes
        # the connection, so a bare `with ... as conn:` leaks it.
        with contextlib.closing(
            table_population.readonly_connection(Path(main_path), attach)
        ) as conn:
            bound_sql, args = table_population.bind_named_params(sql, params)
            row = conn.execute(bound_sql, args).fetchone()
    except (sqlite3.Error, OSError) as exc:
        raise CohortError(f"read-only count failed: {exc}") from exc
    return int(row[0]) if row and row[0] is not None else 0


# ---------------------------------------------------------------------------
# The executable's cohort block (table-population runtime).
#
# Table population speaks the SAME cohort grammar this module composes: the
# executable's cohort block (compiled by
# ``core.mapping.build_populate_spec._build_cohort``) is a joinable ``FROM``
# plus an identity ``SELECT``, and a run request's ``filters`` dict is parsed
# against the mapping's ``criteria_bindings`` into WHERE predicates ANDed onto
# that block. These functions moved verbatim from
# server/routes/table_populations.py so the grammar has ONE owner — the route
# now only calls them and maps their errors onto HTTP/session failures. They
# keep the route's historical behaviour bit-for-bit, including raising plain
# ``ValueError`` (not :class:`CohortError`) with the same messages.
# ---------------------------------------------------------------------------

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _normalize_filter_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(raw).lower())


def cohort_from_aliases(from_clause: str) -> dict[str, str]:
    """``{table: alias}`` for every table named in an executable cohort ``FROM``.

    The table-population runtime's reading of the grammar
    ``core.mapping.build_populate_spec._build_cohort`` writes: a leading anchor
    table with its alias (``cord_ph_birth_records b``), then one alias per
    ``JOIN <table> <alias> ON …`` clause; a bare table keys to itself. This is
    the single-database parser — it does not understand the quoted
    cross-database prefixes the Dataset-side :func:`_cohort_aliases` handles —
    kept bit-for-bit as the runtime has always read its FROM clauses.
    """
    aliases: dict[str, str] = {}
    lead = re.match(
        r"^\s*([A-Za-z_][\w.]*)\s+(?:AS\s+)?([A-Za-z_]\w*)\b",
        from_clause,
        flags=re.IGNORECASE,
    )
    if lead:
        aliases[lead.group(1).strip()] = lead.group(2).strip()
    else:
        lead_table = re.match(r"^\s*([A-Za-z_][\w.]*)\b", from_clause)
        if lead_table:
            table = lead_table.group(1).strip()
            aliases[table] = table
    for m in re.finditer(
        r"\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)\s+(?:AS\s+)?([A-Za-z_]\w*)",
        from_clause,
        flags=re.IGNORECASE,
    ):
        table = m.group(1).strip()
        alias = m.group(2).strip()
        aliases[table] = alias
    for m in re.finditer(
        r"\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)\b",
        from_clause,
        flags=re.IGNORECASE,
    ):
        table = m.group(1).strip()
        aliases.setdefault(table, table)
    return aliases


def _number_clause(value: str) -> tuple[str, list[float]] | None:
    text = value.strip().lower()
    text = text.replace("≥", ">=").replace("≤", "<=").replace("–", "-")
    text = re.sub(r"\b(weeks?|days?|months?|years?|yrs?)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    direct = re.match(r"^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)\s*$", text)
    if direct:
        return direct.group(1), [float(direct.group(2))]
    over = re.search(
        r"\b(over|older than|greater than|more than)\s+(-?\d+(?:\.\d+)?)", text
    )
    if over:
        return ">", [float(over.group(2))]
    under = re.search(r"\b(under|less than|below)\s+(-?\d+(?:\.\d+)?)", text)
    if under:
        return "<", [float(under.group(2))]
    between = re.search(r"(-?\d+(?:\.\d+)?)\s*(?:to|-|\.\.)\s*(-?\d+(?:\.\d+)?)", text)
    if between:
        a = float(between.group(1))
        b = float(between.group(2))
        lo, hi = (a, b) if a <= b else (b, a)
        return "between", [lo, hi]
    nums = _NUMBER_RE.findall(text)
    if len(nums) == 1:
        return "=", [float(nums[0])]
    if len(nums) >= 2:
        a = float(nums[0])
        b = float(nums[1])
        lo, hi = (a, b) if a <= b else (b, a)
        return "between", [lo, hi]
    return None


def _date_clause(value: str, key_hint: str = "") -> tuple[str, list[str]] | None:
    text = value.strip()
    lower = text.lower()
    if key_hint.endswith("from"):
        key_op = ">="
    elif key_hint.endswith("to"):
        key_op = "<="
    else:
        key_op = ""
    direct = re.match(r"^(>=|<=|>|<|=)\s*(.+)$", text)
    if direct:
        parsed = _date_to_iso(direct.group(2))
        return (direct.group(1), [parsed]) if parsed else None
    if key_op:
        parsed = _date_to_iso(text)
        return (key_op, [parsed]) if parsed else None
    if " to " in lower:
        a_raw, b_raw = re.split(r"\bto\b", text, maxsplit=1, flags=re.IGNORECASE)
        a = _date_to_iso(a_raw.strip())
        b = _date_to_iso(b_raw.strip())
        if a and b:
            lo, hi = (a, b) if a <= b else (b, a)
            return "between", [lo, hi]
    for prefix, op in (
        ("since ", ">="),
        ("after ", ">"),
        ("before ", "<"),
        ("until ", "<="),
    ):
        if lower.startswith(prefix):
            parsed = _date_to_iso(text[len(prefix) :].strip())
            return (op, [parsed]) if parsed else None
    parsed = _date_to_iso(text)
    return ("=", [parsed]) if parsed else None


def _resolve_binding(
    filter_key: str, bindings: list[dict[str, Any]]
) -> dict[str, Any] | None:
    norm = _normalize_filter_key(filter_key)
    if not norm:
        return None
    candidates: list[dict[str, Any]] = []
    for binding in bindings:
        source = str(binding.get("source") or "")
        parsed = try_parse_source(source)
        keyset = {
            _normalize_filter_key(str(binding.get("criterion_id") or "")),
            _normalize_filter_key(str(binding.get("label") or "")),
        }
        if parsed is not None:
            keyset.add(_normalize_filter_key(parsed[2]))  # source column
        if norm in keyset:
            candidates.append(binding)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        return None
    fuzzy = []
    for binding in bindings:
        parsed = try_parse_source(str(binding.get("source") or ""))
        fields = [
            _normalize_filter_key(str(binding.get("criterion_id") or "")),
            _normalize_filter_key(str(binding.get("label") or "")),
            _normalize_filter_key(parsed[2]) if parsed is not None else "",
        ]
        if any(norm and (norm in f or f in norm) for f in fields if f):
            fuzzy.append(binding)
    if len(fuzzy) == 1:
        return fuzzy[0]
    return None


def resolve_runtime_filter_predicates(
    filters: dict[str, str],
    mapping_doc: dict[str, Any],
    *,
    database_id: str,
    cohort_from: str,
) -> tuple[list[str], dict[str, Any]]:
    """Apply a run request's ``filters`` dict onto the cohort block's grammar.

    Each ``{key: value}`` pair is matched to one of the mapping's
    ``criteria_bindings`` (by criterion id, label, or source column), its value
    string parsed by the binding's type (category / number / date), and its
    column alias-qualified against ``cohort_from``. Returns
    ``(where_terms, params)`` ready to AND into the cohort ``SELECT``. Raises
    ``ValueError`` when the mapping has no bindings on ``database_id`` or any
    filter cannot be resolved — the population fails loudly rather than reading
    a broader cohort.
    """
    if not filters:
        return [], {}
    aliases = cohort_from_aliases(cohort_from)
    bindings = []
    for raw in mapping_doc.get("criteria_bindings", []) or []:
        if not isinstance(raw, dict):
            continue
        parsed = try_parse_source(str(raw.get("source") or ""))
        if parsed is None:
            continue
        if parsed[0] == database_id:
            bindings.append(raw)
    if not bindings:
        raise ValueError("mapping has no criteria bindings for the selected database")

    unresolved: list[str] = []
    where_terms: list[str] = []
    params: dict[str, Any] = {}
    idx = 0
    for key, value in filters.items():
        raw_key = str(key).strip()
        raw_value = str(value).strip()
        if not raw_key or not raw_value:
            continue
        if _normalize_filter_key(raw_key) == "database":
            continue
        binding = _resolve_binding(raw_key, bindings)
        if binding is None:
            unresolved.append(f"{raw_key!r}: no unique criteria binding")
            continue
        source = try_parse_source(str(binding.get("source") or ""))
        if source is None:
            unresolved.append(f"{raw_key!r}: invalid source reference")
            continue
        _, table, column = source
        if table not in aliases:
            unresolved.append(
                f"{raw_key!r}: source table {table!r} is not in cohort.from"
            )
            continue
        col_ref = f"{aliases[table]}.{column}"
        ftype = str(binding.get("type") or "").strip().lower()
        if ftype == "category":
            values = [
                part.strip() for part in re.split(r"[,\|]", raw_value) if part.strip()
            ]
            if not values:
                unresolved.append(f"{raw_key!r}: empty category value")
                continue
            bind_names = []
            for item in values:
                name = f"f{idx}_{len(bind_names)}"
                params[name] = item
                bind_names.append(f":{name}")
            if len(bind_names) == 1:
                where_terms.append(f"{col_ref} = {bind_names[0]}")
            else:
                where_terms.append(f"{col_ref} IN ({', '.join(bind_names)})")
            idx += 1
            continue
        if ftype == "number":
            clause = _number_clause(raw_value)
            if clause is None:
                unresolved.append(
                    f"{raw_key!r}: cannot parse numeric filter {raw_value!r}"
                )
                continue
            op, vals = clause
            if op == "between":
                lo = f"f{idx}_lo"
                hi = f"f{idx}_hi"
                params[lo], params[hi] = vals
                where_terms.append(f"{col_ref} BETWEEN :{lo} AND :{hi}")
            else:
                name = f"f{idx}"
                params[name] = vals[0]
                where_terms.append(f"{col_ref} {op} :{name}")
            idx += 1
            continue
        if ftype == "date":
            clause = _date_clause(raw_value, _normalize_filter_key(raw_key))
            if clause is None:
                unresolved.append(
                    f"{raw_key!r}: cannot parse date filter {raw_value!r}"
                )
                continue
            op, vals = clause
            if op == "between":
                lo = f"f{idx}_from"
                hi = f"f{idx}_to"
                params[lo], params[hi] = vals
                where_terms.append(f"{col_ref} BETWEEN :{lo} AND :{hi}")
            else:
                name = f"f{idx}"
                params[name] = vals[0]
                where_terms.append(f"{col_ref} {op} :{name}")
            idx += 1
            continue
        unresolved.append(f"{raw_key!r}: unsupported filter type {ftype!r}")

    if unresolved:
        raise ValueError(
            "Could not resolve one or more table-population filters: "
            + "; ".join(unresolved)
        )
    return where_terms, params


def validate_executable_cohort(
    executable: dict[str, Any], database_paths: dict[str, Path]
) -> tuple[dict[str, Any], Path, str, str]:
    """Validate an executable's cohort block before it is resolved.

    Checks, in the runtime's historical order: the ``cohort`` block exists, it
    names a ``database``, that database has a path in ``database_paths``, and
    both ``identity_select`` and ``from`` are present. Returns
    ``(cohort_spec, db_path, identity_select, from_clause)`` on success; raises
    ``ValueError`` with the runtime's exact message otherwise. (The executable's
    top-level ``identity_keys`` is NOT checked here — :func:`resolve_cohort`
    validates it only after the cohort SQL has run, preserving the historical
    error precedence.)
    """
    cohort_spec = executable.get("cohort")
    if not isinstance(cohort_spec, dict):
        raise ValueError("executable.cohort is missing")
    db_slug = str(cohort_spec.get("database") or "").strip()
    if not db_slug:
        raise ValueError("executable.cohort.database is missing")
    db_path = database_paths.get(db_slug)
    if db_path is None:
        raise ValueError(f"no database path supplied for cohort database {db_slug!r}")
    identity_select = str(cohort_spec.get("identity_select") or "").strip()
    from_clause = str(cohort_spec.get("from") or "").strip()
    if not identity_select or not from_clause:
        raise ValueError("executable.cohort is incomplete (identity_select/from)")
    return cohort_spec, db_path, identity_select, from_clause


def resolve_cohort(
    executable: dict[str, Any],
    database_paths: dict[str, Path],
    *,
    runtime_where: list[str] | None = None,
    runtime_params: dict[str, Any] | None = None,
) -> list[Any]:
    """Resolve the executable's cohort: compose its ``SELECT DISTINCT`` and run it.

    ANDs the cohort block's own ``where`` terms with any ``runtime_where``
    (each term parenthesised), runs the statement read-only on the cohort's
    database, and returns the ordered, de-duplicated identity members — a
    scalar per row for a single identity key, a tuple for compound keys; rows
    with any ``NULL`` identity value are dropped. Raises ``ValueError`` for an
    invalid cohort block or missing ``identity_keys``.
    """
    cohort_spec, db_path, identity_select, from_clause = validate_executable_cohort(
        executable, database_paths
    )
    where_terms = [
        str(term).strip()
        for term in (cohort_spec.get("where") or [])
        if str(term).strip()
    ]
    for term in runtime_where or []:
        if str(term).strip():
            where_terms.append(str(term).strip())
    sql = f"SELECT DISTINCT {identity_select} FROM {from_clause}"
    if where_terms:
        sql += " WHERE " + " AND ".join(f"({term})" for term in where_terms)
    rows = table_population.run_readonly_sql(db_path, sql, runtime_params or {})
    keys = [str(k).lower() for k in (executable.get("identity_keys") or [])]
    if not keys:
        raise ValueError("executable.identity_keys is missing")

    cohort: list[Any] = []
    seen: set[Any] = set()
    for row in rows:
        values = [row.get(key) for key in keys]
        if any(v is None for v in values):
            continue
        member: Any = values[0] if len(values) == 1 else tuple(values)
        if member in seen:
            continue
        seen.add(member)
        cohort.append(member)
    return cohort
