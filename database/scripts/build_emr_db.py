from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


DATABASES = {
    "cord-ph": {
        "csv_dir": Path("database/cord-ph/csv"),
        "db_path": Path("database/cord-ph/sql/cord_ph.sqlite"),
    },
    "acute-sore-throat": {
        "csv_dir": Path("database/acute-sore-throat-audit/csv"),
        "db_path": Path("database/acute-sore-throat-audit/sql/acute_sore_throat.sqlite"),
    },
    "synthea": {
        "csv_dir": Path("database/synthea-data/csv"),
        "db_path": Path("database/synthea-data/sql/synthea.sqlite"),
    },
    "npda-clinical": {
        "csv_dir": Path("database/npda-clinical/csv"),
        "db_path": Path("database/npda-clinical/sql/npda_clinical.sqlite"),
    },
    "npda-demographics": {
        "csv_dir": Path("database/npda-demographics/csv"),
        "db_path": Path("database/npda-demographics/sql/npda_demographics.sqlite"),
    },
}

DEFAULT_CSV_DIR = Path("database/cord-ph/csv")
DEFAULT_DB_PATH = Path("database/cord-ph/sql/cord_ph.sqlite")

INDEX_COLUMNS = {
    "id",
    "patient",
    "encounter",
    "organization",
    "provider",
    "payer",
    "code",
    "date",
    "start",
    "stop",
}


@dataclass(frozen=True)
class CsvImport:
    csv_path: Path
    source_dir: Path
    table_name: str


def normalize_identifier(value: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "_" for ch in value.strip())
    normalized = "_".join(part for part in normalized.split("_") if part)
    if not normalized:
        raise ValueError("CSV header contains an empty column name.")
    if normalized[0].isdigit():
        normalized = f"_{normalized}"
    return normalized


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def unique_columns(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    columns: list[str] = []
    for header in headers:
        base = normalize_identifier(header)
        count = seen.get(base, 0)
        seen[base] = count + 1
        columns.append(base if count == 0 else f"{base}_{count + 1}")
    return columns


def create_metadata_table(conn: sqlite3.Connection) -> None:
    existing_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(import_metadata)").fetchall()
    }
    expected_columns = {
        "table_name",
        "source_dir",
        "source_csv",
        "imported_rows",
        "original_headers",
        "normalized_columns",
    }
    if existing_columns and existing_columns != expected_columns:
        conn.execute("DROP TABLE import_metadata")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS import_metadata (
            table_name TEXT PRIMARY KEY,
            source_dir TEXT NOT NULL,
            source_csv TEXT NOT NULL,
            imported_rows INTEGER NOT NULL,
            original_headers TEXT NOT NULL,
            normalized_columns TEXT NOT NULL
        )
        """
    )


def reset_imported_tables(conn: sqlite3.Connection, tables_to_import: set[str]) -> None:
    metadata_exists = conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = 'import_metadata'
        """
    ).fetchone()
    if metadata_exists is None:
        return

    existing_imports = {
        row[0]
        for row in conn.execute("SELECT table_name FROM import_metadata").fetchall()
    }
    for table_name in existing_imports - tables_to_import:
        conn.execute(f"DROP TABLE IF EXISTS {quote_identifier(table_name)}")


def import_csv(conn: sqlite3.Connection, csv_import: CsvImport) -> int:
    table = csv_import.table_name
    csv_path = csv_import.csv_path
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        try:
            headers = next(reader)
        except StopIteration:
            raise ValueError(f"CSV is empty: {csv_path}") from None

        columns = unique_columns(headers)
        quoted_table = quote_identifier(table)
        quoted_columns = [quote_identifier(column) for column in columns]

        conn.execute(f"DROP TABLE IF EXISTS {quoted_table}")
        conn.execute(
            f"""
            CREATE TABLE {quoted_table} (
                _row_id INTEGER PRIMARY KEY AUTOINCREMENT,
                {", ".join(f"{column} TEXT" for column in quoted_columns)}
            )
            """
        )

        placeholders = ", ".join("?" for _ in columns)
        insert_sql = (
            f"INSERT INTO {quoted_table} ({', '.join(quoted_columns)}) "
            f"VALUES ({placeholders})"
        )
        row_count = 0
        for row in reader:
            if len(row) < len(columns):
                row = row + [""] * (len(columns) - len(row))
            elif len(row) > len(columns):
                row = row[: len(columns)]
            conn.execute(insert_sql, row)
            row_count += 1

        for column in columns:
            if column in INDEX_COLUMNS:
                conn.execute(
                    f"""
                    CREATE INDEX IF NOT EXISTS
                    {quote_identifier(f"idx_{table}_{column}")}
                    ON {quoted_table} ({quote_identifier(column)})
                    """
                )

        conn.execute(
            """
            INSERT INTO import_metadata(
                table_name,
                source_dir,
                source_csv,
                imported_rows,
                original_headers,
                normalized_columns
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(table_name) DO UPDATE SET
                source_dir = excluded.source_dir,
                source_csv = excluded.source_csv,
                imported_rows = excluded.imported_rows,
                original_headers = excluded.original_headers,
                normalized_columns = excluded.normalized_columns
            """,
            (
                table,
                str(csv_import.source_dir),
                str(csv_path),
                row_count,
                json.dumps(headers),
                json.dumps(columns),
            ),
        )
        return row_count


def discover_csv_imports(csv_dirs: Sequence[Path]) -> list[CsvImport]:
    imports: list[CsvImport] = []
    table_sources: dict[str, Path] = {}

    for csv_dir in csv_dirs:
        if not csv_dir.exists():
            raise FileNotFoundError(f"CSV directory not found: {csv_dir}")
        if not csv_dir.is_dir():
            raise NotADirectoryError(f"CSV source is not a directory: {csv_dir}")

        csv_files = sorted(path for path in csv_dir.glob("*.csv") if path.is_file())
        if not csv_files:
            raise FileNotFoundError(f"No CSV files found in: {csv_dir}")

        for csv_path in csv_files:
            table_name = normalize_identifier(csv_path.stem)
            existing_source = table_sources.get(table_name)
            if existing_source is not None:
                raise ValueError(
                    "Duplicate table name "
                    f"{table_name!r} from {csv_path} and {existing_source}. "
                    "Build one source at a time or rename one CSV file."
                )
            table_sources[table_name] = csv_path
            imports.append(
                CsvImport(
                    csv_path=csv_path,
                    source_dir=csv_dir,
                    table_name=table_name,
                )
            )

    return imports


def build_database(csv_dirs: Sequence[Path] | Path, db_path: Path) -> None:
    if isinstance(csv_dirs, Path):
        csv_dirs = [csv_dirs]

    csv_imports = discover_csv_imports(csv_dirs)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        reset_imported_tables(
            conn,
            {csv_import.table_name for csv_import in csv_imports},
        )
        create_metadata_table(conn)
        conn.execute("DELETE FROM import_metadata")

        for csv_import in csv_imports:
            row_count = import_csv(conn, csv_import)
            print(f"Imported {row_count:>6} rows into {csv_import.table_name}")

        conn.commit()

    print(f"Wrote SQLite database: {db_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a local SQLite database from synthetic EMR CSV exports."
    )
    parser.add_argument(
        "--csv-dir",
        type=Path,
        action="append",
        default=None,
        help=(
            "Directory containing CSV exports. Can be passed more than once. "
            f"Defaults to {DEFAULT_CSV_DIR}."
        ),
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Output SQLite database path. Defaults to {DEFAULT_DB_PATH}.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        default=False,
        help="Build all registered databases. Defaults to True when no --csv-dir is provided.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.all or args.csv_dir is None:
        for name, config in DATABASES.items():
            print(f"\n=== Building {name} ===")
            build_database(csv_dirs=[config["csv_dir"]], db_path=config["db_path"])
    else:
        build_database(csv_dirs=args.csv_dir, db_path=args.db)


if __name__ == "__main__":
    main()
