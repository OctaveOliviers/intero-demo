
Clinical audit workflow prototype using OpenCode for local orchestration.

## Status

OpenCode is the orchestration layer. The MVP spec set lives in `docs/mvp/` (README + docs
1–10), with the build plan in `docs/mvp/BUILD-PLAN.md` + `docs/mvp/tasks.jsonl`.

> **Source of truth for the build.** `docs/mvp/` is authoritative. This file documents the
> *current* code and conventions; where they disagree with the spec, **the spec wins and your
> task is to move the code toward it**. The run populates the workbook through a shared **cell
> store** and **three escalating tiers** (`try_direct` → `try_llm` → `try_agent`); the authority
> for that design is [docs/mvp/run-population-redesign.md](docs/mvp/run-population-redesign.md).

## Layout

| Path | Role |
| --- | --- |
| `server/` | FastAPI backend — entrypoint `python3 -m server` |
| `server/routes/` | API route modules: `health`, `runs`, `workbook`, `sql`, `audits`, `databases`, `generate`, `indexing` |
| `core/` | Core logic (not HTTP): `indexing/` (builds `spec.json`/`model.json`), `mapping/` (audit↔database `mapping.json` — the match + its derived `executable` block), `running/` (`orchestrator.py` drives the three tiers `try_direct`/`try_llm`/`try_agent`; `run_audit.py` `JobRunner`/`OpenCodeRunner` seam), `catalog.py` |
| `core/agent/` | Opencode **template** — committed code, never written to at runtime. `core/agent/opencode.json` + `core/agent/.opencode/{tools,skills,node_modules}` (storage-layout §2). Each Tier-3 run provisions its own opencode project root under `var/runs/<id>/` that references this template via `.opencode` symlink. |
| `core/agent/.opencode/skills/` | Custom skills: `cell-fill`, `table-export`, `notes`; `template.md` for creating new skills (the audit run procedure lives in `core/agent/workflows/audit-workflow.md`, not a skill) |
| `core/agent/.opencode/tools/` | Custom tools: `sql_execute`, `lookup_execute` (the allow-list); legacy tools (`sql`, `table`, `populate`, `notes`, `database`) being retired |
| `core/agent/workflows/` | Audit workflow markdown prompt templates |
| `app/` | Svelte browser UI and gitignored run artifacts |
| `database/` | Per-database folders with `csv/` and `sql/` subfolders, `scripts/build_emr_db.py` |
| `var/audits/` | Audit definitions (`spec.json` + `mapping.json` — match + derived `executable` block — + `workbook.xlsx` when uploaded). See `docs/mvp/contracts/storage-layout.md`. |
| `var/databases/` | Database models (`model.json` with pre-computed schema + filterable surface) + `database.sqlite`. |
| `var/state.db` | The single state store (runs / cells / events / field_codes) per the storage-layout contract. |
| `var/runs/<id>/` | Self-contained opencode project roots provisioned per Tier-3 run (`opencode.json` copy + `.opencode` symlink + `audit/spec.json` + `database/<slug>.{sqlite,model.json}` + `context.json` with the provenance SHA). |
| `docs/mvp/` | The modular MVP spec set + `BUILD-PLAN.md` + `tasks.jsonl` (source of truth for the build) |
| `docs/skills/` | Archived PDF/XLSX proof-of-concept scripts |

## Commands

```bash
python3 -m server                                  # start API (hot reload on :8000)
python3 -m database.scripts.build_emr_db --all     # build all SQLite databases
python3 -m scripts.seed                            # seed var/ with pre-indexed audits + databases (no LLM)
make dev-seeded                                     # seed + start API, ready to run audits
python3 -m server.test.runner_test                 # runner unit tests
sqlite3 database/cord-ph/sql/cord_ph.sqlite          # inspect fixture DB
```

## Seeding (local testing)

`var/` is gitignored; everything an audit needs to run is committed under
`seed/`. `make seed` (or `python3 -m scripts.seed`) copies the fixtures into
`var/audits/<id>/` and `var/databases/<id>/` per the storage-layout contract,
with **zero LLM calls**, so the app boots with both audit and database already
`status: ready` — no upload, no re-index, no LLM endpoint.

Three artifacts normally produced by slow/paid LLM calls are stored as fixtures
so the seed reuses them:

| Fixture | Role | Lives in |
| --- | --- | --- |
| `spec.json` | audit specification (per-field spec + inclusion criteria) | `seed/audits/<audit_id>/` |
| `mapping.json` | audit↔database bindings (one per audit, multi-DB) + the precomputed Tier-1 `executable` block | `seed/audits/<audit_id>/` |
| `model.json` | database model (schema + filterable surface) | `seed/databases/<db_id>/` |

The heavy `database.sqlite` is **not** stored — the seed rebuilds it from the
committed CSVs and symlinks it into `var/databases/<db_id>/`.

```bash
make seed            # copy fixtures + build/symlink sqlite into var/
make dev-seeded      # seed, then start the API (ready to run audits)
```
`app/`: `npm run dev:seeded` runs the seed then starts vite.

To add a dataset: index its audit + database once through the app, copy the
resulting `spec.json`, `mapping.json` (match + `executable`), and `model.json` into
`seed/`, then register it in the `DATASETS` table of `scripts/seed.py`.

## OpenCode Tools & Skills

- Use `sql_execute` for all database queries — it accepts raw SQL and enforces read-only at the SQLite level.
- Database resolves via `$CLINICAL_SQLITE_DB` or `$INTERO_SQLITE_DB` env vars. Agent must always specify a database via `databasePath` or `databaseUrl`.
- Read-only enforced at SQLite level (`PRAGMA query_only=ON`, `set_authorizer`).
- Run-time population is the orchestrator's three-tier ladder in `core/running/`. The only agent in that loop is the **Tier-3 `cell-fill` skill** (over the cells Tiers 1–2 left open): a sandboxed capability with cohort-scoped read-only `sql_execute`, the table/column structure, and run-state read/write tools (`open_cells` / `write_cell`) — added to `core/agent/opencode.json`. Every query is read-only; no generated or edited code runs.

## Database Discovery

Databases are registered in `var/databases/*/model.json` — the database model: schema (tables, columns, types) plus the per-column filterable surface. It is consumed by the mapping builder (`core/mapping`) to produce `mapping.json`, whose `executable` block (the Tier-1 plan) is compiled from the match.

## Audit Definitions

Audits are registered in `var/audits/*/` as `spec.json` (the per-field spec + inclusion criteria) alongside `mapping.json` (match + derived `executable`) and the `workbook.xlsx` (when uploaded).

At run time the **orchestrator** (`core/running/orchestrator.py`) populates the workbook through a shared **cell store** (the state DB `cells` table) and three escalating tiers — each cell is attempted at rising intelligence, and every tier updates the cell store in place:

- **Tier 1 `try_direct`** (deterministic, no LLM): runs the `executable`'s precomputed read-only SQL in bulk, copies the column, applies the field's code map.
- **Tier 2 `try_llm`**: one cheap LLM pass over each cell Tier 1 left unresolved (propose a value / one retry query / escalate); the LLM proposes, the orchestrator runs the read-only SQL.
- **Tier 3 `try_agent`**: one opencode `cell-fill` session over all still-open cells, with the access listed above.

Inclusion filters are enforced through the **cohort** (the `executable`'s cohort block scopes every query). Full design: [docs/mvp/run-population-redesign.md](docs/mvp/run-population-redesign.md).

## Conventions

- Use `uv pip install`, not `pip install`.
- `httpx` for HTTP, `python-dotenv` for env loading.
- No test framework, CI, pre-commit, linter, or typechecker configured yet.
- `.env` gitignored; document vars in `.env.example`.
- OpenCode 1.14.50+ on `PATH`; installed outside the repo.
- Run output goes to the gitignored `var/runs/<run_id>/` — each is the agent's own project root, so the agent addresses artifacts (`result.xlsx`, `database/<slug>.sqlite`, etc.) as bare names relative to its working directory (storage-layout §4).

## Design Rules

- Read-only: agents must not modify patient records, make clinical decisions, or hallucinate values.
- Missing values: use `missing`, `unknown`, `not_available`, or an explicit validation issue.
- Every final audit value must be traceable to source system + record + extraction method + timestamp.
- Patient-identifiable data must not leave the local environment unless explicitly authorized.
- Extraction blocked until the audit template + mapping are valid.
- Human escalation required for missing data, source conflicts, low confidence, validation failures, unexpected UI changes.
- Final delivery blocked while unresolved blocking issues exist.

## Creating New Tools

### Architecture

Every tool consists of two files:
1. **Python backend** (`<name>.py`) — business logic, runs as a subprocess
2. **TypeScript wrapper** (`<name>.ts`) — thin OpenCode plugin wrapper that invokes the Python script

### Shared Utilities

Before writing any tool code, check `core/agent/.opencode/tools/_common.py` for existing utilities. All tools share:

- `ToolError` — the single exception class for user-facing errors
- `load_request()` — parse JSON from argv or stdin
- `require_string()`, `require_object()`, `require_list()` — validated parameter extraction
- `optional_string()` — optional parameter handling
- `agent_root()` — resolves to the per-run opencode project root (the agent's cwd, e.g. `var/runs/<run_id>/`)
- `CELL_RE` — regex for A1-style cell references
- `run_tool_main()` — standard action dispatch boilerplate

For SQL-specific tools, also check `_sql_runtime.py` for `readonly_connection()`, `resolve_sqlite_path()`, and `serialize_row()`.

### Python Backend Pattern

```python
from _common import ToolError, load_request, require_string, run_tool_main

def my_action(request: dict[str, Any]) -> dict[str, Any]:
    name = require_string(request, "name")
    # ... business logic ...
    return {"ok": True, "result": result}

ACTIONS = {"my_action": my_action}

def main() -> None:
    run_tool_main(ACTIONS)

if __name__ == "__main__":
    main()
```

### TypeScript Wrapper Pattern

```typescript
import { tool } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const toolsDir = path.dirname(fileURLToPath(import.meta.url))

async function run(action: string, args: Record<string, unknown>, context: any) {
  const script = path.join(toolsDir, "<name>.py")
  const venvPython = path.join(toolsDir, "..", "..", "..", ".venv/bin/python")
  const python = existsSync(venvPython) ? venvPython : "python3"
  const result = await Bun.$`${python} ${script} ${JSON.stringify({ action, ...args })}`
    .cwd(context.worktree)
    .nothrow()
  if (result.exitCode === 0) return result.stdout.toString()
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  return JSON.stringify({
    ok: false, exitCode: result.exitCode,
    error: stderr || stdout || "<name> tool exited with non-zero status",
    stdout: stdout || null,
  }, null, 2)
}

export const my_action = tool({
  description: "Description of what the tool does.",
  args: { name: tool.schema.string().describe("Parameter description.") },
  execute: (args, context) => run("my_action", args, context),
})
```

### Rules

1. **Never duplicate utility functions.** Always import from `_common.py` or `_sql_runtime.py`.
2. **Use `ToolError` exclusively.** Do not define custom exception classes.
3. **Use `run_tool_main()`** instead of writing your own action dispatch boilerplate.
4. **One tool per file.** If a tool has multiple actions, they live in the same Python file with an `ACTIONS` dict.
5. **Keep TypeScript wrappers thin.** Business logic belongs in Python.

### Naming Convention (Critical)

OpenCode automatically prepends `{filename}_` to every named export when registering tools. **Do not include the filename prefix in your export names** — OpenCode adds it for you.

| TypeScript File | Export Name | Registered Tool Name |
|----------------|-------------|---------------------|
| `table.ts` | `create` | `table_create` |
| `table.ts` | `describe_layout` | `table_describe_layout` |
| `notes.ts` | `write` | `notes_write` |
| `populate.ts` | `region` | `populate_region` |
| `database.ts` | `load_md` | `database_load_md` |
| `sql.ts` | `execute` | `sql_execute` |
| `audit_model.ts` | `write` | `audit_model_write` |
| `audit_model.ts` | `read` | `audit_model_read` |

**Common mistake:** Exporting `audit_model_write` from `audit_model.ts` results in `audit_model_audit_model_write` — the tool is double-prefixed and won't match its permission key in `opencode.json`.

When creating a new tool, name the export as the action only (e.g., `write`, `read`, `execute`) and let OpenCode add the filename prefix.

## Creating New Skills

Skills are markdown prompt templates in `core/agent/.opencode/skills/<skill-name>/SKILL.md`. They define agent workflows by referencing tools.

Use `core/agent/.opencode/skills/template.md` as a starting point for new skills.

### Rules

1. **Reference tools by their registered names** (e.g., `sql_execute`, `database_load_md`, `populate_region`).
2. **Include example tool calls** in JSON format within the Steps section.
3. **Keep skills focused.** One skill = one workflow. Compose multiple skills for complex tasks.
4. **Document the storage location** for any artifacts the skill creates.

## Task Management Rules

Work is tracked in **`docs/mvp/BUILD-PLAN.md`** (the ordered build tracks plus its
**Backlog** section) and in **GitHub pull requests**. There is no `todos.md` — it was
retired on 2026-06-10; its surviving items moved to the BUILD-PLAN Backlog under their
original `TODO-XXXX` ids.

1. **Executing work:** read only the BUILD-PLAN track/step you are assigned, plus the
   contracts it links — not the whole file.
2. **Discovering new work:** if you find a bug, tech debt, or a required follow-up while
   working, check the BUILD-PLAN Backlog for an existing entry, then append a one-line item
   there (what + file path + why it matters) and surface it in your PR description. If the
   priority or scope is unclear, use the Structured User Consultation Protocol below before
   adding it.
3. **Scope discipline:** never bundle a discovered fix into an unrelated PR — log it in the
   Backlog instead.

## Structured User Consultation Protocol (Decision Briefs)

Whenever you encounter an architectural choice, an ambiguous technical path, or need user sign-off, do not ask open-ended questions. Instead, formulate a structured decision brief as plain text in the conversation **before** calling the selection tool, following this layout exactly:

### 1. The Decision Brief Format (Print as plain Markdown text)
* **D# Header:** Assign a sequential ID (e.g., `### D1 — Database Migration Strategy`).
* **Background:** 1–2 sentences explaining what triggered this decision point.
* **ELI10:** ("Explain Like I'm 10") Translate the core trade-off or risk into completely simple, plain, analogy-driven, or child-accessible language. Strip all engineering jargon.
* **Stakes:** Explicitly state what the product/user wins or loses depending on this choice (e.g., performance impact, timeline delays, security vectors).
* **Trade-off Comparison:** Provide a clear list or table of the alternatives using explicit `✅ Pros` and `❌ Cons` markers.
* **Net Recommendation:** Explicitly declare your engineering opinion and why.

### 2. Executing the Selection Tool Call
Once the brief has been written out in full prose, call your structured question tool (e.g., `AskUserQuestion`) using these strict UI guardrails:

* **Terse Question Field:** The tool's `question` parameter must be a single, short sentence of **≤80 characters** (e.g., `"Pick a database migration path"`). Do not repeat the entire brief inside the tool payload—the brief belongs in the chat history, not inside a layout-constrained UI element.
* **Inline Recommendation Flag:** Append the literal suffix `(recommended)` to the label of exactly one option choice (e.g., `Option A: Automated Script (recommended)`). Never leave it ambiguous or mark multiple options as recommended.
* **Option Limits (Batching):** * If presenting **1 to 4 alternatives**, include them all as single choices in a single tool invocation.
    * If presenting **5 or more alternatives**, split the choices into coherent sub-groups of ≤4 or fire sequential per-option calls. Never crowd 5+ choices into a single interactive prompt layout.
* **String Encoding Safety:** If any field (question or option labels) contains non-ASCII text (such as Chinese, Japanese, Korean), write the literal UTF-8 characters directly into the JSON tool payload. **Never** use manual Unicode escaping (like `\uXXXX`) as this causes layout and codepoint corruption during transport.
