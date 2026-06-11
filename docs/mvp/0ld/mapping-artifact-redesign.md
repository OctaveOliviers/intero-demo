# Design decision — the indexing & mapping models become structured JSON

> **Status:** PROPOSAL — fold-in of the A6 design discussion (2026-06-05). **Refactors
> already-merged work:** A1 (indexing), A2 (mapping), A3 (populate) and **redefines A6**; ripples
> to A7/B6/B7/D6/D9, the agent plane, the contracts, and the seed fixtures. Read this before
> refactoring those tasks. **Supersedes:** PR #155 (A6 as a markdown section in `mapping.md`) and
> the old per-DB `filters.json` catalog (PR #152).

This document replaces the three Phase-1/Phase-2 artifacts — `audit.md`, `database.md`,
`mapping.md` — with **structured JSON models**, and specifies how the audit's **inclusion-criteria**
surface is computed across them. **A documented JSON Schema for each model is the first
deliverable** (task S0, §8) — everything downstream binds to it.

---

## 1. The problem

Three things converged:

1. **The filter surface and the mapping are the same linkage.** `mapping.md` already records, per
   field, the real `database → table.column` and the join paths filters hang off. A separate
   filter catalog is a *projection* of that linkage — holding both is two sources of truth.
2. **The consumers are code + LLM, not humans reading prose.** The populate builder, the cohort
   resolver (B6), the library editor (D9), the input chips, and the executor want **structured**
   data — types, coded sets, ranges, identity keys. Parsing that out of markdown tables (and the
   fragile YAML frontmatter `AGENTS.md` warns about) is the error-prone round-trip we keep paying.
3. **The audit specification describes the wrong thing.** Today `audit.md` is ~80% an Excel-grid
   dump (dimensions, ranges, "500 empty rows", merged ranges). That is noise. What matters — and
   what national datasets publish (§4, NPDA) — is the **field specification**: per field its
   meaning, permitted values, guidance, and the clinical standard behind it.

> **Terminology.** The audit-side artifact is renamed throughout — *"audit model" → "audit
> specification"*. It captures the audit's **requirements** (what each field means and expects, the
> inclusion criteria the run must obey), not a "model" of an Excel grid. The database-side artifact
> stays the **database model** (a description of what's there). The mapping is the **mapping**.

## 2. The governing principle

> **Deterministic structured skeleton + LLM-supplied semantics, stored as JSON, with prose as
> string fields and coded value sets as maps. The LLM is fed a clean rendered view, never raw
> braces.**

- **The skeleton is extracted mechanically** (openpyxl / SQLite introspection / read-only value
  profiling) and flows through as **data** — cell refs, ranges, types, identity keys, allowed
  values. It never passes through an LLM to be re-typed.
- **The LLM only supplies judgment** — field meanings, column descriptions, field→column bindings,
  which columns are relevant filters. These land in specific fields, not the whole document.
- **Storage format ≠ prompt format.** We *store* JSON (verifiable, code-addressable, coded sets as
  real maps). When we feed a model to an LLM we **render a clean view** (e.g.
  `{ "1":"Male","2":"Female" }` → `"1 = Male, 2 = Female"`). The schemas are **shallow** (a flat
  list of records, prose as plain strings), so brackets are a non-issue — but we render anyway so
  the prompt is clean.
- **Coded sets must be maps.** `1 = Male` is a `code → meaning` mapping the populate step uses to
  translate codes and the resolver uses to enumerate allowed values; it cannot live as prose.

This one principle produces all three models. One nuance on regenerable-vs-state is in §6.

---

## 3. The three models

```
agent/audits/<audit_id>/
  audit.json      # the field spec + the audit's inclusion criteria (indexing) — was audit.md
  audit.xlsx
  mapping.json    # the audit↔database bindings (mapping)                       — was mapping.md
  populate.json   # the populate spec (A3/A7), reads mapping.json
agent/databases/<database_id>/
  database.json   # the schema model + filterable surface (indexing)            — was database.md
  database.sqlite
```

### 3.1 `audit.json` — the audit specification (A1.1)

The audit's **requirements**: per-field specification + the audit's inclusion criteria.

**Purpose:** capture the audit's *documented definition of every field* (not the grid) **plus** the
audit's **inclusion criteria** (the dimensions it can be filtered on, and their default values).
Both are **database-agnostic** — `audit.json` is built before any database is chosen.

> **`kind` (direct/interpret) is NOT here.** Whether a field is copied straight from a column, copied
> *with code translation*, or *interpreted from free-text notes* depends on **what the database
> actually holds** — which we don't know at indexing. That decision is made at **mapping** (§3.3).
> `audit.json` says only what the field *means* and *expects*.

```jsonc
{
  "schema_version": "1",
  "audit": "npda",
  "title": "National Paediatric Diabetes Audit (NPDA) Core Dataset",
  "version": "2026/27",
  "description": "Core NPDA dataset for visits from 1 Apr 2026; items drawn from NICE NG18 + Best Practice Tariff.",
  "grain": "one row per patient visit/appointment",
  "source": { "template": "audit.xlsx", "spec_document": "NPDA Dataset 2026 (RCPCH)" },

  "sections": [
    { "id": "patient-details", "name": "Patient Details / Information" },
    { "id": "routine-measurements", "name": "Routine Measurements" },
    { "id": "annual-review-health-checks", "name": "Annual Review – Health Checks" }
  ],

  "fields": [
    { "number": 4, "section": "patient-details", "cell": "D",
      "name": "Sex assigned at birth", "type": "category",
      "permitted_values": { "1": "Male", "2": "Female", "3": "Not specified", "99": "Unknown" },
      "notes": "Sex assigned at birth. 'Not Specified' means indeterminate; 'Unknown' means not recorded. Collected to analyse the effect of sex on outcomes and to interpret height/weight/BMI/BP." },

    { "number": 16, "section": "routine-measurements", "cell": "...",
      "name": "Patient Height (cm)", "type": "number", "unit": "cm", "format": "999.9",
      "notes": "At least one height/weight measurement during the audit year; plot on a growth chart to check for normal growth. [NG18: 1.2.46]" },

    { "number": 36, "section": "annual-review-health-checks", "cell": "...",
      "name": "Albuminuria Stage", "type": "category",
      "permitted_values": { "1": "Normoalbuminuria", "2": "Microalbuminuria", "3": "Macroalbuminuria", "99": "Unknown" },
      "notes": "Submit your interpretation of the urinary albumin level based on local laboratory reference ranges. Mandatory if a level is submitted. (Interpretive — derived from a measurement.) [NG18: 1.2.119]" }
  ],

  // The audit's inclusion criteria — db-agnostic CONCEPTS + DEFAULT values.
  // Empty `default` until set (library edit or first run, §6). At upload A1 suggests only a few
  // (~5) likely ones from the description; the rest are added on demand via "add filter" (§5).
  "inclusion_criteria": [
    { "id": "gestation_weeks", "label": "Gestation (weeks)", "type": "number",
      "suggested": true,  "default": null },
    { "id": "delivery",        "label": "Mode of delivery",  "type": "category",
      "suggested": true,  "default": null }
  ]
}
```

- **`notes` is the one prose field** — the operational guidance, the rationale, *and* any standard
  citation inline (`[NG18: 1.2.46]`). NPDA's separate "Notes" / "Justification" / standard columns
  were redundant; one `notes` carries it all.
- **`type` / `unit` / `format` / `permitted_values`** are the structured grounding mapping + the
  filter surface reuse. `permitted_values` is the audit's **canonical encoding** for the field — the
  mapping's `code` (§3.3) operationalises it against the real database.
- **`inclusion_criteria`** are the audit's own filter dimensions + defaults — see §5/§6.
- **Renders cleanly** to: *"Field 4 — Sex assigned at birth (category). Permitted: 1=Male, …. Notes:
  … Ref: —"*.

**Local templates use the exact same schema.** If a local `.xlsx` has no spec sheet, the unknown
nodes (notes, permitted_values) are simply left empty — the **clinical lead fills them in
the library** (D9). Same shape, partial content.

**Indexing implication (A1).** For a **national** audit this content lives in the **dataset
documentation** (the published spec), not the empty `.xlsx`. So national indexing should ingest the
spec document. Full national auto-ingestion stays **P1-deferred**, but the schema holds it now.

### 3.2 `database.json` — the database model + filterable surface (A1.1)

**Purpose:** the schema model **plus** the per-column **filterable surface** — "what can be filtered
in this database." A property of the *database*, identical across audits, computed **once at
database indexing** (the salvaged PR #152 read-only profiler, folded into the model).

```jsonc
{
  "schema_version": "1",
  "database": "cord-ph",
  "title": "Cord pH EMR",
  "description": "Local EMR fixture. Births in `cord_ph_birth_records` (one row per baby); NICU course in `nicu_admissions`; demographics in `patients`; events in `encounters`; free-text in `clinical_notes`.",

  "tables": [
    { "name": "cord_ph_birth_records", "row_count": 10,
      "description": "One row per baby / birth record — the audit's primary entity.",
      "columns": [
        { "name": "patient_code", "type": "text", "description": "Per-patient identifier for the birth record.",
          "filterable": false, "reason": "identifier" },
        { "name": "delivery", "type": "text", "description": "Mode of delivery.",
          "filterable": true, "filter_type": "category",
          "values": ["Spontaneous vaginal","Emergency caesarean","Forceps","Vacuum"] },
        { "name": "gestation_weeks", "type": "text", "description": "Completed weeks of gestation at birth.",
          "filterable": true, "filter_type": "number", "range": { "min": 35, "max": 41 } }
      ] },
    { "name": "clinical_notes", "row_count": 10, "description": "Free-text clinical notes.",
      "columns": [
        { "name": "text", "type": "text", "description": "Free-text clinical note.",
          "filterable": false, "reason": "free-text" } ] }
  ]
}
```

- **`filterable` is type-based and audit-independent** — a real `category` (+ bounded `values`),
  `date`/`number` (+ `range`), or **not-filterable** with a `reason` (`identifier`/`free-text`/
  `reference`). *Meaningful only:* never min/max an ID, never enumerate an identifier "category",
  never list a free-text column. Coded DB columns also carry `codes` (`code → meaning`).
- **`values`/`range` are the choice domain** (what a filter *could* be set to), a **hint** not
  authority — re-profile on demand; the authoritative cohort number is always the live `COUNT` (§5).
- **The library** (D6) surfaces each column's `description` + `values` directly.

### 3.3 `mapping.json` — the audit↔database bindings (A2.1 + A6.1)

**Purpose:** bind one audit to its database(s) — the single source of truth for *where every audit
concept lives* and *how each value is obtained*. This is where **`kind` is decided**, because only
here do we know what the database holds.

```jsonc
{
  "schema_version": "1",
  "audit": "cord-ph",
  "databases": ["cord-ph"],
  "description": "Cord pH audit bound to the cord-ph EMR. Births in cord_ph_birth_records; NICU in nicu_admissions; dates via encounters; demographics via patients.",

  // Cohort identity + cross-DB join keys, scoped to THIS audit (no global registry).
  "identity": {
    "anchor": "cord-ph -> cord_ph_birth_records.patient_code",
    "grain": "one patient per birth record",
    "keys": ["cord-ph -> cord_ph_birth_records.patient_code"],
    "patient_grain_rule": "every criterion = this patient has >=1 matching row (EXISTS/IN over the anchor), never a count-inflating join"
  },

  "regions": [
    { "id": "ALL", "sheet": "ALL", "kind": "row_per_entity", "data_range": "A2:AQ500",
      "row_id": { "cell": "A", "header": "Patient code" } }
  ],

  // THE populate mapping — every audit field → its DB source + HOW the value is obtained.
  // `kind` is decided HERE (DB now known): "direct" (copy from a column) or "interpret" (no
  // structured column holds it; read evidence and derive it).
  // `code` (OPTIONAL, ANY field) — the code→meaning encoding the cell's value MUST use. If present
  // the value must be one of these codes: for a `direct` field the executor maps the source value
  // into it; for an `interpret` field the agent must output one of the codes (not free text). If
  // absent, the value is filled as-is / however the agent sees fit. (It operationalises the audit
  // field's `permitted_values` against this database.)
  "fields": [
    { "region": "ALL", "cell": "T", "header": "Delivery", "kind": "direct",
      "sources": ["cord-ph -> cord_ph_birth_records.delivery"] },        // no code → copied as stored

    { "region": "ALL", "cell": "D", "header": "Sex assigned at birth", "kind": "direct",
      "sources": ["cord-ph -> patients.gender"],
      "code": { "1": "Male", "2": "Female", "3": "Not specified", "99": "Unknown" } },
      // value must use this code; the executor maps the source (M/F) onto the matching code

    { "region": "ALL", "cell": "...", "header": "Albuminuria Stage", "kind": "interpret",
      "sources": ["cord-ph -> observations.value"],
      "how_to_combine": "read the urinary albumin level and decide the stage per local ranges",
      "code": { "1": "Normoalbuminuria", "2": "Microalbuminuria", "3": "Macroalbuminuria", "99": "Unknown" } }
      // the agent must output one of these codes, not free text
  ],

  // Bindings of the audit's inclusion criteria (audit.json) to real DB columns, + any DB-only
  // dimensions reachable by join. This is the search space "add filter" looks through and B6's
  // grounding — NOT a list shown wholesale to the user.
  "criteria_bindings": [
    { "criterion_id": "delivery", "label": "Mode of delivery",
      "source": "cord-ph -> cord_ph_birth_records.delivery", "type": "category",
      "join_path": "direct column on the anchor row (no join)",
      "grain_rule": "the patient's birth record has this delivery value",
      "from": "audit_field+db_column" },

    { "criterion_id": "patient_birthdate", "label": "Patient age (date of birth)",
      "source": "cord-ph -> patients.birthdate", "type": "date",
      "join_path": "cord_ph_birth_records.baby_patient -> patients.id",
      "grain_rule": "the baby has a birthdate in the implied range (older-than-5y -> birthdate <= date(:as_of,'-5 years'))",
      "from": "db_column" }                            // not an audit field; a DB-only filter
  ],

  // Audit criteria the DB can satisfy only from free-text — deferred (P1), never invented.
  "not_expressible": [
    { "criterion_id": "clinical_concern", "label": "Documented clinical concern",
      "source": "cord-ph -> clinical_notes.text", "reason": "only in free-text; no structured column" }
  ]
}
```

- **`identity` is the only cross-database resolution, and it is per-audit** — no global "which DB
  holds what" registry. The audit knows it draws births from DB-A and labs from DB-B and how they
  join, recorded here when it binds its databases.
- **`criteria_bindings` references `audit.json`'s `inclusion_criteria` by `criterion_id`** and links
  each to a real column (with `database.json`'s `type`/`values` as the source of truth — referenced,
  not copied; the renderer joins them). It also carries **DB-only** dimensions (`from: db_column`)
  reachable by join, so "add filter" has somewhere to search.

---

## 4. Why JSON, anchored to a real national dataset (NPDA)

The audit-model shape is taken from the **NPDA Core Dataset 2026** (RCPCH). Every one of its 59
items is a 4-column record — **name · permitted values · notes · justification/standard** — in 7
sections:

| Data item | Permitted Values | Notes | Justification / Standard |
| --- | --- | --- | --- |
| Sex assigned at birth | `1=Male, 2=Female, 3=Not specified, 99=Unknown` | "'Not Specified' means indeterminate…" | "To allow analysis of the effect of sex on outcomes…" |
| Patient Height (cm) | `Format: 999.9 cm` | "At least one measurement during the audit year" | "NG18: 1.2.46 … measure height and weight" |
| Albuminuria Stage | `1=Normo, 2=Micro, 3=Macro, 99=Unknown` | "Submit *your interpretation* of the urinary albumin level…" | "NG18: 1.2.119 …" |

This is exactly "structured skeleton + prose strings + coded sets as maps", and it is the
information the LLM needs to map, populate, and interpret — none of which is in the empty grid. We
collapse NPDA's two prose columns (plus the standard citation, inline) into one `notes` (§3.1).
Coded values **must** be machine-readable and the content is verifiable → **JSON, rendered to a
clean view for the LLM.** Same reasoning for `database.json` and `mapping.json`.

---

## 5. How the inclusion-criteria filters are computed

The filter surface is built across **two levels**, and *which* filters are relevant is, **for now,
left to the LLM** — drawing on **both** the audit's fields and the databases' filterable columns.

**Level 1 — the database proposes candidates (deterministic, at DB indexing).** `database.json`
profiles every column read-only and marks the filterable ones with their type + choice domain,
dropping identifiers / free-text / references. "What *can* be filtered here", reusable, no LLM.

**Level 2 — the audit selects + links the relevant ones (LLM, at mapping).** A6 builds
`criteria_bindings` by deciding which dimensions are relevant inclusion criteria for this audit and
linking each to the cohort identity (join path + grain). Drawn from **two sources** — the audit's
own fields (`audit.json`) and the databases' filterable columns (`database.json`) — with `from`
provenance on each. **We do not hard-code the relevance rule; the LLM proposes, D9 is the human
review net.** Free-text-only concepts go to `not_expressible`.

**Keep the upload-time suggestion list short.** When a template is first set up, surface only the
**~5 most likely** inclusion criteria (empty values) so the user isn't buried. Everything else is
**add-on-demand**: the user clicks **add filter**, describes what they want, and *that* is when we
search the filterable surface (`criteria_bindings` + `database.json`) to resolve and add it. (There
is no monolithic "menu" shown to the user — the bindings are the *backing* search space, not a UI
dump. "Menu" in earlier drafts meant this backing surface.)

**Values are the choice domain, never an invented default** — what a filter *could* be, not what it
is set to. The LLM never picks a default value (§6).

**Run time (B6) — match, don't author.** One LLM call matches the user's free-text onto a bound
criterion + value ("caesarean" → the real `delivery` value; "older than 5 years" →
`patients.birthdate <= date(:as_of,'-5 years')`). The **authoritative cohort number** is a live
read-only `COUNT(DISTINCT identity)`. Flexibility vs reliability: B6 may also propose a condition
over a column **outside the bound set but within the audit's tables**, gated by the **existing
read-only validator** (`_sql_validate.validate_sql` + `PRAGMA query_only`) — safety from the guard,
not a closed list. Unresolved/ambiguous criteria are surfaced, never dropped.

---

## 6. Defaults live in `audit.json`; the field spec regenerates around them

A default inclusion-criterion value is **a parameter of the audit** — so it belongs in `audit.json`
(`inclusion_criteria[].default`), not a run record or a sidecar. The lifecycle:

- **At upload:** A1 creates `inclusion_criteria` with the ~5 suggested dimensions and
  **`default: null`** (unknown — we don't yet know what to filter on). Nothing is pre-guessed.
- **First set** by one of two triggers: the user **edits/preselects** criteria in the library (D9),
  or **runs the audit for the first time** with particular filters → those become the stored
  `default`s.
- **Subsequent runs:** apply the stored `default`s **unless** the user's request specifies criteria,
  in which case the **request wins** for that run (and may update the defaults if the user saves).
- **The canonical default cohort is never invented by the LLM** — for a fresh template it simply
  doesn't exist (all `default: null`); it is *learned* (above) or sourced from the national standard
  for an auto-ingested audit (future).
- **Defaults are stored in the audit's own encoding** (its `permitted_values`), so they are
  **database-independent** — the per-field `code` in `mapping.json` (§3.3) bridges to whatever the
  bound database uses. Rebinding the audit to a different database needs no change to the defaults.

**Regenerable vs. state — the one nuance.** `audit.json`'s **field spec** is regenerable (re-index
rebuilds it from the template/spec). Its **user-set state** — the `default`s, and any library-added
`notes`/`permitted_values` for a local template — is **preserved across re-index** (a
small merge by `field.number` / `criterion.id`, never blown away). So `audit.json` is the audit's
canonical record: a regenerated spec wrapped around durable user state. (`database.json` and
`mapping.json` remain purely regenerable.)

---

## 7. The risk that actually decides success

Not the file format — **binding/relevance quality**. The bet is that an LLM can correctly map a
59-item national template against a cryptic hospital schema, pick the right `kind` per field, and
choose sensible filters. If the mapping is wrong, populate *and* filters are silently wrong. So the
effort goes to: **validation + evals** (extend E2 to mapping/binding correctness; cross-check
`audit.json` coded sets against `database.json` codes); **the D9 review net** (a human confirms
bindings, `kind`, relevance, defaults); and **re-verification against the live schema** (stale
precompute is a defect — doc 4). The structured models + a documented schema (S0) make these checks
mechanical.

---

## 8. Task re-cut (what changes)

| Task | Change |
| --- | --- |
| **S0** schema (NEW, do first) | Author a **documented JSON Schema** for each model — `audit.json`, `database.json`, `mapping.json` — specifying every field: name, type, required/optional, **what it means and why it's needed**, label/value conventions, and coded-set shape. Lives in `docs/mvp/contracts/`. Everything below validates against it. |
| **A1.1** indexing | Emit **`audit.json`** (field spec, NO `kind`; single `notes` with citation inline; `inclusion_criteria` with ~5 suggested, `default: null`) and **`database.json`** (schema + filterable surface; move the read-only profiler here). Preserve user-set state on re-index (§6). Ingest the spec doc for national audits (schema-shaped now). |
| **A2.1** mapping | Emit **`mapping.json`** — `description` + `identity` + `regions` + `fields[]`. **Decide `kind` here** (direct / interpret) and attach an optional per-field **`code`** (any field) now that the DB is known. |
| **A6.1** criteria @ mapping | Build **`criteria_bindings`** + `not_expressible` (§3.3, §5): select audit-relevant dimensions from `audit.json` fields **and** `database.json` columns, link to identity. References `database.json` (no re-profiling). No defaults (those are in `audit.json`). |
| **A3.1 / A7** populate | Read `mapping.json`; cohort block from `identity` + join paths; encode each cell per the field's `code` (direct → translate source; interpret → constrain agent output). |
| **B6** resolution | Match user text → a bound criterion + value; short suggestion list + add-filter search + validator-gated escape; live `COUNT` authority (§5). Reads/writes `audit.json` defaults (§6). |
| **B7** executor wiring | Unchanged intent; reads the new artifacts; cohort compose over `identity`. |
| **D6 / D9** library | Render the JSON models (description + per-field values + `notes`). **D9** edits criteria + sets `default`s **in `audit.json`**, and lets a clinical lead fill `notes`/`permitted_values` for local templates. |
| **Agent plane** | Prompt assembly reads JSON via **accessors** and **renders clean views**. Update **AGENTS.md** ("works only from the Field Mapping markdown" → "from the audit map JSON, rendered"). |
| **Contracts / seed / E1 / E2** | Freeze schemas (S0); migrate the cord-pH fixtures to JSON + add an **NPDA worked example**; extend golden + eval to the new artifacts, `kind` correctness, and binding correctness. |

**Migration:** do **S0 first**, then A1.1 + A2.1 + A6.1 together (shared models) — one migration. The
profiler salvaged in PR #155's `core/mapping/build_criteria.py` moves to A1; PR #155 is closed.

---

## 9. Open questions

1. **Suggestion breadth vs the escape hatch (§5).** Confirmed direction: short (~5) upload-time
   suggestions + add-filter search + B6's validator-gated escape. (Was: how fat should the bound set
   be — resolved toward *lean suggestions, broad search space*.)
2. **`code` shape.** `code` is a `code → meaning` map on a mapping field (§3.3). Open: for a
   `direct` field where the DB stores values that don't cleanly match by meaning, do we need an
   explicit source→code map, or is meaning-matching (via `database.json` codes) enough? Lean:
   meaning-match first, explicit source map only when it fails.
