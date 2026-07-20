"""Repeatable stage-1 library readiness verification.

Runs the release-gating checks for var-backed library behavior in one fixed order:
1) empty-var + partial drift semantics (tests),
2) deterministic artifact error semantics (tests),
3) contract/list-detail parity semantics (tests),
4) seeded readiness (`make seed` + list/detail smoke),
5) frontend build.
"""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run(cmd: list[str]) -> None:
    print(f"\n==> {' '.join(cmd)}")
    completed = subprocess.run(cmd, cwd=ROOT)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


async def _seeded_smoke() -> None:
    from types import SimpleNamespace

    from core.catalog import load_audit_registry, load_database_catalog
    from server.auth import store as auth_store
    from server.auth.grants import backfill_owner_self_grants
    from server.routes.audits import get_audit_detail
    from server.routes.databases import get_database_detail

    # The audit detail route is now owner-or-grant gated (#302), and the smoke must
    # run on a clean `var/`. Stand up the control-plane store the way the server's
    # lifespan does (init -> seed the demo admin -> backfill owner self-grants), so
    # the seeded audits are OWNED by the demo admin and the gated read passes.
    # All three are idempotent no-ops once applied.
    auth_store.init_store()
    auth_store.seed_default_user()
    backfill_owner_self_grants()

    audits = load_audit_registry()
    databases = load_database_catalog()
    if not audits:
        raise SystemExit("seeded-smoke failed: no audits found after `make seed`.")
    if not databases:
        raise SystemExit("seeded-smoke failed: no databases found after `make seed`.")

    # The seeded audits are owned by the demo `admin`; resolve its id by role (never
    # a hardcoded username) and run the gated detail read as that account.
    admin_role_id = auth_store.get_role_id(auth_store.SEED_USER_ROLE)
    admin_id = (
        auth_store.get_first_user_id_with_role(admin_role_id) if admin_role_id else None
    )
    if admin_id is None:
        raise SystemExit("seeded-smoke failed: no demo admin seeded after `make seed`.")
    admin_request = SimpleNamespace(
        state=SimpleNamespace(
            user={"id": admin_id, "role": auth_store.SEED_USER_ROLE}, user_id=admin_id
        )
    )

    # Validate at least one real list item can be opened via detail route.
    await get_audit_detail(audits[0]["id"], admin_request)
    await get_database_detail(databases[0]["id"])
    print(
        f"seeded-smoke: OK (audits={len(audits)}, databases={len(databases)}, "
        f"audit_id={audits[0]['id']}, database_id={databases[0]['id']})"
    )


def main() -> None:
    print("Stage-1 library readiness verification")

    # 1) empty-var + partial-drift behavior.
    _run(["python3", "-m", "server.test.library_lifecycle_test"])
    # 2) missing/malformed artifact behavior.
    _run(["python3", "-m", "server.test.library_detail_errors_test"])
    # 3) list/detail contract + metadata parity behavior.
    _run(["python3", "-m", "server.test.library_api_contract_test"])
    _run(["python3", "-m", "server.test.library_list_metadata_test"])

    # 4) seeded behavior.
    _run(["make", "seed"])
    asyncio.run(_seeded_smoke())

    # 5) frontend build must pass.
    _run(["npm", "--prefix", "app", "run", "build"])

    print("\nAll stage-1 library readiness checks passed.")


if __name__ == "__main__":
    main()
