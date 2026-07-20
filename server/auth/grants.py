"""The resource-grants store: who may reach a dataset/template/table.

The single source of truth for per-resource access (control-plane contract
§2/§5). Ownership is modelled as an active ``manage`` self-grant (resource
creation self-grants ``manage``), so there is no separate ``created_by`` on the
artifact JSON — the §5 predicate "created_by OR active manage grant" reduces to
"holds an active manage grant".

An **active** grant is ``revoked_at IS NULL AND (expires_at IS NULL OR
:now < expires_at)``. Access evaluation is **additive** over a subject's own
(``subject_type='user'``) grants plus their role (``subject_type='role'``)
grants (contract §3, additive rule) — never subtractive.

Mirrors :mod:`server.auth.store`'s ``_connect`` / plain-SQL style and reuses its
``AUTH_DB_PATH`` so grants live in the same control-plane store.
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from core.config import DATASETS_DIR, TEMPLATES_DIR
from core.tables import store as table_store
from core.tables.store import TableError
from server.auth import store as auth_store

# The grantable resource types (contract §5, after the Q31 edit: thread/project
# dropped) and the grant levels. Validation of the inbound resource_type happens
# at the Pydantic-model edge (a non-grantable value → 422); these tuples document
# the closed sets the store works over.
GRANTABLE_RESOURCE_TYPES = ("dataset", "template", "table")
GRANT_TYPES = ("read", "run", "manage")


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    # Reuse store.AUTH_DB_PATH at call time (tests redirect it to a tmp DB), so
    # grants always share the freshly-seeded control-plane store.
    conn = sqlite3.connect(str(auth_store.AUTH_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_expires_at(expires_at: str | None) -> str | None:
    """Normalize a non-null ``expires_at`` to a UTC ISO-8601 string (``+00:00``).

    SECURITY (contract §3, fail-closed): the active-grant predicate compares
    ``_now_iso()`` (always ``+00:00``) against the stored ``expires_at`` as TEXT, so
    lexicographic order must equal chronological order. An owner-supplied value in a
    different offset (e.g. ``+14:00``) or a ``Z`` suffix sorts wrong against the
    ``+00:00`` now-string — an already-expired grant could lex-sort as still active
    (fail-OPEN). Parsing here (``fromisoformat`` + ``astimezone(utc)``) rewrites the
    value to the same ``+00:00`` form so the compare is sound. ``None`` (never
    expires) passes through. An unparseable value raises ``ValueError`` so the
    boundary can reject it (422) rather than store an un-comparable string."""
    if expires_at is None:
        return None
    # ``fromisoformat`` accepts a ``Z`` suffix from Python 3.11; normalize it
    # explicitly so older parsers and the round-trip both land on ``+00:00``.
    parsed = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _row_to_grant(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "subject_type": row["subject_type"],
        "subject_id": row["subject_id"],
        "resource_type": row["resource_type"],
        "resource_id": row["resource_id"],
        "grant_type": row["grant_type"],
        "granted_by": row["granted_by"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "revoked_at": row["revoked_at"],
    }


def create_grant(
    *,
    subject_type: str,
    subject_id: str,
    resource_type: str,
    resource_id: str,
    grant_type: str,
    granted_by: str,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Insert a grant and return it. ``granted_by`` is the server-resolved caller
    (the creator for a self-grant); ``expires_at`` is an optional ISO timestamp,
    normalized to ``+00:00`` here (a ``ValueError`` on an unparseable value) so the
    fail-closed active-grant TEXT compare is sound (see ``normalize_expires_at``)."""
    grant_id = uuid.uuid4().hex
    created_at = _now_iso()
    expires_at = normalize_expires_at(expires_at)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO resource_grants "
            "(id, subject_type, subject_id, resource_type, resource_id, "
            " grant_type, granted_by, created_at, expires_at, revoked_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
            (
                grant_id,
                subject_type,
                subject_id,
                resource_type,
                resource_id,
                grant_type,
                granted_by,
                created_at,
                expires_at,
            ),
        )
    return {
        "id": grant_id,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "grant_type": grant_type,
        "granted_by": granted_by,
        "created_at": created_at,
        "expires_at": expires_at,
        "revoked_at": None,
    }


def self_grant_manage(*, resource_type: str, resource_id: str, user_id: str) -> None:
    """Write the owner ``manage`` self-grant at resource-creation time so the
    creator owns it (§5). Subject is the creator; ``granted_by`` is the creator."""
    create_grant(
        subject_type="user",
        subject_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        grant_type="manage",
        granted_by=user_id,
    )


def get_grant(grant_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM resource_grants WHERE id = ?", (grant_id,)
        ).fetchone()
    return _row_to_grant(row) if row else None


def revoke_grant(grant_id: str, now: str | None = None) -> None:
    """Fail-close a grant by stamping ``revoked_at`` (idempotent: a no-op once
    already revoked). The grantee's NEXT request then resolves no active grant."""
    with _connect() as conn:
        conn.execute(
            "UPDATE resource_grants SET revoked_at = ? "
            "WHERE id = ? AND revoked_at IS NULL",
            (now or _now_iso(), grant_id),
        )


def _role_name(user: dict[str, Any] | None) -> str | None:
    return user.get("role") if user else None


def active_grants_for_subject(
    user: dict[str, Any], now: str | None = None
) -> list[dict[str, Any]]:
    """Every ACTIVE grant the user reaches: their own (``subject_type='user'``,
    ``subject_id = user id``) PLUS their role's (``subject_type='role'``,
    ``subject_id = role name``). Additive, never subtractive (§3)."""
    user_id = user.get("id")
    role = _role_name(user)
    at = now or _now_iso()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM resource_grants "
            "WHERE revoked_at IS NULL "
            "  AND (expires_at IS NULL OR ? < expires_at) "
            "  AND ( (subject_type = 'user' AND subject_id = ?) "
            "     OR (subject_type = 'role' AND subject_id = ?) )",
            (at, user_id, role),
        ).fetchall()
    return [_row_to_grant(row) for row in rows]


def grants_received_by_user(
    user: dict[str, Any], now: str | None = None
) -> list[dict[str, Any]]:
    """The active grants OTHERS issued TO this user — their inbound shares (§10
    "shared-with-me"). Active ``subject_type='user'`` grants whose ``subject_id``
    is the caller AND whose ``granted_by`` is someone ELSE, so the caller's own
    ownership ``manage`` self-grants (``granted_by == subject_id``) are excluded:
    a resource you own is not "shared with you". Parameterized; reuses the §3
    active predicate."""
    user_id = user.get("id")
    at = now or _now_iso()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM resource_grants "
            "WHERE revoked_at IS NULL "
            "  AND (expires_at IS NULL OR ? < expires_at) "
            "  AND subject_type = 'user' "
            "  AND subject_id = ? "
            "  AND granted_by != ?",
            (at, user_id, user_id),
        ).fetchall()
    return [_row_to_grant(row) for row in rows]


def grants_manageable_by_user(
    user: dict[str, Any], now: str | None = None
) -> list[dict[str, Any]]:
    """Active person-to-person grants on resources the caller can manage.

    This is the share-modal view for owners AND editors: holding an active
    ``manage`` grant means the caller can re-share/revoke on that resource, so
    the visible grant list is based on manageable resources, not just rows the
    caller personally issued. Ownership self-grants and the caller's own inbound
    grant are excluded because they are not grantee chips.
    """
    user_id = user.get("id")
    at = now or _now_iso()
    manageable = {
        (grant["resource_type"], grant["resource_id"])
        for grant in active_grants_for_subject(user, now=at)
        if grant["grant_type"] == "manage"
    }
    if not manageable:
        return []
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM resource_grants "
            "WHERE revoked_at IS NULL "
            "  AND (expires_at IS NULL OR ? < expires_at) "
            "  AND subject_type = 'user' "
            "  AND subject_id != ? "
            "  AND subject_id != granted_by "
            "ORDER BY created_at, id",
            (at, user_id),
        ).fetchall()
    return [
        _row_to_grant(row)
        for row in rows
        if (row["resource_type"], row["resource_id"]) in manageable
    ]


def has_resource_access(
    user: dict[str, Any],
    resource_type: str,
    resource_id: str,
    allowed_types: tuple[str, ...] = ("read", "run", "manage"),
    now: str | None = None,
) -> bool:
    """True iff the user holds an ACTIVE grant of an allowed ``grant_type`` on the
    resource (owner via ``manage`` self-grant, or any read/run/manage grantee).
    Fail-closed: no matching active grant → False."""
    for grant in active_grants_for_subject(user, now=now):
        if (
            grant["resource_type"] == resource_type
            and grant["resource_id"] == resource_id
            and grant["grant_type"] in allowed_types
        ):
            return True
    return False


def can_manage_resource(
    user: dict[str, Any], resource_type: str, resource_id: str, now: str | None = None
) -> bool:
    """True iff the user holds an ACTIVE ``manage`` grant on the resource — the §5
    "is the owner OR holds an active manage grant" predicate (creation self-grants
    manage, so the creator passes). The gate on who may grant/revoke."""
    return has_resource_access(
        user, resource_type, resource_id, allowed_types=("manage",), now=now
    )


def has_dataset_access_via_table(
    user: dict[str, Any], dataset_id: str, now: str | None = None
) -> bool:
    """The §10 / contract §5 **share-then-use cascade**, evaluated as a DERIVED
    check: True iff the user holds an ACTIVE grant on a TABLE whose pinned
    ``dataset_id == dataset_id``. Sharing a populated table cascades **access-only
    `read`** on its pinned Dataset so the grantee can resolve/see the cohort.

    Deriving it (rather than writing a separate Dataset grant row at share time)
    is the fail-closed choice: revoking the table grant removes the cascade with
    no second row to clean up — the access is only ever as live as the table
    grant it springs from (ADR 0004). Read-only by construction: it answers only
    "may this user READ the Dataset?", never manage — ``can_manage_resource``
    (patch/delete) is untouched, so a cascade never confers write.

    Only the user's active TABLE grants are inspected; each is resolved to its
    pinned ``dataset_id`` by loading the table's state-store row. A table whose
    row is missing/unreadable, or that pins no Dataset (whole-DB), cascades
    nothing — it is skipped, never raised. The table store's ``TABLE_DB_PATH``
    is read at call time so tests may redirect it."""
    # A whole-DB table pins ``dataset_id = None``; never let a falsy target match it
    # (``None == None``) — that would cascade "access to the whole-DB scope", which
    # is not a Dataset. The read path always passes a real (non-empty) Dataset id.
    if not dataset_id:
        return False
    for grant in active_grants_for_subject(user, now=now):
        if grant["resource_type"] != "table":
            continue
        try:
            table = table_store.load_table(grant["resource_id"])
        except TableError:
            # A revoked/deleted table or unreadable file cascades nothing.
            continue
        if table.get("dataset_id") == dataset_id:
            return True
    return False


def has_table_population_access_via_table(
    user: dict[str, Any], table_population_id: str, now: str | None = None
) -> bool:
    """True iff the user holds an active grant on a table wrapping ``table_population_id``.

    Table-population status/workbook/download are reused by tables, so a table
    share must derive read access to the wrapped table-population outputs. The
    derivation is live: revoked/expired grants disappear on the next request, and
    a missing/corrupt table file grants nothing.
    """
    if not table_population_id:
        return False
    for grant in active_grants_for_subject(user, now=now):
        if grant["resource_type"] != "table":
            continue
        try:
            table = table_store.load_table(grant["resource_id"])
        except TableError:
            continue
        if table.get("table_population_id") == table_population_id:
            return True
    return False


def has_run_access_via_table(
    user: dict[str, Any], run_id: str, now: str | None = None
) -> bool:
    """Backward-compatible alias for the table-population access derivation."""
    return has_table_population_access_via_table(user, run_id, now=now)


def _has_owner_manage_grant(resource_type: str, resource_id: str) -> bool:
    """True iff ANY active ``manage`` grant exists on the resource — owned by
    anyone (subject ``user`` or ``role``). The idempotency guard for the §10.4
    backfill: a resource that already has an owner is skipped, so re-running adds
    nothing. Unlike ``can_manage_resource`` this is subject-agnostic — it answers
    "does this resource have an owner at all?", not "does *this* user own it"."""
    now = _now_iso()
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM resource_grants "
            "WHERE resource_type = ? AND resource_id = ? "
            "  AND grant_type = 'manage' "
            "  AND revoked_at IS NULL "
            "  AND (expires_at IS NULL OR ? < expires_at) "
            "LIMIT 1",
            (resource_type, resource_id, now),
        ).fetchone()
    return row is not None


def backfill_owner_self_grants(
    *,
    datasets_dir: Path = DATASETS_DIR,
    templates_dir: Path = TEMPLATES_DIR,
) -> None:
    """Insert a ``manage`` self-grant for every pre-existing dataset/template/table
    that has no owner yet, so nothing the demo owns is unreachable (§10.4 / §15).

    Owner resolution: datasets and templates (audits) have no recorded creator on
    disk, so the single-tenant demo ``admin`` owns them; a table's owner is its
    wrapped run's attributed user, falling back to the ``admin`` when no run/owner
    resolves. Idempotent and additive — only resources WITHOUT an existing owner
    ``manage`` grant get one, so a second startup adds nothing and raises nothing.

    Runs at startup AFTER ``seed_default_user`` so the demo ``admin`` exists; the
    resource roots are parameters (defaulting to ``var/``) so tests pass temp dirs.
    """
    admin_id = _seed_admin_user_id()
    if admin_id is None:
        # No demo admin seeded yet -> nothing owns the role-less resources; the
        # backfill is a no-op rather than minting orphan grants.
        return

    for dataset_id in _resource_ids(datasets_dir, skip_underscore=False):
        _grant_owner_if_unowned("dataset", dataset_id, admin_id)
    for template_id in _resource_ids(templates_dir, skip_underscore=True):
        _grant_owner_if_unowned("template", template_id, admin_id)
    for table_id in table_store.list_table_ids():
        owner_id = _table_owner_id(table_id) or admin_id
        _grant_owner_if_unowned("table", table_id, owner_id)


def _grant_owner_if_unowned(
    resource_type: str, resource_id: str, owner_id: str
) -> None:
    """Self-grant ``owner_id`` ``manage`` on the resource unless it already has an
    owner ``manage`` grant (the per-resource idempotency unit).

    INTENTIONAL v1 CHOICE — self-healing reachability. The unowned check
    (``_has_owner_manage_grant``) is ACTIVE-only, so if a sole owner ``manage``
    grant were revoked, the next startup re-mints it. This is deliberate: the
    backfill's job is to keep everything the demo owns reachable (§10.4), and
    revoking a sole owner WITHOUT a replacement is not a v1 flow. §11 reassignment
    (deferred) always leaves a replacement active owner grant, so it is unaffected
    by this re-mint. Keying the check on "any manage grant EVER existed (incl.
    revoked)" was considered and rejected: it would trade self-healing for a worse
    "permanently unreachable" hazard."""
    if _has_owner_manage_grant(resource_type, resource_id):
        return
    self_grant_manage(
        resource_type=resource_type, resource_id=resource_id, user_id=owner_id
    )


def _resource_ids(root: Path, *, skip_underscore: bool) -> list[str]:
    """The ids of every resource under ``root`` — one sub-directory per resource,
    its name IS the id (matching ``tables``/``datasets``/``audits`` on-disk layout).
    A missing root yields nothing. Robust to half-written dirs: enumeration is by
    name, never by parsing the JSON, so a broken artifact still gets its owner grant.

    ``skip_underscore`` must match how that resource's catalog enumerates, so the
    backfill grants an owner to EXACTLY what the route lists (nothing listable is
    left unowned/unreachable, §10.4). Only audits/templates use the ``_``-prefixed
    *draft* convention — ``core.catalog.load_audit_registry`` skips those dirs — so
    pass ``skip_underscore=True`` for audits. Datasets and tables have no draft
    convention and their ids may legitimately lead with ``_``: the datasets route
    (``server.routes.datasets.list_datasets``) and tables store
    (``core.tables.store.list_summaries``) list ALL ``is_dir()`` entries, so pass
    ``skip_underscore=False`` for them and enumerate every directory."""
    if not root.is_dir():
        return []
    return [
        p.name
        for p in sorted(root.iterdir())
        if p.is_dir() and not (skip_underscore and p.name.startswith("_"))
    ]


def _table_owner_id(table_id: str) -> str | None:
    """Resolve a table's owner: the attributed user of its wrapped table population.

    Returns ``None`` when the table has no ``table_population_id``, its row is
    unreadable, or the table population has no attribution — the caller then
    falls back to the demo ``admin``."""
    try:
        table = table_store.load_table(table_id)
    except TableError:
        return None
    table_population_id = table.get("table_population_id")
    if not table_population_id:
        return None
    attribution = auth_store.get_run_attribution(table_population_id)
    return attribution["user_id"] if attribution else None


def _seed_admin_user_id() -> str | None:
    """The user id of the seed/demo ``admin`` account (the single-tenant demo
    owner). Resolved by role (``SEED_USER_ROLE``) via ``users.role_id`` -> the
    admin role, NEVER by a hardcoded id or username. ``None`` when no admin is
    seeded yet (so the backfill no-ops rather than guessing an owner)."""
    admin_role_id = auth_store.get_role_id(auth_store.SEED_USER_ROLE)
    if admin_role_id is None:
        return None
    return auth_store.get_first_user_id_with_role(admin_role_id)
