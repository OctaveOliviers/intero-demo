# Run-time population redesign — the cell-resolution ladder

> **Status: design, 2026-06-05.** Supersedes the implicit "direct = always works" assumption in
> [4-indexing-and-mapping.md §Phase 3](./4-indexing-and-mapping.md) and
> [5-run-engine.md §Filter injection](./5-run-engine.md). Freezes the contract in
> [contracts/cell-resolution.schema.json](./contracts/cell-resolution.schema.json). Reshapes
> tasks A3/A4/A7 and adds S1/A8/A9/A10/A11 (see §12).

## 1. Why

Population today assumes a field is statically `direct` (copy a column) or `interpret` (read
evidence, decide). The precompiled `populate.json` + `try_direct` (Tier 1, A3/A4) run the direct copy
fast and read-only. That is correct and worth keeping — **no generated SQL ever runs at population
time** (decision A2). But pure precompute is brittle for three reasons, all rooted in *having no
intelligence in the loop when reality drifts from the binding*:

1. **Code drift.** The audit wants `1`/`2` for sex; the DB stores `M`/`F`. A frozen code map fixes
   that, until the DB changes `M` to `m`, or `Male` to `M`, or renames `delivery` to
   `mode_of_delivery`. The deterministic pass then silently produces blanks or wrong values.
2. **Per-record location.** A value is not always where the binding says. `delivery` may be a
   column for 90% of patients and only in a clinical note for the other 10%. A binding that
   hard-codes "always `cord_ph_birth_records.delivery`" never looks at the note and loses the data.
3. **Run-time filters.** The user's inclusion criteria must be enforced exactly on the cohort.
   (Owned by the cohort block + B6; unchanged here, see [5-run-engine.md](./5-run-engine.md).)

A design that promises "everything precomputed, no agent at run time" is *meant to fail* on (1) and
(2). The fix is not to abandon precompute. It is to make resolution a **ladder**: do the cheap
deterministic thing first, and spend intelligence only on the residual.

## 2. The model — one cell store, three tiers

The run uses **one cell store** = the run's `cells` table in C1
([state-schema.md](./contracts/state-schema.md)). Every cell is **created up front** with its
position (`sheet`/`ref`), audit field, and cohort member already set — the shape comes from
`populate.json` + the resolved cohort. The tiers then **update cells in place**; they never return or
copy cells. Each write persists (C1) and streams a `cell_update`
([runtime-shapes §1](./contracts/runtime-shapes.md)) — so the store is the single source of truth
*and* the live feed, and a later tier can be handed a lean **overview of what is still open** keyed
by field and by member, instead of a context dump.

The same job — give a cell its value — is attempted at rising intelligence; a tier only acts on cells
the previous one left open:

| Tier | `resolved_by` | Where | What it does |
| --- | --- | --- | --- |
| 1 `try_direct` | `direct` | our process | deterministic, in bulk: copy the column, apply the field's code map |
| 2 `try_llm` | `LLM` | our process | one cheap pass per open cell: propose a value, or one retry query, else escalate |
| 3 `try_agent` | `agent` | opencode subprocess | one session over ALL still-open cells: investigate, write them in place |

```
run(plan, cohort):
  # Precompute the grid — populate.json + cohort give us every cell up front.
  for each region in plan, for each cohort member, for each cell_map entry:
      create one PENDING cell in C1 with {sheet, ref, field, member}      # position and ownership set

  # Tier 1 — direct, in bulk
  for each region query: run it once read-only; for each result row × mapped column,
      UPDATE the pending cell in place -> FILLED, or ERROR (value NULL / not in code map / query failed)
      (a cell whose identity returns no row stays PENDING -> later becomes IDENTITY_UNRESOLVED)

  # Tier 2 — one cheap LLM pass per error cell
  for each ERROR cell:
      show the LLM the cell -> it proposes a value  OR  one retry query     # may not escalate yet
      if retry: run that read-only query, show the rows -> it proposes a value  OR  escalates
      a proposed value -> write the cell in place;  escalate -> leave it OPEN

  # Tier 3 — one agent over everything still open
  if any OPEN cells remain:
      run ONE agent (cell-fill skill) given: an overview of the open cells (grouped by field and by
      member), the table/column structure, read-only SQL, and tools to read one open cell + write a cell.
      it investigates, reuses a fix across a field or across a member, and writes open cells in place.

  mark the run complete
```

(The cell shape lives in §7; the LLM `decision` in §8. The reconciler reads the cells directly — §9 —
so there is no separate fill_rule object.)

**Coding happens at write-time, from the audit spec — never re-applied to a higher-tier value.**
Tier 1's code map is the *only* place the precompiled (possibly stale) translation runs. When the LLM
or agent writes a cell it picks the audit-coded value itself from the field's requirement (the code
set), shown to it at write-time. So a stale binding map can never re-break a value a higher tier
already got right (the `male`-vs-`m` case). The binding is corrected later, by the reconciler (§9).

**`write_cell` enforces the code set — the field requirement is checked, not just presented.**
The field requirement is shown to Tier 2/3 at write-time; it is also enforced on write. For any cell
whose field has a code requirement (`permitted_values` in `audit.json` and/or `code` in
`mapping.json`), the value passed to `write_cell` MUST equal one of the codes. An off-code write is
rejected at the tool boundary: the cell stays `pending` and the rejection is appended to `attempts[]`
as `{ tier, sql: "<no query — write-time validation>", error: "value <X> not in field <F>'s code
set" }` (the synthetic `sql` keeps the §7 schema unchanged — see runtime-shapes §2). The
orchestrator then re-escalates: a Tier-2 rejection lands the cell in Tier 3; a second rejection
inside Tier 3 (within budget) terminalizes it as `blocked` with `reason_code: DATA_CONFLICT`.
Without this guard, an LLM/agent writing `"Female"` instead of `"2"` would land `filled` with a bad
value and silently break the "zero `pending` at run end" invariant.

## 3. What triggers escalation (Tier 1 → Tier 2)

Any **non-clean** direct-pass outcome escalates to Tier 2. Three cases, treated the same:

- **Unknown code** — a value came back but is not in the frozen code map (`m` when the map keys `M`).
- **Query error / no columns** — the SQL failed (column renamed, table moved). Schema drift.
- **Empty value (NULL)** — the column exists but is blank for this record.

A fourth case escalates **within** the intelligence tiers, not from Tier 1:

- **Off-code write (Tier 2/3 only)** — the LLM/agent proposed a value not in the field's
  `permitted_values` / `code`. Treated the same as an unknown code from Tier 1: `write_cell`
  rejects (the cell stays `pending`, the rejection is appended to `attempts[]`), and the
  orchestrator re-escalates to the next tier; a Tier-3 rejection on a second attempt within budget
  terminalizes the cell as `blocked` with `reason_code: DATA_CONFLICT`.

We deliberately do **not** pre-classify which empties are "worth chasing" — there is no
`notes_fallback` flag at mapping, no per-field config. Every empty escalates, and the Tier-2 LLM
decides for itself whether to read the notes, pull the whole patient record, or give up. A lean
binding beats guessing at mapping time.

A clean direct hit (value present, code maps) never escalates and never calls an LLM.

## 4. Tier 2 — one cheap LLM pass per open cell

Tier 2 looks at a single error cell with minimal context — its failed attempt(s) and the field's
requirement (type + code set) — and answers in **two looks** (the `decision` shape is §8):

- **First look:** propose a final value, or **one** retry query. It may **not** escalate yet — it has
  not tried anything.
- The orchestrator runs the retry read-only (`run_readonly_sql`, §2), appends it to the cell's
  `attempts`, and shows the rows back. **Second look:** propose a final value, or escalate.

A proposed value is the final, **audit-coded** value (the LLM picks the code from the requirement);
the orchestrator **writes it to the cell in place**. Escalate leaves the cell open for Tier 3. The
retry is a fresh ad-hoc query — **not** a re-call of `try_direct`; `try_llm` never holds a DB
connection (it proposes; the orchestrator runs the query). One open cell at a time, ≤2 LLM calls and
≤1 query each.

## 5. Tier 3 — one agent over all the open cells

After Tier 2, everything still **open** goes to a **single** agent session — not one per cell. The
agent is the existing opencode plane; `core/running/try_agent.py` is a thin bridge that starts the
session and waits. The agent works against the cell store through tools and **writes cells in place**;
it is never handed a context dump.

What it is given — lean, and progressively:

- **An overview of the open cells**, structured **both ways** so it can see the patterns: per field
  (this field is open for these members) and per member (this member is open for these fields). It
  pulls a single cell's detail (its failed `attempts`) on demand, rather than getting them all inline.
- **The table/column structure only** — table names + column meanings, *not* the full `database.json`
  (no allowed-value sets, no ranges). Enough to find where a value lives.
- **Read-only SQL**, cohort-scoped: the cohort predicate is always ANDed in, so it may compare cohort
  members but **never reach outside the cohort**.
- **A write tool.** Writing a cell is the moment the field's audit requirement (the code set) is
  revealed, so the agent stores the correctly-coded value. (Progressive disclosure: structure to
  investigate, audit codes only to write.) `write_cell` **validates the value against the field's
  code set on write**; an off-code value is rejected — the cell stays `pending` and the rejection
  is appended to `attempts[]` (see §2 and the off-code escalation bullet in §3).

Because it sees the whole grid it reuses a fix along **either** dimension: a field broken across many
members → find it once, write all those cells; a member broken across many fields → fix that member's
quirk once, write all of them. A cell it cannot solve it writes `blocked` with a reason. It works
under a budget cap, then stops. The reconciler (§9) later derives systemic fixes by reading the cells
themselves — no separate "fix" object is logged.

**Tools + the policy change.** The agent's tools: the existing read-only `sql`
(`agent/.opencode/tools/sql.py` → `_sql_runtime.py`, DB symlink) + a **lean schema view**, and **two
new run-state tools** over C1 — `open_cells` (the overview + one-cell detail) and `write_cell`
(fill/block in place, applying the audit code at write **and rejecting off-code writes** per §2).
AGENTS.md says the run agent *works only from
the Field Mapping*; the cell-fill skill (`agent/workflows/cell-fill.md`) is a **separate, sandboxed
capability** that gets read-only SQL + the schema structure + run-state read/write, with a **mandatory
cohort predicate** on every query. Make this explicit in AGENTS.md and `agent/opencode.json`; the bulk
run agent's allow-list is unchanged.

## 6. The cell store, events, and data flow

There is **no per-field coordination, no leader/listener, no domino**: every tier just writes the
shared store, and Tier 3 sees the whole open set at once and reuses fixes itself. The store is
**C1's `cells` table** ([state-schema.md](./contracts/state-schema.md)).

**Schema extension for the store (W0.2).** The cells table today has `ref` (`<Sheet>!<A1>`) plus the
§7 metadata, but lacks the two fields the agent needs to pivot the open set. Add to W0.2:

- **`field`** — the audit field id (matches `audit.json`'s `field.number`/`id`). Lets the agent and the
  FE group "open cells for field X" without parsing `ref`.
- **`member`** — the cohort member identity (the patient/encounter code). Lets the agent group
  "open cells for member Y" and lets a Tier-2 retry / Tier-3 query bind by member without re-parsing
  `sources`. Also already present implicitly in `sources[].record_id`; promoting it makes the pivot
  cheap and is what makes the precompute step (§2) trivially addressable.

Cells are inserted **`pending`** at run start (one per region × cohort member × cell_map entry); each
tier overwrites in place. A write does two things — persist (C1) and stream a `cell_update` event —
so the store is the single source of truth and the live feed. Tier 3 reads/writes through the
`open_cells` / `write_cell` tools (§5), never via copies.

### Events — the write path is the only emitter

| Moment | Persist (C1) | Stream (SSE) |
| --- | --- | --- |
| workbook ready | — | `workbook_created` |
| pending cells inserted | `pending` rows | — |
| any cell write (filled / error / blocked) | the cell row | `cell_update` |
| Tier 1 done | — | `activity` "Filled N; M open" |
| Tier 2 / Tier 3 progress | append the cell's `attempts` | `activity` (short status line) |
| run end | run = complete | `done` |
| fatal | run = error | `error` |

### Data flow & ownership

| Data | Lives in | Written by | Read by |
| --- | --- | --- | --- |
| the cells | the store (C1) | the orchestrator (pending) + Tier 1/2/3 (in place) | the FE (stream); Tier 3 (overview); traceability (D5); reconciler (§9) |
| a cell's `attempts[]` / `sources` / `evidence` / `hypothesis` | the cell | the tier that produced it | Tier 2 / Tier 3 context; traceability; reconciler |
| events | — | the cell-write path | the FE |

### What we reuse
`run_readonly_sql` (the one read-only primitive) · the cells table (C1) + SSE contract
([runtime-shapes §1](./contracts/runtime-shapes.md)) · `OpenCodeClient` (the Tier-3 bridge) · the
backlog + reconciler (A10).

### What we reuse
`run_readonly_sql` (the one read-only primitive) · `try_direct` (the Tier-1 mechanic) · the SSE
contract + cells table (C1, unchanged) · `OpenCodeClient` (the Tier-3 bridge) · the backlog +
reconciler (A10).

## 7. The unified cell contract

Every tier emits the **same object**, and it is the same object passed up the escalation chain
(accumulating `attempts[]`). It **extends** the existing per-cell metadata
([runtime-shapes.md §2](./contracts/runtime-shapes.md)) — it does not replace it. The frozen schema
is [contracts/cell-resolution.schema.json](./contracts/cell-resolution.schema.json).

New fields beyond runtime-shapes §2:

- **`resolved_by`** — `direct` | `LLM` | `agent`. Which tier produced the terminal result. Audit/telemetry.
- **`hypothesis`** — free text, the current best explanation for *why the direct pass failed*. `null`
  on a clean direct hit. **Written by the first LLM to see the failure** (the direct tier is dumb and
  records only the raw `error`).
- **`attempts[]`** — the log of **actual DB queries only**, each `{ tier, sql, result, error }`. A
  clean direct hit is one entry with no error. A new entry is appended only when a query is really
  run (a triage retry, an agent query) — LLM reasoning over already-fetched data is a resolution, not
  an attempt.

Statuses reuse the existing `state` enum; "unknown" is **not** a new top-level status — it is a
`blocked` cell with a new `reason_code`:

- **`filled`** — value present (`resolved_by` says by whom). Carries `sources[]` (db, query,
  table_column, record_id), and for interpreted values the verbatim `evidence[]` passage(s).
- **`blocked` + `MISSING_SOURCE_RECORD`** (or other existing codes) — the location is known, the data
  is genuinely absent. `reason_detail` = what is missing and where it was expected.
- **`blocked` + `NOT_LOCATED`** (NEW reason code) — the agent searched and could not find the value
  anywhere in the cohort. `attempts[]` *is* the explanation; `reason_detail` summarizes what was tried.

**Evidence re-extractability (rechecked).** `sources[].{database, query, table_column, record_id}` is
enough to re-extract a **direct copy from a one-row-per-identity table**. It is **not** enough for a
value drawn from a **one-to-many** table (a patient has many notes) or one that was **interpreted**:
there we also need the evidence row's own primary key (**`row_id`**, NEW on a source entry) and the
verbatim **`evidence[]`** passage. The schema makes `row_id`/`evidence` required exactly in those
cases.

## 8. The triage decision contract

The triage LLM's per-step output (before a terminal cell is produced):

```jsonc
{ "decision": "solution" | "retry" | "escalate",
  "output":   "2"  |  "SELECT text FROM clinical_notes WHERE patient = :id"  |  null,
  "reason":   "DB stores the meaning text, not the code; 'Emergency caesarean' = 2" }
```

One polymorphic `output` disambiguated by `decision`: the cell value (`solution`), the next SQL
(`retry`), or `null` (`escalate`). `reason` is always present — for `solution` it becomes the cell's
`hypothesis`; for `retry` it states why the query should work; for `escalate` it is a short note (the
agent gets `attempts[]` regardless). Frozen in
[cell-resolution.schema.json](./contracts/cell-resolution.schema.json).

## 9. Deferred auto-apply — the reconciler reads the cells

A systemic break (DB renamed `Male`→`M`, or `delivery`→`mode_of_delivery`) should fix the *precompiled
binding* so the next run's direct pass just works and never re-escalates. Rules:

- **Never mutate the binding mid-run.** The run uses the binding it started with — so the previewed
  cohort equals the populated cohort and the run stays deterministic. A run only ever changes *this
  run's cell values* (written in place by the tiers), with full provenance.
- **No separate backlog object — the cells *are* the backlog.** Every Tier-2/Tier-3 resolution leaves
  full provenance on the cell: `attempts[0]` is the failed Tier-1 query, `sources`/`evidence` is the
  successful resolution, `hypothesis` is the diagnosis. The reconciler groups cells by `field` and
  pattern-matches: if many cells of field F converged on the same alternative column / value→code
  mapping / interpretation, that's a generalisable fix. No parallel `fill_rule` object to keep in
  sync with the cells.
- **Reconcile after the run / nightly.** The reconciler reads the cells and **auto-applies** fixes
  by regenerating `mapping.json` / `populate.json` / the code maps. Auto-apply is acceptable *because*
  those artifacts are fully auto-generated and regenerable (the regenerable-vs-state line —
  `audit.json` user state is never auto-touched, §6 of
  [mapping-artifact-redesign.md](./mapping-artifact-redesign.md)).
- **Guard the auto-apply.** A regenerated binding is committed only if it (a) validates against its S0
  schema and (b) passes a dry-run on the records that previously succeeded. Auto, but not reckless.
  D9 (the library review surface) can still inspect what changed.

## 10. Worked cord-pH examples

1. **Clean hit.** `gestation_weeks` = `39` in `cord_ph_birth_records`, no code map. Tier 1 writes it
   `filled` (`resolved_by: direct`, one no-error attempt). No LLM.
2. **Code drift across a field.** `delivery` holds the text `"Emergency caesarean"`; the code map keys
   on audit codes, so Tier 1 writes every `delivery` cell `error`. Tier 2 codes each cheaply
   (sees the raw text + the requirement → writes `"2"`); whichever escalate land in Tier 3, where the
   agent sees *"`delivery` open for these members"*, fixes the value→code mapping once and writes them
   all in place. Backlog: regenerate the `delivery` code map so next run's Tier 1 just works.
3. **Empty value, found in notes (per cell).** `liquor_meconium` is NULL → Tier 1 `error`. Tier 2's
   first look retries `SELECT text FROM clinical_notes WHERE patient = :id`; the second look reads
   "thick meconium-stained liquor" and writes the coded value in place — `resolved_by: LLM`,
   `evidence` = the verbatim passage, source `row_id` = the note's PK.
4. **A member broken across many fields.** Patient P's record is stored oddly (numbers held as text),
   so several of P's fields error and Tier 2 escalates them. In Tier 3 the agent sees *"member P open
   for fields B, U, AM"*, investigates P once, finds the quirk, and writes all of P's open cells in
   place — one investigation, many cells. (The cross-dimension win: per-cell tiers can't see this.)
5. **Per-member unsolvability.** `cord_arterial_ph` is open for members A and B. In the one agent
   session: A has nothing in any table or note → written `blocked` (`MISSING_SOURCE_RECORD`, owner:
   lab, `attempts[]` shows what was tried); B's value is in a note → written `filled`. Same field,
   different outcomes, one session.

## 11. What this changes in the existing artifacts

- **mapping.json** — unchanged by this redesign (no `notes_fallback`; the lean binding stays).
- **populate.json** — stays the **compiled, deterministic Tier-1 plan** (no LLM in the builder; it is
  a projection of mapping.json). The v2 cohort block (A7) is unchanged.
- **runtime-shapes.md §2** — updated to defer to `cell-resolution.schema.json` and to add
  `resolved_by` / `hypothesis` / `attempts[]`, source `row_id`, and the `NOT_LOCATED` reason code.
- **`try_direct` (A4, renames `executor.py` → `try_direct.py`)** — instead of returning cells it
  **writes them to the store**; a non-clean cell is left `error` for Tier 2, not silently blocked.
- **The cell store (C1)** — gains two run-state read/write tools for opencode (`open_cells`,
  `write_cell`, §5) so the agent works the store in place rather than via copies.
- **AGENTS.md + agent/opencode.json** — add the sandboxed cell-fill capability (read-only SQL + the
  lean schema view + run-state read/write, mandatory cohort predicate); distinct from the bulk run
  agent. Add the cell-fill skill.

## 12. Task restructuring

Amend the existing Lane A cards and add five:

| Task | Change |
| --- | --- |
| **A3** | Keep: compile `populate.json` (deterministic Tier-1 plan, no LLM in builder). |
| **A4** | **`try_direct`** (Tier 1; renames `executor.py` → `try_direct.py`) + the shared `run_readonly_sql` (`core/running/sql.py`); runs the bulk pass, **writes each cell to the store** (filled or error), per-cell narrowed query. |
| **A7** | Unchanged (v2 cohort block). |
| **S1 (new)** | Freeze `cell-resolution.schema.json` (cell + triage decision); extend **W0.2 cells** with `field` + `member`; update `runtime-shapes.md §2` to defer to the schema. No mapping change. |
| **A8 (new)** | **`try_llm`** (Tier 2, `core/running/try_llm.py`) — per open cell, two looks (propose/retry, then propose/escalate); writes the cell in place; the orchestrator runs its one retry via `run_readonly_sql`. |
| **A9 (new)** | **`try_agent`** (Tier 3, `core/running/try_agent.py` bridge + `agent/workflows/cell-fill.md`) — **one** session over ALL open cells; tools `open_cells` + `write_cell` over the store, lean schema view, cohort-scoped read-only SQL; writes cells in place; audit codes revealed at write; allow-list + AGENTS.md change. |
| **A11 (new)** | **Orchestrator** — owns the cell store + the run: Tier 1 bulk → Tier 2 over each error cell → Tier 3 over all that remain open. No domino/coordination (tiers write the store; Tier 3 reuses fixes itself). Persist + stream on every write. |
| **A10 (new)** | **Reconciler** — reads the run's cells (`attempts` + `sources`/`evidence` + `hypothesis`), pattern-matches systemic fixes per field, regenerates the binding; deferred, schema-validated, dry-run-gated auto-apply. |

Dependency order:

```
A3 (compile) ─> A4 (try_direct + store writes) ─> A8 (try_llm) ─> A9 (try_agent + cell-fill skill)
S1 (contract + store) feeds A4/A8/A9
A8, A9 ─────────────> A11 (orchestrator: store + the 3-tier run) ─> A10 (backlog/reconciler)
```

## 13. Out of scope

- Free-text **cohort filtering** at input time (still structured-only, P1; the `not_expressible`
  block in mapping.json already records it).
- Pause/resume of a run (vision; doc 5).
- The runtime filter resolver (B6) and cohort compose step (B7) — referenced, not redefined here.
- Multi-database direct fields reachable only by a non-identity join (mapping has no per-field join
  path today; add only when an audit needs it).

## 14. Acceptance criteria

1. `cell-resolution.schema.json` validates the cell object (with `resolved_by`, `hypothesis`,
   `attempts[]`, source `row_id`, `NOT_LOCATED`, plus `field` and `member`) and the triage decision.
2. A clean direct hit produces `resolved_by: direct`, `hypothesis: null`, one no-error attempt, no LLM.
3. Every non-clean direct result (unknown code, query error, empty value) escalates — no pre-flagging.
4. A code-drift miss is solved at Tier 2 with one direct attempt, `resolved_by: LLM`, hypothesis set.
5. The agent's SQL always carries the cohort predicate and cannot return a row outside the
   cohort; it can read other cohort patients' DB rows and workbook cells.
6. Every tier writes cells **in place** in the store (it never returns/copies cells); each write
   persists (C1) and streams a `cell_update`.
7. A cell no tier can solve is written `blocked` — **blank value** + reason; it never blocks another
   cell (unsolvability is per-member: A may lack a note B has).
8. Tier 3 is **one** agent session over all open cells, given the open-cell overview (by field and by
   member) + the lean schema (no allowed-value sets); audit codes are revealed only at write; it
   reuses a fix across a field or a member by writing those cells in place.
9. The binding is never mutated mid-run; the reconciler later reads the cells, derives systemic fixes from their `attempts`/`sources`/`hypothesis`, and applies a regenerated binding only when it validates and passes the dry-run.
10. The reconciler **auto-applies** the regenerated binding (no human click) once schema-validation
    **and** the dry-run on previously-passing records both pass; either gate failing rejects it.
11. The three tiers emit byte-identical cell shapes (one schema validates all three outputs).

## 15. Resolved decisions

- **Reconciler auto-apply (decided).** The reconciler **auto-applies** a regenerated binding — no
  human click — but only after it (a) **validates against its S0 schema** and (b) **passes a dry-run
  on the records that previously succeeded**. Auto, but gated. A regeneration that fails either gate
  is rejected, not committed. (A10.)
