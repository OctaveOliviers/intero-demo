"""The share-target directory: `GET /api/clinicians` (auth-and-access §10; §5).

The minimal clinical-staff directory an owner picks a colleague from when sharing
a resource. It returns each `clinician`-role account's user `id` + `display_name`
(full name) ONLY — no PID, no IAM fields (no username, email, role, or login
state). It lists clinician accounts regardless of login state (so a created but
not-yet-onboarded joiner can be pre-shared, §9) but EXCLUDES deactivated users,
and never lists `admin`/`agent` accounts (role resolved from `users.role_id`,
never the username).

Gated by `grant.manage_owned` — the same Sharing permission as the grants routes
(api.md authorization table). Fail-closed in order (contract §3): session (401,
the middleware + the defensive `_require`) → role permission (403). This is the
only clinical-staff-visible read of the user list; full account management stays
admin-only IAM.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from server.auth.deps import require_permission
from server.auth import store
from server.models import ClinicianResponse

router = APIRouter()

# Sharing's `grant.manage_owned` gate (api.md), wired as a route dependency so the
# authz check runs BEFORE the handler body — a caller without it gets 403 and the
# directory never loads or leaks.
_require_grant_manage_owned = Depends(require_permission("grant.manage_owned"))


@router.get(
    "/api/clinicians",
    response_model=list[ClinicianResponse],
    dependencies=[_require_grant_manage_owned],
)
async def list_clinicians() -> list[dict[str, Any]]:
    """The active `clinician`-role share-target directory (id + display_name)."""
    return store.list_clinicians()
