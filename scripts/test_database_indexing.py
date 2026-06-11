#!/usr/bin/env python3
"""End-to-end test of the database indexing pipeline: CSV → SQLite → model.json.

Usage:
    # Full pipeline (needs LLM_API_BASE / LLM_MODEL in .env):
    python scripts/test_database_indexing.py \
        --csv-dir database/npda-demographics/csv \
        --id npda-demographics

    # Deterministic only (no LLM — profiles columns, validates schema):
    python scripts/test_database_indexing.py \
        --csv-dir database/npda-demographics/csv \
        --id npda-demographics \
        --no-llm

    # Multiple CSV dirs into one database:
    python scripts/test_database_indexing.py \
        --csv-dir database/npda-clinical/csv \
        --id npda-clinical

Output lands in var/databases/<id>/database.sqlite and var/databases/<id>/model.json.
The var/ directory is gitignored.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from database.scripts.build_emr_db import build_database  # noqa: E402
from core.indexing.build_database_model import (  # noqa: E402
    _assemble,
    _build_filterable_surface,
    build_database_model,
    extract_schema,
)
from core.indexing.profile import validate_against_schema  # noqa: E402

VAR_DIR = REPO_ROOT / "var"
_DB_SCHEMA_FILE = "database-model.schema.json"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Test the database indexing pipeline end-to-end."
    )
    p.add_argument(
        "--csv-dir",
        type=Path,
        action="append",
        required=True,
        help="Directory of CSV files (can be repeated for multi-source).",
    )
    p.add_argument(
        "--id",
        required=True,
        dest="database_id",
        help="Database identifier (e.g. npda-demographics). "
        "Determines the output path: var/databases/<id>/.",
    )
    p.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip the LLM prose call — run only the deterministic pipeline "
        "(CSV import, schema extraction, column profiling, validation).",
    )
    return p.parse_args()


def print_schema_summary(schema: dict) -> None:
    """Print a compact summary of the extracted SQLite schema."""
    print("\n── Schema ──")
    for table in schema["tables"]:
        cols = ", ".join(c["name"] for c in table["columns"])
        print(f"  {table['name']} ({table['row_count']} rows): {cols}")
    if schema["relationships"]:
        print("  FKs:", schema["relationships"])


def print_classifications(classifications: dict) -> None:
    """Print the per-column filterable-surface verdicts."""
    print("\n── Column classifications ──")
    for tname, cols in classifications.items():
        for cname, ann in cols.items():
            if ann.get("filterable"):
                ft = ann["filter_type"]
                detail = ann.get("values") or ann.get("range")
                print(f"  {tname}.{cname}: {ft} {detail}")
            else:
                print(f"  {tname}.{cname}: not filterable ({ann.get('reason')})")


def print_model_summary(model: dict) -> None:
    """Print a summary of the final model."""
    print(f"\n── Model: {model.get('title', '?')} ──")
    print(f"  description: {model.get('description', '')[:120]}...")
    for table in model.get("tables", []):
        ncols = len(table.get("columns", []))
        filterable = sum(1 for c in table["columns"] if c.get("filterable"))
        print(f"  {table['name']}: {ncols} cols ({filterable} filterable), "
              f"{table.get('row_count', '?')} rows")
        for col in table["columns"]:
            tag = col.get("filter_type") or col.get("reason", "?")
            desc = (col.get("description") or "")[:60]
            print(f"    {col['name']:30s} [{col.get('type','?'):7s}] {tag:10s}  {desc}")


def run(args: argparse.Namespace) -> None:
    db_dir = VAR_DIR / "databases" / args.database_id
    db_dir.mkdir(parents=True, exist_ok=True)
    sqlite_path = db_dir / "database.sqlite"
    model_path = db_dir / "model.json"

    # ── Step 1: CSV → SQLite ──
    print(f"=== Step 1: CSV → SQLite ({sqlite_path}) ===")
    csv_dirs = [d.resolve() for d in args.csv_dir]
    build_database(csv_dirs=csv_dirs, db_path=sqlite_path)

    # ── Step 2: Extract schema ──
    print("\n=== Step 2: Extract schema ===")
    schema = extract_schema(sqlite_path)
    print_schema_summary(schema)

    # ── Step 3: Profile columns (deterministic) ──
    print("\n=== Step 3: Profile columns ===")
    classifications = _build_filterable_surface(sqlite_path, schema)
    print_classifications(classifications)

    if args.no_llm:
        # ── Step 3b: Assemble with stub prose (no LLM) ──
        print("\n=== Step 4: Assemble model (no LLM — stub descriptions) ===")
        stub_prose = {
            "title": args.database_id,
            "description": f"Database model for {args.database_id}.",
            "tables": [
                {
                    "name": t["name"],
                    "description": f"Table {t['name']}.",
                    "columns": [
                        {"name": c["name"], "description": f"{c['name']} column."}
                        for c in t["columns"]
                    ],
                }
                for t in schema["tables"]
            ],
        }
        model = _assemble(args.database_id, schema, classifications, stub_prose)
    else:
        # ── Step 4: Full LLM pipeline ──
        print("\n=== Step 4: Build model (with LLM) ===")
        model = asyncio.run(
            build_database_model(sqlite_path, args.database_id)
        )

    # ── Step 5: Validate ──
    print("\n=== Step 5: Validate against database-model.schema.json ===")
    problems = validate_against_schema(model, _DB_SCHEMA_FILE)
    if problems:
        print("VALIDATION FAILED:")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    else:
        print("  ✓ Schema valid")

    # ── Step 6: Write ──
    model_path.write_text(
        json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n=== Written: {model_path} ===")
    print_model_summary(model)

    # ── Step 7: Compare with seed (if it exists) ──
    seed_path = REPO_ROOT / "seed" / "databases" / args.database_id / "model.json"
    if seed_path.exists():
        print(f"\n=== Step 7: Compare with seed ({seed_path.relative_to(REPO_ROOT)}) ===")
        seed = json.loads(seed_path.read_text(encoding="utf-8"))
        seed_tables = {t["name"]: t for t in seed.get("tables", [])}
        model_tables = {t["name"]: t for t in model.get("tables", [])}
        mismatches = 0
        for tname in sorted(set(seed_tables) | set(model_tables)):
            if tname not in seed_tables:
                print(f"  + {tname} (new in indexed model, absent from seed)")
                mismatches += 1
                continue
            if tname not in model_tables:
                print(f"  - {tname} (in seed but absent from indexed model)")
                mismatches += 1
                continue
            s_cols = {c["name"]: c for c in seed_tables[tname]["columns"]}
            m_cols = {c["name"]: c for c in model_tables[tname]["columns"]}
            for cname in sorted(set(s_cols) | set(m_cols)):
                if cname not in s_cols:
                    print(f"  + {tname}.{cname} (new)")
                    mismatches += 1
                    continue
                if cname not in m_cols:
                    print(f"  - {tname}.{cname} (missing)")
                    mismatches += 1
                    continue
                # Compare deterministic surface keys only
                for key in ("filterable", "filter_type", "values", "range", "reason"):
                    sv = s_cols[cname].get(key)
                    mv = m_cols[cname].get(key)
                    if sv != mv:
                        print(f"  Δ {tname}.{cname}.{key}: seed={sv!r} vs indexed={mv!r}")
                        mismatches += 1
        if mismatches == 0:
            print("  ✓ Deterministic surface matches seed exactly")
        else:
            print(f"  {mismatches} difference(s) found")
    else:
        print(f"\n  (no seed at {seed_path.relative_to(REPO_ROOT)} — skipping comparison)")

    print("\nDone.")


if __name__ == "__main__":
    run(parse_args())
