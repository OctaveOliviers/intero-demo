# Indexing & Mapping

Read [architecture.md](../architecture.md) first. This document specifies the two
**precompute phases** that run ahead of any request: **indexing** (model each **table
template** and each **source database**) and **mapping + executable compilation** (bind a
persisted table to the databases and compile the prepopulate plan — data, not code).

The governing principle: **precompute is tied to persistence.** Indexing and mapping depend
only on a table template and the databases, so they run **in the background the moment a
template is persisted** — never blocking a request. The only per-request input is the
**Dataset** (the scope); an **ad-hoc** table that was never persisted has no mapping and is
resolved live by the agent.

Access control for these phases is governed by
[auth-and-access.md](auth-and-access.md) and
[contracts/control-plane-schema-and-permissions.md](../contracts/control-plane-schema-and-permissions.md):
indexing/mapping actions require role permission plus grants to the target table/database
resources.

---

## Phase 1 — Indexing

**Goal:** turn a newly-added **table template** or **source database** into a reusable, richly
structured *model* that a later agent can work from **without ever seeing the original**.

| Input | Builder (exists) | Output |
| --- | --- | --- |
| Table template `.xlsx` | `core/indexing/build_audit_spec.py` | `spec.json` — the **field spec** |
| Source database (SQLite) | `core/indexing/build_database_model.py` | `model.json` — the **schema model** |

### `spec.json` — the field spec
Database-agnostic. Describes only the table. For every field it records:
- **what the field means** and **what kind of value it expects** — a date, a number, a
  category, free text, or a **derived 0/1 yes-no** ("is this criterion satisfied for this
  entity?");
- **any coded value set the template defines**, captured verbatim as the full
  `code → meaning` mapping (e.g. `1 = male, 2 = female`), so the agent writes the right code,
  not the literal word;
- **where it goes** (sheet + cell/region);
- **which cells actually need populating** — many templates need values only in specific
  regions.

*(Direct vs interpret is **not** recorded here — that classification is mapping's job, once the
database is known.)* The model also captures explanatory/instruction sheets, blank spacer
columns, and merged ranges that would otherwise trip a writer, and names no table or column —
that binding is mapping's job. It must handle both **simple** templates (a few columns, one
entry per row) and **complex** ones (an explanation sheet, region-scoped values, many
derived/interpretive fields).

### `model.json` — the schema model
Per source database: tables, columns, types, relationships, and row counts. For each table and
column it records **what kind of value it actually holds** in care terms — so an agent knows
what data it can get even when the column name is cryptic. This includes any **coded columns
and their code sets**. Crucially it also records two things the rest of the system depends on:
- the **filterable surface** — which columns a **Dataset can be filtered on**, each with its
  `filter_type` and (for low-cardinality columns) allowed values or (for date/number) min–max
  range. Datasets ground their free-text definitions against this surface
  ([library-and-sources.md](library-and-sources.md),
  [inclusion-criteria-setup.md](inclusion-criteria-setup.md));
- the **measured identity links** to sibling databases — a sampled, proven fact that a column
  here holds the same values as a key column there. This is how the **one logical hospital
  database** joins across its source systems; the link is *measured, never guessed*.

`model.json` is the **enrichment source the run agent navigates** — never loaded wholesale.
At run time the agent reads it **progressively** through the [`navigate`
skill](table-population.md#the-navigate-skill--how-the-agent-finds-data) (catalog / search /
describe / join-paths), so a database of hundreds of tables never floods its context.
The split is deliberate: **structure** (table/column names, types, keys) the navigation tools
read **live from the SQLite database** (zero drift); `model.json` supplies the **meaning** that
cannot be introspected — the clinical descriptions, code-set meanings, the filterable surface,
and the identity links. The **join graph** the agent follows is **derived** from this file's
`foreign_keys` + `identity_links`; it is **not** a separate artifact.

### Builder output validation
Each builder makes **one LLM call** and **validates its own output
against its JSON schema in `contracts/` before writing** — required fields present, cell refs
well-formed, the `executable` block valid JSON. On malformed output the entity is set
**`status: error`** with a **bounded retry**: never write a broken model, never crash the run
that depends on it.

### The bar: a good model
The load-bearing requirement: **an independent agent that never saw the source could fully work
from the model alone.** Concretely — structured (grouped by entity/section, grain stated), not a
flat dump; **explain the values, not just the names**; for a table, make it unambiguous which
cells need a value and flag derived/interpretive fields; for a database, say where each clinical
concept lives, how tables join, and which columns are filterable.

### Lifecycle & mechanics
- The in-model `status` field (`indexing` → `ready` / `error`) is the source of truth.
- A deterministic extractor pulls structure in-process (openpyxl / SQLite introspection), then
  **one LLM call** writes the model (fast — a single call, not a multi-turn agent).
- Indexing runs as a **background task**; progress is pushed to the UI over SSE; a **startup
  rescan** re-launches anything left mid-indexing.

**Acceptance (indexing):**
- Adding a table template or a source database produces a `ready` model without blocking the
  UI; failure sets `error` with a reason and a retry path.
- A reviewer can read `spec.json` / `model.json` and understand the table/database without
  opening the source file; `model.json` exposes the filterable surface and the measured
  identity links.

---

## Phase 2 — Mapping

**Goal:** bind one **table** to **all the databases it draws from** and record, for every
field, **exactly where its value lives** (direct) or **where its evidence lives** (interpret).

`core/mapping/build_audit_database_map.py` takes the field spec + the schema model(s) and makes
one LLM call to produce a single **`mapping.json` per table that spans every database the table
draws from** — each field names its source database. Mapping runs **eagerly in the background
the moment a table is persisted as a template**, across **all available databases**, and
**never blocks** a request. A table that is **not** persisted (an ad-hoc, in-chat table) has
**no mapping** — the run skips prepopulate and the agent resolves it from the schema model.

Organised by **region** (a contiguous block of cells sharing one entity grain). Per region it
records:
- the region's **anchor** (sheet, data range, row-ID column) — so the run can populate from the
  mapping alone;
- **direct fields** → the exact `database → table.column` holding the value;
- **interpret fields** → the `database → table.column`(s) holding the **evidence to combine** —
  these are the **hints the agent reads via the [`navigate` skill](table-population.md#the-navigate-skill--how-the-agent-finds-data)** at run time
  ([table-population.md](table-population.md)); the mapping records *where to look*, the agent does the
  reading;
- the **entity grain** and the **join paths** (across databases, on measured identity links).

The mapping's match blocks hold **no SQL and no filter values** — the executable SQL lives in
the **`executable` block** (Phase 3, folded into the same `mapping.json`); the **Dataset**
supplies filters per run.

**Multi-database:** one `mapping.json` binds to **all N databases** the table draws from; each
field carries its source database, and cross-database fields join on the measured identity
links.

### Where Datasets ground — the database filterable surface

A **Dataset** is a filter over the hospital database, so it grounds against the **database's
filterable surface** (each `model.json`'s filterable columns, with allowed values / ranges —
Phase 1), **not** a per-table menu. When a Dataset is defined, its free-text description is
grounded to predicates over those columns — bound to real `database → table.column`s, joined
across databases on **measured identity links**, and proved by a read-only `COUNT` — then saved
on the Dataset ([inclusion-criteria-setup.md](inclusion-criteria-setup.md),
[library-and-sources.md](library-and-sources.md)). Each predicate resolves at entity grain
(*"this entity has ≥1 matching row"* — `EXISTS`/`IN`, never a count-inflating join). A concept
the database can satisfy only from **free-text notes** is **marked not available (deferred — a
100-day item)**, never invented. Mapping does **not** build a per-table criteria menu; the
filter surface is a property of the **database**.

> **A standard audit's default cohort is a Dataset, not a mapping block.** Earlier drafts stored
> an audit's canonical cohort as a `fixed_criteria` block inside `mapping.json`. In the
> operational-intelligence model scope is owned by **Datasets**, so a standard audit ships as a
> **Dataset + table pair** (its filters + its fields); `mapping.json` holds only field locations
> and the `executable` block.

**Acceptance (mapping):**
- For a persisted table, `mapping.json` covers every field, classifies each direct/interpret, and
  names the source `database → table.column` (for interpret fields, the evidence location).
- An agent can locate every value — and every interpret field's evidence — from `mapping.json`
  alone, without re-reading `spec.json` or any `model.json`.
- Mapping runs **in the background on persist**, never blocking, and spans all available
  databases; an unpersisted table has no mapping.

---

## Phase 3 — Precompute: the `executable` block

*(Precompute is **data**, not generated or executed code — see
[decisions/0001](../decisions/0001-sql-as-data-over-generated-code.md).)*

**Goal:** compile the mapping's match into the executable prepopulate plan so the run only injects
the Dataset's filter values — **without generating or running any code.**

The artifact is the **`executable` block, folded into the same `mapping.json`** (a structured
populate spec — data, not code). Per region it records:
- the **read-only SQL** per source database (scoped to the cohort via `:cohort` — its only bind; filters compose into the cohort block, never into region binds);
- the **cell map** (which result column → which table cell);
- any **code-set translation** (DB encoding → template encoding, e.g. `M`/`F` → `1`/`2`);
- the **identity join keys** (the measured cross-database links);
- the **cohort block** — a joinable base selecting the identity keys, into which the **Dataset's**
  grounded predicates compose at run time (multi-database via read-only `ATTACH`).

### How it is consumed at run time
The `executable` block is the **prepopulate** step's plan. The
[run](table-population.md) creates every cell up front from the spec + the resolved cohort,
then resolves it through the **two population steps** over a shared cell store: **prepopulate**
runs the spec's SQL **read-only** (bound only to the resolved cohort — the Dataset's
filters compose into the cohort selection, never into region binds), copies results
into cells, and applies each field's code map; **the table agent**
spends intelligence only on the cells prepopulate left open (and on **every** cell when
the table has no executable). The full run loop is specified in [table-population.md](table-population.md).

The prepopulate contract this artifact must honour:
- **Per-database, join in Python:** each source DB is queried on its own read-only
  connection; results are joined on the identity keys. If a join key is **missing or mismatched**,
  the cell is left **blocked** (`IDENTITY_UNRESOLVED`) — rows whose identities don't match are
  **never combined**.
- The exact SQL run for a cell is **captured as that cell's evidence**
  ([traceability-and-evidence.md](traceability-and-evidence.md)).
- A query that returns nothing yields an explicit `missing` / `unknown` / `not_available`, never
  a fabricated value.

### Visible and editable
The populate spec is a reusable mapping, **not** fixed-and-forgotten:
- The user can **see and edit the SQL + cell map** (data) in the UI and save changes, to correct
  a mis-mapped field. They edit **data, not code** — nothing saved is executed as a program.
- It is **re-verifiable against the live schema + template**; stale precompute is a defect.

### Read-only & safety
Prepopulate uses **read-only** connections (`PRAGMA query_only`, authorizer) and runs **only** the
spec's parameterised SQL — **no generated or user-supplied code ever executes.**

---

## The artifacts are the editable single source of truth

`spec.json`, `mapping.json`, and `model.json` under `var/` are the **only** source of
template/model truth. **No consumer reads a hardcoded catalog** for definition data — the table
view, the request flow, and every library surface read these artifacts; a value that lives in code
instead of the artifact is a defect.

The indexer produces them, but they are **not fixed-and-forgotten** — a hospital corrects what the
LLM got wrong, and the correction sticks:

- **A persisted table template is editable.** A user can edit a field's **name** and its
  **description** (`fields[].notes`) in the library; edits **auto-save** straight back to `spec.json`
  ([library-and-sources.md](library-and-sources.md)). The field's **`id` and `number` are immutable
  join keys** — `mapping.json` and the run reference them — so a rename edits the **`name` only**,
  never the id.
- **The schema model's prose is correctable.** The LLM-written clinical **descriptions** and
  **code-meanings** in `model.json` can be corrected; structure (table/column names, types, keys)
  stays regenerable. *(Source databases are IT-managed, not a clinician library —
  [auth-and-access.md](auth-and-access.md) — so this correction surface is part of source-database
  management, not the clinician's libraries.)*
- **User edits survive re-index.** When a template or database is re-indexed/re-uploaded, a
  **durable merge** preserves the user's edited prose (keyed by the stable keys — field `number`;
  `table.column`) rather than overwriting it with a fresh LLM pass, exactly as the audit's
  `inclusion_criteria` defaults are preserved today; genuinely new structure still flows through.
- **Editing is data, not code** (as with the executable's SQL + cell map above): every save is a
  validated, atomic write of the artifact — nothing saved is executed as a program.

*(Dashboards/indicators are **deferred**, so no indicator definitions live in `spec.json`; the
cohort/criteria surface lives on the **Dataset**, not the template — [open-questions.md](../open-questions.md) Q31.)*

**Acceptance (precompute):**
- For the cord-pH demo, prepopulate fills the direct cells from the `executable` block
  given only the Dataset's filter values.
- Each direct cell's evidence carries the exact SQL that produced it.
- The user can open, edit, and save the **SQL + cell map** (data), and re-generate the spec after a
  schema/template change.
- **No generated or user-edited code is executed** — only the spec's parameterised SQL runs,
  read-only.
- A missing/mismatched join key blocks the cell (`IDENTITY_UNRESOLVED`); identities are never mixed.

---

## Artifacts per table (recap)

```
var/templates/<template_id>/
  spec.json      # field spec (indexing) — database-agnostic
  workbook.xlsx  # the uploaded template file (present iff uploaded)
  mapping.json   # one per table, spans all its databases (mapping); its `executable` block
                 # is the compiled populate spec: parameterised SQL + cell map + join keys
                 # + cohort (data) — the prepopulate step of table population
```

*(The on-disk directory key is a storage-contract detail; the spec vocabulary is **table** /
**Dataset**.)* Committed as fixtures under `data/seed/` so `make seed` boots the app with the
seeded tables and databases `ready` and **zero LLM calls** — preserve this for demos and tests.
