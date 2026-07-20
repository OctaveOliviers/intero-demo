# Contract — Control-Plane Schema & Permissions

**Status: frozen.** This contract is the canonical control-plane schema and authorization model for
Intero. It describes the **only** authorization behavior the product implements.

The model in one breath: three principals —

- **`admin`** — the **hospital IT engineer**: a **clinician-superset** — the full `clinician`
  capability **plus** the infrastructure surface (IAM + source-database connection management). A peer
  of `clinician` for clinical work (no override on others' resources), not a superuser
  ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)).
- **`clinician`** — **all clinical staff** (every persona P1–P5): creates and runs the
  operational-intelligence objects and shares the ones they own.
- **`agent`** — the **system run principal**: no interactive login; run-scoped runtime writes only,
  reading clinical data only under the running user's scope.

Role permissions gate **action classes**; resource grants gate **which `dataset`/`template`/`table`**
each user can reach; clinical data access is **the Dataset's scope ∩ the user's existing
hospital permissions**; and the three output types (chat/table/dashboard) are **never**
permission-gated.

This is the normative authority for:
- IAM tables (`users`, `sessions`, `roles`, `permissions`, `role_permissions`)
- User-role binding (`users.role_id`, single-role users)
- Resource access tables (`resource_grants`)
- Catalog metadata (`audits`, `databases`, `mappings`)
- Runtime ownership/attribution tables (`runs`, `query_log`) and their joins to runtime state
- Database role boundaries (`api_app`, `orchestrator_runtime`, `agent_runtime_writer`, `clinical_readonly`)

Runtime row-level state (`cells`, `events`) remains detailed in
[state-schema.md](state-schema.md); this contract owns who can access and mutate it.

The grantable resource objects — `dataset`, `template`, `table` — are the
operational-intelligence objects ([CONTEXT.md](../CONTEXT.md)); `thread`/`project` are deliberately
**not** grantable (§5, [ADR 0004](../decisions/0004-scope-binds-to-table-not-thread.md)). Their
concrete catalog tables and endpoints are defined by the data-model work still owed in
[open-questions.md](../open-questions.md) **Q31**; this contract owns their **access semantics**
(ownership, grants, the data-access rule), which are final regardless of how those tables land.

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
| `display_name` | text | required — the human full name `GET /api/clinicians` returns so a sharer picks the right person (not PID-sensitive) |
| `email` | text | optional, unique when present |
| `password_hash` | text | required |
| `must_reset_password` | bool | required, default `true` on IT-created accounts; forces the first-login password reset (§4 IAM, §9) |
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

The three role keys: `clinician` = **clinical staff** (one role for every clinical persona P1–P5 —
auditing clinician, department head, requesting doctor, clinical lead, CIO/director); `admin` = **IT, a
clinician-superset** (the `clinician` set plus the admin surface — IAM + source-DB connections);
`agent` = **system principal**. Their permission sets are §4.

## `permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `key` | text | unique |
| `description` | text | optional |

Permission keys:

- **Clinical data & objects (held by `clinician`):**
  - `dataset.read`, `dataset.manage`, `dataset.query` — clinical data is read through a Dataset's scope.
  - `template.read`, `template.manage` — table/dashboard definitions in the output library.
  - `table.read`, `table.manage` — populated audit tables.
  - `thread.read`, `thread.manage`; `project.read`, `project.manage` (project entity deferred).
  - `table_population.create`, `table_population.read`, `table_population.stop`, `table_population.edit_cells` — table-population actions inside a thread.
  - `grant.manage_owned` — share a resource you own (§5).
  - `logs.read_query_log` — own attribution only (§4).
- **Infrastructure (held by `admin`/IT):**
  - `iam.manage_users`, `iam.manage_roles`.
  - `database.manage` — register / point-at / disconnect a **source** database (connection identity
    only; grants **no** access to the rows inside).

There is **no** raw source-database read/query permission for human roles: clinical reads go **only**
through `dataset.query`, resolved by §6.

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
| `resource_type` | enum | `dataset`, `template`, `table` |
| `resource_id` | ref | required |
| `grant_type` | enum | `read`, `run`, `manage` |
| `granted_by` | ref | FK -> `users.id`, required |
| `created_at` | timestamp | required |
| `expires_at` | timestamp | nullable |
| `revoked_at` | timestamp | nullable |

Active grant = `revoked_at IS NULL` and (`expires_at IS NULL OR now < expires_at`). Source databases
are **never** a grantable `resource_type` — they are IT-only and clinical users never hold them.
Grant semantics (who may grant, the share-then-use cascade) are §5.

## `audits`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | id | PK |
| `hospital_id` | ref | required |
| `name` | text | required |
| `status` | enum | `indexing`, `ready`, `error` |
| `schema_version` | text | required |
| `spec_hash` | text | required |
| `storage_path` | text | required (`var/templates/<id>/spec.json`) |
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
| `storage_path` | text | required (`var/templates/<id>/mapping.json`) |
| `created_by` | ref | FK -> `users.id` |
| `created_at` | timestamp | required |
| `updated_at` | timestamp | required |

A mapping may reference multiple databases in artifact content; runtime validation MUST ensure all
referenced databases exist and are granted before run start.

## `runs`

`runs` columns are governed by [state-schema.md](state-schema.md). This contract adds required
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
2. Check `is_active` user (`403` on failure).
3. Resolve user's role via `users.role_id`, then check role permission (`permissions.key` via `role_permissions`) (`403` on failure).
4. If the action is on a grantable resource (`dataset`/`template`/`table`), check ownership or active
   `resource_grants` for the subject (`user` grant OR the user's role) (`403` on failure).
5. If the action reads table-population outputs for a persisted table (`GET /api/table-populations/{id}`
   status, `/workbook`, `/download`), allow the table-population owner or a user with
   `table_population.read`, `table.read`, and an active grant on the table whose
   `table_population_id` wraps the table population.
6. For table-population mutations and streams, assert the table population belongs to the user (the owner — no
   `admin` override; `admin` is a clinical **peer**, not a superuser,
   [ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)) and that the target resource
   belongs to that table population.

Grant checks are additive (role grants + user grants), never subtractive.

---

## 4. Roles and role-to-permission policy

The three role *keys* (`admin`, `clinician`, `agent`) and their meanings:

- **`admin` — IT engineer, a clinician-superset** ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)).
  Holds the **entire `clinician` permission set** (so the IT person operates the tool — opens threads,
  creates/queries Datasets, runs and edits tables/dashboards — exactly like clinical staff, bounded by
  the same hospital data access, §6) **plus** the infrastructure surface: registers/points Intero at
  the **source databases** (connection identity — the source systems that compose the one logical
  hospital database, [CONTEXT.md](../CONTEXT.md)) and runs IAM (creates user accounts, assigns roles).
  `admin` resolves to the explicit set below — there is **no `*` wildcard**. For clinical work `admin`
  is a **peer**: it owns what it creates and needs a grant for another user's resource, with **no**
  override on others' threads/resources (§3, §5).
- **`clinician` — clinical staff.** The single role for **every clinical persona** (P1 auditing
  clinician, P2 department head, P3 requesting doctor, P4 clinical lead, P5 CIO/director — distinct
  personas, one role). Creates Datasets and templates, opens threads, runs/edits tables and
  dashboards, produces any output (§7), and shares any resource they own with colleagues (§5). All
  clinical reads are bounded by their hospital data access (§6). Holds **no** IAM and **no**
  `database.manage` permission.
- **`agent` — system principal.** No interactive login; run-scoped runtime writes only (§8); reads
  clinical data only under the **running user's** data scope (§6) via the read-only
  `clinical_readonly` DB role (§8).

| Role | Permissions (the complete set) |
| --- | --- |
| **`clinician` (clinical staff)** | `dataset.read`, `dataset.manage`, `dataset.query`, `template.read`, `template.manage`, `thread.read`, `thread.manage`, `table.read`, `table.manage`, `project.read`, `project.manage`, `table_population.create`, `table_population.read`, `table_population.stop`, `table_population.edit_cells`, `grant.manage_owned`, `logs.read_query_log` (own attribution only) |
| **`admin` (IT)** | **the entire `clinician` set above** **+** `iam.manage_users`, `iam.manage_roles`, `database.manage` |
| **`agent` (system)** | none (runtime DB role only, §8) |

`admin`'s set is finite and enumerated — enforced positively (allow-list), with **no `*` wildcard**;
it is the clinician set plus the three infra keys. The three keys `iam.manage_users`,
`iam.manage_roles`, `database.manage` are held **only** by `admin` — they are what makes the admin
settings surface (§9) `admin`-only. The agent does not authenticate through user sessions for UI/API
routes.

**Consequence (deliberate, [ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)):** the
IT/clinical wall is removed — an `admin` *can* read clinical data, but only what the **hospital's**
permissions already grant that person (§6); Intero never confers clinical sight by role. Because
`admin` is a **peer** (not a superuser), a departed clinician's owned resources are still not directly
openable by anyone lacking a grant — recovery is the metadata-only ownership reassignment in §11; the
residual governance policy is OPEN ([open-questions.md](../open-questions.md) Q38).

There are **two distinct, non-overlapping log-read paths**, so the same key never leaks another
user's SQL:
- **`logs.read_query_log`** resolves to **only the caller's own `user_id` rows** of `query_log`
  (including the `sql` column, which is the caller's own). No role may read **another** user's
  `query_log` rows in MVP (they may contain PID).
- **Owner oversight** (a separate read path, serving the department head / clinical lead P2/P4):
  ownership-gated, **not** a permission key. A resource's `created_by` (or a `manage`-grant holder)
  may read **run-attribution metadata** for runs on that resource — *who* ran it, *when*, and *which*
  Dataset/template — and this path **never selects PID, cell values, or the `sql` column**. It is
  **per-owned-resource only**: a run on a resource the caller does not own (or hold `manage` on) is
  invisible. A department-wide "who ran what" across resources others own is **next-phase** (there is
  no team entity in MVP) — see [personas-and-use-cases.md](../personas-and-use-cases.md) P4 and
  [status-and-blocked-items.md](../features/status-and-blocked-items.md).

> **Personas, not roles.** P1–P5 are five clinical *personas* served by the **one** `clinician` role;
> nothing in the model gates them apart. If a real capability split ever emerges (e.g. only some may
> grant), it is a **new role key** with its own row above — a role-catalog + `role_permissions`
> change, **no schema migration**.

---

## 5. Resource grants and sharing

Scoping is **per-resource grants** — there is no department/team entity.

- **Grantable resources** are `dataset`, `template` (a reusable table/dashboard definition in the
  output library), and `table` (a populated audit — the durable, shareable output;
  [ADR 0004](../decisions/0004-scope-binds-to-table-not-thread.md)). `thread` and `project` are
  **not** grantable: a thread is a throwaway, unscoped work unit (the table it produces is the
  shareable artifact, ADR 0004), and there is no project grouping in MVP. Clinical staff are granted
  the three grantable types — **never `database`** (source databases are IT-only; clinical users
  never see or hold them).
- **Who may grant on a resource R (the exact predicate).** A subject may create/revoke grants on R
  **iff** they hold the `grant.manage_owned` permission (every `clinician` does, and `admin` too as a
  clinician-superset) **AND** (they are R's `created_by` **OR** hold an active `manage` grant on R). So
  an `admin`, as a **peer**, may grant only on resources **it** owns — it has **no** authority over
  resources others own.
- Grants are **assignable and revocable**, may carry `expires_at`, and a subject may hold **many** at
  once; a revoke fail-closes the grantee's next request. `grant_type` is `read`, `run`, or `manage`;
  a `manage` grant is what lets a non-owner re-share. **v1 product sharing is editor-only:** the UI
  issues the `manage` (editor) grant **exclusively** — the grantee edits the same resource and may
  re-share — so `read`/`run` remain valid schema values reserved for future / agent use, not
  surfaced as a sharing level.
- **Share-then-use cascade (so shared work is actually usable).** Granting a subject access (any
  `grant_type` — v1 issues the editor `manage`) on a **table** **MUST also grant** that subject
  **access-only `read`** on the table's pinned **Dataset** (if any) — they travel together, so a grantee can open and re-run the shared audit without a
  separately-remembered Dataset grant, and the cascade does **not** add the Dataset to the grantee's
  own library ([ADR 0004](../decisions/0004-scope-binds-to-table-not-thread.md);
  [library-and-sources.md](../features/library-and-sources.md) §Sharing). The grantee still needs
  their own hospital permission for the underlying data (§6); Intero cannot grant that.
- **Naming a colleague to share with.** A `clinician` may call `GET /api/clinicians` — a minimal
  directory of clinical-staff **`display_name` + user id only** (no PID, no IAM mutation, no
  `admin`/`agent` accounts), gated by `grant.manage_owned`. It lists **all `clinician`-role accounts
  regardless of login state** (so a sharer can pre-share to a colleague who has been created but has
  not yet completed first login), **excluding deactivated** (`is_active = false`) users. This is the
  only clinical-staff-visible read of the user list; full account management stays `admin`-only IAM.
  Share creation rejects unknown, deactivated, `admin`, and `agent` subjects.
- **Where sharing is seen / managed.** A resource's grantees are seen and managed from the
  resource's **Share dialog**, backed by `GET …/shared-by-me` filtered to that resource (each grantee
  a chip; remove to revoke). A resource shared **with** a clinician appears in their **normal library**
  directly (the owner-or-grant list endpoints return it) — v1 has **no** separate shared-with-me view
  or left-panel "Shared" destination. The Data library consumes `shared-with-me` only to mark newly
  received **Datasets** as unprocessed: blue nav dot + blue Dataset card with **Keep** (mark handled)
  or **Delete** (revoke the inbound grant). The resource Share dialog remains the only place grantees
  are managed as chips.

---

## 6. Clinical data access

Data access = **the Dataset's scope ∩ the user's existing hospital permissions**.

- The product scopes **one logical hospital database** ([CONTEXT.md](../CONTEXT.md)); a **Dataset** is
  a saved, named filter slicing it. A thread is scoped to **at most one** Dataset (none ⇒ the whole
  hospital database).
- **Effective rows = (the Dataset's scope filters, or the whole database when no Dataset) ∩ (the
  user's existing hospital DB permissions).** Intero applies the Dataset's filters; the agent reads
  under the **running user's** hospital credentials; Intero **never broadens** access beyond what the
  hospital already grants that user, and builds **no** Intero-side row-level data permissions.
- **Two distinct "no access" outcomes.** A missing **Intero grant** (no `dataset:read` / `table:read`)
  is a `403` "you don't have access". A present grant but **no resolvable hospital permission** for a
  touched source database is **not** a `403` — the run proceeds and reads nothing, and the UI surfaces
  a clear **blocked/empty** state (§13 of [auth-and-access.md](../features/auth-and-access.md)).
- **External dependency — OPEN ([open-questions.md](../open-questions.md) Q37).** *How* Intero
  obtains/enforces each user's hospital DB permissions at query time is not designed here. Working
  assumption: per-user SSO / hospital credentials passed through, with the agent acting as the user.
  Until resolved, enforcement is **fail-closed** — a user with no resolvable hospital permission for a
  touched source database reads nothing.
- A Dataset's filters are grounded to real `database → table.column` predicates and proved by a
  read-only `COUNT` ([library-and-sources.md](../features/library-and-sources.md),
  [inclusion-criteria-setup.md](../features/inclusion-criteria-setup.md)); the role/grant +
  hospital-permission gating wraps that existing mechanism — it is never a second filter concept.

---

## 7. Outputs are never permission-gated

The three output **types** — **chat**, **table**, **dashboard** ([CONTEXT.md](../CONTEXT.md)) — are
**never gated by role or permission**. Every output is bounded **only** by the creator's data access
(§6): if a user can see the rows, they can render them as a chat answer, a table, or a dashboard, and
can share that output (its thread) with other clinical staff (§5). Authorization gates **resources
and data access, not output kinds**.

---

## 8. Database role boundaries (mandatory)

## `api_app` role
- Used by backend HTTP routes.
- Can read/write IAM, catalog, runtime, and logs according to endpoint logic.
- Cannot write clinical source databases.
- **Sole writer of the table population lifecycle** — `runs.population_status`,
  `runs.population_status_detail`, `runs.population_result_status` (the process
  status, owned by the server/session-transport layer; see
  [state-schema.md](state-schema.md)). `orchestrator_runtime` deliberately does
  **not** hold these in its `runs` UPDATE column list below.

## `orchestrator_runtime` role
- Used only by the population run process for run-state coordination.
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
- Used by agent tooling during the table-agent step.
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

## Clinician runtime cell edits (authenticated API user)
- Requires:
  1. authenticated active session,
  2. `table_population.edit_cells` permission,
  3. table-population ownership (the owner; **no `admin` override** — an `admin` may edit cells only on
     table populations it owns, as a peer).
- Write scope is run-scoped (`WHERE run_id = :run_id`) and limited to interpret-cell review/correction.

| Table | Allowed actions |
| --- | --- |
| `cells` | `UPDATE` interpret cells only: `review_state` (`not_reviewed -> reviewed`), `corrected`, `value` (only when user correction occurs). |
| `events` | `INSERT` `verification` event for each review/correction write. |

- Reviewer attribution is carried in the `verification` event payload tied to the authenticated user
  session (the `reviewed_by`/`reviewed_at` columns are not used — see `state-schema.md`).
- The editable surface is constrained to:
  - `review_state` accepts only transition to `reviewed`,
  - `value` updates require `corrected=true`,
  - empty/no-op edit payloads are rejected.
- Must not mutate `attempts`, `sources`, `resolved_by`, `reason_code`, `reason_detail`,
  `owner_needed`, `outstanding_since`, `run_members`, `run_executions`, IAM tables, or catalog tables.

## `clinical_readonly` role
- Used for clinical source database queries (both population steps).
- Read-only SQL only; no write/DDL/privilege changes.

DB-role enforcement is required even when tool-level validators exist.

---

## 9. Endpoint authorization

Authorization is expressed against the object model (`dataset`/`template`/`table` plus `thread`, with
`project` deferred), not a fixed legacy endpoint list. The rules every implementation
MUST satisfy:

- **Object access.** Reading/creating/editing a `dataset`/`template`/`table` requires the matching
  `*.read`/`*.manage` permission **and** ownership or an active grant on the target (§5). A `thread`
  (and the deferred `project`) is **not grantable**; current thread endpoints are gated by
  `thread.read`/`thread.manage` only until a thread owner field lands, and there is no resource-grant
  path for threads.
- **Clinical query.** Querying clinical data (the agent's reads, any ad-hoc query) requires
  `dataset.query` and resolves rows by §6 (Dataset scope ∩ hospital permissions). There is **no** raw
  source-database query endpoint for human roles.
- **Table-population lifecycle.** `table_population.create`, `table_population.stop`, refresh,
  streams, and `table_population.edit_cells` are gated by the table-population owner (no `admin`
  override). Table-population read outputs reused by a persisted table
  (`GET /api/table-populations/{id}` status, `/workbook`, `/download`) are readable by the owner
  **or** by a user with `table_population.read`, `table.read`, and an active grant on the table whose
  persisted `table_population_id` wraps that table population. Revoke or expiry fail-closes the next
  output read. There is **no `admin` override** — `admin` is a
  clinical **peer**, not a superuser ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)).
- **Session role.** `GET /api/auth/me` and `POST /api/auth/login` return the caller's `role`
  (resolved server-side from `users.role_id`, never trusted from the client) so the SPA can render
  role-aware navigation ([../features/auth-and-access.md §13](../features/auth-and-access.md)).
- **IAM & source-database management.** `/api/iam/*` and **all mutating source-database endpoints**
  (`POST /api/databases/upload`, `PATCH`/`DELETE /api/databases/{id}`, `POST /api/databases/{id}/reindex`,
  and any register/point-at/disconnect connection route) require
  `iam.manage_users`/`iam.manage_roles`/`database.manage` and are **`admin`-only** — `403` for
  `clinician`. The **detail** endpoint `GET /api/databases/{id}` is admin-only too — it returns the full
  `model.json` (tables/columns/coded values), which is source-database records a `clinician` never sees
  ([auth-and-access.md §13](../features/auth-and-access.md)). Clinical endpoints are **not** gated by
  role: `admin`, as a clinician-superset ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)),
  reaches them like any `clinician` (still bounded by ownership/grants, §5, and the hospital's data
  permissions, §6). *Transition note (pre-Q31):* until Datasets replace direct database selection, only
  the **summary list** `GET /api/databases` (id/name/status cards — no records, no connection identity)
  stays readable by clinical users so a run can still name a database; it converges to the Dataset
  surface with the Q31 work, after which clinical users see only Datasets (§6, §13).
- **Sharing.** `POST …/grants`, `DELETE …/grants/{id}`, `GET /api/clinicians`, and the
  shared-with-me / shared-by-me lists follow §5.
- **First-login credential reset.** Account create/role-assign (`iam.manage_users`/`iam.manage_roles`)
  set `must_reset_password = true`; an authenticated **self-service set-password** endpoint (any role,
  the caller's own account) clears it. While `must_reset_password` is `true` a user may authenticate
  **only** to reach the set-password endpoint — every other clinical/IAM endpoint is `403` until it is
  cleared (§9 first-login flow in [auth-and-access.md](../features/auth-and-access.md)).

### Endpoint semantics detail (clinician cell edits)

For `PATCH /api/table-populations/{table_population_id}/cells/{ref}`:
- Request fields are constrained to clinician review/correction semantics
  (`reviewState`, `corrected`, `value`).
- The target must be an interpret cell.
- Successful writes append a `verification` event carrying authenticated user attribution.
- Denials are explicit (`401` unauthenticated, `403` permission/ownership, `422` invalid edit shape).

---

## 10. Seeding and migration

1. **Invariants.** Any physical-store move MUST preserve IDs/relationships and `state-schema.md`
   runtime semantics; `var/` IDs match catalog IDs; `401`/`403` semantics and the ordered
   permission→grant check (§3) stay identical before and after.
2. **Seed the role catalog** with `admin`, `clinician`, `agent` and the §4 `role_permissions` rows;
   resolve a user's role from `users.role_id` (no username-derived roles, no `admin` wildcard).
3. **Assign seed roles** (resolved from `users.role_id`, never derived from username): the `agent`
   principal → `agent`; the **seed/demo account → `admin`** (clinician-superset) so a single login runs
   the cord-pH audit end-to-end **and** reaches the admin surface (IAM + source-DB connections); any
   further human accounts default to `clinician`.
4. **Backfill `resource_grants`:** for every existing `dataset`, `template`, and `table`,
   insert a `manage` self-grant to its `created_by`, so nothing the demo owns becomes unreachable.

---

## 11. Ownership reassignment (a clinician leaves)

Because only a resource's owner / `manage`-grant holder can re-share **or open** it (§5) — and `admin`
is a **peer**, not a superuser, so it holds no override ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)) —
a departed clinician's Datasets/templates/tables would otherwise be unreachable. The MVP provides one
**IAM-level** recovery action, gated by `iam.manage_users` (IT):

- **Reassign ownership.** IT may transfer a resource's `created_by` (and the corresponding owner
  `manage` self-grant) **from a deactivated user to a named active clinician**, in one audited
  operation. This is an **IAM mutation on metadata only** — the reassignment itself surfaces no
  clinical data, cell values, or query SQL; it only re-points ownership so the named clinician can
  reach the work.
- **Constraint:** reassignment targets only an `is_active = false` user; it emits a governance event
  (§2 audit-attribution). In MVP this is an **IT action** (a clinical owner cannot self-recover a
  departed colleague's orphaned work) — an accepted round-trip until self-serve recovery is designed.
  Residual policy (triggers, who approves, retention) is OPEN
  ([open-questions.md](../open-questions.md) Q38).
