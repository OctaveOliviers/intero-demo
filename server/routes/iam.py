"""Read-only IAM (user & role management) endpoints — admin-only.

`GET /api/iam/users` is the data source for the admin Settings "Users & roles"
screen (auth-and-access §13; control-plane §9): it lists every account with its
role resolved from `users.role_id`. It is gated by `iam.manage_users`, a key held
ONLY by `admin` — a `clinician` gets `403` before the handler body runs, so no
user payload leaks (the absent-vs-unauthorized seam, §13).

Account create / role-assign / set-credential are a FUTURE IAM slice (the screen
is read-only for now); this router intentionally exposes no mutating route.
"""

from fastapi import APIRouter, Depends

from server.auth import store
from server.auth.deps import require_permission
from server.models import IamUserResponse

router = APIRouter(prefix="/api/iam")

# IAM is admin-only — `iam.manage_users`, held only by `admin` (control-plane §9).
# Wiring it as a route dependency runs the authz check BEFORE the handler body, so
# a clinician's 403 never loads or leaks the user list.
_require_iam_manage_users = Depends(require_permission("iam.manage_users"))


@router.get(
    "/users",
    response_model=list[IamUserResponse],
    dependencies=[_require_iam_manage_users],
)
async def list_iam_users():
    return [IamUserResponse(**row) for row in store.list_users()]
