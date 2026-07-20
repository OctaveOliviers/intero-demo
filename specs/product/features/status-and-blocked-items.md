# Completion Status & Blocked Items

Read [product-flows.md](../product-flows.md), [table-population.md](table-population.md), and
[traceability-and-evidence.md](traceability-and-evidence.md) first. This document specifies how
the platform surfaces **why an audit cannot be completed — down to the individual missing
cell — and the table result status lifecycle** that makes those gaps visible and actionable.

The dominant real-world failure mode is **not extraction error — it is missing source data**:
a clinician hasn't recorded a value yet, a specialist note isn't written, coding isn't
complete, a result is pending. The platform's value is making that gap **visible and
actionable**, so the person running the audit chases the right person *before* an incomplete
submission is discovered late.

This is **in scope.**

---

## The core distinction: Blocked vs Needs verification

Two reasons a cell isn't final — different owners, different actions. They are **separate
states, separate queues, separate board columns**, and must never be conflated:

| | **BLOCKED** | **NEEDS VERIFICATION** |
|---|---|---|
| What | the agent **cannot** produce the value — source data absent from every connected system | the agent **did** produce a value, but confidence/evidence is weak |
| Dependency | **external** — a clinician, specialist, coding team, or pending result | **internal** — a human reviewer |
| Action | **chase / remind** | **sign-off** |
| In the product | **new** (this document) | the **interpretive safety gate** ([traceability-and-evidence.md](traceability-and-evidence.md)): interpret cells `not_reviewed → reviewed` |

**NEEDS VERIFICATION already exists** in the product as the interpretive safety gate (traceability-and-evidence.md):
interpret cells start `not_reviewed` and are signed off by review. **BLOCKED is its sibling**
for cells that have no value to verify because the source data isn't there. Keep them
separate from day one — they route to different people and trigger different actions.

---

## Per-cell state

Every required cell is in exactly one of **four stored states** (the canonical model is
[table-population.md §Cell state model](table-population.md#cell-state-model); this extends the per-cell
metadata in [traceability-and-evidence.md](traceability-and-evidence.md)):

- **`pending`** — created up front at run start, not yet settled by a population step (transient
  during a run; failures so far live on `attempts[]`, not in the state).
- **`filled`** — value present and evidence-backed (direct **and** interpret values fill
  immediately; interpret review is tracked separately, below).
- **`blocked`** — no value; the source data is absent. Routes to chase/remind.
- **`not_applicable`** — genuinely N/A for this spell; suppressed, never counted as a block.

**Needs verification is a derived view, not a stored state.** A cell needs verification when
it is `filled` ∧ `kind: interpret` ∧ `review_state: not_reviewed` (plus low-confidence cases
per [open-questions.md](../open-questions.md) Q10). It routes to the review gate (traceability-and-evidence.md).
Deriving it keeps "is there a value" and "is it signed off" independent facts — reviewing or
correcting a value never has to transition two state machines, and the BLOCKED / NEEDS
VERIFICATION queues above stay separable by construction.

---

## Reason-code taxonomy (blocked cells)

Each blocked cell carries a reason code plus a plain-language detail:

| Reason code | Meaning |
|---|---|
| `MISSING_SOURCE_RECORD` | the value's source data does not exist in any connected system yet (assessment not done or not recorded) |
| `AWAITING_DOCUMENT` | a specific expected note/document is absent (specialist review, orthogeriatric assessment, discharge summary) |
| `PENDING_CODING` | clinical coding not yet complete (retrospective timing) |
| `AWAITING_RESULT` | a lab/imaging result is not yet available |
| `DATA_CONFLICT` | conflicting values across sources; needs human resolution |
| `IDENTITY_UNRESOLVED` | a patient/spell join key is missing or mismatched across the databases a value draws from; rows whose identities don't match are **never combined** (owner: data team) |
| `NOT_LOCATED` | the repair agent searched the cohort and could not place the value anywhere; the cell's value is left blank and its `attempts[]` records every query tried ([table-population.md](table-population.md)) |
| `AWAITING_SIGNOFF` | value produced but pending verification → routes to **NEEDS VERIFICATION**, not a true block |
| `NOT_APPLICABLE` | field genuinely N/A for this spell → not a block; suppress |

A blocked reason is **evidence-grade**: like a filled cell's citation (traceability-and-evidence.md), it must state
exactly **what** is missing and **where** the agent looked for it. "We checked the EHR notes,
the orthogeriatric review system, and the discharge summary; no orthogeriatric review note
exists for this spell" — not just "missing."

---

## What each blocked cell surfaces

For every blocked cell:
- the **target cell / field reference** and the **patient / spell ID** it belongs to;
- the **criterion or required field** it maps to;
- the **reason code + plain-language detail**;
- the **owner needed** to resolve it, inferred where possible (role, named specialty, or
  source system) — e.g. *"orthogeriatric review note not present"*;
- **how long it has been outstanding** / the date the data was expected.

---

## Where blocked items appear — and where they do NOT

**Not in the table.** The table is always the **clean table template you would send** — a
cell the agent could not fill is simply **left empty**. No red/blocked styling, no in-cell
annotations, no "Blocked items" appendix sheet. This holds **both in-app and in the download**.

Blocked items surface in three places instead:

1. **The agent's final summary message** — the primary surface. When a run finishes, the agent
   posts a structured summary as the **terminal entry of the agent-activity feed** (the
   `review_summary` event; [product-flows.md](../product-flows.md),
   [result-view.md §agent_activity](result-view.md)) stating what it completed and
   **explicitly listing which values are blocked and why / who** — e.g. *"Table populated.
   Three values are blocked: the orthogeriatric review note for spells 123 and 145 hasn't been
   written yet, and the 24-hour creatinine for spell 152 is awaiting a lab result."* The top
   band's **blocked / needs-review counters** (result-view.md) mirror the two queues at a glance.
2. **The audit-level status** — the Blocked status + count on the dashboard
   ([Status lifecycle](#run-status-lifecycle-kanban)), for triage. *(The dashboard surface
   is next-phase; the status itself is computed and persisted now.)*
3. **The chase / remind list** — blocked items grouped by owner
   ([Actionability](#actionability--chase--remind)), for action. *(Next-phase surface.)*

Per-cell metadata still records *why* a cell is empty (`reason_code`, `owner_needed`, etc.;
[traceability-and-evidence.md](traceability-and-evidence.md)) — that metadata powers the message,
the status, and the chase list, but is **never rendered on the cell**.

> **The explanation must survive a crashed run.** The blocked list is derived from this
> **persisted per-cell `state`/`reason`** plus the run's status, so it is always available on
> the dashboard and in the run record **even if the run errors before the final message posts**.
> The final summary message is a convenience layer over durable data, never the only source.

## Download is never blocked

The **download button always works.** A user can download a **partially completed audit** at
any time, in any status — it is just the Excel template with **empty cells** where data is
missing, and **no extra sheets, markers, or evidence**. "Blocked" is an *informational* status
telling the user what's outstanding; it never gates the download.

Members marked inactive/departed (out of cohort) remain visible in
run history/UI context but are **excluded from the exported table**.

---

## Table result status lifecycle (Kanban)

Each **populated table** carries a result status:

- **QUEUED** — not yet started.
- **IN PROGRESS** — population running.
- **BLOCKED** — ≥1 `blocked` cell; cannot complete without external action.
- **IN VERIFICATION** — ≥1 item awaiting human sign-off, with no blocking items (or shown
  alongside a separate blocked count).
- **COMPLETE** — fully populated and signed off (zero blocked, all verification done).

Rules:
- A run is **BLOCKED whenever it has ≥1 `blocked` cell**, and the **blocked count is
  surfaced**.
- Status is **dynamic** (next section).
- **COMPLETE** means zero blocked cells **and** an empty needs-verification queue (every
  interpret cell `reviewed`). It
  is an **informational status, not a gate** — the download works at any status (see
  [Download is never blocked](#download-is-never-blocked)).

---

## Re-run resolution

Because **timing is the root cause**, re-running is first-class:

- Runs are **re-runnable**. On the next **user-initiated re-run**, cells whose source data has since
  landed **resolve** (`blocked → filled`, entering the verification queue when interpret).
- **A re-run never overwrites human work.** It only fills `blocked` or still-unfilled cells; a
  cell already `reviewed` or `corrected` is left untouched. If newly-landed data **disagrees**
  with a prior correction, the cell is **flagged as a conflict** for the user, not silently
  replaced.
- A **re-run moves the audit out of BLOCKED** once it clears the blocked cells — **no manual cell
  edit required** (the re-run is the action; nothing clears on its own while the user is away).
- **Re-run** (restart) is a fresh run pinned to the same template version
  ([library-and-sources.md](library-and-sources.md)) and recorded in the run log
  ([auth-and-access.md](auth-and-access.md)).
- **Refresh** (Check for updates) — re-checking a completed audit later for newly-landed data — is
  **deferred** ([refresh.md](refresh.md)); until then, a fresh **re-run** is how landed data is
  picked up.

---

## Dashboard — the Kanban board

> **Deferred — next phase (2026-06-10).** The board below is the target surface; it is not in
> the current phase's build scope. The status lifecycle itself (above) is live now — derived
> from persisted cells — and the per-run blocked / needs-review counts surface in the result
> view's top band (result-view.md).

- A **Kanban board**: **columns by status**, **cards = runs**.
- Each card shows the **blocked-item count** and the **most common blocking reason / owner**,
  so the user can triage at a glance.
- It is a primary left-panel destination, sibling to the home screen
  ([product-flows.md](../product-flows.md)).
- The 100-day vision enriches this surface — deadline-aware status (V2) and role-scoped
  dashboards (V3) in [vision-100-days.md](../vision-100-days.md) build on top of it.

---

## Actionability — chase / remind

> **Deferred — next phase (2026-06-10).** The grouped chase list and drafted reminders below
> are the target surface; not in the current phase's build scope. The underlying per-cell
> `reason_code` / `owner_needed` metadata is persisted now and already powers the final
> summary message.

- **Group blocked items by owner** (role / specialty / source system / coding team) so a
  single reminder can cover many cells at once.
- The platform may **draft** a reminder that names exactly which patients/fields are missing
  and what is needed — e.g. *"Missing specialist review note for spells X, Y — cannot
  evidence criterion Z."*
- **Sending is a human-initiated, gated action** — the platform **never sends silently**
  ([auth-and-access.md](auth-and-access.md)). The person running the audit reviews
  and sends.
- An in-app grouped list + drafted reminder. Channel integration (email/messaging) is an
  open question.

---

## Auth / IG

Per [auth-and-access.md](auth-and-access.md): a drafted reminder names
patients/fields and therefore contains PID — it stays **local**, is gated to authenticated
users, and **sending is a gated human action**.

---

## Acceptance criteria

- The table is always the **clean table template**: a cell the agent can't fill is **left
  empty** — no appendix, no in-cell blocked annotations, in-app or in the download.
- Blocked items are surfaced in the **agent's final summary message** (the terminal
  agent-activity feed entry) and the **top-band counters** now; the **dashboard status board**
  and the **chase list** are next-phase surfaces — never in the table.
- **BLOCKED and NEEDS-VERIFICATION items are distinguishable and never conflated** (separate
  states, queues, board columns).
- Each populated table has a **result status** (Queued / In progress / Blocked / In verification /
  Complete), visible on the dashboard Kanban and anywhere the table is listed.
- A populated table shows as **Blocked whenever it has ≥1 blocked cell**, with the count surfaced.
- On **re-run, resolved cells clear automatically** and the status updates with no manual
  intervention.
- A blocked reason states **what is missing and where the agent looked** (evidence-grade).
- Blocked items can be **grouped by owner**; the platform can **draft (not auto-send)** a
  reminder; **sending is human-initiated**.
- The **download button is never blocked**: a partial audit downloads as the plain template
  with empty cells, at any status; inactive/departed members are excluded from export rows.

---

## Open questions

*(Also recorded in [open-questions.md](../open-questions.md).)*

- **Owner inference:** how reliably can the agent name the responsible role/specialty from the
  record, and what is the fallback when it cannot (e.g. a generic "data team" owner)?
- **"Expected by" dating:** is there a source for when a value *should* have been recorded (to
  compute how overdue a gap is), or is age-of-gap measured only from the first run?
- **Reminder channel:** in-app list only for the product, or integration with email/messaging
  (which raises gated-send and IG questions)?
- **`AWAITING_RESULT` vs `MISSING_SOURCE_RECORD`:** where is the threshold when a result is
  expected but not yet ordered?
- **Merge IN VERIFICATION and BLOCKED** into one "Needs attention" column for now?
  *(Recommendation: keep separate — different owners and actions.)*
