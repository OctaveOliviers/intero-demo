# Architecture

Read [README.md](README.md) first. **Intero is operational intelligence for hospitals:**
it turns the hospital's databases into answers a clinician reaches through a **thread** (a
free-ranging conversation) as an **Answer** or a **table** (a populated audit). Scope binds
to the **table** (pinned to one **Dataset** or the whole DB, fixed for life), not to the thread,
which roams ([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)). Clinical audit
is **one use case** — a populated table. This document describes the pipeline that makes that work
and maps each part to the code that already exists in `core/`. It is the backbone the other specs
hang off. *(A **dashboard** is a deferred third output, built on a table — [product-flows.md](product-flows.md).)*

---

## The three phases

```
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ INDEXING │───────▶│ MAPPING  │───────▶│ RUNNING  │
   └──────────┘        └──────────┘        └──────────┘
   per table template  per persisted        per thread
   / per database      template (all dbs)   (Dataset scope applied)

   spec.json           mapping.json          state.db cells
   model.json          (match + executable)    + evidence
```

> **Storage:** every artifact above lives under `var/` — see
> [`contracts/storage-layout.md`](contracts/storage-layout.md) for the canonical
> layout and data flow. The sections below describe each phase's *behaviour*; the
> contract owns *where things live*.

Two design rules run through all three phases and explain why it is split this
way:

- **Precompute is tied to persistence.** Indexing and mapping depend only on a table
  template and the databases, so they run **in the background the moment a template is
  persisted** (never blocking a request); a **Dataset's** filter SQL is grounded and saved
  when the Dataset is persisted. What is *not* precomputed is an **ad-hoc, in-chat** table
  that was never persisted: it has no mapping, so it is resolved live by the agent.
- **Each phase produces a self-contained artifact.** A later agent works from the
  artifact *alone*, without re-reading the input. The run agent never sees the raw schema
  or the raw template — only the mapping (and, for a Dataset, its grounded filters). This
  keeps run-time context small and behaviour reproducible.

---

## Phase 1 — Indexing
**Goal:** turn a newly-added template or database into a reusable, richly
structured JSON *model* that a later agent can work from **without ever
seeing the original**.

| Input | Builder | Output |
| --- | --- | --- |
| Table template `.xlsx` | `core/indexing/build_audit_spec.py` | `spec.json` — the **field spec**: every field, what it means, where it goes in the sheet, plus the audit's inclusion criteria. **Database-agnostic** — names no table or column (direct vs interpret is decided at mapping). |
| SQLite database | `core/indexing/build_database_model.py` | `model.json` — the **schema model**: tables, columns, types, relationships, row counts, clinical column descriptions, coded value sets. |

How it works today (`core/indexing/service.py`):
- A deterministic extractor pulls the structure in-process (openpyxl for the
  table, SQLite introspection + the read-only profiler for the schema), then
  **one LLM call** writes the clinical judgment. (This replaced an older
  multi-turn agent.)
- Cross-database **identity links are measured, not guessed**: the profiler
  samples each identifier column's values and records, on `model.json`
  (`identity_links[]`), which sibling-database key column holds the same values
  (e.g. `clinic_visits.patient_ref` = `npda-demographics -> patients.nhs_number`,
  "24/24 sampled values found in target"). The mapping LLM copies these facts
  into `identity.keys`, and the compiled identity bridge rests on a
  measurement — the LLM never invents how two databases join.
- The model's in-model `status` field (`indexing` → `ready` / `error`) is the
  source of truth for indexing state. Every model is validated against its
  schema in [`contracts/`](./contracts/) before write — a broken model is never
  persisted.
- Indexing runs as a **background task** with a **pub/sub queue** that pushes
  progress to the front end over SSE, and a **startup rescan** that re-launches
  any entity left mid-indexing if the server died.

> The audit-template indexer works at the database indexer's altitude: the `fields[]`
> skeleton — number, section, cell, verbatim header name, FK id — is extracted
> mechanically from the table; the LLM fills prose only (types, units, permitted
> values, notes, deadline, suggested criteria) and can never restructure. Quality is
> measured, not asserted: `make eval --stage index-audit` scores every rebuild
> against the golden seed spec.

**What makes a *good* model** — and the bar the product must hit — is specified in
[indexing-and-mapping.md](features/indexing-and-mapping.md): the model must be
informative enough that an agent who never saw the template/database could fully
populate it from the model alone.

---

## Phase 2 — Mapping
**Goal:** bind one table template to its database(s) — record, for every
template field, **exactly where its value lives**.

`core/mapping/build_audit_database_map.py` takes the field spec (`spec.json`) and
the schema model(s) (`model.json`) and makes one LLM call to produce a single
**`mapping.json` per audit** that spans every database the audit draws from,
organised by **region** (a contiguous block of cells sharing one entity grain).
For each region it records:
- the region's anchor (sheet, data range, row-ID column) — so the run can
  populate **from the mapping alone**;
- **direct fields** → the exact `database → table.column` holding the value
  (plus the code map when the column stores coded values);
- **interpret fields** → the `database → table.column`(s) holding the evidence to combine;
- the entity grain and the join paths that filters hang off.

The mapping's `fields[]` blocks hold **no SQL and no filter values** — they are the "where the
data lives" record: direct fields → the value's `table.column`; **interpret fields → the
`table.column`(s) holding the evidence to combine**, so the agent knows where to look. (The
cohort/criteria surface now lives on the **Dataset** and the database model, not in `mapping.json`
— see [open-questions.md](open-questions.md) Q31.) The Dataset supplies the scope per run.
Mapping runs **eagerly in the background the moment a table is persisted as a template**,
**across all available databases**, and is cached under `var/templates/<template_id>/mapping.json`.
A table that is **not** persisted has **no mapping** — it is resolved live by the agent,
and prepopulate is skipped.

### The executable block
The run does not write SQL at run time. A deterministic compile step
(`core/mapping/build_populate_spec.py`) folds an **`executable` block into
`mapping.json`** — parameterised read-only SQL per region + a cell map +
identity join keys + the cohort block — run by a **single fixed, audited
executor** (the prepopulate step in `core/table_population/populate.py`). **No generated or user-edited code is
executed**:

- **Direct values** — the executor runs each region's SQL read-only (scoped to the resolved
  cohort — its only bind), joins per-database results on the identity keys, translates code sets, and
  writes the cells. The SQL run is captured as that cell's evidence.
- **Interpretive values** — the mapping records where the evidence rows/notes live;
  the table agent reads them, decides the value, and writes it. The interpretation is the
  irreducible run-time step; everything around it is precomputed data.

We chose **SQL-as-data + a fixed executor over generated Python**: it keeps the "agent injects
only filters" speed while never executing generated or user-edited code against hospital data
(the safety posture). Detailed in
[indexing-and-mapping.md](features/indexing-and-mapping.md).

### Multiple databases
A single table often draws from several databases (e.g. EHR + labs + radiology), and a
**Dataset** likewise scopes across several. One `mapping.json` spans all of them (each
field names its source database); the table-population runtime binds the mapping's **full database list**:
`ensure_mapping` builds across the list, the table-population module validates and mounts every bound
SQLite read-only, prepopulate queries each region against its own database joining on the
identity keys, and a cross-database cell is left open for the **table agent**, which
sees every database. The **same read-only `ATTACH` + identity-bridge machinery resolves a
Dataset that filters across databases.** Specified in
[indexing-and-mapping.md](features/indexing-and-mapping.md).

---

## Phase 3 — Table Population
**Goal:** given a prepared table population, apply the user's filters, populate the table
live, and record evidence for every cell.

The live path is a **delegation**: the **table-population route** (`server/routes/table_populations.py`)
is a thin adapter — auth, HTTP, the SSE relay — that hands the pinned **table** to
`core.table_population.populate_table(store, table, …)`. The **driver derives its own ingredients**
from that identity (the source template's field spec + mapping and the Executable block, the
**Dataset's** grounded predicates as the cohort, the database bindings — all behind
`assemble_population_context`), **precomputes the pending cell grid**, and runs the **two population
steps** — **prepopulate**, then the **table agent** — over the **cell store** (`core/store`,
`var/state.db`). When no mapping exists, **prepopulate is skipped** and the agent populates from the
schema model. Every cell update is persisted and streamed as a strict-v2 SSE event. **Table population
status** (the process lifecycle) lives on the run row in the state store (`runs.population_status`);
**table result status** is derived from the persisted cells. Read-only is enforced at the SQLite level
(`PRAGMA query_only`, authorizer).
The **table agent** is the specialized **sub-agent** the population delegates to: it drives a
provisioned `opencode` session — through the shared **sub-agent launcher** (`core/agent/launcher.py`,
the one seam both agents cross) — running the **`table-fill` skill** over the still-open cells from
the table's **brief** (the user-intent text the pinned table keeps for life), navigating the database
through the **`navigate` skill** (below).

**The agent navigates the database progressively — it never loads the whole schema.** A
database can hold hundreds of linked tables and a hospital tens of databases, so the agent
works the way a coding agent works a file tree: a cheap **catalog** of the bound databases,
**search** (grep) to find where a value lives, **describe** to read a table's columns,
and **join-paths** to follow the FK + measured identity-link hops (within and across
databases). **Structure** (names/types/keys) is read **live** from the SQLite database;
**meaning** (descriptions, code sets, the filterable surface, identity links) comes from
`model.json`; the join graph is **derived** from `model.json`, not a separate artifact. The
agent is **seeded** at the Dataset's anchor tables and queries outward. Specified in
[table-population.md](features/table-population.md) and
[indexing-and-mapping.md](features/indexing-and-mapping.md).

The table-population contract (all detailed in [table-population.md](features/table-population.md)):
- **Scope binds to the table** ([decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)): a **table** pins one Dataset (or the whole DB) as a **hard cohort, fixed for life** — the Dataset's grounded predicates compose into the executable's cohort block (multi-database via read-only `ATTACH` + identity bridges), **injected by the `sql_execute` tool**, never written by the agent. An **Answer** scopes **per message** and is bounded only by the user's hospital permissions (the thread itself is unscoped).
- **Streaming** table-population progress to the front end as the strict-v2 event stream.
- **Stop + re-run** (idempotent; re-run resolves only open cells and preserves reviewed/corrected cells). Table population is a **long-lived background job that keeps populating after the user leaves**. **In-place refresh** (re-checking later for newly-landed source data) is **deferred** ([refresh.md](features/refresh.md)); true pause/resume is deferred to the vision.
- **Live, traceable population** — cells fill progressively and become clickable as soon as they have a value + metadata.
- **Direct/interpret visual markers** in the output (review-status cell tints).

**Both v1 outputs share this runtime, differing only in the final step** (product-flows.md), and both
now cross **one shared sub-agent launcher** (`core/agent/launcher.py`: prepare an opencode workspace,
drive its session, stream activity — the thread agent and the table agent are its two adapters): an
**Answer** runs the **`chat-answer`** skill — navigate, then stream an answer with inline citations
(no cells) — driven by the **Thread Agent runtime** (`core/agent/`: `runtime.py` behind one
`run_turn` seam, with `session.py`/`prompts.py`/`outputs.py`/`activity.py` and the launcher hidden
behind it — [chat-answer.md](contracts/chat-answer.md) §The backend thread-agent runtime); a
**table** runs the two population steps above as a delegated **table agent** the thread tracks via an
inline inspector. A **table** is the first **Artifact** — an Output with its own id and its own
persistent, rerunnable sub-agent workspace under `var/artifacts/<id>/` (a **dashboard** would be the
second; see [CONTEXT.md](CONTEXT.md) §Artifact). *(A **dashboard** — **deferred**, not in v1 — would
populate its underlying table the same way, then a fixed reducer computes each indicator from a
stored **formula** and the front end renders the agent-chosen **viz config**, the agent never
aggregating; retained design in
[table-population.md §Dashboard output (deferred)](features/table-population.md#dashboard-output-deferred).)*

---

## Artifacts & the seed plane

Per dataset, the pipeline produces:

| Artifact | Phase | Lives in |
| --- | --- | --- |
| `spec.json` | indexing | `var/templates/<template_id>/` |
| `model.json` | indexing | `var/databases/<db_id>/` |
| `mapping.json` (one per audit, spans all its databases; includes the `executable` block) | mapping | `var/templates/<template_id>/` |
| `workbook.xlsx` (the uploaded template; present iff uploaded — spec-only audits build `result.xlsx` per run) | upload | `var/templates/<template_id>/` |
| `dashboard.json` *(**deferred** — dashboards not in v1)* (a **dashboard template**: the underlying table reference + each indicator's declarative **formula** and **viz config**) | dashboard persist | `var/dashboards/<id>/` (provisional — path + schema owed if/when dashboards are built, see [open-questions.md](open-questions.md) Q31) |

Because indexing and mapping are slow/paid LLM calls, the repo commits these as
**fixtures under `data/seed/`**; `make seed` copies them into `var/` with
**zero LLM calls** and rebuilds the SQLite DB from committed CSVs, so the app
boots with audit + database already `ready`. This is how the product demos and tests
run without burning LLM calls — preserve it.

These artifacts feed the **left-panel libraries** ([library-and-sources.md](features/library-and-sources.md)):
**Templates** shows table templates (drawing on `spec.json` + `mapping.json`), **Tables** shows the
populated audits produced from them, and **Datasets** (the data library) shows persisted, grounded
filters over the hospital database (the `dataset` artifact, landed in #287). Source databases
(`model.json`) are backend infrastructure, not a user-facing surface. *(Dashboard templates are
deferred; projects/folders are deferred — the panel is flat.)*

The `var/` artifacts are the **single source of truth**: every consumer reads definitions from them,
**never from a hardcoded catalog**, and a user's edits in the library (e.g. a template field's
name/description) **auto-save back to the artifact and are preserved across re-index** — the editing
+ preserve-on-reindex contract is owned by
[indexing-and-mapping.md](features/indexing-and-mapping.md).

---

## Where the front end meets the backend

The Svelte app talks to the backend through **one seam**: `app/src/lib/api.js`,
where every call is `if (isMockMode()) return mockX(); else fetch('/api/...')`.
The backend registers a route for every call (`server/main.py`:
`audits`, `databases`, `runs`, `sql`, `table`, `generate`, `indexing`,
`health`). The **server contracts are the authority** for response shapes; the
mock layer (`app/src/lib/mock.js` + `mockData.js`) must mirror them and is kept
honest by shared contract tests.

---

## What this means for the build

1. The **pipeline shape is settled and built** — specs should use its
   vocabulary (field spec / schema model / field mapping / region / direct vs
   interpret) and the product vocabulary (Dataset / Thread / Answer / Table), not invent new
   terms. *(Project and dashboard are deferred — don't build to them.)*
2. The **remaining engineering** is concentrated in: the **Dataset scoping layer** and its
   multi-database resolution (landed), **eager background mapping on persist**, and the
   front-end surfaces (the Datasets / Templates / Tables libraries, threads, the table view +
   its sub-agent/inspector).
3. The **front-end contract** is pinned by the server contracts; mock mode
   mirrors them behind the existing per-domain flag.
