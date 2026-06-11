# Contract — State DB schema (`runs` / `cells` / `events` + refresh execution extensions)

**Status: frozen (Wave 0, W0.2 · Gate 0).** This is the shared contract Lanes B/C/D read.
It locks the durable state model from
[7-auth-and-audit-log.md](../7-auth-and-audit-log.md) §"State data model" (eng review A4):
the dashboard status, the blocked list, the run record, and the 100-day loop derive from this
state schema — never from the chat stream or the workbook (GAP-3).

It freezes the durable run-state model that drives status, blocked-item surfacing, and
traceability during execution. These outputs derive from runtime tables, never from chat
stream text or workbook cells.

**Scope boundary:** this contract is runtime-only.
- Runtime ownership and row semantics: this document.
- IAM/catalog/resource-grant schema + permission semantics:
  [control-plane-schema-and-permissions.md](./control-plane-schema-and-permissions.md)
- Runtime role/action/table permission matrix authority (Ticket 1 freeze):
  [control-plane-schema-and-permissions.md](./control-plane-schema-and-permissions.md)
  section "Feature scope freeze: runtime/state DB role permissions (Ticket 1)".

Lane C (C1) implements this store; Lane B writes to it; Lane D reads it. Implementations may
add columns, but must not rename/drop contract fields without re-freezing.

**Storage:** runtime state lives at `var/state.db`; canonical on-disk layout is in
[storage-layout.md](./storage-layout.md).

This contract names fields and value sets, not a specific engine. List/map-valued fields
(`database_ids`, `prompt_versions`, `filters`, `parameters`, `attempts`, `sources`) are JSON
in MVP SQLite and may normalize later without changing semantics.

- **Implemented today:** `runs`, `cells`, `events`, and `field_codes` (added by A2's
  off-code DB-trigger redesign — derived from `spec.json`'s `permitted_values`, regenerated
  per run; not a separate documented table here because it is engine-internal scaffolding for
  the trigger, not part of the cross-lane contract).
- **Refresh execution extensions (Phase 1) — implemented today** (`core/store/schema.py`):
  the canonical contract for in-place refresh tracking under one `run_id` (doc 11).
  - **`run_executions`** — one row per execution attempt under a run: `id` (the
    `execution_id`; lexicographic order is the tiebreaker when `started_at` collides),
    `run_id` (FK, cascade), `started_at`, `ended_at`, `summary_json` (JSON object — the
    refresh delta / final-status summary), `status` ∈ `queued` · `running` · `completed` ·
    `error` · `stopped` (CHECK-enforced). **Execution role is derived by order** (first =
    initial, later = refresh) — never stored as a kind column.
  - **`run_members`** — cohort membership per run: PK `(run_id, member)`, `row_index`
    (**append-only**, no repacking — doc 11 row-index policy), `active` ∈ 0·1
    (departed members are marked inactive, never deleted; excluded from export),
    `first_seen_execution_id`, `last_seen_execution_id`.
  - **`events.execution_id`** — attributes every persisted event to the execution that
    emitted it.
- **Superseded shape — verbatim note passages.** The `cells.evidence` column listed below
  (interpret-only verbatim passages) has been moved into `cells.sources[].citations` per the
  provenance redesign frozen in
  [`cell-resolution.schema.json`](./cell-resolution.schema.json). The column itself is
  **not implemented** — readers should consult `sources[].citations`.
- **Deferred — interpret review attribution.** `cells.reviewed_by` and `cells.reviewed_at`
  are part of the interpret review flow, which is platform/auth work parked until the spine
  is end-to-end green. Not implemented today.
- **Implemented — auth & attribution plane is live in the same runtime store.**
  `users`, `sessions`, `run_attributions`, and `query_log` are implemented under
  `server/auth/*` in `var/state.db`; startup migrates legacy `var/auth.sqlite` data when
  present.

## What this contract specifies vs. what MVP currently implements

- **Implemented today:** `runs`, `cells`, `events`, and derived `field_codes` scaffold.
- **Implemented today:** `users`, `sessions`, `run_attributions`, and `query_log` in
  `var/state.db` (`server/auth/*`).
- **Implemented runtime authz alignment (Ticket 7):**
  - store/runtime writes enforce role policies via `core/store/runtime_permissions.py` +
    `core/store/store.py`;
  - Tier-3 `sql_execute` `database="cells"` route is table-restricted to `cells` only
    (non-cells runtime tables denied on that path);
  - clinician runtime cell edits flow through `PATCH /api/runs/{id}/cells/{ref}` and are
    constrained to interpret review/correction fields (`review_state`, `corrected`, `value`).
- **Superseded shape:** former `cells.evidence` is represented as `cells.sources[].citations`
  (see `cell-resolution.schema.json`).
- **Deferred in runtime implementation:** `cells.reviewed_by`, `cells.reviewed_at`.
- **Ownership split:** IAM role/grant semantics remain normative in
  `control-plane-schema-and-permissions.md`.

Treat the sections below as the target contract. The notes above describe current
implementation coverage and remaining gaps.

---

## Enumerations

| Enum | Values | Source |
| --- | --- | --- |
| `run.status` | `queued` · `in_progress` · `blocked` · `in_verification` · `complete` | doc 7; doc 10; doc 5 |
| `cell.kind` | `direct` · `interpret` | doc 6; doc 7 |
| `cell.state` | `pending` · `filled` · `blocked` · `not_applicable` — stored states only; needs-verification is **derived** (`filled` + interpret + `review_state: not_reviewed`). *Migrated (T13): legacy `needs_verification` rows rewrite to `filled` + `review_state not_reviewed` on open; new DBs bake the four-state CHECK.* | doc 5 §Cell state model; doc 10; doc 6 |
| `cell.confidence` | `low` · `medium` · `high` | doc 6; doc 5 |
| `cell.resolved_by` | `direct` · `LLM` · `agent` | cell-resolution schema; doc 5 tier ladder |
| `cell.review_state` | `not_reviewed` · `reviewed` | doc 6; doc 5 |
| `cell.reason_code` | `MISSING_SOURCE_RECORD` · `AWAITING_DOCUMENT` · `PENDING_CODING` · `AWAITING_RESULT` · `DATA_CONFLICT` · `IDENTITY_UNRESOLVED` · `AWAITING_SIGNOFF` · `NOT_APPLICABLE` · `NOT_LOCATED` | doc 10 |
| `event.type` | `activity` · `cell_update` · `status_change` · `verification` | doc 7 |

---

## `runs`

One row per run (fresh row per re-run).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | Run id (PK). |
| `audit_id` | ref | Audit/template id. |
| `user_id` | ref | User attribution id; FK target is owned by control-plane schema contract. |
| `request` | text | Prompt/pasted text entered by user. |
| `template_version` | text | Pinned template version used by this run. |
| `database_ids` | list&lt;ref&gt; | Database ids this run spans. |
| `status` | enum | `run.status`; derived from cells and persisted durably. |
| `prompt_versions` | map | Indexing/mapping/run prompt versions used. |
| `filters` | list | Inclusion/exclusion criteria applied at runtime. |
| `parameters` | map | Model/runtime parameters used. |
| `started_at` | timestamp | Run start. |
| `ended_at` | timestamp | Run end, null while running. |

Agent activity and cell outcomes are represented in `events` and `cells` joined by `run_id`.

---

## `run_executions` (refresh execution log under one run)

One row per execution attempt under a stable `run_id`. The first execution is the initial run;
later ones are refreshes (derived by order, no explicit `kind` field).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | execution id (primary key). |
| `run_id` | ref | parent run (`runs.id`). |
| `status` | enum | `queued` · `running` · `completed` · `error` · `stopped`. |
| `started_at` | timestamp | execution start. |
| `ended_at` | timestamp | execution end. |
| `summary_json` | json | execution summary counters (new members, blocked resolved, etc.). |

### Execution role derivation (no `kind` field)

Within one `run_id`, execution role is derived from ordering:

1. earliest execution = initial;
2. each later execution = refresh.

Ordering key: `started_at` ascending, tie-break by `id` ascending.

### Execution status transitions

Legal transitions for `run_executions.status`:

- `queued -> running`
- `running -> completed`
- `running -> error`
- `running -> stopped`

Terminal states: `completed`, `error`, `stopped` (no outgoing transitions).

---

## `run_members` (stable row identity over refreshes)

One row per cohort member seen in a run over time, preserving stable workbook row placement.

| Field | Type | Notes |
| --- | --- | --- |
| `run_id` | ref | parent run (`runs.id`). |
| `member` | text | cohort member identity key. |
| `row_index` | integer | workbook row index anchor for this member. |
| `active` | bool | active in latest cohort for the run's filters. |
| `first_seen_execution_id` | ref | execution where member first appeared. |
| `last_seen_execution_id` | ref | most recent execution where member was evaluated. |

`(run_id, member)` is unique.

Row index policy is append-only: new members append at tail; existing members keep row index;
no repacking/reindexing on refresh.

---

## `cells`

One row per required runtime cell in a run (`run_id` + `ref` unique).

| Field | Type | Notes |
| --- | --- | --- |
| `run_id` | ref | Parent run id. |
| `ref` | text | `<Sheet>!<A1>`. |
| `field` | text | Audit field id for this cell. |
| `member` | text | Cohort member identity for this cell. |
| `kind` | enum | `cell.kind`. |
| `state` | enum | `cell.state`; starts `pending`, tier ladder settles terminal state. |
| `value` | text | Final template-coded value, null for blocked. |
| `confidence` | enum | `cell.confidence`. |
| `resolved_by` | enum | `direct` / `LLM` / `agent`; null while pending. |
| `hypothesis` | text | Tier-2 hypothesis for Tier-1 failure. |
| `attempts` | list | Ordered query attempt log for escalation/provenance. |
| `review_state` | enum | Interpret-cell review state. |
| `corrected` | bool | Interpret-cell corrected flag. |
| `reviewed_by` | ref | Reviewer user id (deferred runtime implementation). |
| `reviewed_at` | timestamp | Review timestamp (deferred runtime implementation). |
| `explanation` | text | Human-readable value explanation. |
| `sources` | list | Per-source provenance (database/query/table_column/optional citations). |
| `prompt_version` | text | Prompt version that produced this cell. |
| `extracted_at` | timestamp | Write timestamp. |
| `reason_code` | enum | Blocked-only reason code. |
| `reason_detail` | text | Blocked-only evidence-grade reason detail. |
| `owner_needed` | text | Blocked-only owner to chase. |
| `outstanding_since` | timestamp | Blocked-only unresolved since time. |

Blocked fields power status/chase surfaces and are not rendered as workbook values.

### Refresh transition rule (Phase 1)

On refresh start for active members, cells in `blocked` are reopened to `pending` so tiers can
re-attempt resolution. This is the explicit refresh transition:

- `blocked -> pending` (refresh reopen),
- then the normal tier lifecycle settles to terminal states.

---

## `events`

Append-only run activity/audit trail stream.

| Field | Type | Notes |
| --- | --- | --- |
| `run_id` | ref | parent run. |
| `execution_id` | ref | optional execution id (`run_executions.id`) that produced this event. |
| `ts` | timestamp | when the event occurred; ordering + per-phase timing. |
| `type` | enum | `event.type`: `activity` (reasoning/tool call), `cell_update` (a value written), `status_change` (run status moved), `verification` (a cell reviewed/corrected). |
| `payload` | json | type-specific body (e.g. the activity headline/detail, the cell ref + value, the old/new status, the review/correction). |

---

## Runtime coverage map (docs 5/6/7/10)

| Referenced behavior | Runtime field(s) |
| --- | --- |
| Run attribution linkage | `runs.user_id` |
| Run request/target/filters/parameters/prompts/timing | `runs.request`, `runs.audit_id`, `runs.database_ids`, `runs.template_version`, `runs.filters`, `runs.parameters`, `runs.prompt_versions`, `runs.started_at`, `runs.ended_at` |
| Run status lifecycle | `runs.status` + derived cell states |
| Cell fill/review/block semantics | `cells.state`, `cells.kind`, `cells.review_state`, `cells.corrected`, `cells.reason_*`, `cells.owner_needed`, `cells.outstanding_since` |
| Evidence/provenance | `cells.sources`, `cells.explanation`, `cells.attempts` |
| Streamed audit trail | `events.type`, `events.payload`, `events.ts`, `events.execution_id` |
| Refresh execution log (doc 11) | `run_executions` |
| Refresh member-row stability (doc 11) | `run_members` |

For IAM/query-log coverage and foreign-key ownership, use
[control-plane-schema-and-permissions.md](./control-plane-schema-and-permissions.md).
