"""Assemble a table population's ingredients from the request identity.

Everything :func:`core.table_population.populate.populate_table` consumes that
is *derivable* from the request identity — (``source_template_id``, an
optional ``database_id`` hint, the runtime ``filters``) — is derived HERE,
behind one named function: :func:`assemble_population_context`. It loads the
audit spec, ensures + loads the mapping, extracts and validates the
``executable`` block, resolves the bound databases to their SQLite paths,
grounds the runtime filters into the cohort member list (via
``core.filters.cohort`` — the single owner of the cohort SQL grammar), and
computes the anchor, per-database cohort tables and member row layout.

The route layer keeps only route-shaped work: session relay/publisher wiring,
run/execution bookkeeping, refresh-delta preprocessing, the initial
``workbook_created`` grid emit, and HTTP error mapping. Assembly failures are
plain ``ValueError``s with the runtime's historical messages — the route's
generic handler translates them exactly as before.

The resolver hooks (``read_json``, ``resolve_runtime_filter_predicates``,
``resolve_cohort``, ``resolve_cohort_tables``) default to the canonical core
implementations. The route passes its own module-level aliases so the existing
test monkeypatch seams on ``server.routes.table_populations`` keep working
unchanged.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from core import mapping as mapping_phase
from core.config import DATABASES_DIR, DATASETS_DIR, TEMPLATES_DIR
from core.filters import cohort as cohort_filters
from core.table_population.cell_ref import member_id
from core.tables.scope import dataset_criteria_to_filters

# Async progress sink for the user-facing "activity" events emitted while the
# ingredients are derived (mapping load/build, cohort resolution); None in
# unit tests and non-streaming callers.
EmitAsync = Callable[[dict[str, Any]], Awaitable[None]]


def read_json_document(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return data if isinstance(data, dict) else None


def filters_from_dataset(
    dataset_id: str | None, *, datasets_dir: Path = DATASETS_DIR
) -> dict[str, str]:
    """The runtime filters a table's PINNED Dataset scope binds it to.

    Translates the Dataset's grounded ``criteria`` into the
    ``{criterion_id: value_string}`` filters dict the cohort resolver parses
    (decision 0004 — the table is bounded to exactly that hard cohort, fixed
    for life). Whole-DB (``dataset_id`` null) is an empty-but-valid scope ⇒
    ``{}``.

    FAIL-CLOSED, never silently broaden: a Dataset that cannot load raises
    ``DatasetError`` and a criterion the value-string format cannot faithfully
    encode raises ``TableScopeError`` (both ``ValueError`` subclasses) — the
    population fails rather than reading a broader cohort under a
    narrow-cohort label. The pin-time 422 gate in ``server.routes.tables``
    wraps this same function.
    """
    if not dataset_id:
        return {}
    # Bound at CALL time, like assemble_population_context's cohort hooks:
    # ``core.datasets.store`` itself imports ``core.filters.cohort`` (which
    # imports this package for the read-only SQL runner), so a module-level
    # import here would trip the circular import whenever datasets/cohort is
    # imported first.
    from core.datasets.store import load_dataset

    dataset = load_dataset(dataset_id, datasets_dir=datasets_dir)
    return dataset_criteria_to_filters(dataset.get("criteria") or [])


def database_from_dataset(
    dataset_id: str | None,
    *,
    datasets_dir: Path = DATASETS_DIR,
    read_json: Callable[[Path], dict[str, Any] | None] = read_json_document,
) -> str | None:
    """The database binding hint a table's PINNED Dataset scope carries.

    A named Dataset's first ``databases`` slug is the population database;
    ``None`` (whole-DB, or an unknown/corrupt Dataset) lets the assembly
    default the binding from the audit's own declaration. Best-effort by
    design — the fail-closed guarantee lives in :func:`filters_from_dataset`
    (an unloadable Dataset fails the filters derivation loudly).
    """
    if not dataset_id:
        return None
    dataset = read_json(datasets_dir / dataset_id / "dataset.json")
    if not isinstance(dataset, dict):
        return None
    databases = dataset.get("databases") or []
    return str(databases[0]) if databases else None


def audit_default_databases(
    source_template_id: str,
    audit_spec: dict[str, Any],
    *,
    templates_dir: Path = TEMPLATES_DIR,
    read_json: Callable[[Path], dict[str, Any] | None] = read_json_document,
) -> list[str]:
    """Database slugs the audit is bound to, in priority order.

    The canonical declaration is ``mapping.json::databases`` (mapping
    contract). For audits that haven't been mapped yet we fall back to a
    seed-time hint at ``spec.json::databases`` — a small extension to the
    audit-spec used only as a default-pick hint (the mapping is still the
    source of truth at run time). Returns an empty list when neither
    declaration is present.
    """
    mapping_doc = read_json(templates_dir / source_template_id / "mapping.json")
    if isinstance(mapping_doc, dict):
        dbs = mapping_doc.get("databases")
        if isinstance(dbs, list) and dbs:
            return [str(d) for d in dbs if isinstance(d, str) and d]
    spec_dbs = audit_spec.get("databases") if isinstance(audit_spec, dict) else None
    if isinstance(spec_dbs, list) and spec_dbs:
        return [str(d) for d in spec_dbs if isinstance(d, str) and d]
    return []


def resolve_cohort_tables(
    database_id: str,
    anchor: str | None,
    *,
    databases_dir: Path = DATABASES_DIR,
    read_json: Callable[[Path], dict[str, Any] | None] = read_json_document,
) -> dict[str, list[str]]:
    """The database's tables that carry the anchor identity column.

    Reads the database's canonical ``model.json`` — identity data is core's
    business. A missing model degrades to an empty table list, never an error.
    """
    if not anchor:
        return {}
    model = read_json(databases_dir / database_id / "model.json")
    if model is None:
        return {database_id: []}
    tables: list[str] = []
    anchor_lower = anchor.lower()
    for table in model.get("tables", []) or []:
        if not isinstance(table, dict):
            continue
        cols = table.get("columns", []) or []
        if any(
            isinstance(col, dict) and str(col.get("name") or "").lower() == anchor_lower
            for col in cols
        ):
            name = str(table.get("name") or "").strip()
            if name:
                tables.append(name)
    return {database_id: tables}


@dataclass
class AssembledPopulation:
    """Everything ``populate_table`` needs that derives from the request identity.

    ``member_rows`` is the fresh-run layout (cohort order from the first data
    row); a refresh recomputes rows from the persisted members and overrides it.
    """

    field_spec: dict[str, Any]
    executable: dict[str, Any]
    bound_database_ids: list[str]
    database_paths: dict[str, Path]
    cohort: list[Any]
    anchor: str | None
    cohort_tables: dict[str, list[str]]
    member_rows: dict[str, int]


async def assemble_population_context(
    source_template_id: str,
    *,
    database_id: str | None = None,
    filters: dict[str, str] | None = None,
    templates_dir: Path = TEMPLATES_DIR,
    databases_dir: Path = DATABASES_DIR,
    emit: EmitAsync | None = None,
    read_json: Callable[[Path], dict[str, Any] | None] = read_json_document,
    resolve_runtime_filter_predicates: Callable[..., tuple[list[str], dict[str, Any]]]
    | None = None,
    resolve_cohort: Callable[..., list[Any]] | None = None,
    resolve_cohort_tables: Callable[[str, str | None], dict[str, list[str]]]
    | None = None,
) -> AssembledPopulation:
    """Derive the population's ingredients from the request identity.

    Raises ``ValueError`` (with the runtime's historical messages) when the
    audit spec is missing, no database binding can be defaulted, no mapping is
    available, the mapping carries no ``executable``, a bound database has no
    SQLite file, a runtime filter cannot be grounded, or the cohort resolves
    empty.
    """
    # The cohort hooks bind at CALL time, not import time: ``core.filters.cohort``
    # itself imports ``core.table_population`` (for the read-only SQL runner),
    # so reading its attributes while this module loads would trip the circular
    # import the moment cohort.py is imported first.
    if resolve_runtime_filter_predicates is None:
        resolve_runtime_filter_predicates = (
            cohort_filters.resolve_runtime_filter_predicates
        )
    if resolve_cohort is None:
        resolve_cohort = cohort_filters.resolve_cohort
    filters = filters or {}
    field_spec = read_json(templates_dir / source_template_id / "spec.json")
    if field_spec is None:
        raise ValueError(
            f"template spec missing: {templates_dir / source_template_id / 'spec.json'}"
        )
    # The frontend deliberately omits the database in real mode and expects
    # the backend to default-select one (HomeScreen.svelte::defaultDbChips).
    # Per the storage / mapping contract, the audit's database binding is
    # declared in mapping.json::databases (mapping.schema.json §databases).
    # Fall back to that first; if the audit has no mapping yet, look for a
    # seed-time binding hint in spec.json::databases. If neither resolves
    # we surface a clearer error than the legacy 500.
    # The requested binding: the user's explicit pick, else the audit's
    # FULL declared set — one run may span several databases (doc 3
    # §multi-DB); the mapping is one file across all of them.
    if database_id:
        requested_ids = [database_id]
    else:
        requested_ids = audit_default_databases(
            source_template_id,
            field_spec,
            templates_dir=templates_dir,
            read_json=read_json,
        )
        if not requested_ids:
            raise ValueError(
                f"Audit '{source_template_id}' has no database binding to default to. "
                "Either pick a database in the UI or declare one in "
                f"var/templates/{source_template_id}/mapping.json::databases."
            )
    # ensure_mapping is fast when the mapping is cached but takes an LLM
    # call when it isn't (an audit running for the first time against its
    # databases). Tell the user which case we're in so they understand why
    # the wait is longer the very first time.
    mapping_cached = (templates_dir / source_template_id / "mapping.json").exists()
    if emit is not None:
        if mapping_cached:
            await emit(
                {
                    "type": "activity",
                    "headline": "Loading the audit↔database mapping.",
                    "label": "Loading the mapping",
                    "kind": "step",
                }
            )
        else:
            await emit(
                {
                    "type": "activity",
                    "headline": "Building the audit↔database mapping for the first time (this can take a minute).",
                    "label": "Building the mapping",
                    "kind": "step",
                }
            )
    mapping_json = await mapping_phase.ensure_mapping(source_template_id, requested_ids)
    if mapping_json is None:
        raise ValueError(
            f"Cannot bind audit '{source_template_id}' to database(s) {requested_ids}: no mapping is available."
        )
    mapping_doc = json.loads(mapping_json)
    executable = mapping_doc.get("executable")
    if not isinstance(executable, dict):
        raise ValueError("mapping.json is missing executable")
    # The mapping's database list is the authoritative binding (a cached
    # mapping may span more databases than the request named); every bound
    # database must have its SQLite present.
    bound_ids = [str(d) for d in (mapping_doc.get("databases") or requested_ids)]
    database_paths: dict[str, Path] = {}
    for bound_id in bound_ids:
        db_path = (databases_dir / bound_id / "database.sqlite").resolve()
        if not db_path.is_file():
            raise ValueError(
                f"Database '{bound_id}' is bound by the mapping but no SQLite file was found at {db_path}."
            )
        database_paths[bound_id] = db_path
    # Runtime filters compose into the cohort SELECT, which runs on the
    # cohort's own database — only bindings on that database can apply.
    cohort_db = str((executable.get("cohort") or {}).get("database") or bound_ids[0])
    cohort_where, cohort_params = resolve_runtime_filter_predicates(
        filters,
        mapping_doc,
        database_id=cohort_db,
        cohort_from=str(executable.get("cohort", {}).get("from") or ""),
    )
    if emit is not None:
        await emit(
            {
                "type": "activity",
                "headline": "Resolving the cohort.",
                "label": "Resolving the cohort",
                "kind": "step",
            }
        )
    cohort = resolve_cohort(
        executable,
        database_paths,
        runtime_where=cohort_where,
        runtime_params=cohort_params,
    )
    if not cohort:
        raise ValueError("No cohort members matched this table population.")

    anchor = next(iter(executable.get("identity_keys") or []), None)
    cohort_tables: dict[str, list[str]] = {}
    for bound_id in bound_ids:
        if resolve_cohort_tables is not None:
            cohort_tables.update(resolve_cohort_tables(bound_id, anchor))
        else:
            cohort_tables.update(
                _resolve_cohort_tables_default(
                    bound_id,
                    anchor,
                    databases_dir=databases_dir,
                    read_json=read_json,
                )
            )
    member_rows = {member_id(member): idx for idx, member in enumerate(cohort)}
    return AssembledPopulation(
        field_spec=field_spec,
        executable=executable,
        bound_database_ids=bound_ids,
        database_paths=database_paths,
        cohort=cohort,
        anchor=anchor,
        cohort_tables=cohort_tables,
        member_rows=member_rows,
    )


# Named alias so `resolve_cohort_tables` the hook parameter and the module
# function can coexist inside assemble_population_context's body.
_resolve_cohort_tables_default = resolve_cohort_tables
