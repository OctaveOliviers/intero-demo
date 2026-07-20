# Contract — Runtime shapes (events, cell metadata, executor spec)

**Status: frozen.** This is the shared contract for the three runtime data
shapes table population touches: the **SSE event stream** table population emits, the **per-cell metadata**
object every populated cell carries, and the **executor spec** (the compiled prepopulate plan) the
fixed executor reads. These shapes are the seam the runtime is built against:

- The pipeline (`core/indexing`, `core/mapping`, `core/table_population` executor) **writes** cells and
  **produces** the executor spec.
- The table-population route (`core/table_population`, `server/routes/table_populations.py`) **emits** the SSE events.
- The front end (`app/`) **renders** the events and the cell metadata.

> **Note.** The §3 spec below lives **inside** `mapping.json` as the "compiled executable"
> half — same shape, same fields, same validator — not as a separate `populate.json` file. See
> [`storage-layout.md`](storage-layout.md) for the canonical layout.

Spec sources: [5-table-population.md §Streaming](../features/table-population.md#streaming-table-population),
[6-traceability-evidence.md §Per-cell metadata](../features/traceability-and-evidence.md#per-cell-metadata),
[4-indexing-and-mapping.md §Phase 3](../features/indexing-and-mapping.md#phase-3--precompute-the-executable-block).
Reason-code taxonomy and per-cell `state`:
[10-status-and-blocked-items.md](../features/status-and-blocked-items.md). Existing demo event model:
`app/src/lib/mock.js` / `app/src/lib/mockData.js`.

> **Demo vs MVP.** The demo (`mockData.js`) ships a working subset of these shapes. Where the
> MVP contract differs, this doc is authoritative and a **Demo note** flags the migration the
> lanes must make (e.g. `kind: "interpretive"` → `"interpret"`; a single `database`/`sql` on
> meta → a `sources` **list**). Conventions: cell metadata is keyed `"<Sheet>!<A1>"`;
> `confidence` is always one of the words `low` / `medium` / `high` (never a number).

---

## 1. SSE event contract (v2 strict)

> **Authoritative contract: [`runtime-events.schema.json`](runtime-events.schema.json).**
> That JSON Schema is the machine-checkable source of truth for all seven event payloads;
> this section is its prose companion — keep the two in sync.

Table population streams Server-Sent Events to the front end as a single user-facing timeline. Exactly
**seven** event types are allowed. The wire format is **message-only SSE framing**:
each SSE message has a `data:` line containing one JSON object, and the canonical event
discriminator is `data.type`. No `event:` line is required for table-population events.
No aliases, fallback names, or mixed payload shapes are allowed. Allowed `data.type` values:
`activity`, `workbook_created`, `cell_update`, `review_summary`, `refresh_summary`, `done`,
`error`.

Canonical ordering guarantees:

```
activity* ─▶ workbook_created ─▶ (activity | cell_update)* ─▶ review_summary
                                                   │            ─▶ [refresh_summary] ─▶ done
                                                   └──────────────────────────▶ error
```

- `workbook_created` is emitted **once** and appears before any `cell_update`.
- `cell_update` may be emitted many times.
- `review_summary` is emitted **exactly once** and is the terminal reviewer-focused event.
- `refresh_summary` is emitted **exactly once on refresh executions only** ([refresh.md](../features/refresh.md)), after
  `review_summary` and before `done`; an initial table population never emits it.
- `done` is emitted **exactly once** and appears **after** `review_summary`.
- `error` is terminal for failed runs; when emitted, no later `review_summary` or `done` is sent.
- Partial results streamed before `error` remain persisted.

| event | payload | UI effect |
| --- | --- | --- |
| `activity` | `{ headline, detail?, name?, status? }` — `headline` required, non-empty | append to the activity feed; `headline` (one short line) drives the collapsed status |
| `workbook_created` | `{ label, sheets, cellMetadata }` | set the active workbook (structured, body empty), **emit the file chip now** |
| `cell_update` | `{ sheet, cells: [{ ref, value, meta }] }` | write the value(s), attach metadata, flash the filled cell(s) |
| `review_summary` | `{ totals, blocking, verification }` | the reviewer-focused terminal summary — the **final entry in the agent-activity feed** ([result-view.md](../features/result-view.md)) |
| `refresh_summary` | `{ summary }` — refresh executions only | show what this refresh changed, grouped under the refresh's activity |
| `done` | `{}` — on refresh executions also carries the same `summary` object | mark complete; do not emit a second chip |
| `error` | `{ message, scope? }` | surface the error + reason; per-region `scope` where possible |

### `activity`
```jsonc
{ "headline": "Reading the midwife's notes…", // REQUIRED — one short line; drives the collapsed status row
  "detail": "…",                            // optional — longer text for the expanded log
  "name": "populate",                       // optional — a tool/step name
  "status": "running" }                     // optional — "running" | "ok" | "error"
```
`headline` is **required** and must be a single short line (the collapsed status row is
fixed-height and must not jump). `detail` / `name` / `status` are optional.

### `workbook_created`
```jsonc
{ "label": "cord-ph-lo-audit.xlsx",        // file-chip label
  "sheets": [                               // structured but body-empty: headers/regions present
    { "name": "ALL",  "data": [ ["…header…"], ["",""] ], "meta": [ /* per-column meta */ ] },
    { "name": "NICU", "data": [ … ],                      "meta": [ … ] }
  ],
  "cellMetadata": {} }                       // empty at creation; filled by later cell_update events
```
Emitted **once**, early. The workbook starts structured (headers/regions present) and
body-empty; cells fill via `cell_update`.

### `cell_update`
```jsonc
{ "sheet": "ALL",
  "cells": [
    { "ref": "C4", "value": "7.28", "meta": { /* §2 per-cell metadata */ } },
    { "ref": "C5", "value": "Concordant", "meta": { … } }
  ] }
```
`ref` is an A1 reference **within `sheet`**; the global metadata key is `"<sheet>!<ref>"`.
A batch may carry one region's worth of cells (one direct query) or a single interpret cell.
A blocked cell appears here too, with **no `value`** and a `meta.state` of `"blocked"`
(see §2). A cell is clickable/traceable the moment it arrives; selecting it must not
interrupt the stream.

### `review_summary`
```jsonc
{ "totals": { "cells": 480, "filled": 462, "blocked": 8, "needs_verification": 10,
              "low_confidence": 12 },
  "blocking": { "count": 8,
    "reason_codes": {
      "MISSING_SOURCE_RECORD": 5,
      "IDENTITY_UNRESOLVED": 3
    },
    "focus": [
      { "reason_code": "MISSING_SOURCE_RECORD", "count": 5,
        "sample_refs": ["ALL!S4", "ALL!S7"],
        "detail": "Source record missing from extract." }
    ] },
  "verification": { "pending": 10, "reviewed": 0, "corrected": 0,
    "focus": {
      "needs_review": [
        { "ref": "ALL!S4", "field": "delivery_mode", "member": "P-0001", "state": "filled" }
      ],
      "low_confidence": [
        { "ref": "ALL!S4", "confidence": "low", "rationale": "Inferred from narrative note." }
      ],
      "assumptions": [
        { "ref": "ALL!S4", "hypothesis": "Likely elective section based on operative note." }
      ]
    } } }
```
Emitted once, immediately before `done`. This is the reviewer-focused terminal summary for the
timeline and includes:
- `totals` with required integer fields: `cells`, `filled`, `blocked`, `needs_verification`
  (the **derived** needs-verification count — [table-population.md](../features/table-population.md) §Cell state model), `low_confidence`.
- `blocking` with required fields: `count` (integer), `reason_codes` (map of `reason_code -> count`),
  and `focus` (list of grouped reviewer-facing blocking items with `reason_code`, `count`,
  `sample_refs`, `detail`).
- `verification` with required fields: `pending`, `reviewed`, `corrected` (integers), plus
  `focus` containing reviewer queues for `needs_review`, `low_confidence`, and `assumptions`.

### `refresh_summary`
```jsonc
{ "summary": {
    "new_members_count": 2,        // cohort members added by this refresh
    "departed_members_count": 1,   // members now out of cohort (retained, marked inactive)
    "retried_blocked_count": 3,    // blocked cells reopened blocked -> pending at refresh start
    "resolved_blocked_count": 2,   // of those, settled out of blocked this execution
    "remaining_blocked_count": 1,  // blocked cells still open across active members
    "updated_cells_count": 14 } }  // total cell writes attributable to this execution
```
Refresh executions only ([refresh.md](../features/refresh.md)): emitted once, after `review_summary` and before `done`.
All fields required integers. An initial table population never emits this event.

### `done`
```jsonc
{}
```
Terminal. Marks table population complete for streaming purposes. The table result status is derived
from persisted cells, not this event — [status-and-blocked-items.md](../features/status-and-blocked-items.md). Emits no second chip. On a refresh execution,
`done` additionally carries the same `summary` object as `refresh_summary`.

### `error`
```jsonc
{ "message": "Database connection lost while populating NICU outcomes.",
  "scope": "NICU!region:outcomes" }          // optional — region/sheet scope where possible
```
Surfaces the failure with a reason; per-region `scope` where the failure is localised.
Partial results already streamed persist.

---

## 2. Per-cell metadata object

> **Authoritative contract: [`cell-resolution.schema.json`](cell-resolution.schema.json).** That
> JSON Schema is the machine-checkable source of truth for the cell record. This section is its
> prose companion — keep the two in sync. The cell object is produced by
> both population steps (the prepopulate executor and the table agent) and updated in place in the
> run store; see [5-table-population.md](../features/table-population.md).
>
> The schema's `cell` is the **self-contained** resolved record — it also carries `sheet`, `ref`, and
> `value`. The `meta` object documented below is its **on-the-wire projection**: the same fields
> minus `sheet`/`ref`/`value`, which travel on the SSE `cell_update.cells[]` wrapper (`{ ref, value,
> meta }`) and the `cellMetadata` key `"<Sheet>!<A1>"`.

Every populated cell carries this object, attached as `cell_update.cells[].meta` and stored in
the workbook's `cellMetadata` map keyed `"<Sheet>!<A1>"`. A **blocked** cell has no `value` but
still carries `state` + the blocked-only fields.

```jsonc
{
  "field": "gestation_weeks",       // audit field id (matches spec.json); set at pending-insert  (REQUIRED)
  "member": "P-0001",               // cohort-member identity (patient/encounter code)  (REQUIRED)
  "kind": "direct",                 // "direct" | "interpret"   (REQUIRED)
  "state": "filled",                // "pending" | "filled" | "blocked" | "not_applicable"  (REQUIRED — the four stored states, [table-population.md](../features/table-population.md) §Cell state model; needs-verification is derived, never stored)
  "confidence": "high",             // "low" | "medium" | "high"  — a WORD, never a number  (REQUIRED)
  "resolved_by": "prepopulated",    // "prepopulated" | "agent" — which population step produced it  (REQUIRED)
  "hypothesis": null,               // why the value is hard to place — read by the agent's triage; null on a clean prepopulate hit
  "explanation": "From the EHR birth record for P-0001 — gestation in completed weeks.",

  // --- attempts: the log of ACTUAL DB queries, in order — what the agent reads to pick up
  //     where prepopulate left off (REQUIRED, >=1) ---
  // A clean prepopulate hit is exactly one entry with no error. A new entry is appended only
  // when a query is really run (an agent query) — not for reasoning over fetched data.
  "attempts": [
    { "by": "prepopulate", "database": "cord-ph", "sql": "SELECT PATIENT_CODE, Gestation_weeks FROM cord_ph_birth_records WHERE PATIENT_CODE = :patient", "result": "39" }
  ],

  // --- sources: a LIST, one entry per (database, row) the value drew on. The cohort
  //     identity is NOT repeated here — it is the cell's `member` above. ---
  "sources": [
    { "database": "EHR",            // the source database id/name
      "query": "SELECT PATIENT_CODE, Gestation_weeks FROM cord_ph_birth_records WHERE PATIENT_CODE = :patient",
      "table_column": "cord_ph_birth_records.Gestation_weeks" }  // table.column the value came from
      // a one-to-many source (many notes/patient) or an interpreted value also carries:
      //   "row_id":    "note-8841",   // the evidence row's OWN pk (which of the patient's rows)
      //   "citations": ["Delayed cord clamping performed for about 90 seconds."]
      //                                // verbatim EXACT substrings of THAT note — what used to be the
      //                                // flat cell-level evidence[], now linked to its row
  ],

  // --- interpret-only ---
  "review_state": "not_reviewed",   // "not_reviewed" → "reviewed" (set automatically after ~2s view; [traceability-and-evidence.md](../features/traceability-and-evidence.md))
  "corrected": false,               // false = left as-is (confirmed) · true = edited (the accuracy signal)

  // --- provenance (all cells) ---
  "prompt_version": "table-population@2026-06-01",  // ties to the table-population record ([auth-and-access.md](../features/auth-and-access.md))
  "extracted_at": "2026-06-04T10:32:11Z",

  // --- blocked-only (state == "blocked"); no `value` on the cell ---
  "reason_code": "IDENTITY_UNRESOLVED", // taxonomy below ([status-and-blocked-items.md](../features/status-and-blocked-items.md))
  "reason_detail": "NHS number present in EHR but absent from the Lab extract for spell 2026-04-02; checked patient_demographics and lab_results.",
  "owner_needed": "data team",          // role/specialty/source to chase
  "outstanding_since": "2026-04-02"     // how long the gap has been open
}
```

### Field reference
| Field | Cells | Meaning |
| --- | --- | --- |
| `field` | all | the audit field id this cell carries (matches `spec.json`); set at pending-insert, lets the agent/FE pivot the open set by field without parsing `ref`. |
| `member` | all | the cohort-member identity (patient/encounter code); set at pending-insert, lets the agent pivot by member and bind its queries without re-parsing `sources`. |
| `kind` | all | `direct` (copied) or `interpret` (inferred). |
| `state` | all | `pending` (not yet resolved — the open set the next population step works) / `filled` / `blocked` / `not_applicable` — the four stored states ([table-population.md](../features/table-population.md) §Cell state model). Needs-verification is **derived** (`filled` + interpret + `review_state: not_reviewed`), never stored. |
| `confidence` | all | the **word** `low` / `medium` / `high`. Drives the heat-map. No numbers. |
| `resolved_by` | all | which population step produced the terminal result: `prepopulated` / `agent`. |
| `hypothesis` | all | a note on **why the value is hard to place**, read by the agent's triage; `null` on a clean prepopulate hit. |
| `attempts` | all | **list** (≥1) of attempts to fill the cell's value, in order — `{ by, database, sql?, value?, table_column?, result?, error? }`. `database` is **always present** (which db the attempt touched, or the sentinel `"(none)"` when none did); a clean hit is one entry, no error. The prepopulate entry carries `sql` + `table_column` + the read `value`. **Write-time / evidence failures** (an off-code value, an ungroundable citation, the agent's NOT_LOCATED fallback) append an entry that carries the offending `value` + `error` and **omits `sql`** (optional — no query ran); never a synthetic SQL marker. |
| `explanation` | all | the **one-sentence** account of how the value was derived (copied from a column, or how cited passages were combined). |
| `sources` | all | **list**, one entry per (database, row): `{ database, query, table_column, row_id?, citations? }`. The cohort identity is the cell's `member`, **not** repeated here. The query must show the value **alongside its row identifier** ([traceability-and-evidence.md](../features/traceability-and-evidence.md)), not a bare `SELECT <value>`. `row_id` (the evidence row's own pk) is recorded for a one-to-many source or interpreted value; `citations` carries that row's **verbatim** note passage(s) — exact substrings so the highlight lands (this is where the old flat `evidence[]` now lives, linked to its row). |
| `review_state` | interpret | `not_reviewed` → `reviewed` (set automatically; [traceability-and-evidence.md](../features/traceability-and-evidence.md) §Reviewing). |
| `corrected` | interpret | did the user edit it after reviewing? `false` confirmed · `true` corrected. |
| `prompt_version` | all | the prompt version that produced it (ties to the table-population record, [auth-and-access.md](../features/auth-and-access.md)). |
| `extracted_at` | all | ISO-8601 timestamp. |
| `reason_code` | blocked | why the value is absent (taxonomy below). |
| `reason_detail` | blocked | evidence-grade: exactly what is missing and where the agent looked. |
| `owner_needed` | blocked | the role/specialty/source to chase. |
| `outstanding_since` | blocked | how long the gap has been open. |

### Per-cell `state` ([table-population.md](../features/table-population.md) §Cell state model; [status-and-blocked-items.md](../features/status-and-blocked-items.md))
The four **stored** states: `pending` (inserted at table-population start; not yet resolved — the "open
set" the next population step works through; carries no `value`/`confidence`/`resolved_by` yet) ·
`filled` · `blocked` (no value; source data absent **or** searched-but-not-located) ·
`not_applicable` (genuinely N/A; suppressed, never counted as a block).
**Needs verification is derived, never stored**: `filled` + `kind: interpret` +
`review_state: not_reviewed` (plus low-confidence cases, Q10). There is no separate "unknown"
state — a value the agent searched for and could not place is `blocked` with
`reason_code: NOT_LOCATED`, and no `error` state — failures ride on `attempts[]`.

### Reason-code taxonomy — blocked cells ([status-and-blocked-items.md](../features/status-and-blocked-items.md))
`MISSING_SOURCE_RECORD` · `AWAITING_DOCUMENT` · `PENDING_CODING` · `AWAITING_RESULT` ·
`DATA_CONFLICT` · `IDENTITY_UNRESOLVED` (join key missing/mismatched — rows whose identities
don't match are **never combined**) · `NOT_LOCATED` (the table agent searched and could not place
the value anywhere; `attempts[]` is the explanation) · `AWAITING_SIGNOFF` (→ NEEDS VERIFICATION,
not a true block) · `NOT_APPLICABLE` (→ suppress, not a block).

> **Demo note.** `mockData.js` currently emits `kind: "interpretive"` and a flat
> `{ database, sql, evidence, explanation }` on meta. The MVP shape above is authoritative:
> `kind: "interpret"`; `database` + `sql` move **into the `sources` list** as
> `{ database, query, … }` (a cell may have several), and the verbatim `evidence` moves **into each
> source** as `citations` (linked to the row it came from). `explanation` stays a single cell field.
> The pipeline emits the new shape; the front end renders it.

---

## 3. The executor spec (data, not code) — folded into `mapping.json`

**Status: frozen as v2 (`schema_version "2"`).** The v1 `filters[]` array is
gone; filtering lives on a top-level **`cohort`** block. The spec lives **inside
`mapping.json`** (the "compiled executable" half), not as a standalone `populate.json` file;
see [`storage-layout.md`](storage-layout.md).

**One executor spec per audit**, embedded in `var/templates/<id>/mapping.json`.
It is **data**, never code: a single fixed, audited executor in `core/table_population` (the
prepopulate step, `populate.py::prepopulate`) reads it, resolves the cohort, runs each region's parameterised SQL **read-only**
(scoped to the cohort identities), joins per-database results in Python on the identity keys,
translates code sets, and writes cells. **Nothing in this file is executed as a program.** It is
compiled **deterministically (no LLM)** from `mapping.json`'s match half by
`core/mapping/build_populate_spec.py`.

**The cohort, not per-region filters, is the only run-time input.** The user's resolved inclusion
conditions are ANDed into `cohort.where` at run time; the precompiled
file ships `where: []`. Every region query is scoped to the resolved cohort identity set via the
single named bind **`:cohort`** (`… IN (:cohort)`) — region queries carry **no** filter binds.

```jsonc
{
  "schema_version": "2",
  "audit_id": "cord-ph",
  "workbook": "audit.xlsx",

  // Identity keys: how rows from different databases/tables are joined in Python.
  // A row whose keys are missing/mismatched is NEVER combined → cell blocked (IDENTITY_UNRESOLVED).
  "identity_keys": ["patient_code"],

  // OPTIONAL — present only on multi-database mappings: one bridge per foreign
  // database, derived deterministically from the match's identity.keys. The executor reads
  // `via.bridge_column` alongside `via.anchor_column` from `via.table` in the COHORT database,
  // translates the resolved cohort identities into the foreign key set, binds the foreign
  // query's `:cohort` with it, and joins the rows back in Python — cross-database SQL never
  // runs. An anchor identity with no (or several) bridge values blocks its foreign cells
  // (IDENTITY_UNRESOLVED). Example (NPDA):
  //   "identity_bridges": [
  //     { "database": "npda-demographics", "key_column": "nhs_number",
  //       "via": { "table": "clinic_visits", "anchor_column": "visit_id", "bridge_column": "patient_ref" } }
  //   ],

  // The cohort: a joinable base that SELECTs the identity keys. `from` is the anchor table
  // plus every join a criterion needs to reach it (derived from mapping.json's identity +
  // criteria_bindings). The resolved inclusion conditions are ANDed into `where` at RUN TIME;
  // nothing is pre-guessed here, so the file always ships `where: []`.
  "cohort": {
    "database": "cord-ph",
    "from": "cord_ph_birth_records b JOIN encounters e ON b.encounter = e.id JOIN patients p ON b.baby_patient = p.id",
    "identity_select": "b.patient_code AS patient_code",
    "where": []                              // run-time: resolved inclusion conditions land here
  },

  "regions": [
    {
      "id": "ALL",
      "sheet": "ALL",
      "kind": "direct",                      // "direct" | "interpret"

      // Read-only SQL per source database, scoped to the cohort identities via :cohort.
      // One query covers the LARGEST set of cells (many columns at once); per-cell narrowing
      // happens at run time in prepopulate, not here. Each query SELECTs the identity keys.
      "queries": [
        { "database": "cord-ph",
          "sql": "SELECT c.patient_code, c.gestation_weeks, c.delivery, c.birth_weight_grams FROM cord_ph_birth_records c WHERE c.patient_code IN (:cohort)" }
      ],

      // Cell map: which result column → which workbook cell, per entity row.
      // `row_anchor` names the column that identifies each entity (the patient/encounter code).
      "row_anchor": "patient_code",
      // direct entries carry `field` (the audit field id stamped on every cell) and the
      // source `table` (so prepopulate builds the narrowed per-cell query without re-parsing
      // the wide SQL). `column` is the result column copied into the cell.
      "cell_map": [
        { "field": "gestation_weeks",    "column": "gestation_weeks",    "table": "cord_ph_birth_records", "cell_template": "{col:B}{row}" },
        { "field": "delivery",           "column": "delivery",           "table": "cord_ph_birth_records", "cell_template": "{col:T}{row}", "translate": "delivery" },
        { "field": "birth_weight_grams", "column": "birth_weight_grams", "table": "cord_ph_birth_records", "cell_template": "{col:U}{row}" }
      ]
    },
    {
      "id": "NICU",
      "sheet": "NICU",
      "kind": "interpret",                   // interpret regions stay open for the agent

      // Interpret regions carry EVIDENCE-FETCH SQL as documentation of where the
      // evidence notes/rows live. Prepopulate never runs it — interpret cells stay
      // pending; the agent fetches the evidence through its tools (the `navigate`
      // skill), decides the value, and records the verbatim passages used.
      "queries": [
        { "database": "cord-ph",
          "sql": "SELECT n.patient_code, n.note_type, n.text FROM nicu_admissions n WHERE n.patient_code IN (:cohort)" }
      ],
      "row_anchor": "patient_code",
      "cell_map": [
        { "field": "abnormal_neurology_at_discharge", "cell_template": "{col:N}{row}" }
      ]
    }
  ],

  // Code-set translations referenced by cell_map[].translate (DB value → template value).
  "code_sets": {
    "delivery": { "Spontaneous vaginal": "1", "Emergency caesarean": "2", "Forceps": "3", "Vacuum": "4" }
  }
}
```

### Field reference
| Path | Meaning |
| --- | --- |
| `schema_version` | this contract's version (`"2"`). A `"1"` spec (or one carrying `filters[]`) is **rejected**. |
| `audit_id` / `workbook` | the audit and the workbook the spec fills. |
| `identity_keys[]` | the keys rows are joined on **in Python**, per-database/table. Missing/mismatched → cell `blocked` (`IDENTITY_UNRESOLVED`); identities are **never** mixed. |
| `identity_bridges[]` | *(optional; multi-database only)* one per foreign database: `{ database, key_column, via: { table, anchor_column, bridge_column } }` — how the anchor identity translates into that database's key. Derived from the match's `identity.keys`; single-database specs omit it. |
| `cohort` | the cohort selection: `{ database, from, identity_select, where }`. `from` is a joinable base SELECTing the identity keys; `identity_select` projects the cohort key(s); `where` is the **only** per-table-population input — resolved inclusion conditions are ANDed in at run time and the precompiled file ships `where: []`. |
| `regions[]` | one per workbook region. |
| `regions[].kind` | `direct` (prepopulate writes cells) or `interpret` (stays open; the agent fetches the evidence and decides). |
| `regions[].queries[]` | **read-only** SQL **per source database** — `{ database, sql, key_column? }`. SQL is scoped to the cohort via `:cohort` (its only bind) and SELECTs the identity keys. A FOREIGN-database query carries `key_column` (its own identity column; the executor binds `:cohort` with the bridged key set instead of the anchor identities). Direct: returns the values; a direct region carries ≥1 query. Interpret: documents where the evidence notes/rows live (prepopulate never runs it; the agent fetches evidence through its tools); an interpret region may carry **none** when its evidence lives on tables prepopulate cannot key. |
| `regions[].row_anchor` | the result column identifying each entity (the patient/encounter code), used to resolve `{row}` in cell templates. |
| `regions[].cell_map[]` | direct: `{ field, column, table, cell_template, translate? }` — result `column` → cell; `field` is the audit field id stamped on the cell, `table` lets prepopulate build the narrowed per-cell query. interpret: `{ field, cell_template }` — the agent-decided field → cell. |
| `code_sets` | named DB-value→template-value translations referenced by `cell_map[].translate`. |

### Invariants (the executor enforces)
- **Read-only only.** Connections are read-only (`PRAGMA query_only` + authorizer); the executor
  runs **only** the spec's parameterised SQL. No generated or user-edited code ever executes.
- **Cohort-scoped, never inlined.** Filtering lives on the `cohort` block: region queries bind the
  resolved cohort identity set as `:cohort`; table population ANDs the validated conditions into
  `cohort.where`. No per-region filter binds, no inlined literals. Validated before population.
- **Per-DB query + Python join.** Each database is queried on its own connection; results join on
  `identity_keys`. Mismatch → `blocked` (`IDENTITY_UNRESOLVED`), never a mixed-identity row.
- **No fabrication.** A query that returns nothing for a cell yields an explicit
  `missing` / `unknown` / `not_available` (and, when the source is absent, a `blocked` cell with a
  reason code) — never an invented value.
- **Evidence capture.** Each direct cell's executed SQL is captured as that cell's `sources[].query`
  (§2); interpret cells additionally record the verbatim passages as `sources[].citations`, linked
  to the row they were read from.
- **Editable as data, re-verifiable.** The SQL + cell map are user-visible/editable (data, not
  code) and must be re-verifiable against the live schema + template; stale precompute is a defect.
- **Deterministically regenerable.** `build_populate_spec.py` compiles the spec from `mapping.json`
  with **no LLM**; `validate_populate_spec` rejects any v1 (`filters[]` / per-region-bind) spec.

### Run-time composition — how `:cohort` is resolved
`:cohort` is a **symbolic placeholder**, not a literal SQLite bind (the cohort is an identity
*set*). At table-population start the backend builds the cohort selection from the `cohort` block —
`SELECT <identity_select> FROM <from> WHERE <composed where>` — and each region query's
`… IN (:cohort)` is **inlined as that subquery**. The user's inclusion criteria are resolved to
`where[]` entries and ANDed in; each `where[]` entry is a predicate over `cohort.from`'s
aliases (a many-valued criterion is expressed as an `EXISTS` over the anchor, per the mapping
`grain_rule`, never a count-inflating join). Table population **never re-resolves** — the previewed cohort
(`COUNT(DISTINCT <identity key>)` over the same selection) equals the populated cohort.

---

## Verify

The pipeline (writes), the table-population route (emits), and the front end (renders) can each code against
these shapes alone:

- The pipeline can produce the `executable` block (§3) and write `cell_update.cells[].meta` (§2) — every
  field it must emit is named and typed here, with `direct`/`interpret`/`blocked` cases covered.
- The table-population route can emit all five SSE events (§1) — payloads, ordering, and the
  `workbook_created`-early / `done`-terminal rules are fixed.
- The front end can render the activity feed, the live workbook, the heat-map/markers, and the
  evidence panel from §1 + §2 alone — `kind`, `state`, `confidence`, `review_state`, and `sources`
  (with per-source `citations`) are all specified.
