"""Build an audit's mapping.json from its seed spec + database models.

The table-population path
(``server/routes/table_populations.py::_execute_table_population_session`` →
``core.mapping.ensure_mapping``) builds a mapping the first time an audit runs
against a database. For a national audit like NPDA the LLM call is slow
(~minute), and the result is the same for every deployment — there is no
reason to pay that cost at runtime if we can pre-build the mapping and ship
it in ``data/seed/``.

This script does exactly that. Given an audit id and one or more database ids,
it reads ``data/seed/templates/<audit>/spec.json`` + ``data/seed/databases/<db>/model.json``,
calls the same ``build_audit_database_mapping`` the runtime uses, and writes
``data/seed/templates/<audit>/mapping.json``. ``make seed`` then copies it into
``var/`` like any other seed file, and ``ensure_mapping`` finds it cached and
returns immediately — no LLM call at run time, the same mapping across every
deployment.

Multi-database support: ``ensure_mapping`` currently binds one database at a
time (its docstring notes multi-database binding is Lane B / B1). The
underlying ``build_audit_database_mapping`` already accepts a list, so this
script can bind several databases in one mapping — the right shape for NPDA
(``npda-demographics`` + ``npda-clinical``). When the runtime catches up, the
file is already in the right shape; until then a seeded multi-database
mapping is the easiest way to make a multi-database audit runnable.

Run::

    # Spin up the `mapping` stage's endpoint (see models.yaml) first, then:
    python3 -m scripts.build_mapping npda npda-demographics npda-clinical
    python3 -m scripts.build_mapping cord-ph cord-ph         # also works
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from core.config import ROOT  # noqa: E402
from core.mapping import build_audit_database_mapping  # noqa: E402

SEED_DIR = ROOT / "data" / "seed"


def _read_json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"missing fixture: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON at {path}: {exc}") from exc


async def _run(audit_id: str, database_ids: list[str], *, force: bool) -> int:
    audit_dir = SEED_DIR / "templates" / audit_id
    out_path = audit_dir / "mapping.json"
    if out_path.exists() and not force:
        print(f"✓ {out_path} already exists (use --force to rebuild)")
        return 0

    audit_spec = _read_json(audit_dir / "spec.json")
    databases: list[tuple[str, dict]] = []
    for db_id in database_ids:
        model = _read_json(SEED_DIR / "databases" / db_id / "model.json")
        databases.append((db_id, model))

    print(
        f"➤ Building mapping for audit {audit_id!r} against databases "
        f"{database_ids} (this calls the LLM and can take ~a minute)…"
    )
    mapping = await build_audit_database_mapping(
        audit_spec, databases, audit_id=audit_id
    )

    audit_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    field_count = len(mapping.get("fields") or [])
    region_count = len(mapping.get("regions") or [])
    db_count = len(mapping.get("databases") or [])
    print(f"✓ Wrote {out_path}")
    print(f"  databases={db_count}  regions={region_count}  fields={field_count}")
    print(f"  Run `make seed` to copy it into var/templates/{audit_id}/.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("audit_id", help="audit id (e.g. 'npda', 'cord-ph')")
    ap.add_argument(
        "databases",
        nargs="+",
        help="one or more database ids the audit binds to "
        "(e.g. 'npda-demographics npda-clinical')",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="overwrite an existing data/seed/templates/<audit>/mapping.json",
    )
    args = ap.parse_args()
    return asyncio.run(_run(args.audit_id, args.databases, force=args.force))


if __name__ == "__main__":
    raise SystemExit(main())
