# Library & Source Management

Read [README.md](./README.md), [1-personas-use-cases.md](./1-personas-use-cases.md), and
[3-architecture.md](./3-architecture.md) first. This document specifies the **left-panel
surface where users view and manage the audits, templates, and databases the agent draws
on** — the user-facing face of the indexed artifacts from
[4-indexing-and-mapping.md](./4-indexing-and-mapping.md).
For stage 1, the library is opened from the **left panel** and rendered in the
**main panel**. Settings is settings-only and is not a library surface.

**This surface configures; it does not extract.** The templates and source models curated
here are exactly what the **index → map → run** pipeline (docs [3](./3-architecture.md)–[5](./5-run-engine.md))
consumes — there is no second extraction path. The "mental model" a card shows is a
**human-readable view of the already-built artifacts** (`spec.json` field spec, `mapping.json`
field mapping, `mapping.json.executable` precompute, `model.json` schema model) that the deterministic
precompute and the run agent use — not a new place where extraction happens. Editing a
**local** item edits those artifacts; viewing a national/regional item is read-only.
The card/list source of truth is the API over seeded `var/` artifacts; there is no static
frontend metadata authority.

---

## What it is

Two navigation destinations in the left panel, siblings to the home screen
([2-product-flows.md](./2-product-flows.md)):

- **(A) Audit templates**
- **(B) Databases**

Both render as a **grid of cards in one shared visual style**; clicking a card opens a
**detail view**. The MVP stays deliberately simple: cards plus one detail view per item, no
nested management UI.

## Who it serves

- The **department head** ([1-personas-use-cases.md](./1-personas-use-cases.md), P2) registers
  and manages their **local** audits here.
- The **auditing clinician** (P1) browses to see what can be run, on what data, and at which
  version, before starting a run — and it is the catalog the agent searches when a user
  **names an audit in the prompt** (Flow A, [5-run-engine.md](./5-run-engine.md)).

The flow: browse → open a card → read the mental model (and, for local items, edit it) →
trust that a run will use exactly that, pinned.

---

## (A) Audit templates

Three populations, all shown as cards:

1. **National audits** — auto-ingested from each audit's published dataset specification
   (per-audit website, mostly versioned PDF/spreadsheet). National is the highest-priority
   trigger ([1-personas-use-cases.md](./1-personas-use-cases.md)).
2. **BPT-derived templates with no linked national audit** — the workbook is synthesised from
   **Annex A** (prices/flags) + **Annex C** (criteria). These are **first-class library
   items**, not an afterthought.
3. **Local audits** — user-created or user-uploaded, and user-managed (the department head's
   templates).

**Organisation — grouped by level: National / Regional / Local.** National and BPT-derived
templates are platform-populated and **read-only**; Local is user-managed. ("Regional" is not
yet defined — see [Open questions](#open-questions) and
[open-questions.md](./open-questions.md).)

**Card face (audit template).** A card is deliberately minimal — **title**, then a one-line
**description**, then (if the audit has one) its **submission deadline** on a third line in
small, light-gray text. Scheme/audit-year, last-pulled date, and provenance are **not** shown
on the card face (the deadline is the only date that matters at browse time); version
tracking is retained in the artifacts (see [Architecture](#architecture--the-version-tracked-library))
but is not surfaced here for v1.

**Card detail view (audit template).** A single-column page (constrained to the shared
reading width, [8-design-system.md](./8-design-system.md)):

- **Top:** the audit/template **title** (large) with a small light-gray back-link
  ("‹ Templates") above it returning to the list; no library top-bar is shown on a detail page.
- **Below the title:** a one-line **description** of what the audit is about.
- **Deadline** (if present): e.g. `deadline 7 July 2026`, small and light-gray.
- Then **three sections**:
  1. **Inclusion criteria** — the audit's **fixed inclusion criteria** (`mapping.json`
     `fixed_criteria`, [4-indexing-and-mapping.md](./4-indexing-and-mapping.md)), rendered as
     editable chips. **This is the one and only place a user adds/removes/edits inclusion
     criteria.** Edits are **saved automatically** (persisted back to `mapping.json` via the
     audit-mapping PATCH endpoint and re-validated). For the standard national audits the
     criteria are auto-extracted, so this section starts pre-populated.
  2. **Databases** — one **chip per database** the audit is bound to (`mapping.json`
     `databases`): the database **name** + a one-sentence, **template-specific** explanation
     of *what this audit draws from it* (e.g. *"demographics and admission dates for the
     cohort join"*). That sentence is written by the **mapping LLM call** — which sees exactly
     which tables/columns it bound — and persisted in `mapping.json` as
     `database_summaries` (a `database_id → sentence` map; schema addition tracked in
     `contracts/`). **Fallback** when no mapping exists yet: the database's generic
     `model.json` `summary` (falling back to the first sentence of `description`).
  3. **Template** — the extracted template rendered as **chips, one per audit field**
     (`spec.json` `fields` joined with `mapping.json` `fields[]`): the field **name** + a
     **one-sentence description whose content depends on the field's kind** (kind lives in
     the mapping, not the spec):
     - **Coded copy-paste (direct) fields** — the description explains the code,
       **derived mechanically from the mapping's code map**, never LLM-written (e.g.
       `1 = Male, 2 = Female` — a code can never be hallucinated).
     - **Interpret fields** — the description explains what the field *means* clinically
       (`spec.json` `fields[].notes`), demonstrating the agent understands the field's intent.
     - **Uncoded direct fields** — `fields[].notes` as a plain one-liner.
     - **Fallback** when no mapping exists yet (no database bound): **name-only chips** with
       `notes` where present, plus a subtle hint that pairing a database completes this view.

The earlier two-pane "mental model | real template" view is retired in favour of this
three-section layout.

---

## (B) Databases

Selecting **Databases** shows cards in the **same visual style**, one per connected source
system (EHR structured fields, labs, radiology, etc.; per [4.4 of the platform vision and
the MVP's database list]).

**Card detail view (database):**

- **Top:** the database / source-system name.
- **Below:** a short description.
- **Main area — the database model the agent uses** (`model.json`): entities, key fields,
  the **patient / spell identifiers and join keys** (NHS number + spell date; local hospital
  number + episode ID), and what kind of value each table/column holds (including coded
  columns; [4-indexing-and-mapping.md](./4-indexing-and-mapping.md)). This is the
  **source-side analogue** of the template's mental model.

---

## Architecture — the version-tracked library

- **Each library item is an immutable, dated version.** Re-ingesting a new audit year creates
  a **new version**; it never mutates the old one in place.
- **A run pins the template version in force at run time.** Once a run starts it is bound to
  that exact version, so a mid-flight roll-over of the source schema cannot silently change
  the basis of a job already in progress. The pinned version is recorded in the run log
  ([7-auth-and-audit-log.md](./7-auth-and-audit-log.md)).
- The indexed artifacts behind a card are produced by the indexing/mapping phases
  ([4-indexing-and-mapping.md](./4-indexing-and-mapping.md)); this surface is their
  user-facing view.

> **MVP scope vs later.** The library *surface* — browsing audits and databases as cards,
> reading their mental models, and **local** create/upload/manage — is MVP-aligned and sits
> directly on the existing indexing. The **auto-ingestion of national audit schemas**, the
> **BPT-template synthesis**, and **staleness detection** are heavier; treat them as a
> fast-follow if they don't fit the 10-day window, with manual curation as the interim
> (see [Open questions](#open-questions)).

---

## Traceability

Consistent with the per-cell traceability in [6-traceability-evidence.md](./6-traceability-evidence.md)
and the run log in [7-auth-and-audit-log.md](./7-auth-and-audit-log.md):

- Every library item carries **source URL + scheme/audit year + pull date**.
- The mental model shows, **per field, where each value is implemented or extracted from**.
- Any output traces back to the **exact template version** used (recorded in the run log
  alongside the prompt version) — closing the loop from a submitted value to the dated schema
  that defined it.

## Auth & IG

Per [7-auth-and-audit-log.md](./7-auth-and-audit-log.md):

- National and BPT-derived items are **system-managed and read-only**. A user may **clone**
  one into a Local audit to vary it, but **cannot edit the national source of truth**.
- Creating or editing Local audits, and adding or altering database connections or models, is
  **gated by role/permission** (IG / Caldicott).

---

## Reference data — national audits & BPTs the library should hold (2026/27 NHSPS)

The national-level population includes both national audits and BPT-derived templates. The
**clinical-process-driven** BPTs (those needing per-patient evidence) and their linked
national audit, where one exists:

| Clinical-process BPT | Linked national audit |
|---|---|
| Acute stroke care | SSNAP |
| Adult asthma (19+) | NACAP (asthma) |
| COPD | NACAP (COPD) |
| Diabetic ketoacidosis / hypoglycaemia | None — synthesise from Annex C *(verify)* |
| Emergency laparotomy | NELA |
| Fragility hip & femur fracture | NHFD (grouper flag BP01) |
| Heart failure | National Heart Failure Audit (NICOR/NCAP) |
| NSTEMI | MINAP (NICOR/NCAP) |
| Early inflammatory arthritis | NEIAA |
| Major trauma | TARN |
| Paediatric diabetes | NPDA |
| Paediatric epilepsy | Epilepsy12 |
| Parkinson's disease | UK Parkinson's Audit *(periodic, not continuous; verify)* |
| Post-MI (STEMI) cardiac rehab | NACR |

**Excluded from the audit-template build** — coding / grouper / accreditation / registry-driven
BPTs, which are **not per-patient evidence templates**: Right Procedure Right Place, Day case,
Endoscopy (JAG accreditation), Pleural effusion, Primary hip & knee (NJR + PROMs), Rapid
colorectal, Spinal surgery, 10YHP-RTT BPTs, Adult renal dialysis. They are settled by
coding/grouper, accreditation, or a registry, so there is no per-patient template to populate.

**Source of truth:** NHSPS **Annex A** (prices/flags), **Annex C** (criteria), **Annex D**
(price calc + SSEM) — all on england.nhs.uk, refreshed yearly.

---

## Design

Per [8-design-system.md](./8-design-system.md):

- **Landing & navigation.** Templates and Databases are reached from the left-panel nav.
  Each library page shows **just its title** ("Templates" / "Databases") — no "Library" top
  bar, subtitle, or section toggle. The page content sits in the **shared reading-width
  column** (`--content-width`), not full-bleed. Selecting **Templates** or **Databases**
  while an audit is open de-focuses the open audit so only the active nav item is highlighted
  (the audit row's highlight is gated on the audit actually being shown).
- One shared **card** component across both destinations; one **detail-view** pattern. Card
  text reuses the agent-activity title/description hierarchy. The detail view is a
  **single-column, three-section** layout (inclusion criteria | databases | template) for
  audits; database detail is a single **main area** (the database model).
- Template cards show **title, description, and (if any) the submission deadline** only — no
  scheme/version/last-pulled metadata on the card face.
- The **"Add audit template" / "Add database"** upload cards are **hidden for now** (kept in
  code, commented out, to be re-enabled later).
- Template cards are **grouped by level** (National / Regional / Local).
- Read-only (national / BPT-derived) vs editable (local) status is visually distinct, with
  **clone** the affordance offered on read-only items.

---

## Acceptance criteria

- The library lists the audits and databases the platform holds (version metadata is retained
  in the artifacts, not shown on the card face).
- BPT-derived templates with no linked national audit appear as cards (template synthesised
  from Annex A + Annex C) with the same versioning metadata.
- Audit cards are **grouped by level**: National / Regional / Local.
- **Audit & database cards** show **title, description, and (audits only) the submission
  deadline** — no scheme/version/last-pulled on the card face. The **Add** upload cards are
  hidden.
- Each library page shows **only its title** ("Templates"/"Databases") — no "Library" bar,
  subtitle, or toggle — and lays its content out in the **shared reading-width column**.
- Opening **Templates**/**Databases** while an audit is open leaves **only** the active nav
  item highlighted (the open-audit row de-focuses).
- **Audit card detail** is a single-column, three-section page: **title** + a small
  "‹ Templates" back-link (no top bar), one-line **description**, the **deadline** (if any),
  then **Inclusion criteria** (editable `fixed_criteria` chips), **Databases** (one chip per
  database: name + the template-specific `database_summaries` sentence, generic `model.json`
  `summary` as fallback), and **Template** (one chip per field: name + a one-sentence
  description — mechanical code explanation for coded direct fields, clinical meaning from
  `notes` for interpret fields; name-only chips with a pairing hint when no mapping exists).
- **Inclusion criteria are edited only in the audit detail page** and are **saved
  automatically** to `mapping.json` (`fixed_criteria`), re-validated against the schema.
- **Database card detail** shows name (top), description (below), and the **database model**
  (`model.json`: entities, key fields, identifiers/join keys, coded columns).
- Authorised users can **create/edit Local audits**; national and BPT-derived items are
  **read-only and can only be cloned**, not edited.
- A run records the **exact template version** it used, pinned for the run's duration
  ([7-auth-and-audit-log.md](./7-auth-and-audit-log.md)).

## Stage-1 readiness verification

Run this from repo root to execute the release-gating checks in a fixed order:

```bash
python3 -m scripts.verify_library_stage1
```

This single entrypoint verifies:
- empty-var list behavior and partial-drift detail failures,
- deterministic missing/malformed detail errors,
- list/detail contract + metadata parity checks,
- seeded readiness (`make seed` + list/detail smoke),
- frontend build success.

## Open questions

*(Also recorded in [open-questions.md](./open-questions.md).)*

- **Refresh mechanism:** automated scrape/ingest vs. a manual curation queue, and what
  **approval gate** sits before a new audit-year version goes live.
- **"Regional" level:** what it means (ICB-shared templates?) and whether it is MVP scope or
  National/Local only for v1.
- **Fork semantics:** how a Local audit cloned from a national template **shows its divergence**
  from the source, and whether it **re-bases** when the national version updates.
- **BPT pricing placement:** where base price, BPT price, conditional top-up, MFF, and SSEM
  attach — to the template card, or a separate pricing-reference item the template links to.
- **Verify the two flagged measurement vehicles** (DKA / hypoglycaemia; Parkinson's) against
  the full Annex C text before building their templates.
