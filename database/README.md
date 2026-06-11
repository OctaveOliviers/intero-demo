# Database

CSV fixtures for building synthetic EMR databases. Each database folder contains `csv/` (source) and `sql/` (generated SQLite) subfolders.

## Available Fixtures

| Directory | Domain | Records |
|-----------|--------|---------|
| `cord-ph/` | Cord pH at birth audit (maternity/neonatal) | 10 cases |
| `acute-sore-throat-audit/` | Acute sore throat audit (antibiotic prescribing) | 24 cases |
| `synthea-data/` | Generic Synthea-style exports | ~1k+ |

## Build

```bash
# Build all databases (default when no --csv-dir is provided)
python3 -m database.scripts.build_emr_db --all

# Build a single database
python3 -m database.scripts.build_emr_db --csv-dir database/cord-ph/csv --db database/cord-ph/sql/cord_ph.sqlite
```

Each database is a self-contained SQLite file. One SQL table per CSV. Filenames become table names; headers become normalized column names. Duplicate table names fail fast.

## Inspect

```bash
sqlite3 database/cord-ph/sql/cord_ph.sqlite
.tables
```

## Notes

- Common Synthea-style keys (`id`, `patient`, `encounter`, `date`, etc.) are indexed when present
- Foreign keys are not enforced
- All data is synthetic — no real patient information