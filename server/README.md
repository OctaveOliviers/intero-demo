# Intero Server

FastAPI backend providing the HTTP API and OpenCode agent orchestration.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audits` | List available audits |
| `POST` | `/api/runs` | Start an audit run (JSON with `auditId`, or multipart with custom `.xlsx`) |
| `GET` | `/api/runs/{id}` | Get run state and messages |
| `GET` | `/api/runs/{id}/stream` | SSE stream of agent events |
| `POST` | `/api/runs/{id}/stop` | Stop a running audit |
| `PATCH` | `/api/runs/{id}/cells/{ref}` | Clinician/edit review-correction patch on one interpret cell |
| `GET` | `/api/runs/{id}/workbook` | Get workbook JSON (sheets + cell metadata + SQL traces) |
| `GET` | `/api/runs/{id}/download` | Download `result.xlsx` |
| `POST` | `/api/sql` | Execute read-only SQL against clinical DB |

## Runtime Permission Enforcement (Implemented)

- Runtime DB role policy authority: `core/store/runtime_permissions.py`.
- Concrete enforcement points: `core/store/store.py` (fail-closed `PermissionError` on denied
  role/table/action/column access).
- Run orchestration executes with `orchestrator_runtime` role in `server/routes/runs.py`.
- Tier-3 agent `database="cells"` SQL path is table-restricted to `cells` only
  (`core/agent/.opencode/tools/sql_execute.py`).
- Clinician edit endpoint `PATCH /api/runs/{id}/cells/{ref}` enforces:
  - authenticated session,
  - `run.edit_cells` permission,
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
- **Execution plane** — `runner.py`. By default (`OPENCODE_RUNNER=server`) it boots one persistent `opencode serve` at startup and runs each audit as a session against it (`OpenCodeRunner`) — no per-run process spawn. Set `OPENCODE_RUNNER=local` (or if the server fails to boot) to fall back to `LocalRunner`, which spawns a fresh `opencode run` subprocess per audit. Either way events stream back via asyncio queues.

Swapping the runner for a remote worker requires no route changes.

## Agent Execution Flow

`POST /api/runs` copies the audit workbook into the runs store at `var/runs/{id}/result.xlsx` (reached by the agent as `runs/{id}/result.xlsx` via the `agent/runs` symlink). The selected (read-only) database is **symlinked** — not copied — into the same run dir as `var/runs/{id}/database.sqlite`, so the agent addresses it as `runs/{id}/database.sqlite` and never has to handle the database's opaque UUID directory id. The audit model (`agent/audits/<id>/audit.md`) and the database schema model (`agent/databases/<db>/database.md`) are fed to the mapping builder (`core/mapping`) to produce the pre-computed audit→database field mapping (`agent/audits/<id>/mapping.<db>.md`, built on demand and cached). The run prompt is then **lean**: a brief context line, that region-precise field mapping, and the workflow — followed by the run's paths and filters. The raw audit layout and DB schema are NOT injected; the mapping carries each region's anchor and per-cell provenance. It runs the agent against the persistent `opencode serve` (project root `agent/`) — or, in local-runner mode, spawns `opencode run --format json --dir agent/` — and streams events via SSE. The agent follows `agent/workflows/audit-workflow.md` and uses custom tools from `agent/.opencode/tools/` (`sql_execute`, `table`, `populate`, `notes`), plus the `table-export` and `notes` skills. It does not discover databases or load schemas (`table_describe_layout` / `database_load_md` are not in its allow-list).

The audit, database, and mapping models are built deterministically server-side by single LLM calls (`server/audit_model_builder.py`, `server/database_model_builder.py`, `server/audit_database_mapper.py`) — not by an agent.

## Database Resolution

Clinical DB resolved from (in order): `$CLINICAL_SQLITE_DB`, `$INTERO_SQLITE_DB`. Agent must always specify a database via `databasePath` or `databaseUrl`. See [`database/README.md`](../database/README.md) for build instructions.

## Audits

Audits are registered in `agent/audits/*/audit.md`. Each directory contains:

- `audit.md` — YAML frontmatter (name, description, excel_path) + pre-computed layout model
- `audit.xlsx` — the Excel workbook to populate

Audits are registered by uploading an `.xlsx` via `POST /api/audits/upload`, which builds `audit.md` in-process (`server/audit_model_builder.py`: one LLM call over the extracted layout). The model is database-agnostic — it captures the layout and a Field Spec (each field's cell, mode, and meaning), never database tables/columns.

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
│   ├── runs.py          # POST/GET /api/runs, GET .../stream
│   ├── workbook.py      # GET .../workbook, .../download
│   ├── sql.py           # POST /api/sql
│   └── audits.py        # GET /api/audits
└── test/
    └── runner_test.py
```

## Tests

```bash
python3 -m server.test.runner_test
```

Uses a fake shell script mimicking `opencode --format json` — no LLM or database needed.
