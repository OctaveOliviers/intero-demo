# 0004 — Scope binds to the table, not the thread

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

A user works in a **thread** — a free-ranging conversation — and can ask the database
anything, or ask for a **table** (a populated audit). The question is what a **Dataset**
(a saved/grounded slice) scopes.

The two surfaces have opposite needs:

- A **conversation roams.** In one thread a clinician naturally asks about NICU, then about
  the whole hospital, then about a different ward. Fixing one Dataset to the whole
  conversation is artificial — it would force a new thread for every slice.
- A **structured audit must be exact.** A table titled "NICU babies, Q2" must cover *exactly*
  that cohort, no more, no less, and must keep meaning the same every time it is reopened or
  re-run. Its scope cannot drift.

An earlier draft bound a **thread to at most one Dataset** and treated a chat as a "soft seed"
of that Dataset. Stress-testing showed that's the wrong seam: it cripples the conversation and
adds nothing the table needs. The Dataset was **never the security boundary** anyway — that is
the user's hospital permissions (auth-and-access.md §11/§12).

## Decision

**Scope binds to the table, not the thread.**

- A **thread is unscoped and roams.** It carries no fixed Dataset; **each message resolves its
  own scope** (a Dataset, or the whole hospital database) via the request flow, and a chat
  answer **discloses the scope it was computed at**. The only hard wall on any read is the
  user's hospital permissions.
- A **table is pinned to exactly one scope, fixed for life** — a named Dataset *or* the whole
  database (an empty filter is a valid scope; "audit all births this year" needs no invented
  cohort). The populated table equals that cohort, exactly; asking for a different cohort
  produces a **new** table.

Mechanically: a table run keeps the **hard cohort** — `sql_execute` injects the cohort onto
every queried table and rejects anything it cannot bind (the table population, unchanged). A chat
answer is **permission-bounded** and scopes per message; a mis-scoped chat answer is a
*correctness* bug, never a safety breach (it can never exceed the user's data access).

## Consequences

- **Easy:** conversations are natural (ask across slices freely); audits stay exactly
  cohort-correct with zero agent discretion; neither surface leans on the Dataset as a
  permission gate (it never was one). The table — the durable value — is first-class and
  shareable (sharing it cascades its Dataset as access-only); the throwaway thread is not.
- **Hard:** `sql_execute` carries **two scoping postures** — hard-inject-or-reject for a table,
  permission-bounded per-message for a chat. The chat posture trusts the agent to scope
  correctly *within permissions*.
- **Forecloses:** one-Dataset-per-conversation, and treating chat and a structured output as the
  same scoped thing. Re-coupling them would either break audit exactness or cripple the
  conversation — hence this record. *(Dashboards, a deferred third output, would be built on a
  table and inherit the table's hard cohort.)*
