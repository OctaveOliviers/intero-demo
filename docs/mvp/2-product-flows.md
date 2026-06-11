# Product Flows

Read [README.md](./README.md), [1-personas-use-cases.md](./1-personas-use-cases.md),
and [3-architecture.md](./3-architecture.md) first. This document specifies the
**user-facing behaviour** of the MVP: the two entry flows, the live run experience,
the filter interaction, and the state coverage every screen must handle.

The hero of the product is **a workbook that fills itself live while staying fully
traceable**, with the risky values flagged for a human. Everything below serves that.

---

## Flow A — Run a known template

The primary motion. Covers national, regional, and departmental audits (the first
three triggers in doc 1). A template already exists; the user populates it.

1. **Start.** The user lands on the prompt input box. There are two ways to pick what to
   populate:
   - **Describe it in the prompt.** The user just types — e.g. "run the cord pH audit" or
     "run last quarter's stroke audit". The agent **identifies which existing template they
     mean** and surfaces it as the output-specification chip **for the user to confirm before
     running** (the run never auto-starts on an identified template). No file picking needed.
   - **Use the `+` in the input box.** Opens a small menu: **Upload a new template**
     (`.xlsx`, starts indexing) or **Select an existing template** (a dropdown of
     already-indexed templates, browsed and managed in the **Library** —
     [9-library-and-sources.md](./9-library-and-sources.md)).

   (If the user's prompt describes data that **no existing template covers**, that is
   [Flow B](#flow-b--ad-hoc-request-describe-the-data): the agent builds a new
   template-to-be instead of identifying one. The agent decides which case it is.)
2. **Indexing and the output-spec chip.** The moment a template is attached (via `+`) or
   **identified by the agent from the prompt**, the **agent suggestion box opens with that
   template as the output-specification chip**.
   - For a **newly uploaded** template, **indexing starts immediately in the background** —
     working out what the audit is about, what information it needs, and which databases
     are relevant. The chip shows an **"indexing…"** badge until ready; everything stays
     non-blocking and the user can keep typing. *(core/indexing; TODO-0060.)*
   - An **existing** template is already indexed (Ready).
3. **Agent suggests criteria + databases (additive); the user configures.** This is the
   critical setup step (see [Setting up the audit](#setting-up-the-audit-the-critical-step)
   below). When indexing completes, the agent **populates suggested inclusion/exclusion
   filters and pre-selects the relevant database(s)** from what the template needs. Any
   filters the user already set while indexing was running are **kept** — the agent's
   suggestions **complement** them, never overwrite. The user edits freely.
4. **Run.** The view switches to the run screen.
5. **Agent works, streamed.** The user's request (audit name + filters) shows at the
   top. Below it, an **activity feed** streams the agent's reasoning and tool calls
   (see [The run experience](#the-run-experience)).
6. **The workbook chip appears fast.** As soon as the workbook is created (structured
   but empty), a clickable file chip appears — **not** at the end of the run. The user
   can open it and watch it fill.
7. **Live population.** Cells fill progressively. Each filled cell becomes clickable
   for traceability the moment it has a value and metadata.
8. **Verify & export.** The user inspects values (especially flagged interpretive
   ones — see the [safety gate](#the-interpretive-safety-gate)), then exports the
   populated workbook.

**Acceptance (Flow A):**
- A user can start by **naming the audit in the prompt** (no file picking); the agent
  identifies the matching existing template and shows it as the output-spec chip.
- A new template can be uploaded and reaches `Ready` without freezing the UI.
- A run can target ≥2 databases in one go.
- The workbook chip is available while the run is still in progress.
- Every populated cell is traceable (see [6-traceability-evidence.md](./6-traceability-evidence.md)).
- Agent-suggested filters and databases **complement, never overwrite** anything the user
  set while the template was indexing.
- The agent **never fabricates** a value; missing/ambiguous data is flagged, not imputed.

### Setting up the audit: the critical step

Choosing the **inclusion/exclusion criteria and databases is the most important setup
step**, and must be specified, not assumed. These criteria (reporting period, cohort,
sites, clinical inclusion/exclusion rules) define **which records the audit covers** and
are the binding constraints the agent must obey precisely.

They are populated three ways, which **coexist and accumulate**:
1. **Agent-suggested** from the indexed template (what this audit needs to be valid).
2. **Extracted live** from free-text the user types (see [Filter interaction](#filter-interaction)).
3. **Manually added** via add-filter.

Rules:
- Agent suggestions **never overwrite** the user's choices. If the user set a filter while
  the template was indexing, it stays; suggestions only fill gaps and propose additions.
- The user can edit or remove any criterion, and adjust the suggested databases.
- **Database selection** is agent-suggested (which databases the template needs) and then
  user-confirmable — pre-selected, never silently locked, multi-select. *(TODO-0050.)*
- Whatever criteria are present at run time are enforced in the queries and validated
  before population. *(TODO-0003.)*

---

## Flow B — Ad-hoc request (describe the data)

> **v1 scope (2026-06-05, task P1): DEFERRED to the 100-day vision.** v1 is
> **template-anchored** — every run resolves to a **pre-existing** template (uploaded now or
> already in the library; a prompt may *identify* an existing one). The path below — where no
> template exists and Intero **synthesises** one from free text — is **out of v1** and moves to
> [vision-100-days.md](./vision-100-days.md). A request that matches no template **stops and
> asks** the user to upload or pick one; it never synthesises (task D10). The rest of this
> section is retained for the vision.

The fourth trigger, lowest MVP priority (doc 1). No template exists; the user describes
what they want, and Intero **builds the template, then populates it**.

1. The user describes the data in free text (often a pasted clinical email).
2. **Intero shows what it will build, before building it.** As it reads the request, the
   **output-specification chip** appears — but it does **not** reference an existing
   template. The chip is a **one-or-two-word name** for the template-to-be, signalling
   "we understand what you're asking for". **On hover**, the chip reveals the **fields /
   columns** Intero would extract to satisfy the request. Nothing is built yet.
3. **Confirm, then build.** Only when the user confirms (presses **Enter**) does Intero
   build the workbook structure and start the map → populate pipeline. Showing intent
   first (chip + hover) lets the user check it is exactly what they want before any
   spreadsheet exists.
4. From the structured-but-empty workbook + chip onward, the experience is **identical to
   Flow A**, including full traceability and the interpretive safety gate.

**Acceptance (Flow B):**
- The output-spec chip names the template-to-be in one or two words and **previews its
  fields on hover** before anything is built.
- The workbook is built **only on explicit confirmation** (Enter), then populated through
  the same engine and traceability as Flow A. *(The `/api/generate` backend is a stub
  today; see [3-architecture.md](./3-architecture.md).)*

---

## The run experience

Cross-cutting, applies to both flows. This is the hero interaction.
The concrete result-screen layout contract (workbook-first, top band, right panel,
activity-eye states) is specified in
[11-result-view-workbook-first.md](./11-result-view-workbook-first.md).

### Live, traceable population
- The workbook chip is emitted **when the workbook is created** (~seconds), not on
  completion. The workbook starts structured (headers present) and body-empty.
- Cells fill progressively — sometimes a whole region/column at once (one query),
  sometimes single cells. Newly filled cells flash briefly.
- A cell is clickable/traceable **as soon as it has a value + metadata**, while the
  rest of the sheet is still filling. Selecting a cell must not interrupt population.

### Streamed agent activity
- The agent's reasoning and tool calls stream to an **activity feed** (SSE; the run
  event stream already exists in `core/running`).
- **Collapsed = one fixed-height status line** (e.g. "Reading the midwife's notes…").
  The row height must not jump as messages change.
- **Expanded = fixed-height scroll window** over the full reasoning. Auto-scroll to the
  bottom only when the user is already at the bottom; never yank them down while they
  read. *(TODO-0023, already shipped in the demo — preserve it.)*

### Stop + re-run (pause/resume deferred)
- **Stop** ends the run; work already written persists. **Re-run** continues from the last
  completed region (idempotent) and **never overwrites reviewed/corrected cells** (GAP-1).
- **True pause/resume and leave-and-return are deferred to the 100-day vision**
  ([vision-100-days.md](./vision-100-days.md)) — mid-session OpenCode resume is unproven (eng
  review A1). The MVP ships stop + re-run. See [5-run-engine.md](./5-run-engine.md).

### The interpretive safety gate
*(CEO decision D1, 2026-06-04.)*
- **Direct** values (copied from a structured table) populate and count immediately, with
  no review flag.
- **Interpretive** values (inferred by the agent from free-text notes) are populated
  **immediately too** — the agent fills everything so the user can start clicking through
  at once. But each interpretive cell carries one of **two distinct flag states**:
  - **Interpretive — not yet reviewed** (the state right after population).
  - **Interpretive — reviewed** (after the user has opened it and looked at the evidence).
- The two states are **visually distinct**, so at a glance the user sees which interpretive
  cells they have already checked ("good, I've read that one") and which still need their
  eyes. An interpretive value does **not count as final** until it is in the reviewed state.
- **Reviewing is just looking — no confirm button.** A **single click** opens the evidence
  (the notes with the relevant passages highlighted); after a brief look (~2s) the cell
  **auto-flips to reviewed**. To **correct** a value the user **double-clicks the cell to
  edit** it. Whether they edited it (corrected) or left it (confirmed) is the signal the
  100-day self-improvement loop feeds on; see [vision-100-days.md](./vision-100-days.md).
- The **accuracy bar** (submit-ready = all interpret cells reviewed) is specified in
  [5-run-engine.md](./5-run-engine.md) and [6-traceability-evidence.md](./6-traceability-evidence.md).

### Confidence heat-map
*(CEO expansion E2, accepted into MVP.)*
- Every cell carries a **confidence** and a **kind** (direct / interpretive).
- The workbook is tinted into a **trust heat-map**: high-confidence direct values read
  as "settled", interpretive / lower-confidence values read as "needs your eyes", so
  the clinician's attention routes to the cells that matter instead of all of them.

### Final summary message
*(Where blocked items surface — [10-status-and-blocked-items.md](./10-status-and-blocked-items.md).)*
- When the run finishes, the agent posts a **structured final summary as the terminal entry
  of the agent-activity feed** (the `review_summary` event;
  [doc 11 §agent_activity](./11-result-view-workbook-first.md)) stating what it completed and
  **explicitly listing any blocked values and why / who** — e.g. *"Audit populated. Three
  values are blocked: the orthogeriatric review note for spells 123 and 145 hasn't been
  written yet."* **The feed is the summary's only home** — there is no summary banner above,
  below, or over the workbook.
- The top band's compact **blocked / needs-review counters** (doc 11) mirror the summary's two
  queues at a glance, even with the panel closed.
- The **workbook stays clean** — missing values are **empty cells**, no markers, no appendix —
  and the **download is never blocked**: a partial audit downloads as the plain template at any
  status.

---

## Filter interaction

*(Replaces the broken "add filter" behaviour. TODO-0003, TODO-0022.)*

> **Scope note (2026-06-10): the intelligent-extraction redesign below is DEFERRED to the
> next phase.** The subsections *Real-time extraction from the prompt*, *The persistent agent
> band*, and *Manual add-filter* (LLM-routed via `POST /api/parseFilters`,
> [contracts/api.md](./contracts/api.md)) specify the target behaviour but are **not built
> and not in this phase's scope**. What binds now: the audit's **fixed inclusion criteria**
> (its default cohort, edited in the library — [doc 9](./9-library-and-sources.md)) and
> **structured filters supplied with the run request**, resolved against the prelinked
> criteria menu and enforced through the cohort ([doc 5 §Filter
> resolution](./5-run-engine.md#filter-resolution-and-the-cohort-count)). The
> §Enforcement rule below stands unchanged.

Filters are the inclusion/exclusion criteria the agent must obey (reporting period,
cohort, sites). Two ways to set them, both **non-blocking**:

### Real-time extraction from the prompt
- As the user types a free-text description, Intero extracts candidate filters and
  shows them as **editable chips**.
- Extraction is **incremental and additive**: as the user keeps typing, Intero **adds
  or removes** chips. It must **not** restart from zero — no collapse-to-empty, no
  "agent thinking… proposes… collapses… re-proposes" churn.
- Extraction never blocks typing or any other action.
- **Debounced, cancellable, diff-only** *(eng review S4)*: extraction runs on a short debounce,
  **cancels any in-flight request** when new input arrives, and applies only the **add/remove
  diff** — never an LLM call per keystroke, so out-of-order responses can't make the chip set
  collapse or churn.
- **Intelligent, menu-grounded** — extraction is **not regex**. The call is given the audit's
  **prelinked criteria menu** (the relevant-criteria Venn: the audit's allowable inclusion
  criteria intersected with the columns the **selected database(s)** actually expose — see
  [§Filter resolution](#filters-are-grounded-in-the-audits-prelinked-criteria-menu--the-agent-maps-intent--an-allowed-dimension))
  and must **only** choose dimensions from that menu, filling each value from the user's phrasing.
  It is the model's job to map fuzzy/implicit intent onto an allowed dimension and value —
  `"Q1 2026"` → the date range `2026-01-01 … 2026-03-31`; `"age 30–40"` when only a DOB column
  exists → the corresponding **birthdate range**; a typo'd or paraphrased value → the canonical
  option. **Values may be ranges**, not just scalars. A phrase that maps to nothing in the menu
  yields **no chip** (it is never echoed back as free text).

### The persistent agent band *(fixes the collapse/churn — TODO-0022)*
The agent's analysis lives below a divider under the prompt. Once the user has typed anything,
a **band** (status icon + label) sits at the top of that zone and **never unmounts**; the
extracted criteria render **directly below it and stay mounted across re-parses**. Only the
band's label and icon change — the chips below morph in place via the diff-only merge. There is
no swapping the whole section out for a "thinking" placeholder once criteria exist, so nothing
jumps or folds:

| State | Band label | Icon |
| --- | --- | --- |
| typing, no criteria yet | "Reading your request…" | scanning eye, animating |
| criteria present, idle | "Suggested criteria" | eye at rest |
| criteria present, re-extracting on new input | "Updating criteria…" | scanning eye, animating |
| extraction failed | the error, inline | — |

The staggered row reveal plays **only** on the first transition into criteria; later updates
fade chips in/out in place. The band keeps the user informed the agent is re-reading after every
edit (prompt or add-filter) without ever hiding what was already extracted.

### Manual add-filter
- The user clicks **add filter**, types a criterion, and presses **Enter**. It resolves through
  the **same extraction call** as the live prompt — given the same prelinked criteria menu — so
  it picks the best-matching allowed dimension and fills its value(s) (ranges included). The
  resulting chip(s) append to the working set. Today this control does nothing / behaves
  randomly — that is the bug this spec fixes.
- **No literal-text fallback.** If the phrase matches no dimension in the menu, the control must
  **not** invent a `custom`/free-text chip. It surfaces a one-line inline error under the input,
  keeps the input **expanded with the text intact**, and adds nothing — the user edits and
  retries. "Reliably produces a chip" means a *structured* chip or an honest "couldn't match",
  never a fake one.

### Enforcement
- Whatever chips are present at run time are the binding constraints. The agent must
  apply them **precisely** in its queries, and they must be validated before population.
  *(Clinical correctness; TODO-0003.)*

> **Implementation (D-track frontend; B6 supplies the real call behind it).** Route both the
> live prompt and add-filter through a **single** extractor entry point (`extractFilters({ text,
> template, databases, existing })`) so they share one contract and one mock/real switch
> (`isMockMode("audits")`). The relevant-criteria Venn is computed frontend-side from the
> template's declared criteria × the selected databases' filterable columns. In mock mode the
> extractor reproduces the intelligent behaviour deterministically (quarters, month-year and
> month ranges, `between … and …`, `born/DOB → birthdate range`, `age N → birthdate range`); it
> **must not** keep the old `field: "custom"` literal fallback. Touch points: remove
> `parseAdditionalFilters` and the literal fallback in `app/src/lib/spec.js`; add
> `app/src/lib/extractFilters.js` + a `relevantCriteria()` helper; declare `inclusionCriteria`
> per template in `app/src/lib/templateCatalog.js` and `filterableColumns` per database in the
> databases store/mock; make the agent band persistent in `app/src/components/HomeScreen.svelte`
> (render `InputSpec`/`OutputSpec` whenever `spec` exists, not only when `phase === "ready"`);
> thread `template`/`databases` and an inline `error` through
> `app/src/components/spec/InputSpec.svelte` → `AddFilterChip.svelte`. `cohortMerge.js` is already
> correct and stays untouched. The real backend is a `POST /api/parseFilters` route reusing
> `core.clients.llm.respond_typed` with a closed-set schema (the B6 deliverable).

**Acceptance (filters):**
- Typing in the prompt updates chips additively without ever collapsing the set to zero; the
  agent band stays mounted and only its label/icon changes while re-extracting.
- Extraction is menu-grounded and intelligent: `"Q1 2026"`, month ranges, and age→DOB phrasings
  resolve to the correct **structured** chip (ranges included), not a literal echo.
- "Add filter" + Enter routes through the same extraction call and **reliably produces a
  structured chip**, or — when nothing in the menu matches — shows an inline error and keeps the
  input expanded, adding no chip. No `custom`/free-text chip is ever created.
- Every chip present at run time is reflected in the SQL the agent runs.

---

## Filter resolution and the cohort-count preview

> **Revised 2026-06-05 (task P1) — the v1 model is menu-selection over a prelinked criteria
> surface, structured-only.** Two changes supersede the prose below:
>
> 1. **The resolver selects from a menu, it does not author SQL against `model.json`.** The
>    audit's **allowable inclusion criteria are extracted and pre-linked to real
>    `table.column`s at the _mapping_ step** (task A6, [doc 4 §Phase 2](./4-indexing-and-mapping.md#phase-2--mapping));
>    the user reviews/edits them in the library (task D9). At run time the **one** LLM call
>    **matches** the user's free-text to that prelinked menu and **concept-links values**
>    ("date of birth"↔"age", "caesarean"→the real `delivery` value) — it picks a dimension and
>    fills its parameterised condition; it never invents columns. (So "grounded in `model.json`"
>    below now means "grounded in the audit's prelinked criteria menu.")
> 2. **Structured-only in v1.** A criterion that the bound database can only satisfy from
>    **free-text notes** (e.g. a comorbidity mentioned only in a note) is **out of v1** — marked
>    *not available for this audit* / deferred (see [vision-100-days.md](./vision-100-days.md)),
>    never silently dropped. Two paths: **(Path 1)** no user criteria → apply the audit's
>    **canonical default cohort** (from A6) with zero resolution; **(Path 2)** user criteria →
>    resolve against the menu. The cohort shape, the read-only guard, the count, the
>    one-resolution-two-consumers rule, and unresolved-not-dropped are all **unchanged** below.

When the user describes a run in free-text, **one extraction LLM call** turns that text into a
**single typed list of spec items** — the inclusion/exclusion criteria *and* the output spec.
It is **one pass over the text, not a call per item**. The list feeds the setup surfaces that
already exist: `InputSpec` (criteria chips) and `OutputSpec` (the output-spec chip), with the
inclusion items also driving `CohortPreview` ("Exactly N patients match these filters"). B6
owns this one call, its SQL, and the count; D2/D3 render the chips it returns.

> **Status:** D2/D3 already shipped these surfaces on a **mock** — `app/src/lib/spec.js`
> extracts chips with deterministic regex and `resolveCohortCount` returns a **seeded** number
> (no LLM, no SQL, no query). B6 supplies the real backend behind the same components: it
> **reuses** the chip model + `InputSpec`/`OutputSpec`/`CohortPreview`, and **replaces** the
> mock extraction/count with the real one-call extraction (+ `sql`/`params` per inclusion chip)
> and a real read-only `COUNT`. B6 decides reuse-vs-replace per piece; the behavior below is fixed.

### The extracted spec list (what the call emits)

Each item is **typed** and carries a **chip** the user can read and edit; the items that
**constrain the cohort** also carry the **SQL filter** they contribute to the query:

```jsonc
[
  { "kind": "inclusion",                       // an inclusion/exclusion criterion → InputSpec + a cohort filter
    "label": "Appointment",
    "display": [ { "text": "between" },         // the chip, reading like a sentence
                 { "chip": "date_from", "value": "2026-01-01", "type": "date" },
                 { "text": "to" },
                 { "chip": "date_to",   "value": "2026-03-31", "type": "date" } ],
    "sql": "encounters.start BETWEEN :date_from AND :date_to",   // ANDed onto the cohort SELECT
    "params": { "date_from": { "value": "2026-01-01", "type": "date" },
                "date_to":   { "value": "2026-03-31", "type": "date" } } },

  { "kind": "inclusion",
    "label": "Gestation",
    "display": [ { "text": "≥" }, { "chip": "min_gestation_weeks", "value": "34", "type": "number" }, { "text": "weeks" } ],
    "sql": "cord_ph_birth_records.gestation_weeks >= :min_gestation_weeks",
    "params": { "min_gestation_weeks": { "value": "34", "type": "number" } } },

  { "kind": "output",                          // an output specification → OutputSpec chip (no cohort filter)
    "label": "Cord pH audit",
    "display": [ { "text": "populate the" }, { "chip": "template", "value": "cord-ph", "type": "template" }, { "text": "template" } ] }
]
```

- **`kind`** routes the item: `inclusion` → an `InputSpec` chip **and** a cohort filter;
  `output` → the `OutputSpec` chip (it specifies what to produce, not which records, so it
  carries no `sql`).
- **`label` + `display`** are the chip: a short name and a sentence-like phrase of connective
  text + one or more **editable value chips** (a range/compound rule has several).
- **`sql` + `params`** (inclusion items only) are the WHERE condition this criterion ANDs onto
  the cohort SELECT; values are `:named` binds, never inlined.

### Safety — the LLM writes the SQL, but only a read-only filter runs

A criterion is only ever **a WHERE clause on a SELECT**, so we let the model write it and
**reuse the read-only guard the SQL tools already use** rather than trust the model:

- the **composed** query (the base cohort SELECT + the ANDed conditions) is checked by the
  existing validator (`agent/.opencode/tools/_sql_validate.py` `validate_sql` — `sqlglot`
  rejects anything that isn't a `SELECT`/`UNION`: no INSERT/UPDATE/DELETE/DDL/PRAGMA); and
- it runs on a **read-only connection** (`PRAGMA query_only` + authorizer).

Nothing but a filtered read can execute — no new machinery, the same guard direct-cell queries
already pass. A condition that fails the guard is treated as **unresolved** (below).

### Filters are grounded in the audit's prelinked criteria menu — the agent maps intent → an allowed dimension

*(2026-06-05: the grounding input is the **prelinked criteria menu** the mapping step produced
(A6), not the whole `model.json`.)* A filter's `sql` may reference **only the
`table.column`s in the audit's prelinked criteria menu** — the model must not invent them. So
the resolution call is given that **menu** (each allowable dimension already bound to a real
`table.column` with its join path, type, and allowed values/range), and its core job is
**matching the user's words onto an allowed dimension + value**, not guessing:

- *"patients older than 5 years"* — there may be **no `age` column**, but there is
  `patients.birthdate`, so the agent emits `patients.birthdate <= date(:as_of, '-5 years')`.
- *"delivered at St Mary's"* → `encounters.organization = :hospital`.

This mapping — understanding what a criterion *means* and finding the column that carries it —
**is the agent's intelligence.** A criterion the schema genuinely cannot support is left
**unresolved** (below), never faked. Schema-grounding + the read-only guard together mean a
hallucinated or unsafe condition never runs.

### The cohort count

Take every `inclusion` item's `sql`, AND them together over the **selected database(s)**, and
run a read-only `COUNT(DISTINCT <identity>)` — `CohortPreview` shows **"Exactly N
{patients|encounters} match these filters."** It recomputes as chips change (debounced) and
never blocks typing — a real query, never an estimate. (Multi-database: count distinct
identities across the chosen DBs, joined on the identity keys per A3/A4.)

### One extraction, two consumers

The inclusion conditions are produced **once** and used twice — so the previewed cohort is
exactly the populated one: the **count** (above) at input time, and the **run** on confirm,
where the executor ANDs the **same** conditions into the `executable` block's cohort/region queries.
The run does **not** re-resolve.

### Unresolved criteria

If the LLM cannot turn a criterion into a valid read-only condition (it fails the guard, or is
too ambiguous to express), it is shown as **unresolved** — visibly excluded from the count with
a short reason — **never silently dropped**. The number always states what it does and does not
include, so it is never quietly wrong.

**Acceptance (spec extraction + count):**
- One extraction call returns a typed list; each item is a chip (label + editable value(s)), and each `inclusion` item also carries a parameterised SQL condition.
- `CohortPreview` shows a patient/encounter count from a real read-only COUNT query over the selected database(s), not a guess.
- Every composed query passes the read-only guard before it runs; a condition that fails it never executes.
- Changing a chip updates the count without blocking; the displayed cohort equals the cohort the run populates.
- On confirm, the run applies the **same** inclusion conditions (no re-resolution).
- An unrecognized/rejected criterion is surfaced as unresolved and excluded from the count, never dropped silently.

### How filters attach — the `executable` block precomputes the skeleton, the agent fills the filters

The criteria define the **cohort** — the set of in-scope patients/spells (the identity keys).
So the `executable` block is **not** a fixed list of pre-guessed filter blanks; it precomputes the
**stable skeleton** (the regions, the cell map, the identity keys, the cohort tables), and the
**filter conditions are the run-time part** — generated by the schema-grounded agent and
**composed into the cohort selection**. The count is `COUNT(DISTINCT <identity>)` over that
selection; the run populates cells only for those identities.

> **Decided (2026-06-04):** drop the pre-declared `filters[]` blanks — they can't hold a
> criterion no one guessed in advance. **Reshape the `executable` block** so the filter conditions
> attach to a cohort/identity selection at run time; the executor ANDs them in. The contract
> is ours to change — this supersedes A3's fixed `filters[]`.
>
> **Refined (2026-06-05, task P1):** the reshape is now its own task **A7** (the `cohort`
> block), generated from the **mapping-time criteria** (A6); the executor wiring + compose step
> is task **B7**; run-time resolution (menu-selection over A6's prelinked criteria) is the
> revised **B6**. The resolved conditions land in `cohort.where`; the agent writes them against
> the **prelinked criteria menu**, not the raw schema. See [doc 5 §Filter resolution](./5-run-engine.md#filter-resolution-and-the-cohort-count)
> and BUILD-PLAN.md §"Wave 1b".

---

## State coverage

*(TODO-0032. Every screen handles all of these — empty states are features.)*

| Surface | Empty | Loading | Error | Partial |
| --- | --- | --- | --- | --- |
| Home / audit list | "no audits yet" + upload CTA | skeleton | load failed + retry | — |
| Indexing | — | "Indexing…" badge + explainer | index failed + retry (TODO reindex) | — |
| Run / activity | — | streaming activity | run error + reason | stopped / partial run |
| Workbook | structured, body empty | cells filling (flash) | populate error per region | some cells filled, rest pending |
| Cell traceability | "no evidence" (should not happen for filled cells) | evidence loading | evidence fetch failed | interpretive: flagged, unverified |
| Missing / blocked cell | left **empty** in the template; the reason is surfaced in the agent's final message + dashboard status, not in the cell ([10](./10-status-and-blocked-items.md)) | — | — | — |

Beyond per-surface states, each **audit run carries a primary status** — Queued / In progress / Blocked / In verification / Complete — shown on the dashboard Kanban; see [10-status-and-blocked-items.md](./10-status-and-blocked-items.md). A cell the agent **cannot** fill becomes a **blocked item** (reason + owner to chase), kept distinct from a cell that **needs verification** (the interpretive review gate above).

Blank cells must carry an explicit reason (`missing` / `unknown` / `not_available`),
never a fabricated value. *(TODO-0036.)*
