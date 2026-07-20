"""Dry-run the mapping stage (Phase 2): build mapping.json from audit + database artifacts."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Ensure repo root is on sys.path so `core.*` imports resolve.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.config import DATABASES_DIR, TEMPLATES_DIR  # noqa: E402
from core.contracts import validate_against_schema  # noqa: E402
from core.mapping import build_audit_database_mapping  # noqa: E402

_SCHEMA_FILE = "mapping.schema.json"


def _load_json(kind: str, path: Path) -> dict | None:
    if not path.exists():
        print(f"ERROR: {kind} not found: {path}", file=sys.stderr)
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _check_inputs(
    audit_id: str, database_ids: list[str]
) -> tuple[dict, list[tuple[str, dict]]]:
    audit_path = TEMPLATES_DIR / audit_id / "spec.json"
    ok = True
    audit = _load_json(f"audit '{audit_id}'", audit_path)
    if audit is None:
        ok = False

    database_payloads: list[tuple[str, dict]] = []
    for database_id in database_ids:
        db_path = DATABASES_DIR / database_id / "model.json"
        database = _load_json(f"database '{database_id}'", db_path)
        if database is None:
            ok = False
        else:
            database_payloads.append((database_id, database))

    if not ok:
        sys.exit(1)
    return audit, database_payloads


async def _run(audit_id: str, database_ids: list[str]) -> None:
    audit, databases = _check_inputs(audit_id, database_ids)

    print(f"Building mapping: audit={audit_id}  databases={','.join(database_ids)}")
    mapping = await build_audit_database_mapping(
        audit,
        databases,
        audit_id=audit_id,
    )

    # Write to the canonical location.
    out_path = TEMPLATES_DIR / audit_id / "mapping.json"
    out_path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

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
    parser = argparse.ArgumentParser(
        description="Dry-run the mapping builder (Phase 2)."
    )
    parser.add_argument(
        "--audit", default="cord-ph", help="Audit id (default: cord-ph)"
    )
    parser.add_argument(
        "--database",
        dest="databases",
        action="append",
        default=None,
        help="Database id. Repeat flag or pass comma-separated values (default: cord-ph).",
    )
    args = parser.parse_args()
    raw_databases = args.databases or ["cord-ph"]
    database_ids = [
        db.strip() for value in raw_databases for db in value.split(",") if db.strip()
    ]
    if not database_ids:
        parser.error("at least one non-empty --database value is required")
    asyncio.run(_run(args.audit, database_ids))


if __name__ == "__main__":
    main()
