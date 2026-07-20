# Intero

Intero is a **clinical-audit tool**: it turns an audit template + a hospital database
into a populated, fully-traceable audit workbook — locally and read-only. Part of the
[Melodic monorepo](../AGENTS.md).

The specs in [`specs/`](specs/) are the source of truth — start at
[`specs/README.md`](specs/README.md) and the glossary
[`specs/product/CONTEXT.md`](specs/product/CONTEXT.md). Where code and spec disagree,
**the spec wins** — move the code toward it.

## Safety invariants (non-negotiable)

Read-only (never modify a patient record or hospital system); never fabricate a value
(flag missing/ambiguous, don't impute); every value traceable to its source; patient
data stays local. Full set: [`specs/product/personas-and-use-cases.md`](specs/product/personas-and-use-cases.md).

## Layout

| Path | Role |
|------|------|
| `core/` | The pipeline (no HTTP): `indexing/` → `mapping/` → `table_population/` (`populate.py`: prepopulate from the executable, then the table agent). |
| `core/agent/` | The OpenCode template for the agents — read-only tools, provisioned per worktree. |
| `server/` | FastAPI backend. |
| `app/` | The Svelte browser UI. |
| `specs/` | The spec tree: `product/` (what we build) + `build-plans/` (how to plan a build). |
| `var/` | Generated artifacts (gitignored); seeded from `data/seed/` with no LLM calls. |

## Setup, commands, tests

See [README.md](README.md) — venv + deps, running the app, the test suites, and `make`
targets. The repo-wide pre-commit gate and conventions are in [../AGENTS.md](../AGENTS.md).
