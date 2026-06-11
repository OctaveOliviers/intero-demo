"""Dry-run the mapping stage (Phase 2): build mapping.json from audit + database artifacts."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Ensure repo root is on sys.path so `core.*` imports resolve.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.config import AUDITS_DIR, DATABASES_DIR
from core.indexing.profile import validate_against_schema
from core.mapping.build_audit_database_map import build_audit_database_mapping

_SCHEMA_FILE = "mapping.schema.json"


def _resolve_existing_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def _load_first_existing_json(kind: str, candidates: list[Path]) -> tuple[Path, dict] | None:
    path = _resolve_existing_path(candidates)
    if path is None:
        attempted = ", ".join(str(p) for p in candidates)
        print(f"ERROR: {kind} not found. Tried: {attempted}", file=sys.stderr)
        return None
    return path, json.loads(path.read_text(encoding="utf-8"))


def _check_inputs(audit_id: str, database_ids: list[str]) -> tuple[dict, list[tuple[str, dict]]]:
    audit_candidates = [
        AUDITS_DIR / audit_id / "spec.json",
        AUDITS_DIR / audit_id / "audit.json",  # legacy fixture name
    ]
    ok = True
    audit_loaded = _load_first_existing_json(f"audit '{audit_id}'", audit_candidates)
    if audit_loaded is None:
        ok = False

    database_payloads: list[tuple[str, dict]] = []
    for database_id in database_ids:
        db_candidates = [
            DATABASES_DIR / database_id / "model.json",
            DATABASES_DIR / database_id / "database.json",  # legacy fixture name
        ]
        db_loaded = _load_first_existing_json(f"database '{database_id}'", db_candidates)
        if db_loaded is None:
            ok = False
        else:
            _, database = db_loaded
            database_payloads.append((database_id, database))

    if not ok:
        sys.exit(1)

    assert audit_loaded is not None
    _, audit = audit_loaded
    return audit, database_payloads


async def _run(audit_id: str, database_ids: list[str]) -> None:
    audit, databases = _check_inputs(audit_id, database_ids)

    print(f"Building mapping: audit={audit_id}  databases={','.join(database_ids)}")
    mapping = await build_audit_database_mapping(
        audit, databases, audit_id=audit_id,
    )

    # Write to the canonical location.
    out_path = AUDITS_DIR / audit_id / "mapping.json"
    out_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Validate: re-read from disk to confirm round-trip.
    written = json.loads(out_path.read_text(encoding="utf-8"))
    problems = validate_against_schema(written, _SCHEMA_FILE)

    # Summary.
    fields = written.get("fields", [])
    regions = written.get("regions", [])
    identity = written.get("identity", {})
    bindings = written.get("criteria_bindings", [])

    print()
    print(f"  Path:              {out_path}")
    print(f"  Fields:            {len(fields)}")
    print(f"  Regions:           {len(regions)}")
    print(f"  Identity anchor:   {identity.get('anchor', '(none)')}")
    print(f"  Criteria bindings: {len(bindings)}")

    if problems:
        print()
        for p in problems:
            print(f"  VALIDATION: {p}", file=sys.stderr)
        print()
        print("FAIL — mapping.json written but failed schema validation.")
        sys.exit(1)

    print()
    print("PASS")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run the mapping builder (Phase 2).")
    parser.add_argument("--audit", default="cord-ph", help="Audit id (default: cord-ph)")
    parser.add_argument(
        "--database",
        dest="databases",
        action="append",
        default=None,
        help="Database id. Repeat flag or pass comma-separated values (default: cord-ph).",
    )
    args = parser.parse_args()
    raw_databases = args.databases or ["cord-ph"]
    database_ids = [db.strip() for value in raw_databases for db in value.split(",") if db.strip()]
    if not database_ids:
        parser.error("at least one non-empty --database value is required")
    asyncio.run(_run(args.audit, database_ids))


if __name__ == "__main__":
    main()
