# Auth & Access

Read [../README.md](../README.md) first. This is the **behavioral** home for three things
the product needs because it touches patient data:

- **who may use the tool and who did what** — login, sessions, per-user attribution;
- **what each user/role may access** — the authorization model (RBAC + resource grants) and the
  agent's safety boundary;
- **a complete record of every run** — the run log and prompt versioning.

This document keeps the **requirements and the acceptance bar**. The normative authority lives in
the contracts:

- **Schema + role/grant semantics + permission matrix:**
  [../contracts/control-plane-schema-and-permissions.md](../contracts/control-plane-schema-and-permissions.md)
- **Runtime row-level state** (`runs`/`cells`/`events`):
  [../contracts/state-schema.md](../contracts/state-schema.md)
- **On-disk location / deployment shape:** [../contracts/storage-layout.md](../contracts/storage-layout.md)

When these disagree, precedence is: the control-plane contract → the state-schema contract → this
behavioral document.

---

## 1. Access: login + network gate
- **Network-gated.** The tool is reachable only from inside the hospital network. For the product this
  is a deployment property (local-only, bound to the Trust network); it is not the app's job to
  police the network, but the spec assumes it.
- **Login.** A user must authenticate before any access. No anonymous use.
- **Per-user identity.** The authenticated user is attached to everything they do: every run, every
  query, every review action.
- **Sessions.** A user can log out and log back in; on login they see only the resources and run
  history they are allowed to access.

### Session policy
- Session token is held in an **HttpOnly session cookie**; never localStorage.
- Every session has hard expiry (`expires_at`) at 8 hours by default.
- Idle timeout (default 30 minutes without authenticated request) invalidates the session
  server-side.
- Final timeout values are confirmed with hospital IT (see [../open-questions.md](../open-questions.md), Q29).

### Storage & mechanism
- For the product, accounts and sessions are stored **locally on the machine that runs the server +
  agent**. No external identity provider.
- Future (out of the product): hospitals will use their own SSO (e.g. Microsoft / NHS login). The product must
  not hard-code assumptions that block swapping local auth for SSO later.

---

## 2. The control plane: one model, separate clinical sources

Intero has two data worlds:

1. **Control plane (Intero-owned metadata and runtime state):** users, sessions, roles,
   permissions, grants, audits, databases, mappings, runs, cells, events, query attribution.
2. **Clinical source databases (hospital-owned records):** EHR/lab/radiology SQLite or
   hospital-hosted equivalents, queried read-only.

The control plane is **logically one model**. In the product implementation it may be physically split
(`var/state.db` for runtime + transitional auth storage), but that split is an implementation
detail, not the architectural contract. This document is the source of truth for the control-plane
data model's *behavior*; it supersedes any table-level summaries duplicated elsewhere.

### Domain partitions inside the control plane

- **IAM** — users and sessions; the role catalog and role→permission bindings; optional direct
  user-permission overrides (deferred).
- **Resource catalog** — audit-template records (`spec.json` metadata), database records
  (`model.json` metadata + connection identity), mapping records (`mapping.json` metadata), plus
  ownership/lifecycle metadata (`created_by`, `status`, `schema_version`, `updated_at`).
- **Runtime** — runs, cells, events, field-code projections; per-run attribution and
  prompt/runtime parameters. This is the current `state.db` contract
  ([../contracts/state-schema.md](../contracts/state-schema.md)).
- **Audit-attribution** — the per-statement query log (`query_log`) tied to run + user + database
  resource, plus security/governance events for authz decisions (allow/deny) and role/grant changes.

---

## 3. Authorization model — hybrid RBAC + resource grants
The three role keys are `clinician` (**all clinical staff**, every persona P1–P5), `admin` (the
hospital IT engineer — a **clinician-superset**: the full clinician capability **plus** the admin
surface, [ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)), and `agent` (the system run
principal). §9–§15 are the behavioral detail; the normative authority is the
[control-plane contract](../contracts/control-plane-schema-and-permissions.md).

**Selected model:** role permissions gate **action classes** (`table_population.create`, `dataset.query`, …), and
resource grants gate **which Datasets/templates/tables** each user (or role) can access (the grantable
set per §10; `thread`/`project` are not grantable in v1 — the `resource_type` set is
`dataset`/`template`/`table`, normative in [contract §5](../contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing)).
Clinical data is read only through `dataset.query`
within a Dataset's scope (§11/§12) — there is no raw source-database query path for human roles.

Access evaluation is **deterministic, ordered, and fail-closed** (matches
[contract §3](../contracts/control-plane-schema-and-permissions.md#3-permission-evaluation-contract)
and §14):

1. **Authenticated session** (valid session);
2. **Active user** (`is_active`);
3. **Role permission** for the action class;
4. **Active resource grant** for the target resource(s) (`dataset`, `template`, `table`);
5. **Run-scope checks** for runtime mutations (`cells`/`events` only inside the active run).

A request is denied on the **first** failed check, with explicit status codes:
- invalid/missing session → `401`;
- authenticated but permission/grant/run-scope failure → `403`.

No implicit fallback. Protected endpoints **ignore any client-provided `user_id`** for
authorization; identity is always resolved server-side from the authenticated session.

**Why this model.** RBAC keeps policy understandable and auditable; resource grants support real
hospital sharing constraints (different users, different Datasets/templates/tables) without
overloading roles with per-resource exceptions.

The detailed permission matrix and database-role boundaries are **normative** in
[../contracts/control-plane-schema-and-permissions.md](../contracts/control-plane-schema-and-permissions.md).

### Required actor boundaries (roles)

- **`admin`** — the **hospital IT engineer**: holds the **entire `clinician` capability** (operates the
  tool like clinical staff, bounded by the same hospital data access) **plus** the admin surface —
  manages user accounts and role assignment (IAM) and points Intero at the **source databases**
  (connection identity). No `*` wildcard; a clinical **peer**, not a superuser (§9).
- **`clinician`** — **all clinical staff** (every persona P1–P5): creates Datasets and templates,
  opens threads, runs and reviews tables on granted resources, produces any output, and
  shares owned resources (Datasets/templates/tables) with colleagues — all bounded by their hospital
  data access (§11, §12).
- **`agent`** — no interactive login; executes run-scoped population actions under a strict DB role,
  reading clinical data only under the **running user's** data scope. The agent is **not** a
  superuser and never inherits `admin` capability.

### Agent safety boundary

The strongest control is **DB-level role permissions**, with tool/runtime checks as defense in
depth. The agent must be constrained to:

- read from granted clinical source databases with a **read-only** role;
- read control-plane runtime context needed for the current run;
- write **only** run-scoped runtime records (`cells`, selected `events`) for the current run.

The agent must **not** be able to: create/update/delete users, roles, permissions, grants, or
sessions; create/update/delete audit/database/mapping catalog metadata; execute DDL/DCL/admin
commands; or write to clinical source databases.

---

## 4. Attribution & query logging
The point of auth is traceability of data access.

- Every SQL statement against hospital data is logged against the requesting user.
- Every run is attributed to the user who started it.
- Review/correction actions are attributable to the reviewer.
- Read-only query enforcement and attribution logging are both required; one does not replace the
  other.

---

## 5. The run log

Every run produces a complete, structured record — not just stdout. It captures:

| Recorded | Detail |
| --- | --- |
| **User** | who ran it |
| **Request** | the prompt / pasted text the user entered |
| **Resolved target** | template + database set |
| **Template version** | exact library version pinned for the run ([library-and-sources.md](./library-and-sources.md)) |
| **Filters** | exact inclusion/exclusion criteria applied |
| **Agent activity** | reasoning + tool calls streamed during run |
| **Parameters** | model/runtime parameters used |
| **Prompt versions** | indexing / mapping / run prompt versions |
| **Per-cell results** | value, `kind`, confidence, and sources |
| **Verifications** | interpret-cell review/correction signals |
| **Status** | queued / in_progress / blocked / in_verification / complete |
| **Blocked items** | reason code, detail, owner needed, outstanding since |
| **Timing** | start/end and phase timing |

The record is structured and queryable, and remains local because it may contain PID.

### Prompt versioning
- Every system prompt is versioned (indexing, mapping, run/workflow).
- Every run records which prompt versions it used.
- This ties outcome shifts to specific prompt revisions.

---

## 6. Persistence model
Flat files are not sufficient for auth + governance. The product requires a real local
database-backed control plane with a migration-safe path to hospital-hosted infrastructure.

- **Architectural contract.** One logical control-plane model with stable IDs/relationships.
- **Production direction.** A hospital-hosted transactional DB is planned with hospital IT.

Storage locations are defined in [../contracts/storage-layout.md](../contracts/storage-layout.md).

### Tenancy stance

- **Current the product target:** single-hospital deployment.
- **Now:** keep the schema tenant-ready (`hospital_id`/`tenant_id` capable) so migration does not
  require a redesign; enforce clinician/agent role isolation now.
- **Future:** physical per-hospital isolation (database-per-hospital or schema-per-hospital) is a
  deployment decision, not a change to authorization semantics.

### Delivery stages

- **Short term (needed now):** canonical IAM + runtime minimum (`users`, `sessions`, user-role
  binding, role-permission mapping, resource grants, run + query attribution); enforce authn/authz
  on API endpoints with explicit `401`/`403`; strict agent DB role (read-only clinical + run-scoped
  runtime writes); keep local deployment under `var/` while preserving migration-safe schema
  boundaries.
- **Medium term (first production hardening):** collapse split stores into one transactional
  control-plane DB (hospital-hosted); add migration scripts + backfill; add governance events for
  policy changes and denied-access logging; enforce grant checks uniformly across indexing,
  mapping, and run paths.
- **Long term (scale and enterprise controls):** tenant/hospital isolation policy; advanced policy
  controls (break-glass, time-bounded grants, approval flows); read replicas/partitioning and
  archival for high-volume `events` and `query_log`.

---

## 7. Data handling & safety

- **Patient-identifiable data stays local.** Run logs/query logs may contain PID and must not leave
  the environment.
- Logs are attributable, and access to logs is itself authorization-gated.
- Outbound chase/reminder actions are human-initiated only; never auto-sent.

---

## 8. Non-goals (for this the product spec)

- Replacing clinical source databases with copied clinical records.
- Granting the agent broad SQL write access to control-plane policy tables.
- Final enterprise SSO integration details (kept compatible, implemented later).
- Intero-side **row-level data permissions** — Intero never builds its own per-row clinical access;
  it defers to the hospital's existing permissions (§11).
- A **department / team** entity — scoping is per-resource grants only (§10), never org units.

---

## 9. Roles & taxonomy — hospital jobs, three role keys
Intero must be safely usable by a **hospital IT engineer**, **clinical staff**, and the **system
agent**. They map onto three role keys, with meanings frozen normatively in
[contract §4](../contracts/control-plane-schema-and-permissions.md#4-roles-and-role-to-permission-policy).

| Hospital job | Persona(s) | Role key | What the role is for |
| --- | --- | --- | --- |
| **Clinical staff** | [P1–P5](../personas-and-use-cases.md) | **`clinician`** | Creates Datasets/templates, opens threads, runs/edits tables, produces any output, shares owned resources (Datasets/templates/tables) — bounded by data access. |
| Hospital **IT engineer** | [P6](../personas-and-use-cases.md) | **`admin`** (clinician-superset) | **Everything `clinician` can do** (operates the tool, bounded by data access) **plus** points Intero at the source database(s) and runs IAM (creates user accounts, assigns roles). |
| The **run agent** | — | **`agent`** (system) | Run-scoped population under the running user's data scope; never a human login. |

**One clinical role for five personas.** P1–P5 (auditing clinician, department head, requesting
doctor, clinical lead, CIO/director) are **distinct personas served by the single `clinician` role** —
nothing in the MVP gates them apart; oversight differences (P4/P5 are oversight-focused) are about
*which Datasets they hold*, not *what the role permits*. If a real capability split ever emerges it is
a **new role key** with its own permission row — no schema migration.

**Admin is a clinician-superset (deliberate).** `admin` holds the **entire `clinician` permission set
plus** the infra keys (IAM + source-database connection management); it has no `*` wildcard and, for
clinical work, is a **peer** of `clinician` (no override on others' resources). The hospital IT
engineer therefore **operates the tool and administers it from one account** — the reason the earlier
IT/clinical wall was reversed in
[decisions/0003-admin-is-a-clinician-superset.md](../decisions/0003-admin-is-a-clinician-superset.md)
(superseding [0002](../decisions/0002-it-infra-only-and-dataset-scoped-access.md) decision #1).
Clinical data access is **not** gated by Intero role — it bootstraps on the **hospital's**
SSO/permissions (§11, [Q37](../open-questions.md)), so an `admin` sees only what the hospital already
grants that person, exactly like a `clinician`. On synthetic/demo data this resolves to full end-to-end
use today; on **real Trust data the operate-half is fail-closed** until that hospital-permission
mechanism is wired (Q37) — the demo is unaffected (its data has no per-user hospital permission to
intersect). Recovery of a departed user's owned work is still
needed (a peer cannot open another owner's resources without a grant) and is **OPEN**
([open-questions.md](../open-questions.md) Q38), with §15 ownership reassignment as the MVP answer.

**Clinician-operated — and IT can operate too.** The product framing
([personas-and-use-cases.md](../personas-and-use-cases.md)) stands: an *audit* is run by whoever needs
it, never *ticketed* to a separate IT team. What changed from the earlier framing is that the IT
engineer is now **also a first-class operator** (the `admin` superset), not walled out of clinical
work — they enable Intero (connect databases, provision accounts) **and** use it like any clinician.

### IAM — how accounts and roles come to exist (IT)
This is the **admin** side of the IT engineer's use (P6) — distinct from the clinical work they may
also do — so it has a behavioral bar, not just a permission key. Owned by `admin`; **resource sharing
is not IAM** (that is owner-driven grants, §10).

- **Create an account.** IT creates a user with a **username**, a **`display_name`** (the human full
  name colleagues see when sharing, §10), and the **clinical-staff (`clinician`)** role (or `admin` for
  another IT engineer). No external IdP in MVP (SSO later).
- **The credential hand-off (first-login reset).** On creation the account is flagged
  `must_reset_password = true` and IT sets a **one-time initial credential shown on the IAM screen**,
  conveyed to the user **out-of-band** (in person / Trust-internal channel — never email, since PID and
  local-only rules keep traffic inside the environment). On first login the user can authenticate
  **only** to reach a **self-service "set new password"** screen; setting it clears
  `must_reset_password`, after which the clinical home (§13) opens. Until cleared, every other endpoint
  is `403` ([contract §9](../contracts/control-plane-schema-and-permissions.md#9-endpoint-authorization)).
- **Assign / change a role.** Role is a single value per user (`users.role_id`); IT can change it; the
  change takes effect on the user's next request (fail-closed).
- **First login lands clean.** After the reset the new user lands on the clinical home and sees the
  Datasets/threads shared with them (none until shared, or their own once created) — and, because the
  sharing directory lists not-yet-onboarded accounts (§10), a colleague can **pre-share** work so it is
  waiting on first login. An `admin` lands on the **same** clinical home (it is a clinician-superset)
  and additionally has the admin surface (§13).
- **Deactivate + reassign.** IT can deactivate a leaver (`is_active = false`) and **reassign their
  resources' ownership** to a named active clinician — an IAM-level, metadata-only action (the
  reassignment itself surfaces no clinical data; it only re-points ownership) (§15 / [contract §11](../contracts/control-plane-schema-and-permissions.md#11-ownership-reassignment-a-clinician-leaves)).
  In MVP this is an `admin` action; a clinician cannot self-recover a colleague's orphaned work.

## 10. Resource grants & sharing
Scoping is **per-resource grants** — no department/team entity. Grants are governed normatively by
[contract §5](../contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing).

- **Grantable resources (v1):** `dataset`, `template` (a **table** definition), and `table` (a
  **populated** table / audit). **`thread` and `project` are NOT grantable** — thread sharing and
  projects are deferred (the value is the table). Clinical staff are **never** granted `database`
  (source databases are IT-only, §11). *(Matches the normative `resource_type` set in
  [contract §5](../contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing).)*
- **Owner-driven sharing.** A user may grant/revoke on a resource **iff** they created it **or** hold a
  `manage` grant on it. A department head shares a Dataset/template/table with a colleague; a colleague
  may equally share what they created. An `admin`, being a clinician-superset, shares the resources
  **it** owns by the same rule — it gets **no** special authority over resources others own.
- **Editor-only sharing (v1).** Sharing always grants **editor** access — the grantee opens **and
  edits the same** resource (the same artifact, never a copy). There is **no** read-only / run-only
  level in the product; the editor grant maps to the control-plane `manage` `grant_type`
  ([contract §5](../contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing)).
  v1 makes **no owner-vs-editor distinction** — an editor can also re-share and revoke. *(The schema
  still defines `read`/`run`/`manage`; v1 product sharing issues `manage`.)*
- **Grants are assignable and revocable**, may carry an expiry, and a user may hold **many** at once.
  Revoking fail-closes the grantee's next request.
- **Share-then-use actually works.** Sharing a **populated table** **cascades** `read` on its
  **Dataset** as **access-only** (so the grantee sees the cohort) — but the Dataset is **not** added to
  the grantee's Datasets library; sharing a **table template** likewise carries what is needed to open
  it. So shared work opens and re-runs without separately-remembered grants. The grantee still needs
  their **own** hospital permission for the underlying data (§11) — the hospital's to grant, not
  Intero's. *(Thread/project cascades are removed with thread sharing deferred.)*
- **Naming a colleague to share with.** An owner picks the recipient from a **clinical-staff
  directory** (`GET /api/clinicians` — `display_name` (full name) + id only, no PID, no IAM), so
  sharing targets a *named person*, not just "everyone with the clinician role". The directory lists
  every `clinician` account **including not-yet-onboarded joiners** (so work can be pre-shared, §9),
  excluding deactivated users. Account management stays IT-only (§9).
- **Where sharing lives.** Sharing is seen and managed **only from the resource's Share dialog** (its
  ⋯ → Share): a single chip-input where each current grantee is a **chip** (remove the chip to
  revoke), and a search adds colleagues from the directory. There is **no** separate shared-with-me /
  shared-by-me view and **no** left-panel "Shared" destination. A resource shared **with** a clinician
  appears in their **normal library** — a Dataset in Datasets, a template in Templates, a table in
  Tables. A newly received **Dataset** additionally shows the Data library blue notification dot and a
  matching blue Dataset card until the recipient clicks **Keep** (clear the notification, keep the
  grant) or **Delete** (revoke the inbound grant and remove it from their library).
- **Oversight (serves the department head / clinical lead, P2/P4).** A resource's owner / `manage`
  holder can see **run-attribution metadata** for runs on it — who ran it, when, which Dataset/template
  — **without** PID, cell values, or query SQL. This is **per-owned-resource only**: a run on a
  resource owned by someone else is invisible. A **department-wide "who ran what"** across resources
  others own is **next-phase** (no team entity in MVP) — [status-and-blocked-items.md](status-and-blocked-items.md).

## 11. Data access — Datasets, not raw databases
Clinical users never see or manage **source databases**; they work through **Datasets** (the data
library, [library-and-sources.md](library-and-sources.md)). A **Dataset** is a named, shareable filter
that scopes the one logical hospital database to a slice; the role/grant + hospital-permission gating
wraps it. Normative rule:
[contract §6](../contracts/control-plane-schema-and-permissions.md#6-clinical-data-access).

- **Any clinical user can create a Dataset** (describe a slice → grounded filters,
  [inclusion-criteria-setup.md](inclusion-criteria-setup.md)); Datasets are shareable (§10). Creating
  one references **source databases by name only** through the grounding surface — never their rows or
  connection identity.
- **The data-access rule (fail-closed):** effective rows =
  **(the Dataset's scope filters, or the whole hospital database when a thread has no Dataset) ∩ (the
  user's existing hospital DB permissions).** Intero applies the Dataset's filters; the agent reads
  under the **running user's** hospital credentials; Intero **never broadens** access beyond what the
  hospital already grants that user, and builds **no** Intero-side row-level data permissions. *(How
  the Dataset's filters apply differs by output — a **hard cohort** pinned to a **table**, vs.
  **per-message** scoping for a **chat** answer (the thread is unscoped) — but the **∩
  hospital-permissions** half is the hard security wall in every case; the Dataset is never the
  security boundary. Scope binds to the table, not the thread:
  [decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md) and §12.)*
- **Distinguish the two "no access" outcomes.** A missing **Intero grant** (no `dataset:read` /
  `table:read`) is a `403` "you don't have access" (§13). A present grant but **no resolvable hospital
  permission** for a touched source database is **not** a `403` — the run proceeds and reads nothing;
  the UI surfaces a clear **blocked/empty** state that says *the hospital has not granted you access to
  this data* (so the clinician asks their Trust, not Intero), never a bare empty table or generic error.
- **Deferral to the hospital (external dependency — OPEN, Q37).** *How* Intero obtains/enforces each
  user's hospital DB permissions at query time is **not designed here**. Working assumption: per-user
  SSO / hospital credentials passed through, agent acting as the user; fail-closed until resolved.

## 12. Output access rule — never gated
The output **types** — **chat** and **table** (dashboard deferred) — are **never gated by role or
permission**. Every output is bounded **only** by the creator's data access (§11): if a user can see
the rows, they can render them and share the **table** with other clinical staff (§10) — threads
themselves are not shareable. Authorization gates **resources and data access, not output kinds**.
(Normative:
[contract §7](../contracts/control-plane-schema-and-permissions.md#7-outputs-are-never-permission-gated).)

## 13. Frontend role-based gating
There is **no frontend role gating today** — every authenticated user sees every surface. The MVP adds
role-awareness to the Svelte app. The frontend is a **convenience layer, never the security boundary** —
every gate it shows is independently enforced server-side (§14).

The gating is **additive** ([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)): every role
sees the full clinical app; an `admin` sees **one extra thing** — the admin settings surface. Role gates
**only** that surface, never clinical surfaces.

- **Role-aware navigation.** The role is read from `GET /api/auth/me` (the `role` field in that
  contract — [api.md](../contracts/api.md)) and drives whether the admin settings surface renders.

  | Left-panel destination | `clinician` (clinical staff) | `admin` (IT, clinician-superset) |
  | --- | --- | --- |
  | New, search, threads list, Datasets, Templates, Tables (flat — no projects) | **shown** | **shown** (identical) |
  | Table view + its evidence/activity panel | shown | **shown** (identical) |
  | Sharing — managed in each resource's **Share dialog** (§10); no dedicated nav surface | shown | **shown** (identical) |
  | **Settings → user & role management (IAM)** | hidden | **shown — admin-only** |
  | **Settings → source-database connections** (register/point-at/disconnect) | hidden | **shown — admin-only** |

- **The admin surface is *additive*, under Settings.** User/role management (IAM) and source-database
  connection management are **net-new screens** reached from **Settings** (the left-panel settings
  entry, today an unspecified placeholder / dead window — [design-system.md](design-system.md)). An
  `admin` sees the **whole clinician app and additionally** these admin screens, and lands on the
  **clinical home** like anyone else — it is **not** routed to an IT-only home. A `clinician` opening
  Settings sees only the non-admin settings (e.g. language), never the admin screens.
- **Clinical users never see raw databases.** Consistent with the reframe
  ([library-and-sources.md](library-and-sources.md)), a `clinician` sees the **Datasets, Templates,
  and Tables** libraries, never source-database records or connection management — those live only on
  the admin surface.
- **The absent-vs-unauthorized seam (so the rule is testable).**
  - **The admin surface is absent for a `clinician`** — the IAM and source-DB-connection screens do
    not render, and their endpoints return `403`. Every hidden admin control corresponds to a denied
    endpoint. (Clinical surfaces are absent for **no** role — `admin` and `clinician` see them alike.)
  - **Resource grants the user lacks make the item *not listed*** — an ungranted Dataset/template/table
    simply doesn't appear in their library (for `admin` and `clinician` alike — the peer model).
  - **A direct nav / deep link to an ungranted resource id** shows the **unauthorized state**, never
    the resource.
- **The unauthorized state.** There is no separate "403" design pattern; the unauthorized state
  **reuses the existing error-state pattern** ([design-system.md](design-system.md);
  [product-flows.md](../product-flows.md) state table) with fixed copy ("You don't have access to
  this") and **no resource payload** — the server returns `403` with no body, so nothing leaks, no
  flash of data. (A run that reads nothing for lack of *hospital* permission is the different
  **blocked/empty** state, §11.)

## 14. Enforcement & invariants
All authorization is **server-side and fail-closed**, following the ordered, deterministic check in
[contract §3](../contracts/control-plane-schema-and-permissions.md#3-permission-evaluation-contract):
session → `is_active` → role permission → route-specific resource/run check. It denies on the
**first** failed check with `401` (no/invalid session), `403` (authenticated but unauthorized), or
`404` for missing resources resolved before authorization. It honors the architecture invariants
([architecture.md](../architecture.md), [personas-and-use-cases.md](../personas-and-use-cases.md)):

- **Read-only** — no run mutates a patient record or hospital system (SQLite-level, §3 / §5 DB roles).
- **Local-only / no PID egress** — run logs, query logs, and any PID stay in the environment.
- **Least-privilege** — `admin` is allow-listed to the `clinician` set plus the three infra keys (no
  `*` wildcard) and is a clinical **peer**; `agent` is run-scoped; clinical data — for `clinician` and
  `admin` alike — is read only through granted Datasets under the hospital's permissions.
- **Resource and run gates** — Dataset/template/table reads require owner-or-grant; table shares derive
  read access to the wrapped run's status/workbook/download endpoints; run stop/stream/refresh and
  cell edits remain owner-only with no `admin` override; `/api/sql` requires `dataset.query`.
- **Per-user attribution** — every run and every clinical SQL statement is attributed to the
  authenticated user (§4), including the agent's reads under that user's scope.

## 15. Seeding & recovery
Stored roles + grants are seeded as specified normatively in
[contract §10–§11](../contracts/control-plane-schema-and-permissions.md#10-seeding-and-migration).
In behavioral terms:

- Seed the `roles`/`permissions`/`role_permissions` catalog (§9 policy); a user's role resolves from
  `users.role_id` (no username-derived roles, no `admin` wildcard).
- `agent` → agent; the **seed/demo account → `admin`** (clinician-superset) so the single demo user
  runs the cord-pH audit end-to-end **and** reaches the admin surface (IAM + source-DB connections)
  from one login; additional human users default to **`clinician`**.
- Backfill a `manage` self-grant for each existing Dataset/template/table to its owner, so
  the single-user demo owns and can reach everything.
- **Departed-user recovery:** an `admin` can deactivate a leaver and reassign their resources'
  ownership to a named active clinician (the reassignment itself surfaces no clinical data) — the MVP
  answer to Q38.

---

## Acceptance (auth & access)

- No data is accessible without login; anonymous access returns nothing.
- Every run and every SQL statement against hospital data is attributed to the authenticated user.
- A user can log out and back in and see only their authorized resources and run history.
- Authorization follows the ordered, fail-closed checks above with consistent `401`
  (unauthenticated) / `403` (unauthorized) behavior; the agent runtime role cannot mutate IAM/catalog
  policy tables (blocked at DB-role level).
- Every run produces a structured record with request, resolved target, filters, activity,
  parameters, prompt versions, per-cell results, and verifications.
- Control-plane schema + role/grant semantics are implemented per
  [../contracts/control-plane-schema-and-permissions.md](../contracts/control-plane-schema-and-permissions.md).
- Runtime state semantics are implemented per [../contracts/state-schema.md](../contracts/state-schema.md).

### Acceptance — hospital-role RBAC (§9–§15)

- **Admin = clinician-superset.** An `admin` can do everything a `clinician` can (open threads,
  create/query Datasets, run/edit tables, produce any output) **and** additionally create
  accounts, assign roles, and manage source-database connections. No `admin: *` wildcard exists —
  `admin` is the `clinician` set plus the three infra keys (`iam.manage_users`, `iam.manage_roles`,
  `database.manage`); for clinical work it is a **peer** with no override on others' resources.
- **Clinical staff capability.** A `clinician` can create Datasets/templates, open threads, run/edit
  tables, and produce any output, and is `403` on IAM and source-DB-connection endpoints.
- **Sharing a named colleague, end-to-end.** A clinical owner picks a colleague from the directory
  (`GET /api/clinicians`, name+id only), grants **editor** access (editor-only) on a
  Dataset/template/**table**; sharing a **populated table** cascades **Dataset access-only** so the
  grantee can open it; a revoke fail-closes the next request; a user may hold many grants; **threads
  are not grantable**; IT cannot create resource grants.
- **Grant visibility & oversight.** A clinician sees and manages who a resource is shared with from
  its **Share dialog** (a chip per grantee; remove to revoke), and a received resource appears
  directly in their library; a newly received Dataset carries the Data library notification +
  Keep/Delete handling until processed; a resource owner sees run-attribution metadata (who/when/which
  — no PID/SQL) for runs on it.
- **IT onboarding & recovery.** An `admin` creates an account, assigns the clinician role, the user
  logs in to the clinical home; an `admin` can deactivate a leaver and reassign their resources'
  ownership (the reassignment itself surfaces no clinical data).
- **Datasets, not raw DBs.** Clinical users see the Datasets / Templates / Tables libraries; source
  databases and connection management never appear for a `clinician`; a table run is scoped to the
  chosen Dataset's criteria. *(The intersection with the user's hospital permissions and the read-nothing fail-closed
  behavior are **deferred — blocked on Q37**; when the bound data exposes nothing the UI shows a clear
  **blocked** state, distinct from a `403`.)*
- **Outputs ungated.** No output type (chat/table; dashboard deferred) is blocked by role/permission;
  an output is bounded only by the creator's data access, and the **table** is shareable with other
  clinical staff (threads are not).
- **Frontend gating mirrors the server.** The role from `GET /api/auth/me` drives the rendered nav; the
  **admin surface is absent for a `clinician`** (not just disabled) and its endpoints `403`; clinical
  surfaces render for both roles; a direct nav to an ungranted resource shows a non-leaking unauthorized
  state matching the server `403`.
- **Seeding.** The seed/demo account logs in as **`admin`**, runs the cord-pH audit end-to-end **and**
  reaches the admin surface; additional users default to `clinician`; seeded Datasets/templates/tables
  carry an owner `manage` grant.
