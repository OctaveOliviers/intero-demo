"""The Table control plane: pin + spawn / list / read / delete a populated audit
table (product-flows.md §Threads, tables & outputs; Q36).

A **table** is a first-class, auto-persisted, re-openable entity that owns one
table population. When a table is created, the system pins a table spec
(columns/grain + scope) and spawns table population; this route does not
re-implement the SSE stream, workbook rebuild, or cell persistence. Because table
population is a server-side background asyncio task writing cells to
``var/state.db``, it survives client navigation.

The table ENGINE is :mod:`core.tables.store` (mint/persist/load/list/delete +
the spec snapshot); these routes are the thin auth + spawn shell over it,
mirroring :mod:`server.routes.datasets` / :mod:`server.routes.threads`. Reads need
``table.read``, writes ``table.manage``; the middleware already 401s an anonymous
``/api/*`` request, and each route raises 403 when the role lacks the key.

**Table population is TEMPLATE-BACKED ONLY** (``create_table_population`` requires
``audit_id`` + ``var/templates/<audit_id>/spec.json`` + mapping; there is no ad-hoc /
unmapped table-population path). So a ``source_template`` that is a real seeded audit id is
spawned via the existing :func:`server.routes.table_populations._launch_table_population_session`; an
``"ad-hoc"`` table is PINNED + PERSISTED with ``table_population_id=None`` / ``status="queued"``
(populating it needs the separate template-persist→mapping flow — a follow-up,
not a table-control-plane change).

The stream / workbook / status of a populated table are the EXISTING
``/api/table-populations/{table_population_id}/stream`` · ``/workbook`` · ``GET /api/table-populations/{table_population_id}`` (the FE
reuses them via the table's ``table_population_id``) — they are NOT redefined here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response

from core.config import ARTIFACTS_DIR, DATASETS_DIR, TEMPLATES_DIR
from core.datasets import store as dataset_store
from core.datasets.store import DatasetError
from core import table_population
from core.store import Store
from core.tables import store as table_store
from core.tables.scope import TableScopeError
from core.tables.store import TableError
from server.auth import grants
from server.auth import store as auth_store
from server.models import TableCreateRequest, TableRenameRequest, TableSummary
from server.routes import table_populations as table_populations_route
from server.routes._guards import require, safe_id

router = APIRouter()

# The literal that marks a describe-it table the template-backed table-population
# module cannot yet populate (it is pinned + persisted, never spawned).
AD_HOC_TEMPLATE = "ad-hoc"


def _safe_id(table_id: str) -> str:
    """Refuse a non-slug table id with a 404 (the shared traversal guard, with the
    Table entity label)."""
    return safe_id(table_id, kind="Table")


def _require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a permission key (401 then 403) — the shared
    control-plane gate."""
    return require(request, permission)


def _read_template_spec(template_id: str) -> dict[str, Any] | None:
    """Read a seeded template's ``spec.json`` (for the pinned columns/grain snapshot
    and the default database binding). Returns ``None`` when it is absent/invalid."""
    path = TEMPLATES_DIR / template_id / "spec.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _scope_from_dataset(dataset_id: str | None) -> tuple[str | None, str]:
    """Resolve the PINNED scope into ``(database_id, scope_disclosure)``.

    ``dataset_id`` null ⇒ whole-DB (no database pinned; table population defaults its own
    database from the audit binding). For a named Dataset we read its first
    ``databases`` slug as the population database and disclose the Dataset's name.

    The Dataset's grounded ``criteria`` are translated into table-population
    runtime filters by :func:`_filters_from_dataset` (decision 0004 — the table is
    bounded to the pinned hard cohort); this helper resolves only the database +
    the human disclosure.
    """
    if not dataset_id:
        return None, "the whole hospital database"
    try:
        dataset = dataset_store.load_dataset(dataset_id, datasets_dir=DATASETS_DIR)
    except DatasetError:
        # An unknown/broken Dataset id still pins the scope ref (immutability is
        # Issue 3); population falls back to the audit's default database binding.
        return None, f"the {dataset_id} slice"
    databases = dataset.get("databases") or []
    database_id = str(databases[0]) if databases else None
    name = str(dataset.get("name") or dataset_id)
    return database_id, f"the {name} slice"


def _filters_from_dataset(dataset_id: str | None) -> dict[str, str]:
    """The PIN-TIME fail-closed gate over the ONE core derivation
    (:func:`core.table_population.prepare.filters_from_dataset` — the same
    function ``populate_table`` derives the runtime filters from at run time,
    so a table that pins here is a table that populates there).

    Translating the PINNED Dataset's grounded ``criteria`` into the
    ``{criterion_id: value_string}`` filters bounds table population to EXACTLY
    that hard cohort (decision 0004 — scope binds to the table, fixed for
    life). Whole-DB (``dataset_id`` null) is an empty-but-valid scope ⇒ ``{}``.

    FAIL-CLOSED, uniformly: a Dataset criterion the value-string format cannot
    faithfully encode (``dataset_criteria_to_filters`` raises
    ``TableScopeError``) surfaces as a ``422`` — and a pinned Dataset that
    cannot even LOAD (missing/corrupt ``dataset.json`` ⇒ ``load_dataset``
    raises ``DatasetError``) ALSO surfaces as a ``422``. Either way the table
    is NOT spawned with a silently-broader cohort under a narrow-cohort label.
    """
    try:
        return table_population.filters_from_dataset(
            dataset_id, datasets_dir=DATASETS_DIR
        )
    except DatasetError as exc:
        # A pinned Dataset that cannot load fails CLOSED — never widen the cohort
        # to the whole DB while the table still discloses 'the <id> slice'.
        raise HTTPException(
            status_code=422,
            detail=f"Pinned Dataset cannot be loaded to scope the table: {exc}",
        ) from exc
    except TableScopeError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Dataset cannot scope a table exactly: {exc}",
        ) from exc


def _spawn_table_population(
    *,
    table: dict[str, Any],
    filters: dict[str, str],
    user_id: str | None = None,
    artifact_dir: Path | None = None,
) -> str:
    """Spawn table population for a template-backed table — passing THE TABLE.

    This is the only seam that touches the table-population module from the table
    control plane: it mints the id + dir exactly like ``POST /api/table-populations``
    and calls :func:`server.routes.table_populations._launch_table_population_session`
    with the pinned table itself (``source_template`` / ``dataset_id`` /
    ``brief`` ride inside it — ``populate_table`` derives everything else from
    that request identity). The minted id is stamped onto the table dict before
    launch so the population knows the run it persists under.

    ``filters`` is the pin-time translation of the pinned Dataset's criteria —
    recorded on the per-user history row only (population re-derives its own
    runtime filters from the same Dataset).

    The population is attributed to the creating user (``user_id``) exactly like
    ``POST /api/table-populations``: ``_launch_table_population_session`` stamps
    the durable state row's ``user_id`` so cell corrections can enforce ownership,
    and ``record_run`` writes the per-user history row. Omitting this leaves the
    population unattributed and locks the clinician out of editing their own
    table's cells.
    """
    table_population_id = table_population.new_table_population_id()
    target_dir = (
        artifact_dir
        if artifact_dir is not None
        else ARTIFACTS_DIR / table_population_id
    )
    target_dir.mkdir(parents=True, exist_ok=False)
    table["table_population_id"] = table_population_id
    table_populations_route._launch_table_population_session(
        table_population_id,
        target_dir,
        table,
        user_id=user_id,
    )
    if user_id:
        # Table population is already live here. Recording attribution is
        # auxiliary (it backs sidebar history), so a failure must not propagate:
        # it would trip the caller's persist-first rollback, deleting the table
        # while population keeps running. Best-effort; a missing history row
        # degrades nothing table population needs.
        try:
            auth_store.record_run(
                table_population_id,
                user_id,
                str(table.get("source_template") or ""),
                str(table.get("title") or ""),
                filters,
                datetime.now(timezone.utc).isoformat(),
            )
        except Exception:
            pass
    return table_population_id


def _live_table_population_result_status(
    table_population_id: str, store: Store | None = None
) -> str | None:
    """Read the table population's durable result status from the state store.

    Returns ``None`` when no state row exists. Used to refresh a reopened table
    so it shows current progress.

    Pass an existing ``store`` to share one connection across a batch (the list
    refresh) instead of opening a fresh one per population; omit it (the
    single-table GET path) to open + close one for the call."""
    own = store is None
    s = store if store is not None else Store(runtime_role="api_app")
    try:
        state_row = s.get_run(table_population_id)
        return state_row.status if state_row is not None else None
    finally:
        if own:
            s.close()


def _refresh_summary_statuses(
    summaries: list[dict[str, Any]],
    table_population_id_by_table: dict[str, str | None],
    loaded_table_by_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Refresh each summary's ``status`` from table-population state so the list (and the
    sidebar dot it drives) reflects CURRENT progress without opening every table.

    Mirrors :func:`_refresh_status_from_table_population` but for the LIST: it batches — ONE
    shared ``Store`` for the whole list, one status read per DISTINCT population
    — and persists any change back to disk so the table stays in sync (the same
    durable refresh a GET would do). ``table_population_id_by_table`` maps each summary's id to
    its table population id (``None`` for an ad-hoc / pre-spawn table, which is left
    untouched). Best-effort: a persist failure is swallowed so a stale on-disk
    write never blanks the list.
    """
    table_population_ids = {rid for rid in table_population_id_by_table.values() if rid}
    if not table_population_ids:
        return summaries
    store = Store(runtime_role="api_app")
    try:
        live_by_population = {
            rid: _live_table_population_result_status(rid, store=store)
            for rid in table_population_ids
        }
    finally:
        store.close()
    for summary in summaries:
        table_population_id = table_population_id_by_table.get(summary["id"])
        live = (
            live_by_population.get(table_population_id) if table_population_id else None
        )
        if live and live != summary.get("status"):
            summary["status"] = live
            loaded_table = (
                loaded_table_by_id.get(summary["id"]) if loaded_table_by_id else None
            )
            _persist_status(summary["id"], live, table=loaded_table)
    return summaries


def _persist_status(
    table_id: str, status: str, *, table: dict[str, Any] | None = None
) -> None:
    """Persist a refreshed status onto the stored table (best-effort) so the
    next read is already current. Reuses an already loaded table when the list
    path has one; otherwise loads + saves via the store. Swallows a
    missing/invalid table or save failure (the list still returns).

    Does NOT bump ``updated_at``: a status refresh is a PASSIVE read-time sync, not
    a user edit, and the Tables list is recency-ordered by ``updated_at`` — bumping
    it would silently reorder the sidebar just because someone viewed the table."""
    if table is None:
        try:
            table = table_store.load_table(table_id)
        except TableError:
            return
    if table.get("status") == status:
        return
    table["status"] = status
    try:
        table_store.save_table(table)
    except TableError:
        pass


def _refresh_status_from_table_population(table: dict[str, Any]) -> dict[str, Any]:
    """Refresh ``table["status"]`` from table-population state and persist it.

    A no-op when the table has no table population yet (ad-hoc / pre-spawn) or
    the state row is gone.

    Does NOT bump ``updated_at``: a status refresh is a PASSIVE read-time sync (see
    :func:`_persist_status`); recency must reflect user edits/creation, not who
    happened to open the table while population was progressing."""
    table_population_id = table.get("table_population_id")
    if not table_population_id:
        return table
    live = _live_table_population_result_status(table_population_id)
    if live and live != table.get("status"):
        table["status"] = live
        try:
            table_store.save_table(table)
        except TableError:
            pass
    return table


def pin_and_spawn_table(
    *,
    title: str,
    source_template: str,
    description: str | None = None,
    dataset_id: str | None = None,
    brief: str | None = None,
    spec: dict[str, Any] | None = None,
    thread_id: str | None = None,
    user_id: str | None = None,
    user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pin a table + (for a template-backed source) spawn table population,
    persist it, and return the full table.

    ``brief`` is the originating Table request's recorded user intent — the
    delegation instruction the Table agent works from (CONTEXT.md §Brief). It
    is stored on the table at the FIRST persist below (never a later re-save),
    so the pinned row carries it before table population is ever spawned; empty
    or whitespace text is never stored — the table simply has no ``brief``.

    The shared core of ``POST /api/tables`` and agent-driven table creation:
    it derives the pinned columns/grain snapshot + scope, mints the table, and —
    when ``source_template`` is a real seeded audit — spawns table population via
    :func:`_spawn_table_population`, recording ``table_population_id`` + ``status``. For
    ``"ad-hoc"`` it persists ``table_population_id=None`` / ``status="queued"`` (the
    template-backed-only engine cannot populate it yet).

    Order matters: the pinned table is **persisted first** (which validates it),
    and only then is table population spawned. Spawning is the irreversible side
    effect (a live background task writing to ``var/state.db``); doing it after a
    successful persist means a schema-invalid table can never orphan live work.

    SCOPE IS PINNED FOR LIFE (decision 0004): ``dataset_id`` is captured once here
    and there is NO path — route or store — that mutates a persisted table's scope
    (only create / read / list / delete). So **a different cohort is structurally a
    new table**: a caller wanting another slice simply calls this again with a
    different ``dataset_id``, minting a fresh table id + its own table population
    (proven by the immutability tests in ``tables_test.py``).

    CHAT-SKILL SEAM (Track C — NOT built here): deciding, from a clinician's natural
    language, whether a follow-up means "iterate THIS table in place" (refresh the
    same ``table.table_population_id`` via
    ``POST /api/table-populations/{table_population_id}/refresh``) or
    "make a DIFFERENT cohort" (call :func:`pin_and_spawn_table` afresh and disclose
    the fork) is the chat skill's job. This control plane only exposes the two
    mechanisms; the same-cohort-vs-different-cohort detection plugs in above it.

    SECURITY (#303, contract §3/§5/§6 — fail-closed BEFORE any persistence): pinning
    a non-null ``dataset_id`` makes the table's pinned Dataset readable to anyone the
    table is later shared with (the #303 table→Dataset cascade,
    ``grants.has_dataset_access_via_table``). So the creator must already hold DIRECT
    read access to that Dataset — else ``POST /api/tables {dataset_id: <victim>}``
    (which self-grants the creator ``manage`` on the new table) would, via the
    cascade, escalate the baseline ``table.manage`` permission into reading a
    Dataset's cohort/criteria/SQL the creator was never granted. The check uses
    ``has_resource_access`` (DIRECT grant only — NOT the cascade) so it can never
    self-bootstrap, runs ahead of ``save_table`` (no table dir is created on denial,
    so no cascade row and no manage self-grant are minted), and treats a
    missing/unreadable Dataset id as denied (403, non-leaking — never 500). A null
    ``dataset_id`` (whole-DB) cascades nothing, so it is unchecked. Admin is a peer
    (ADR-0003): an admin pinning a Dataset it holds no grant on is also 403. The check
    is skipped only when there is no authenticated ``user`` (a background/system
    create with no identity to gate on).
    """
    if (
        dataset_id
        and user is not None
        and not grants.has_resource_access(user, "dataset", dataset_id)
    ):
        raise HTTPException(
            status_code=403, detail="You don't have access to this dataset"
        )
    source_template = source_template.strip()
    _, scope_disclosure = _scope_from_dataset(dataset_id)
    # The pin-time FAIL-CLOSED gate (0004): a Dataset that cannot scope the
    # table EXACTLY 422s here, before anything persists. Population re-derives
    # the same filters from the pinned Dataset at run time; this translation is
    # kept for the gate + the per-user history row.
    filters = _filters_from_dataset(dataset_id)

    # Pin the columns/grain snapshot: prefer an explicit spec, else derive a
    # minimal one from the seeded template's spec.json (template-backed only).
    if source_template != AD_HOC_TEMPLATE and spec is None:
        template_spec = _read_template_spec(source_template)
        if template_spec is not None:
            spec = table_store.spec_snapshot_from_template(template_spec)

    table = table_store.new_table(
        title=title,
        source_template=source_template,
        description=description,
        dataset_id=dataset_id,
        scope_disclosure=scope_disclosure,
        spec=spec,
        thread_id=thread_id,
    )
    if brief and brief.strip():
        table["brief"] = brief.strip()

    # Persist FIRST (validates the pinned table) so a save failure never leaves
    # live table-population work orphaned.
    try:
        table_store.save_table(table)
    except TableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Ownership IS an active `manage` self-grant (#298): the creator self-grants
    # `manage` on the new table, so the §5 predicate "created_by OR active manage
    # grant" holds without a `created_by` column on the artifact. This is the
    # shared create path (the thread router also calls in here with `user_id`), so
    # both creation routes get the owner grant. Skip when there is no user (a
    # background/system create), which has no owner to record.
    if user_id:
        grants.self_grant_manage(
            resource_type="table", resource_id=table["id"], user_id=user_id
        )

    if source_template != AD_HOC_TEMPLATE:
        # Persist-FIRST keeps a schema-invalid table from ever orphaning live
        # work. But a spawn that RAISES (worker not ready -> 503, dir mkdir
        # collision, population error) would leave the just-persisted table stuck at
        # table_population_id=None / status='queued' forever (status-refresh skips a
        # table with no table population). So roll the persisted table back before
        # propagating: the spawn never succeeded, so there is no live work to
        # orphan, and no orphaned TABLE is left behind either.
        try:
            table_population_id = _spawn_table_population(
                table=table,
                filters=filters,
                user_id=user_id,
            )
        except Exception:
            table_store.delete_table(table["id"])
            raise
        table["table_population_id"] = table_population_id
        table["status"] = "in_progress"
        table["updated_at"] = table_store._now_iso()
        # Re-persist with the spawned table-population id/status.
        table_store.save_table(table)
    return table


@router.get("/api/tables", response_model=list[TableSummary])
async def list_tables(request: Request) -> list[TableSummary]:
    user = _require(request, "table.read")
    # Load each table ONCE: the paired lister returns the list-card summary AND
    # its wrapped table_population_id from the same read, so we no longer re-open
    # every table.json to resolve the population id.
    pairs = table_store.list_summaries_with_population_id()
    # Owner-OR-grant scoping (#298): keep only tables the caller owns (active
    # `manage` self-grant) or holds an active read/run/manage grant on. The
    # role-permission `table.read` above is necessary but not sufficient — the
    # per-resource grant is the second, fail-closed gate (contract §3).
    pairs = [
        pair
        for pair in pairs
        if grants.has_resource_access(user, "table", pair[0]["id"])
    ]
    summaries = [summary for summary, _, _ in pairs]
    # Refresh each summary's status from table-population state so the sidebar
    # dot is honest WITHOUT opening each table (mirrors get_table's
    # _refresh_status_from_table_population, but batched over one Store). The
    # population id rides through from the same load; the expensive sqlite Store
    # is opened once for the whole list, inside _refresh_summary_statuses.
    table_population_id_by_table = {
        summary["id"]: table_population_id for summary, table_population_id, _ in pairs
    }
    loaded_table_by_id = {summary["id"]: table for summary, _, table in pairs}
    summaries = _refresh_summary_statuses(
        summaries, table_population_id_by_table, loaded_table_by_id
    )
    # Stamp the PER-USER `opened` flag (one set lookup for the whole list) so the
    # sidebar can suppress the blue "finished, unopened" dot once this user has
    # opened the table. "Seen" is per-user — derived into the RESPONSE, never
    # stored on the shared table.
    opened_ids = auth_store.opened_table_ids_for_user(user.get("id"))
    for summary in summaries:
        summary["opened"] = summary["id"] in opened_ids
    return [TableSummary(**s) for s in summaries]


def _table_population_id_for_table(table_id: str) -> str | None:
    """Best-effort lookup for a table's wrapped table population id."""
    try:
        table = table_store.load_table(table_id)
    except TableError:
        return None
    return table.get("table_population_id")


@router.get("/api/tables/{table_id}")
async def get_table(table_id: str, request: Request) -> dict[str, Any]:
    user = _require(request, "table.read")
    table_id = _safe_id(table_id)
    try:
        table = table_store.load_table(table_id)
    except TableError:
        # Genuinely missing/unreadable table → 404 (unchanged).
        raise HTTPException(status_code=404, detail="Table not found.")
    # Owner-OR-grant gate (#298): the table EXISTS, so a caller without an active
    # grant gets a fail-closed 403 (not 404 — the resource is real, access is
    # denied) and no body leak. Ordered after the 404 so a non-existent id never
    # discloses as a 403 (contract §3).
    if not grants.has_resource_access(user, "table", table_id):
        raise HTTPException(status_code=403, detail="You don't have access to this")
    return _refresh_status_from_table_population(table)


@router.post("/api/tables/{table_id}/open", status_code=204)
async def open_table(table_id: str, request: Request) -> Response:
    """Record that the current user has OPENED this table's full grid.

    Viewing requires ``table.read`` (the same gate as GET); the id is ``_safe_id``'d
    and a missing table 404s (mirrors get_table) so a stale/forged id can't write a
    phantom seen-row. The mark is PER-USER (auth-store ``table_views``) and
    idempotent — re-opening is a no-op — so it durably suppresses this user's blue
    "finished, unopened" dot without touching the shared ``table.json``. Marks
    opened regardless of status: "opened" only suppresses the BLUE state, so a
    still-working table stays amber even after it's opened."""
    user = _require(request, "table.read")
    table_id = _safe_id(table_id)
    # 404 on a missing OR unreadable table (parity with get_table's load_table),
    # so a stale/corrupt id can't write a phantom seen-row for a table that
    # reads/lists as absent.
    try:
        table_store.load_table(table_id)
    except TableError:
        raise HTTPException(status_code=404, detail="Table not found.")
    # Owner-OR-grant gate (#298): the SAME fail-closed gate as GET, ordered AFTER
    # the 404 (a missing id is 404, never 403). Without it a non-grantee gets 204
    # — an existence oracle (the table reveals it exists, GET would 403) — and a
    # phantom per-user seen-row is written for a table the caller can't read.
    if not grants.has_resource_access(user, "table", table_id):
        raise HTTPException(status_code=403, detail="You don't have access to this")
    auth_store.mark_table_opened(
        user.get("id"), table_id, datetime.now(timezone.utc).isoformat()
    )
    return Response(status_code=204)


@router.post("/api/tables")
async def create_table(body: TableCreateRequest, request: Request) -> dict[str, Any]:
    """Pin + spawn a table.

    Persists the pinned table, then — for a template-backed ``source_template`` —
    spawns table population and records its ``table_population_id`` + ``status``. For
    ``"ad-hoc"`` it persists with ``table_population_id=None`` / ``status="queued"`` (the
    template-backed-only engine cannot populate it yet — a documented follow-up,
    not a table-control-plane change).
    """
    user = _require(request, "table.manage")
    return pin_and_spawn_table(
        title=body.title,
        source_template=body.source_template,
        description=body.description,
        dataset_id=body.dataset_id,
        spec=body.spec,
        thread_id=body.thread_id,
        user_id=user.get("id"),
        user=user,
    )


@router.patch("/api/tables/{table_id}")
async def rename_table(
    table_id: str, body: TableRenameRequest, request: Request
) -> dict[str, Any]:
    """Rename a table: replace ONLY its display ``title`` (+ bump ``updated_at``)
    and persist. Scope is pinned for life (decision 0004), so this never touches
    ``dataset_id`` or table population — the sole write path on a persisted table.

    ``table.manage`` guarded AND owner-or-manage on the target (#298 — the
    role permission alone would let any clinician rename another's table). The id is
    ``_safe_id``'d and a missing table 404s (parity with delete, ordered before the
    403). A blank title 422s (a table must keep a title)."""
    user = _require(request, "table.manage")
    table_id = _safe_id(table_id)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required.")
    try:
        table = table_store.load_table(table_id)
    except TableError:
        raise HTTPException(status_code=404, detail="Table not found.")
    # Owner-OR-manage gate (#298, ADR-0003 peer model): the owner holds the manage
    # self-grant from creation, so only they (or a manage-grant holder) may rename.
    # Ordered after the 404 so a missing id never discloses as a 403.
    if not grants.can_manage_resource(user, "table", table_id):
        raise HTTPException(status_code=403, detail="You don't own this resource")
    table["title"] = title
    table["updated_at"] = table_store._now_iso()
    try:
        table_store.save_table(table)
    except TableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return table


@router.delete("/api/tables/{table_id}", status_code=204)
async def delete_table(table_id: str, request: Request) -> Response:
    """Delete a table end-to-end: stop table population, then remove table state.

    A table owns a server-side population task writing cells to ``var/state.db``;
    just ``rmtree``-ing the table dir would leak that work and its per-user
    attribution row. So we hard-stop table population first (so neither the agent
    nor the orchestrator writes mid-teardown) via
    :func:`table_populations._stop_table_population_internal` and drop the
    attribution row via :func:`auth_store.delete_run_attribution`. An ad-hoc /
    pre-spawn table has no table population (``table_population_id=None``), so the
    stop is skipped.

    The per-user ``table_views`` ('seen') rows are dropped too: those are global to
    the table but PER-USER, so leaving them orphans a 'seen' fact for a table id that
    no longer exists. Cleanup is unconditional (an ad-hoc table can still have been
    opened), mirroring the attribution drop.

    This is a PARTIAL, deliberate mirror of ``DELETE /api/table-populations``: it
    ends live table population and removes everything that *surfaces* it (the
    table dir, the attribution row, the per-user 'seen' rows), but it does NOT
    delete recorded cells/state from ``var/state.db`` — those are inert once
    nothing references the table population and are left to table-population
    deletion, not table deletion.
    """
    user = _require(request, "table.manage")
    table_id = _safe_id(table_id)
    try:
        table_store.load_table(table_id)
    except TableError:
        raise HTTPException(status_code=404, detail="Table not found.")
    # Owner-OR-manage gate (#298, ADR-0003 peer model): only the owner (manage
    # self-grant from creation) or a manage-grant holder may delete — the
    # role permission alone would let any clinician delete another's table.
    # Ordered after the 404 so a missing id never discloses as a 403.
    if not grants.can_manage_resource(user, "table", table_id):
        raise HTTPException(status_code=403, detail="You don't own this resource")
    # Read the wrapped table-population id BEFORE removing the dir (best-effort: a
    # corrupt table.json just means we skip the stop and still drop the dir).
    table_population_id = _table_population_id_for_table(table_id)
    if table_population_id:
        # Hard-stop live population (finalize=False — the table is being deleted,
        # so no summary) and drop its attribution row.
        await table_populations_route._stop_table_population_internal(
            table_population_id,
            finalize=False,
        )
        auth_store.delete_run_attribution(table_population_id)
    # Drop the orphaned per-user 'seen' rows for this table.
    auth_store.delete_table_views(table_id)
    try:
        table_store.delete_table(table_id)
    except TableError:
        pass  # already gone — deletion is idempotent past the 404 gate above
    return Response(status_code=204)
