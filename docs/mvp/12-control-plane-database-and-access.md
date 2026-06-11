# Control-Plane Database & Access

Read [README.md](./README.md) first. This document is the canonical MVP specification for
how Intero stores control-plane data and enforces access control.

It answers four questions explicitly:
- Which data belongs in the control plane versus clinical source databases.
- Which entities/tables are required for users, permissions, resources, and runs.
- How role permissions and per-resource grants are evaluated.
- How the agent is constrained so it cannot mutate policy/catalog data.

This document is high-level and behavioral. The contract-level schema and permission matrix
are frozen in
[contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md).

---

## 1. Scope and authority

This is the source of truth for the control-plane data model. It supersedes table-level
summaries duplicated in other docs.

Related contracts:
- Runtime row shape: [contracts/state-schema.md](./contracts/state-schema.md)
- On-disk location and deployment shape: [contracts/storage-layout.md](./contracts/storage-layout.md)
- API request/response plus authz surface: [contracts/api.md](./contracts/api.md)

When these docs disagree, precedence is:
1. `contracts/control-plane-schema-and-permissions.md`
2. `contracts/state-schema.md` (runtime row-level details)
3. This document (high-level behavior)

---

## 2. Logical model: one control plane, separate clinical sources

Intero has two data worlds:

1. **Control plane (Intero-owned metadata and runtime state):**
   users, sessions, roles, permissions, grants, audits, databases, mappings,
   runs, cells, events, query attribution.
2. **Clinical source databases (hospital-owned records):**
   EHR/lab/radiology SQLite or hospital-hosted equivalents, queried read-only.

The control plane is logically one model. In MVP implementation it may be physically split
(`var/state.db` for runtime + `var/auth.sqlite` for auth attribution), but that split is an
implementation detail, not the architectural contract.

---

## 3. Domain partitions inside the control plane

The control plane is partitioned by domain to keep permissions explicit.

### IAM domain
- Users and sessions.
- Role catalog and role-to-permission bindings.
- Optional direct user permission overrides (deferred).

### Resource catalog domain
- Audit template records (`spec.json` metadata).
- Database records (`model.json` metadata + connection identity).
- Mapping records (`mapping.json` metadata).
- Ownership and lifecycle metadata (created_by, status, schema_version, updated_at).

### Runtime domain
- Runs, cells, events, field-code projections.
- Per-run attribution and prompt/runtime parameters.
- This domain is the current `state.db` contract.

### Audit-attribution domain
- Per-statement query log (`query_log`) tied to run + user + database resource.
- Security/governance audit events for authz decisions (allow/deny), role/grant changes.

---

## 4. Authorization model (selected)

**Selected model:** Hybrid RBAC + resource grants.

Access evaluation is deterministic and ordered:
1. **Authentication required** (valid session).
2. **Role permission required** for action class (for example `run.create`, `database.query`).
3. **Resource grant required** for the target resource(s) (`audit`, `database`, `mapping`).
4. **Run-scope checks** for runtime mutations (`cells` and `events` only inside the active run).

A request is denied on first failed check. Status codes are explicit:
- invalid/missing session -> `401`;
- authenticated but permission/grant/run-scope failure -> `403`.
No implicit fallback.

### Why this model
- RBAC keeps policy understandable and auditable.
- Resource grants support real hospital sharing constraints (different users, different audits/databases).
- It avoids overloading roles with per-template/per-database exceptions.

---

## 5. Required actor boundaries

MVP requires at least these actor categories:
- `admin`: manages users, roles, grants, library resources.
- `clinician`: runs audits and reviews outputs on granted resources.
- `agent`: no interactive login; executes run-scoped population actions under strict DB role.

`agent` is not a superuser and never inherits `admin` capability.

---

## 6. Agent safety boundary (selected)

The strongest control is DB-level role permissions, with tool/runtime checks as defense in depth.

The agent must be constrained to:
- Read from granted clinical source databases with read-only role.
- Read control-plane runtime context needed for the current run.
- Write only run-scoped runtime records (`cells`, selected `events`) for the current run.

The agent must not be able to:
- Create/update/delete users, roles, permissions, grants, sessions.
- Create/update/delete audit/database/mapping catalog metadata.
- Execute DDL/DCL/admin commands.
- Write to clinical source databases.

---

## 7. Tenancy stance

Current MVP target: single-hospital deployment.

Design requirement now:
- Keep schema tenant-ready (`hospital_id`/`tenant_id` capable) so migration does not require redesign.
- Enforce clinician/agent role isolation now.

Future path:
- Physical per-hospital isolation (database-per-hospital or schema-per-hospital) is a deployment decision,
  not a change to authorization semantics.

---

## 8. How other MVP docs rely on this model

- **Doc 7 (auth/audit log):** behavioral requirements for login, attribution, and retention;
  table/schema authority lives in the control-plane contract.
- **Doc 4 (indexing/mapping):** accessing audits/databases/mappings requires catalog grants.
- **Doc 5 (run engine):** run creation requires grants to selected audit and databases;
  agent actions inherit run-scoped permissions from this model.
- **API contract:** each protected endpoint maps to required permission + grant checks.

---

## 9. Delivery stages

### Short term (MVP-critical)
- Implement canonical IAM and runtime minimum: `users`, `sessions`, user-role binding, role-permission mapping,
  resource grants, run attribution, query attribution.
- Enforce authn/authz on API endpoints with explicit `401`/`403` behavior.
- Apply strict agent DB role: read-only clinical data + run-scoped runtime writes only.
- Keep local deployment under `var/` while preserving migration-safe schema boundaries.

### Medium term (first production hardening)
- Collapse split stores into one transactional control-plane database (hospital-hosted).
- Add migration scripts and backfill from `auth.sqlite` + `state.db`.
- Add governance events for policy changes and denied-access logging.
- Enforce grant checks uniformly across indexing, mapping, and run paths.

### Long term (scale and enterprise controls)
- Tenant/hospital isolation policy (per-hospital physical isolation where required).
- Advanced policy controls (break-glass access, time-bounded grants, approval flows).
- Read replicas/partitioning and archival strategy for high-volume `events` and `query_log`.

---

## 10. Non-goals (for this MVP spec)

- Replacing clinical source databases with copied clinical records.
- Granting the agent broad SQL write access to control-plane policy tables.
- Final enterprise SSO integration details (kept compatible, implemented later).
