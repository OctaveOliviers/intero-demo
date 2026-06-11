# Acceptance Criteria

The MVP is complete when it can run the **regional cord-pH audit (UC2)** end-to-end, on
de-identified/synthetic data, satisfying every criterion below. The cord-pH dataset is the
**must-pass demo and test case** ([1-personas-use-cases.md](./1-personas-use-cases.md));
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

## Flows & setup → [2-product-flows.md](./2-product-flows.md)
- A run can start three ways: **naming the audit in the prompt** (agent identifies the
  existing template), `+` → upload new, `+` → select existing.
- A newly uploaded template indexes **without freezing the UI** and reaches `Ready`.
- On index completion the agent **suggests inclusion/exclusion criteria and pre-selects
  databases**, and these **complement, never overwrite** anything the user already set.
- *(Deferred — next phase, per doc 2 §Filter interaction scope note:)* Filter chips update
  **additively** as the user types (never collapse to zero); the **agent band stays mounted**
  while re-extracting (only its label/icon changes — no fold/jump). Extraction is
  **menu-grounded and intelligent** (not regex): `"Q1 2026"`, month ranges, and age→DOB
  phrasings resolve to the correct **structured** chip (ranges included), not a literal echo.
  Manual add-filter + Enter routes through the **same** extraction call and reliably produces
  a structured chip — or, when nothing in the prelinked criteria menu matches, shows an inline
  error and keeps the input expanded, adding no chip. **No `custom`/free-text chip is ever
  created.**
- **Binding now:** every structured filter present at run time is enforced through the cohort
  (doc 5), and the audit's `fixed_criteria` default cohort applies when a run gives no
  criteria.
- Flow B: the output-spec chip names the template-to-be and **previews its fields on hover**;
  the workbook is built **only on confirmation (Enter)**.
- Every surface handles empty / loading / error / partial states; blank cells show a reason.
- In result view, the workbook is the primary full-screen surface with a persistent top band
  (title block + download/settings/eye icons immediately beside the title, optional deadline
  text beneath), and one right panel that switches between inclusion criteria, agent activity,
  and clicked-cell evidence; active settings/eye icons toggle the panel open/closed, and the
  activity icon is blue animated while run/refresh is active and gray when idle; eye click is a
  pure toggle for `agent_activity`, and `Check for updates` is a small loop-icon action inside
  the `agent_activity` panel
  ([11-result-view-workbook-first.md](./11-result-view-workbook-first.md)).
- **Blocked / needs-review counters** sit at the far right of the top band (hidden at zero,
  live-updating); clicking one opens `agent_activity` scrolled to the review summary. The
  **review summary renders only as the terminal agent-activity feed entry** — no summary
  banner above or over the workbook (doc 11).

## Indexing & mapping → [4-indexing-and-mapping.md](./4-indexing-and-mapping.md)
- Indexing produces `ready` `spec.json` + `model.json` without blocking the UI; failure sets
  `error` with a retry path.
- The models pass the bar: **an agent that never saw the source could work from them alone** —
  they explain what value each field/column holds, which cells need populating, any **coded
  value sets**, and handle both simple and complex (explanation-sheet + region-scoped) templates.
- `mapping.json` is **one per audit, spanning all its databases**, classifying every field
  direct/interpret with its source `database → table.column`.

## Precompute & run → [4](./4-indexing-and-mapping.md) + [5-run-engine.md](./5-run-engine.md)
- The **orchestrator** populates the workbook through a shared **cell store** (one cell per
  region×member×field, updated in place) and **three escalating tiers**: **Tier 1 (`try_direct`)**
  deterministically fills cells by running the `executable` block's precomputed read-only SQL in bulk and
  applying each field's code map (clean → `filled`); **Tier 2 (`try_llm`)** makes one cheap LLM pass
  per remaining error cell (propose a value or one retry query, orchestrator runs the read-only SQL);
  **Tier 3** is a **single `cell-fill` agent session** over all still-open cells, reusing fixes across
  a field or member and writing each cell in place (`blocked` if it cannot be solved). Filters are
  enforced via the **cohort** (the `executable` cohort block scopes every query). **Everything is
  read-only; no generated or edited code runs** (A2).
- A run can target **≥2 databases**.
- The **workbook chip appears on creation**; cells become traceable as they fill; selecting a
  cell does not pause population.
- **Stop** halts the run (no background work); a **re-run** re-attempts only the cells still open
  or blocked (idempotent) and preserves reviewed/corrected cells. *(Pause/resume + leave-return are
  deferred to the 100-day vision.)*
- Filters are applied precisely and validated before population.

## Refresh detection & incremental refresh → [11-refresh-detection-and-incremental-refresh.md](./11-refresh-detection-and-incremental-refresh.md)
- Refresh is **manual-only**: the system never auto-runs extraction.
- MVP entrypoint is the `agent_activity` panel's **Check for updates** action (loop icon);
  clicking starts refresh.
- `Check for updates` is visible/actionable only when execution is idle, and is hidden while
  an initial run or refresh execution is active.
- No automatic upstream detection/recommendation logic runs in MVP.
- Refresh runs **in place** on the same workbook identity (`run_id` unchanged), with a distinct
  internal `execution_id` for traceability/activity.
- MVP refresh scope is minimal: retry `blocked`/`pending` cells + add cells for new cohort
  members; do not recompute already filled cells.
- On refresh start, active-member blocked cells are reopened `blocked -> pending`.
- Row indexing is deterministic and append-only: new members append at tail; no repacking.
- Members leaving cohort are retained and marked inactive (not deleted).
- Export excludes inactive/departed members from the submit-ready workbook.

## Traceability & evidence → [6-traceability-evidence.md](./6-traceability-evidence.md)
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

## Auth & audit log → [7-auth-and-audit-log.md](./7-auth-and-audit-log.md)
- No data is accessible without login; an anonymous user sees nothing.
- Every run + database query is attributed to the authenticated user; a user can log out, log
  back in, and see their own audits and history.
- Every run produces a structured record (request, resolved target, filters, agent activity,
  parameters, **prompt version**, per-cell results + verifications).
- Accounts, sessions, runs, and logs live in a **real database** (local for the MVP), designed
  to move to hospital-hosted infrastructure.
- The run/cell **state schema** (runs, cells, events) is the single source of truth for status,
  blocked items, and the run log; the dashboard and the loop read from it, not the chat or the
  workbook (A4; doc 7).
- Authorization follows role permission + resource grant checks per
  [contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md),
  with consistent `401` (unauthenticated) / `403` (unauthorized) behavior.
- The agent runtime role is constrained to run-scoped runtime writes and read-only clinical data;
  attempts to mutate IAM/catalog policy tables are blocked at DB-role level.

## Design system → [8-design-system.md](./8-design-system.md)
- All product colors/shapes/sizes/fonts come from tokens in `app.css`; no component hard-codes
  a value a token covers.
- Confidence heat-map, kind marker, and the two review flags map to **named semantic tokens**
  and stay legible together on one cell.
- One icon family; no emojis or ad-hoc arrow glyphs.

## Library & sources → [9-library-and-sources.md](./9-library-and-sources.md)
- The left panel exposes **Audit templates** and **Databases** as card grids, each card
  opening a detail view.
- Audit cards show **title, description, and (if any) the submission deadline** only — no
  scheme/version/last-pulled metadata on the card face; cards are grouped
  **National / Regional / Local**.
- Audit detail is the **single-column, three-section page** (doc 9): title + back-link,
  one-line description, deadline, then **Inclusion criteria** (editable `fixed_criteria`
  chips), **Databases** (chips: name + template-specific `database_summaries` sentence,
  generic `model.json` `summary` as fallback), and **Template** (chips: field name + a
  one-sentence description — mechanical code explanation for coded direct fields, clinical
  meaning for interpret fields; name-only with a pairing hint when no mapping exists).
  Database detail = the `model.json` (entities, identifiers/join keys, coded columns).
- National + BPT-derived items are **read-only (clone-to-local)**; local audits are
  user-editable, gated by role.
- A run **records and pins the exact template version** it used.

## Completion status & blocked items → [10-status-and-blocked-items.md](./10-status-and-blocked-items.md)
- The workbook is always the **clean audit template** — missing values are **empty cells**, no
  appendix, no in-cell annotations, in-app or in the download.
- Blocked items are surfaced in the **agent's final summary message** (the terminal
  agent-activity feed entry) and the **top-band counters**; the **dashboard board** and
  **chase list** are next-phase surfaces — never in the workbook.
- The **download is never blocked** — a partial audit downloads as the plain template with
  empty cells, at any status.
- **BLOCKED and NEEDS-VERIFICATION are distinguishable and never conflated** (separate states,
  queues, board columns).
- Each run has a **primary status** (Queued / In progress / Blocked / In verification /
  Complete), derived from persisted cells, with the blocked count surfaced. *(The dashboard
  **Kanban** board rendering it is deferred — next phase, doc 10.)*
- A run shows **Blocked whenever ≥1 cell is blocked**; **re-running auto-resolves** cells whose
  data has landed and updates status with no manual edit.
- A re-run **never overwrites a `reviewed`/`corrected` cell**; data that disagrees with a
  correction is flagged as a conflict, not silently replaced (GAP-1).
- The resolved template is **confirmed by the user before the run starts** — no auto-start on an
  identified template (GAP-2, flows).
- Blocked items remain visible on the **dashboard + run record even if the run errors** before
  the final message (GAP-3).
- A missing/mismatched join key blocks the cell (`IDENTITY_UNRESOLVED`); rows whose identities
  don't match are **never combined** (GAP-4).
- A blocked reason is **evidence-grade** (states what is missing and where the agent looked).
- *(Deferred — next phase, doc 10:)* blocked items can be **grouped by owner**; the platform
  **drafts (never auto-sends)** a reminder; **sending is human-initiated**.

## Testing & evals → seed plane + [5-run-engine.md](./5-run-engine.md)
- A **deterministic golden test** runs **Tier 1 (`try_direct`)** on the cord-pH fixtures + cohort
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
exports a clean, submit-ready workbook — with the whole run attributed and logged. If a
required value's source data is absent, the cell is **left empty** and surfaced as a **blocked
item** (reason + owner) in the agent's summary and the status — the workbook stays clean and
remains downloadable — and the run shows **Blocked** until a re-run resolves it. No value is
fabricated and nothing leaves the environment. If a member departed the cohort on refresh, that
member remains visible in run history/UI context but is excluded from the exported workbook.

*(Verifying the build against this list is tracked as TODO-0043.)*
