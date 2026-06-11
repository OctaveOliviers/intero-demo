"""Phase 2 of A4: compile the executable Tier-1 plan from the match.

Deterministic, **no LLM**. Reads the audit's `mapping.json` match (`fields[]`,
`identity`, `regions`, `criteria_bindings`) and mechanically projects it into the
executable Tier-1 plan: a **v2** spec. A4 **folds this into the same `mapping.json`
under the `executable` key** (`fold_executable`) — the old standalone `populate.json`
is retired. `kind` and the Tier-1 code translation are computed HERE and nowhere else,
killing the old three-places duplication; the executable is a DERIVED build output,
regenerated on every match change, never hand-authored.

> **Decision A2 (Eng review, 2026-06-04).** Population is precomputed **data**, never
> generated or executed code. A single fixed, audited executor in `core/running` (Tier 1
> `try_direct`) reads the `executable`, scopes every region query to the resolved cohort,
> queries each database read-only, joins in Python on the identity keys, translates code
> sets, and writes cells. Nothing in the spec runs as a program.

> **executable v2 (A7).** The spec carries a top-level **`cohort`** block — a joinable
> base that SELECTs the identity keys — instead of a v1 `filters[]` array. The resolved
> inclusion conditions are ANDed into `cohort.where` at *run time* (owned by B6/B7); the
> precompiled spec ships `where: []`. Region queries are scoped to the cohort identities
> (`… IN (:cohort)`), never to per-region filter binds. The cohort's `from` /
> `identity_select` / join path are derived from `mapping.json`'s `identity` +
> `criteria_bindings`.

The shape is frozen by the W0.3 contract (`docs/mvp/contracts/runtime-shapes.md` §3)
and by `mapping.schema.json`'s `executable` section (A4). `validate_populate_spec`
checks a spec against the v2 contract (and rejects a v1 `filters[]` / per-region-bind
spec) so a builder never writes a broken executable and the seed fixture can be
verified offline.
"""

from __future__ import annotations

import json
import re

from core.slug import slugify as _slug

# Statements a read-only populate query may never contain — the executor enforces
# read-only at the SQLite level too, but a spec carrying these is malformed.
_WRITE_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|PRAGMA|VACUUM)\b",
    re.IGNORECASE,
)
# Named bind params, e.g. `:cohort`. SQLite casts (`::`) are not used here.
_BIND = re.compile(r"(?<!:):([A-Za-z_]\w*)")
# "<db> -> <table>.<column>" — the canonical source reference used in mapping.json.
_SOURCE_RE = re.compile(r"^\s*(?P<db>[^>]+?)\s*->\s*(?P<table>[^.]+?)\.(?P<column>.+?)\s*$")
# A criterion's join path: "<from_table>.<from_col> -> <to_table>.<to_col>".
_JOIN_RE = re.compile(
    r"^\s*(?P<lt>\w+)\.(?P<lc>\w+)\s*->\s*(?P<rt>\w+)\.(?P<rc>\w+)\s*$"
)

# The named bind the run-time executor expands to the resolved cohort identity set.
# Region queries are scoped to it (`… IN (:cohort)`); it is the only bind a v2 region
# SQL may carry — filters live on the cohort block, not on the regions.
COHORT_BIND = "cohort"

WORKBOOK = "workbook.xlsx"


class BuildError(ValueError):
    """A mapping.json that cannot be mechanically compiled into a populate spec."""


def _parse_source(source: str) -> tuple[str, str, str]:
    m = _SOURCE_RE.match(source or "")
    if not m:
        raise BuildError(f"unparseable source reference: {source!r}")
    return m.group("db").strip(), m.group("table").strip(), m.group("column").strip()


def _build_cohort(mapping: dict) -> tuple[dict, str, str]:
    """Compile the v2 cohort block from the mapping's identity + criteria_bindings.

    Returns ``(cohort_block, anchor_table, anchor_column)``. The cohort is a joinable
    base: the anchor table plus every distinct join a criterion needs to reach the
    anchor, so any resolvable inclusion condition can be ANDed onto it at run time.
    """
    identity = mapping.get("identity") or {}
    anchor = identity.get("anchor")
    if not isinstance(anchor, str) or not anchor:
        raise BuildError("mapping.identity.anchor is missing")
    db, anchor_table, anchor_col = _parse_source(anchor)

    # Anchor table is aliased `b`; each joined table gets a deterministic short alias.
    used_aliases = {"b"}
    seen_joins: set[tuple[str, str, str]] = set()
    join_clauses: list[str] = []
    for binding in mapping.get("criteria_bindings") or []:
        m = _JOIN_RE.match(binding.get("join_path") or "")
        if not m or m.group("lt") != anchor_table:
            continue  # direct column on the anchor (no join), or a join off another table
        # The cohort SQL runs against ONE database: a binding whose source lives in
        # another database cannot compose into this FROM (its join target table does
        # not exist here) — such a criterion resolves via escalation, never via a
        # cross-database join baked into single-database SQL.
        source_m = _SOURCE_RE.match(binding.get("source") or "")
        if not source_m or source_m.group("db").strip() != db:
            continue
        rt, lc, rc = m.group("rt"), m.group("lc"), m.group("rc")
        key = (rt, lc, rc)
        if key in seen_joins:
            continue
        seen_joins.add(key)
        alias = _short_alias(rt, used_aliases)
        join_clauses.append(f"JOIN {rt} {alias} ON b.{lc} = {alias}.{rc}")

    from_clause = f"{anchor_table} b"
    if join_clauses:
        from_clause += " " + " ".join(join_clauses)

    cohort = {
        "database": db,
        "from": from_clause,
        "identity_select": f"b.{anchor_col} AS {anchor_col}",
        "where": [],
    }
    return cohort, anchor_table, anchor_col


def _identity_plan(
    mapping: dict, anchor_db: str, anchor_table: str, anchor_col: str
) -> tuple[dict[str, str], dict[str, str], list[dict]]:
    """Per-database identity columns + the bridges for cross-database joins (A3).

    Returns ``(key_columns, key_tables, bridges)``. ``key_columns[db]`` is the column
    that keys that database's rows — the anchor column for the anchor database, the
    database's own identity key otherwise; ``key_tables[db]`` is the table that
    carries it. Each foreign database gets a **bridge**: the anchor table column
    whose values equal that database's key (derived from ``mapping.identity.keys``),
    so the executor can translate the resolved cohort identities into that database's
    key set and join the results back in Python — cross-database SQL is never emitted.

    Deterministic or loud: a foreign database whose bridge cannot be derived
    unambiguously (no single non-anchor key on the anchor table, or several keys
    listed for the foreign database) raises :class:`BuildError` — a guessed identity
    join would silently mix patients.
    """
    keys_by_db: dict[str, list[tuple[str, str]]] = {}
    for ref in (mapping.get("identity") or {}).get("keys") or []:
        db, table, col = _parse_source(ref)
        entry = (table, col)
        if entry not in keys_by_db.setdefault(db, []):
            keys_by_db[db].append(entry)

    key_columns: dict[str, str] = {anchor_db: anchor_col}
    key_tables: dict[str, str] = {anchor_db: anchor_table}
    bridges: list[dict] = []
    foreign_dbs = [db for db in keys_by_db if db != anchor_db]
    if not foreign_dbs:
        return key_columns, key_tables, bridges

    bridge_candidates = [
        col for table, col in keys_by_db.get(anchor_db, [])
        if table == anchor_table and col != anchor_col
    ]
    if len(bridge_candidates) != 1:
        raise BuildError(
            f"cannot derive the identity bridge for database(s) {foreign_dbs!r}: "
            f"identity.keys must list exactly one non-anchor key on the anchor table "
            f"{anchor_table!r} (found {bridge_candidates!r})"
        )
    bridge_col = bridge_candidates[0]
    for db in foreign_dbs:
        if len(keys_by_db[db]) != 1:
            raise BuildError(
                f"cannot derive the identity key for database {db!r}: identity.keys "
                f"must list exactly one key for it (found {keys_by_db[db]!r})"
            )
        f_table, col = keys_by_db[db][0]
        key_columns[db] = col
        key_tables[db] = f_table
        bridges.append({
            "database": db,
            "key_column": col,
            "via": {
                "table": anchor_table,
                "anchor_column": anchor_col,
                "bridge_column": bridge_col,
            },
        })
    bridges.sort(key=lambda b: b["database"])
    return key_columns, key_tables, bridges


def _short_alias(table: str, used: set[str]) -> str:
    """A stable, collision-free single/short alias for a table (first letter, then 2…)."""
    base = table[0].lower()
    alias = base
    n = 1
    while alias in used:
        n += 1
        alias = f"{base}{n}"
    used.add(alias)
    return alias


def _field_kind(field: dict) -> str:
    """The field's effective populate kind.

    A field whose value is drawn from **several sources** (multiple columns, several
    databases, or a one-to-many note relation) is **never a Tier-1 copy** — Tier 1 can
    only copy one column into one cell. Such a field is compiled as `interpret`: its
    evidence columns are fetched and Tier 2 (`try_llm`) decides the cell value from the
    field's `spec.json` description.

    A single-source field keeps its mapping `kind`. `direct` therefore means a confident
    straight copy (optionally code-translated); `interpret` means the value must be
    derived from evidence. NB: a value living in a free-text **note** must already be
    marked `interpret` at mapping time — otherwise Tier 1 would copy the whole note into
    the cell. The builder cannot detect that from a single source; the mapping must.
    """
    if len(field.get("sources") or []) > 1:
        return "interpret"
    return field.get("kind")


def _tier1_reachable(
    db: str, table: str, anchor_db: str | None, key_tables: dict[str, str] | None
) -> bool:
    """Whether Tier 1 can mechanically key this table's rows to the cohort.

    Anchor-database tables are assumed reachable (they are expected to carry the
    anchor column — the pure compiler cannot verify, and the executor degrades a
    failing query to per-cell escalation at run time). A FOREIGN database is
    reachable only through its key table: the identity bridge translates anchor
    identities into that one column, so any other foreign table — a different
    grain, an unknown linking column — cannot be keyed without judgment, and its
    fields are forced to `interpret` for the higher tiers."""
    if anchor_db is None or db == anchor_db:
        return True
    return key_tables is not None and key_tables.get(db) == table


def _field_slug(sheet: str, header: str, *, multi_sheet: bool) -> str:
    """The audit-field id the executable FKs into. Single-sheet audits emit a bare
    slug of the header (today's behavior, preserved); multi-sheet audits emit
    `{slugify(sheet)}/{slugify(header)}` so two cells with the same header on
    different sheets get structurally-distinct ids — no `_2` suffix, no orphan,
    no silent collision. The audit-side hand-authored `spec.json` uses the same
    convention so the FK chain stays bijective."""
    base = _slug(header)
    if not multi_sheet:
        return base
    return f"{_slug(sheet)}/{base}"


def _build_region(
    rid: str,
    sheet: str,
    kind: str,
    fields: list[dict],
    anchor_col: str,
    code_sets: dict[str, dict[str, str]],
    *,
    multi_sheet: bool,
    key_columns: dict[str, str] | None = None,
    key_tables: dict[str, str] | None = None,
    anchor_db: str | None = None,
) -> dict:
    """Compile one populate region: one read-only, cohort-scoped query per source
    `(database, table)` covering the largest set of cells, plus the cell map.

    `direct`: each field copies one source column → one cell (optionally code-translated).
    `interpret`: every source column of each field is fetched as evidence; the cell map
    names the field so Tier 2/3 can decide the value from its `spec.json` description.
    """
    # Columns to SELECT per (database, table), in first-seen order.
    table_cols: dict[tuple[str, str], list[str]] = {}

    def _need(db: str, table: str, col: str) -> None:
        cols = table_cols.setdefault((db, table), [])
        if col not in cols:
            cols.append(col)

    cell_map: list[dict] = []
    for field in fields:
        if kind == "direct":
            db, table, col = _parse_source(field["sources"][0])
            _need(db, table, col)
            # `field` (the audit field id) and `table` are carried so try_direct (A4)
            # can stamp every cell's required `field` and build the narrowed per-cell
            # query (`SELECT <column> FROM <table> WHERE <identity>=<id>`) without
            # re-parsing the wide region SQL (cell-resolution.schema.json).
            entry: dict = {
                "field": _field_slug(sheet, field["header"], multi_sheet=multi_sheet),
                "column": col,
                "table": table,
                "cell_template": _tmpl(field["cell"]),
            }
            if field.get("code"):
                code_sets[col] = {v: k for k, v in field["code"].items()}
                entry["translate"] = col
            cell_map.append(entry)
        else:  # interpret — fetch every source column as evidence; the LLM/agent decides
            for src in field["sources"]:
                db, table, col = _parse_source(src)
                # Evidence on a table Tier 1 cannot key is not mechanically
                # fetchable — the higher tiers reach it from the mapping match's
                # per-field sources + the schema hint instead.
                if _tier1_reachable(db, table, anchor_db, key_tables):
                    _need(db, table, col)
            cell_map.append(
                {"field": _field_slug(sheet, field["header"], multi_sheet=multi_sheet),
                 "cell_template": _tmpl(field["cell"])}
            )

    queries: list[dict] = []
    for (db, table), cols in table_cols.items():
        # Each query is keyed by ITS database's identity column: the anchor column
        # for the anchor database, the database's own key (via the identity bridge)
        # otherwise — a foreign table does not carry the anchor column at all.
        if key_columns is not None and db not in key_columns:
            raise BuildError(
                f"region {rid!r} reads database {db!r} but mapping.identity.keys "
                f"carries no identity key for it"
            )
        key_col = (key_columns or {}).get(db, anchor_col)
        alias = table[0].lower()
        select_cols = [f"{alias}.{key_col}"] + [
            f"{alias}.{c}" for c in cols if c != key_col
        ]
        sql = (
            f"SELECT {', '.join(select_cols)} FROM {table} {alias} "
            f"WHERE {alias}.{key_col} IN (:{COHORT_BIND})"
        )
        query = {"database": db, "sql": sql}
        if key_col != anchor_col:
            query["key_column"] = key_col
        queries.append(query)

    return {
        "id": rid,
        "sheet": sheet,
        "kind": kind,
        "queries": queries,
        "row_anchor": anchor_col,
        "cell_map": cell_map,
    }


def build_populate_spec(mapping: dict) -> dict:
    """Compile a parsed `mapping.json` into the v2 `populate.json` spec (a dict).

    Pure and deterministic — no LLM, no database connection. Per region it emits one
    read-only, cohort-scoped query per source table (covering the largest set of cells),
    the cell map (result column → workbook cell), code-set translations, and the
    identity join keys; plus the top-level cohort block (A7).
    """
    if not isinstance(mapping, dict):
        raise BuildError("mapping is not a JSON object")

    audit_id = mapping.get("audit")
    if not isinstance(audit_id, str) or not audit_id:
        raise BuildError("mapping.audit is missing")

    cohort, anchor_table, anchor_col = _build_cohort(mapping)

    # Identity keys used by Tier 1 row joins. We currently compile one canonical
    # key: the anchor column. In multi-database mappings, additional key columns
    # are often database/table-specific and forcing every region query to SELECT
    # every extra key makes executable compilation fail before run time.
    #
    # Keep the executable join key narrow and deterministic (anchor only); higher
    # tiers still carry full provenance and can escalate unresolved identities.
    identity_cols: list[str] = [anchor_col]

    # Cross-database identity plan (A3): the column that keys each database's rows
    # plus the bridge that translates the anchor identity into a foreign database's
    # key set. Single-database mappings get no bridges and compile unchanged.
    key_columns, key_tables, identity_bridges = _identity_plan(
        mapping, cohort["database"], anchor_table, anchor_col
    )

    fields_by_region: dict[str, list[dict]] = {}
    for field in mapping.get("fields") or []:
        fields_by_region.setdefault(field["region"], []).append(field)

    # Multi-sheet detection: when the mapping spans >1 distinct sheet, every cell
    # FK is sheet-prefixed (`sheet/header`) so same-header cells on different
    # sheets can't collide. Single-sheet mappings keep bare slugs unchanged.
    multi_sheet = len({
        r.get("sheet") for r in mapping.get("regions") or []
    }) > 1

    code_sets: dict[str, dict[str, str]] = {}
    regions_out: list[dict] = []
    for region in mapping.get("regions") or []:
        rid = region["id"]
        sheet = region.get("sheet", rid)
        region_fields = fields_by_region.get(rid, [])
        if not region_fields:
            continue
        # Split a sheet's fields by effective kind: a multi-source field is forced to
        # `interpret` (see _field_kind), so one mapping region can yield a direct AND an
        # interpret populate region (both scoped to the same cohort identities).
        by_kind: dict[str, list[dict]] = {"direct": [], "interpret": []}
        for field in region_fields:
            kind = _field_kind(field)
            if kind == "direct":
                db, table, _col = _parse_source(field["sources"][0])
                if not _tier1_reachable(db, table, cohort["database"], key_tables):
                    kind = "interpret"  # Tier 1 cannot key this table's rows (A3)
            by_kind[kind].append(field)
        present = [k for k in ("direct", "interpret") if by_kind[k]]
        for kind in present:
            out_id = rid if len(present) == 1 else f"{rid}-{kind}"
            regions_out.append(
                _build_region(
                    out_id, sheet, kind, by_kind[kind], anchor_col, code_sets,
                    multi_sheet=multi_sheet, key_columns=key_columns,
                    key_tables=key_tables, anchor_db=cohort["database"],
                )
            )

    spec = {
        "schema_version": "2",
        "audit_id": audit_id,
        "workbook": WORKBOOK,
        "identity_keys": identity_cols,
        "cohort": cohort,
        "regions": regions_out,
        "code_sets": code_sets,
    }
    if identity_bridges:
        spec["identity_bridges"] = identity_bridges
    return spec


def fold_executable(mapping: dict) -> dict:
    """Compile the executable from `mapping`'s match and fold it in under `executable`.

    A4 keeps the match and the derived executable in **one file**: this returns a
    shallow copy of `mapping` with `mapping["executable"]` set to the freshly compiled
    (and validated) v2 spec. Pure and deterministic — call it whenever the match
    changes; never hand-edit the result. Raises :class:`BuildError` if the compiled
    executable does not satisfy the v2 contract (a broken executable is never folded).
    """
    spec = build_populate_spec(mapping)
    errors = validate_populate_spec(spec)
    if errors:
        raise BuildError("compiled executable is invalid: " + "; ".join(errors))
    folded = dict(mapping)
    folded["executable"] = spec
    return folded


def _tmpl(cell_letter: str) -> str:
    return f"{{col:{cell_letter}}}{{row}}"


def validate_populate_spec(spec: dict) -> list[str]:
    """Validate a populate spec against the **v2** contract; return a list of errors.

    An empty list means the spec is valid. Encodes the frozen v2 `populate.json`
    contract (`docs/mvp/contracts/runtime-shapes.md` §3): `schema_version "2"`, the
    top-level **cohort block** (`database`, `from`, `identity_select`, `where: []`),
    region queries that are read-only, SELECT the identity keys, and are **cohort-scoped**
    (`:cohort` only — no per-region filter binds), a cell map per region, and resolving
    code-set references. It explicitly **rejects a v1 spec** (a `filters[]` array or a
    per-region filter bind). A builder calls this before writing (never persist a broken
    spec); the seed verify check calls it on the committed fixture.
    """
    errors: list[str] = []

    if not isinstance(spec, dict):
        return ["spec is not a JSON object"]

    if spec.get("schema_version") != "2":
        errors.append('schema_version must be "2" (v1 specs are rejected)')
    # v1 rejection: filters[] moved to the cohort block in v2.
    if "filters" in spec:
        errors.append('top-level "filters" is a v1 field; v2 puts conditions on the cohort block')

    for field in ("audit_id", "workbook"):
        if not isinstance(spec.get(field), str) or not spec.get(field):
            errors.append(f"missing or empty string field: {field}")

    identity_keys = spec.get("identity_keys")
    if not isinstance(identity_keys, list) or not identity_keys:
        errors.append("identity_keys must be a non-empty list")
        identity_keys = []
    elif not all(isinstance(k, str) and k for k in identity_keys):
        errors.append("identity_keys must all be non-empty strings")
        identity_keys = [k for k in identity_keys if isinstance(k, str) and k]

    errors += _validate_cohort(spec.get("cohort"))

    bridge_dbs: set[str] = set()
    bridges = spec.get("identity_bridges")
    if bridges is not None:
        errors += _validate_bridges(bridges, spec.get("cohort"))
        if isinstance(bridges, list):
            bridge_dbs = {
                b.get("database") for b in bridges if isinstance(b, dict)
            }

    code_sets = spec.get("code_sets", {})
    if not isinstance(code_sets, dict):
        errors.append("code_sets must be an object")
        code_sets = {}

    regions = spec.get("regions")
    if not isinstance(regions, list) or not regions:
        errors.append("regions must be a non-empty list")
        regions = []

    for r in regions:
        errors += _validate_region(r, identity_keys, code_sets, bridge_dbs)

    return errors


def _validate_bridges(bridges, cohort) -> list[str]:
    errors: list[str] = []
    if not isinstance(bridges, list) or not bridges:
        return ["identity_bridges, when present, must be a non-empty list"]
    cohort_db = cohort.get("database") if isinstance(cohort, dict) else None
    for b in bridges:
        if not isinstance(b, dict):
            errors.append("an identity_bridges entry is not an object")
            continue
        db = b.get("database")
        for field in ("database", "key_column"):
            if not isinstance(b.get(field), str) or not b.get(field):
                errors.append(f"identity bridge missing or empty {field}")
        if db and db == cohort_db:
            errors.append(
                f"identity bridge for {db!r} targets the cohort database itself"
            )
        via = b.get("via")
        if not isinstance(via, dict):
            errors.append(f"identity bridge for {db!r} is missing its via block")
            continue
        for field in ("table", "anchor_column", "bridge_column"):
            if not isinstance(via.get(field), str) or not via.get(field):
                errors.append(f"identity bridge for {db!r} via is missing {field}")
    return errors


def _validate_cohort(cohort) -> list[str]:
    errors: list[str] = []
    if not isinstance(cohort, dict):
        return ["cohort block is required (v2) and must be an object"]
    for field in ("database", "from", "identity_select"):
        val = cohort.get(field)
        if not isinstance(val, str) or not val.strip():
            errors.append(f"cohort.{field} missing or empty")
        elif _WRITE_KEYWORDS.search(val):
            errors.append(f"cohort.{field} is not read-only (write/DDL keyword)")
    where = cohort.get("where")
    if not isinstance(where, list):
        errors.append("cohort.where must be a list (empty in the precompiled spec)")
    return errors


def _validate_region(
    r, identity_keys: list[str], code_sets: dict, bridge_dbs: set[str] = frozenset()
) -> list[str]:
    errors: list[str] = []
    rid = r.get("id", "<no id>") if isinstance(r, dict) else "<not an object>"
    tag = f"region {rid!r}"
    if not isinstance(r, dict):
        return [f"{tag}: not an object"]

    for field in ("id", "sheet", "row_anchor"):
        if not isinstance(r.get(field), str) or not r.get(field):
            errors.append(f"{tag}: missing or empty {field}")
    kind = r.get("kind")
    if kind not in ("direct", "interpret"):
        errors.append(f"{tag}: kind must be 'direct' or 'interpret'")

    queries = r.get("queries")
    if not isinstance(queries, list):
        errors.append(f"{tag}: queries must be a list")
        queries = []
    elif not queries and kind == "direct":
        # An interpret region may carry no queries (its evidence lives on tables
        # Tier 1 cannot key — higher tiers fetch it); a direct region must.
        errors.append(f"{tag}: a direct region's queries must be non-empty")
    region_binds: set[str] = set()
    for q in queries:
        if not isinstance(q, dict):
            errors.append(f"{tag}: a query is not an object")
            continue
        if not isinstance(q.get("database"), str) or not q.get("database"):
            errors.append(f"{tag}: a query is missing 'database'")
        sql = q.get("sql")
        if not isinstance(sql, str) or not sql.strip():
            errors.append(f"{tag}: a query is missing 'sql'")
            continue
        if _WRITE_KEYWORDS.search(sql):
            errors.append(f"{tag}: query is not read-only (write/DDL keyword)")
        # A query keyed by its own database's identity column (cross-database, A3)
        # must SELECT that column and carry a bridge translating the anchor identity
        # into its key set; an anchor-database query SELECTs the identity keys.
        key_column = q.get("key_column")
        if key_column is not None:
            if not isinstance(key_column, str) or not key_column:
                errors.append(f"{tag}: key_column must be a non-empty string")
                key_column = None
            elif q.get("database") not in bridge_dbs:
                errors.append(
                    f"{tag}: query for {q.get('database')!r} carries key_column "
                    f"{key_column!r} but no identity bridge for that database exists"
                )
        required_keys = [key_column] if key_column else identity_keys
        for key in required_keys:
            if not re.search(rf"\b{re.escape(key)}\b", sql):
                errors.append(
                    f"{tag}: query for {q.get('database')!r} does not SELECT "
                    f"identity key {key!r}"
                )
        binds = set(_BIND.findall(sql))
        region_binds |= binds
        # v2: the cohort bind is the ONLY permitted region bind; a leftover filter bind
        # (e.g. :date_from) is a v1 per-region-bind spec and is rejected.
        for b in binds - {COHORT_BIND}:
            errors.append(
                f"{tag}: SQL bind :{b} is not permitted in v2 "
                f"(filters live on the cohort block, not the region)"
            )

    # v2 parameterisation: every region (direct copy or interpret evidence fetch) must
    # be cohort-scoped — clinical correctness depends on never reaching outside the cohort.
    if queries and COHORT_BIND not in region_binds:
        errors.append(f"{tag}: region query is not cohort-scoped (missing :{COHORT_BIND})")

    cell_map = r.get("cell_map")
    if not isinstance(cell_map, list) or not cell_map:
        errors.append(f"{tag}: cell_map must be a non-empty list")
        cell_map = []
    for c in cell_map:
        if not isinstance(c, dict):
            errors.append(f"{tag}: a cell_map entry is not an object")
            continue
        if not isinstance(c.get("cell_template"), str) or not c.get("cell_template"):
            errors.append(f"{tag}: a cell_map entry is missing cell_template")
        # direct: copies one `table.column` into the cell and carries the audit `field`
        # id (try_direct stamps every cell's required `field`); interpret: only `field`.
        required = ("field", "column", "table") if kind == "direct" else ("field",)
        for key in required:
            if not isinstance(c.get(key), str) or not c.get(key):
                errors.append(f"{tag}: a {kind} cell_map entry is missing {key}")
        translate = c.get("translate")
        if translate is not None and translate not in code_sets:
            errors.append(f"{tag}: translate {translate!r} not in code_sets")

    return errors


def load_and_validate(path) -> list[str]:
    """Read a `mapping.json` from `path` and validate its `executable`. Returns errors.

    The executable lives in `mapping.json` under `executable` (no standalone file). A
    document missing it fails validation cleanly (`validate_populate_spec(None)`)."""
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    return validate_populate_spec(doc.get("executable") if isinstance(doc, dict) else None)


def _main(argv: list[str]) -> int:
    """Fold the executable into a mapping document (deterministic, no LLM).

    Compiles the executable from the mapping's match and emits the mapping with
    `executable` set — the executable lives in the same file (no standalone
    populate.json). Prints to stdout by default; pass an out-path to write (use the
    same path to regenerate in place). Never mutates the input unless asked to.

    Usage: ``python3 -m core.mapping.build_populate_spec <mapping.json> [<out.json>]``
    """
    if not argv:
        print("usage: build_populate_spec <mapping.json> [<out mapping.json>]")
        return 2
    with open(argv[0], encoding="utf-8") as fh:
        mapping = json.load(fh)
    try:
        folded = fold_executable(mapping)
    except BuildError as exc:
        print(str(exc))
        return 1
    text = json.dumps(folded, indent=2) + "\n"
    if len(argv) > 1:
        with open(argv[1], "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote executable into {argv[1]}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(_main(sys.argv[1:]))
