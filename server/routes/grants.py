"""The resource-grants control plane: share (and revoke) a resource you own.

``POST /api/grants`` creates a grant; ``DELETE /api/grants/{id}`` revokes one.
Both are gated, in order and fail-closed (contract §3):
session (401, the middleware + the defensive check) → role permission
``grant.manage_owned`` (403) → the §5 ownership predicate ``can_manage_resource``
(403, a non-owner without an active ``manage`` grant cannot grant). ``admin`` gets
NO override — it may grant only on resources it owns, as a clinical peer
(ADR 0003). Identity is resolved server-side from the session; any client-supplied
``user_id`` is ignored.

The inbound ``resource_type`` is constrained to the three grantable values
(``dataset``/``template``/``table``) at the model edge, so a ``thread``/``project``
value is a 422 (not grantable, contract §5 after the Q31 edit). The store + active
-grant semantics live in :mod:`server.auth.grants`.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from core import catalog
from core.config import DATASETS_DIR
from core.datasets import store as dataset_store
from core.datasets.store import DatasetError
from core.tables import store as table_store
from core.tables.store import TableError
from server.auth import grants as grant_store
from server.auth import permissions as authz
from server.auth import store as auth_store
from server.auth.deps import current_user

router = APIRouter()

# A resource id is a flat slug — letters, digits, underscore, hyphen. Mirrors
# ``server.routes.datasets._VALID_ID`` so a crafted id (a path separator, ``..``)
# can never escape ``var/datasets/`` / ``var/tables/`` when ``_resource_label``
# joins it into a filesystem path (defense-in-depth: route-level grant creation
# already requires ``can_manage_resource`` on a server-generated id, but the
# helper must not rely on that upstream invariant).
_VALID_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class GrantCreateRequest(BaseModel):
    """Create a grant on a resource the caller owns.

    ``resource_type`` is restricted to the grantable set — a ``thread``/``project``
    value fails validation (422). Identity is NOT in the body: the subject of the
    grant is ``subject_id`` (the grantee), and the granter is the session caller
    (any client ``user_id`` is ignored)."""

    resource_type: Literal["dataset", "template", "table"]
    resource_id: str
    subject_id: str
    grant_type: Literal["read", "run", "manage"] = "read"
    expires_at: str | None = None


def _require(request: Request, permission: str) -> dict[str, Any]:
    """Resolve the caller and enforce a role permission (401 then 403).

    The middleware already 401s an anonymous ``/api/*`` request; this defensive
    check mirrors tables.py so the gate holds when a route is exercised directly."""
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not authz.has_permission(user, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    return user


def _require_valid_share_target(subject_id: str) -> None:
    subject = auth_store.get_user_by_id(subject_id)
    if subject is None:
        raise HTTPException(status_code=422, detail="Invalid share target.")
    if not bool(subject.get("is_active")):
        raise HTTPException(status_code=422, detail="Invalid share target.")
    if auth_store.get_role_name_for_user(subject_id) != "clinician":
        raise HTTPException(status_code=422, detail="Invalid share target.")


@router.post("/api/grants")
async def create_grant(body: GrantCreateRequest, request: Request) -> dict[str, Any]:
    """Grant ``subject_id`` access to a resource the caller owns.

    Gate: ``grant.manage_owned`` (403 else) AND ``can_manage_resource`` on the
    target (403 else — a non-owner without an active ``manage`` grant cannot
    grant). Returns the created grant."""
    user = _require(request, "grant.manage_owned")
    if not grant_store.can_manage_resource(user, body.resource_type, body.resource_id):
        raise HTTPException(status_code=403, detail="You don't own this resource")
    _require_valid_share_target(body.subject_id)
    try:
        grant = grant_store.create_grant(
            subject_type="user",
            subject_id=body.subject_id,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            grant_type=body.grant_type,
            granted_by=user["id"],
            expires_at=body.expires_at,
        )
    except ValueError as exc:
        # An unparseable expires_at can't be normalized to a comparable +00:00 form;
        # reject it (422) rather than store a value the fail-closed compare can't
        # trust (Fix: expires_at lexicographic fail-open).
        raise HTTPException(
            status_code=422, detail=f"Invalid expires_at: {exc}"
        ) from exc
    return {
        "id": grant["id"],
        "resource_type": grant["resource_type"],
        "resource_id": grant["resource_id"],
        "subject_id": grant["subject_id"],
        "grant_type": grant["grant_type"],
        "granted_by": grant["granted_by"],
        "created_at": grant["created_at"],
        "expires_at": grant["expires_at"],
    }


@router.delete("/api/grants/{grant_id}", status_code=204)
async def delete_grant(grant_id: str, request: Request) -> Response:
    """Revoke a grant (fail-closes the grantee's next request).

    Gate: ``grant.manage_owned`` AND ``can_manage_resource`` on the grant's own
    resource. An unknown id is a 404 (resolved before the ownership check, so a
    non-existent grant never leaks as a 403)."""
    user = _require(request, "grant.manage_owned")
    grant = grant_store.get_grant(grant_id)
    if grant is None:
        raise HTTPException(status_code=404, detail="Grant not found.")
    if not grant_store.can_manage_resource(
        user, grant["resource_type"], grant["resource_id"]
    ):
        raise HTTPException(status_code=403, detail="You don't own this resource")
    grant_store.revoke_grant(grant_id)
    return Response(status_code=204)


def _resource_label(resource_type: str, resource_id: str) -> str:
    """A best-effort human label for a granted resource (§10 — "where cheap").

    Datasets read ``<DATASETS_DIR>/<id>/dataset.json`` (``name``); tables read
    their state-store row (``title``); templates/audits go through
    ``core.catalog.get_audit_by_id`` (``name``). Fail-soft by design: a missing
    or unreadable artifact yields ``""`` and never raises — the lists must render
    even when a resource is gone. ``DATASETS_DIR`` and the table store's
    ``TABLE_DB_PATH`` are read at call time so tests may redirect them.

    SECURITY (defense-in-depth): the id is validated as a flat slug before it is
    joined into any path, so a crafted ``../secret`` id can never read a
    ``dataset.json``/``table.json`` outside the sandbox. A non-slug id fails soft
    (returns ``""``), consistent with the missing-file behavior — never raises."""
    if not _VALID_ID.match(resource_id or ""):
        return ""
    try:
        if resource_type == "dataset":
            try:
                dataset = dataset_store.load_dataset(
                    resource_id, datasets_dir=DATASETS_DIR
                )
            except DatasetError:
                return ""
            return dataset.get("name") or ""
        if resource_type == "table":
            try:
                return table_store.load_table(resource_id).get("title") or ""
            except TableError:
                return ""
        if resource_type == "template":
            audit = catalog.get_audit_by_id(resource_id)
            return (audit or {}).get("name") or ""
    except (OSError, json.JSONDecodeError):
        return ""
    return ""


@router.get("/api/grants/shared-with-me")
async def shared_with_me(request: Request) -> list[dict[str, Any]]:
    """Resources OTHERS have shared with the caller (§10 "shared-with-me").

    Gate: ``grant.manage_owned`` (403 else). Each row carries the resource, the
    access level (``grant_type``), the expiry, and a best-effort ``label``. The
    caller's own ownership self-grants are NOT listed (see
    ``grants_received_by_user``)."""
    user = _require(request, "grant.manage_owned")
    return [
        {
            "grant_id": grant["id"],
            "resource_type": grant["resource_type"],
            "resource_id": grant["resource_id"],
            "grant_type": grant["grant_type"],
            "expires_at": grant["expires_at"],
            "label": _resource_label(grant["resource_type"], grant["resource_id"]),
        }
        for grant in grant_store.grants_received_by_user(user)
    ]


@router.get("/api/grants/shared-by-me")
async def shared_by_me(request: Request) -> list[dict[str, Any]]:
    """For resources the caller can manage, the active grants to OTHER users (§10
    "shared-by-me").

    Gate: ``grant.manage_owned`` (403 else). Each row carries the revocable
    ``grant_id`` (so the front-end can ``DELETE /api/grants/{id}``), the resource
    + best-effort ``label``, the access level, the expiry, and the grantee
    identity ``{subject_id, display_name}`` (resolved via ``store.get_user_by_id``;
    ``display_name`` is empty when the account is unresolvable). Ownership
    self-grants and the caller's own inbound grant are NOT listed."""
    user = _require(request, "grant.manage_owned")
    rows: list[dict[str, Any]] = []
    for grant in grant_store.grants_manageable_by_user(user):
        grantee = auth_store.get_user_by_id(grant["subject_id"])
        display_name = (grantee or {}).get("display_name") or ""
        rows.append(
            {
                "grant_id": grant["id"],
                "resource_type": grant["resource_type"],
                "resource_id": grant["resource_id"],
                "label": _resource_label(grant["resource_type"], grant["resource_id"]),
                "grant_type": grant["grant_type"],
                "expires_at": grant["expires_at"],
                "grantee": {
                    "subject_id": grant["subject_id"],
                    "display_name": display_name,
                },
            }
        )
    return rows
