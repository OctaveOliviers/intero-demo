"""Indexing + mapping quality evals against the golden seeds (Phase-4 T10).

The hand-verified seed artifacts are the GOLDENS (decisions 6/8): this runner
re-builds them through the live pipeline and scores the candidates with
``scripts/eval_lib`` — giving every prompt/model change a regression number
instead of a vibe. Two layers for mapping (decision 8): per-field agreement
with the golden, AND a downstream Tier-1 fill-rate of the candidate's
compiled executable against the real seeded database.

Prerequisites: ``make db seed`` (the sqlite databases + var/ fixtures) and a
reachable model for the ``index_audit`` / ``index_db`` / ``mapping`` stages
(``models.json`` — T9).

Run::

    python3 -m scripts.eval_pipeline --stage all          # everything below
    python3 -m scripts.eval_pipeline --stage index-db     # model.json eval (cord-ph + npda DBs)
    python3 -m scripts.eval_pipeline --stage index-audit  # spec.json eval (cord-ph workbook)
    python3 -m scripts.eval_pipeline --stage mapping      # mapping eval + Tier-1 fill-rate

Exit code is non-zero when any metric falls below ``--threshold`` (default
0.8) so the eval can gate CI later; ``--json out.json`` writes the raw scores.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from core.config import ROOT  # noqa: E402
from core.indexing.build_audit_spec import build_audit_spec  # noqa: E402
from core.indexing.build_database_model import build_database_model  # noqa: E402
from core.indexing.profile import validate_against_schema  # noqa: E402
from core.mapping.build_audit_database_map import build_audit_database_mapping  # noqa: E402
from core.running.orchestrator import RunStore, precompute_pending_cells  # noqa: E402
from core.running.try_direct import try_direct  # noqa: E402
from core.store import Run, Store  # noqa: E402
from scripts.eval_lib import (  # noqa: E402
    format_report,
    score_audit_spec,
    score_database_model,
    score_mapping,
)

SEED_DIR = ROOT / "seed"
VAR_DIR = ROOT / "var"

# The golden corpus: cord-pH is the clean case; the NPDA database models are
# the realistic messy multi-source case. The cord-pH source workbook ships in
# docs/templates/; NPDA has no source workbook (its spec was authored from the
# published dataset), so the audit-spec eval covers cord-pH only until T11
# adds an NPDA fixture.
AUDIT_CASES = [("cord-ph", ROOT / "docs" / "templates" / "cord-ph-lo-audit.xlsx")]
DB_CASES = ["cord-ph", "npda-demographics", "npda-clinical"]
MAPPING_CASES = [("cord-ph", ["cord-ph"])]


def _read_json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"missing fixture: {path} (run `make db seed` first)")
    return json.loads(path.read_text(encoding="utf-8"))


async def eval_index_db() -> dict[str, dict]:
    results: dict[str, dict] = {}
    for db_id in DB_CASES:
        golden_path = SEED_DIR / "databases" / db_id / "model.json"
        sqlite_path = VAR_DIR / "databases" / db_id / "database.sqlite"
        if not golden_path.exists() or not sqlite_path.exists():
            print(f"!! skipping {db_id}: missing golden or sqlite (run `make db seed`)")
            continue
        golden = _read_json(golden_path)
        candidate = await build_database_model(
            sqlite_path, db_id, display_name=golden.get("title")
        )
        results[f"index-db:{db_id}"] = score_database_model(golden, candidate)
    return results


async def eval_index_audit() -> dict[str, dict]:
    results: dict[str, dict] = {}
    for audit_id, workbook in AUDIT_CASES:
        golden_path = SEED_DIR / "audits" / audit_id / "spec.json"
        if not workbook.exists():
            print(f"!! skipping {audit_id}: source workbook missing ({workbook})")
            continue
        golden = _read_json(golden_path)
        candidate = await build_audit_spec(
            workbook, audit_id, display_name=golden.get("title")
        )
        results[f"index-audit:{audit_id}"] = score_audit_spec(golden, candidate)
    return results


def _resolve_cohort(executable: dict, db_paths: dict[str, Path]) -> list[str]:
    cohort = executable.get("cohort") or {}
    db_path = db_paths.get(cohort.get("database"))
    if db_path is None:
        return []
    sql = f"SELECT DISTINCT {cohort['identity_select']} FROM {cohort['from']}"
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return [str(r[0]) for r in conn.execute(sql).fetchall()]
    finally:
        conn.close()


async def _tier1_fill_rate(audit_id: str, mapping: dict, audit_spec: dict) -> dict:
    """Run the mapping's compiled executable through the REAL try_direct against
    the seeded database(s); fill-rate = filled direct cells / direct cells."""
    executable = mapping.get("executable") or {}
    db_paths = {
        db_id: VAR_DIR / "databases" / db_id / "database.sqlite"
        for db_id in mapping.get("databases") or []
    }
    cohort = _resolve_cohort(executable, db_paths)
    if not cohort:
        return {"metrics": {"tier1_fill_rate": 0.0, "cohort": 0}, "mismatches": ["empty cohort"]}

    with tempfile.TemporaryDirectory() as d:
        store = Store(Path(d) / "state.db")
        try:
            store.create_run(Run(id="eval", audit_id=audit_id, status="in_progress"))
            store.insert_pending_cells(precompute_pending_cells("eval", executable, cohort))
            run_store = RunStore(
                store, "eval",
                executable=executable, cohort=cohort,
                database_paths=db_paths, audit=audit_spec,
            )
            await try_direct(run_store)
            cells = store.get_cells("eval")
        finally:
            store.close()

    direct_regions = {r["id"] for r in executable.get("regions") or [] if r.get("kind") == "direct"}
    direct_fields = {
        entry.get("field")
        for r in executable.get("regions") or [] if r["id"] in direct_regions
        for entry in r.get("cell_map") or []
    }
    direct_cells = [c for c in cells if c.field in direct_fields]
    filled = [c for c in direct_cells if c.state == "filled"]
    blocked = [c for c in direct_cells if c.state == "blocked"]
    return {
        "metrics": {
            "cohort": len(cohort),
            "direct_cells": len(direct_cells),
            "tier1_fill_rate": round(len(filled) / len(direct_cells), 4) if direct_cells else 0.0,
            "tier1_blocked": len(blocked),
        },
        "mismatches": [
            f"unfilled direct cell {c.ref} ({c.field}/{c.member}): state={c.state}"
            for c in direct_cells if c.state not in ("filled",)
        ][:20],
    }


async def eval_mapping() -> dict[str, dict]:
    results: dict[str, dict] = {}
    for audit_id, db_ids in MAPPING_CASES:
        golden = _read_json(SEED_DIR / "audits" / audit_id / "mapping.json")
        audit_spec = _read_json(SEED_DIR / "audits" / audit_id / "spec.json")
        databases = [
            (db_id, _read_json(SEED_DIR / "databases" / db_id / "model.json"))
            for db_id in db_ids
        ]
        candidate = await build_audit_database_mapping(audit_spec, databases, audit_id=audit_id)
        scored = score_mapping(golden, candidate)
        problems = validate_against_schema(candidate, "mapping.schema.json")
        scored["metrics"]["schema_valid"] = 1.0 if not problems else 0.0
        scored["mismatches"].extend(f"schema: {p}" for p in problems[:5])
        results[f"mapping:{audit_id}"] = scored
        # Layer 2 (decision 8): the candidate must not just look right — its
        # compiled plan must FILL cells. The golden's own fill-rate prints as
        # the baseline.
        results[f"mapping:{audit_id}:tier1-candidate"] = await _tier1_fill_rate(
            audit_id, candidate, audit_spec
        )
        results[f"mapping:{audit_id}:tier1-golden"] = await _tier1_fill_rate(
            audit_id, golden, audit_spec
        )
    return results


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=["all", "index-db", "index-audit", "mapping", "tier1-golden"],
        default="all",
        help="tier1-golden runs ONLY the golden mapping's Tier-1 fill-rate — no LLM needed",
    )
    ap.add_argument("--threshold", type=float, default=0.8,
                    help="exit non-zero when any 0..1 metric falls below this")
    ap.add_argument("--json", type=Path, default=None, help="also write raw scores to this path")
    args = ap.parse_args()

    results: dict[str, dict] = {}
    if args.stage in ("all", "index-db"):
        results.update(await eval_index_db())
    if args.stage in ("all", "index-audit"):
        results.update(await eval_index_audit())
    if args.stage in ("all", "mapping"):
        results.update(await eval_mapping())
    if args.stage == "tier1-golden":
        for audit_id, _dbs in MAPPING_CASES:
            golden = _read_json(SEED_DIR / "audits" / audit_id / "mapping.json")
            audit_spec = _read_json(SEED_DIR / "audits" / audit_id / "spec.json")
            results[f"mapping:{audit_id}:tier1-golden"] = await _tier1_fill_rate(
                audit_id, golden, audit_spec
            )

    failures = []
    for title, scored in results.items():
        print(format_report(title, scored))
        for name, value in scored["metrics"].items():
            if isinstance(value, float) and 0.0 <= value <= 1.0 and value < args.threshold:
                failures.append(f"{title}.{name}={value} < {args.threshold}")
    if args.json:
        args.json.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
        print(f"\nraw scores -> {args.json}")
    if failures:
        print("\nBELOW THRESHOLD:")
        for f in failures:
            print(f"  {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
