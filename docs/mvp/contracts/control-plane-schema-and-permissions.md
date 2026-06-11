# Contract — Control-Plane Schema & Permissions

**Status: frozen (MVP authz baseline).** This contract defines the canonical control-plane
schema and authorization semantics for Intero.

This is the normative authority for:
- IAM tables (`users`, `sessions`, `roles`, `permissions`, `role_permissions`)
- User-role binding (`users.role_id` for MVP single-role users)
- Resource access tables (`resource_grants`)
- Catalog metadata (`audits`, `databases`, `mappings`)
- Runtime ownership/attribution tables (`runs`, `query_log`) and their joins to runtime state
- Database role boundaries (`api_app`, `orchestrator_runtime`, `agent_runtime_writer`, `clinical_readonly`)

Runtime row-level state (`cells`, `events`) remains detailed in
[state-schema.md](./state-schema.md); this contract owns who can access and mutate it.

---

## Feature scope freeze: runtime/state DB role permissions (Ticket 1)

### In scope (frozen in this contract)
- Exact role/action/table contract for runtime-state mutations by:
  - `orchestrator_runtime`
  - `agent_runtime_writer`
  - clinician/editor runtime cell edits (via authenticated API user role + permission)
- Run-scoped enforcement for runtime writes.
- Endpoint/permission mapping for clinician/editor cell edits.

### Implemented alignment notes (Ticket 7)
- Runtime DB role checks are centralized in `core/store/runtime_permissions.py` and enforced
  at concrete store execution points (`core/store/store.py`).
- The Tier-3 agent SQL route `database="cells"` is intentionally stricter than the generic
  `agent_runtime_writer` matrix: that route permits only `cells` table access and rejects
  `runs` / `events` / `field_codes` (see `core/agent/.opencode/tools/sql_execute.py`).
- Clinician/editor runtime edits are enforced at
  `PATCH /api/runs/{id}/cells/{ref}` (`server/routes/runs.py`) with:
  - `run.edit_cells` permission,
  - run owner/admin requirement,
  - interpret-cell-only edit surface,
  - constrained writable fields (`review_state`, `corrected`, `value`),
  - `verification` event emission per successful edit.
- MVP authz implementation note: route-level permission checks currently resolve user role from
  the authenticated user shape (`server/auth/permissions.py`) while full IAM table-backed role/
  permission joins are still being phased in.

### Out of scope (not changed by this ticket)
- Mapping/indexing logic and executable-shape contracts.
- Multi-hospital tenancy redesign beyond current `hospital_id` semantics.
- Query-log schema redesign and session UX changes.
- Clinical source DB permissions beyond existing read-only constraints.

---

## 1. Model boundary

Control plane is logically one model.

MVP physical deployment may be split (`var/auth.sqlite` + `var/state.db`) while auth work is in
flight, but implementations MUST preserve the same table semantics, keys, and permission behavior
as if they were in one transactional database.

---

## 2. Required tables

### `hospital_id` semantics (MVP)

`hospital_id` is a deployment-scoped identifier in MVP (single value per deployment). It is
not required to FK a `hospitals` table yet. When multi-hospital deployments are introduced,
`hospital_id` may be promoted to a FK without changing authorization semantics.

## `users`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required (tenant-ready; single value in MVP deployments) |
| `username` | text | unique per hospital |
| `email` | text | optional, unique when present |
| `password_hash` | text | required |
| `is_active` | bool | required |
| `role_id` | ref | FK -> `roles.id`, required (single-role MVP model) |
| `created_at` | timestamp | required |
| `last_login_at` | timestamp | nullable |

## `sessions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `user_id` | ref | FK -> `users.id`, required |
| `token` | text | unique, required |
| `created_at` | timestamp | required |
| `expires_at` | timestamp | required |
| `invalidated_at` | timestamp | nullable |
| `last_seen_at` | timestamp | required |

Session policy (MVP baseline): session cookie only, hard expiry (`expires_at`), idle timeout via
`last_seen_at` + `invalidated_at`.

## `roles`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `name` | text | unique (`admin`, `clinician`, `agent`) |
| `description` | text | optional |
| `created_at` | timestamp | required |

## `permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `key` | text | unique |
| `description` | text | optional |

Permission keys (minimum MVP set):
- `audit.read`, `audit.manage`
- `database.read`, `database.query`, `database.manage`
- `mapping.read`, `mapping.manage`
- `run.create`, `run.read`, `run.stop`, `run.edit_cells`
- `iam.manage_users`, `iam.manage_roles`, `iam.manage_grants`
- `logs.read_query_log`

## `role_permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| `role_id` | ref | FK -> `roles.id` |
| `permission_id` | ref | FK -> `permissions.id` |
| `granted_at` | timestamp | required |

Composite unique key: (`role_id`, `permission_id`).

## `resource_grants`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `subject_type` | enum | `user` or `role` |
| `subject_id` | ref | required |
| `resource_type` | enum | `audit`, `database`, `mapping` |
| `resource_id` | ref | required |
| `grant_type` | enum | `read`, `run`, `manage` |
| `granted_by` | ref | FK -> `users.id`, required |
| `created_at` | timestamp | required |
| `expires_at` | timestamp | nullable |
| `revoked_at` | timestamp | nullable |

Active grant = `revoked_at IS NULL` and (`expires_at IS NULL OR now < expires_at`).

## `audits`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `name` | text | required |
| `status` | enum | `indexing`, `ready`, `error` |
| `schema_version` | text | required |
| `spec_hash` | text | required |
| `storage_path` | text | required (`var/audits/<id>/spec.json`) |
| `created_by` | ref | FK -> `users.id` |
| `created_at` | timestamp | required |
| `updated_at` | timestamp | required |

## `databases`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `name` | text | required |
| `status` | enum | `indexing`, `ready`, `error` |
| `schema_version` | text | required |
| `model_hash` | text | required |
| `storage_path` | text | required (`var/databases/<id>/model.json`) |
| `connection_ref` | text | required (`var/databases/<id>/database.sqlite` in MVP) |
| `created_by` | ref | FK -> `users.id` |
| `created_at` | timestamp | required |
| `updated_at` | timestamp | required |

## `mappings`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `audit_id` | ref | FK -> `audits.id`, required |
| `mapping_hash` | text | required |
| `schema_version` | text | required |
| `storage_path` | text | required (`var/audits/<id>/mapping.json`) |
| `created_by` | ref | FK -> `users.id` |
| `created_at` | timestamp | required |
| `updated_at` | timestamp | required |

A mapping may reference multiple databases in artifact content; runtime validation MUST ensure all
referenced databases exist and are granted before run start.

## `runs`

`runs` columns are governed by [state-schema.md](./state-schema.md). This contract adds required
ownership semantics:
- `runs.user_id` MUST reference `users.id`.
- `runs.audit_id` MUST reference `audits.id`.
- `runs.database_ids` MUST resolve only to granted `databases.id` values.

## `query_log`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `run_id` | ref | FK -> `runs.id`, nullable for non-run exploratory queries |
| `user_id` | ref | FK -> `users.id`, required |
| `database_id` | ref | FK -> `databases.id`, required |
| `sql` | text | required |
| `row_count_returned` | integer | nullable |
| `executed_at` | timestamp | required |

Every clinical SQL statement executed by app or agent MUST produce one `query_log` row.

---

## 3. Permission evaluation contract

Every protected action MUST follow this order:
1. Resolve authenticated user from `sessions` (`401` on failure).
2. Check `is_active` user.
3. Resolve user's role via `users.role_id`, then check role permission (`permissions.key` via `role_permissions`) (`403` on failure).
4. If resource-scoped action, check active `resource_grants` for the subject (`user` grant OR
   the user's role) (`403` on failure).
5. For run-scoped mutations, assert the run belongs to the user (or the user is admin) and
   that target resource belongs to that run.

Grant checks are additive (role grants + user grants), never subtractive.

---

## 4. Baseline role-to-permission policy

| Role | Minimum permissions |
| --- | --- |
| `admin` | all listed MVP permissions |
| `clinician` | `audit.read`, `database.read`, `database.query`, `mapping.read`, `run.create`, `run.read`, `run.stop`, `run.edit_cells` |
| `agent` | no interactive API permissions; runtime DB role only (section 5) |

The agent does not authenticate through user sessions for UI/API routes.

---

## 5. Database role boundaries (mandatory)

## `api_app` role
- Used by backend HTTP routes.
- Can read/write IAM, catalog, runtime, and logs according to endpoint logic.
- Cannot write clinical source databases.

## `orchestrator_runtime` role
- Used only by the run orchestrator process for run-state coordination.
- Every write MUST be run-scoped (`WHERE run_id = :run_id`).

| Table | Allowed actions |
| --- | --- |
| `runs` | `SELECT`; `UPDATE` current-run columns: `status`, `started_at`, `ended_at`, `parameters`, `prompt_versions`. No `DELETE`. |
| `cells` | `SELECT`; `INSERT` initial pending cells for the run; `UPDATE` current-run columns: `state`, `value`, `confidence`, `resolved_by`, `hypothesis`, `attempts`, `sources`, `explanation`, `prompt_version`, `extracted_at`, `reason_code`, `reason_detail`, `owner_needed`, `outstanding_since`, `review_state`, `corrected`. No `DELETE`. |
| `events` | `SELECT`; `INSERT` (`activity`, `cell_update`, `status_change`, `verification`) for the run. No `UPDATE`/`DELETE`. |
| `run_executions` | `SELECT`; `INSERT`; `UPDATE` current-run columns: `status`, `started_at`, `ended_at`, `summary_json`. No `DELETE`. |
| `run_members` | `SELECT`; `INSERT`; `UPDATE` current-run columns: `active`, `last_seen_execution_id`. No `DELETE`. |
| `field_codes` (internal runtime scaffold) | `SELECT`; run-scoped `INSERT`/`UPDATE`/`DELETE` for code-validation scaffold regeneration only. |

- Must not read or mutate IAM/catalog tables (`users`, `sessions`, `roles`, `permissions`,
  `role_permissions`, `resource_grants`, `audits`, `databases`, `mappings`).

## `agent_runtime_writer` role
- Used by agent tooling during Tier 3.
- Every write MUST be run-scoped (`WHERE run_id = :run_id`).
- Can read run-scoped runtime context from `runs`, `cells`, `run_members`, and `field_codes`.

| Table | Allowed actions |
| --- | --- |
| `runs` | `SELECT` for current run context only. |
| `cells` | `SELECT`; `UPDATE` existing rows only, limited to resolution/provenance fields (`state`, `value`, `confidence`, `resolved_by`, `hypothesis`, `attempts`, `sources`, `explanation`, `prompt_version`, `extracted_at`, `reason_code`, `reason_detail`, `owner_needed`, `outstanding_since`). No `INSERT`/`DELETE`. |
| `events` | `INSERT` (`activity`, `cell_update`) for the current run. No `UPDATE`/`DELETE`. |
| `run_members` | `SELECT` only for current run member context. |
| `field_codes` (internal runtime scaffold) | `SELECT` only for current run value validation context. |

- Must not mutate `runs`, `run_executions`, `run_members`, `field_codes`, or any IAM/catalog tables.
- Must not mutate clinician-review columns (`review_state`, `corrected`, `reviewed_by`, `reviewed_at`).
- Cannot mutate IAM/catalog tables (`users`, `roles`, `permissions`, `resource_grants`,
  `audits`, `databases`, `mappings`, `sessions`).

## Clinician/editor runtime cell edits (authenticated API user)
- Requires:
  1. authenticated active session,
  2. `run.edit_cells` permission,
  3. run ownership (or admin override).
- Write scope is run-scoped (`WHERE run_id = :run_id`) and limited to interpret-cell review/correction.

| Table | Allowed actions |
| --- | --- |
| `cells` | `UPDATE` interpret cells only: `review_state` (`not_reviewed -> reviewed`), `corrected`, `value` (only when user correction occurs). |
| `events` | `INSERT` `verification` event for each review/correction write. |

- Runtime note for MVP consistency: `reviewed_by` and `reviewed_at` remain deferred runtime columns
  per `state-schema.md`; until implemented, reviewer attribution is carried in the `verification`
  event payload tied to the authenticated user session.
- Endpoint-level constraint note (implemented): the editable surface is enforced as:
  - `review_state` accepts only transition to `reviewed`,
  - `value` updates require `corrected=true`,
  - empty/no-op edit payloads are rejected.
- Must not mutate `attempts`, `sources`, `resolved_by`, `reason_code`, `reason_detail`,
  `owner_needed`, `outstanding_since`, `run_members`, `run_executions`, IAM tables, or catalog tables.

## `clinical_readonly` role
- Used for clinical source database queries (all tiers).
- Read-only SQL only; no write/DDL/privilege changes.

DB-role enforcement is required even when tool-level validators exist.

---

## 6. Endpoint authorization mapping (minimum)

| Endpoint group | Required permission(s) | Required grant |
| --- | --- | --- |
| `GET /api/audits`, `GET /api/audits/{id}` | `audit.read` | `audit:read` for each returned/target audit |
| `POST /api/audits/upload` | `audit.manage` | none (create is permission-only) |
| `PATCH/DELETE /api/audits*` | `audit.manage` | `audit:manage` (or admin override) |
| `GET /api/databases`, `GET /api/databases/{id}` | `database.read` | `database:read` |
| `POST /api/databases/upload` | `database.manage` | none (create is permission-only) |
| `PATCH/DELETE /api/databases*` | `database.manage` | `database:manage` (or admin override) |
| `POST /api/sql` | `database.query` | `database:read` on target database |
| `POST /api/runs` | `run.create` | `audit:run` + `database:read` for all selected databases |
| `GET /api/runs/{id}` | `run.read` | run owner or admin |
| `GET /api/runs/{id}/stream` | `run.read` | run owner or admin |
| `POST /api/runs/{id}/stop` | `run.stop` | run owner or admin |
| `PATCH /api/runs/{id}/cells/{ref}` | `run.edit_cells` | run owner or admin |
| `GET /api/runs/{id}/workbook` | `run.read` | run owner or admin, plus underlying resource grants |

---

### Endpoint semantics detail (implemented for clinician edits)

For `PATCH /api/runs/{id}/cells/{ref}`:
- Request fields are constrained to clinician review/correction semantics
  (`reviewState`, `corrected`, `value`).
- The target must be an interpret cell.
- Successful writes append a `verification` event carrying authenticated user attribution.
- Denials are explicit (`401` unauthenticated, `403` permission/ownership, `422` invalid edit shape).

---

## 7. Migration and compatibility rules

1. Moving from split stores to unified control-plane DB MUST preserve IDs and relationships.
2. `runs`, `cells`, `events` runtime semantics from `state-schema.md` MUST stay stable.
3. Resource IDs used in files under `var/` MUST match catalog table IDs.
4. Authorization behavior (`401` vs `403`, permission/grant order) MUST stay identical before and
   after physical store migration.
