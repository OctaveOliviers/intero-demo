# Intero Server

FastAPI backend providing the HTTP API and OpenCode agent orchestration.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` |  `/api/templates` | List available audits |
| `POST` | `/api/table-populations` | Start template-backed table population (JSON with `auditId`) |
| `GET` | `/api/table-populations/{id}` | Get table-population state and messages |
| `GET` | `/api/table-populations/{id}/stream` | SSE stream of agent events |
| `POST` | `/api/table-populations/{id}/stop` | Stop active table population |
| `PATCH` | `/api/table-populations/{id}/cells/{ref}` | Clinician/edit review-correction patch on one interpret cell |
| `GET` | `/api/table-populations/{id}/workbook` | Get workbook JSON (sheets + cell metadata + SQL traces) |
| `GET` | `/api/table-populations/{id}/download` | Download `result.xlsx` |
| `POST` | `/api/sql` | Execute read-only SQL against clinical DB |

## Runtime Permission Enforcement (Implemented)

- Runtime DB role policy authority: `core/store/runtime_permissions.py`.
- Concrete enforcement points: `core/store/store.py` (fail-closed `PermissionError` on denied
  role/table/action/column access).
- Run orchestration executes with `orchestrator_runtime` role in `server/routes/table_populations.py`.
- Tier-3 agent `database="cells"` SQL path is table-restricted to `cells` only
  (`core/agent/.opencode/tools/sql_execute.py`).
- Clinician edit endpoint `PATCH /api/table-populations/{id}/cells/{ref}` enforces:
  - authenticated session,
  - `table_population.edit_cells` permission,
  - run owner or admin override,
  - interpret-cell-only edits,
  - constrained edit surface (`reviewState`, `corrected`, `value`),
  - `verification` event write on success.

MVP note: role/permission lookup for route-level checks currently uses the authenticated
user shape in `server/auth/permissions.py` while broader IAM table-backed authorization
is still being phased in.

## Architecture

Two planes behind a `JobRunner` protocol seam:

- **Control plane** — FastAPI routes handle HTTP, validation, file I/O
- **Execution plane** — `core.runtime.Runtime` starts one OpenCode server and wires the table-population session relay used by the `/api/table-populations/*` routes.

Swapping the runner for a remote worker requires no route changes.

## Agent Execution Flow

`POST /api/table-populations` creates pending cells in `var/state.db`, streams workbook/cell events over SSE, and escalates through `core/table_population` tiers. Tier 3 provisions an OpenCode project under `var/runs/{id}/` with `context.json`, the audit spec, database symlinks, and the `core/agent/.opencode` tool template.

The audit, database, and mapping models are built deterministically server-side by single LLM calls (`server/audit_model_builder.py`, `server/database_model_builder.py`, `server/audit_database_mapper.py`) — not by an agent.

## Database Resolution

Clinical DB resolved from (in order): `$CLINICAL_SQLITE_DB`, `$INTERO_SQLITE_DB`. Agent must always specify a database via `databasePath` or `databaseUrl`. See [`database/README.md`](../database/README.md) for build instructions.

## Audits

Audits are registered in `agent/audits/*/audit.md`. Each directory contains:

- `audit.md` — YAML frontmatter (name, description, excel_path) + pre-computed layout model
- `audit.xlsx` — the Excel workbook to populate

Audits are registered by uploading an `.xlsx` via `POST /api/templates/upload`, which builds `audit.md` in-process (`server/audit_model_builder.py`: one LLM call over the extracted layout). The model is database-agnostic — it captures the layout and a Field Spec (each field's cell, mode, and meaning), never database tables/columns.

## Database Discovery

Databases are registered in `agent/databases/*/database.md`. Each file contains:

- YAML frontmatter: name, description, type, path
- Body: pre-computed schema model (tables, columns, types, relationships, row counts)

Databases are registered by uploading a SQLite file via `POST /api/databases/upload`, which builds `database.md` in-process (`server/database_model_builder.py`: schema extracted with `sqlite3`, then one LLM call for clinical descriptions).

The first time an audit is run against a given database, `server/audit_database_mapper.py` makes one LLM call binding the audit's Field Spec to that database's schema, and caches the result as `agent/audits/<audit>/mapping.<db>.md`. The mapping records where each field's value lives (table.column for direct fields, evidence columns for interpret fields) plus entity grain and join paths — never SQL or filters.

## File Layout

```
server/
├── __main__.py          # uvicorn entrypoint
├── main.py              # FastAPI app, CORS, static mount, error handler
├── config.py            # Path constants
├── routes/
│   ├── table_populations.py  # POST/GET /api/table-populations, GET .../stream
│   ├── workbook.py      # GET .../workbook, .../download
│   ├── sql.py           # POST /api/sql
│   └── templates.py     # GET /api/templates
└── test/
    └── runner_test.py
```

## Tests

```bash
python3 -m server.test.runner_test
```

Uses a fake shell script mimicking `opencode --format json` — no LLM or database needed.
