# Indexing & Mapping

Read [3-architecture.md](./3-architecture.md) first. This document specifies the two
**precompute phases** that run ahead of any user request: **indexing** (model each
template and database) and **mapping + executable compilation** (bind an audit to its
databases and compile the executable Tier-1 plan — data, not code).

The governing principle: **precompute everything that does not depend on the user's
filters.** Indexing and mapping depend only on the template and the databases, so they
run on upload / overnight / idle. At run time the agent supplies only filter values.

Access control for these phases is governed by
[12-control-plane-database-and-access.md](./12-control-plane-database-and-access.md) and
[contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md):
indexing/mapping actions require role permission plus grants to the target audit/database
resources.

---

## Phase 1 — Indexing

**Goal:** turn a newly-added template or database into a reusable, richly structured
*model* that a later agent can work from **without ever seeing the original**.

| Input | Builder (exists) | Output |
| --- | --- | --- |
| Audit template `.xlsx` | `core/indexing/build_audit_spec.py` | `spec.json` — the **field spec** |
| SQLite database | `core/indexing/build_database_model.py` | `model.json` — the **schema model** |

### `spec.json` — the field spec
Database-agnostic. Describes only the workbook. For every field it records:
- **what the field means** and **what kind of value it expects** — a date, a number, a
  category, free text, or a **derived 0/1 yes-no** ("is this criterion satisfied for this
  patient?");
- **any coded value set the template defines**, captured verbatim as the full
  code → meaning mapping (e.g. `1 = male, 2 = female, 3 = unknown, 9 = unspecified`). When
  a template encodes values this way, the model must carry the whole mapping so the agent
  writes the right code, not the literal word;
- **where it goes** (sheet + cell/region);
- *(direct vs interpret is **not** recorded here — that classification is mapping's job,
  once the database is known; the spec only conveys what the field expects, e.g. a derived
  0/1 criterion);*
- **which cells actually need populating** — many templates need values only in specific
  regions, not in every cell.

It must handle the range of real templates:
- **Simple** templates: a few columns, one entry per row.
- **Complex** templates: a first sheet that is pure explanation (what the audit is, what
  each value means, how to fill it), then structured sheets where values are required only
  in particular regions, and where many fields are **derived/interpretive** (a yes/no
  criterion per patient) rather than copied.

The model captures that explanatory/instruction content too, plus blank spacer columns and
merged ranges that would otherwise trip a writer. Names no table or column — that binding
is mapping's job.

### `model.json` — the schema model
Per database: tables, columns, types, relationships, and row counts. Crucially, for each
table and column it records **what kind of value it actually holds** in care terms — so an
agent knows what data it can get from that table **even when the column name is cryptic or
confusing**. The description disambiguates the schema; it does not just restate the names.
This includes capturing any **coded columns and their code sets** (e.g. sex stored as
`M`/`F`), since the database's encoding may differ from the template's and will need
translating at populate time.

### Builder output validation *[built]*
*(Eng review, 2026-06-04, decision S2.)* Every builder makes **one LLM call** that must emit a
valid artifact. Each builder **validates its own output against its JSON schema in
`contracts/` before writing** — required fields present, cell refs well-formed, the
`executable` block valid JSON with bound params. On malformed
output the entity is set **`status: error`** with a **bounded retry**: never write a broken
model, never crash the run that depends on it.

### The bar: a good model
This is the load-bearing requirement. A model is good enough only if **an independent
agent that never saw the source could fully work from the model alone.** Concretely:
- Structured, not a flat "column X = Y" dump. Group by entity/section; state the grain.
- **Explain the values, not just the names.** For an audit field: what value it expects
  and where it goes. For a database column: what kind of value it actually contains,
  especially when the name is ambiguous, so the agent knows what it can pull from there.
- For an audit: make it unambiguous **which cells need a value** (the populate regions),
  capture any instruction/explanation sheet, and flag **derived/interpretive** fields
  (e.g. a 0/1 criterion), plus blank spacers and merged ranges.
- For a database: say where each clinical concept lives and how tables join, not just the
  raw schema.
- Crisp and complete: enough that a second agent could populate the template, or query the
  database, with no access to the original file.

### Lifecycle & mechanics (built)
- The in-model `status` field (`indexing` → `ready` / `error`) is the source of truth.
- A deterministic extractor pulls structure in-process (openpyxl / SQLite introspection),
  then **one LLM call** writes the model. (Fast — single call, not a multi-turn agent.
  TODO-0001, TODO-0055.)
- Indexing runs as a **background task**; progress is pushed to the UI over SSE; a
  **startup rescan** re-launches anything left mid-indexing. (Non-blocking; TODO-0060.)

**Acceptance (indexing):**
- Uploading a template or registering a database produces a `ready` model without
  blocking the UI; failure sets `error` with a reason and a retry path.
- A reviewer can read `spec.json` / `model.json` and understand the template/database
  without opening the source file.

---

## Phase 2 — Mapping

**Goal:** bind one audit to **all the databases it draws from** and record, for every
field, **exactly where its value lives**.

`core/mapping/build_audit_database_map.py` takes the field spec + the schema model(s)
and makes one LLM call to produce a single **`mapping.json` per audit that spans every
database the audit draws from** — each field names its source database. One template,
several sources, one artifact the run works from.

Organised by **region** (a contiguous block of cells sharing one entity grain). Per
region it records:
- the region's **anchor** (sheet, data range, row-ID column) — so the run can populate
  from the mapping alone;
- **direct fields** → the exact `database → table.column` holding the value;
- **interpret fields** → the `database → table.column`(s) holding the evidence to combine;
- the **entity grain** and the **join paths** that filters hang off.

The mapping's match blocks record **WHERE** the data is, never **HOW** to query it. They hold **no SQL
and no filter values** — the executable SQL lives in the **`executable` block** (compiled in Phase 3, folded into the same `mapping.json`); filters are
per-run. Mapping runs **lazily at run-start** (the audit↔databases pair only exists once
the user has picked both).

**Multi-database:** one `mapping.json` binds to **all N databases** the audit draws from
(TODO-0050); each field carries its source database.

### The cohort-criteria surface — filterable inclusion criteria

*(Task A6.1, 2026-06-05.)* Mapping is where we figure out **what the audit can be filtered against**, because it is
already the step that links audit concepts to real `table.column`s. So mapping **also**
extracts the audit's **inclusion-criteria surface** and pre-links it, emitting a
**cohort-criteria section** in `mapping.json`. Per allowable inclusion dimension:

- the `database → table.column` it resolves to, a one-line **meaning**, and a `type`;
- the **join path** back to the identity anchor (so a filter on a non-anchor table can be
  reached) and the **patient-grain rule** — every predicate resolves to *"this patient has
  ≥1 matching row"* (an `EXISTS`/`IN` over the patient's rows, never a count-inflating join);
- for **low-cardinality** `category`/`code` dimensions, the **real allowed values** (bounded
  read-only `SELECT DISTINCT`; code→meaning) — so the run-time resolver can map "caesarean" →
  the stored `delivery` value; for `date`/`number`, the **min–max range**;
- the audit's **canonical default cohort** (the criteria it specifies by default) — for the
  "run the national audit" path (no user criteria).

**Structured-only (v1):** a criterion the bound database can only satisfy from **free-text
notes** is **marked not-expressible (deferred)**, never invented (free-text cohort filtering is
a 100-day item — task P1). Everything is **automatic**; the library is the **review/edit**
surface (task D9). The filter surface is a property of the *audit*, computed where the linking
happens. The run-time resolver (B6) reads this section; the `executable` cohort block
(A7) is generated from it.

### The fixed inclusion criteria — the audit's default cohort

`criteria_bindings` is the **search space** (what the audit *can* be filtered against). The
**`fixed_criteria`** block is the complementary, smaller thing: the patient filters that
**define this (national) audit's cohort** — what it *does* filter by default. We start from
standard national audits whose inclusion criteria are clear and fixed, so these are
**auto-extracted at mapping build** (`build_criteria.py`) from the audit spec and the bound
database, and **persisted** in `mapping.json`. Each entry references a
`criteria_bindings[].criterion_id` and carries a fixed `predicate` (`op` + `value(s)`, e.g.
`gestation_weeks ≥ 37`) plus a one-line `display` string. This is the **canonical default
cohort** B6 applies when a run gives no per-run criteria.

**Edited only in the library.** The audit-detail page (§
[9-library-and-sources.md](./9-library-and-sources.md)) is the **one** place a user
adds/removes/edits these fixed criteria. A change writes the `fixed_criteria` array back to
`mapping.json` via the audit-mapping PATCH endpoint and is **re-validated against
`mapping.schema.json`**; every `criterion_id` must exist in `criteria_bindings`
(structured-only — free-text dimensions remain in `not_expressible`). Edits are saved
automatically. `fixed_criteria` is regenerable from the standard extraction, but once a user
has edited it the saved values are the source of truth until the next deliberate re-extract.

**Acceptance (mapping):**
- For a given audit + database set, `mapping.json` covers every field, classifies each as
  direct/interpret, and names the source database + table.column(s).
- An agent can locate every value from `mapping.json` without re-reading `spec.json` or any
  `model.json`.
- Mapping execution is denied (`403`) when the caller lacks the required catalog permission or
  resource grants for the audit/database set.

---

## Phase 3 — Precompute: the `executable` block

*(Decision A2: precompute is **data**, not generated or executed code.)*

**Goal:** compile the mapping's match into the executable Tier-1 plan so the run only injects
filter values — **without generating or running any code.**

The artifact is the **`executable` block, folded into the same `mapping.json`** (a structured
populate spec — data, not code; there is no standalone `populate.json` file). It records, per region:
- the **parameterised SQL** per source database (filters as named bind params, e.g. `:date_from`);
- the **cell map** (which result column → which workbook cell);
- any **code-set translation** (DB encoding → template encoding, e.g. `M`/`F` → `1`/`2`);
- the **identity join keys** (NHS number + spell date / local number + episode id);
- the **cohort block** (generated from the mapping's cohort-criteria section, A7).

### How it is consumed at run time
The `executable` block is **Tier 1**'s plan in the run's cell-resolution ladder. The
[orchestrator](./5-run-engine.md) creates every cell up front from the spec + the
resolved cohort, then resolves it through three escalating tiers over a shared cell store:
**Tier 1 `try_direct`** runs the spec's parameterised SQL **read-only** (binding only the filter
values), copies results into cells, and applies each field's code map; **Tier 2 `try_llm`** and
**Tier 3 `try_agent`** spend intelligence only on the cells Tier 1 left open. The full run loop
— store, tiers, escalation, events — is specified in
[5-run-engine.md](./5-run-engine.md) (design rationale archived in
[0ld/run-population-redesign.md](./0ld/run-population-redesign.md)); it is not re-derived here.

The Tier-1 contract this artifact must honour:
- **Per-database, join in Python (A3):** each source DB is queried on its own read-only
  connection; results are joined on the identity keys. A **foreign** database's query is
  keyed by its own identity column: the compiled **identity bridge** (derived from the
  match's `identity.keys`) translates the anchor identities into that key set via the
  anchor table, and only that database's **key table** is Tier-1 reachable — a field on
  any other foreign table (a different grain, an unknown linking column) is forced to
  `interpret` for the higher tiers. If a join key is **missing or
  mismatched**, the cell is left **blocked** (`IDENTITY_UNRESOLVED`) — rows whose identities
  don't match are **never combined** (GAP-4;
  [10-status-and-blocked-items.md](./10-status-and-blocked-items.md)).
- The exact SQL run for a cell is **captured as that cell's evidence**
  ([6-traceability-evidence.md](./6-traceability-evidence.md)).
- A query that returns nothing for a cell yields an explicit `missing` / `unknown` /
  `not_available`, never a fabricated value. *(TODO-0036.)*

### Visible and editable
*(TODO-0061.)* The populate spec is a "standard" reusable mapping, **not** fixed-and-forgotten:
- The user can **see and edit the SQL + cell map** (data) in the UI and save changes, to
  correct a mis-mapped field. They edit **data, not code** — nothing they save is executed as
  a program.
- It must be **re-verifiable against the live schema + template**; schemas and templates drift.
  Stale precompute is a defect.

### Read-only & safety
- Tier 1 uses **read-only** connections (`PRAGMA query_only`, authorizer) and runs **only** the
  spec's parameterised SQL — **no generated or user-supplied code ever executes.** This is the
  A2 posture: precompute is data.

**Acceptance (precompute):**
- For the cord-pH demo audit (UC2), Tier 1 `try_direct` fills the direct cells from
  the `executable` block given only filter values.
- Each direct cell's evidence carries the exact SQL that produced it.
- The user can open, edit, and save the **SQL + cell map** (data) from the UI, and re-generate
  the spec after a schema/template change.
- **No generated or user-edited code is executed** — only the spec's parameterised SQL runs, read-only.
- A missing/mismatched join key blocks the cell (`IDENTITY_UNRESOLVED`); identities are never mixed.

---

## Artifacts per audit (recap)

```
var/audits/<audit_id>/
  spec.json      # field spec (indexing) — database-agnostic
  workbook.xlsx  # the uploaded template (present iff uploaded; spec-only audits build result.xlsx per run)
  mapping.json   # one per audit, spans all its databases (mapping); its `executable` block
                 # is the compiled populate spec: parameterised SQL + cell map + join keys
                 # + cohort (data) — Tier 1 try_direct of the run ladder (A2)
```

Committed as fixtures under `seed/` so `make seed` boots the app with everything `ready`
and **zero LLM calls** — preserve this for demos and tests.
