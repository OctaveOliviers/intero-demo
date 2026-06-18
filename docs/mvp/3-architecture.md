# Architecture

Read [README.md](./README.md) first. This document describes **how Intero turns
an audit template + a database into a populated workbook**, and maps each part
to the code that already exists in `core/`. It is the backbone the other specs
hang off.

> **Orientation for implementers:** this pipeline is **built and live** — the
> spine (`POST /api/runs` → orchestrator → three tiers → cell store → SSE) is
> the production path. The remaining work is concentrated in multi-database
> runtime binding, the audit-template indexer rewrite (A5), and front-end
> surfaces. Each section below marks **[built]**, **[partial]**, or **[gap]**.

---

## The three phases

```
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ INDEXING │───────▶│ MAPPING  │───────▶│ RUNNING  │
   └──────────┘        └──────────┘        └──────────┘
   per template /      per audit             per user run
   per database        (across its dbs)      (filters applied here)

   spec.json           mapping.json          state.db cells
   model.json          (match + executable)    + evidence
```

> **Storage:** every artifact above lives under `var/` — see
> [`contracts/storage-layout.md`](./contracts/storage-layout.md) for the canonical
> layout and data flow. The sections below describe each phase's *behaviour*; the
> contract owns *where things live*.

Two design rules run through all three phases and explain why it is split this
way:

- **Precompute everything that does not depend on the user's request.** Indexing
  and mapping depend only on the template and the database, so they can run
  ahead of time (on upload, overnight, idle). The only thing that *cannot* be
  precomputed is the user's per-run **filters** (inclusion/exclusion criteria),
  so those — and only those — are resolved at run time.
- **Each phase produces a self-contained artifact.** A later agent works from the
  artifact *alone*, without re-reading the input. The run agent never sees the
  raw schema or the raw template — only the mapping. This keeps run-time context
  small and behaviour reproducible.

---

## Phase 1 — Indexing  *[built]*

**Goal:** turn a newly-added template or database into a reusable, richly
structured JSON *model* that a later agent can work from **without ever
seeing the original**.

| Input | Builder | Output |
| --- | --- | --- |
| Audit template `.xlsx` | `core/indexing/build_audit_spec.py` | `spec.json` — the **field spec**: every field, what it means, where it goes in the sheet, plus the audit's inclusion criteria. **Database-agnostic** — names no table or column (direct vs interpret is decided at mapping). |
| SQLite database | `core/indexing/build_database_model.py` | `model.json` — the **schema model**: tables, columns, types, relationships, row counts, clinical column descriptions, coded value sets. |

How it works today (`core/indexing/service.py`):
- A deterministic extractor pulls the structure in-process (openpyxl for the
  workbook, SQLite introspection + the read-only profiler for the schema), then
  **one LLM call** writes the clinical judgment. (This replaced an older
  multi-turn agent.)
- Cross-database **identity links are measured, not guessed**: the profiler
  samples each identifier column's values and records, on `model.json`
  (`identity_links[]`), which sibling-database key column holds the same values
  (e.g. `clinic_visits.patient_ref` = `npda-demographics -> patients.nhs_number`,
  "24/24 sampled values found in target"). The mapping LLM copies these facts
  into `identity.keys`, and the compiled A3 identity bridge rests on a
  measurement — the LLM never invents how two databases join.
- The model's in-model `status` field (`indexing` → `ready` / `error`) is the
  source of truth for indexing state. Every model is validated against its
  schema in [`contracts/`](./contracts/) before write — a broken model is never
  persisted.
- Indexing runs as a **background task** with a **pub/sub queue** that pushes
  progress to the front end over SSE, and a **startup rescan** that re-launches
  any entity left mid-indexing if the server died.

> **Status (A5).** Both paths are **[built]**. The audit-template indexer was
> rewritten at the database indexer's altitude (T11): the `fields[]` skeleton —
> number, section, cell, verbatim header name, FK id — is extracted mechanically
> from the workbook; the LLM fills prose only (types, units, permitted values,
> notes, deadline, suggested criteria) and can never restructure. Quality is
> measured, not asserted: `make eval --stage index-audit` scores every rebuild
> against the golden seed spec — see [BUILD-PLAN.md](./BUILD-PLAN.md) §A5.

**What makes a *good* model** — and the bar the MVP must hit — is specified in
[4-indexing-and-mapping.md](./4-indexing-and-mapping.md): the model must be
informative enough that an agent who never saw the template/database could fully
populate it from the model alone.

---

## Phase 2 — Mapping  *[built]*

**Goal:** bind one audit template to its database(s) — record, for every
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

The mapping's `fields[]`/`criteria_bindings`/`fixed_criteria` blocks hold **no
SQL and no filter values** — they are the "where the data lives" record.
Filters are supplied per-run. Mapping runs **lazily at run-start** (it only
exists once the user has picked an audit and its database(s)) and is cached
under `var/audits/<audit_id>/mapping.json`.

### The executable block  *[built]*

The run does not write SQL at run time. A deterministic compile step
(`core/mapping/build_populate_spec.py`) folds an **`executable` block into
`mapping.json`** — parameterised read-only SQL per region + a cell map +
identity join keys + the cohort block — run by a **single fixed, audited
executor** (Tier 1 in `core/running`). **No generated or user-edited code is
executed** (eng review A2, 2026-06-04):

- **Direct values** — the executor runs each region's parameterised SQL read-only (filters as
  bind params), joins per-database results on the identity keys (A3), translates code sets, and
  writes the cells. The SQL run is captured as that cell's evidence.
- **Indirect / interpretive values** — the run fetches the evidence rows/notes;
  the LLM tiers read them, decide the value, and write it. The interpretation is the
  irreducible run-time step; everything around it is precomputed data.

We chose **SQL-as-data + a fixed executor over generated Python**: it keeps the "agent injects
only filters" speed while never executing generated or user-edited code against hospital data
(the A2 safety posture). Detailed in
[4-indexing-and-mapping.md](./4-indexing-and-mapping.md).

### Multiple databases per audit  *[built]*

A single audit template often draws from several databases (e.g. EHR + labs +
radiology). One `mapping.json` spans all of them (each field names its source
database); the runtime binds the mapping's **full database list** (T12):
`ensure_mapping` builds across the list, the spine validates and mounts every
bound SQLite, Tier 1 queries each region against its own database joining on
the identity keys (A3), Tier 2 routes each cell's retry to the database its
Tier-1 provenance names, and a cross-database cell escalates to Tier 3, which
sees every database. Specified in
[4-indexing-and-mapping.md](./4-indexing-and-mapping.md).

---

## Phase 3 — Running  *[built]*

**Goal:** given a prepared run, apply the user's filters, populate the workbook
live, and record evidence for every cell.

The live path: `POST /api/runs` → the **spine** (`server/routes/runs.py`)
resolves the audit's binding, ensures the mapping, resolves the user's filters
into the cohort, builds the initial workbook from `spec.json` + cohort, then
hands off to `core/running/orchestrator.py`, which **precomputes the pending
cell grid** and sequences the three escalating tiers — `try_direct` →
`try_llm` → `try_agent` — over the **cell store** (`core/store`, `var/state.db`).
Every cell update is persisted and streamed as a strict-v2 SSE event; run
status is derived from the persisted cells, never held in memory. Read-only is
enforced at the SQLite level (`PRAGMA query_only`, authorizer). Tier 3 drives a
provisioned `opencode` session with read-only tools over the still-open cells.

The run phase contract (all detailed in [5-run-engine.md](./5-run-engine.md)):
- **Filter injection** from the precomputed criteria bindings (the run supplies only filters). *[built — structured filters; free-text extraction deferred]*
- **Streaming** run progress to the front end as the strict-v2 event stream. *[built]*
- **Stop + re-run** (idempotent; re-run resolves only open cells and preserves reviewed/corrected cells), plus in-place **refresh** under the same `run_id` with a new `execution_id`. True pause/resume + leave-and-return are deferred to the 100-day vision (eng review A1). *[built]*
- **Live, traceable population** — cells fill progressively and become clickable as soon as they have a value + metadata. *[built]*
- **Direct/indirect visual markers** in the output (review-status cell tints). *[built]*

---

## Artifacts & the seed plane

Per dataset, the pipeline produces:

| Artifact | Phase | Lives in |
| --- | --- | --- |
| `spec.json` | indexing | `var/audits/<audit_id>/` |
| `model.json` | indexing | `var/databases/<db_id>/` |
| `mapping.json` (one per audit, spans all its databases; includes the `executable` block) | mapping | `var/audits/<audit_id>/` |
| `workbook.xlsx` (the uploaded template; present iff uploaded — spec-only audits build `result.xlsx` per run) | upload | `var/audits/<audit_id>/` |

Because indexing and mapping are slow/paid LLM calls, the repo commits these as
**fixtures under `seed/`**; `make seed` copies them into `var/` with
**zero LLM calls** and rebuilds the SQLite DB from committed CSVs, so the app
boots with audit + database already `ready`. This is how the MVP demos and tests
run without burning LLM calls — preserve it.

These artifacts are what the **Library & Source Management** surface
([9-library-and-sources.md](./9-library-and-sources.md)) shows and manages: each audit
card's detail draws on `spec.json` + `mapping.json`, each database card's on
`model.json`.

---

## Where the front end meets the backend

The Svelte app talks to the backend through **one seam**: `app/src/lib/api.js`,
where every call is `if (isMockMode()) return mockX(); else fetch('/api/...')`.
The backend registers a route for every call (`server/main.py`:
`audits`, `databases`, `runs`, `sql`, `workbook`, `generate`, `indexing`,
`health`). The **server contracts are the authority** for response shapes; the
mock layer (`app/src/lib/mock.js` + `mockData.js`) must mirror them and is kept
honest by shared contract tests.

---

## What this means for the build

1. The **pipeline shape is settled and built** — specs should use its
   vocabulary (field spec / schema model / field mapping / region / direct vs
   interpret), not invent new terms.
2. The **remaining engineering** is concentrated in: the audit indexer rewrite
   (A5), multi-database runtime binding, per-stage model configuration, and the
   front-end surfaces (library detail, result-view summary + counters, store
   simplification).
3. The **front-end contract** is pinned by the server contracts; mock mode
   mirrors them behind the existing per-domain flag.
