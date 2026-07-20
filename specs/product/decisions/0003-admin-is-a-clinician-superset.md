# 0003 — admin is a clinician-superset; the IT/clinical wall is removed

- **Status:** Accepted
- **Date:** 2026-06-25
- **Supersedes:** decision #1 of [0002](0002-it-infra-only-and-dataset-scoped-access.md) (decisions #2–#4 of 0002 stand)

## Context

[0002](0002-it-infra-only-and-dataset-scoped-access.md) made `admin` **infrastructure-only**: it
administered accounts and source-database connections but held **no** clinical-data permission, so
"no single human can both administer IAM and read clinical data." That wall assumed the hospital IT
engineer is *only* an operator of infrastructure, never of the tool.

That assumption does not survive the deployments we target. In a real hospital the same IT person who
provisions accounts also needs to **use Intero** — query the database, run an audit — like any
clinician. Forcing them to keep two accounts and switch between them to administer-then-operate is a
non-starter. And the governance fear 0002 was protecting against — an account-administrator seeing
patient data they shouldn't — is **already answered upstream**: clinical data access bootstraps on the
**hospital's SSO / existing permissions** (the deferred [Q37](../open-questions.md) mechanism), which
the IT person already holds. Intero never decides who may see which patient rows; the hospital does
(one `clinician` role; data = Dataset scope ∩ hospital permissions — 0002 decisions #2/#3, unchanged).
So an `admin` reading clinical data reads only what the hospital already grants them — not an
Intero-granted god-mode.

Genuine alternatives existed and were rejected: keep the strict wall and live with two accounts; make
`admin` a true clinical superuser (override on everyone's resources); or build an Intero-side notion of
"which administrators may also see data." The first fails the operator's real workflow; the second
re-introduces the god-mode 0002 rightly feared; the third re-invents access control the hospital owns.

## Decision

1. **`admin` is a clinician-superset.** Its permission set is the **entire `clinician` set** plus the
   infrastructure keys `iam.manage_users`, `iam.manage_roles`, `database.manage`. There is still **no
   `*` wildcard** — it is an explicit allow-list — but it is no longer clinical-data-free.
2. **Clinical capability is role-independent.** `clinician` and `admin` have identical clinical access;
   both resolve actual data through the hospital's permissions (Q37). The Intero role gates **only** the
   admin surface, never clinical data.
3. **`admin` is a peer, not a superuser.** For clinical work `admin` follows the same ownership/grant
   rules as any `clinician` (owns what it creates; needs a grant for another user's resource). It gets
   **no** override on other users' threads/resources. (0002 decision #4 — owner-driven grants — stands.)
4. **The only role-gated surface is the admin settings screen** — net-new under **Settings** — carrying
   **user/role management (IAM)** and **source-database connection management** (`database.manage`). A
   `clinician` never sees it; an `admin` sees it *in addition to* the full clinician app.

The IT/clinical wall, the "no human god-mode" guarantee, and the "clinician-operated, not routed
through IT" reconciliation prose from 0002 / [auth-and-access.md §9](../features/auth-and-access.md) are
**removed**, not weakened. Normative home: [control-plane contract §4](../contracts/control-plane-schema-and-permissions.md#4-roles-and-role-to-permission-policy).

## Consequences

- **Easy:** one account for the IT person, who administers *and* operates; a smaller, additive model
  (admin = clinician + one screen) that drops a large block of wall / reconciliation / break-glass
  rationale from the spec; the demo runs end-to-end under a single `admin` login that also exposes the
  admin surface.
- **Hard / accepted:** Intero no longer guarantees that an account-administrator cannot see PID. We
  accept this because the hospital's SSO already governs each user's data access; an `admin` sees only
  what the hospital grants them. A Trust whose information governance *requires* strict
  administrator/clinical separation would need that re-introduced as a **deployment policy**, not the
  default — recorded here so reopening it is a conscious act, not a silent one.
- **Unchanged:** one `clinician` role for personas P1–P5; data = Dataset scope ∩ hospital permissions;
  owner-driven resource grants; outputs never permission-gated (0002 decisions #2–#4). Departed-user
  recovery (ownership reassignment) still matters under the peer model and is still owed
  ([open-questions.md](../open-questions.md) Q38) — now justified by the peer/owner-grant model rather
  than by an admin who cannot see data.
