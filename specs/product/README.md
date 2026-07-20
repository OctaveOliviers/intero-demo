# Intero — Product Specification

This folder is the **durable, implementation-facing specification** for Intero's clinical audit
agent. It is the source of truth for *what we are building and how*. (For how the whole `specs/`
tree is organised — product specs vs build plans — see [../README.md](../README.md).)

---

## What we are doing

**Intero is operational intelligence for hospitals: clinicians reach whatever information they need
from the hospital's data through a thread (a free-ranging conversation) — as an Answer or a
table (a populated audit), fully traceably, locally, and read-only. Scope binds to the table, not
the thread. Clinical audit is one use case. (Dashboards are a deferred third output.)**

NHS clinicians spend hours per audit cycle moving data by hand: either waiting on the
data-warehouse team to write SQL and export spreadsheets, or reading patient records one by one to
fill a standardised Excel template. Intero does that work — and more. A clinician **scopes the data
to a Dataset**, then picks or describes a **table**, and an agent fills every cell — copying
structured values directly and reading free-text clinical notes to infer the rest. **Every value
links back to its source**: the exact query that produced it, the record it came from, or the
clinical notes the agent read, with the relevant passages highlighted.

The product proves this end-to-end on de-identified or synthetic data, on a clinician's own machine,
with full traceability and no data leaving the local environment.

## What we are solving

| Today | With Intero |
| --- | --- |
| Clinician requests data → data-warehouse team writes SQL → exports to Excel → hands back → clinician fills the template by hand. Days of round-trips. | Clinician runs the audit themselves. The agent writes the SQL, populates the template, and shows its working. Minutes. |
| Reading 50+ record exports by hand to fill interpretive fields. | The agent reads the notes and proposes each value, with the source passages highlighted for the clinician to verify. |
| No traceability — a number in a cell, no record of where it came from. | Every cell traces to its source query, record, or notes, plus who ran it and when. |

## How it works (one paragraph)

Intero runs in three phases — and this architecture already exists in `core/` (see
[architecture.md](./architecture.md)). **Indexing**: when a table template or a database is added,
the agent builds a reusable, structured JSON *model* of it (`spec.json`, `model.json`).
**Mapping**: the moment a table is persisted as a template, the agent computes — in the background,
across the databases — a *field mapping* (`mapping.json`) that records, for every field, exactly
where its value lives (a direct copy from a column) or where its evidence lives (the notes to
combine to infer it). **Table Population**: the agent works
only from the mapping, applies the **Dataset's** scope, populates the **table** live, and records
the evidence for every cell.

---

## Scope

### In scope for the product
- **Operational-intelligence surfaces:** **Datasets** (saved filters scoping the one hospital
  database, across multiple source databases), **threads** (free-ranging, **unscoped**
  conversations), and **two v1 outputs — an Answer and a Table**; **scope binds to the table**, not the
  thread. Clinical audit is a populated table. *(Dashboards and projects are deferred.)*
- The three-phase pipeline: index → map → table population, against de-identified or synthetic fixtures.
- Both value types: **direct** values (copied from structured tables) and **interpretive** values
  (inferred from free-text clinical notes).
- Populating one table template against **one or more databases**.
- A live, streamed table population the user can **stop and re-run** (idempotent, preserving reviewed/corrected
  cells).
- Per-cell **traceability in the app**; direct vs interpretive visual markers; the dwell-to-review
  safety gate; a confidence heat-map. **Export is a clean, submit-ready `.xlsx`** — the populated
  template only.
- **Login / network-gated access** and **per-user attribution** of every table population and every query.
- A structured **table-population log** (request, filters, agent reasoning, parameters, prompt version).
- **Completion status & blocked-item surfacing** (status lifecycle + blocked vs needs-verification).

### Out of scope for the product
- Writing to patient records or any hospital system (read-only, always).
- Production deployment, live EHR integration, or hospital SSO (local-only; SSO noted as later).
- Transfer of patient-identifiable data outside the local environment.
- Clinical decision support; billing, coding, or reimbursement.

> **Horizon — now vs next.** This spec is the **product**: prove the table-population loop and the
> safety gate. The **100-day vision** (self-improving accuracy, scheduled runs, the standing-service
> home screen) lives in [vision-100-days.md](./vision-100-days.md). The product is built to bend toward
> that vision, not away from it.

---

## Document index

Read this README and [architecture.md](./architecture.md) first. Then read only the spec(s) for the
area you are working on — each is written to stand alone.

### Orientation (high-level)
| Doc | Covers |
| --- | --- |
| [personas-and-use-cases.md](./personas-and-use-cases.md) | Who uses Intero (v1 serves P1 audit, P2 recurring re-runs, P3 ad-hoc-via-chat; director/oversight personas P4/P5 are mostly next-phase pending dashboards) and the audit triggers; clinical audit as one use case. |
| [product-flows.md](./product-flows.md) | End-to-end UX: the request flow (per-message scope → output → execute), the unscoped thread + the two outputs (chat / table), scope-binds-to-table, the sub-agent + inspector flow, the live table-population experience, state coverage. |
| [architecture.md](./architecture.md) | The indexing → mapping → table-population pipeline and the precompute strategy, mapped to the existing `core/` modules. |
| [vision-100-days.md](./vision-100-days.md) | The 100-day cathedral: site artifact learning, scheduled runs, role dashboards. Not in scope. |
| [improvement-loops.md](./improvement-loops.md) | Forward-looking map of **how Intero gets better**: site artifact learning vs. agent code evolution vs. the model-shrink loop — what each owns, why they can't merge, and the one pipe connecting them. Read before either feature spec below. |

### Features (one capability/surface each — in [features/](./features/))
| Doc | Covers |
| --- | --- |
| [indexing-and-mapping.md](./features/indexing-and-mapping.md) | The JSON model set (`spec.json`, `model.json`, `mapping.json`); direct vs interpret; the precomputed `executable` block; multi-database. |
| [table-population.md](./features/table-population.md) | Table population over the shared `navigate` substrate: the two population steps (prepopulate → the table agent), the cell store, streaming, stop/re-run, the table's hard cohort, plus the Answer (`chat-answer` skill, per-message scoping) output path. *(Dashboard output is a fenced deferred section.)* |
| [navigation.md](./features/navigation.md) | How an agent **finds** things — the file-tree primitives **catalog / search / describe / join-paths**, generic over any **collection** (databases, Datasets, templates). `navigate` is the shipped databases specialisation; the libraries generalisation is shipped too — the thread agent browses its granted Datasets/Templates through the same verbs. Rationale: [decisions/0005](./decisions/0005-navigation-is-a-generic-verb-set-over-collections.md). |
| [traceability-and-evidence.md](./features/traceability-and-evidence.md) | Evidence panel, visual markers + confidence heat-map, the dwell-to-review gate, the aggregate-value evidence shape (chat aggregate claims; dashboard indicators when built), and the plain submit-ready export. |
| [result-view.md](./features/result-view.md) | Frontend contract for the result screen: full-screen spreadsheet, top band, right-panel modes, activity-eye states. |
| [refresh.md](./features/refresh.md) | **Deferred** — refresh design (re-checking a completed audit for source data that lands later); not in the product. |
| [status-and-blocked-items.md](./features/status-and-blocked-items.md) | Why an audit can't complete (blocked cells + reason codes + owner) and the table result status lifecycle (Kanban). |
| [library-and-sources.md](./features/library-and-sources.md) | The left-panel libraries — **Datasets**, **Templates** (table templates), **Tables** (populated audits) — sharing (Datasets/templates/tables; threads not), and the **Dataset** object that scopes a table. |
| [auth-and-access.md](./features/auth-and-access.md) | Login/network gate, sessions, per-user attribution, the run log, **and** the hospital-role authorization model: clinician / admin (a clinician-superset) / agent roles (§9), resource grants over Datasets/templates/tables + sharing (§10), Dataset-scoped data access ∩ hospital permissions (§11), outputs-never-gated (§12), frontend role gating (§13), enforcement (§14), seeding (§15). Normative model in [contracts/control-plane-schema-and-permissions.md](./contracts/control-plane-schema-and-permissions.md). |
| [design-system.md](./features/design-system.md) | Single source of UI truth: tokens, the shared icon set, component patterns. |
| [inclusion-criteria-setup.md](./features/inclusion-criteria-setup.md) | The free-text → grounded-filter engine, now reused to **define a Dataset** (grounded against the database filterable surface). |
| [ask-user-questions.md](./features/ask-user-questions.md) | The reusable `ask_user_question` tool and composer mode: agents may queue clarification questions; the composer shows one question at a time with choices, `Other`, `Back`, `Skip`, `Next`, and `Submit`. A question may carry a structured **resource change proposal**; accepting it makes the backend issue a one-use **approval token** for the matching write tool (patch grammar still owed — Q44). |
| [site-artifact-learning.md](./features/site-artifact-learning.md) | Forward-looking: learning a site's own artifacts (`model.json`/`mapping.json`/`spec.json`) from observation + correction (Observe → Learn → Reconcile), at a live hospital deployment. One of two improvement loops — see [improvement-loops.md](./improvement-loops.md). |
| [excel-traceability.md](./features/excel-traceability.md) | Deferred design for an auditable Excel evidence-sheet export (export stays plain). |
| [agent-code-evolution.md](./features/agent-code-evolution.md) | Forward-looking, engineering-facing: an overnight agent team evolves the `cell-fill` agent's shared code (`SKILL.md`/tools/config/prompt) against a golden benchmark and opens a PR. The other improvement loop — see [improvement-loops.md](./improvement-loops.md). |

### Cross-cutting
| Doc | Covers |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | The canonical domain glossary (ubiquitous language). The source of truth for terminology. |
| [decisions/](./decisions/) | Architectural Decision Records — hard-to-reverse decisions and why. The counterpart to open-questions. |
| [acceptance-criteria.md](./acceptance-criteria.md) | Testable criteria, cross-referenced to each spec. |
| [open-questions.md](./open-questions.md) | Decisions still needed from the cofounders. |
| [contracts/](./contracts/) | The normative JSON Schemas + prose contracts (model schemas, runtime shapes, state schema, control-plane permissions, storage layout, API). Start at [contracts/README.md](./contracts/README.md). |

**Building a feature?** Build plans are not here — follow the method in
[../build-plans/INSTRUCTIONS.md](../build-plans/INSTRUCTIONS.md). The build agent derives the plan
itself; it isn't stored in the tree.

---

## Terminology

The canonical glossary is **[CONTEXT.md](./CONTEXT.md)** — the single source of truth for
domain vocabulary, shared by the code, the specs, the UI, and the team. Read it before
introducing or renaming a domain term.

In brief: a **Dataset** is a saved filter scoping the one hospital database; a **thread** is an
**unscoped** conversation that produces an **Answer** or a **table**; **scope binds to the
table** (pinned for life), not the thread; an **audit** is a populated table. *(Dashboards and
projects are deferred.)* Pipeline vocabulary
(shared with the code): **field spec** (`spec.json`), **schema model** (`model.json`), **field
mapping** (`mapping.json`, whose nested `executable` block is the precomputed prepopulate plan),
**region**, **direct** field vs **interpret** (interpretive) field. A front-end **table** is the
output artifact; a SQL/source table is always a **source table**. All defined in
[CONTEXT.md](./CONTEXT.md).

## Source of truth

Google Drive is the source of truth for partner-facing product discussion; this repository is the
source of truth for implementation commitments once decisions are accepted.

- Drive path: `MOM's Unicorn / 02_Themis / 2 tech`
- Partner-facing Google Doc: https://docs.google.com/document/d/15ycL0yZy2H1KBF4Hp5DraVtteDMQR51oiPjO6fy_tOo/edit

Workflow: discuss scope and decisions in Drive → promote accepted decisions into this folder as
implementation requirements → keep implementation, tests, and agent behaviour aligned with the
accepted repo specification.
