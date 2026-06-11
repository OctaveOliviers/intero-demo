# Intero Demo — Master Specification

> **Branch purpose.** This branch (`claude/musing-archimedes-3cf528` and its
> children) exists to build a **front-end demo**. It will diverge from `main`.
> The goal is a polished, convincing walkthrough — **not** a working product.
>
> **Everything is mocked.** No backend is required. Data, evidence, agent
> activity, indexing, SQL results, and the populated spreadsheet are all fake and
> live entirely in the front end. We do not care about wiring to the real
> server. The only thing that matters here is that **the front end looks good and
> the demo flow plays smoothly**.

This document is the shared context every agent working on this demo must read
first. It is accompanied by two siblings:

- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — the visual language (modelled on
  ChatGPT's calm, monochrome look): tokens, the shared icon set, component
  patterns, the left-panel spec, and the icon-replacement inventory.
- [`TASKS.md`](TASKS.md) — the orthogonal task breakdown with explicit file
  ownership, so multiple agents can work in parallel without colliding.

---

## 1. What we are building

The app is a clinical-analysis assistant. A user picks (or describes) an
analysis, runs it, and an agent fills a spreadsheet with the requested values.
Every value is **traceable**: clicking a cell opens a right-hand panel that shows
*how that value was derived* — the explanation, the SQL the agent ran, and the
source evidence (structured rows we copied, or full clinical notes with the
relevant passages highlighted).

The demo tells this story end-to-end with two entry points ("flows") and one hero
interaction (watching the spreadsheet fill itself live while remaining fully
traceable).

### Terminology (user-facing)

We standardize on **"analysis"** as the user-facing noun (the sidebar lists past
**analyses**; the action button runs an **analysis**). The Excel file a user
uploads is still a **"template"**. The reusable data source is a **"database"**.
Replace legacy "audit" copy in the UI with "analysis" wherever it refers to a
run. See §7 for the button-label decision.

### Tech stack (already in place)

- **Svelte 4 + Vite**, app lives in [`app/`](../../app).
- A mock layer already exists: [`app/src/lib/mock.js`](../../app/src/lib/mock.js),
  enabled with `VITE_MOCK=true` (`npm run dev:mock`). The demo runs **entirely in
  mock mode** — we expand this layer rather than touching the Python backend.
- A shared **`Icon.svelte`** component (created by the DS task) provides the one
  consistent monochrome line-icon set every component uses (see DESIGN-SYSTEM §1).
- Component map (current):
  - [`App.svelte`](../../app/src/App.svelte) — three-column grid: left panel,
    main panel, right panel (right panel appears only when a cell is selected).
  - [`components/LeftPanel.svelte`](../../app/src/components/LeftPanel.svelte) —
    sidebar (being rebuilt to the ChatGPT-style spec; DESIGN-SYSTEM §6).
  - [`components/MainPanel.svelte`](../../app/src/components/MainPanel.svelte) —
    switches between `HomeScreen` and `ResultsView`.
  - [`components/HomeScreen.svelte`](../../app/src/components/HomeScreen.svelte) —
    hero, list of templates, "upload" card, "describe the data" card.
  - [`components/TemplateCard.svelte`](../../app/src/components/TemplateCard.svelte)
    — one template; expands to show database picker, filters, Run button.
  - [`components/ResultsView.svelte`](../../app/src/components/ResultsView.svelte)
    — user message, agent-activity card, the spreadsheet, the result chip.
  - [`components/MessageBubble.svelte`](../../app/src/components/MessageBubble.svelte)
    — renders a message; a `chip`-type message renders `SpreadsheetChip`.
  - [`components/SpreadsheetChip.svelte`](../../app/src/components/SpreadsheetChip.svelte)
    — the clickable file chip that opens the workbook.
  - [`components/SpreadsheetViewer.svelte`](../../app/src/components/SpreadsheetViewer.svelte)
    — the `jspreadsheet-ce` grid; clicking a cell with metadata opens the right
    panel.
  - [`components/RightPanel.svelte`](../../app/src/components/RightPanel.svelte) —
    "Cell source": explanation + SQL + result/evidence.
  - [`components/SqlDisplay.svelte`](../../app/src/components/SqlDisplay.svelte),
    [`components/SqlResultViewer.svelte`](../../app/src/components/SqlResultViewer.svelte),
    [`components/NoteEvidenceView.svelte`](../../app/src/components/NoteEvidenceView.svelte)
    — building blocks of the right panel (NoteEvidenceView highlights quote spans
    inside full note text — the "latest PR" behavior referenced below).
  - [`components/SettingsModal.svelte`](../../app/src/components/SettingsModal.svelte)
    — manage templates and databases.
  - [`components/Toasts.svelte`](../../app/src/components/Toasts.svelte).
  - Stores: [`stores/chat.js`](../../app/src/stores/chat.js) (run lifecycle,
    workbook, selected cell), [`stores/audits.js`](../../app/src/stores/audits.js)
    (sidebar history), [`stores/navigation.js`](../../app/src/stores/navigation.js),
    [`stores/databases.js`](../../app/src/stores/databases.js),
    [`stores/indexing.js`](../../app/src/stores/indexing.js),
    [`stores/toasts.js`](../../app/src/stores/toasts.js).
  - [`lib/api.js`](../../app/src/lib/api.js) — fetch wrappers, already
    short-circuited to the mock layer for some calls.

---

## 2. Ground rules for this branch

1. **Mock everything.** Assume the Python backend is not running. Any data the UI
   needs must be served from the front-end mock layer (§6).
2. **Front-end quality is the only deliverable.** Make it look modern and
   consistent. Do not invest in real data plumbing.
3. **Follow the design system** in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) to the
   letter, including its ChatGPT-derived palette and structure. **Icons rule:**
   no colored emojis anywhere (no 📊 ＋ 🗄️ ✦ ✓ …). Instead use **simple
   monochrome stylized line icons** from the shared `Icon.svelte` set, all one
   family/stroke/size, inheriting text color. Arrows and chevrons must be the
   single canonical icon used consistently everywhere.
4. **Respect file ownership** in [`TASKS.md`](TASKS.md). Each task owns a disjoint
   set of files so agents can run in parallel. If you must touch a file another
   task owns, stop and coordinate instead of editing it.
5. **Timings matter.** The demo is a performance. Hit the durations in §3–§5.

---

## 3. Flow A — Run an uploaded template

The primary flow. Demonstrates: upload → indexing → configure → run → live
population → traceability (both evidence types).

1. **Home screen.** User starts on the home screen
   ([`HomeScreen.svelte`](../../app/src/components/HomeScreen.svelte)).
2. **Upload a template.** User uploads a new template (an `.xlsx`). On upload, the
   new template appears immediately in an **"Indexing…" state** plus a short,
   human-readable explanation of what indexing means (so a first-time viewer
   understands what is happening). Indexing lasts **~5–10 seconds**, then flips to
   "Ready". Simulated entirely client-side (§6.3) — no real indexing.
3. **Open the template.** User clicks the now-ready template. The card expands to
   reveal the run configuration:
   - **All filters are empty.** (Today they pre-fill last year's dates — change
     that: every filter field starts blank.)
   - **The database is pre-selected** to the demo database — display name
     **"Impatient database"** (an intentional pun on *inpatient*; the data behind
     it is the cord-pH fixture, §6). Use the name verbatim.
4. **Run.** User clicks the run button (label per §7). The view switches to
   `ResultsView`.
5. **Agent works (~15–20 s).** Top-left shows the user's message (the analysis
   name + any filters). Below it, the **agent-activity card** streams realistic
   thinking and tool calls (§4 and §5 for the script and the folding behavior).
6. **The file chip appears fast.** Within **~1–2 seconds** the agent "creates" the
   workbook and emits the **file chip**. The user can click it immediately, while
   the agent is still working.
7. **Live population.** Clicking the chip opens the
   [`SpreadsheetViewer`](../../app/src/components/SpreadsheetViewer.svelte). The
   grid then **fills in progressively** over the ~15–20 s — sometimes a whole
   column/region at once (one query), sometimes a single cell at a time. Newly
   filled cells flash briefly (§4.2). This is the hero moment.
8. **Traceability — direct values.** Some filled cells are **direct values**
   copied from structured data. Clicking one opens the right panel showing, top to
   bottom: the **explanation** (verbatim from the cell metadata), the **SQL
   query**, then the **result** of that query (a small structured table).
9. **Traceability — interpretive values.** Other cells are **interpretive
   values** (the agent combined multiple free-text notes to derive them). Clicking
   one opens the right panel like the latest PR's note-evidence behavior:
   - **explanation** at the top, e.g. *"The agent combined the obstetrician's
     birth-summary note and the midwife's delivery note to determine this value."*
   - the **SQL query** that selects, for that baby, the relevant notes,
   - below it, the **complete notes** rendered in full (the full midwife note and
     the full obstetrician note), with the **relevant passages highlighted** —
     exactly the
     [`NoteEvidenceView`](../../app/src/components/NoteEvidenceView.svelte)
     highlight logic already shipped.
10. **Back home.** User returns to the home screen. The analysis is now fully
    populated and remains in the sidebar history. This sets up Flow B.

---

## 4. Cross-cutting hero behavior — live, traceable population

Applies to **both** flows. The most important interaction in the demo.

### 4.1 The chip is available the moment the workbook exists

- The file chip must be emitted **as soon as the workbook is created** (~1–2 s),
  **not** when the run finishes. The current code emits the chip only on `done` —
  change that.
- The workbook starts **structured but empty**: headers/columns present, body
  cells blank (Flow A gets its structure from the template; Flow B builds it
  first — §5).
- Clicking the chip opens the viewer at any time, including mid-run.

### 4.2 Cells populate over time

- After the workbook is created, the mock engine emits a timeline of
  **cell-update batches** — varied cadence: a whole **column/region** at once,
  then a run of **single cells**.
- Each newly written cell gets a brief **highlight flash** (~600 ms) using the
  design-system "fill flash".
- Population completes in **~15–20 s**, finishing roughly when the agent activity
  reaches `done`.

### 4.3 Traceable while still filling

- A cell becomes clickable/traceable as soon as it has a value and metadata.
- The user can open the right panel for any already-filled cell **while the rest
  of the sheet is still populating**. Selecting a cell must not interrupt
  population.

---

## 5. Agent-activity card behavior (important)

The activity card has a quirk today: when expanded it shows the agent's full
latest message (often multi-line), so when **collapsed** its height jumps around
as message lengths change. Fix it:

- **Collapsed = one fixed-height line.** Show a single short, clear status
  sentence describing the current phase (e.g. *"Populating the template…"*,
  *"Reading the midwife's notes…"*, *"Building the spreadsheet…"*). Truncate with
  an ellipsis; the row height must never change as the underlying message changes.
  - This comes from a short **`headline`** field on activity events (§6.4), not
    from the full reasoning text.
- **Expanded = fixed-height scroll window.** A constant-height panel that scrolls
  through the full agent reasoning. The container height does not grow with
  content.
- **Scroll behavior (keep current logic):** auto-scroll to the bottom **only when
  the user is already at the bottom**. If the user has scrolled up to read, new
  streaming text must **not** yank them back down. (This pin-to-bottom logic
  already exists in `ResultsView.svelte`; preserve it.)

---

## 6. Mock data & event contract

The contract between the mock engine (fake data + run timeline) and the UI. The
**MOCK** task owns the implementation; everyone else codes against these shapes.

The demo scenario is the **CordPhLo audit** — umbilical cord blood-gas health at
birth. Ground the mock in the existing fixture at
[`database/cord-ph/`](../../database/cord-ph) (see its
[`README.md`](../../database/cord-ph/README.md) and
[`csv/`](../../database/cord-ph/csv)). It contains exactly what we need:

- **Structured tables** (for direct values): `cord_ph_birth_records.csv` and
  `observations.csv` — e.g. `Gestation_weeks`, `Birth_weight_grams`,
  `Cord_arterial_pH`, `Apgars_5`, `Delivery` (mode), reporting period
  2026-04-01…2026-04-30.
- **Free-text notes** (for interpretive values): `clinical_notes.csv` with
  `birth_summary` notes (authored by **Obstetrics** providers — the
  "gynaecologist") and delivery/admission notes (authored by **Midwifery** — the
  "nurse"), plus neonatal notes. The fixture deliberately includes
  structured-vs-note conflicts (e.g. a CFM result that disagrees between the
  structured record and the note) — perfect for an interpretive cell that
  reconciles the two.

> The pre-selected **"Impatient database"** is this cord-pH data. Keep the playful
> display name unless told otherwise.

### 6.1 Templates (home list)

A small fixed set so the home screen is populated without a backend:

```js
{
  id: "cord-ph-audit",
  name: "Cord pH at Birth Audit",
  description: "Cord blood gas, resuscitation and documentation quality at birth.",
  defaultFilters: { dateFrom: "", dateTo: "", hospitals: "", cohort: "" }, // all blank
}
```

### 6.2 Databases

```js
{ id: "impatient-db", name: "Impatient database", status: "ready" }
```

### 6.3 Indexing simulation (upload)

When a template is "uploaded" in mock mode, push an entry into the indexing store
([`stores/indexing.js`](../../app/src/stores/indexing.js)) with status
`indexing`, then flip to `ready` after **5–10 s**. The template card shows the
indexing badge + an explanatory line during that window. No file is parsed — the
upload handler just registers a new mock template.

### 6.4 The run timeline (events)

Extend the existing `mockStartRunStream` callback model. Event kinds:

| event | payload | UI effect |
|---|---|---|
| `activity` | `{ type: "thinking" \| "tool", headline, summary?, name?, status? }` | append to the expanded log; **`headline`** (short, one line) drives the collapsed single-line status (§5) |
| `workbook_created` | `{ label, sheets: [...], cellMetadata: {} }` | set the active workbook (structured, body blank), **emit the file chip now** |
| `cell_update` | `{ sheet, cells: [{ ref, value, meta? }] }` | write the value(s), attach metadata, flash the filled cell(s) |
| `done` | `{}` | mark completed; chip already exists, do not emit a second |
| `error` | `{ message }` | error message + error status (existing) |

`ref` is A1-style relative to the sheet (e.g. `"C4"`); the viewer maps
`"<SheetName>!<A1>"` in `cellMetadata`.

### 6.5 Cell metadata — the two evidence types

Stored in the workbook's `cellMetadata`, keyed `"<SheetName>!<A1>"`.

**Direct value** (copied from a structured table):

```js
{
  kind: "direct",
  explanation: "Gestation at birth copied directly from the maternity birth record.",
  sql: "SELECT Gestation_weeks, Gestation_days FROM cord_ph_birth_records WHERE PATIENT_CODE = 'CPH001'",
  database: "impatient-db",
  // evidence omitted -> RightPanel renders SqlResultViewer (structured table)
}
```

**Interpretive value** (derived from combining free-text notes):

```js
{
  kind: "interpretive",
  explanation: "The agent combined the obstetrician's birth-summary note and the midwife's delivery note to confirm delayed cord clamping was performed and documented.",
  sql: "SELECT AUTHOR_ROLE, DATE, TEXT FROM clinical_notes WHERE PATIENT = 'cph-baby-001' AND NOTE_TYPE IN ('birth_summary','delivery')",
  database: "impatient-db",
  evidence: [
    "Delayed cord clamping performed for about 90 seconds",  // highlighted span(s)
    "No resuscitation beyond drying and stimulation",
  ],
}
```

When `evidence` is present the right panel renders
[`NoteEvidenceView`](../../app/src/components/NoteEvidenceView.svelte): each row
is a full note (long text column = body, short columns = header line), and every
`evidence` string is highlighted wherever it appears.

Author **at least one direct cell and one interpretive cell** so the demo shows
both. Good interpretive candidates from the fixture: "Delayed cord clamping
performed & documented", "Resuscitation adequately documented", or the deliberate
**CFM structured-vs-note conflict** (an interpretive cell that flags the
discrepancy).

### 6.6 Mock SQL results (`executeSql`)

`mockExecuteSql(query, …)` returns data matching the cell's type:

- **Direct cells:** a compact structured result (a couple of columns, a few rows),
  e.g. `Gestation_weeks`, `Gestation_days`.
- **Interpretive cells:** **one row per source note**, each with a long `TEXT`
  column (so `NoteEvidenceView` treats it as the body) plus short columns
  (`AUTHOR_ROLE`, `DATE`). Include the full obstetrician birth-summary note and
  the full midwife note; the `evidence` quotes must be verbatim substrings.

Key responses off recognizable SQL fragments (the current mock already branches on
`query.includes("clinician_notes")` — adapt to `clinical_notes` /
`cord_ph_birth_records`).

---

## 7. The run-button label

The run action covers both a pre-built template and a pasted email, so its label
should not say "audit". **Recommendation: "Run analysis"** — it reads as the verb
form of the "analysis" noun used in the sidebar (New analysis / Search analyses /
the list of analyses), giving end-to-end consistency. Acceptable alternatives:
"Analyze", "Run". Use **"Run analysis"** unless overridden — it's a one-line
change in `TemplateCard.svelte` and `HomeScreen.svelte`.

---

## 8. Flow B — Describe the data you want (from an email)

The second entry point. You don't need a template — describe what you want.

1. **Home screen.** User uses the **"Describe the data you want"** input.
2. **Paste an email.** A realistic doctor's email describing the data needed (the
   mock provides a good sample to copy/paste, but the box accepts anything).
3. **Submit.** Rename the current **"Generate"** button to the same run label as
   §7 ("Run analysis"). **Behavior change:** today this streams a plain text LLM
   reply (`generateData`); for the demo it must instead **start the same run
   flow** — switch to `ResultsView`, show activity, build + populate, emit the
   chip.
4. **Build then populate.** Activity begins with the build phase
   ("Building the spreadsheet…", "Adding columns: Baby, Gestation, Cord pH …"),
   the empty grid + chip appear (~3–5 s), then cells populate live (§4). From
   there the experience is identical to Flow A, including full traceability.

---

## 9. How agents should work on this branch

- Read this file + [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md), then your task card in
  [`TASKS.md`](TASKS.md).
- Branch **off this branch**, not `main`. Name it `feature/demo-<task-id>`.
- Edit **only the files your task owns** (matrix in `TASKS.md`).
- Verify visually in `npm run dev:mock` from [`app/`](../../app).
- Keep PRs scoped to one task so they land independently.
