# Auth & Audit Log

Read [README.md](./README.md) first. This document specifies two governance foundations the
MVP needs because it touches patient data: **who is allowed to use the tool and who did
what** (auth + attribution), and **a complete record of every run** (the audit log +
prompt versioning).

Canonical data-model and permission authority is now split explicitly:
- High-level model and boundaries: [12-control-plane-database-and-access.md](./12-control-plane-database-and-access.md)
- Normative schema + role/grant semantics:
  [contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md)
- Runtime row-level state (`runs`/`cells`/`events`): [contracts/state-schema.md](./contracts/state-schema.md)

This document keeps the behavioral requirements and acceptance bar.

Current implementation status (AUTH-T01..T12):
- Login/logout/session check endpoints are live (`/api/auth/login|logout|me`).
- Protected `/api/*` routes are auth-gated (`401` when unauthenticated).
- Run/query attribution is persisted and exposed per user (`/api/auth/runs|queries`).
- Frontend auth UX is wired (boot session check, login gate, logout, user-scoped history hydration).
- Auth/session attribution now persists in `var/state.db` with startup migration from legacy `var/auth.sqlite`.

---

## Access: login + network gate *[partial]*

- **Network-gated.** The tool is reachable only from inside the hospital network. For the
  MVP this is a deployment property (local-only, bound to the Trust network); it is not the
  app's job to police the network, but the spec assumes it.
- **Login.** A user must authenticate before any access. No anonymous use.
- **Per-user identity.** The authenticated user is attached to everything they do: every run,
  every query, every review action.
- **Sessions.** A user can log out and log back in; on login they see only the resources and
  run history they are allowed to access.

### Session policy (MVP)
- Session token is held in an **HttpOnly session cookie**; never localStorage.
- Every session has hard expiry (`expires_at`) at 8 hours by default.
- Idle timeout (default 30 minutes without authenticated request) invalidates the session server-side.
- Final timeout values are confirmed with hospital IT (see [open-questions.md](./open-questions.md), Q29).

### Storage & mechanism (MVP)
- For the MVP, accounts and sessions are stored **locally on the machine that runs the
  server + agent**. No external identity provider.
- Current implementation stores auth/session/attribution in `var/state.db`; when legacy
  `var/auth.sqlite` is present, startup migrates it into `var/state.db`.
- Future (out of MVP): hospitals will use their own SSO (e.g. Microsoft / NHS login). The
  MVP must not hard-code assumptions that block swapping local auth for SSO later.

---

## Authorization model *[gap]*

Intero uses **hybrid RBAC + resource grants**:
- role permissions gate action classes (`run.create`, `database.query`, etc.);
- resource grants gate which audits/databases/mappings each user (or role) can access.

Authorization checks are ordered and fail-closed:
1. authenticated session,
2. role permission,
3. active resource grant,
4. run-scope checks for runtime writes.

Protected endpoints ignore any client-provided `user_id` for authorization; identity is always
resolved server-side from the authenticated session.

The detailed permission matrix and database-role boundaries are normative in
[contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md).

---

## Attribution & query logging *[partial]*

The point of auth is traceability of data access.

- Every SQL statement against hospital data is logged against the requesting user.
- Every run is attributed to the user who started it.
- Review/correction actions are attributable to the reviewer.
- Read-only query enforcement and attribution logging are both required; one does not replace the other.

---

## The run log *[partial — TODO-0005]*

Every run produces a complete, structured record — not just stdout. It captures:

| Recorded | Detail |
| --- | --- |
| **User** | who ran it |
| **Request** | the prompt / pasted text the user entered |
| **Resolved target** | template + database set |
| **Template version** | exact library version pinned for the run ([9-library-and-sources.md](./9-library-and-sources.md)) |
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

---

## Prompt versioning *[gap]*

- Every system prompt is versioned (indexing, mapping, run/workflow).
- Every run records which prompt versions it used.
- This ties outcome shifts to specific prompt revisions.

---

## Persistence model *[partial]*

Flat files are not sufficient for auth + governance. MVP requires a real local database-backed
control plane with a migration-safe path to hospital-hosted infrastructure.

- **Current implementation store.** Account/session/run-attribution/query-log data is persisted in `var/state.db`.
- **Architectural contract.** One logical control-plane model with stable IDs/relationships.
- **Production direction.** Hospital-hosted transactional DB planned with hospital IT.

Storage locations are defined in [contracts/storage-layout.md](./contracts/storage-layout.md).

---

## Data handling & safety

- **Patient-identifiable data stays local.** Run logs/query logs may contain PID and must not leave the environment.
- Logs are attributable, and access to logs is itself authorization-gated.
- Outbound chase/reminder actions are human-initiated only; never auto-sent.

---

## Acceptance (auth & audit log)

- No data is accessible without login; anonymous access returns nothing.
- Every run and every SQL statement against hospital data is attributed to the authenticated user.
- A user can log out and back in and see only their authorized resources and run history.
- Every run produces a structured record with request, resolved target, filters, activity,
  parameters, prompt versions, per-cell results, and verifications.
- Control-plane schema + role/grant semantics are implemented per
  [contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md).
- Runtime state semantics are implemented per [contracts/state-schema.md](./contracts/state-schema.md).
