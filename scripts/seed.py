"""Seed ``var/`` from committed ``data/seed/`` fixtures — no LLM calls, idempotent.

Implements the seed half of the storage-layout contract
(``specs/mvp/contracts/storage-layout.md`` §2 / §8.4):

- ``var/templates/<id>/`` holds ``spec.json`` + ``mapping.json`` (+ ``workbook.xlsx``
  when an upload is being simulated).
- ``var/databases/<id>/`` holds ``model.json`` + ``database.sqlite``.

This script copies committed seed fixtures into ``var/`` and (re)builds the
clinical SQLite from its CSVs. Re-running overwrites with the same content, so
the first ``make seed`` boots the app ``ready`` and a follow-up call is a no-op.

    python3 -m scripts.seed              # seed all registered datasets
    python3 -m scripts.seed --force      # rebuild the sqlite even if present
"""

from __future__ import annotations

import argparse
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from core.config import DATABASES_DIR, DATASETS_DIR, ROOT, TEMPLATES_DIR, VAR_DIR
from data.database.scripts.build_emr_db import build_database

SEED_DIR = ROOT / "data" / "seed"


@dataclass(frozen=True)
class DatabaseSeed:
    """One source database's seed mapping: where the CSVs live and where the
    built SQLite lands."""

    db_id: str
    csv_dir: Path
    sqlite_build_path: Path


@dataclass(frozen=True)
class SeedSpec:
    """One dataset's seed: a template fixture plus the one or more source
    databases it binds against. Template and database directory names land
    verbatim under ``var/`` — no UUID minting, since under the new layout the
    directory key is the canonical id (storage-layout §3)."""

    template_id: str
    databases: tuple[DatabaseSeed, ...]


DATASETS: dict[str, SeedSpec] = {
    "cord-ph": SeedSpec(
        template_id="cord-ph",
        databases=(
            DatabaseSeed(
                db_id="cord-ph",
                csv_dir=ROOT / "data/database/cord-ph-unstructured/csv",
                sqlite_build_path=ROOT
                / "data/database/cord-ph-unstructured/sql/cord_ph.sqlite",
            ),
        ),
    ),
    "npda": SeedSpec(
        template_id="npda",
        databases=(
            DatabaseSeed(
                db_id="npda-demographics",
                csv_dir=ROOT / "data/database/npda-demographics/csv",
                sqlite_build_path=ROOT
                / "data/database/npda-demographics/sql/npda_demographics.sqlite",
            ),
            DatabaseSeed(
                db_id="npda-clinical",
                csv_dir=ROOT / "data/database/npda-clinical/csv",
                sqlite_build_path=ROOT
                / "data/database/npda-clinical/sql/npda_clinical.sqlite",
            ),
        ),
    ),
}


def _rel(path: Path) -> str:
    return os.path.relpath(path, ROOT)


def _copy_dir(src: Path, dst: Path) -> list[str]:
    """Copy every file from ``src`` into ``dst``; return the names copied."""
    if not src.exists():
        raise FileNotFoundError(f"missing fixture dir: {_rel(src)}")
    dst.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    for f in sorted(src.iterdir()):
        if f.is_file():
            shutil.copy2(f, dst / f.name)
            names.append(f.name)
    return names


def _seed_database(db: DatabaseSeed, *, force: bool) -> None:
    if force or not db.sqlite_build_path.exists():
        print(f"  build  -> {_rel(db.sqlite_build_path)}")
        db.sqlite_build_path.parent.mkdir(parents=True, exist_ok=True)
        build_database(csv_dirs=[db.csv_dir], db_path=db.sqlite_build_path)

    db_dst = DATABASES_DIR / db.db_id
    db_files = _copy_dir(SEED_DIR / "databases" / db.db_id, db_dst)
    link = db_dst / "database.sqlite"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(os.path.relpath(db.sqlite_build_path, db_dst))
    print(
        f"  db     -> {_rel(db_dst)}/  [{', '.join(db_files)}, database.sqlite → built]"
    )


def _seed_one(spec: SeedSpec, *, force: bool) -> None:
    for db in spec.databases:
        _seed_database(db, force=force)

    template_dst = TEMPLATES_DIR / spec.template_id
    template_files = _copy_dir(SEED_DIR / "templates" / spec.template_id, template_dst)
    print(f"  template  -> {_rel(template_dst)}/  [{', '.join(template_files)}]")


def _seed_datasets() -> None:
    """Copy each committed, pre-grounded Dataset fixture into var/datasets/<id>/.

    A Dataset is a saved, named filter (library-and-sources.md); its fixture is a
    fully-derived dataset.json (cohort_sql + count already proved offline, no LLM),
    so the list/get endpoints work the moment the app boots.
    """
    src_root = SEED_DIR / "datasets"
    if not src_root.is_dir():
        return
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    for ds_dir in sorted(p for p in src_root.iterdir() if p.is_dir()):
        files = _copy_dir(ds_dir, DATASETS_DIR / ds_dir.name)
        print(f"  dataset-> {_rel(DATASETS_DIR / ds_dir.name)}/  [{', '.join(files)}]")


def seed(dataset_ids: list[str], *, force: bool) -> None:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    DATABASES_DIR.mkdir(parents=True, exist_ok=True)
    for ds_id in dataset_ids:
        spec = DATASETS[ds_id]
        print(f"\n=== Seeding {ds_id} ===")
        _seed_one(spec, force=force)
    print("\n=== Seeding datasets ===")
    _seed_datasets()
    print(f"\nDone. var/ ready under {_rel(VAR_DIR)}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "datasets",
        nargs="*",
        choices=sorted(DATASETS),
        help="Dataset ids to seed. Defaults to all registered datasets.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild the sqlite even if it already exists.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    seed(args.datasets or sorted(DATASETS), force=args.force)


if __name__ == "__main__":
    main()
