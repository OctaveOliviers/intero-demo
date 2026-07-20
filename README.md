# Intero

Intero fills a clinical-audit workbook automatically. You give it an audit
template (the spreadsheet of fields a clinician needs answered) and one or more
clinical databases; it works through every cell for every patient in the cohort,
pulls the value from the data, cites the exact source sentence, and flags
anything it can't resolve for human review.

It does this with a **two-step table population**:

1. **Prepopulate** (deterministic, no LLM): when the template carries a
   precomputed executable, values that map straight from a single column are
   copied into the table in one bulk pass. A table without an executable skips
   this step.
2. **The table agent** (the OpenCode agent): works every cell still open —
   multi-step querying, reasoning, and interpretation from free text.

Cells carry a `value`, an `explanation`, its `sources`, a `confidence`, and a
`review_state`, and stream to the UI live as the table population progresses.

> **We are building Intero from scratch.** There is no legacy code, no legacy
> system, and no deployed behavior to stay backward-compatible with. The only
> thing that matters is that the product matches the **latest** agreed
> specification. When a decision changes, the specs are **rewritten** to the new
> model — not amended on top of the old one — and the code follows the rewritten
> spec. Anything describing a previous approach belongs in git history, not in
> the tree. The spec set is the source of truth: [`specs/`](./specs/).

## Architecture at a glance

| Plane | Lives in | What it is |
|-------|----------|------------|
| Control plane | `server/` | FastAPI backend; starts table populations, streams SSE events |
| Pipeline | `core/` | Indexing, mapping, and the table population (prepopulate + agent) |
| Execution plane | `core/agent/` | OpenCode project root + the `cell-fill` skill (the table agent) |
| UI | `app/` | Svelte browser front-end |
| Data | `data/database/` | CSV fixtures + the SQLite builder |
| Seeds & evals | `data/seed/`, `scripts/` | Golden artifacts and the eval harness |

## Prerequisites

- Python 3.10+
- [`uv`](https://github.com/astral-sh/uv)
- Node.js 18+
- OpenCode 1.14.50+ on `PATH` (required for the table agent)

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp -n .env.example .env       # then add your LLM key (see "LLM config" below)
```

### LLM config

Per-stage model config lives in `models.yaml`, with `models.local.yaml` as a
gitignored per-deployment override (see
[`specs/product/contracts/model-config.md`](./specs/product/contracts/model-config.md)).
Each stage names an `api_key_env` env var that holds its key.

- **Put keys in `.env`** (gitignored). The `-n` on the copy above keeps a re-run
  from clobbering keys you've already added. `core/config.py` loads `.env`.
- Every stage resolves through `models.yaml` / `models.local.yaml` — a stage
  with no entry is a hard error. There is no global single-endpoint fallback.

The deterministic paths (`make db`, `make seed`, `make eval-prepopulate`) need
**no** LLM. The indexing, mapping, and agent paths do.

## Running the app

From the repository root, the fastest path is:

```bash
make server        # installs Python deps if needed, seeds Intero, starts backend
# new terminal:
make app           # installs app deps if needed, starts the Svelte UI
```

Open **http://localhost:5173**, pick a template, and start an audit.

Root-level variants:

| Command | What it does |
|---------|--------------|
| `make server-clean` | Clear `intero/var/` and start an empty backend |
| `make server-seeded` | Seed `intero/var/` and start the backend |
| `make app-mock` | Start the mocked frontend, no backend required |

Inside `intero/`, the equivalent backend path is still available:

```bash
make dev-seeded        # == make seed && make dev
# new terminal:
cd app && npm install && npm run dev
```

Step-by-step equivalent:

```bash
make db                # build SQLite databases from the committed CSVs
make seed              # seed var/ with pre-indexed DBs + ready audits (no LLM)
make dev               # start the FastAPI backend on :8000 (hot reload)
cd app && npm run dev  # start the Svelte UI on :5173
```

To run more than one worktree at once, give each worktree its own backend and
frontend ports in that worktree's gitignored `.env`:

```bash
INTERO_SERVER_PORT=8001
INTERO_APP_PORT=5174
```

Then keep using the normal commands: `make dev` for the backend and
`cd app && npm run dev` for the frontend. Vite reads `INTERO_SERVER_PORT` and
proxies `/api/*` to the matching backend.

Front-end variants (run inside `app/`):

| Command | What it does |
|---------|--------------|
| `npm run dev` | UI against the live backend |
| `npm run dev:mock` | UI with mocked runs (`VITE_MOCK=true`), no backend needed |

## Evaluating the agent

The eval harness (MVP task **T10**) re-builds the hand-verified **golden**
artifacts in `data/seed/` through the live pipeline and scores the result, so every
prompt or model change gets a regression number instead of a vibe. Scores are
0–1 rates; the run exits non-zero when any rate falls below `--threshold`
(default 0.8) so it can gate CI.

```bash
make eval         # all stages (needs a reachable LLM)
make eval-prepopulate  # offline leg only — deterministic prepopulate fill-rate, NO LLM
```

Or directly, for one stage:

```bash
python3 -m scripts.eval_pipeline --stage index-db    # rebuild model.json, score vs golden
python3 -m scripts.eval_pipeline --stage index-audit # rebuild spec.json, score vs golden
python3 -m scripts.eval_pipeline --stage mapping     # rebuild mapping + prepopulate fill-rate
python3 -m scripts.eval_pipeline --stage all --json out.json
```

What each stage measures:

| Stage | Scores | Uses LLM? |
|-------|--------|-----------|
| `index-db` | Rebuilt `model.json` vs golden: table/column recall, types, coded values, filterable surface | yes (prose pass) |
| `index-audit` | Rebuilt `spec.json` vs golden: field coverage, types, code sets, criteria recall | yes |
| `mapping` | Rebuilt `mapping.json` vs golden (field recall, direct/interpret kind, code maps) **and** the compiled plan's real prepopulate fill-rate against the seeded DB | yes |

**Reading the output:**

- Lines like `grain/cardinality check (cord-ph): encounters.patient -> clinical_notes.patient is to-many but 'encounters' grain is one-row-per-entity` are **diagnostic warnings** from the deterministic model build, not errors and not scores. They flag a foreign-key join that fans out (one row → many), which prepopulation must not copy across — it gets delegated to interpretation instead. A dozen of these on cord-ph is expected.
- The **scores** print after each stage's LLM call completes, one block per case (e.g. `index-db:cord-ph`), followed by any `BELOW THRESHOLD` failures.
- If `make eval` prints the warnings and then sits silent, it's **waiting on the LLM**, not stuck on the warnings. Confirm `models.yaml` / your `.env` key are set, or run `make eval-prepopulate` for a no-LLM check.

**Known gap:** the harness scores the scaffolding (indexing/mapping) and the
deterministic prepopulate fills. It does **not** yet score the **LLM's interpretation
accuracy** of interpret cells (the "not-edited rate" accuracy bar). That
interpretive eval is specified in
[`specs/product/acceptance-criteria.md`](./specs/product/acceptance-criteria.md) but not
yet implemented.

## Tests

```bash
# Python (unittest). Two naming conventions coexist:
python3 -m unittest discover -s core -p '*_test.py'           # *_test.py suites
python3 -m unittest discover -s core/table_population/tests -p '*.py'  # table-population suites (plain names)
python3 -m unittest discover -s server -p '*_test.py'         # backend suites

# Front-end (node --test)
cd app && npm test
```

## Make targets

| Target | Description |
|--------|-------------|
| `make db` | Build all SQLite databases from committed CSVs |
| `make seed` | Seed `var/` with pre-indexed DBs + ready audits (no LLM) |
| `make mapping` | Pre-build mappings that need the LLM (e.g. NPDA) into `data/seed/` |
| `make dev` | Start the FastAPI backend on :8000 |
| `make dev-seeded` | `make seed` then `make dev` |
| `make eval` | Full quality eval (all stages, needs LLM) |
| `make eval-prepopulate` | Offline prepopulate fill-rate eval (no LLM) |

## Layout

| Path | Description | Details |
|------|-------------|---------|
| `server/` | FastAPI backend (control plane) | [`server/README.md`](./server/README.md) |
| `core/` | Indexing, mapping, table population (prepopulate + agent) | — |
| `app/` | Svelte browser UI | [`app/README.md`](./app/README.md) |
| `data/database/` | CSV fixtures & SQLite builder | [`data/database/README.md`](./data/database/README.md) |
| `core/agent/` | OpenCode project root + `cell-fill` skill (execution plane) | — |
| `data/seed/` | Hand-verified golden artifacts for the evals | — |
| `scripts/` | Seeding, mapping, and the eval harness | — |
| `specs/` | Product spec set + contracts (`product/`), build-plan method (`build-plans/`), status (`STATUS.md`) | [`specs/README.md`](./specs/README.md) |
| `data/templates/`, `data/skills/` | Audit xlsx templates + archived skill scripts | — |
