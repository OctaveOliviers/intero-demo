# Acceptance Criteria

The product is complete when it can run the **regional cord-pH audit (UC2)** end-to-end, on
de-identified/synthetic data, satisfying every criterion below. The cord-pH dataset is the
**must-pass demo and test case** ([personas-and-use-cases.md](personas-and-use-cases.md));
the national motion is identical.

Each group rolls up the acceptance bullets in the matching spec — see that spec for detail.
A criterion is met only when it can be demonstrated, not just coded.

---

## Invariants (safety — apply to every run)
- **Read-only.** No run can modify a patient record or any hospital system (enforced at the
  SQLite level).
- **No fabrication.** A value is never invented; empty/ambiguous results become explicit
  `missing` / `unknown` / `not_available` with a reason.
- **Traceable.** Every populated value traces to its query + source (direct) or to the
  verbatim note passages (interpret).
- **Attributed.** Every run and every database query is tied to the authenticated user.
- **Local PID.** No patient-identifiable data leaves the environment.

---

## Flows & setup → [product-flows.md](product-flows.md)
- Each **message** resolves its own **scope (a Dataset, or whole-DB)** and an **Output (an Answer
  or table)** before executing; the agent asks **at most one clarifying question**, only when scope
  or output is genuinely ambiguous — a clear request (e.g. "run the cord-pH audit for Q2") executes
  with **zero** clarifying questions. The thread is **unscoped** (each message scopes itself).
  *(Dashboards deferred — the only structured output is the table.)*
- A confirmed **Dataset** and a created **table** each appear as a **structured, editable thread
  element** with a **persist** action; a Dataset's filters are grounded to real columns with a
  parameterised SQL predicate and proved by a real read-only `COUNT`.
- A **table** is created by **selecting a template, uploading an Excel** (fields + descriptions
  parsed), or **describing it** — all yielding the same editable spec; a newly uploaded template
  indexes **without freezing the UI**. Producing a table **spawns a sub-agent** tracked by an inline
  **inspector**; the thread is not forked.
- A **standard audit** (a seeded Dataset + table pair) is runnable **in one step** — naming it
  resolves the pair and populates, with no questioning.
- A **table pins its scope for life** (a Dataset, or whole-DB — scope binds to the table, not the
  thread); a request with no Dataset covers all entities of the table's grain.
- Every surface handles empty / loading / error / partial states; blank cells show a reason.
- In the **table view**, the table is the primary full-screen surface with a persistent top band
  (title block + download/settings/eye icons immediately beside the title, optional deadline
  text beneath), and one right panel that switches between inclusion criteria, agent activity,
  and clicked-cell evidence; active settings/eye icons toggle the panel open/closed, and the
  activity icon is blue animated while the run is active and gray when idle; eye click is a
  pure toggle for `agent_activity`; **refresh and its `Check for updates` action are deferred**
  ([result-view.md](features/result-view.md)).
- **Blocked / needs-review counters** sit at the far right of the top band (hidden at zero,
  live-updating); clicking one opens `agent_activity` scrolled to the review summary. The
  **review summary renders only as the terminal agent-activity feed entry** — no summary
  banner above or over the table (result-view.md).

## Indexing & mapping → [indexing-and-mapping.md](features/indexing-and-mapping.md)
- Indexing produces `ready` `spec.json` + `model.json` without blocking the UI; failure sets
  `error` with a retry path.
- The models pass the bar: **an agent that never saw the source could work from them alone** —
  they explain what value each field/column holds, which cells need populating, any **coded
  value sets**, and handle both simple and complex (explanation-sheet + region-scoped) templates.
- `mapping.json` is **one per audit, spanning all its databases**, classifying every field
  direct/interpret with its source `database → table.column`.

## Precompute & run → [indexing-and-mapping.md](features/indexing-and-mapping.md) + [table-population.md](features/table-population.md)
- **Table population** fills the table through a shared **cell store** (one cell per
  region×member×field, updated in place) in **two steps**: **prepopulate**
  deterministically fills cells by running the `executable` block's precomputed read-only SQL in bulk
  and applying each field's code map (clean → `filled`) — it runs **only when the table has a
  mapping/executable** (an ad-hoc table goes straight to the agent); **the table agent** is a
  **single `table-fill` agent session** that runs **only when cells remain open** after prepopulate
  (over every cell, for an ad-hoc, unmapped table), reusing fixes across a field or member, reading
  the mapping's interpret-field evidence hints via the **`navigate` skill**, and writing each cell
  in place (`blocked` if it cannot be solved). The **Dataset's** cohort scopes every query. **Everything is
  read-only; no generated or edited code runs**.
- The agent finds data through **`navigate`** (catalog / search / describe / join-paths) —
  **never a whole-schema dump**; structure read live, meaning from `model.json`, the join graph
  derived from it; seeded at the Dataset's anchor tables with the rest of the schema still reachable.
- For a **table**, the `table-fill` agent **writes no filters** — `sql_execute` injects the
  cohort onto every queried table and **rejects** any query it cannot bind to the cohort (fail-safe);
  cross-database joins resolve through measured identity bridges. The table's scope is a **hard
  cohort, pinned for life** (scope binds to the table, not the thread —
  [decisions/0004](decisions/0004-scope-binds-to-table-not-thread.md)).
- An **Answer** runs the **`chat-answer`** skill (text + **inline citations**, **no cells**);
  the thread is unscoped, each message resolves its own scope, the answer **discloses what
  it scoped to**, and the user's hospital permissions are the only hard wall.
- *(Deferred — not in v1.)* A **dashboard** populates its underlying table through table population, then a
  fixed reducer computes each indicator from its stored formula; retained design in
  [table-population.md §Dashboard output (deferred)](features/table-population.md#dashboard-output-deferred).
- A run can target **≥2 databases**, and a Dataset can scope across several.
- The **table chip appears on creation**; cells become traceable as they fill; selecting a
  cell does not pause population.
- **Stop (an explicit user action)** halts the run (no background work); **navigating away does not
  stop it** — the run keeps populating server-side and notifies on completion. A **re-run** re-attempts
  only the cells still open or blocked (idempotent) and preserves reviewed/corrected cells.
  *(Pause/resume is deferred to the 100-day vision.)*
- Filters are applied precisely and validated before population.

## Refresh — DEFERRED → [refresh.md](features/refresh.md)
- **Refresh is not in the product.** There is **no "Check for updates" action, no in-place refresh
  execution, and no refresh detection**. A run **completes on its own in the background** (the agent
  keeps populating after the user leaves); re-checking a *completed* audit for **newly-landed**
  source data later is the deferred refresh feature.
- A cell blocked on absent source data **stays blocked** until a fresh **re-run** (a new run that
  re-attempts open/blocked cells, preserving reviewed/corrected work).

## Traceability & evidence → [traceability-and-evidence.md](features/traceability-and-evidence.md)
- Single click opens evidence: explanation + query(ies, one per source database) + result
  (direct) or + full notes with **verbatim** highlighted passages (interpret).
- Direct queries show the value **with its row identifier**.
- The grid shows kind marker + the two review-state flags + the **low/medium/high** confidence
  tint, together and legibly; **click = evidence, double-click = edit**.
- Interpret cells populate immediately as `not_reviewed`, **auto-flip to `reviewed` after ~2s
  of viewing**, and gate submit-readiness (audit not submit-ready while any remain).
- Whether a reviewed cell was **edited (corrected)** or not (confirmed) is recorded against
  the cell + prompt version.
- **Export is a plain, submit-ready `.xlsx`**: populated template only, no Evidence sheet, no
  markers, no source metadata.

## Auth & audit log → [auth-and-access.md](features/auth-and-access.md)
- No data is accessible without login; an anonymous user sees nothing.
- Every run + database query is attributed to the authenticated user; a user can log out, log
  back in, and see their own audits and history.
- Every run produces a structured record (request, resolved target, filters, agent activity,
  parameters, **prompt version**, per-cell results + verifications).
- Accounts, sessions, runs, and logs live in a **real database** (local for the product), designed
  to move to hospital-hosted infrastructure.
- The run/cell **state schema** (runs, cells, events) is the single source of truth for status,
  blocked items, and the run log; the dashboard and the loop read from it, not the chat or the
  table (auth-and-access.md).
- Authorization follows role permission + resource grant checks per
  [contracts/control-plane-schema-and-permissions.md](contracts/control-plane-schema-and-permissions.md),
  with consistent `401` (unauthenticated) / `403` (unauthorized) behavior.
- The agent runtime role is constrained to run-scoped runtime writes and read-only clinical data;
  attempts to mutate IAM/catalog policy tables are blocked at DB-role level.
- **Admin = clinician-superset** (RBAC, auth-and-access.md §9–§15, [control-plane contract](contracts/control-plane-schema-and-permissions.md), [ADR 0003](decisions/0003-admin-is-a-clinician-superset.md)):
  an `admin` does everything a `clinician` can **plus** manages accounts/roles and source-database
  connections; only those admin endpoints are `admin`-only. No `admin: *` wildcard — `admin` is the
  `clinician` set plus the three infra keys; for clinical work it is a **peer** (no override on others').
- **Clinical staff** (`clinician`, all personas P1–P5) can create Datasets/templates, open threads,
  run/edit tables, and produce any output, but are `403` on IAM and source-DB endpoints.
- **Owner-driven sharing of a named colleague:** an owner picks a colleague from `GET /api/clinicians`
  (name+id only) in the resource's **Share dialog** and grants **editor** access (editor-only) on a
  `dataset`/`template`/`table`; sharing a populated **table** cascades **Dataset access-only**; a
  received item appears directly in the recipient's library; a newly received **Dataset** shows a Data
  library blue notification dot and a matching blue card with **Keep** / **Delete** until handled;
  **threads are not grantable**; a revoke fail-closes the next request; an `admin` grants only on
  resources **it** owns (a clinical peer), with no special authority over others'.
- **Datasets, not raw DBs:** clinical users see the Datasets / Templates / Tables libraries; source
  databases never appear for a `clinician`; a table run is scoped to the chosen Dataset, and the
  effective rows are the
  **(Dataset scope ∩ the user's hospital permissions)** — reading nothing when no hospital permission
  resolves (fail-closed). *(The hospital-permission intersection is **deferred — blocked on Q37**; it
  surfaces as a clear blocked/empty state, distinct from a `403`.)*
- **Outputs ungated:** no output type (chat/table; dashboard deferred) is blocked by role/permission;
  an output is bounded only by the creator's data access; the **table** is shareable, threads are not
  (auth-and-access.md §12).
- **Frontend gating mirrors the server:** the role from `GET /api/auth/me` drives the rendered nav; the
  **admin surface is absent for a `clinician`** while clinical surfaces render for both roles; a direct
  nav to an ungranted resource shows a non-leaking unauthorized state matching the server `403`
  (auth-and-access.md §13).
- **Seeding:** the seed/demo account logs in as **`admin`**, runs the cord-pH audit end-to-end **and**
  reaches the admin surface; additional users default to `clinician`; seeded resources carry an owner
  `manage` grant; an `admin` can reassign a departed user's resources (metadata-only).

## Design system → [design-system.md](features/design-system.md)
- All product colors/shapes/sizes/fonts come from tokens in `app.css`; no component hard-codes
  a value a token covers.
- Confidence heat-map, kind marker, and the two review flags map to **named semantic tokens**
  and stay legible together on one cell.
- One icon family; no emojis or ad-hoc arrow glyphs.

## Library & sources → [library-and-sources.md](features/library-and-sources.md)
- The left panel is **flat** (no projects) and exposes **Datasets** (the user's Datasets),
  **Templates** (table templates), and **Tables** (the populated audits); databases are **not** a
  user-facing surface. *(Dashboard templates deferred.)*
- A **Dataset** is created by describing a slice in plain language; its detail shows **label +
  value-chip filters**, an **empty add-filter row** (free text → grounded chip + SQL clause), a
  **sanity count**, and a **top-right toggle** to a **read-only raw-SQL view**. Editing a chip
  re-derives the SQL and count deterministically. A Dataset **spans multiple databases**, joined on
  measured identity links.
- A **table** is row-based (fields = columns, entity = rows), first-class in the **Tables** section,
  and pinned to one scope for life. *(Dashboards deferred — built on a table when picked up.)*
- **Persisting** a template triggers **background, non-blocking mapping**; a table with no mapping
  skips prepopulate and goes straight to the agent.
- Standard templates are **read-only (clone to edit)**; user Datasets/templates are editable, gated
  by role. A run **records and pins the exact template version** it used.

## Completion status & blocked items → [status-and-blocked-items.md](features/status-and-blocked-items.md)
- The table is always the **clean table template** — missing values are **empty cells**, no
  appendix, no in-cell annotations, in-app or in the download.
- Blocked items are surfaced in the **agent's final summary message** (the terminal
  agent-activity feed entry) and the **top-band counters**; the **dashboard board** and
  **chase list** are next-phase surfaces — never in the table.
- The **download is never blocked** — a partial audit downloads as the plain template with
  empty cells, at any status.
- **BLOCKED and NEEDS-VERIFICATION are distinguishable and never conflated** (separate states,
  queues, board columns).
- Each populated table has a **result status** (Queued / In progress / Blocked / In verification /
  Complete), derived from persisted cells, with the blocked count surfaced. *(The dashboard
  **Kanban** board rendering it is deferred — next phase, status-and-blocked-items.md.)*
- A populated table shows **Blocked whenever ≥1 cell is blocked**; **re-running auto-resolves** cells whose
  data has landed and updates status with no manual edit.
- A re-run **never overwrites a `reviewed`/`corrected` cell**; data that disagrees with a
  correction is flagged as a conflict, not silently replaced.
- The resolved template is **confirmed by the user before the run starts** — no auto-start on an
  identified template.
- Blocked items remain visible on the **dashboard + run record even if the run errors** before
  the final message.
- A missing/mismatched join key blocks the cell (`IDENTITY_UNRESOLVED`); rows whose identities
  don't match are **never combined**.
- A blocked reason is **evidence-grade** (states what is missing and where the agent looked).
- *(Deferred — next phase, status-and-blocked-items.md:)* blocked items can be **grouped by owner**; the platform
  **drafts (never auto-sends)** a reminder; **sending is human-initiated**.

## Testing & evals → seed plane + [table-population.md](features/table-population.md)
- A **deterministic golden test** runs **prepopulate** on the cord-pH fixtures + cohort
  and asserts the **exact expected cells** (direct values + `IDENTITY_UNRESOLVED` behaviour).
- An **interpretive eval** scores the cord-pH interpret cells against expected values, tied to
  the **prompt version**, tracking the **not-edited rate** (the accuracy bar).
- Builders **validate their output and retry** on malformed LLM results (no broken model written).
- Re-run is **idempotent**: completed regions are skipped, nothing double-writes (Q28).

---

## The end-to-end demo gate
The single acceptance test that subsumes the rest: a logged-in clinician runs the cord-pH
audit (by naming it, uploading it, or selecting it), against the cord-pH database(s), with
their chosen filters; watches it populate live; clicks any cell to verify its source; sees
interpret cells flip to reviewed as they read them; corrects one by double-clicking; and
exports a clean, submit-ready table — with the whole table population attributed and logged. If a
required value's source data is absent, the cell is **left empty** and surfaced as a **blocked
item** (reason + owner) in the agent's summary and the status — the table stays clean and
remains downloadable — and the table result status shows **Blocked** until a re-run resolves it. No value is
fabricated and nothing leaves the environment.
