# Table Population

Read [architecture.md](../architecture.md), [product-flows.md](../product-flows.md),
and [indexing-and-mapping.md](indexing-and-mapping.md) first. This document
specifies **table population**: what happens from the moment a user asks for a table to the
moment it is fully populated and traceable. The precompute (indexing, and — for a persisted
table — mapping and the `executable` block inside `mapping.json`) is done by now; the table
population's job is to **scope the cohort to the selected Dataset, populate the table live through the cell
store, and record evidence for every value**. This document carries the table-population contract;
the detailed design rationale for the population driver, the shared cell store, and the two
population steps is recorded in the project's git history.

**The two v1 outputs share this runtime, differing only in the final step.** The bulk of this
document specifies the **table** path (the two population steps over the cell store) because it is the
richest. An **Answer** reuses the same agent + the same database-navigation substrate (the
[`navigate` skill](#the-navigate-skill--how-the-agent-finds-data)) but answers instead of
filling cells ([Chat output](#chat-output)), scoping **per message** (the thread is unscoped). The
table's scope is a **hard cohort, pinned for life** — scope binds to the table, not the thread
([decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md)). *(A **dashboard** —
**deferred**, not in v1 — would populate its underlying table through table population and then compute
indicators deterministically; the design is retained, fenced, in
[Dashboard output (deferred)](#dashboard-output-deferred).)*

Backed by `core/table_population` (`populate.py`, `table_population_sessions.py`) over the
cell store (`core/store`).

Authorization for table-population start/stop/read is governed by
[auth-and-access.md](auth-and-access.md) and
[contracts/control-plane-schema-and-permissions.md](../contracts/control-plane-schema-and-permissions.md):
the caller must have table-population permissions plus grants to the selected audit/database resources.

---

## Table Population inputs & resolution

A table population is defined by three things, resolved before population:

1. **The table.** A **persisted** template (it has a `mapping.json`) or an **ad-hoc** table
   created in the chat (no mapping). How the table is chosen, uploaded, or co-created — and
   confirmed before table population — is the request flow in
   [product-flows.md](../product-flows.md).
2. **The databases.** All databases the table's mapping (or the Dataset's filters) touch,
   mounted read-only; one table population may span several (the table-population module binds the mapping's full
   database list, the prepopulation joins per-database on the identity keys — a foreign database
   through its identity bridge, never cross-database SQL — and the agent sees every database).
3. **The Dataset (scope).** The selected Dataset's **already-grounded predicates** are the
   cohort — resolved once when the Dataset was defined, composed into table population here. Optional:
   no Dataset = the whole hospital database.
4. **Authorization gate.** Before table-population creation, the API checks: authenticated session,
   role permission (`table_population.create`), grant to target audit (`audit:run`), and grant to each
   selected database (`database:read`).

---

## Table Population lifecycle

```
prepare table-population dir + table  ─▶  wait for indexing deps  ─▶  ensure mapping (persisted table only)
   ─▶  resolve cohort from the Dataset + precompute the grid  ─▶  run the two population steps
   ─▶  stream cell_update events  ─▶  done
```

The route layer is a thin adapter — auth, HTTP, the SSE relay — that waits for indexing and hands
the pinned **table** to the small `core.table_population.populate_table(store, table, …)` interface.
The **driver derives its own ingredients** from that identity — it ensures the mapping for a
**persisted** table (an ad-hoc table has none) and resolves the cohort from the **Dataset** — then
**precomputes the grid** (one `pending` cell per (region × cohort member × field) in the cell store,
the `cells` table) and drives the **two population steps** (`prepopulate` → the table agent, the
latter working from the table's **brief**) that **update those cells in place**.
When there is no executable (an ad-hoc table),
**prepopulation is skipped** and every cell goes straight to the agent. Each write persists to the cell store and streams a
`cell_update` event; the cell store is the single source of truth.

Table-population write operations are scoped: the caller can only stop/read table populations they own (or are
admin), and the agent can only mutate runtime rows for
the current table population.

### Table result status (Queued → Complete)

Each populated table carries a **result status** — **Queued → In progress → Blocked / In verification →
Complete** — driven by its cells: **Blocked** if ≥1 `blocked` cell, **In verification** if ≥1
`not_reviewed` interpret cell (and no blocks), **Complete** only when zero blocked **and** all
verification signed off. This is distinct from **table-population status**, which is only the
background process lifecycle (`running` / `completed` / `stopped` / `error` / `unknown`).
Result status is **dynamic**: a **user-initiated re-run** auto-resolves cells whose source data has since
landed, moving the table out of Blocked with no manual cell edit — nothing self-heals while the user is
away; the re-run is a deliberate action. The full lifecycle, the
Kanban dashboard, and blocked-item surfacing live in
[status-and-blocked-items.md](status-and-blocked-items.md). Status is
**informational** — it never blocks the download; the user can download a partial audit at any
time (status-and-blocked-items.md).

---

## Cell state model

Every cell's persisted **`state`** is exactly one of **four stored states** (enforced by the
store's `CHECK`):

- **`pending`** — created up front by `populate_table`; not yet settled by a population step.
  The "open set" each step works through (`open_cells()` filters on exactly this).
- **`filled`** — value present, evidence-backed (`sources[]` non-empty, enforced by trigger).
- **`blocked`** — no value; carries `reason_code` + `reason_detail` (status-and-blocked-items.md taxonomy).
- **`not_applicable`** — genuinely N/A; suppressed.

Two rules complete the model:

- **There is no `error` state.** A non-clean result leaves the cell `pending` with the
  failure recorded on `attempts[]` / `hypothesis` — what was tried is provenance, not a state.
- **"Needs verification" is a derived view, never a stored state.** A cell needs verification
  when it is `filled` ∧ `kind: interpret` ∧ `review_state: not_reviewed` (plus low-confidence
  cases per [open-questions.md](../open-questions.md) Q10). `review_state`
  (`not_reviewed` → `reviewed`, interpret only) is per-cell metadata (traceability-and-evidence.md), independent of
  `state` — so "is there a value" and "is it signed off" never share a state machine. Derived
  counts surface in `review_summary.totals.needs_verification` and drive the table result status.

The store keeps the four durable cell states only; every derived count
(`review_summary` totals, table result status, milestone counters) computes from the derived view.

---

## Population: the two steps

`populate_table` populates the cell store through **two population steps**: a deterministic
**prepopulation** from the template's precomputed `executable`, then **the table agent** over
every cell still open. A cell the prepopulation cannot resolve cleanly stays `pending` for the
agent; the agent runs only when open cells remain (immediately, when there is no executable —
every cell is open). Every write updates the cell **in place** in the cell store and streams a
`cell_update`. This section is the binding contract.

- **Prepopulate — `prepopulate`** (deterministic, no LLM): runs the `executable` block's precomputed
  read-only SQL **in bulk** (one query covers many cells), copies the column, and applies the
  field's **code map**. Clean → `filled` (`resolved_by: "prepopulated"`), with the exact SQL
  captured as the cell's evidence. A
  **non-clean** result — unknown code, query error / schema drift, or an empty value — leaves
  the cell **`pending`** with the failed attempt recorded on `attempts[]`; every non-clean
  cell goes to the agent. A missing or ambiguous identity join key marks the cell `blocked`
  (`IDENTITY_UNRESOLVED`) — identities are never mixed. An invalid executable raises
  `PrepopulateError`; missing source data never does (it yields a non-clean or blocked cell,
  not an error). **Prepopulation runs only when the table has a
  mapping (a persisted template). An ad-hoc table has no `executable`, so prepopulation is skipped and
  every cell goes straight to the agent.**
- **The table agent — `run_agent`** (one opencode **`table-fill`** session over **all** still-open cells —
  never one per cell): it provisions the run worktree (`provision_worktree` — `context.json`,
  the run store and each database symlinked by name, the audit spec and schema models), builds
  a **minimal prompt** (`build_prompt`) naming the databases plus a deterministic
  **column-first triage** of the pending work (per-field counts, classed EMPTY / PARTIAL /
  INTERPRET, with the cells' `hypothesis` notes; a single cell's `attempts[]` is pulled on
  demand), and drives the session. The agent reads the table/column
  structure and the **mapping's per-field hints — including, for interpret fields, where the
  evidence lives — through the [`navigate` skill](#the-navigate-skill--how-the-agent-finds-data)**, and queries with cohort-scoped read-only SQL (the
  cohort predicate is **injected** into every query, never asked for — see
  [Cohort scope and the count](#cohort-scope-and-the-count)). Seeing the whole grid, it
  reuses a fix along either dimension: a field broken across many members, or one member's quirk
  breaking many fields. The field's audit code set is revealed only at write (progressive
  disclosure). A session-end fallback (`finalize_unresolved`, run in a `finally`, so a transport error cannot strand
  cells) settles everything it could not solve as `blocked`/`NOT_LOCATED` with `attempts[]` as
  the explanation — the table population never ends with `pending` cells. Agent work with no
  agent client is a hard `RuntimeError`, never silently stranded.

**Scope is enforced through the cohort**, not per-step: the **Dataset's** grounded predicates
compose into the `executable` cohort block (or, for an ad-hoc table, scope the agent's queries
directly), so both steps see exactly the slice the Dataset defines. A cell with no
rows yields an explicit `missing` / `unknown` / `not_available`, never a fabricated value.
When the value is missing because the **source data is absent**, the cell becomes a
**blocked item** carrying a reason code and the owner to chase — see
[status-and-blocked-items.md](status-and-blocked-items.md).

### Write-time coding and the off-code guard

**Coding happens at write time, from the audit spec — never re-applied to an agent
value.** The prepopulation's code map is the *only* place the precompiled (possibly stale) DB→audit
translation runs; when the agent writes a cell it picks the audit-coded value itself from
the field's requirement, shown at write time. A stale binding can therefore never re-break a
value the agent already got right.

**Off-code writes are rejected by the store, not by per-step code.** The field's code set is
canonical in `spec.json` and never stored on the cell; at run start it is materialised into
the store's run-scoped `field_codes` table, and a **DB trigger rejects any off-code write** —
the same guarantee for every writer, including the agent's raw SQL. A rejection leaves the cell
`pending` with the rejection recorded on `attempts[]`, for the agent to retry; a
cell that ends the table population with no legal value is settled `blocked`/`NOT_LOCATED`. *(Off-code
rejection does **not** use `DATA_CONFLICT` — that reason code keeps its status-and-blocked-items.md meaning:
conflicting values across sources needing human resolution.)*

### The cell resolution contract

Both steps write the **same cell object** (frozen in
[contracts/cell-resolution.schema.json](../contracts/cell-resolution.schema.json), extending
the per-cell metadata of traceability-and-evidence.md). Beyond that metadata:

- **`resolved_by`** — `prepopulated` | `agent`: which step produced the terminal value.
- **`hypothesis`** — a note on why the value is hard to place; `null` on
  a clean hit; read by the agent's triage (the prepopulation is dumb and records only
  the raw error).
- **`attempts[]`** — the log of **actual DB queries** (each carrying `by`, `sql`, the
  `table_column` read, and on failure the offending `value` + `error`) plus write-time
  rejections. The agent's reasoning over already-fetched rows is a resolution, not an attempt.
  The agent and the front-end read provenance **off the attempt fields, never by re-parsing
  SQL**.

### The reconciler

A systemic break (the DB renames `Male`→`M`, or a column moves) should fix the **binding** so
the next table population's prepopulation just works. The binding is **never mutated mid-population** — a table population uses the
binding it started with, so the previewed cohort equals the populated cohort. After the table population,
the reconciler reads the cells themselves (`attempts[]` + `sources` + `hypothesis` — the cells
*are* the backlog; no parallel fix object), pattern-matches systemic fixes per field, and
regenerates `mapping.json` (match, executable, code maps). Auto-apply is gated: a regenerated
binding lands only if it validates against its schema **and** passes a dry-run on the records
that previously succeeded.

---

## The `navigate` skill — how the agent finds data

The agent **never receives the whole schema**. It navigates **progressively**, the way a coding agent
works a file tree — `catalog` (list a collection), `search` (grep), `describe` (read a table or a
single column), `join-paths` (follow FK + measured-identity edges) — so it finds where a value lives
among hundreds of tables without ever loading a whole schema. The full model — the four read-only
primitives, exactly which source each reads, and how the same primitives generalise to the Datasets
and template libraries — is specified in [navigation.md](navigation.md) (rationale in
[decisions/0005](../decisions/0005-navigation-is-a-generic-verb-set-over-collections.md)). The
`navigate` skill is its **database** specialisation and the **shared substrate for both v1 outputs**:
`table-fill` and `chat-answer` both navigate through it. The audit field spec — a field's codes, the
field list — is read by the same `describe` verb over the template, on its own small tool.

For a table population, the **bound databases** are the table population's `mapping.json` **full database list**
([architecture.md](../architecture.md#multiple-databases)), one `model.json` per mounted database; for a
an Answer (no mapping) they are the databases the user's hospital permissions expose. A clinical
table's **structure (names/types) is read live** from SQLite (zero drift); **meaning** (descriptions,
code-set meanings, identity links) comes from `model.json`; the join graph is **derived** from it.

**The agent is seeded, not walled.** It starts at the Dataset's **anchor tables** — which fall out of
the Dataset's already-grounded predicates (they name real `table.column`s) — and navigates outward;
**with no Dataset it starts at `catalog`** (a single line when one database is bound) and finds its
first tables with **`search`**. The full schema stays reachable (an output often needs a table the
filter never touched), bounded only by the user's hospital permissions ([auth §11](auth-and-access.md)).

### How table population scopes the agent without it managing filters

The `table-fill` agent **writes plain SQL and names a database; it never writes a cohort or
patient filter** — the `sql_execute` tool injects scope so the agent cannot get it wrong:

- The table population lays down a side **`context.json`** carrying the **cohort identities**, the cohort
  **anchor** column, and per database the **navigation map** (`cohort_tables`, `identity_links`,
  `foreign_keys`). The agent never sees or passes any of it.
- On every query, `sql_execute` **ANDs a cohort-bounding predicate onto each top-level table on
  the parsed SQL** (not by string-mangling): a table carrying the anchor is bounded
  `anchor IN (cohort)`; a foreign-database table is bounded through a **measured identity
  bridge**; a table reachable only by a safe FK path is bounded by an **`EXISTS`** over that
  path. **A table it cannot safely bind makes the whole query rejected** (fail-safe) — an
  unscoped read never reaches clinical data. Cross-database reads are free (one read-only
  `ATTACH`ed connection), but only over cohort-scoped tables.
- Multiple statements, subqueries, CTEs, and set-operations are rejected (scope can't be
  guaranteed inside a nested block); the tool performs any `ATTACH` itself.

This is **table** scoping — the hard cohort, pinned to the table for life. **An Answer scopes
differently** ([Chat output](#chat-output)): the thread is unscoped, each message resolves its own
scope, and the user's hospital permissions are the only hard wall — so the chat agent manages its
own scope within permissions.

---

## Cohort scope and the count

The table population no longer resolves free text at run time. The **Dataset** carries the scope as
**already-grounded predicates**, resolved and proved by a read-only `COUNT` when the Dataset was
defined ([library-and-sources.md](library-and-sources.md)); the table population **composes** those
predicates into the `executable` cohort block. This is the *resolve once at definition, consume at
every table population* rule — the slice the user sees in the Dataset (its count) is exactly the slice the table population
populates, and a re-run never re-resolves.

- **The model writes the SQL, but only a read-only filter runs.** The **composed** query (base
  SELECT + the Dataset's ANDed conditions) is checked by the existing validator
  (`agent/tools/_sql_validate.py` `validate_sql` — `sqlglot`, `SELECT`/`UNION` only, no
  writes/DDL/PRAGMA) and run on a **read-only connection** (`PRAGMA query_only` + authorizer).
- **Multi-database scope** composes the predicates over every source database the filters touch,
  joined on **measured** identity links via read-only `ATTACH` (the same machinery the table agent
  uses).
- **Structured-only (v1).** A slice expressible only from free-text notes is deferred — see
  [vision-100-days.md](../vision-100-days.md).
- **Unresolved criteria are surfaced, not dropped** — at Dataset-definition time an ungroundable
  phrase is shown as *not available*, never silently applied.

> **Superseded.** The run-time free-text extraction and prelinked-criteria-menu detail that
> previously filled the rest of this section is replaced by **Dataset definition**
> ([library-and-sources.md](library-and-sources.md)); the `executable` cohort-block shape below
> is retained because the table population still composes the Dataset's predicates into it.

### The reshaped `executable` block (nested in `mapping.json`, not a separate file)

The `executable` block precomputes the per-cell **skeleton** + an explicit
**cohort selection** the run-time conditions AND into:

```jsonc
{
  "schema_version": "2",
  "audit_id": "cord-ph", "table": "workbook.xlsx",
  "identity_keys": ["patient_code"],

  // The cohort: a joinable base that SELECTs the identity keys. The resolved inclusion
  // conditions are ANDed into `where` at run time; nothing is pre-guessed here.
  "cohort": {
    "database": "cord-ph",
    "from": "cord_ph_birth_records b JOIN encounters e ON b.encounter = e.id",
    "identity_select": "b.patient_code AS patient_code",
    "where": []                                // run-time: resolved inclusion conditions land here
  },

  // The per-cell skeleton. Region queries populate only for identities IN the cohort
  // selection (e.g. `WHERE patient_code IN (<cohort>)`); filters live on the cohort, not here.
  "regions": [ { "id": "ALL", "sheet": "ALL", "kind": "direct",
                 "queries": [ { "database": "cord-ph", "sql": "…" } ],
                 "row_anchor": "patient_code", "cell_map": [ … ] } ],
  "code_sets": { … }
}
```

- The **count** is `COUNT(DISTINCT patient_code)` over `cohort.from` with the resolved
  conditions ANDed into `cohort.where`. The **table population** restricts every region to those identities.
- `populate_table` performs a small composition step at run start: take the cohort selection, AND in
  the validated conditions, and scope the prepopulation's region queries to it.

### The filterable surface the Dataset grounds against

The Dataset's predicates are grounded against the **database** filterable surface (each
`model.json`'s `filterable` columns, with their allowed values / ranges) when the Dataset is
defined — see [library-and-sources.md](library-and-sources.md) and
[indexing-and-mapping.md](indexing-and-mapping.md#where-datasets-ground--the-database-filterable-surface).
The filter surface is a property of the **database**, not of any one table. The table population reads the
Dataset's already-grounded predicates; it builds no per-audit criteria menu.

---

## Streaming table population (v2 strict)

The table population's progress streams to the front end over SSE as one user-facing timeline. The
runtime stream contract is strict v2: only the event names and payload shapes below are valid.
No legacy aliases, fallback fields, or mixed shapes are supported.
Table-population SSE uses message-only framing: each message carries JSON on `data:`, and the canonical
event discriminator is `data.type`. No `event:` line is required. Allowed `data.type` values:
`activity`, `workbook_created`, `cell_update`, `review_summary`, `refresh_summary`, `done`,
`error`.

Ordering guarantees:

```
activity* -> workbook_created -> (activity | cell_update)* -> review_summary
                                              -> [refresh_summary] -> done
                                              -> error
```

- `workbook_created`: exactly once, before any `cell_update`.
- `cell_update`: zero or more.
- `review_summary`: exactly once, always before `done`.
- `refresh_summary`: exactly once on **refresh executions only** (refresh.md), after
  `review_summary` and before `done`; never emitted on an initial run.
- `done`: exactly once on successful completion.
- `error`: terminal failure event; when emitted, no `review_summary` or `done` follows.

| event | payload | UI effect |
| --- | --- | --- |
| `activity` | `{ headline, detail?, name?, status? }` — `headline` is required, non-empty | append to the activity feed; `headline` (one short line) drives the collapsed status |
| `workbook_created` | `{ label, sheets, cellMetadata: {} }` | set the active table (structured, body empty), **emit the file chip now** |
| `cell_update` | `{ sheet, cells: [{ ref, value, meta }] }` | write the value(s), attach metadata, flash the filled cell(s) |
| `review_summary` | `{ totals, blocking, verification }` | the reviewer-focused terminal summary — rendered as the **final entry in the agent-activity feed** (result-view.md) |
| `refresh_summary` | `{ summary }` (refresh executions only) | show what changed in this refresh, grouped under the refresh's activity |
| `done` | `{}` — on refresh executions also carries the same `summary` object | mark complete; do not emit a second chip |
| `error` | `{ message, scope? }` | surface the error + reason; per-region scope where possible |

`review_summary` payload fields are required:
- `totals`: `{ cells, filled, blocked, needs_verification, low_confidence }` (all integers;
  `needs_verification` is the **derived** count — see [Cell state model](#cell-state-model))
- `blocking`: `{ count, reason_codes, focus }` where `reason_codes` is a map of reason code to integer count and
  `focus` is reviewer-facing grouped detail (`reason_code`, `count`, `sample_refs`, `detail`)
- `verification`: `{ pending, reviewed, corrected, focus }` where `focus` includes reviewer queues for
  `needs_review`, `low_confidence`, and `assumptions`

`refresh_summary.summary` payload fields are required (all integers):
- `new_members_count` — cohort members added by this refresh
- `departed_members_count` — members that left the cohort (retained, marked inactive)
- `retried_blocked_count` — blocked cells reopened `blocked → pending` at refresh start
- `resolved_blocked_count` — of those, how many settled out of `blocked` this execution
- `remaining_blocked_count` — blocked cells still open across active members
- `updated_cells_count` — total cell writes attributable to this execution

### Activity feed behaviour
- **Collapsed = one fixed-height status line** (e.g. "Reading the midwife's notes…"),
  driven by `headline`. The row height must never jump as messages change.
- **Expanded = fixed-height scroll window** over the full reasoning; the container does
  not grow with content.
- Auto-scroll to the bottom **only when the user is already at the bottom**; never yank a
  user who has scrolled up to read.

---

## Live population

- The **table chip is emitted on `workbook_created`** (seconds in), not on `done`. The
  table starts structured (headers/regions present) and body-empty.
- Cells fill progressively via `cell_update` — sometimes a whole region at once (one
  direct query), sometimes single interpret cells.
- A cell is **clickable/traceable the moment it has a value + metadata**, while the rest of
  the sheet is still filling. Selecting a cell must **not** interrupt population.

---

## Stop + re-run

The table population is a long-lived server-side job; the UI is a view onto it. **The agent keeps populating
after the user leaves**, so a clinician who steps away returns to a **further-along or complete**
audit — nothing is needed to resume it.

- **Stop** ends the table population via server-side task cancellation (`table_population_sessions`). Work already written
  persists in the table-population record.
- **Re-run** is the recovery path: it re-issues table population, skipping cells already `filled` and
  **never overwriting `reviewed`/`corrected` cells**. The population steps are idempotent over
  the cell store, so re-running is safe.
- **True pause/resume is deferred to the 100-day vision** (leave-and-return — returning to a still-running job — ships)
  ([vision-100-days.md](../vision-100-days.md)): mid-session OpenCode pause/resume is unproven and
  would spend an innovation token. The product ships stop + re-run.

**Acceptance (stop + re-run):** **Stop is an explicit user action** that halts table population with no
background work; **merely navigating away does NOT stop table population** — it keeps populating server-side
and notifies on completion ([product-flows.md](../product-flows.md), Q42). A re-run skips cells
already `filled` (idempotent) and preserves any reviewed/corrected cells.

**Refresh is deferred.** The `re-run` path (a new table-population record that re-attempts open/blocked cells) is
the only recovery/restart motion in the product. **Refresh** — an in-place execution under the same
`run_id` that re-checks a *completed* audit for newly-landed source data — and its `run_executions`
/ `refresh_summary` machinery are **deferred** ([refresh.md](refresh.md)); the design is retained
there for when it is picked up. (Accordingly, the `refresh_summary` SSE event and `run_executions`
rows below never fire in the product today.)

---

## The interpretive gate at run time

- The table population **populates everything immediately**, interpret cells included, so the user
  can start reviewing at once.
- Each interpret cell is emitted with a **review state** in its metadata:
  **`not_reviewed`** (default after population) → **`reviewed`** (set **automatically** once
  the user opens the cell and looks at it for ~2s — no confirm button; see
  [traceability-and-evidence.md](traceability-and-evidence.md)).
- An interpret value **does not count toward COMPLETE** until `reviewed`. The table population is not
  **Complete** while any interpret cell is `not_reviewed` **or any cell is `blocked`**. This is
  a **status, not a download gate** — a partial audit is downloadable at any time
  ([status-and-blocked-items.md](status-and-blocked-items.md)).
- Every cell carries a **confidence** (the word `low` / `medium` / `high`) and **kind**
  (direct / interpret) so the table can render the trust heat-map (mechanics in traceability-and-evidence.md).

### The accuracy bar
The "accuracy bar" the gate enforces, defined concretely:
- **Per table population:** the table population reaches **COMPLETE** only when every interpret cell is reviewed and zero
  cells are blocked. The UI shows how many of each remain (e.g. "6 cells need review · 3
  blocked"). This is a status, not a download gate (status-and-blocked-items.md).
- **Tracked over time:** record, per interpret cell, whether the user **left it unchanged**
  (`corrected = false`, confirmed) or **edited it** (`corrected = true`). The rolling
  **not-edited rate** is the measurable interpretive accuracy, and it is exactly the signal
  the 100-day self-improvement loop consumes (see [vision-100-days.md](../vision-100-days.md)).

---

## Chat output

An **Answer** reuses the agent + the `navigate` skill, but **not** the cell store, the two
population steps, or the `table-fill` skill. It runs the **`chat-answer`** skill: navigate the database,
then **stream a natural-language answer with inline citations**. There are **no cells**, so
there is no prepopulation, no `executable`, no cohort grid, and no review gate — those concepts apply
only to a populated table.

- **The thread is unscoped — each message scopes itself** ([decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md)).
  Per message, the agent resolves whether the question needs a slice (a Dataset) or runs against the
  whole hospital database (the request flow, [product-flows.md](../product-flows.md)) — a later
  message in the same thread can ask about a different slice. Unlike `table-fill`, the chat path does
  **not** use `sql_execute`'s reject-if-unbindable cohort injection (which would refuse a legitimate
  cross-grain or hospital-wide question); the agent manages its own scope, bounded by the user's
  hospital permissions — the only hard wall ([auth §11](auth-and-access.md)). *(Scope binds to the
  table, not the thread: a structured audit pins an exact cohort for life; a conversation roams.)*
- **Every answer discloses the scope it was computed at**, and the in-slice and whole-DB cases are
  **visually distinct**: an answer scoped to a slice carries a **quiet scope chip** in the
  clinician's words ("answered for NICU babies this quarter"), and a hospital-wide answer carries a
  **prominent inline callout** ("answered hospital-wide"). So a clinician is **never silently handed a
  hospital-wide number for a question they meant of a slice**, and the routine label doesn't become
  wallpaper that hides the one reply that departed.
- **Permissions are the ceiling — and that ceiling is itself owed.** The per-message scoping safety
  story rests on the agent reading only under the user's hospital permissions. Until the
  hospital-permission intersection is wired ([auth §11](auth-and-access.md),
  [open-questions.md](../open-questions.md) Q37 — fail-closed, a pilot blocker not a demo blocker), a
  chat's effective ceiling is the **registered hospital database, read-only**; a real-Trust
  deployment must land Q37 before chat ranges over real patient data.
- **Citations are evidence.** Every claim carries its sources inline; pressing a citation opens
  the same evidence structure as a cell — explanation + the SQL + the rows, or the note with
  highlighted passages ([traceability-and-evidence.md](traceability-and-evidence.md),
  [product-flows.md](../product-flows.md)). A citation on an **aggregate** claim (e.g. "the average
  is 4.2 days") opens the **aggregate's own query and the rows it covered** — the same structure,
  scaled to the aggregate, never a single arbitrary row.
- **Streaming** reuses the table-population event stream: the agent's reasoning/tool-calls stream as
  `activity`, and the answer streams into the chat. No `workbook_created` / `cell_update` /
  `review_summary` events fire (those are table events).

> The `chat-answer` skill and the chat-scoping enforcement (the looser, permission-bounded
> `sql_execute` posture) are owed as contracts; see [open-questions.md](../open-questions.md) Q43/Q40.

---

## Dashboard output (deferred)

> **Deferred — not in v1.** No customer has asked; the only structured output in v1 is the **table**.
> This section is the **retained design** for when a customer does ask (the way
> [refresh.md](refresh.md) retains the refresh design) — **do not build it now**. It is written in
> the present tense as the target behaviour for that future build.

A **dashboard is built on a table** and **never invents numbers**. A dashboard table population:

1. **Populates the underlying table** exactly as above — table population over the cell store, the
   hard cohort, every value evidence-backed. (If the table is a persisted template it has a
   mapping and runs the two population steps — identical to any table.)
2. **Computes each indicator deterministically** from the populated cells, by its **stored
   formula** — a **fixed reducer**, not the agent. The formula is **declarative data** evaluated
   over the table's cells (a simple one looks like `{label, agg, field, condition, format}` — a
   count, mean, or percentage-meeting-criterion). The grammar must also express the indicators
   clinicians actually build — **ratios, an explicit denominator that differs from the numerator
   cohort, and two-field combinations** (e.g. rate per 1,000 admissions; time-to-theatre < 4h over
   emergency laparotomies) — all still **data, still deterministic**; its exact shape is owed as a
   contract ([open-questions.md](../open-questions.md) Q43). The agent **does not aggregate** —
   keeping indicators deterministic is what makes them **traceable**: an indicator drills to its
   **formula** *and* the **cells it aggregated**, each of which drills to its own evidence
   ([traceability-and-evidence.md](traceability-and-evidence.md),
   [library-and-sources.md](library-and-sources.md)).
   - **Each indicator carries — and the card shows — its denominator and completeness**: the n it
     was computed over, how many contributing cells were N/A or **blocked**, **and how many are
     `not_reviewed` interpretive** cells (e.g. "47 of 50 · 3 blocked · 5 unreviewed"). The product
     has **two** non-final states — blocked **and** needs-verification ([interpretive gate](#the-interpretive-gate-at-run-time),
     [status-and-blocked-items.md](status-and-blocked-items.md)) — so an indicator resting on blocked
     **or** unreviewed cells reads as **provisional**, never as a settled figure: a card showing
     "50 of 50 · 0 blocked" must not look clean if its rows include unverified agent inferences. The
     reducer already has these counts (`review_summary.totals` exposes `needs_verification`), and they
     surface on the card face, not only on drill-down — so a director never puts an unverified number
     in front of a board unknowingly. Drilling a provisional indicator opens its blocked/unreviewed
     rows, each routing to the cell a clinician clears (the dwell-to-review gate,
     [traceability-and-evidence.md](traceability-and-evidence.md)); routing that review to a **named
     owner** from the oversight surface (an oversight persona can't clear cells themselves) is
     **next-phase**, like the blocked chase list ([status-and-blocked-items.md](status-and-blocked-items.md)).
3. **Renders the agent-chosen visualization.** The agent's only dashboard-specific job is
   **presentation**, decided at **design time** (when the dashboard template is created/confirmed,
   not per table population): it picks each indicator's viz from a **bounded vocabulary** (number / trend line
   / bar / gauge / table) and lays out the cards. Both the formula and the viz are stored
   **declaratively** on the dashboard template (`dashboard.json`) and rendered by the front end —
   **no generated or executed code** ([architecture.md](../architecture.md)).

The formula being data, not agent judgment, is a **traceability requirement** (a dashboard's
value is trust), not [ADR-0001](../decisions/0001-sql-as-data-over-generated-code.md), which
governs the data-extraction path; the viz is declarative for front-end safety + reproducibility.

> The `dashboard.json` schema — indicator formulas (including ratios/denominators), the viz
> vocabulary, and the per-indicator denominator/completeness — is an **additive contract** owed;
> see [open-questions.md](../open-questions.md) Q31/Q43.

---

## The table-population record

Every table population is logged for traceability and for improving prompts. The record captures the
request, the resolved template + databases, the filters, the agent's reasoning/tool calls,
the table-population parameters, the **prompt version**, the user's per-cell verifications / corrections,
and the table population's **status** plus any **blocked items** (reason code + owner). Specified in
[auth-and-access.md](auth-and-access.md).

---

## Acceptance (table population)

- A table population can be started by naming the audit in the prompt; the engine resolves it to an
  existing template.
- `populate_table` precomputes the grid into the cell store, then runs `prepopulate` → the
  table agent, updating cells in place; the prepopulation runs the `executable` block's read-only SQL in bulk
  and applies the code map (skipped when the table has no mapping), and the Dataset's cohort scopes
  both steps' queries.
- The table chip appears on creation; cells become traceable as they fill; selecting a
  cell does not interrupt population.
- **Stop (explicit user action)** halts table population with no background work; **navigating away does not
  stop it** (it continues server-side and notifies on completion); a re-run skips cells already
  `filled` (idempotent) and preserves reviewed/corrected cells (true pause/resume deferred).
- Interpret cells populate immediately as `not_reviewed`, flip to `reviewed` on
  verification, and gate submit-readiness.
- No value is ever fabricated; empty results become explicit missing states.
- Every table population produces a complete table-population record including the prompt version.
- The agent finds data through the **`navigate`** tools (catalog / search / describe /
  join-paths) — never a whole-schema dump; structure is read live, meaning from `model.json`, the
  join graph derived from it. It is seeded at the Dataset's anchor tables and can still reach the
  rest of the schema (within hospital permissions).
- For a **table**, the `table-fill` agent writes plain SQL and `sql_execute` injects the cohort onto
  every queried table, rejecting any query it cannot bind to the cohort (fail-safe); cross-database
  joins resolve through measured identity bridges. The table's scope is a **hard cohort, pinned for
  life** (scope binds to the table, not the thread).
- An **Answer** runs `chat-answer` (text + inline citations, no cells, no population steps); the thread is
  unscoped, each message resolves its own scope, the answer **discloses what it scoped to**, and the
  user's hospital permissions are the only hard wall.
- *(Deferred — not in v1.)* A **dashboard** populates its underlying table through table population, then a
  fixed reducer computes each indicator from its stored formula; retained design in
  [Dashboard output (deferred)](#dashboard-output-deferred).
