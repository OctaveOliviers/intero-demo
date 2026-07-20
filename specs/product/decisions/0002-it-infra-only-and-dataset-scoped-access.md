# 0002 — IT is infra-only; clinical access is Dataset-scoped ∩ hospital permissions

- **Status:** Partially superseded by [0003](0003-admin-is-a-clinician-superset.md) — **decision #1
  (`admin` is infrastructure-only) is reversed**; decisions #2–#4 stand.
- **Date:** 2026-06-25

> **Superseded part.** Decision #1 below — `admin` infrastructure-only, clinical-data-free, "no human
> god-mode," "no single human can both administer IAM and read clinical data" — has been **reversed**
> by [0003](0003-admin-is-a-clinician-superset.md): `admin` is now a **clinician-superset** (the full
> clinician permission set plus the infra keys), because the hospital IT engineer also operates the
> tool and clinical data access is governed upstream by the hospital's SSO/permissions. Decisions #2
> (one `clinician` role), #3 (Dataset scope ∩ hospital permissions) and #4 (owner-driven grants) are
> unchanged and remain in force. The original text is preserved below per the append-only ADR rule.

## Context

Intero must be safely usable by a **hospital IT engineer**, **clinical staff**, and the **system
agent** on real patient data. The default RBAC shape — a single `admin` role with a wildcard `*` (all
permissions) — would let the IT-shaped admin account also read every patient record. Two forces
collide:

- **Information governance** wants the person who administers accounts and database connections to be
  *unable* to see clinical data, and wants Intero never to invent its own view of who may see which
  patient rows — the hospital already owns that.
- **Simplicity** (the MVP bar): the smallest model that lets clinical staff do their jobs and share
  work, with no department/team entity and no Intero-side row-level permissions.

This lands on top of the operational-intelligence reframe ([CONTEXT.md](../CONTEXT.md)): the user
works through **Datasets** (saved filters over the one logical hospital database), **threads**, and
three outputs (chat/table/dashboard); source databases are backend-only and never user-facing. That
reframe already removed raw databases from the user's hands — this decision adds the role/permission
layer around it. Genuine alternatives existed: keep a human god-mode (a superadmin who can cross into
clinical data for recovery); split clinical staff into multiple roles; or build Intero-side data
permissions rather than defer to the hospital.

## Decision

1. **`admin` is infrastructure-only.** It manages accounts/roles (IAM) and points Intero at
   source databases (connection identity) — and holds **no clinical-data permission**. There is no
   `admin: *` wildcard; `admin` is a finite allow-list. **No human has god-mode**, and no single human
   can both administer IAM and read clinical data.
2. **One `clinician` role = all clinical staff.** Personas P1–P5 share it; nothing gates them apart.
   A future split, if ever needed, is a new role key with no schema change.
3. **Clinical data access = Dataset scope ∩ the user's hospital permissions.** A Dataset is the
   existing slice concept; Intero applies its filters and reads under the user's hospital credentials,
   **never broadening** access and building **no** Intero-side row-level permissions. Source databases
   are IT-only.
4. **Sharing is owner-driven resource grants**, not IAM: the resource's clinical owner grants/revokes
   `read`/`run`/`manage` on a `dataset`/`template`/`table` to colleagues, with a table→Dataset
   access-only cascade. **Threads/projects are not grantable.** **Output types
   (chat/table/dashboard) are never permission-gated** — every output is bounded only by the
   creator's data access.

Normative home: the [control-plane contract](../contracts/control-plane-schema-and-permissions.md)
(the grantable resource set is `dataset`/`template`/`table`; the `project` entity is deferred and
threads are deliberately not shareable). Behavioral home:
[auth-and-access.md §9–§15](../features/auth-and-access.md).

## Consequences

- **Easy:** a clean IG story (the admin can't read PID; Intero never widens hospital access); a small
  model — two human roles, per-resource grants, no team entity; it rides on the Dataset machinery that
  already exists.
- **Hard:** there is no human break-glass into clinical data, so recovering a departed clinician's
  Datasets/threads needs an explicit, audited owner-reassignment path (**OPEN**,
  [Q38](../open-questions.md)). The *(Dataset ∩ hospital-permissions)* rule rests on an external
  dependency — how Intero obtains each user's hospital permissions — that is deliberately **not
  designed** here (**OPEN**, [Q37](../open-questions.md)).
- **Forecloses:** a god-mode human admin and Intero-side row-level data permissions. Reopening either
  reverses the core governance posture and would not be a casual change — hence this record.
