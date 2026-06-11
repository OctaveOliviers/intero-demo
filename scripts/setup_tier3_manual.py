"""Stand up a Tier-3 run environment so you can drive opencode by hand.

Provisions a self-contained opencode project root at ``var/runs/<run_id>/``
exactly the way the production Tier 3 path does, so you can **see the agent
think** — its tool calls, its reasoning, its cell writes — without going
through the full HTTP / orchestrator stack.

The layout matches the storage contract
(:doc:`docs/mvp/contracts/storage-layout.md`).

What this script does:

1. Ensures the hospital SQLite is built (``make db`` if missing).
2. Plants the canonical files under ``var/audits/`` and ``var/databases/``
   (with a symlink to the built SQLite).
3. Opens ``var/state.db`` — the single, deployment-wide state DB — and seeds
   a Run + a few pending cells.  Re-running clears just this run's rows.
4. Calls ``provision_worktree`` which handles everything: copies
   ``opencode.json``, symlinks ``.opencode``, writes ``context.json`` (with
   git SHA provenance), copies ``spec.json`` + ``model.json``, symlinks
   ``cells.sqlite`` and ``database.sqlite``.
5. Prints the exact command to launch opencode.

Run::

    python3 -m scripts.setup_tier3_manual [--run-id <id>] [--cohort P001,P002]
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from core.config import VAR_DIR  # noqa: E402
from core.running.orchestrator import RunStore  # noqa: E402
from core.running.try_agent import build_prompt, provision_worktree  # noqa: E402
from core.store import Cell, Run, Store  # noqa: E402
from core.store.store import STATE_DB_PATH  # noqa: E402

# --- the fixture: a small cord-pH run -----------------------------------------

DB_SLUG = "cord-ph"
AUDIT_ID = "cord-ph"

BUILT_HOSPITAL_DB = REPO_ROOT / "database" / "cord-ph" / "sql" / "cord_ph.sqlite"

VAR_AUDITS_DIR = VAR_DIR / "audits"
VAR_DATABASES_DIR = VAR_DIR / "databases"
RUNS_DIR = VAR_DIR / "runs"

ANCHOR = "patient_code"
COHORT_TABLES = {DB_SLUG: ["cord_ph_birth_records"]}

AUDIT_SPEC: dict = {
    "id": AUDIT_ID,
    "fields": [
        {
            "id": "delivery",
            "name": "Mode of delivery",
            "type": "category",
            "permitted_values": {
                "1": "SVD",
                "2": "EmCS",
                "3": "Forceps",
                "4": "Vacuum",
            },
        },
    ],
}

DATABASE_MODEL: dict = {
    "id": DB_SLUG,
    "tables": [
        {
            "name": "cord_ph_birth_records",
            "columns": [
                {"name": "patient_code", "type": "TEXT"},
                {"name": "delivery", "type": "TEXT"},
            ],
        },
    ],
}


def _pending_cells(run_id: str, cohort: list[str]) -> list[Cell]:
    """One cell per cohort member, all in column T of sheet ALL."""
    cells: list[Cell] = []
    for index, member in enumerate(cohort):
        row = 2 + index
        cells.append(Cell(
            run_id=run_id, ref=f"ALL!T{row}", field="delivery",
            member=member, kind="direct", state="pending",
        ))
    return cells


def _ensure_hospital_db() -> None:
    if BUILT_HOSPITAL_DB.exists():
        return
    print("  → hospital DB missing; building via `make db` …")
    subprocess.run(["make", "db"], cwd=REPO_ROOT, check=True)
    if not BUILT_HOSPITAL_DB.exists():
        raise SystemExit(f"`make db` did not produce {BUILT_HOSPITAL_DB}")


def _symlink_force(link: Path, target: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(target.resolve())


def _plant_canonical_storage() -> tuple[Path, Path]:
    """Seed ``var/audits/<id>/spec.json``, ``var/databases/<id>/model.json``
    and ``var/databases/<id>/database.sqlite`` (symlinked)."""
    audit_dir = VAR_AUDITS_DIR / AUDIT_ID
    audit_dir.mkdir(parents=True, exist_ok=True)
    (audit_dir / "spec.json").write_text(
        json.dumps(AUDIT_SPEC, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    db_dir = VAR_DATABASES_DIR / DB_SLUG
    db_dir.mkdir(parents=True, exist_ok=True)
    (db_dir / "model.json").write_text(
        json.dumps(DATABASE_MODEL, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _symlink_force(db_dir / "database.sqlite", BUILT_HOSPITAL_DB)
    return audit_dir, db_dir


def _reset_run_rows(state_db_path: Path, run_id: str) -> None:
    """Clear only THIS run's rows (cascades via FK + triggers)."""
    import sqlite3
    if not state_db_path.exists():
        return
    conn = sqlite3.connect(state_db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        conn.commit()
    finally:
        conn.close()


def _wipe_run_dir(run_dir: Path) -> None:
    """Remove the per-run dir if it exists."""
    if not run_dir.exists():
        return
    for p in run_dir.rglob("*"):
        if p.is_symlink():
            p.unlink()
    shutil.rmtree(run_dir, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run-id", default="manual-r1",
                    help="run id (also the sub-dir under var/runs/)")
    ap.add_argument("--cohort", default="CPH001,CPH002",
                    help="comma-separated patient codes to seed as pending cells")
    args = ap.parse_args()

    cohort = [m.strip() for m in args.cohort.split(",") if m.strip()]
    if not cohort:
        raise SystemExit("--cohort must list at least one patient code")

    print(f"➤ Setting up Tier-3 manual run {args.run_id!r}")
    print(f"  cohort: {cohort}")

    # 1. ensure the hospital SQLite is built.
    _ensure_hospital_db()

    # 2. canonical storage seed (var/audits, var/databases).
    audit_dir, db_dir = _plant_canonical_storage()
    print(f"  → canonical audit:    {audit_dir / 'spec.json'}")
    print(f"  → canonical database: {db_dir / 'model.json'} + database.sqlite")

    # 3. ONE state DB (var/state.db). Clear this run's rows on re-run.
    _reset_run_rows(STATE_DB_PATH, args.run_id)
    store = Store(STATE_DB_PATH)
    store.create_run(Run(id=args.run_id, audit_id=AUDIT_ID, status="in_progress"))
    store.materialize_field_codes(args.run_id, AUDIT_SPEC)
    store.insert_pending_cells(_pending_cells(args.run_id, cohort))
    print(f"  → state DB: {STATE_DB_PATH}")
    print(f"  → seeded {len(cohort)} pending cell(s)")

    # 4. per-run opencode root. provision_worktree handles everything:
    #    opencode.json (copy), .opencode (symlink), context.json (with SHA),
    #    audit/spec.json (copy), audit/cells.sqlite (symlink → state.db),
    #    database/<slug>.sqlite (symlink), database/<slug>.model.json (copy).
    run_dir = RUNS_DIR / args.run_id
    _wipe_run_dir(run_dir)

    canonical_db_path = db_dir / "database.sqlite"
    run_store = RunStore(
        store, args.run_id,
        cohort=cohort,
        database_paths={DB_SLUG: canonical_db_path},
        audit=AUDIT_SPEC,
        anchor=ANCHOR,
        cohort_tables=COHORT_TABLES,
    )
    provision_worktree(run_store, run_dir)
    store.close()

    # 5. report.
    print()
    print(f"✓ Run ready: {run_dir}")
    print(f"  context.json:")
    for line in (run_dir / "context.json").read_text().splitlines():
        print(f"    {line}")
    print()
    print("  run dir contents:")
    for p in sorted(run_dir.rglob("*")):
        rel = p.relative_to(run_dir)
        if any(part == "node_modules" for part in rel.parts):
            continue
        kind = "symlink → " + str(p.readlink()) if p.is_symlink() else (
            "dir" if p.is_dir() else f"file ({p.stat().st_size}B)")
        print(f"    {rel}  ({kind})")

    # Build the prompt the production code would send.
    fresh_store = Store(STATE_DB_PATH)
    try:
        prompt = build_prompt(RunStore(
            fresh_store, args.run_id,
            cohort=cohort, database_paths={DB_SLUG: canonical_db_path},
            audit=AUDIT_SPEC, anchor=ANCHOR, cohort_tables=COHORT_TABLES,
        ))
    finally:
        fresh_store.close()

    print()
    print("━" * 70)
    print("Launch opencode from the run directory:")
    print("━" * 70)
    print()
    print("  # Load repo .env into the shell, then run opencode in the run dir")
    print(f"  set -a; source {REPO_ROOT / '.env'}; set +a")
    print(f"  cd {run_dir}")
    print("  opencode")
    print()
    print("Then paste this prompt:")
    print()
    for line in prompt.splitlines():
        print(f"    {line}")
    print()
    print("Watch cells fill in another terminal:")
    print(f"  sqlite3 {STATE_DB_PATH} \"SELECT ref, member, state, value "
          f"FROM cells WHERE run_id = '{args.run_id}'\"")
    print()
    print("Re-run this script to reset (only this run's rows + dir are wiped).")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
