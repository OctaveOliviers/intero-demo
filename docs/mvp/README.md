# Intero MVP Specification

This folder is the implementation-facing specification for Intero's clinical
audit agent. It is the source of truth for **what we are building and how** —
the partner-facing product narrative lives in Google Drive (see
[Source of truth](#source-of-truth)).

---

## What we are doing

**Intero turns a clinical audit template and a hospital database into a
populated, fully-traceable audit workbook — automatically, locally, and
read-only.**

NHS clinicians spend hours per audit cycle moving data by hand: either waiting
on the data-warehouse team to write SQL and export spreadsheets, or reading
patient records one by one to fill a standardised Excel template. Intero does
that work. A clinician picks (or describes) an audit, points it at one or more
databases, and an agent fills every cell of the template — copying structured
values directly and reading free-text clinical notes to infer the rest. **Every
value links back to its source**: the exact query that produced it, the record
it came from, or the clinical notes the agent read, with the relevant passages
highlighted.

The MVP proves this end-to-end on de-identified or synthetic data, on a
clinician's own machine, with full traceability and no data leaving the local
environment.

## What we are solving

| Today | With Intero |
| --- | --- |
| Clinician requests data → data-warehouse team writes SQL → exports to Excel → hands back → clinician fills the template by hand. Days of round-trips. | Clinician runs the audit themselves. The agent writes the SQL, populates the template, and shows its working. Minutes. |
| Reading 50+ record exports by hand to fill interpretive fields. | The agent reads the notes and proposes each value, with the source passages highlighted for the clinician to verify. |
| No traceability — a number in a cell, no record of where it came from. | Every cell traces to its source query, record, or notes, plus who ran it and when. |

The MVP is **not** a production hospital deployment. It demonstrates the shape
of the system, the safety model, and the workflow — enough for a clinician to
run a real audit on de-identified data and trust the result.

---

## How it works (one paragraph)

Intero runs in three phases — and **this architecture already exists in
`core/`** (see [3-architecture.md](./3-architecture.md)). **Indexing**: when an
audit template or a database is added, the agent builds a reusable, structured
JSON *model* of it (`spec.json`, `model.json`). **Mapping**: when a template
is paired with its database(s), the agent computes a *field mapping* (`mapping.json`)
that records, for every template field, exactly where its value lives — a direct copy from a
column, or the notes to combine to infer it. **Running**: at audit time the
agent works only from the mapping, applies the user's filters, populates the
workbook live, and records the evidence for every cell.

---

## Scope

### In scope for the MVP
- The three-phase pipeline: index → map → run, against de-identified or synthetic fixtures.
- Both value types: **direct** values (copied from structured tables) and **indirect / interpretive** values (inferred from free-text clinical notes). *(This reverses the earlier "SQL-only, notes deferred to v2" position in [Plan.md](./0ld/Plan.md).)*
- Running one audit template against **one or more databases**.
- Real-time, non-blocking **filter extraction** from the user's prompt, plus a working manual "add filter" control.
- A live, streamed run the user can **stop and re-run** (re-runs are idempotent and preserve reviewed/corrected cells). *(Pause/resume + leave-and-return are deferred to the 100-day vision.)*
- **Manual check-for-updates refresh** on the same workbook/run (short term): user click starts
  refresh in place; automatic upstream detection/recommendation is deferred post-MVP.
- Per-cell **traceability in the app** (click a cell for its query and evidence). Direct vs interpretive **visual markers**; interpretive cells auto-mark **reviewed** once opened and only count when reviewed (the safety gate), double-click to correct; a simple **confidence word (low / medium / high)** tints the workbook into a trust heat-map. **Export is a clean, submit-ready `.xlsx`** — the populated template only, no trace artifacts.
- **Login / network-gated access** and **per-user attribution** of every run and every database query.
- A **run log** (request, filters, agent reasoning, parameters, prompt version) for traceability and prompt improvement.
- **Completion status & blocked-item surfacing**: each run carries a status (Queued / In progress / Blocked / In verification / Complete) on a dashboard Kanban, and cells the agent cannot fill are surfaced as **blocked items** (reason + owner to chase), kept separate from cells that need verification.

### Out of scope for the MVP
- Writing to patient records or any hospital system (read-only, always).
- Production deployment, live EHR integration, or hospital SSO (local-only; SSO noted as a later integration).
- Transfer of patient-identifiable data outside the local environment.
- Clinical decision support; billing, coding, or reimbursement.

> **Horizon — 10 days vs 100 days.** This spec is the **10-day MVP**: prove the
> run loop and the safety gate. The **100-day vision** (accuracy that self-improves
> from clinician corrections, deadline-aware scheduled runs, the standing-service
> home screen) lives in [vision-100-days.md](./vision-100-days.md). The MVP is built
> to bend toward that vision, not away from it.

---

## Document index

Read the **README** and **[3-architecture.md](./3-architecture.md)** first.
Then read only the spec(s) for the area you are working on — each is written to
stand alone so an implementing agent is not drowned in unrelated context.

| Doc | Covers |
| --- | --- |
| [1-personas-use-cases.md](./1-personas-use-cases.md) | Who uses Intero and the four audit triggers: national, regional, departmental, ad-hoc. |
| [2-product-flows.md](./2-product-flows.md) | End-to-end UX: run-a-template, ad-hoc, the live run experience, filters, pause/resume, the traceability panel. |
| [3-architecture.md](./3-architecture.md) | The index → map → run pipeline and the precompute strategy, mapped to the existing `core/` modules. |
| [4-indexing-and-mapping.md](./4-indexing-and-mapping.md) | The JSON model set (`spec.json`, `model.json`, `mapping.json`); direct vs indirect; the precomputed `executable` block; multi-database. |
| [5-run-engine.md](./5-run-engine.md) | Runtime: the three-tier cell-resolution run (`try_direct` → `try_llm` → `try_agent`), the cell store, streaming, stop/re-run, cohort filtering. |
| [run-population-redesign.md](./0ld/run-population-redesign.md) | Archived design rationale for the three-tier cell-resolution ladder; the binding contract lives in [5-run-engine.md](./5-run-engine.md). |
| [6-traceability-evidence.md](./6-traceability-evidence.md) | Evidence panel, visual markers + confidence heat-map, the dwell-to-review gate, and the plain submit-ready export. |
| [7-auth-and-audit-log.md](./7-auth-and-audit-log.md) | Login/network gate, per-user attribution, query logging, run log, prompt versioning. |
| [8-design-system.md](./8-design-system.md) | Single source of UI truth: tokens, icons, components. |
| [9-library-and-sources.md](./9-library-and-sources.md) | The left-panel surface for viewing/managing audit templates and databases (the library), with version tracking. |
| [10-status-and-blocked-items.md](./10-status-and-blocked-items.md) | Why an audit can't complete (blocked cells + reason codes + owner) and the per-audit status lifecycle (Kanban). |
| [11-result-view-workbook-first.md](./11-result-view-workbook-first.md) | Frontend contract for the result screen: full-screen spreadsheet, top band controls, right-panel modes, and activity-eye states. |
| [11-refresh-detection-and-incremental-refresh.md](./11-refresh-detection-and-incremental-refresh.md) | Two-phase refresh contract: Phase 1 manual check-for-updates and in-place incremental refresh, Phase 2 post-MVP upstream automatic detection/recommendation. |
| [12-control-plane-database-and-access.md](./12-control-plane-database-and-access.md) | Canonical control-plane data model: users/roles/grants/resources/runs, agent DB safety boundary, and staged rollout (short/medium/long). |
| [acceptance-criteria.md](./acceptance-criteria.md) | Testable criteria, cross-referenced to each spec. |
| [open-questions.md](./open-questions.md) | Decisions still needed from the cofounders. |
| [vision-100-days.md](./vision-100-days.md) | The 100-day cathedral: self-improvement loop, scheduled runs, delight backlog. Not MVP scope. |
| [BUILD-PLAN.md](./BUILD-PLAN.md) | How to build the spec set: contracts-first DAG, domain lanes, merge gates, and the full ordered task table. |
| [tasks.jsonl](./0ld/tasks.jsonl) | Archived: the pre-pivot forward build plan as one JSON object per task. Superseded by [BUILD-PLAN.md](./BUILD-PLAN.md). |

Supporting / historical:
- [Plan.md](./0ld/Plan.md) — dated strategy snapshot (office-hours, 2026-05-29). Superseded by this README where they differ; kept as a record.
- [excel-traceability.md](./excel-traceability.md) — detailed Excel evidence-sheet export design. **Deferred** beyond the MVP (MVP export is a plain submit-ready file); kept for when an auditable export is needed.

---

## Terminology

We use **"audit"** as the canonical noun everywhere — backend, specs, and UI.
The thing a user uploads is an **audit template**; running it produces an
**audit run** (or just "run"). A reusable data source is a **database**.

> Cleanup task: the demo UI renamed "audit" to "analysis". That copy should be
> reverted to "audit" to match this spec and the backend.

Pipeline vocabulary (shared with the code): **field spec** (`spec.json`),
**schema model** (`model.json`), **field mapping** (`mapping.json`, whose
nested `executable` block is the precomputed Tier-1 plan — there is no
standalone `populate.json`),
**region** (a contiguous block of cells sharing one entity grain), **direct**
field vs **interpret** (indirect) field.

---

## Source of truth

Google Drive is the source of truth for partner-facing product discussion; this
repository is the source of truth for implementation commitments once decisions
are accepted.

- Drive path: `MOM's Unicorn / 02_Themis / 2 tech`
- Partner-facing Google Doc: https://docs.google.com/document/d/15ycL0yZy2H1KBF4Hp5DraVtteDMQR51oiPjO6fy_tOo/edit

Workflow: discuss scope and decisions in Drive → promote accepted decisions into
this folder as implementation requirements → keep implementation, tests, and
agent behaviour aligned with the accepted repo specification.
