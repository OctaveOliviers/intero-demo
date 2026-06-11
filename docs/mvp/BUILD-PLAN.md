# MVP Build Plan — backward build

> The previous **forward, contracts-first** plan and its design-rationale docs are archived in
> [`0ld/`](./0ld/) — [BUILD-PLAN](./0ld/BUILD-PLAN.md), [Plan](./0ld/Plan.md),
> [tasks.jsonl](./0ld/tasks.jsonl), [run-population-redesign](./0ld/run-population-redesign.md),
> [mapping-artifact-redesign](./0ld/mapping-artifact-redesign.md). They remain the detailed design
> rationale (the tier ladder, the JSON models). The product spec (docs 1–10) and the schemas in
> [`contracts/`](./contracts/) stay **live**.

---

## Why we build backward

Forward (index → map → run) means **defining an artifact before its consumer exists** — so every
contract is a guess, and guesses get falsified three stages downstream, forcing a rebuild of the
upstream stage. That is the backtracking loop we kept hitting.

Backward (run → map → index) means **the consumer is already built when you define the producer** —
so the contract is validated by real usage at the moment you write it, not three stages later.

Three rules make this actually work:

1. **Define the consumer first.** Its real needs *are* the producer's contract. Never specify a
   producer's output shape until something concrete consumes it.
2. **Freeze late, against the seed.** A schema in `contracts/` is a *hypothesis* until a real
   consumer has exercised it on the seed fixture. Re-freeze it only then. Contracts are **living,
   re-frozen per consumer** — not frozen up front.
3. **The seed travels backward with you.** [`seed/audits/cord-ph/`](../../seed/audits/cord-ph/) is
   the regression net. Each step pins a shape → update the seed to match → the golden test holds
   the line so an upstream change can't silently break a downstream consumer.

**Already-built ≠ correct.** Much of the pipeline already exists (see *Current code status*), but it
was built against the *forward* guesses and on `main` is wired into nothing — the live run still
goes through the opencode agent. As the backward pass reaches each existing module, we **verify it
against the now-pinned downstream contract and rework if it drifted.** We do not assume it.

---

## Scope now: two tracks only

The only things we figure out now are **the core run pipeline** and **the store**. Front-end, auth,
the reconciler, and broader evals wait until the spine is proven end-to-end on the seed.

- **Track A — the run spine (backward):** `orchestrator → try_agent → try_llm → try_direct →
  map (mapping.json) → index`.
- **Track B — the store & definitions (parallel):** the cell store the orchestrator writes to, and
  where the definitions live. Track B **follows** Track A — it grows as each spine step reveals what
  it actually needs to persist, rather than being guessed up front.

---

## Two principles that shape everything below

**Cells are persisted up front and updated in place.** The orchestrator precomputes and **persists
one `pending` cell per (region × cohort member × cell slot) before any tier runs** — so the cell
exists in the store (and appears in the FE) from the start. **No tier returns a cell.** Each tier
does surgical in-place `UPDATE`s in the store; the front-end reads the store and shows cells filling
in real time. The cell's **`state`** is the coordination signal the orchestrator queries between
tiers: a cell stays **`pending`** until a tier settles it, and each tier acts on whatever is still
`pending` (`open_cells()` filters on exactly that). There is no separate `error`/`open` state — what
was tried lives in `attempts[]`/`hypothesis` — and the DB `CHECK` admits only the four stored states
(`pending`/`filled`/`blocked`/`not_applicable`); "needs verification" is a **derived view**
(`filled` + interpret + `review_state: not_reviewed`, doc 5 §Cell state model), never stored.
*(Migration done — T13: four-state CHECK in new DBs, legacy rows rewritten on open.)* Inside a
tier, keep a seam between **deciding** the cell's new value/state (pure, testable) and **persisting**
it (one call to an injected store writer) so "update in place" stays unit-testable.

**The field code set is never stored on the cell — and write-time validation is enforced by the
store, not by any tier.** Each cell carries `field` — the **foreign key to the audit-spec field** in
`spec.json`, which remains the **canonical, authored** home of every field's `permitted_values`.
For *enforcement*, the run store **materialises the run's code sets into a run-scoped `field_codes`
table at run start** (`Store.materialize_field_codes`, from `spec.json`) and a **DB trigger rejects
any off-code write** — so Tier 1/2/3 *and the agent's raw SQL* are all held to the same code set at
the database level, with no per-tier validation logic to keep in sync. `field_codes` is a derived,
regenerated-per-run projection (never hand-authored); the **cell still carries no code set** — it is
resolved by the `(run_id, field)` key, never copied onto the row. *(This refines the original plan,
which had each tier resolve+validate against `spec.json` in Python; moving the guarantee into the
DB is strictly safer and removes the duplication — adopted after building A1.)*

---

## Persistence model (decided)

Definitions are **source** (authored, hand-editable, reused, versioned by structure). Cells/runs/
events are **output** (generated per run, queried) and already live in the DB.

- **Storage.** `audit-spec` and `database-model` and `mapping` are **JSON files keyed by id** under
  `var/audits/{audit_id}/spec.json` and `var/databases/{database_id}/model.json` — see
  [`contracts/storage-layout.md`](./contracts/storage-layout.md) for the canonical layout and
  data flow. `mapping.json` holds **both** the match and the compiled Tier-1 executable (no
  separate `populate.json`). The server reads/writes these files (front-end library edits
  included). Runtime DB currently holds runs/cells/events; IAM/catalog policy remains split in
  transitional auth storage until control-plane migration lands. This file-backed definition plane is an
  MVP choice (simple, local, inspectable), not the long-term horizontal-scale substrate. A
  **DB registry of definitions is deferred** until we need cross-definition queries, high
  definition cardinality, or multi-writer/multi-node coordination.
- **Identity / reuse.** One `audit_id` per template (reused across many runs/hospitals); one
  `database_id` per database (reused across many audits); and **one `mapping` per audit, which may
  bind SEVERAL databases** (`databases[]`) — reused across runs. A run references `audit_id`; the
  mapping declares its databases and carries the executable. Nothing is copied.
- **Editability.** Always, in place — regardless of substrate. A content edit (e.g. rewording a
  field description in the library) overwrites the file and mints **no** version.
- **Versioning.** Only a **structural** change bumps `schema_version` (governed by `contracts/`). On
  a structural bump we **retain the prior-shape definition** instead of overwriting it, and each run
  stamps the `(audit_id, [database_ids], schema_version)` it used — so a pre-change run can still
  resolve and re-run against its original shape. No per-edit history.

---

## Track A — the run spine

Each step lists: **role**, the **consumer that pins its contract**, what it therefore **pins
upstream**, its **current code + verify-or-build**, and its **verify** check. Build top-to-bottom.

### A0 · Keystone — Orchestrator against stubs
- **Role.** The orchestrator owns the cell store and *drives* the run; the tiers only resolve cells.
  Rewrite `core/running/orchestrator.py` to: load `mapping.json`'s executable + the resolved cohort →
  **precompute and persist one `pending` cell per (region × cohort member × cell slot)** with
  `sheet`/`ref`/`field`/`member` set → run Tier 1 (bulk) → query the store for still-open cells →
  Tier 2 (per open cell) → query again → one Tier 3 session over the rest. Persist + stream on every
  store change; emit `activity`/`done`.
- **Build against stubs.** `try_direct` / `try_llm` / `try_agent` are stubs that **write canned
  updates to the store** (not return values); `mapping`'s executable + cohort can be a hand-authored
  fixture. The point is to **pin the seams**: the exact arguments each tier receives, the store API
  it writes through, and how the orchestrator reads `state` to sequence the tiers.
- **Pins.** *Downstream:* the three tier signatures + the store-writer interface. *Upstream:* what
  `mapping.json`'s executable + the cohort must provide.
- **Current.** `orchestrator.py` exists but runs through the opencode agent → **rewrite**.
- **Verify.** With stubbed tiers + a fixture executable: the run persists all pending cells first,
  walks the three tiers (each mutating the store), streams `cell_update` + `done` — no real SQL, no
  LLM; nothing held in memory that isn't in the store.
- **Re-freeze.** `cell-resolution.schema.json` (the cell + its `state`/`field`/`member`) and the
  executable/cohort shape the orchestrator consumes.

### A1 · `try_agent` (Tier 3) — BUILD
- **Consumer that pins it.** A0.
- **Role.** Thin bridge to the opencode agent + `cell-fill` skill; ONE session over all still-open
  cells, rooted in a per-run worktree (`runs/<id>/`, where the session's `directory` points). The
  agent's **entire interface is two tools** — it never touches the workbook, the mapping, or any tier
  vocabulary, and it supplies only a database name + SQL (no run id, no scope binds, no paths):
  - **`sql_execute(database, sql)`** — one statement, routed by the `database` name. `"cells"` is the
    run store (read + write); any other name is a clinical database (read-only). Databases are
    **symlinked into the worktree by name** (`audit/cells.sqlite`, `database/<slug>.sqlite`), so the
    tool resolves them from its cwd — no path reaches the agent. **Scope is injected, not asked for:**
    the cohort predicate is ANDed onto every cohort-bearing table of a clinical query, and `run_id`
    onto a cells statement; a query touching no cohort table, or any nested subquery/CTE/set-op (where
    top-level injection can't guarantee scope), is rejected. Writing a value is just an `UPDATE cells`;
    **off-code, state-legality, and the sources contract are enforced by the store's DB triggers** (see
    the principles above), so the tool stays thin and the same rules hold for every writer.
  - **`lookup_execute(...)`** — a structured, read-only peek into the precomputed **audit spec** (a
    field's codes/notes) and **database models** (tables/columns), scoped to those two files. This is
    why the **prompt is minimal**: rather than dump the whole audit spec + every DB model into the
    prompt (which bloats context and assumes a single database), the agent looks up only the field or
    table it needs, on demand. The prompt just names the databases and hands off to the `cell-fill`
    skill; the skill — not the prompt — owns the how-to and the multi-database flow.

  An unsolvable cell is left open; the session-end fallback (run in a `finally`, so a transport error
  can't strand cells) marks it `blocked`/`NOT_LOCATED`.
- **Agent permission cleanup.** Tighten `agent/opencode.json` so the agent has **only** `sql_execute`
  + `lookup_execute` + the `cell-fill` skill. **Deny** every other tool and skill that's now obsolete
  — **without deleting the files yet** (a separate cleanup task removes them later).
- **Pins upstream.** What an open cell must carry to be solvable (`attempts[]`, `hypothesis`,
  `field`/`member`), the run-scoped cell SQL surface, the cohort-scoped read-only SQL surface, and the
  per-run worktree shape (`context.json` + symlinked DBs + model files).
- **Current.** `core/running/try_agent.py` **does not exist** → build.
- **Verify.** Every clinical query is cohort-scoped and every cells statement run-scoped by injection
  (the agent writes no binds); a nested query is rejected; an off-code or source-less write is rejected
  by the DB (codes from the materialised `field_codes`, not the cell); an unsolvable cell is left
  `blocked`/`NOT_LOCATED` even on session failure; the agent's allow-list in `opencode.json` lists
  only `sql_execute` + `lookup_execute`, everything else denied.

### A2 · `try_llm` (Tier 2) — BUILD
- **Consumer that pins it.** A0, plus the open-cell shape A1 expects.
- **Role.** One cheap pass per open cell. Two looks: propose a final coded value, or one retry query,
  or escalate. The orchestrator runs the retry via `run_readonly_sql`. **Write-time validation
  resolves the field's code set from `spec.json` by `field`** (off-code → leave open, append the
  rejection to `attempts[]`, escalate). The tier **updates the cell in place** (never returns); never
  holds a DB connection; ≤2 LLM calls + ≤1 query per cell.
- **Pins upstream.** What `try_direct` must leave on a non-clean cell (`attempts[0]` = the narrowed
  query; `field` so the requirement is resolvable).
- **Current.** `core/running/try_llm.py` **does not exist** → build.
- **Verify.** A code-drift cell is updated to filled in place at first look; an empty value is solved
  via one retry with verbatim evidence; an unresolvable cell is left open for Tier 3; an off-code
  solution is rejected (validated against `spec.json`) and rides on `attempts[]`.

### A3 · `try_direct` (Tier 1) — VERIFY / rework
- **Consumer that pins it.** A0 + A2.
- **Role.** The deterministic per-cell mechanic: given a target (cell slot → source column + the
  executable's **Tier-1 code_map**) and a row from a bulk region query, map the value, apply the
  code_map, and **update the cell in place** — filled, or non-clean (NULL / value-not-in-code_map /
  `IDENTITY_UNRESOLVED`). Never returns a cell, never calls an LLM, never routes, never escalates
  itself. *(Note: the Tier-1 code_map in the executable is the precompiled DB→audit translation used
  to **produce** values; it is distinct from the `spec.json` code set used to **validate**
  Tier-2/Tier-3 values.)*
- **Attempt-provenance contract (pinned by A2).** `attempts[]` records each attempt to fill the
  cell's value (cell-resolution.schema.json §attempt). Tier 1 writes `attempts[0]` with the
  **narrowed** per-cell `sql`, the **`table_column`** it read (straight from the executable's
  cell_map), and — on a non-clean result — the `value` that failed plus the `error`. **Tier 2 reads
  the provenance off the attempt (`table_column`/`value`), never by re-parsing the SQL** — so a
  legal-but-unparseable narrowed query (aliased table, reordered SELECT) never breaks the source/FE
  highlight. Keep emitting `table_column` + `value` on every non-clean attempt.
- **Pins upstream.** Exactly what `mapping.json`'s executable must contain (cell map, Tier-1 code_map,
  identity keys, per-region query).
- **Source-recording contract (pinned by A1, revised by the provenance redesign).** The store
  enforces, by DB trigger, that **every `filled` cell carries a non-empty
  `sources[]`**. A source is `{database, query, table_column, row_id?, citations?}` — the cohort
  identity is the cell's `member` and is **not** repeated on the source (the old `record_id` field
  and its identity-match trigger were dropped). `try_direct` emits one structured source per filled
  cell (`_source_sql` projects the identity keys + column so the value stays self-verifying); a
  filled cell written with no source is **rejected at write time**.
- **Current.** `core/running/try_direct.py` (+ its test under `core/running/tests/`) **exist but are
  unwired** → verify against A0/A2's contract; rework to update-in-place if it currently returns cells.
- **Verify.** After Tier 1 the store shows cord-pH direct cells filled with `resolved_by: direct` +
  a narrowed single-column attempt (carrying `table_column`) + a `sources[]` entry; NULL/unknown-code
  cells stay open (not blocked) with `table_column` on `attempts[0]` (unknown-code carries the failed
  `value`; NULL/empty does not); a forced identity mismatch → `IDENTITY_UNRESOLVED`, never mixes patients.

### A4 · map → `mapping.json` (the match + the executable) — VERIFY / rework
- **Consumer that pins it.** A3 (executable) + the orchestrator's cohort compose (A0).
- **Role.** One task, one file, **two internal phases** — the same goal (bind one audit to its
  databases), split only by determinism:
  - **Phase 1 — the match** (judgment; LLM/reasoning step). Infer the links between the audit and its
    **several** databases: `identity` (anchor + join keys across DBs), `regions` (carried as data),
    `fields[]` (`sources`, `kind` *hint*, optional `code` map), `criteria_bindings`,
    `not_expressible`.
  - **Phase 2 — the executable** (pure mechanics; no LLM). Compile the match into the parameterized
    Tier-1 plan **inside the same `mapping.json`**: per region, parameterized SQL per source DB, the
    cell map, the Tier-1 code translation, identity keys, and the cohort block. **This executable is
    a derived build output** — `kind` and the Tier-1 translation are *computed here*, never
    re-authored, killing the old three-places duplication. Regenerate it; don't hand-edit it.
- **Pins upstream.** What `spec.json` + `model.json` must contain.
- **Current.** `core/mapping/build_audit_database_map.py` + `build_criteria.py` (Phase 1) and
  `build_populate_spec.py` (Phase 2) **exist as separate builders** → verify/rework, and **fold the
  Phase-2 output into `mapping.json`** (retire the standalone `populate.json`). `mapping.schema.json`
  absorbs the executable section (the old populate schema) when this step is built.
- **Verify.** cord-pH `mapping.json` validates and binds the audit to ≥1 database (multi-DB shape
  present); an agent can locate every value from the match alone; the executable runs a clean Tier-1
  pass on the seed; `kind` is derived (multi-source → `interpret`); the cohort block matches the
  criteria base.

### A5 · index → `spec.json` + `model.json` — ⏸ ON HOLD (DB done, audit paused)
> **A5 outcome (2026-06-07).** The MVP pivots away from LLM-driven audit indexing.
> Audit `spec.json` is now **hand-authored** against the contract
> (`docs/mvp/contracts/audit-spec.schema.json`); `core/indexing/build_audit_spec.py`
> is dead code in the MVP path (do not delete; carries a top-of-file notice + the
> unfixed-bug list for the eventual unpause: #2 `_HEADER_ROW` endswith, #3 coverage
> after merge, #4 slug(header)≠slug(name), #7 truncated retry feedback, #8 LLM-
> enumeration altitude). **Database indexing landed:** `build_database_model.py`
> + `profile.py` produce a schema-valid `model.json` from a live sqlite,
> re-raise on profiler errors (no more silent `reason: reference` mislabel), and
> the deterministic-surface invariant is now test-enforced (LLM prose cannot
> override `filterable`/`filter_type`/`values`/`range`/`reason`). **A4↔A5 FK
> seam** is bijective via the new auto-prefix slug convention: multi-sheet audits
> emit ids `{slugify(sheet)}/{slugify(header)}` (cord-pH: `all/...`, `nicu/...`),
> so two cells sharing a header on different sheets get structurally-distinct
> ids — no `_2` suffix, no orphan. Duplicates now raise at build time. The seed
> `seed/audits/cord-ph/spec.json` was rewritten to the prefixed convention with
> verbatim workbook headers as `name`; `seed/audits/cord-ph/mapping.json#executable`
> recompiled via `fold_executable` carries the matching prefixed FKs. Tests:
> `core/indexing/tests/audit_database.py` (bijection + uniqueness + filterable
> surface against the live seed sqlite + dedup checks + LLM-leak guard).

- **Consumer that pins it.** A4.
- **Role.** Emit the **audit-spec** (`sections` + `fields[]`: number/cell/name/type/unit/format/
  `permitted_values`/`notes`/`inclusion_criteria[]`; **no `kind`** — that's mapping's job; this is
  the file every cell's `field` FK resolves into) and the **database-model** (schema + per-column
  filterable surface). Preserve user-set state on re-index.
- **Current.** `core/indexing/build_audit_spec.py`, `build_database_model.py`, `profile.py`
  **exist** → verify/rework against A4.
- **Verify.** Uploading the cord-pH template + DB → both validate; the filterable surface is correct;
  a user-set default survives a re-index; every `field` referenced by the seed cells exists in
  `spec.json` (the FK resolves).

---

## Who owns what in the run

Routing and coordination are the **orchestrator's** job. Tiers **update the store in place** — they
never return cells.

| Component | Module · function | Owns | Does NOT |
| --- | --- | --- | --- |
| **Tier 1** | `core/running/try_direct.py` · `try_direct()` | map one row's column → value, apply the executable's Tier-1 code_map, record the narrowed query, **UPDATE the cell in place** | return a cell; call an LLM; route |
| **Tier 2** | `core/running/try_llm.py` · `try_llm()` | look at one open cell; solve / record one retry / leave open — **UPDATE in place**; validate against `spec.json` codes | return a cell; run SQL itself; route |
| **Tier 3** | `core/running/try_agent.py` · `try_agent()` | one agent session; **UPDATE still-open cells in place through tools**; cohort-scoped SQL | return cells; reach outside the cohort; route |
| **Shared SQL** | `core/running/sql.py` · `run_readonly_sql()` | the one read-only primitive (`validate_sql` + `readonly_connection` + execute) | allow writes/DDL/PRAGMA |
| **Orchestrator** | `core/running/orchestrator.py` | precompute + **persist all `pending` cells up front**; query cell `state` to sequence Tier 1 → 2 → 3; run Tier-2 retries; stream every store change | resolve a cell itself; hold cell state outside the store |

---

## Track B — the store & definitions

- **Cell store.** `core/store/` (runs / cells / events) **exists but is unwired**. The orchestrator
  (A0) is its first real consumer — **verify/extend as A0 reveals**, notably: `field`/`member` on
  `cells`; **batch insert of `pending` cells** + **surgical update-by-`ref`** (the in-place model);
  deriving run status from persisted cells. Build the store API the orchestrator wants, not a guessed
  one. Note: the cell carries `field` but **no** code-set column (resolved from `spec.json`).
- **Definitions.** Files keyed by id under `var/audits/<id>/` and `var/databases/<id>/`, per
  [`contracts/storage-layout.md`](./contracts/storage-layout.md). `mapping.json` carries the
  executable; no `populate.json`; no DB registry yet.
- **Adopt the storage-layout contract** — the active task that supersedes the old "Restructure
  `agent/`" deferred bullet. Move definitions out of `agent/audits/` and `agent/databases/`
  to `var/audits/<id>/spec.json` and `var/databases/<id>/model.json`; rename `audit.json →
  spec.json` and `database.json → model.json` across `core/indexing/`, `core/mapping/`,
  `core/running/`; update `core/config.py` (`AUDITS_DIR`, `DATABASES_DIR` → under `VAR_DIR`);
  rename only inside `provision_worktree` (its copy + symlink shape is already correct); seed
  script copies `seed/` → `var/`. Architecturally inert — the RunStore/tier/contract seams
  don't change.
- **Seed.** Updated backward at each step; the golden test (`try_direct` on cord-pH) is the
  regression gate. Consolidate the split seed dirs (`cord-ph/` vs `cord-ph-audit/`, `.md` vs `.json`,
  missing `spec.json`, orphaned `populate.json`) into one canonical `seed/audits/cord-ph/`
  {`spec.json`, `workbook.xlsx`, `mapping.json` (match + executable)} as the spine pins each shape.

---

## Cross-cutting invariants

- **`mapping.json` is one file, two parts** — the match (judgment) + the derived executable
  (deterministic Tier-1 plan). Regenerate the executable; never hand-author it. Single source for
  `kind` + the Tier-1 translation.
- **Cells are persisted up front and updated in place.** Tiers never return cells; the cell `state`
  is the orchestrator's coordination signal; the FE reads the store for real-time updates.
- **The field code set is canonical in `spec.json`**, never stored on the cell. For enforcement it
  is **materialised per run into the store's `field_codes` table** and an **off-code write is rejected
  by a DB trigger** — the same guarantee for every tier and the agent's raw SQL, not per-tier Python.
- **One read-only SQL primitive** (`run_readonly_sql`); the **cohort predicate is always ANDed in**;
  never run generated/edited code.
- **Contracts are living**, re-frozen per consumer against the seed.
- **Three single-purpose tiers + one orchestrator** that owns routing and the store; tiers never
  route.

---

## Current code status (2026-06-10 — the spine is live)

Track A and Track B **landed** (PRs #181–#205): the spine
(`POST /api/runs` → `_run_spine` → `orchestrate_run` → `try_direct` → `try_llm` →
`try_agent` over `core/store`, strict-v2 SSE) is the production run path. The step cards
above are kept as the design record of how each contract was pinned.

| Module | State on `main` |
| --- | --- |
| `core/running/orchestrator.py` | **live** — the spine (A0/A11), called from `server/routes/runs.py::_run_spine` |
| `core/running/try_agent.py` / `try_llm.py` / `try_direct.py` | **live**, with tests under `core/running/tests/` (A1/A2/A3) |
| `core/running/stream_runner.py` + `events.py` | **live** — strict-v2 broker + canonical event builders (#200) |
| `core/running/build_workbook.py` | **live** — per-run `result.xlsx` from spec + cohort (#205) |
| `core/mapping/*` | **live** — match + criteria + folded executable (A4); `database_summaries` emission pending (Phase 4 · T7) |
| `core/indexing/build_database_model.py` + `profile.py` | **live** (A5 database half) |
| `core/indexing/build_audit_spec.py` | **reachable from upload but paused** — known bugs #2/#3/#4/#7/#8; rewrite is Phase 4 · T11 |
| `core/store/` | **live** — cells/events/runs + `field_codes` + refresh tables; legacy `needs_verification` CHECK value to drop (Phase 4 · T13) |
| `core/config.py` | under `var/` per `contracts/storage-layout.md`; per-stage model config pending (Phase 4 · T9) |
| `core/agent/opencode.json` | tightened allow-list (A1); obsolete tool/skill **files** still present — deletion is Phase 4 · T14 |

---

## Phase 4 — reconciliation implementation plan (approved 2026-06-10)

The specs were reconciled in PRs #209–#212; this is the approved, ordered PR plan that makes
the product match them. **One PR per task, opened and held for review before the next in its
lane.** Each task names the spec it satisfies; "done" = the spec'd behaviour is observable
(and covered by the contract tests T1 lands).

**Lane R — run view (sequential):**

| Task | Branch | Bucket | Scope → done-when |
| --- | --- | --- | --- |
| T1 | `bugfix/mock-strict-v2-alignment` | fix | Mock fixtures/timeline speak strict v2; shared contract tests validate mock **and** real streams against [`contracts/runtime-events.schema.json`](./contracts/runtime-events.schema.json); "analysis"→"audit" copy. |
| T2 | `bugfix/workbook-render-shape` | fix | SpreadsheetViewer renders the post-#205 `workbook_created` shape and fills live in both modes (doc 11 layout). Deps: T1. |
| T3 | `chore/fe-single-run-store` | fix+delete | One per-run store; persistence as a subscriber; dual-write (`chat.js`/`audits.js`) deleted; behaviour per docs 2/11 unchanged and contract-tested. Deps: T1–T2. |
| T4 | `feature/summary-in-feed-counters` | fix+build-new | Review summary = terminal feed entry (banner deleted) + top-band blocked/needs-review counters (doc 11 §Status counters, §agent_activity; docs 2/10). Deps: T3. |

**Lane L — library (parallel to R):**

| Task | Branch | Bucket | Scope → done-when |
| --- | --- | --- | --- |
| T5 | `feature/library-chrome` | fix | Track L1 (doc 9 §Design): title-only pages, minimal card faces + deadline, hidden Add cards, back-link, sidebar gating. |
| T6 | `feature/fixed-criteria-patch` | build-new | Track L2: `PATCH /api/audits/{id}/mapping` persists schema-validated `fixed_criteria`; `deadline` in the list response (api.md). |
| T7 | `feature/mapping-db-summaries` | build-new | Mapping builder emits `database_summaries`; seeds regenerated (mapping.schema.json; doc 9). |
| T8 | `feature/audit-detail-three-sections` | build-new+delete | Track L3: three-section AuditDetail with the chip contract (mechanical code descriptions / interpret meanings / no-mapping fallback); two-pane view deleted (doc 9 §Card detail). Deps: T5, T6 (T7 enriches). |

**Lane B — backend (parallel):**

| Task | Branch | Bucket | Scope → done-when |
| --- | --- | --- | --- |
| T9 | `feature/models-config` | build-new | Implement [`contracts/model-config.md`](./contracts/model-config.md): loader/merge, per-stage resolution, endpoint readiness (never downloads), env-trio fallback byte-identical. |
| T10 | `feature/eval-harness` | build-new | Indexing eval (re-index vs cord-ph/NPDA goldens) + mapping eval (golden agreement + Tier-1 fill-rate); one command prints scores. |
| T11 | `feature/a5-indexer-rewrite` | fix+build-new | A5 altitude rewrite (mechanical `fields[]` skeleton, LLM prose only; kills #2/#3/#4/#7/#8) + deadline extraction; scored via T10. Deps: T9, T10. |
| T12 | `feature/multi-db-runtime` | wire-up | `ensure_mapping` binding list + Tier-2 per-cell DB routing (cross-DB → Tier 3); NPDA end-to-end across its DBs; forced mismatch → `IDENTITY_UNRESOLVED` (docs 3/4). |
| T13 | `chore/store-state-migration` | delete+fix | Drop legacy `needs_verification` from the CHECK + tolerant reads (doc 5 §Cell state model migration note); migrate existing `state.db`. |

**Lane C — last:** T14 `chore/legacy-deletion` (delete) — `.md` fallback readers in
`core/indexing/service.py`, obsolete agent tool/skill files, stale comments; each deletion
traceable to a spec statement.

Sequencing rationale: T1 first turns the reconciled spec into executable tests (the
Definition of Done is bidirectional); T2 restores the most visible breakage; T3 precedes T4
so the summary is re-homed once, on the final architecture; T10 precedes T11 so indexer
quality is measured, not asserted; deletions come last.

---

## Track L — Library audit-detail + fixed inclusion criteria

A self-contained front-end + thin-backend slice that can proceed against the seed (it does not
depend on the run spine). Specs are already integrated:
[9-library-and-sources.md](./9-library-and-sources.md) (UI), §"The fixed inclusion criteria" in
[4-indexing-and-mapping.md](./4-indexing-and-mapping.md), `fixed_criteria` in
[contracts/mapping.schema.json](./contracts/mapping.schema.json), `summary` in
[contracts/database-model.schema.json](./contracts/database-model.schema.json), and the
`--content-width` token in [8-design-system.md](./8-design-system.md). Seed already carries the
new shapes (`seed/audits/cord-ph/mapping.json` `fixed_criteria`, `seed/databases/cord-ph/model.json`
`summary`).

- **L1 · Sidebar + library chrome (UI).** Gate the open-audit row highlight on the audit being
  shown (`app/src/components/LeftPanel.svelte`: `class:active` also requires
  `$currentView === "results"`). Library page = title only ("Templates"/"Databases"), no top
  bar/subtitle/toggle, content in the `--content-width` column
  (`app/src/components/LibraryPanel.svelte`). Cards = title + description + (audits) deadline;
  drop scheme/version/last-pulled. Comment out (keep) the "Add audit template"/"Add database"
  upload cards. Detail back-link → "‹ Templates"/"‹ Databases" (arrow-head only), hide the top
  bar on detail.
- **L2 · `fixed_criteria` backend.** `PATCH /api/audits/{id}/mapping` (`server/routes/audits.py`)
  persists an edited `fixed_criteria[]` to `mapping.json`, validating each `criterion_id` against
  `criteria_bindings[]` and the schema. `GET /api/audits/{id}` already returns `mapping`. Add the
  `getAuditDetail`/`saveAuditCriteria` wrappers in `app/src/lib/api.js`. The builder already emits
  `fixed_criteria: []`; auto-extraction of the standard values is `build_criteria.py`'s job.
- **L3 · Three-section audit detail (UI).** Rebuild `app/src/components/AuditDetail.svelte` as
  title → one-line description → deadline → **Inclusion criteria** (editable `fixed_criteria`
  chips, reusing `app/src/components/spec/` chip components + `lib/spec.js`; auto-save via L2) →
  **Databases** (name + `model.json` `summary`) → **Template** (one line per `spec.json` field:
  name + `notes`). Inclusion criteria are editable **only** here.

Full implementation notes: `~/.claude/plans/we-are-going-to-witty-valiant.md`.

## Deferred until the spine is green

- Front-end (`app/`) — flip per domain once the spine + endpoints are real.
- Auth / platform (run log, prompt versioning, reminders).
- The **reconciler** (post-run binding regeneration from the run's cells) — a consumer of cells; it
  comes after the spine.
- **Obsolete agent tool/skill file deletion** — A1 only *denies* them in `opencode.json`; physically
  removing the now-unused tool + skill files is a later cleanup task.
- Evals beyond the Tier-1 golden test; the end-to-end demo gate.
- A **DB registry** for definitions (only if cross-definition querying demands it).

---

## Backlog (carried from the retired `todos.md`, 2026-06-10)

`todos.md` is retired; these are its **surviving** items, kept under their original ids for
traceability. Everything else in that file was shipped (verifiable in the PR history),
superseded by the backward-build pivot, or already captured in the specs /
[open-questions.md](./open-questions.md). Discovered follow-ups are appended here
(see `AGENTS.md` §Task Management Rules).

- **TODO-0007 · Security audit** — review the codebase for vulnerabilities (subprocess
  execution, filesystem access, SQL-injection surfaces); no CI, linter, or typechecker is
  configured; the read-only SQLite enforcement should be re-audited.
- **TODO-0010 · Replace the deprecated `cgi` multipart parser** — `cgi` is removed in
  Python 3.13; move the server's multipart parsing to a supported library.
- **TODO-0063 · Stable role source** — replace username-literal role mapping in
  `server/auth/permissions.py` with resolution from a stable authority (deferred from the
  #203 runtime-permission remediation).
- **TODO-0064 · Dedupe runtime-permission column sets** — refactor the parallel column-set
  definitions in `core/store/runtime_permissions.py` into one pattern (deferred from
  #203/#204).
- **TODO-0061 · Visible/editable mapping surface** — the user-facing view/edit of the
  executable's SQL + cell map ([doc 4 §Visible and editable](./4-indexing-and-mapping.md));
  spec'd, unbuilt.
- **TODO-0062 · Cross-audit field-semantics reuse** — shared field-concept dictionary per
  Trust schema so the Nth template maps near-instantly; deliberately deferred until more
  than two templates exist.
- **TODO-0032 · Empty/loading/error/partial states sweep** — doc 2's state-table acceptance
  across all surfaces; partially built, sweep outstanding.
- **TODO-0005 · Run-record completeness** — verify the persisted run record against
  [doc 7](./7-auth-and-audit-log.md) (structured traces, prompt versioning) and close gaps;
  partially superseded by the store's events table.
- **TODO-0038 · End-to-end demo script** — write and rehearse the 10-minute demo on the
  seeded datasets (date is soft).
- *Pointer:* the self-improvement / dreaming track (was TODO-0004/0046) lives in
  `docs/dreaming/` + PR #170 — not MVP scope.
- **B-T2a · Stream reattach is silent for finished runs** — reconnecting to a completed
  run's `/stream` yields no replay/snapshot (verified live, T2): a reload during/after a run
  leaves the UI stale until manual navigation. Needs a snapshot-on-attach or catch-up policy
  (server `stream_runner`/broker + doc 11 idle states). Found during T2.
- **B-T2b · Finished-audit row doesn't reopen results after reload** — clicking a stored
  audit in the sidebar after a page reload stays on Home instead of restoring the results
  view (`app/src/stores/audits.js` restore path). Found during T2; adjacent to T3.
- **B-T2c · POST /api/runs 500s on malformed body** — unhandled pydantic `ValidationError`
  in `server/routes/runs.py::create_run` returns 500 instead of 422. Found during T2.
- **B-T10a · cord-pH golden: NICU region blocks for non-admitted babies** — the first
  `eval-tier1` run surfaced it: all 78 blocked direct cells are NICU-sheet cells whose
  members never went to NICU; the region executes over the FULL cohort, so the identity
  join blocks (`IDENTITY_UNRESOLVED`) where doc 10 wants `not_applicable` (genuinely N/A)
  or a narrowed NICU sub-grain. Golden mapping/`build_populate_spec` region-grain work;
  feeds T11/T7. Found during T10.
- **B-T2d · Adopt `svelte-check` after type-noise cleanup** — it catches the
  undefined-identifier-in-component class that froze the run stream (T2 root cause), but
  today reports ~1.1k pre-existing JS type errors, so it can't gate CI yet.
