# Run Engine

Read [3-architecture.md](./3-architecture.md), [2-product-flows.md](./2-product-flows.md),
and [4-indexing-and-mapping.md](./4-indexing-and-mapping.md) first. This document
specifies the **runtime**: what happens from the moment the user runs an audit to the
moment the workbook is fully populated and traceable. The precompute (indexing, mapping,
the `executable` block inside `mapping.json`) is done by now; the run's job is to **scope the
cohort to the user's filters, populate the workbook live through the cell store, and record
evidence for every value**. This document carries the run-engine contract; the detailed
design rationale for the orchestrator, the shared cell store, and the three escalating tiers
is archived in [run-population-redesign.md](./0ld/run-population-redesign.md).

Backed by `core/running` (`orchestrator.py`, `try_direct.py`, `try_llm.py`, `try_agent.py`,
`stream_runner.py`) over the cell store (`core/store`). Sections are tagged
**[built] / [partial] / [gap]**.

Authorization for run start/stop/read is governed by
[12-control-plane-database-and-access.md](./12-control-plane-database-and-access.md) and
[contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md):
the caller must have run permissions plus grants to the selected audit/database resources.

---

## Run inputs & resolution

A run is defined by three things, resolved before population:

1. **The audit (template).** Resolved one of three ways (see [2-product-flows.md](./2-product-flows.md)):
   - **Explicit** — chosen via the `+` (upload or select). Already known.
   - **Identified from the prompt** *[gap]* — the user typed "run the cord pH audit"; the
     engine matches that against the indexed audit catalog (`core/catalog.py`
     `load_audit_registry`) and resolves the template. This is a new run-time resolution
     step: natural language → an existing `audit_id`.
   - **Built on confirmation (Flow B)** *[gap]* — no existing template matches; the engine
     builds a template-to-be from the description, but **only after the user confirms**
     (Enter); the hover-preview shows the fields first.
   - **Always confirm the resolved template** *[gap]* — whichever path resolved it, the template
     is shown as an **editable output-spec chip the user confirms before the run starts**; the
     run never auto-starts on a resolved template. *(GAP-2, 2026-06-04 review.)*
2. **The database(s).** The selected set (agent-suggested, user-confirmed). One run may
   span several. *[built — T12: the spine binds the mapping's full database list; Tier 2
   routes each cell to its own database via the Tier-1 attempt's provenance, and a
   multi-database cell with no resolvable provenance escalates to Tier 3, which sees every
   database. Runtime filters compose only into the cohort database's SELECT.]*
3. **The filters.** The inclusion/exclusion criteria present at run time. These are the
   binding constraints and the **only** input that was not precomputed.
4. **Authorization gate.** Before run creation, the API checks: authenticated session,
   role permission (`run.create`), grant to target audit (`audit:run`), and grant to each
   selected database (`database:read`).

---

## Run lifecycle *[partial]*

```
prepare run dir + workbook  ─▶  wait for indexing deps  ─▶  ensure mapping (incl. executable)
   ─▶  resolve cohort + precompute the grid (cell store)  ─▶  run the three tiers
   ─▶  stream cell_update events  ─▶  done
```

`orchestrator.py` (`core/running/orchestrator.py`) waits for indexing, ensures the mapping
(with its `executable` block), resolves the cohort from the user's filters, and **precomputes the grid** —
one `pending` cell per (region × cohort member × field) in the cell store (the `cells` table,
C1) — then drives the three escalating tiers (`try_direct` → `try_llm` → `try_agent`) that
**update those cells in place**. Each write persists to C1 and streams a `cell_update` event;
the cell store is the single source of truth. The detailed mechanism's design rationale is
archived in [run-population-redesign.md](./0ld/run-population-redesign.md); the stop +
streaming contracts are below.

Run-level write operations are scoped: the caller can only stop/read runs they own (or are
admin), and the agent can only mutate runtime rows for
the current run.

### Run status (Queued → Complete)

Each run carries a **primary status** — **Queued → In progress → Blocked / In verification →
Complete** — driven by its cells: **Blocked** if ≥1 `blocked` cell, **In verification** if ≥1
`not_reviewed` interpret cell (and no blocks), **Complete** only when zero blocked **and** all
verification signed off. Status is **dynamic**: re-running auto-resolves cells whose source
data has landed and moves the run out of Blocked with no manual edit. The full lifecycle, the
Kanban dashboard, and blocked-item surfacing live in
[10-status-and-blocked-items.md](./10-status-and-blocked-items.md). Status is
**informational** — it never blocks the download; the user can download a partial audit at any
time (doc 10).

---

## Cell state model

Every cell's persisted **`state`** is exactly one of **four stored states** (enforced by the
store's `CHECK`):

- **`pending`** — created up front by the orchestrator; not yet settled by a tier. The "open
  set" each tier works through (`open_cells()` filters on exactly this).
- **`filled`** — value present, evidence-backed (`sources[]` non-empty, enforced by trigger).
- **`blocked`** — no value; carries `reason_code` + `reason_detail` (doc 10 taxonomy).
- **`not_applicable`** — genuinely N/A; suppressed.

Two rules complete the model:

- **There is no `error` state.** A non-clean tier result leaves the cell `pending` with the
  failure recorded on `attempts[]` / `hypothesis` — what was tried is provenance, not a state.
- **"Needs verification" is a derived view, never a stored state.** A cell needs verification
  when it is `filled` ∧ `kind: interpret` ∧ `review_state: not_reviewed` (plus low-confidence
  cases per [open-questions.md](./open-questions.md) Q10). `review_state`
  (`not_reviewed` → `reviewed`, interpret only) is per-cell metadata (doc 6), independent of
  `state` — so "is there a value" and "is it signed off" never share a state machine. Derived
  counts surface in `review_summary.totals.needs_verification` and drive the run status.

> **Migration (done, T13):** the stored `needs_verification` value is retired — new
> databases bake the four-state `CHECK`, opening a pre-change `state.db` rewrites any
> legacy rows to `filled` + `review_state not_reviewed`, and every derived count
> (`review_summary` totals, run status, milestone counters) computes from the derived view.

---

## Population: the three escalating tiers *[built]*

The orchestrator populates the cell store through **three escalating tiers**; a cell that one
tier cannot resolve cleanly **escalates** to the next. Every write updates the cell **in place**
in C1 and streams a `cell_update`. This section is the binding contract (design rationale
archived in [run-population-redesign.md](./0ld/run-population-redesign.md)).

- **Tier 1 — `try_direct`** (deterministic, no LLM): runs the `executable` block's precomputed
  read-only SQL **in bulk** (one query covers many cells), copies the column, and applies the
  field's **code map**. Clean → `filled`, with the exact SQL captured as the cell's evidence.
  A **non-clean** result — unknown code, query error / schema drift, or an empty value —
  leaves the cell **`pending`** with the failed attempt recorded on `attempts[]`; every
  non-clean result escalates, with no pre-classification of which empties are "worth chasing".
  A missing or mismatched identity join key marks the cell `blocked`
  (`IDENTITY_UNRESOLVED`) — identities are never mixed.
- **Tier 2 — `try_llm`** (one cheap LLM pass per open cell): minimal context — the cell's
  failed `attempts[]` and the field's requirement (type + code set) — answered in **two
  looks**. First look: propose a final audit-coded value or **one** retry query (it may not
  escalate before trying something). The orchestrator runs the retry read-only and appends it
  to `attempts[]`. Second look: propose a value or escalate. ≤2 LLM calls + ≤1 query per
  cell; the LLM **proposes**, the orchestrator runs the SQL — the LLM never holds a DB
  connection. The triage decision (`solution` | `retry` | `escalate`, polymorphic `output`,
  always a `reason`) is frozen in
  [contracts/cell-resolution.schema.json](./contracts/cell-resolution.schema.json); a
  solution's `reason` becomes the cell's `hypothesis`.
- **Tier 3 — `try_agent`** (one opencode `cell-fill` session over **all** still-open cells —
  never one per cell): it gets a lean overview of the open cells (grouped **both ways**: by
  field and by member, pulling a single cell's `attempts[]` on demand), the table/column
  structure only (no allowed-value sets), and cohort-scoped read-only SQL — the cohort
  predicate and run scope are **injected** into every query, never asked for. Seeing the whole
  grid, it reuses a fix along either dimension: a field broken across many members, or one
  member's quirk breaking many fields. The field's audit code set is revealed only at write
  (progressive disclosure). A session-end fallback (run in a `finally`, so a transport error
  cannot strand cells) settles everything it could not solve as `blocked`/`NOT_LOCATED` with
  `attempts[]` as the explanation — the run never ends with `pending` cells.

Inclusion **filters are enforced through the cohort**, not per-tier: B6 resolves the user's
free text to the cohort and the `executable` cohort block scopes every query, so every tier
sees exactly the cohort the user specified — clinical correctness depends on it *(TODO-0003)*.
A cell with no rows yields an explicit `missing` / `unknown` / `not_available`, never a
fabricated value *(TODO-0036)*. When the value is missing because the **source data is absent**,
the cell becomes a **blocked item** carrying a reason code and the owner to chase — see
[10-status-and-blocked-items.md](./10-status-and-blocked-items.md).

### Write-time coding and the off-code guard

**Coding happens at write time, from the audit spec — never re-applied to a higher-tier
value.** Tier 1's code map is the *only* place the precompiled (possibly stale) DB→audit
translation runs; when Tier 2/3 write a cell they pick the audit-coded value themselves from
the field's requirement, shown at write time. A stale binding can therefore never re-break a
value a higher tier already got right.

**Off-code writes are rejected by the store, not by per-tier code.** The field's code set is
canonical in `spec.json` and never stored on the cell; at run start it is materialised into
the store's run-scoped `field_codes` table, and a **DB trigger rejects any off-code write** —
the same guarantee for every tier and for the agent's raw SQL. A rejection leaves the cell
`pending` with the rejection recorded on `attempts[]`, and the orchestrator re-escalates; a
cell that ends the run with no legal value is settled `blocked`/`NOT_LOCATED`. *(Off-code
rejection does **not** use `DATA_CONFLICT` — that reason code keeps its doc-10 meaning:
conflicting values across sources needing human resolution.)*

### The cell resolution contract

Every tier writes the **same cell object** (frozen in
[contracts/cell-resolution.schema.json](./contracts/cell-resolution.schema.json), extending
the per-cell metadata of doc 6). Beyond that metadata:

- **`resolved_by`** — `direct` | `LLM` | `agent`: which tier produced the terminal value.
- **`hypothesis`** — the current best explanation of *why the direct pass failed*; `null` on
  a clean hit; written by the first LLM to see the failure (Tier 1 is dumb and records only
  the raw error).
- **`attempts[]`** — the log of **actual DB queries** (each carrying `tier`, `sql`, the
  `table_column` read, and on failure the offending `value` + `error`) plus write-time
  rejections. LLM reasoning over already-fetched rows is a resolution, not an attempt.
  Later tiers and the front-end read provenance **off the attempt fields, never by re-parsing
  SQL**.

### The reconciler *[deferred — post-spine]*

A systemic break (the DB renames `Male`→`M`, or a column moves) should fix the **binding** so
the next run's Tier 1 just works. The binding is **never mutated mid-run** — a run uses the
binding it started with, so the previewed cohort equals the populated cohort. After the run,
the reconciler reads the cells themselves (`attempts[]` + `sources` + `hypothesis` — the cells
*are* the backlog; no parallel fix object), pattern-matches systemic fixes per field, and
regenerates `mapping.json` (match, executable, code maps). Auto-apply is gated: a regenerated
binding lands only if it validates against its schema **and** passes a dry-run on the records
that previously succeeded.

---

## Filter resolution and the cohort count

> **Revised 2026-06-05 (task P1) — menu-selection over a prelinked criteria surface,
> structured-only.** The run-time resolver (revised **B6**) **matches** the user's free-text to
> the audit's **prelinked criteria menu** — the cohort-criteria section the **mapping** step
> produced (task A6.1, [doc 4 §Phase 2](./4-indexing-and-mapping.md#the-cohort-criteria-surface--filterable-inclusion-criteria)) — and concept-links values; it **selects a dimension and fills its
> parameterised condition**, it does not author SQL against the raw schema. **v1 is
> structured-only:** a criterion expressible only from free-text notes is deferred (P1), not
> faked. **Path 1** (no user criteria) applies the audit's canonical default cohort with zero
> resolution. The `executable`-block reshape is task **A7**; the cohort-compose step (ANDing the
> resolved conditions into the cohort block) is task **B7**. The guard, the count, the
> one-resolution-two-consumers rule, and unresolved-not-dropped below are unchanged.

Population (above) **scopes every query to the cohort** — the `executable` cohort block ANDs
in the resolved inclusion conditions. The criteria, though, reach the system as the user's
**free-text** — they must first be turned into chips the user can edit **and** query conditions
the database can apply. That **resolution** step, and the **cohort count** the preview depends
on, are owned here (task B6) as the input-time sibling of population. The full output contract
is specified in
[2-product-flows.md §Filter resolution and the cohort-count preview](./2-product-flows.md#filter-resolution-and-the-cohort-count-preview);
the run-engine essentials:

- **One extraction call → a typed list.** A single call over the user's free-text emits a
  **list** of typed spec items (inclusion criteria *and* the output spec — not a call per item).
  Each `inclusion` item carries a **chip** (`label` + an editable `display` phrase) **and** the
  **SQL condition** it ANDs onto the cohort SELECT (`sql` + `:named` `params`); `output` items
  carry no cohort filter. An inclusion criterion is just a WHERE clause on a read query.
- **The model writes the SQL, but only a read-only filter runs.** The **composed** query (base
  SELECT + ANDed conditions) is checked by the existing validator
  (`agent/.opencode/tools/_sql_validate.py` `validate_sql` — `sqlglot`, `SELECT`/`UNION` only,
  no writes/DDL/PRAGMA) and run on a **read-only connection** (`PRAGMA query_only` + authorizer).
  Reuse that guard rather than trust the model; a condition that fails it is treated as unresolved.
- **Grounded in the prelinked criteria menu** *(2026-06-05)*. The resolution call is given the
  audit's **cohort-criteria menu** (A6.1, from mapping) — each allowable dimension already bound to
  a real `table.column` with its join path, type, and allowed values/range — **not** the raw
  `model.json`. It may reference **only a menu dimension**; its job is to **match intent → an
  allowed dimension + value** (e.g. "older than 5 years" → the `birthdate` dimension's
  `birthdate <= date(:as_of, '-5 years')`). It must not invent columns; a criterion no menu
  dimension supports is **"not available for this audit"**, and an ambiguous one is **unresolved**.
- **One resolution, two consumers.** Produced **once** and used by both the
  **["N patients matched" preview](./2-product-flows.md#filter-resolution-and-the-cohort-count-preview)**
  (a read-only `COUNT(DISTINCT <identity>)` with every condition ANDed in) **and** the **run**
  (the orchestrator ANDs the same conditions into the `executable` cohort block, which scopes
  every tier's queries). The run never re-resolves — the previewed cohort equals the populated cohort.
- **Unresolved criteria are surfaced, not dropped.** A criterion the LLM cannot express as a
  valid read-only condition is reported as unresolved (excluded from the count with a reason),
  never silently ignored — clinical correctness depends on the cohort being exactly as specified.

### The reshaped `executable` block (the concrete shape B6 carries — nested in `mapping.json`, not a separate file)

*B6 carries this reshape itself; it is spelled out here so the builder does not have to
reverse-engineer it.* The `executable` block precomputes the per-cell **skeleton** + an explicit
**cohort selection** the run-time conditions AND into:

```jsonc
{
  "schema_version": "2",
  "audit_id": "cord-ph", "workbook": "workbook.xlsx",
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
  conditions ANDed into `cohort.where`. The **run** restricts every region to those identities.
- The orchestrator gains a small composition step at run start: take the cohort selection, AND in
  the validated conditions, and scope `try_direct`'s region queries to it. **Owned by B6.**

### The resolution input — the audit's prelinked criteria menu *(revised 2026-06-05)*

So the resolution call sees only **what this audit can be filtered on**, not the full
`model.json`, it is given the audit's **cohort-criteria menu** — the section the **mapping**
step produced (task **A6.1**, [doc 4 §Phase 2](./4-indexing-and-mapping.md#the-cohort-criteria-surface--filterable-inclusion-criteria)), already pre-linked to real `table.column`s. **B6 reads
it; A6.1 (at mapping) builds it.** *(The filter surface is a property of the audit, not the
database.)* Per allowable dimension: `database -> table.column`, a one-line meaning, a `type`,
the join path + grain, and the **grounding the LLM needs to pick real values** —

- low-cardinality `category`/`code` columns: the **allowed values** (read-only `SELECT DISTINCT`,
  bounded; code→meaning for coded sets) — so "caesarean" → the real `delivery` value, "male" →
  the stored code;
- `date`/`number` columns: type + min–max range (so "older than 5 years" maps to `birthdate`);
- free-text / identifier columns: marked **not filterable**, never enumerated.

```jsonc
{ "database": "cord-ph", "table_column": "patients.birthdate", "type": "date",
  "means": "patient date of birth", "range": "1998–2025" }
{ "database": "cord-ph", "table_column": "cord_ph_birth_records.delivery", "type": "category",
  "means": "mode of delivery", "values": ["SVD","Forceps","Caesarean","Ventouse"] }
```

---

## Streaming the run (v2 strict)

The run's progress streams to the front end over SSE as one user-facing timeline. The
runtime stream contract is strict v2: only the event names and payload shapes below are valid.
No legacy aliases, fallback fields, or mixed shapes are supported.
Run SSE uses message-only framing: each message carries JSON on `data:`, and the canonical
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
- `refresh_summary`: exactly once on **refresh executions only** (doc 11), after
  `review_summary` and before `done`; never emitted on an initial run.
- `done`: exactly once on successful completion.
- `error`: terminal failure event; when emitted, no `review_summary` or `done` follows.

| event | payload | UI effect |
| --- | --- | --- |
| `activity` | `{ headline, detail?, name?, status? }` — `headline` is required, non-empty | append to the activity feed; `headline` (one short line) drives the collapsed status |
| `workbook_created` | `{ label, sheets, cellMetadata: {} }` | set the active workbook (structured, body empty), **emit the file chip now** |
| `cell_update` | `{ sheet, cells: [{ ref, value, meta }] }` | write the value(s), attach metadata, flash the filled cell(s) |
| `review_summary` | `{ totals, blocking, verification }` | the reviewer-focused terminal summary — rendered as the **final entry in the agent-activity feed** (doc 11) |
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
  user who has scrolled up to read. *(TODO-0023, shipped in the demo — preserve.)*

---

## Live population *[partial]*

- The **workbook chip is emitted on `workbook_created`** (seconds in), not on `done`. The
  workbook starts structured (headers/regions present) and body-empty.
- Cells fill progressively via `cell_update` — sometimes a whole region at once (one
  direct query), sometimes single interpret cells.
- A cell is **clickable/traceable the moment it has a value + metadata**, while the rest of
  the sheet is still filling. Selecting a cell must **not** interrupt population.

---

## Stop + re-run (MVP); pause/resume deferred *[partial]*

The run is a long-lived server-side job; the UI is a view onto it.

- **Stop** ends the run via server-side task cancellation (`stream_runner`). Work already written
  persists in the run record.
- **Re-run** is the recovery and refresh path: it re-issues the run, skipping cells already
  `filled` and **never overwriting `reviewed`/`corrected` cells** (GAP-1). Tier execution over
  the cell store is idempotent, so re-running is safe.
- **True pause/resume and leave-and-return are deferred to the 100-day vision**
  ([vision-100-days.md](./vision-100-days.md)): mid-session OpenCode pause/resume is unproven and
  would spend an innovation token (eng review A1, 2026-06-04). The MVP ships stop + re-run.

**Acceptance (stop + re-run):** Stop halts the run with no background work; a re-run skips cells
already `filled` (idempotent) and preserves any reviewed/corrected cells.

Terminology guardrail: this `re-run` path creates a new run record, while `refresh`
(`Check for updates`) is an in-place execution under the same `run_id` (doc 11).

The upstream policy for **when** refresh is recommended (before the user presses refresh) is
specified in [11-refresh-detection-and-incremental-refresh.md](./11-refresh-detection-and-incremental-refresh.md).
That same spec also fixes refresh mechanics that must stay deterministic:
blocked cells reopen `blocked -> pending` on refresh start, and member row placement is
append-only (no row repacking).

---

## The interpretive gate at run time *[built]*
*(CEO decision D1.)*

- The orchestrator **populates everything immediately**, interpret cells included, so the user
  can start reviewing at once.
- Each interpret cell is emitted with a **review state** in its metadata:
  **`not_reviewed`** (default after population) → **`reviewed`** (set **automatically** once
  the user opens the cell and looks at it for ~2s — no confirm button; see
  [6-traceability-evidence.md](./6-traceability-evidence.md)).
- An interpret value **does not count toward COMPLETE** until `reviewed`. The run is not
  **Complete** while any interpret cell is `not_reviewed` **or any cell is `blocked`**. This is
  a **status, not a download gate** — a partial audit is downloadable at any time
  ([10-status-and-blocked-items.md](./10-status-and-blocked-items.md)).
- Every cell carries a **confidence** (the word `low` / `medium` / `high`) and **kind**
  (direct / interpret) so the workbook can render the trust heat-map (E2; mechanics in doc 6).

### The accuracy bar
The "accuracy bar" the gate enforces, defined concretely:
- **Per run:** the run reaches **COMPLETE** only when every interpret cell is reviewed and zero
  cells are blocked. The UI shows how many of each remain (e.g. "6 cells need review · 3
  blocked"). This is a status, not a download gate (doc 10).
- **Tracked over time:** record, per interpret cell, whether the user **left it unchanged**
  (`corrected = false`, confirmed) or **edited it** (`corrected = true`). The rolling
  **not-edited rate** is the measurable interpretive accuracy, and it is exactly the signal
  the 100-day self-improvement loop consumes (see [vision-100-days.md](./vision-100-days.md)).

---

## The run record *[partial]*

Every run is logged for traceability and for improving prompts. The record captures the
request, the resolved template + databases, the filters, the tiers' reasoning/tool calls,
the run parameters, the **prompt version**, the user's per-cell verifications / corrections,
and the run's **status** plus any **blocked items** (reason code + owner). Specified in
[7-auth-and-audit-log.md](./7-auth-and-audit-log.md). *(Relates to TODO-0005.)*

---

## Acceptance (run engine)

- A run can be started by naming the audit in the prompt; the engine resolves it to an
  existing template.
- The orchestrator precomputes the grid into the cell store, then escalates `try_direct` →
  `try_llm` → `try_agent`, updating cells in place; Tier 1 runs the `executable` block's read-only SQL
  in bulk and applies the code map, and the cohort block scopes every tier's queries.
- The workbook chip appears on creation; cells become traceable as they fill; selecting a
  cell does not interrupt population.
- Stop halts the run with no background work; a re-run skips cells already `filled`
  (idempotent) and preserves reviewed/corrected cells (pause/resume + leave-return deferred, A1).
- Interpret cells populate immediately as `not_reviewed`, flip to `reviewed` on
  verification, and gate submit-readiness.
- No value is ever fabricated; empty results become explicit missing states.
- Every run produces a complete run record including the prompt version.
