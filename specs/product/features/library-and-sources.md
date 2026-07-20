# Libraries — Datasets, Templates & Tables

Read [README.md](../README.md), [personas-and-use-cases.md](../personas-and-use-cases.md), and
[architecture.md](../architecture.md) first. This document specifies the **left-panel libraries**
the user works from — **Datasets** (the data library), **Templates** (table templates), and
**Tables** (the populated audits) — and the **Dataset** object that scopes a table.

It replaces the former two-destination library (Databases + Audit templates). Two things change at
the root: the user **never manages databases directly**, and **"an audit" is no longer a separate
library object** — it is a **table** (populated by pointing a table at a Dataset, see
[product-flows.md](../product-flows.md)), which is itself first-class in the **Tables** section.

> **v1 scope.** The structured output is the **table**; **dashboard templates are deferred**
> (fenced design below), **projects/folders are deferred** (the panel is **flat**), and **threads
> are not shareable** ([product-flows.md](../product-flows.md)).

## The model in one paragraph

There is **one logical hospital database** — the union of every registered source database, joined
on measured identity links ([architecture.md](../architecture.md)). The user controls nothing about
it. What they control are **Datasets** — saved filters that scope that database to a slice (NICU,
paediatric diabetes, the whole paediatric department) — and the **outputs** they produce from a
**thread**: a **chat** answer or a **table** (a structured extract; an audit). **Scope binds to the
table** (pinned to one Dataset *or* the whole DB), not to the thread, which roams. The left panel is
**flat**: **Datasets** (saved filters), **Templates** (reusable table definitions), and **Tables**
(the populated audits).

---

## (A) The data library — Datasets

### What a Dataset is

A **Dataset** is a **saved, named filter — a query — that scopes the hospital database to a slice.**
**Scope binds to the table, not the thread** ([decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md)):
a **table** pins one Dataset (or the whole DB) as a **hard cohort, fixed for life** — every query is
bounded to the slice and the populated table equals it, exactly — whereas a **thread** is unscoped and
a **chat** answer scopes **per message** (bounded only by the user's hospital permissions, the only
hard wall). Datasets are **flat** — there is no nesting; a user may keep as many as they like and
point different tables at different Datasets, or cross-reference by comparing tables built from
different Datasets. A Dataset is **purely a filter**; it never copies or owns data.

A Dataset may scope across **several source databases at once**, joined on identity links (see
[Multi-database scope](#multi-database-scope)).

### Creating a Dataset — a profiling conversation → grounded filters

A Dataset is created by **describing precisely what slice you want** in plain language; the system
**grounds that description into concrete filters** against the databases' filterable surface (the
`filterable: true` columns of each `model.json`, with their types, allowed values, and ranges —
[indexing-and-mapping.md](indexing-and-mapping.md)). Each filter binds to a real
`database → table.column` with a parameterised SQL predicate, and is **proved by a real read-only
`COUNT`** at build time; a phrase that grounds to nothing is surfaced as *not available for this
database*, never invented. This reuses the grounding engine specified in
[inclusion-criteria-setup.md](inclusion-criteria-setup.md). The creation element **states its
boundary up front** — it can filter on **recorded fields** (gestation, age, diagnosis code, …), not
on concepts written **only in free-text notes**, which are **deferred** (structured-only, consistent
with the v1 cohort decision — [vision-100-days.md](../vision-100-days.md)) — so the user learns the
limit before describing, rather than after.

A Dataset can be created standalone in the data library, or **mid-thread** — when the agent has
pinned the scope for a request it shows it as a structured element with a **"persist dataset"**
action that saves it here for reuse ([product-flows.md](../product-flows.md)).

### The Dataset detail view

Opening a Dataset shows its filters in a single-column page (shared reading width,
[design-system.md](design-system.md)):

- **The filters**, one per row, each as a **label and a value in an editable chip** (e.g.
  *Gestation (weeks): ≥ 37*) — the same chip pattern as the agent-suggested criteria
  ([inclusion-criteria-setup.md](inclusion-criteria-setup.md)); date inputs adapt to the data's
  format. Editing a value **re-derives deterministically** — the predicate's bind value changes, the
  SQL recomposes, and the count re-runs, with **no LLM call**.
- **An empty "add filter" row** below the filters: the user describes the filter to add in plain
  text, an LLM grounds it against the known database structure, and it lands as a **new chip and a
  new clause** in the SQL. This is the one place filters are added.
- **A sanity-check count** at the bottom — the number of entities (patients / visits / items) in the
  database that satisfy the filters, from a read-only `COUNT(DISTINCT <identity>)`; it re-runs as
  chips change.
- **A toggle, top-right**, that switches the page between this **normal view** (labels + value
  chips) and the **raw SQL** that implements the scoping. The SQL view is **read-only** — it is the
  precise, transparent statement of the slice; all editing is through the chips and the add-filter
  row, so the user never has to write SQL.

### Multi-database scope

A real hospital holds several databases (EHR, labs, radiology), and a Dataset **scopes across a
combination** of them. Each filter binds to a `database → table.column`, and predicates across
databases compose over the **measured identity links** connecting them, resolved read-only by the
shared cross-database engine — the source SQLite files are `ATTACH`ed read-only into one connection
and joined on their identity bridges ([architecture.md](../architecture.md),
[table-population.md](table-population.md), [inclusion-criteria-setup.md](inclusion-criteria-setup.md)). The
sanity-count and every scoped query the Dataset drives therefore span all the databases its filters
touch. A filter binds only across databases whose identity link is **measured**, never guessed; an
unlinkable concept is surfaced as *not available*, not silently joined.

---

## (B) Templates & Tables

The **Templates** library holds the reusable **table** definitions; the **Tables** section holds the
**populated** tables (audits) produced from them. A definition saved as a **template** is what unlocks
the fast path (see [Persistence → precompute](#persistence--precompute)). *(Dashboard templates are
deferred — [Dashboards — deferred](#dashboards--deferred).)*

### Tables

A **table** is a **row-based, field-defined extract**: each **column is a field**, each **row is an
entity** (a patient, a visit, a birth record — the table's **grain**). When a table is created the
user fixes two things: its **fields** (the columns — each with a short description, type, and any
coded value set) and what an **entity** is (the rows). Once those are fixed, the system knows exactly
how to compute the table.

A table is created **three ways**, all converging on the same editable structured spec (short
description, grain, fields) shown in a structured element in the chat the user can edit directly
([product-flows.md](../product-flows.md)):

1. **Select an existing template** from the **Templates** library.
2. **Upload an Excel** — the indexer parses its fields and descriptions into the field spec
   ([indexing-and-mapping.md](indexing-and-mapping.md), `spec.json`).
3. **Describe it in plain language** — the agent derives the structure (description, grain, fields)
   and presents it for editing.

The product keeps in-chat table creation **row-based only** (the existing `row_per_entity` region —
[indexing-and-mapping.md](indexing-and-mapping.md)); richer multi-region uploaded templates remain
supported through the indexer.

A table runs **with or without a Dataset**: with one, it is scoped to that slice; without one, it
covers **all entities of the table's grain** in the database. The Dataset is always an *optional*
scope, never required.

### Dashboards — deferred

**Not in v1** — no customer has asked, so the only structured output is the **table**. The design is
**retained, fenced**: a dashboard is built **on a table**; its indicators are **computed
deterministically** from the table's cells by **stored declarative formulas** (the agent never
aggregates — a fixed reducer does), each card showing its **denominator + completeness** (blocked /
unreviewed → **provisional**) with the agent choosing only the **visualization**; point-in-time, with
run-over-run history a further V2 item. Full retained design:
[table-population.md §Dashboard output (deferred)](table-population.md#dashboard-output-deferred). **Do not build
it now.**

### Persistence → precompute

**Precompute is tied to persistence.** Persisting a table template triggers
**background mapping** of that table against all available databases — where each field's value
lives (direct) and where its evidence lives (interpret) — folding the direct-field **executable
block** into `mapping.json` ([indexing-and-mapping.md](indexing-and-mapping.md)). That executable is
what lets the fast **prepopulate** step run; a table with **no mapping yet** simply **skips prepopulate**
and is populated by the agent ([table-population.md](table-population.md)). Mapping always runs **in the
background and never blocks** the current request — persist a table mid-thread and the extraction
starts immediately on the agent, while the mapping it computes speeds up the *next* run. Persisting a
**Dataset** likewise saves its grounded filter SQL for reuse.

This is the project's specs-based-development pattern applied to data: a **persisted template is a
committed spec** (precomputed, fast, reusable); an **ad-hoc, in-chat request works without one** (the
agent figures it out live).

### Editing a template — the library is the SSoT surface

A persisted **table template** is **editable in the library**, and the library **is** the editing
surface for the `var/` single source of truth: every consumer (the table view, the request flow)
reads a template's definition from its artifact, **never from a hardcoded catalog**.

- **What's editable:** a field's **name** and its **description** (the field `id`/`number` are
  immutable join keys — a rename changes the **name** only; [indexing-and-mapping.md](indexing-and-mapping.md)).
- **How:** edits **auto-save** — **debounced, no save button**, optimistic with **revert-on-error** —
  writing back to `spec.json` via a validated, atomic write. This is the **same mechanism** the
  **Dataset** detail already uses for its filter chips ([inclusion-criteria-setup.md](inclusion-criteria-setup.md)),
  generalized as the library's one editing pattern.
- **Edits survive re-index** (durable merge keyed by the stable field key), and **standard/shared
  templates stay read-only — clone to edit** (below).

*(Dashboards/indicators are deferred, so there is no indicator-editing surface; a Dataset's cohort is
edited on the **Dataset**, not the template.)*

---

## Audits — where scope meets output

An **audit** is not a stored object; it is the **intersection of a Dataset (scope) and a table
(output), populated within a thread** ([product-flows.md](../product-flows.md)). The Dataset supplies
the cohort; the table supplies the fields; the run composes the Dataset's predicates into the table's
cohort and populates the cells ([table-population.md](table-population.md)). A standard national audit therefore
ships as a **pair** — its canonical **Dataset** plus its **table template** — so "run NNAP" means
*open NNAP's Dataset and apply NNAP's table*.

---

## Version tracking, auth & IG

- **Persisted templates and Datasets are versioned**; re-deriving creates a new version and never
  mutates an in-flight one. Table population **pins the template version** it used, recorded in the
  log ([auth-and-access.md](auth-and-access.md)), so a later change cannot retro-alter a finished
  table.
- **Standard / shared templates are read-only**; a user **clones** one to vary it. **User-created
  Datasets and templates are editable.** Creating or editing them, like every data action, is
  **role-gated** (IG / Caldicott — [auth-and-access.md](auth-and-access.md)).
- Every populated value stays **traceable** to its query/record or its highlighted notes
  ([traceability-and-evidence.md](traceability-and-evidence.md)), and every database query is
  attributed to the user who ran it.

---

## Sharing — narrow (v1)

Sharing is in scope for v1 but deliberately narrow ([product-flows.md](../product-flows.md);
grant mechanics in [auth-and-access.md §10](auth-and-access.md)).

- **Shareable:** **Datasets**, **table templates**, and **populated tables**. **Threads are NOT
  shareable** (deferred — the value is the table/report; wait for users to ask before building thread
  sharing).
- **Editor-only.** Sharing always grants **editor** access — the recipient opens **and edits the
  same** item (not a copy). There is **no** read-only / run-only level.
- **Sharing is managed from the item's ⋯ → Share dialog** — a single **chip-input**: each current
  grantee is a chip (remove the chip to revoke), and a search adds colleagues from the clinical-staff
  directory (`GET /api/clinicians`). That dialog is the **only** place who an item is shared with is
  seen and managed.
- **A received item appears in the recipient's normal library** — a shared Dataset in Datasets, a
  template in Templates, a table in Tables. There is **no** separate "Shared" panel.
- **Received Dataset notification.** A newly received Dataset is unprocessed until the recipient
  chooses **Keep** or **Delete**. While unprocessed, the left-panel **Data library** row shows the
  same blue notification dot used for finished-unopened tables, and the Dataset card uses the matching
  blue highlight. The card shows **Keep** / **Delete** instead of the ⋯ menu; **Keep** clears the
  notification and leaves the grant intact, while **Delete** revokes the inbound grant and removes the
  Dataset from the recipient's library.
- **Sharing a populated table** auto-grants the recipient **access-only** to its **Dataset** (so they
  can see the cohort) — but the Dataset is **not** persisted into their Datasets library (they get the
  table; they may not care about the Dataset itself).
- *(Grant semantics — `resource_type` is `dataset`/`template`/`table` (thread/project not grantable),
  editor-only sharing, and the table→Dataset access-only cascade — are normative in
  [contract §5](../contracts/control-plane-schema-and-permissions.md#5-resource-grants-and-sharing);
  the behaviour is in [auth-and-access.md §10](auth-and-access.md).)*

---

## Design

Per [design-system.md](design-system.md):

- **Datasets**, **Templates**, and **Tables** are left-panel destinations on a **flat** list (New ·
  Search · Datasets · Templates · Tables · Threads — no projects). Each page shows just its title and
  lays its content in the shared reading-width column.
- **A populated table stores, as first-class card attributes**, the basis the find-aids need: its
  **source template** (or **`ad-hoc`** when it was described in-thread with no template), a
  **title / short description** (the describe-it path already derives one), and a **reporting-period
  label** derived from its pinned Dataset's date filter (**fallback to the run date** when the cohort
  carries no clean period — an empty/odd filter is valid, [decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md)).
- The **Tables** list is **recency-ordered**, **searchable over title/description** (so even an
  **ad-hoc, template-less** table is findable — closing the gap a flat panel + no folders would
  otherwise leave), and **filterable by source template** — so a department head re-running a standing
  audit each cycle (each cycle is a **new table**) finds "all my NNAP runs" and tells cycles apart by
  the period on the card ("NNAP · Q2 2026"). This is the v1 substitute for the deferred grouping layer.
- One shared **card** component lists Datasets, table templates, and populated tables; one
  **detail-view** pattern. The Dataset detail adds the **normal ↔ raw-SQL toggle** and the **sanity
  count**.
- A **table template (or a populated table) that carries a submission deadline shows it on the card
  face** — small, light-gray — so a clinician sees "NNAP — due in 9 days" **before opening** it. The
  deadline is not buried inside the opened table.
- **Structured, editable thread elements** (the Dataset spec, the table spec) each carry a
  **"persist"** action; the table-spec element offers **select existing / upload Excel / describe**.
- The UI introduces a **Dataset** in clinical terms (e.g. "the group of patients this works on");
  the words "filter / query" and the raw SQL are **secondary**, for transparency — not the primary
  label a clinician sees.
- Databases (source systems) are **not** a user-facing library surface.

---

## Acceptance criteria

- The left panel is **flat** (no projects): **Datasets** lists the user's Datasets (not databases),
  **Templates** lists table templates, and **Tables** lists the populated audits produced from them.
- A **Dataset** is created by describing a slice in plain language; its filters are grounded to real
  `table.column`s with parameterised SQL and a real read-only `COUNT`, and an ungroundable phrase is
  surfaced as *not available*, never faked.
- The **Dataset detail** shows label + value-chip filters, an **empty add-filter row** (free text →
  grounded chip + SQL clause), a **sanity count**, and a **top-right toggle** to a **read-only raw-SQL
  view**; editing a chip re-derives the SQL and the count deterministically (no LLM call).
- A Dataset **spans multiple databases**, its filters joined on **measured** identity links and
  resolved read-only (cross-database `ATTACH` + identity bridges); the sanity count and scoped
  queries span all databases the filters touch.
- A **table** is row-based (fields = columns, entity = rows) and is created by **selecting a
  template, uploading an Excel, or describing it**, all yielding the same editable structured spec.
- A table **runs with or without a Dataset** — scoped to the slice, or over all entities of its
  grain.
- *(Deferred — not in v1.)* A **dashboard** is built on a table with deterministic indicator
  formulas + agent-chosen visualization; retained design in
  [table-population.md §Dashboard output (deferred)](table-population.md#dashboard-output-deferred).
- **Tables, Datasets, and table templates are shareable; threads are not.** Sharing is **editor-only**
  and managed from each item's ⋯ → Share dialog (a chip per grantee, remove to revoke). A shared
  Dataset/template raises the left-panel library notification and opens with a **keep / remove**
  choice; sharing a populated table cascades **Dataset access-only** (the cohort, not added to the
  recipient's library) (see [Sharing](#sharing--narrow-v1)).
- Table population **pins the template version**; standard templates are **read-only (clone to edit)**;
  Dataset / template management is **role-gated**.
- A table template / produced audit instance with a **submission deadline shows it on the card
  face** (browse-before-open), not only inside the opened table.
- A **produced audit instance is auto-persisted and re-openable** in its populated state (review
  flags + blocked items intact), so a clinician can leave and return to find it further along or complete (the run keeps working in the background).

---

## Appendix — standard table templates to seed

For the product the Templates library seeds **three** standard national clinical-audit tables, each
with its canonical Dataset:

| Table template | National audit |
|---|---|
| Paediatric diabetes | NPDA |
| Emergency laparotomy | NELA |
| Heart failure | National Heart Failure Audit (NICOR/NCAP) |

Each is seeded as a **Dataset + table** pair (its canonical cohort plus its fields). Further standard
templates are added later from the NHSPS source data (Annex A / C / D on england.nhs.uk).

---

## Open questions

*(Also in [open-questions.md](../open-questions.md).)*

- **Refresh of standard templates / Datasets:** automated scrape/ingest vs a manual curation queue,
  and the **approval gate** before a new version goes live.
- **Versioning a Dataset** when its underlying database schema drifts.
- **Editable raw SQL** for a Dataset (read-only in v1) as a power-user fast-follow.
