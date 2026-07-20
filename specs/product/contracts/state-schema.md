# Contract — State DB schema (`runs` / `cells` / `events` + refresh execution extensions)

**Status: frozen.** This is the shared runtime-state contract. It locks the durable state model that
[auth-and-access.md](../features/auth-and-access.md) §5 (the run log) builds on: the dashboard status,
the blocked list, the run record, and the 100-day loop derive from this state schema — never from the
chat stream or the workbook.

It freezes the durable run-state model that drives status, blocked-item surfacing, and
traceability during execution. These outputs derive from runtime tables, never from chat
stream text or workbook cells.

**Scope boundary:** this contract is runtime-only. (The `tables` table — a
populated Table's metadata row — also lives in `state.db` but is owned by
[table.schema.json](table.schema.json) + [storage-layout.md](storage-layout.md)
§3, not by this contract.)
- Runtime ownership and row semantics: this document.
- IAM/catalog/resource-grant schema + permission semantics:
  [control-plane-schema-and-permissions.md](control-plane-schema-and-permissions.md).
- Runtime role/action/table permission matrix:
  [control-plane-schema-and-permissions.md](control-plane-schema-and-permissions.md) §8 (Database role
  boundaries).

Implementations may add columns, but must not rename/drop contract fields without re-freezing.

**Storage:** runtime state lives at `var/state.db`; canonical on-disk layout is in
[storage-layout.md](storage-layout.md).

This contract names fields and value sets, not a specific engine. List/map-valued fields
(`database_ids`, `prompt_versions`, `filters`, `parameters`, `attempts`, `sources`) are JSON
in MVP SQLite and may normalize later without changing semantics.

- **`field_codes`** is engine-internal scaffolding for the value-validation DB trigger (derived from
  `spec.json`'s `permitted_values`, regenerated per run) — not part of the cross-lane contract, so not
  documented as a separate table here.
- **Refresh execution tables** — the canonical contract for in-place refresh tracking under one
  `run_id`:
  - **`run_executions`** — one row per execution attempt under a run: `id` (the
    `execution_id`; lexicographic order is the tiebreaker when `started_at` collides),
    `run_id` (FK, cascade), `started_at`, `ended_at`, `summary_json` (JSON object — the
    refresh delta / final-status summary), `status` ∈ `queued` · `running` · `completed` ·
    `error` · `stopped` (CHECK-enforced). **Execution role is derived by order** (first =
    initial, later = refresh) — never stored as a kind column.
  - **`run_members`** — cohort membership per run: PK `(run_id, member)`, `row_index`
    (**append-only**, no repacking), `active` ∈ 0·1 (departed members are marked inactive, never
    deleted; excluded from export), `first_seen_execution_id`, `last_seen_execution_id`.
  - **`events.execution_id`** — attributes every persisted event to the execution that
    emitted it.
- **Verbatim note passages** live in `cells.sources[].citations` (per the provenance model in
  [`cell-resolution.schema.json`](cell-resolution.schema.json)); there is no separate `cells.evidence`
  column.
- **Interpret review attribution** is carried in the `verification` event payload (tied to the
  authenticated user), not in `cells.reviewed_by` / `cells.reviewed_at`.

---

## Enumerations

| Enum | Values | Source |
| --- | --- | --- |
| `run.status` | `queued` · `in_progress` · `blocked` · `in_verification` · `complete` | [auth-and-access.md](../features/auth-and-access.md); [status-and-blocked-items.md](../features/status-and-blocked-items.md); [table-population.md](../features/table-population.md) |
| `cell.kind` | `direct` · `interpret` | [traceability-and-evidence.md](../features/traceability-and-evidence.md); [auth-and-access.md](../features/auth-and-access.md) |
| `cell.state` | `pending` · `filled` · `blocked` · `not_applicable` — stored states only; needs-verification is **derived** (`filled` + interpret + `review_state: not_reviewed`). | [table-population.md](../features/table-population.md) §Cell state model; [status-and-blocked-items.md](../features/status-and-blocked-items.md); [traceability-and-evidence.md](../features/traceability-and-evidence.md) |
| `cell.confidence` | `low` · `medium` · `high` | [traceability-and-evidence.md](../features/traceability-and-evidence.md); [table-population.md](../features/table-population.md) |
| `cell.resolved_by` | `prepopulated` · `agent` | cell-resolution schema; [table-population.md](../features/table-population.md) §Population: the two steps |
| `cell.review_state` | `not_reviewed` · `reviewed` | [traceability-and-evidence.md](../features/traceability-and-evidence.md); [table-population.md](../features/table-population.md) |
| `cell.reason_code` | `MISSING_SOURCE_RECORD` · `AWAITING_DOCUMENT` · `PENDING_CODING` · `AWAITING_RESULT` · `DATA_CONFLICT` · `IDENTITY_UNRESOLVED` · `AWAITING_SIGNOFF` · `NOT_APPLICABLE` · `NOT_LOCATED` | [status-and-blocked-items.md](../features/status-and-blocked-items.md) |
| `event.type` | `activity` · `cell_update` · `status_change` · `verification` | [auth-and-access.md](../features/auth-and-access.md) |

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
| `status` | enum | `run.status` — the **table result status**, derived from cells and persisted durably. |
| `prompt_versions` | map | Indexing/mapping/run prompt versions used. |
| `filters` | list | Inclusion/exclusion criteria applied at runtime. |
| `parameters` | map | Model/runtime parameters used. |
| `population_status` | enum? | The **table population status** — the process lifecycle: `queued` · `running` · `stopped` · `error` · `completed`. `NULL` = no lifecycle recorded (a run predating this column, or one adopted by the startup backfill). Distinct from `status` (the cell-derived result status): this answers "should the UI reconnect to the live stream?". |
| `population_status_detail` | text? | Free-text detail attached to the current `population_status` (e.g. "Stopped by user.", an error message). |
| `population_result_status` | enum? | The last result-status snapshot supplied to a lifecycle transition (mirrors `status` at the moment a terminal transition recorded it). **Sticky:** a transition that supplies no snapshot (e.g. `running` at the start of a refresh) PRESERVES the prior value rather than clearing it, so a re-run cannot destroy the last-known-good result of the previous run. |
| `started_at` | timestamp | Run start. |
| `ended_at` | timestamp | Run end, null while running. |

Agent activity and cell outcomes are represented in `events` and `cells` joined by `run_id`.

**Population lifecycle semantics.** The three `population_*` columns are the sole home of the table population status (there is no `status.json` file — it was retired; a startup pass adopts any legacy file once). Each transition replaces `population_status` and `population_status_detail`; `population_result_status` is **preserved** when the transition supplies none (COALESCE) and replaced only when it does — so a mid-refresh `running` transition never erases the prior run's durable result. Writes come from the server/session-transport layer (`api_app` role only — see [control-plane-schema-and-permissions.md](control-plane-schema-and-permissions.md)), never from the orchestrator or agent runtime. Transitions: `queued` → `running` (a fresh run's row is born `running`, since the population starts before the row is read back) → terminal `completed` / `error` / `stopped`. **One preserved oddity:** a user *pause* records `completed` (with a result-status snapshot) here while the HTTP stop response reports `stopped` — only a hard abort/delete records `stopped`.

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
| `state` | enum | `cell.state`; starts `pending`, the two population steps settle terminal state. |
| `value` | text | Final template-coded value, null for blocked. |
| `confidence` | enum | `cell.confidence`. |
| `resolved_by` | enum | `prepopulated` / `agent`; null while pending. |
| `hypothesis` | text | Note on why the value is hard to place, read by the agent's triage. |
| `attempts` | list | Ordered query attempt log for provenance (what the agent reads to pick up where prepopulate left off). |
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

On refresh start for active members, cells in `blocked` are reopened to `pending` so the
population steps can re-attempt resolution. This is the explicit refresh transition:

- `blocked -> pending` (refresh reopen),
- then the normal population lifecycle settles to terminal states.

---

## `events`

Append-only run activity/audit trail stream.

| Field | Type | Notes |
| --- | --- | --- |
| `run_id` | ref | parent run. |
| `execution_id` | ref | optional execution id (`run_executions.id`) that produced this event. |
| `ts` | timestamp | when the event occurred; ordering + per-phase timing. |
| `type` | enum | `event.type`: `activity` (reasoning/tool call), `cell_update` (a value written), `status_change` (result status moved), `verification` (a cell reviewed/corrected). |
| `payload` | json | type-specific body (e.g. the activity headline/detail, the cell ref + value, the old/new status, the review/correction). |

---

## Runtime coverage map (docs 5/6/7/10)

| Referenced behavior | Runtime field(s) |
| --- | --- |
| Run attribution linkage | `runs.user_id` |
| Run request/target/filters/parameters/prompts/timing | `runs.request`, `runs.audit_id`, `runs.database_ids`, `runs.template_version`, `runs.filters`, `runs.parameters`, `runs.prompt_versions`, `runs.started_at`, `runs.ended_at` |
| Table result status | `runs.status` + derived cell states |
| Table population status (process lifecycle) | `runs.population_status`, `runs.population_status_detail`, `runs.population_result_status` |
| Cell fill/review/block semantics | `cells.state`, `cells.kind`, `cells.review_state`, `cells.corrected`, `cells.reason_*`, `cells.owner_needed`, `cells.outstanding_since` |
| Evidence/provenance | `cells.sources`, `cells.explanation`, `cells.attempts` |
| Streamed audit trail | `events.type`, `events.payload`, `events.ts`, `events.execution_id` |
| Refresh execution log ([refresh.md](../features/refresh.md)) | `run_executions` |
| Refresh member-row stability ([refresh.md](../features/refresh.md)) | `run_members` |

For IAM/query-log coverage and foreign-key ownership, use
[control-plane-schema-and-permissions.md](control-plane-schema-and-permissions.md).
