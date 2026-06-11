# Refresh Detection & Incremental Refresh

Read [5-run-engine.md](./5-run-engine.md),
[10-status-and-blocked-items.md](./10-status-and-blocked-items.md), and
[11-result-view-workbook-first.md](./11-result-view-workbook-first.md) first.

This document defines refresh in **two explicit phases**:

- **Phase 1 (MVP / short term):** user-driven **Check for updates** only.
- **Phase 2 (post-MVP):** upstream automatic detection/recommendation before user click.

The purpose is to avoid ambiguity between what we are building now vs later.

---

## Problem this feature solves

Blocked values often resolve later (new specialist notes, newly coded episodes,
pending results landed), and new patients can enter the cohort after the first
run. Users need to refresh the same workbook in place without redoing work from
zero.

---

## Terms

- **`run_id`**: stable workbook identity (user-facing).
- **`execution_id`**: one concrete execution attempt under that `run_id` for
  traceability and activity grouping.

### Execution role derivation (no `kind` field)

The MVP does **not** store execution type (`initial` / `refresh`) as a separate
column.

Instead it is derived by execution order inside a run:

1. The earliest execution for a `run_id` is the **initial** execution.
2. Every later execution for the same `run_id` is a **refresh** execution.

Ordering rule:
- primary: `started_at` ascending
- tie-breaker: `execution_id` lexicographic ascending

---

## Phase 1 (MVP): Manual check-for-updates

### Product behavior (authoritative)

1. Refresh is started only by user action: clicking **Check for updates** inside
   the right-panel `agent_activity` content (per
   [11-result-view-workbook-first.md](./11-result-view-workbook-first.md)).
2. `Check for updates` is visible/actionable only when execution is idle.
   While an initial run or refresh execution is active, the action is hidden.
3. There is no automatic recommendation icon/state in MVP.
4. There is no background detection service in MVP.
5. The workbook stays on the same `run_id`; refresh is in-place, not a new
   user-visible run.

### Execution behavior (downstream of button)

When user clicks **Check for updates**:

1. Create a new `execution_id` under existing `run_id` (it is a refresh by the
   derivation rule above).
2. Re-resolve cohort with same audit + filters.
3. Compute cohort delta:
   - `new_members` (now in cohort, previously absent),
   - `departed_members` (previously present, now out of cohort),
   - `unchanged_members`.
4. Apply MVP minimal refresh scope:
   - reopen `blocked` cells of active members to `pending` at refresh start so
     tiers can re-attempt them,
   - keep `pending` cells as `pending` for active members,
   - insert pending grid for all `new_members`,
   - do not recompute already `filled` cells (reviewed or not).
5. Preserve human work:
   - never overwrite reviewed/corrected decisions.
6. Cohort drift policy:
   - keep departed members in workbook history and mark inactive (do not delete rows).
7. Row index policy (deterministic, Phase 1):
   - `run_members.row_index` is append-only,
   - existing members keep their row index forever,
   - `new_members` are appended at tail (`max(row_index)+1...`),
   - no compaction/repacking/reindexing on refresh.
8. Run tier ladder on pending cells and stream activity/cell updates tagged with
   `execution_id`.
9. At completion, emit clear activity summary:
   - `new_members_count`,
   - `departed_members_count`,
   - `retried_blocked_count`,
   - `resolved_blocked_count`,
   - `remaining_blocked_count`,
   - `updated_cells_count`.

### Export rule for inactive members

- Inactive/departed members remain in run history and UI context.
- Exported submit-ready `.xlsx` **must exclude inactive members** (out-of-cohort
  rows are not included in final export payload).

---

## Phase 2 (post-MVP): Upstream automatic detection/recommendation

Phase 2 begins only after Phase 1 is stable in production behavior.

### Goal

Before user clicks refresh, system can indicate refresh is likely useful
(recommendation signal), while still leaving refresh execution manual unless a
future product decision changes that.

### Candidate implementations

Two engine-dependent families are valid:

1. **Push/listener/CDC adapters** (where source supports reliable change feeds).
2. **Pull/probe adapters** (lightweight tokens/checks) where listeners are not available.

This split is mandatory because SQL engines differ:
- some support native notifications/change feeds well,
- some do not,
- and infra constraints in hospital deployments vary.

### Post-MVP decision gate

Before implementation, choose and freeze:

1. Supported database engines in deployment scope.
2. For each engine, listener vs probe adapter.
3. Recommendation decision rule and cadence.
4. UI policy for recommendation state transitions.

No Phase 2 detector behavior is implied by Phase 1.

---

## State and API additions

### Required in Phase 1

- `run_executions` table:
  - `id`, `run_id`, `status`, `started_at`, `ended_at`, `summary_json`.
- `events.execution_id` (nullable FK to `run_executions.id`).
- `run_members` table:
  - `(run_id, member)` PK, `row_index`, `active`,
    `first_seen_execution_id`, `last_seen_execution_id`.
- `POST /api/runs/{run_id}/refresh`:
  - starts refresh under same `run_id`,
  - returns `{ runId, executionId, status }`.

### Deferred to Phase 2

- Any `run_refresh_state` recommendation table/fields.
- Any background detector scheduler/worker.
- Any recommendation payload on `GET /api/runs/{run_id}` beyond explicit refresh execution state.

---

## Acceptance criteria

### Phase 1 acceptance (must-pass now)

1. Refresh starts only from user click on **Check for updates**.
2. `Check for updates` is available only in idle state (hidden while any execution is active).
3. No automatic detection/recommendation logic runs in MVP.
4. Same workbook identity is preserved (`run_id` unchanged).
5. Refresh activity is grouped by `execution_id` and includes required summary counters.
6. MVP minimal refresh scope is enforced (blocked/pending + new members only).
7. Departed members are retained and marked inactive.
8. Execution role is derived by order (`first=initial`, `later=refresh`) with
   no stored `kind` field.
9. Refresh reopens blocked cells of active members from `blocked -> pending` at
   execution start.
10. Row indexing is append-only with no repacking.
11. Export excludes inactive/departed members.

### Phase 2 acceptance (deferred)

Not in MVP scope. Add criteria only when Phase 2 decisions are frozen.
