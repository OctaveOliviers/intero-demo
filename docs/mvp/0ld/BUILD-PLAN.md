# MVP Build Plan

How to build the spec set ([README.md](./README.md) + docs 1–10) as an ordered, dependency-aware
set of tasks. Each task names its **spec refs**, the **files it owns**, what to **do**, where to
find **context**, its **dependencies**, and a **verify** check. Run one task per agent/worktree;
check it off when its verify passes.

Companion: [`tasks.jsonl`](./tasks.jsonl) — the same tasks, one JSON object per line, for feeding
to an agent or a runner.

---

## Approach: contracts first, then parallel domain lanes, with merge gates

The build is a **hybrid** of your two ideas: domain lanes for ownership + parallelism, **and** an
explicit dependency DAG. The unlock is that **most cross-lane dependencies are contracts, not
code** — the frontend needs the API *shape*, the run engine needs the state-DB *schema*, not the
other lane's implementation.

So **Wave 0 freezes the shared contracts** (several already exist in the mock layer + the reviews),
then five lanes build in parallel against the frozen contracts, meeting only at **gates**:

```
WAVE 0 — FREEZE CONTRACTS  (small, ~1 day; unblocks everyone)
  W0.1 API contract     W0.2 state-DB schema     W0.3 runtime shapes     W0.4 per-domain mock flags
                                  │  GATE 0: contracts merged → branch the lanes
  ┌───────────────┬───────────────┼────────────────┬───────────────────┬──────────────────┐
LANE A            LANE B          LANE C            LANE D              LANE E
data pipeline     run engine      platform          frontend            tests / evals
core/indexing     core/running    server/, DB        app/                test/, evals/
core/mapping
core/running.exec
  A1.1 audit+db   B1 multi-db     C1 state DB        D1 api seam+copy     E1 fill-cell-direct
  A2.1 mapping    B3 streaming    C2 auth+gate       D2 template entry       golden
  A6.1 criteria   B7 run-wiring   C3 run log+        D3 filters (S4)      E2 tiered-resolve
   ✅(Wave 1c)    B4 status+         prompt ver.     D4 run view             eval
  S1 cell contract   blocked      C4 reminders       D5 traceability      E3 demo-gate E2E
  A3 populate     B6 filter res.                     D6 library
  A7 populate v2  B5 stop+re-run                     D7 status Kanban
  A4 try_direct                                    D8 design tokens
  A8 try_llm                                     D9 criteria review
  A9 try_agent
  A11 orchestrator
  A10 backlog+recon
  A5 seed fixtures
        │ GATE 1: A4 (try_direct) + C1 (state DB) → B7 wires the orchestrator;
        │         the ladder (A8→A9→A11→A10) layers on. Lane B integrates (B4/B6/B7/B5).
                   │ GATE 2: B/C endpoints live → Lane D flips mock per domain (D1–D9)
                             │ GATE 3: integrate + E3 demo-gate green → MVP done
```

> **Wave 1c (done, merged):** S0 froze the JSON model schemas; **A1.1** emits `audit.json` +
> `database.json`, **A2.1** emits `mapping.json` (fields/identity/regions), **A6.1** adds
> `criteria_bindings`. These retire the old markdown **A1 / A2 / A6**.
>
> **Run-population redesign** ([run-population-redesign.md](./run-population-redesign.md)): Lane A's
> back half is now the **cell-resolution ladder** — `S1` (contract) → `A3`/`A7` (compile the
> Tier-1 plan) → `A4` try_direct → `A8` try_llm → `A9` try_agent → `A11`
> orchestrator (routing + coordination) → `A10` backlog/reconciler.

**Why gates, not a free-for-all:** a lane may *reference* a frozen contract from day one (cheap),
but it may only *consume* another lane's running code at a gate. The gates are exactly the
"wait + merge" points you asked for.

### Execution order (waves)

1. **Wave 0** — do W0.1–W0.4 first. Small, mostly one person, mostly sequential. Merge → **Gate 0**.
2. **Wave 1 (parallel):** launch **Lane A**, **Lane C (C1 first)**, and **Lane D (D8, then D2/D3/D6
   against the mock)** in parallel worktrees. Lane B's contract-only parts (B1, B3) can start too.
3. **Gate 1:** merge A4 (try_direct) + C1 (state DB). **B7** wires the run through the
   orchestrator (try_direct + cohort compose); the ladder (A8→A9→A11→A10) layers on. Now
   **Lane B** integrates (B4, B6, B7, B5).
4. **Gate 2:** as each backend domain's endpoints go live (audits, databases, runs, sql, workbook,
   indexing), **Lane D flips that domain off the mock** (per W0.4 flags) and wires the real call.
5. **Lane E** runs throughout: E1 once A4+A5 land, E2 alongside, **E3 (demo-gate) last**.
6. **Gate 3:** full integration on the cord-pH demo; E3 green → MVP complete (acceptance-criteria.md).

### Lane A — revised sequence (Wave 1c + the cell-resolution ladder)

```
S0 ✅ ─┬─ A1.1 ✅ audit.json + database.json
       ├─ A2.1 ✅ mapping.json (fields/identity/regions)
       └─ A6.1 ✅ mapping.json (criteria_bindings)

S1 cell-resolution contract (cells.field/member)   ← finish: add field/member to state-schema + C1
A2.1 ─ A3 compile populate.json from mapping.json (Tier-1)   ← rework (reads mapping.json now)
A6.1 + A3 ─ A7 populate.json v2 (cohort block)
A3 + S1 ─ A4 try_direct + run_readonly_sql + cell-store writes   ← rework (renames executor.py)
            └─ A8 try_llm ─ A9 try_agent ─┐
A4 + A7 + C1 ─ B7 run-wiring (orchestrator) ───────┴─ A11 orchestrator ─ A10 reconciler
A7 ─ A5 seed fixtures (populate v2)
```

- **Ready now (deps merged):** `S1` (finish), `A3` (rework), in parallel.
- **Critical path:** `A3 → A4 (needs S1) → A8 → A9 → A11 → A10`.
- `A3` and `A4` exist from earlier work but predate the cell-store/tier model — they are reworked to the current spec, not built from scratch.

### Who owns what in the run

The run is three single-purpose tier functions driven by one **orchestrator**. Routing and
coordination are the orchestrator's job — never a tier's
([run-population-redesign.md §2](./run-population-redesign.md)).

| Component | Module · function | Owns | Does NOT |
| --- | --- | --- | --- |
| **Tier 1** | `core/running/try_direct.py` · `try_direct()` (A4) | map one row's column to a Cell, code-translate, narrowed per-cell query; flag non-clean. The Phase-1 loop runs each region query once (many cells) and calls it per cell | call an LLM; route; hold cross-cell state |
| **Tier 2** | `core/running/try_llm.py` · `try_llm()` (A8) | look at one failed cell; solve / propose a retry / escalate | run SQL itself (the orchestrator runs it via `run_readonly_sql`); route other cells |
| **Tier 3** | `core/running/try_agent.py` · `try_agent()` (A9, thin) | hand off to the opencode agent + cell-fill skill; cohort-scoped SQL + cohort cell reads | reach outside the cohort; route other cells |
| **Shared SQL** | `core/running/sql.py` · `run_readonly_sql()` (A4) | the one read-only primitive: `validate_sql` + `readonly_connection` + execute; used by Tier 1, the Tier-2 retries, mirrored by the agent runtime | allow writes/DDL/PRAGMA |
| **Orchestrator** | `core/running/orchestrator.py` (B7 wires it, A11 adds the ladder) | own the cell store; run Tier 1 (bulk) -> Tier 2 (per open cell) -> Tier 3 (one agent over all still open); run the Tier-2 retries via `run_readonly_sql`; persist + stream on every write; hand the run's cells to the reconciler (it reads `attempts`/`sources`/`hypothesis`) | resolve a cell itself |
| **Reconciler** | `core/mapping/reconciler.py` (A10) | after the run, regenerate the binding by reading the run's cells (`attempts`/`sources`/`hypothesis`) and pattern-matching systemic fixes per field; schema-validate + dry-run before auto-apply | run during the audit; touch `audit.json` user state |

### Leverage what exists (do not rebuild)
- The **index → map → run pipeline** is partly built: `core/indexing` (builders + SSE + rescan),
  `core/mapping` (region-organised mapping), `core/running` (orchestrator + `JobRunner`/
  `OpenCodeRunner`), read-only SQL tools. Lanes A/B **extend**, not rebuild.
- The **full REST contract already exists** in `app/src/lib/api.js` + `app/src/lib/mockData.js`
  (the mock). W0.1 transcribes it; Lane D flips off it per domain.
- The **seed plane** (`make seed`, fixtures under `seed/`) boots the app `ready` with zero LLM
  calls — A5 produces the cord-pH fixtures the golden test (E1) and demos run on.

---

## Wave 0 — Freeze contracts (Gate 0)

### W0.1 — Freeze the API contract
- **Lane/gate:** Wave 0 · before Gate 0
- **Spec:** 3-architecture.md §"Where the front end meets the backend"; the endpoint list in `app/src/lib/api.js`
- **Owns:** `docs/mvp/contracts/api.md` (new)
- **Do:** enumerate every endpoint the mock `api.js` calls (audits, databases, runs, sql, workbook, generate, indexing SSE, feedback) with request + response shapes drawn from `mockData.js`. This is the frozen REST contract both Lane C/B (serve) and Lane D (consume) build against.
- **Context:** `app/src/lib/api.js`, `app/src/lib/mockData.js`, `server/main.py` (routers already registered).
- **Depends on:** —  · **Parallel-safe:** yes (doc).  · **Verify:** every mock `api.js` function maps to one documented endpoint + shape.

### W0.2 — Freeze the state-DB schema
- **Lane/gate:** Wave 0 · before Gate 0
- **Spec:** 7-auth-and-audit-log.md §"State data model" (A4)
- **Owns:** `docs/mvp/contracts/state-schema.md` (new)
- **Do:** lock the `runs` / `cells` / `events` tables (fields per doc 7 A4) as the contract Lane B/C/D read. Status, blocked items, run log, and the loop all derive from this.
- **Context:** doc 7 §State data model; doc 10 (status derives from `cells`).
- **Depends on:** —  · **Parallel-safe:** yes.  · **Verify:** every field referenced by docs 5/6/7/10 exists in the schema.

### W0.3 — Freeze runtime shapes (events, cell metadata, populate.json)
- **Lane/gate:** Wave 0 · before Gate 0
- **Spec:** 5-run-engine.md §Streaming; 6-traceability-evidence.md §Per-cell metadata; 4-indexing-and-mapping.md §Phase 3
- **Owns:** `docs/mvp/contracts/runtime-shapes.md` (new)
- **Do:** lock the SSE event contract (`activity`/`workbook_created`/`cell_update`/`done`/`error`), the per-cell metadata object, and the `populate.json` schema (parameterised SQL + cell map + identity keys).
- **Context:** docs 4/5/6; the demo's existing event model in `app/src/lib/mock.js`.
- **Depends on:** —  · **Parallel-safe:** yes.  · **Verify:** Lane A (writes), Lane B (emits), Lane D (renders) can each code against these shapes alone.

### W0.4 — Per-domain mock flags
- **Lane/gate:** Wave 0 · before Gate 0
- **Spec:** 3-architecture.md §front-end seam
- **Owns:** `app/src/lib/mock.js`, `app/src/lib/api.js`
- **Do:** replace the single global `VITE_MOCK` with per-domain flags (e.g. `VITE_MOCK_AUDITS`, `VITE_MOCK_RUNS`, …) so Lane D can flip one domain to the real API while the rest stay mocked. Default: all mock.
- **Context:** `isMockMode()` in `app/src/lib/mock.js` (currently a single global).
- **Depends on:** W0.1  · **Parallel-safe:** yes.  · **Verify:** flipping one flag routes only that domain to `fetch`; others still mock.

---

## Lane A — Data pipeline  (`core/indexing`, `core/mapping`, `core/running`)

### S0 — Documented JSON Schemas for the three models
- **Spec:** mapping-artifact-redesign.md §3 (the three models), §6 (defaults live in audit.json)
- **Owns:** `docs/mvp/contracts/audit-spec.schema.json` (new), `docs/mvp/contracts/database-model.schema.json` (new), `docs/mvp/contracts/mapping.schema.json` (new), `docs/mvp/contracts/README.md` (extend)
- **Do:** author a **documented JSON Schema** (Draft 2020-12) for each of `audit.json` (the audit specification), `database.json` (the database model + filterable surface), and `mapping.json` (audit↔database bindings). For every field: name, type, required-or-optional, what it means and why it's needed, label/value conventions, coded-set shape (`code → meaning` maps). Document the regenerable-vs-state distinction (audit spec preserves user-set state; database/mapping are purely regenerable). Include a cord-pH worked example **and** an NPDA worked example (NPDA Dataset 2026 — items are `name`/`permitted_values`/`notes`; defines the audit-spec shape). These schemas are the contract A1.1 / A2.1 / A6.1 validate against.
- **Context:** mapping-artifact-redesign.md is the source spec; the contracts dir holds `runtime-shapes.md` / `api.md` / `state-schema.md`.
- **Depends on:** —  · **Parallel-safe:** yes (doc only).  · **Verify:** each schema is valid JSON Schema; every field documented; the cord-pH + NPDA examples validate against the audit-spec schema; lint passes.

### A1.1 — Indexing: emit `audit.json` (audit specification) + `database.json`
- **Spec:** mapping-artifact-redesign.md §3.1 (audit.json), §3.2 (database.json), §6; 4-indexing-and-mapping.md §Phase 1
- **Owns:** `core/indexing/build_audit_spec.py` (rename from `build_audit_model.py` + rewrite), `core/indexing/build_database_model.py` (rewrite), `core/indexing/profile.py` (new), `core/indexing/service.py`
- **Do:** emit **`audit.json`** (the audit specification: `sections` + `fields[]` — number/section/cell/name/type/unit/format/`permitted_values` (`code → meaning` map)/single `notes` prose field with any standard citation inline + `inclusion_criteria[]` with ~5 LLM-suggested entries and `default: null`; **no `kind`** — that's mapping's job). Emit **`database.json`** (schema model + per-column filterable surface — `type`, allowed values for low-card categoricals via bounded `SELECT DISTINCT`, range for date/number, not-filterable + reason for id/free-text/reference). Move the read-only value profiler salvaged in closed PR #155 (`core/mapping/build_criteria.py`) into `core/indexing/profile.py` — it belongs at DB indexing. Validate every output against the S0 JSON Schemas before writing; malformed → `status: error` + bounded retry, never write a broken file. **Preserve user-set state** in `audit.json` on re-index (merge defaults / library-added notes by stable key — `field.number` / `criterion.id`).
- **Context:** existing builders + `service.py` (status lifecycle, SSE, rescan); the salvaged profiler from closed PR #155 (branch `feature/a6-criteria-at-mapping`); AGENTS.md §Indexing; A2.1/A6.1 consume these outputs.
- **Depends on:** S0  · **Parallel-safe:** with A2.1 + A6.1.  · **Verify:** uploading cord-pH template + DB → `audit.json` + `database.json` validate against the S0 schemas; `database.json` marks `cord_ph_birth_records.delivery` filterable(category, values [Spontaneous vaginal, Emergency caesarean, Forceps, Vacuum]), `gestation_weeks` filterable(number, range 35–41), `patients.birthdate` filterable(date), `clinical_notes.text` not-filterable(free-text), `patient_code` not-filterable(identifier); `audit.json` has 5 `inclusion_criteria` entries with `default: null`; a corrupted LLM response → `error` + retry, no broken file; setting a `default` then re-indexing preserves it.

### A2.1 — Mapping: emit `mapping.json`
- **Spec:** mapping-artifact-redesign.md §3.3 (the audit↔database bindings); 4-indexing-and-mapping.md §Phase 2
- **Owns:** `core/mapping/build_audit_database_map.py` (rewrite), `seed/audits/cord-ph/mapping.json`
- **Do:** emit **`mapping.json`** — `schema_version`, `audit`, `databases[]`, `description`, `identity` (`anchor`, `grain`, `keys`, `patient_grain_rule`) + `regions[]` (carried as **data** from `audit.json` — cell refs and data ranges never LLM-retyped) + `fields[]` (one entry per audit field → `sources`, **`kind` (direct | interpret) decided here** now the DB is known, and an OPTIONAL **`code`** (`code → meaning` map) on ANY field — direct: `try_direct` maps the source value onto the code; interpret: agent must output one of the codes; absent: free). Validate against the S0 schema before writing. `criteria_bindings` + `not_expressible` are owned by A6.1 in the SAME FILE — coordinate the merge.
- **Context:** existing `build_audit_database_map.py` (markdown emitter, to be rewritten); `audit.json` (A1.1) and `database.json` (A1.1) as inputs; AGENTS.md §Mapping; same file as A6.1 — merge together.
- **Depends on:** S0, A1.1  · **Parallel-safe:** with A1.1 + A6.1 (same file as A6.1 — coordinate).  · **Verify:** cord-pH `mapping.json` validates against the S0 schema; every audit field has a `kind`; `identity.anchor` = cord-ph → `cord_ph_birth_records.patient_code`; an agent locates every value from `mapping.json` alone; a sex/gender-style field carrying a `code` map demonstrates DB-encoding → audit-encoding.

### A6.1 — Criteria bindings at mapping
- **Spec:** mapping-artifact-redesign.md §3.3, §5 (how the inclusion-criteria filters are computed); 4-indexing-and-mapping.md §Phase 2; 5-run-engine.md §"Filter resolution and the cohort count"
- **Owns:** `core/mapping/build_audit_database_map.py` (extend with `criteria_bindings`), `core/mapping/build_criteria.py` (rewrite — selection only), `seed/audits/cord-ph/mapping.json`
- **Do:** build the `criteria_bindings` + `not_expressible` blocks of `mapping.json`. One LLM call selects which dimensions are **relevant inclusion criteria** for this audit, drawn from **both** (a) the audit's own `inclusion_criteria` in `audit.json` AND (b) the `database.json` filterable columns reachable by join. Each binding entry: `criterion_id` (referencing `audit.json` by id when applicable), `label`, `source` (`database → table.column`), `type`, `join_path` back to `identity.anchor`, `grain_rule`, and provenance via `from` ∈ {`audit_field`, `db_column`, `audit_field+db_column`}. **No re-profiling** — type/values/range are referenced from `database.json`. **No defaults** — those live in `audit.json`. A concept the bound DB can only satisfy from free-text → `not_expressible` (structured-only, P1). Rewrite `core/mapping/build_criteria.py` to selection-only (the value-profiling code moved to A1.1 / `core/indexing/profile.py`). Validate against the S0 schema.
- **Context:** A2.1 writes the same file (`mapping.json`) — coordinate; D9 is the human review net for relevance + bindings; B6 is the run-time consumer.
- **Depends on:** S0, A1.1, A2.1  · **Parallel-safe:** with A1.1 (same file as A2.1 — coordinate).  · **Verify:** cord-pH `mapping.json` carries `criteria_bindings` linking `delivery`, `gestation_weeks`, `admitted_to_nicu` (audit fields) and `encounters.start`, `patients.birthdate` (DB-only via join) each to a real `table.column` + join path + grain rule; `clinical_notes.text` lands in `not_expressible`; each binding carries a `from` provenance; an LLM can pick the right dimension+value for "caesarean" and "older than 5 years" from `criteria_bindings` alone.

### S1 — Cell-resolution contract (cell + triage) + `cells.field` / `cells.member`
- **Spec:** run-population-redesign.md §7 (the unified cell contract), §11 (what this changes in the existing artifacts); contracts/cell-resolution.schema.json
- **Owns:** `docs/mvp/contracts/cell-resolution.schema.json`, `docs/mvp/contracts/runtime-shapes.md`, `docs/mvp/contracts/state-schema.md`
- **Do:** freeze the shared cell-resolution contract: `cell-resolution.schema.json` validates the extended per-cell metadata (adds `field`, `member`, `resolved_by`, `hypothesis`, `attempts[]`, source `row_id`, `NOT_LOCATED` reason code) and the triage-decision object. Update runtime-shapes.md §2 to defer to it. **Extend W0.2's `cells` table** with `field` (audit field id) and `member` (cohort identity) — both set at pending-insert time from `populate.json` + the resolved cohort, both required so the agent (and the FE) can pivot the open set by field and by member without parsing `ref`/`sources`. No `mapping.json` change (lean binding stays).
- **Context:** runtime-shapes.md §2 is the existing per-cell metadata contract this EXTENDS, not replaces; mapping-artifact-redesign.md §6 (regenerable vs state).
- **Depends on:** W0.3  · **Parallel-safe:** yes.  · **Verify:** `cell-resolution.schema.json` valid; accepts a cell carrying `field`+`member`; rejects a cell missing either; rejects a triage solution with null output; W0.2 state-schema.md `cells` table lists `field` + `member` as required.

### A3 — `populate.json` generation (the populate spec)
- **Spec:** 4-indexing-and-mapping.md §Phase 3; run-population-redesign.md §2 (one cell store, three tiers)
- **Owns:** `core/mapping/build_populate_spec.py` (new), `seed/audits/cord-ph/populate.json`
- **Do:** generate the **populate spec (data, not code)** = the deterministic Tier-1 plan: per region, parameterised SQL per source DB (filters as named binds), the cell map, code-set translation, identity join keys. Each query should cover the **largest** possible set of cells (many columns/rows per query) so `try_direct` runs few executions; the per-cell narrowing happens at run time in `try_direct` (A4), not here. Compiled from `mapping.json`; no LLM in the builder. Tier-2/Tier-3 escalation (A8/A9) layer on top at run time, never here.
- **Context:** doc 4 §Phase 3; run-population-redesign.md (Tier 1 of the ladder); the mapping output (A2.1).
- **Depends on:** A2.1, W0.3  · **Parallel-safe:** with B/C/D.  · **Verify:** cord-pH `populate.json` validates against the W0.3 schema; every direct field has a parameterised query + cell map.

### A7 — `populate.json` v2: cohort block from the criteria surface
- **Spec:** 4-indexing-and-mapping.md §Phase 3; 5-run-engine.md §"Filter resolution and the cohort count"
- **Owns:** `core/mapping/build_populate_spec.py`, `docs/mvp/contracts/runtime-shapes.md`, `seed/audits/cord-ph/populate.json`
- **Do:** reshape `populate.json` from v1 (`schema_version "1"` + fixed `filters[]`) to **v2**: drop `filters[]`; add a **`cohort` block** `{database, from (joinable base), identity_select, where:[]}` generated from A6's criteria linkage (`from`/`identity_select`/join path come from the criteria section), plus the unchanged region skeleton (cell map, identity keys, code_sets) scoped to the cohort identities. Update `validate_populate_spec` for v2 (validate the cohort block; drop the v1 `filters[]`/per-region-bind requirements) and re-freeze runtime-shapes.md §3 to v2. Keep the read-only/parameterised invariants. Fed by A6.1's `criteria_bindings`.
- **Context:** A3 (v1 generator + validator) — extend, don't fork; A6 (criteria → cohort base + linkage); doc 5 has the concrete v2 JSONC; the orchestrator (B7) gains the matching compose step.
- **Depends on:** A6.1, A3  · **Parallel-safe:** yes (shares the cohort contract with B6).  · **Verify:** cord-pH `populate.json` is `schema_version "2"` with a `cohort` `{database, from, identity_select, where:[]}` matching the mapping criteria base; the validator accepts v2 and rejects v1-only specs; runtime-shapes.md §3 documents v2.

### A4 — Tier 1 `try_direct` (deterministic per-cell fill) + `run_readonly_sql`
- **Spec:** 4-indexing-and-mapping.md §Phase 3; 10-status-and-blocked-items.md (`IDENTITY_UNRESOLVED`); run-population-redesign.md §7 (the unified cell contract)
- **Owns:** `core/running/try_direct.py`, `core/running/sql.py`, `agent/.opencode/tools/populate.py`
- **Do:** `try_direct` (Tier 1; renames `core/running/executor.py` → `try_direct.py`): the deterministic per-cell mechanic. Given a target (cell → db column + code_map) and a row from a bulk region query, map the column value, apply the code_map, return a Cell — filled, or non-clean (NULL / value-not-in-code_map). Record `attempts[0].sql` as the **narrowed** per-cell projection (`SELECT <column> FROM <table> WHERE <identity>=<id>`), not the wide bulk query, so an escalated cell carries focused context. Identity missing/mismatched → `IDENTITY_UNRESOLVED`; never combine mismatched identities; never run generated/edited code. The Phase-1 bulk loop in the orchestrator (A11) runs each region query ONCE for max coverage and calls `try_direct` per mapped row × column; non-clean cells are returned for escalation — `try_direct` never calls an LLM. Also extract `run_readonly_sql(database, sql, params)` into `core/running/sql.py` (`validate_sql` + `readonly_connection` + execute): the one read-only primitive used by `try_direct`, the `try_llm` retries, and mirrored by the agent runtime. **Principle:** `try_direct`'s code_map is the ONLY place the precompiled (possibly stale) translation is applied; higher tiers return final values never re-translated here.
- **Context:** existing `populate.py` tool + `_sql_runtime.py` (`readonly_connection`); doc 4 §read-only & safety; run-population-redesign.md §3 (triggers) + §6 (contract).
- **Depends on:** A3, W0.2, W0.3, S1  · **Parallel-safe:** no (Gate 1 producer).  · **Verify:** `try_direct` fills cord-pH direct cells from a bulk region row; a clean hit emits `resolved_by: direct` + one no-error attempt carrying a NARROWED single-column query; NULL / unknown-code → non-clean (returned, not blocked); a forced identity mismatch → `IDENTITY_UNRESOLVED`, never mixes patients.

### A8 — Tier 2 `try_llm` (two-step)
- **Spec:** run-population-redesign.md §4 (one cheap LLM pass per open cell), §8 (the triage-decision contract); contracts/cell-resolution.schema.json
- **Owns:** `core/running/try_llm.py`
- **Do:** `try_llm` (Tier 2, `core/running/try_llm.py`): one cheap pass per OPEN cell. Two looks. First look: given only the cell's failed attempt(s) + the field requirement (type + code set), the LLM proposes a final audit-coded value OR one retry query (it may NOT escalate yet). On retry the orchestrator runs that read-only query via `run_readonly_sql`, appends it to the cell's `attempts`, and shows the rows; second look: propose a value OR escalate. A proposed value is the final coded value (the LLM picks the code from the requirement) which the orchestrator **writes to the cell in place**; escalate leaves the cell OPEN for Tier 3. On the `solution` decision, **validate the proposed value against the field's code set before writing**: off-code → do not write, leave the cell `pending`, and append the rejection to `attempts[]` (synthetic `sql: "<no query — write-time validation>"`, `error: "value <X> not in field <F>'s code set"`, `tier: LLM`) for Tier-3 escalation (run-population-redesign.md §2/§3/§5). `try_llm` never holds a DB connection. ≤2 LLM calls and ≤1 query per cell. The decision shape is the `triage_decision` in cell-resolution.schema.json.
- **Context:** run-population-redesign.md §3/§4/§8; reuses `_sql_validate.validate_sql` + the read-only connection; consumes/produces cell-resolution.schema.json.
- **Depends on:** A4, S1  · **Parallel-safe:** no.  · **Verify:** a code-drift cell (raw "Emergency caesarean" vs code set) is written filled in place at the first look (`resolved_by: LLM`, hypothesis set); an empty value is solved via one retry against `clinical_notes` (verbatim evidence + source `row_id`); an unresolvable cell is left OPEN (not blocked) for Tier 3; a code-drift solution (`'Female'` instead of `'2'`) is rejected — the cell stays `pending`, the rejection rides on `attempts[]`, and the cell is left OPEN for Tier 3.

### A9 — Tier 3 `try_agent` (thin bridge to the opencode agent + cell-fill skill)
- **Spec:** run-population-redesign.md §5 (one agent over all the open cells), §7 (the unified cell contract); contracts/cell-resolution.schema.json
- **Owns:** `core/running/try_agent.py`, `agent/workflows/cell-fill.md`, `agent/opencode.json`, `AGENTS.md`
- **Do:** Tier 3 = the existing opencode agent plane; ONE session over ALL still-open cells. `try_agent` (thin bridge in `core/running/try_agent.py`) starts the opencode session (skill `cell-fill`) and waits; the agent works the cell STORE (C1) THROUGH TOOLS and writes cells IN PLACE — no context dump. Given lean + progressively: (1) an OVERVIEW of open cells structured BOTH ways via the `open_cells` tool (per field → which members; per member → which fields), pulling one cell's detail on demand; (2) the table/column STRUCTURE only (lean schema view), NOT the full `database.json` (no allowed-value sets/ranges); (3) cohort-scoped read-only SQL (cohort predicate always ANDed in — never outside the cohort); (4) `write_cell` — writing is the moment the field's audit code set is revealed so the agent stores the correctly-coded value (progressive disclosure: structure to investigate, codes to write). The `write_cell` tool **validates against the field's code set on write**; an off-code value is rejected at the tool boundary (the cell stays `pending`, the rejection lands on `attempts[]` with `tier: agent` and the synthetic `sql: "<no query — write-time validation>"`) and the rejection is surfaced to the agent so it retries; a second off-code strike within the agent budget terminalizes the cell as `blocked` with `reason_code: DATA_CONFLICT` (run-population-redesign.md §2/§3/§5). Seeing the whole grid it reuses a fix along EITHER dimension (a field across members; a member across fields) by writing those cells in place. A cell it cannot solve it writes `blocked`. Runs under a budget cap. **Policy change:** add this sandboxed capability (read-only SQL + lean schema + run-state read/write, mandatory cohort predicate) to `agent/opencode.json` + AGENTS.md (cell-fill skill at `agent/workflows/cell-fill.md`), distinct from the bulk run agent.
- **Context:** run-population-redesign.md §5; reverses the AGENTS.md "run agent never sees the schema" rule for THIS sandboxed tier only; reuses the read-only guard; the cohort predicate comes from `populate.json`'s cohort block (A7).
- **Depends on:** A8  · **Parallel-safe:** no.  · **Verify:** the agent's every query carries the cohort predicate and cannot return a row outside the cohort; given the open-cell overview it fills a whole field's open cells from one fix AND fixes a single member's several open fields from one investigation; cells with no value anywhere are written `blocked`/`NOT_LOCATED`; only at write does it receive the field's code set; the bulk run agent's allow-list is unchanged; an agent attempting an off-code write is rejected at the tool boundary; a persistently off-code cell ends `blocked`+`DATA_CONFLICT`, never silently `filled`.

### A11 — Orchestrator — the cell store + the 3-tier run
- **Spec:** run-population-redesign.md §6 (the cell store, events, and data flow); contracts/cell-resolution.schema.json
- **Owns:** `core/running/orchestrator.py`
- **Do:** the ORCHESTRATOR (`core/running/orchestrator.py`) owns the cell STORE (C1's `cells` table) and drives the run; the tier functions do neither. STEP 0 — PRECOMPUTE: from `populate.json` + the resolved cohort, insert one PENDING cell per (region × cohort member × cell_map entry), each with `sheet`, `ref`, `field`, `member` already set. Tier 1: run each region query once and UPDATE the pending cells in place (filled or error). Tier 2: for each error cell, run `try_llm` and write the result in place. Tier 3: if any cells are still open, run ONE `try_agent` session over all of them (it writes in place via tools). No domino, no leader/listener, no per-field coordination — tiers just write the store; Tier 3 reuses fixes itself. Every write persists (C1) + streams `cell_update`; emit `activity` lines + `done`.
- **Context:** run-population-redesign.md §6; sits between A4's escalation hook and A8/A9; A10 reads these cells.
- **Depends on:** A8, A9, B7  · **Parallel-safe:** no.  · **Verify:** at run start one pending cell per (field × member) exists in C1 with `sheet`/`ref` set; Tier 1 updates pending cells in bulk; a cell whose identity returned no row stays pending and ends `IDENTITY_UNRESOLVED`; only error cells reach Tier 2; only still-open cells reach a SINGLE Tier-3 agent session; every cell write persists + streams `cell_update`; the run ends complete with no cell left pending.

### A10 — Deferred reconciler (reads the run's cells)
- **Spec:** run-population-redesign.md §9 (deferred auto-apply — the reconciler reads the cells); mapping-artifact-redesign.md §6 (regenerable vs state)
- **Owns:** `core/mapping/reconciler.py`
- **Do:** never mutate the binding mid-run. The CELLS THEMSELVES are the backlog: every Tier-2/Tier-3 resolution leaves full provenance on the cell (`attempts[0]` = failed Tier-1 query; `sources`/evidence = successful resolution; `hypothesis` = the diagnosis). After the run / nightly, the reconciler reads the cells, groups by field, and pattern-matches systemic fixes (many cells converged on the same alternative column / value→code mapping / interpretation). AUTO-APPLIES by regenerating `mapping.json` / `populate.json` / code maps, committed only if the regenerated binding (a) validates against its S0 schema and (b) passes a dry-run on previously-passing records. `audit.json` user state is never auto-touched. D9 can inspect what changed. No separate `fill_rule` object to keep in sync with the cells.
- **Context:** run-population-redesign.md §9; the regenerable-vs-state line; reuses the A1.1/A2.1/A3 builders for regeneration + their schema validators for the gate.
- **Depends on:** A11  · **Parallel-safe:** yes.  · **Verify:** a Tier-2/Tier-3 resolution leaves `attempts`/`sources`/`hypothesis` on the cell and the binding is NOT mutated mid-run (previewed cohort == populated cohort); the reconciler reads the run's cells, regenerates the binding, and commits only when schema-valid + dry-run passes; a regeneration that fails either gate is rejected.

### A5 — cord-pH seed fixtures (criteria + populate v2)
- **Spec:** 4-indexing-and-mapping.md §"Artifacts per audit"
- **Owns:** `seed/audits/cord-ph/`, `seed/databases/cord-ph/`, `database/scripts/seed_agent.py`
- **Do:** consolidate the split seed dirs (`cord-ph/` vs `cord-ph-audit/`) into ONE canonical `seed/audits/cord-ph/` {`audit.json`, `audit.xlsx`, `mapping.json` (with the A6.1 `criteria_bindings`), `populate.json` (A7 v2 cohort block)} + `seed/databases/cord-ph/database.md`, wired through `seed_agent` so `make seed` boots `ready` with zero LLM calls. De-prioritised (founder does not need fake data) but required by E1. Fixes the orphaned `populate.json` under `seed/audits/cord-ph/` that `seed_agent` never reads (it keys on `cord-ph-audit`).
- **Context:** existing seed plane; the dir split + orphaned `populate.json`; A6.1 `criteria_bindings`; A7 populate v2.
- **Depends on:** A6.1, A7  · **Parallel-safe:** no.  · **Verify:** `make seed` → one cord-pH audit with mapping criteria + v2 `populate.json` + DB, all `ready`, no LLM calls.

---

## Lane B — Run engine  (`core/running`)

### B1 — Orchestrator multi-DB binding
- **Spec:** 5-run-engine.md §Run inputs; 4 §multi-database (TODO-0050)
- **Owns:** `core/running/orchestrator.py`
- **Do:** bind a run to **N databases** (not one); pass the set to the run; persist `database_ids` on the run.
- **Context:** existing orchestrator binds one DB; TODO-0050.
- **Depends on:** W0.2  · **Parallel-safe:** yes (against frozen schema).  · **Verify:** a run targeting ≥2 DBs reaches the run (Tier 1) with all of them.

### B3 — Run streaming (SSE events)
- **Spec:** 5-run-engine.md §Streaming (W0.3 event contract)
- **Owns:** `server/routes/runs.py`, `core/running/run_audit.py`
- **Do:** stream `activity`/`workbook_created`/`cell_update`/`done`/`error` per the contract; emit `workbook_created` (chip) seconds in, not on done.
- **Context:** `OpenCodeRunner.stream_events`; the demo event model.
- **Depends on:** W0.3  · **Parallel-safe:** yes.  · **Verify:** a run emits the chip early and per-region `cell_update`s; the FE renders against these.

### B4 — Status lifecycle + blocked-item computation
- **Spec:** 10-status-and-blocked-items.md §lifecycle; 5 §Run status
- **Owns:** `core/running/` (status), `server/routes/runs.py`
- **Do:** compute run status (queued/in_progress/blocked/in_verification/complete) and the blocked list **from persisted `cells`** (durable, GAP-3) — not the chat stream.
- **Context:** doc 10; the W0.2 `cells` schema.
- **Depends on:** W0.2, A4  · **Parallel-safe:** partial.  · **Verify:** a run with ≥1 blocked cell reports Blocked + count from the DB even if the final message never posts.

### B5 — Stop + idempotent re-run (A1)
- **Spec:** 5-run-engine.md §"Stop + re-run"
- **Owns:** `core/running/orchestrator.py`, `core/running/run_audit.py`
- **Do:** Stop = `JobRunner.stop`. Re-run = re-issue skipping cells already filled; **never overwrite `reviewed`/`corrected` cells** (GAP-1); disagreeing new data flagged as conflict. (Pause/resume is vision, A1.)
- **Context:** existing `stop()`; doc 5.
- **Depends on:** B7  · **Parallel-safe:** no.  · **Verify:** re-run fills only blocked/unfilled cells, preserves corrected ones, double-writes nothing (Q28).

### B6 — Run-time filter resolution + cohort-count preview (menu-selection)
- **Spec:** 2-product-flows.md §"Filter resolution and the cohort-count preview"; 5-run-engine.md §"Filter resolution and the cohort count"
- **Owns:** `core/running/filters.py` (new), `server/routes/runs.py`, `app/src/lib/spec.js`, `app/src/lib/api.js`
- **Do:** at run time, **one** LLM call **matches** the user's free-text to the audit's **prelinked criteria menu** (from A6 — read it, don't reason over the schema) and **concept-links values** ("date of birth"↔"age", "caesarean"→the real `delivery` value). It **selects from the menu**, it does NOT author arbitrary SQL — each resolved item becomes that menu dimension's parameterised `WHERE` condition with `:named` params. Compose the conditions + run a read-only `COUNT(DISTINCT identity)` for the live "Exactly N {patients|encounters} match" preview (`CohortPreview`); the composed query is checked by the existing guard (`_sql_validate.validate_sql` + `readonly_connection`). On confirm, pass the **same** conditions to the run (B7 composes them — no re-resolution). A request that maps to no menu dimension is "not available for this audit"; an ambiguous one is "unresolved" — two distinct messages, never silently dropped. **Path 1** (run the national audit): no user criteria → apply the audit's canonical default cohort (A6) with zero resolution. Reuse the D2/D3 `InputSpec`/`OutputSpec`/`CohortPreview` + `JobSpec`; extend the chip with `sql`/`params`; replace the mock `parseRequest`/`resolveCohortCount`. **Structured-only** (free-text cohort concepts deferred — P1).
- **Context:** A6 (the menu — the resolution input); A7 (the cohort shape it composes into); B7 (applies the conditions); D2/D3 (merged FE + mock to replace); the read-only guard; doc 5 concrete shapes.
- **Depends on:** A6.1, A7, D2, D3, B7  · **Parallel-safe:** yes.  · **Verify:** for a user criterion the call returns a chip + the menu dimension's parameterised condition (referencing only a real prelinked column); `CohortPreview` shows a real read-only COUNT (not the seeded mock); no-criteria → the canonical cohort; an off-menu request says "not available for this audit"; an ambiguous one says "unresolved"; the conditions previewed == the conditions run.

### B7 — Run wiring via the orchestrator: direct resolver + cohort compose (Gate-1)
- **Spec:** 4-indexing-and-mapping.md §Phase 3; 5-run-engine.md §Streaming
- **Owns:** `core/running/run_audit.py`, `core/running/orchestrator.py`, `core/running/try_direct.py`
- **Do:** wire the run through the ORCHESTRATOR: it loads `populate.json` and drives `try_direct` (A4) for direct cells (today the run goes through the opencode agent and `try_direct` is imported by nothing). Add the COMPOSE step: AND the run's validated cohort `where[]` conditions into `populate.json`'s cohort block, select the cohort identities, and scope every region to them. This is the Gate-1 wiring; the tiered escalation (`try_llm`/`try_agent`) layers on top in A11.
- **Context:** A4 `try_direct` + C1 store are built to-contract but UNWIRED (review 2026-06-05); A7 (v2 cohort shape); B6 (the conditions to compose); doc 10 status derives from persisted cells (B4 builds on this).
- **Depends on:** A4, A7, C1  · **Parallel-safe:** no.  · **Verify:** a real cord-pH run calls `try_direct`, the cohort conditions narrow the rows, the produced cells persist in the `cells` table, and the FE renders live `cell_update`s with a real `activity` headline — without the opencode agent populating direct cells.

---

## Lane C — Platform  (`server/`, DB)

### C1 — State DB (runs / cells / events) — A4
- **Spec:** 7-auth-and-audit-log.md §State data model; §Persistence
- **Owns:** `core/store/` (new), `server/`, `database/` (migrations)
- **Do:** implement the W0.2 schema as a real local DB; CRUD for runs/cells/events. This is the Gate-1 foundation Lane B writes to and Lane D reads.
- **Context:** doc 7 §Persistence (hospital-hosted later; local now).
- **Depends on:** W0.2  · **Parallel-safe:** yes (Gate 1 producer).  · **Verify:** a run + its cells + events persist and reload; status derives from them.

### C2 — Auth + network gate + sessions + attribution
- **Spec:** 7-auth-and-audit-log.md §Access; §Attribution
- **Owns:** `server/` (auth middleware/routes), `app/src/components/` (login)
- **Do:** login required for all access; per-user identity attached to every run + DB query; sessions (log out / back in → own history). Local accounts for MVP; SSO later.
- **Context:** doc 7 §access; open-questions Q11 (mechanism).
- **Depends on:** W0.2  · **Parallel-safe:** yes.  · **Verify:** anonymous sees nothing; every run + query is attributed; re-login shows own audits.

### C3 — Run log + prompt versioning + query-access logging
- **Spec:** 7-auth-and-audit-log.md §Run log; §Prompt versioning
- **Owns:** `core/`, `server/`
- **Do:** structured run record (request, target, filters, activity, params, **prompt version**, per-cell results + verifications, template version); log every DB query against the user.
- **Context:** doc 7; the W0.2 `events` table; TODO-0005.
- **Depends on:** C1  · **Parallel-safe:** yes.  · **Verify:** every run produces a queryable record incl. prompt + template version.

### C4 — Gated reminder drafting + chase list
- **Spec:** 10-status-and-blocked-items.md §Actionability; §Auth/IG
- **Owns:** `server/`, `core/`
- **Do:** group blocked items by owner; **draft** a reminder naming the missing patients/fields; sending is human-initiated (never silent).
- **Context:** doc 10 §actionability; the blocked list (B4).
- **Depends on:** B4, C2  · **Parallel-safe:** yes.  · **Verify:** blocked items group by owner; a draft is produced; nothing sends without an explicit human action.

---

## Lane D — Frontend  (`app/`) — flip mock per domain as backend lands

### D1 — api.js per-domain wiring + revert "analysis" → "audit"
- **Spec:** 3-architecture.md §seam; README §terminology
- **Owns:** `app/src/lib/api.js`, copy across `app/src/components/`
- **Do:** wire each `api.js` function to flip to the real endpoint when its domain flag is off (W0.4); revert demo "analysis" copy to "audit".
- **Depends on:** W0.4  · **Parallel-safe:** yes.  · **Verify:** with all flags on, app behaves as the demo; flipping one domain hits the real API.

### D2 — Template entry: + menu, prompt-identify + always-confirm chip
- **Spec:** 2-product-flows.md §Flow A; 9-library-and-sources.md
- **Owns:** `app/src/components/HomeScreen.svelte`, `PromptInput.svelte`, the output-spec chip components
- **Do:** the `+` menu (upload / select existing); prompt-identifies a template; **always show the resolved template as an editable chip the user confirms before run** (GAP-2); indexing badge.
- **Depends on:** W0.1  · **Parallel-safe:** yes (against mock).  · **Verify:** all three entry routes end at a confirm-before-run chip.

### D3 — Filter interaction: debounced extraction + manual add-filter
- **Spec:** 2-product-flows.md §Filter interaction (S4)
- **Owns:** `app/src/components/spec/*` (InputSpec, Chip, AddFilterChip, etc.)
- **Do:** real-time extraction that is **debounced, cancellable, diff-only** (never per-keystroke, never collapse to zero); working manual add-filter; agent-suggested criteria/databases that **complement, never overwrite**.
- **Depends on:** W0.1  · **Parallel-safe:** yes.  · **Verify:** typing updates chips additively without collapsing; add-filter+Enter adds a chip.

### D4 — Run view: activity feed, live population, final summary, stop/re-run
- **Spec:** 2-product-flows.md §run experience; 5-run-engine.md
- **Owns:** `app/src/components/ResultsView.svelte`, `Chat.svelte`, `MessageBubble.svelte`
- **Do:** fixed-height collapsed/expanded activity feed; chip-on-create; progressive cell fill; **final summary message** listing blocked items; **stop + re-run** controls (no pause/resume).
- **Depends on:** W0.3  · **Parallel-safe:** yes.  · **Verify:** chip appears mid-run; blocked items show only in the summary + status, not the sheet.

### D5 — Traceability panel + heat-map + review gate + clean export
- **Spec:** 6-traceability-evidence.md; 2 §interpretive gate
- **Owns:** `app/src/components/RightPanel.svelte`, `SpreadsheetViewer.svelte`, `NoteEvidenceView.svelte`, `SqlResultViewer.svelte`
- **Do:** click → evidence (query/queries + result | full notes with verbatim highlights); confidence heat-map (low/med/high) + kind marker + two review flags; **dwell ~2s → reviewed**, **double-click → edit**; export = clean submit-ready `.xlsx`, download never blocked.
- **Depends on:** W0.3  · **Parallel-safe:** yes.  · **Verify:** interpret cell flips to reviewed on view; export has no markers/sheets; download works at any status.

### D6 — Library surface (doc 9)
- **Spec:** 9-library-and-sources.md
- **Owns:** `app/src/components/` (new Library views), `SettingsModal.svelte`
- **Do:** Audit-templates + Databases card grids; detail = mental model (`audit.json`+`mapping.json`+`populate.json`) | real template; versioning metadata + staleness; read-only national/BPT with clone, editable local.
- **Depends on:** W0.1  · **Parallel-safe:** yes.  · **Verify:** cards show scheme/year + last-pulled; detail shows the mental model; national items are clone-only.

### D7 — Status Kanban dashboard (doc 10)
- **Spec:** 10-status-and-blocked-items.md §dashboard
- **Owns:** `app/src/components/` (new dashboard), `app/src/stores/`
- **Do:** columns by status; cards = runs with blocked count + most-common reason/owner.
- **Depends on:** W0.1, B4 (status)  · **Parallel-safe:** yes (against mock until B4).  · **Verify:** runs appear in the right column with blocked counts.

### D8 — Design tokens + audit-specific semantic layer (doc 8)
- **Spec:** 8-design-system.md
- **Owns:** `app/src/app.css`, `app/src/components/Icon.svelte`
- **Do:** put the token set + semantic tokens (confidence, review-state, status, kind) in `:root`; one icon family; no raw hex in components.
- **Depends on:** —  · **Parallel-safe:** yes (start immediately; foundation for D2–D7).  · **Verify:** components reference `var(--…)`; no token-covered raw values.

### D9 — Library: criteria + DB-link review/edit surface
- **Spec:** 9-library-and-sources.md; 2-product-flows.md §"Filter resolution and the cohort-count preview"
- **Owns:** `app/src/components/` (library detail), `app/src/lib/api.js`
- **Do:** in the audit-template library detail, surface the mapping-extracted inclusion criteria + their DB links (from A6) as a reviewable, EDITABLE list: the allowable dimensions, the linked `table.column`, allowed values/range, the canonical default cohort, and any not-expressible (deferred) criteria flagged. The user can correct a wrong link/value; edits persist back to the criteria artifact. Auto-populated — review, not configuration. Read-only national items remain clone-to-edit.
- **Context:** D6 (merged — the library mental-model viewer; extend AuditDetail); A6 (the criteria artifact); the automatic-extraction + library-review model (2026-06-05).
- **Depends on:** A6.1, D6  · **Parallel-safe:** yes.  · **Verify:** the library detail shows the extracted criteria + DB links + canonical cohort; editing a link persists; deferred (free-text) criteria are visibly flagged.

### D10 — Template-anchored run gate (drop synthesis)
- **Spec:** 2-product-flows.md §Flow A; README §terminology
- **Owns:** `app/src/components/HomeScreen.svelte`, `PromptInput.svelte`, the run-create path
- **Do:** enforce template-anchored runs (P1): every run resolves to a pre-existing template (upload now / select existing / prompt-identifies an existing one). A request matching NO template does NOT synthesise one — it stops and asks the user to upload or pick a template. Demote the no-template free-text-synthesis path (`createRunFromDescription` synthesis / `/api/generate`) to the 100-day backlog. The always-confirm template chip (D2) is the gate that unlocks filter resolution (B6).
- **Context:** D2 (merged — the confirm chip); the template-first sequencing (2026-06-05); Flow B in api.md.
- **Depends on:** D2, P1  · **Parallel-safe:** yes.  · **Verify:** a prompt with no matching template prompts the user to upload/select (never synthesises); the confirmed-template chip gates the filter step.

---

## Lane E — Tests / evals

### E1 — Tier-1 golden test (try_direct)
- **Spec:** acceptance-criteria.md §Testing & evals; 4 §Phase 3
- **Owns:** `core/test/try_direct_golden_test.py` (new)
- **Do:** run Tier 1 (`try_direct`) on the cord-pH fixtures + the resolved cohort; assert the exact expected filled cells + `IDENTITY_UNRESOLVED` behaviour.
- **Depends on:** A4, A5  · **Verify:** deterministic pass on the golden set.

### E2 — Interpretive eval harness (S3)
- **Spec:** acceptance-criteria.md §Testing & evals; 5 §accuracy bar
- **Owns:** `evals/` (new)
- **Do:** score cord-pH interpret cells vs expected, tied to prompt version; track the not-edited rate (the accuracy bar).
- **Depends on:** A4, A5  · **Verify:** eval runs, reports the not-edited rate per prompt version.

### E3 — End-to-end demo-gate test
- **Spec:** acceptance-criteria.md §"The end-to-end demo gate"
- **Owns:** `test/demo_gate_test.py` (new)
- **Do:** logged-in clinician runs the cord-pH audit → live population → verify a cell → correct one → blocked item surfaces → clean export; attributed + logged; nothing fabricated; nothing leaves local.
- **Depends on:** Lane B complete, Lane D flipped, C1–C3  · **Verify:** the demo gate passes end to end (Gate 3).

---

## Gates (the wait + merge points)

| Gate | Merge condition | Unblocks |
|---|---|---|
| **0** | W0.1–W0.4 merged | All lanes branch from a stable contract base |
| **1** | A4 (`try_direct`) + C1 (state DB) merged | B7 wires the orchestrator; the ladder (A8→A9→A11→A10) layers on; Lane B integrates (B4, B6, B5) |
| **2** | B/C endpoints live per domain | Lane D flips that domain off the mock (D1–D10) |
| **3** | Full cord-pH integration + E3 green | MVP complete (acceptance-criteria.md) |

## Plan / scope tasks

### P1 — v1 scope freeze: structured-only, template-anchored; defer the rest to vision
- **Spec:** 2-product-flows.md; 4-indexing-and-mapping.md §Phase 2; 5-run-engine.md §"Filter resolution and the cohort count"; vision-100-days.md
- **Owns:** `docs/mvp/vision-100-days.md`, `docs/mvp/2-product-flows.md`, `docs/mvp/4-indexing-and-mapping.md`, `docs/mvp/5-run-engine.md`, `docs/mvp/BUILD-PLAN.md`, `todos.md`
- **Do:** freeze the v1 cohort-filter scope: (1) **structured-only** — inclusion criteria resolve to SQL `WHERE` over real columns; concepts living only in free-text notes are out of v1. (2) **template-anchored** — every run resolves to a pre-existing template; ad-hoc free-text needing template *synthesis* is out of v1. Record the deferred capabilities (free-text/interpretive cohort filtering; no-template template synthesis; national-spec auto-ingestion) as 100-day items. Update docs 2/4/5 to the **mapping-time** criteria-extraction model (criteria + DB-link computed at upload, reviewed in the library; populate spec carries a cohort block).
- **Context:** the 2026-06-05 design decision (mapping-time criteria, two paths, automatic + library review); Lane A; the NOT-in-plan list.
- **Depends on:** —  · **Parallel-safe:** yes.  · **Verify:** docs 2/4/5 describe structured-only + template-anchored + mapping-time criteria; vision-100-days.md lists the three deferred capabilities; no spec still claims free-text cohort filtering or template synthesis is in v1.

## NOT in this plan (deferred)
- 100-day vision items (vision-100-days.md): self-improvement loop, scheduled runs, role dashboards, true pause/resume.
- **Free-text / interpretive cohort filtering** (filtering the cohort on concepts that live only in notes) — v1 is structured-only (P1).
- **No-template ad-hoc runs / template synthesis** from free text — v1 is template-anchored (P1).
- National-schema auto-ingestion + BPT-template synthesis + staleness detection (doc 9 fast-follow).
- Hospital-hosted DB + SSO (doc 7 — local for MVP).
- Open questions in open-questions.md remain cofounder/implementation decisions, not tasks.
