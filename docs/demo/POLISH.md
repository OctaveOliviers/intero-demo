# Intero Demo — Polish Round 2 (task breakdown + agent prompts)

Read [`README.md`](README.md) (storyline) and [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) (tokens +
icons) first; this file is the round-2 sibling of [`TASKS.md`](TASKS.md).

This round refines the latest build per a batch of user feedback, structured the same way as
`TASKS.md`: one task = a disjoint set of owned files, so each task can be handed to an
independent agent and run in parallel.

Demo flow being polished: pre-loaded analyses are shown; the user **uploads** the Cord pH audit
and runs it against the **EHR database** (Flow A → cord-pH dataset); separately the user
**pastes a doctor's email** that requests a different chest-pain EHR extract, which builds a new
workbook column-by-column and populates it (Flow B → a NEW chest-pain dataset).

All data is mocked in [`app/src/lib/mockData.js`](../../app/src/lib/mockData.js) +
[`app/src/lib/mock.js`](../../app/src/lib/mock.js); SheetJS (`xlsx`) is already a dependency.

---

## Ownership matrix (no file in two tasks → fully parallelizable)

| Task | Owns (edits) |
|---|---|
| **T1 LEFT-SEARCH** | `app/src/components/LeftPanel.svelte` |
| **T2 HOME-CARDS** | `app/src/components/HomeScreen.svelte` |
| **T3 MOCK-DATA** | `app/src/lib/mockData.js`, `app/src/lib/mock.js` |
| **T4 RESULT-LAYOUT** | `app/src/components/ResultsView.svelte` |
| **T5 CHIP-DOWNLOAD** | `app/src/components/SpreadsheetChip.svelte`, `app/src/stores/chat.js` |
| **T6 PANEL-EVIDENCE** | `app/src/components/RightPanel.svelte`, `app/src/components/NoteEvidenceView.svelte` |
| **T7 SHELL-DIVIDER** | `app/src/App.svelte` |

**Dependencies:** all seven can be coded in parallel — file sets are disjoint. The only soft
coupling is that T4/T5/T6 are best *verified* after **T3** lands (their behavior consumes T3's
data shapes: empty-but-clickable cells, identifier columns, the chest-pain dataset). T3 is the
biggest and the long pole; start it first. T1, T2, T7 are fully standalone.

---

## T1 — LEFT-SEARCH (`LeftPanel.svelte`)

Clicking "Search analyses" should leave **only a blinking cursor** — no box, no leftover label,
no blue glow.
- **Kill the light-blue glow:** add `box-shadow: none;` (and `border: none;`) to
  `.search-input:focus` (`LeftPanel.svelte:435`). The glow leaks from the global `input:focus`
  rule (`app/src/app.css:110` adds `box-shadow: 0 0 0 3px var(--color-accent-weak)`).
- **Remove the placeholder:** delete `placeholder="Search analyses"` on the input (`:184`).
- **Remove the box:** set `.search-row` background to `transparent` (currently
  `var(--color-hover)`, `:419`). Keep the leading search icon.

## T2 — HOME-CARDS (`HomeScreen.svelte`)

- **Hero heading:** change "Start an analysis" → **"Start any analysis"** (`:80`).
- **Describe card becomes a click-to-expand card the same height as the others.**
  Today it's an always-open textarea pre-filled with an un-runnable gray email. Rebuild it to
  match the upload/template cards:
  - **Collapsed (default):** same height/padding as `.upload-card` — just the title
    **"Describe the data you want"** and the line **"Paste a request or email — we'll build a
    workbook and run the analysis."**
  - **On click:** expand to reveal the free-text `<textarea>` (empty, **no placeholder email**)
    plus the **Run analysis** button, so the user can paste the email and run.
  - **Remove the `⌘↵ to run` hint** next to the Run button (`:137`).
  - Drop the `mockSampleEmail` import/usage (`:7`, `:132`); the email is provided separately for
    copy-paste (see T3).

## T3 — MOCK-DATA (`mockData.js`, `mock.js`)  ← long pole, start first

**Databases (EHR / Lab / Radiology):** replace the single "Impatient database" with
`MOCK_DATABASES = [{id:"ehr-db",name:"EHR database",status:"ready"}, {id:"lab-db",name:"Lab database",status:"ready"}, {id:"radiology-db",name:"Radiology database",status:"ready"}]`
and `export const MOCK_DATABASE = MOCK_DATABASES[0]`. Seed `mockDatabases = [...MOCK_DATABASES]`
in `mock.js:28`. EHR is the one used; cell `meta.database` already reads `MOCK_DATABASE.id`. With
three ready databases the card no longer auto-selects, so the user picks **EHR** on camera.

**Pre-loaded analyses:** in `mock.js:27` seed these five (names + short descriptions), and remove
Cord pH from defaults (the user uploads it live):
`Sentinel Stroke`, `Paediatric Diabetes`, `Emergency Laparotomy`, `Heart Failure`,
`Early Inflammatory Autoimmune Diseases`. (Uploading the Cord pH `.xlsx` still works via
`mockUploadAudit`; running it plays Flow A / cord-pH data. The five are display-only decorations
— running one replays the cord-pH dataset, acceptable for the demo.)

**Traceable SQL evidence with patient context (direct cells):** today a direct cell's result is
just the bare value(s) with no patient anchor. Add the **identifier + column names** so a value
is traceable to the right patient: every direct cell's `SELECT` and its `structuredResult` must
include `PATIENT_CODE` first, e.g. gestation → columns `["PATIENT_CODE","Gestation_weeks","Gestation_days"]`,
row `["CPH001",39,4]`. `SqlResultViewer` already renders columns+rows, so this is data-only.

**No dead cells — two specific cases:**
- **Cord pH missing (CPH003):** value becomes the text **"Unavailable"**, still clickable, with a
  **written-note** as supporting evidence (more realistic than a structured value): use the
  obstetric birth-summary note that states the arterial sample clotted, highlighted via the
  interpretive/note path. Explanation (source-first): *"From the obstetric birth-summary note —
  the arterial cord sample clotted, so no valid pH was recorded."*
- **CFM column, non-NICU rows:** keep the cell **empty** (`value: ""`) but **attach meta so it's
  still clickable**. Clicking shows the explanation *"Not admitted to NICU, so no CFM or
  neurology assessment was performed."* and a query result showing the **empty NICU/neurology
  entry for that patient** — i.e. a result carrying `PATIENT_CODE` + the relevant columns but
  **0 rows** (or null values), proving the lookup ran and returned nothing. NICU babies (CPH002,
  CPH009) keep Concordant / Conflict. Update `makeCell`/`columnBatch` so empty-value-with-meta
  cells are included in the populate batches and in `cellMetadata` (the current code skips
  empty+no-meta cells).

**Crisp, source-first explanations (rewrite all `explanation` strings):** present tense, **no
first person, no "the agent…"**. Patterns:
- Direct: *"From the EHR birth record for CPH001."*
- Interpretive (DCC): *"From the obstetrician's birth-summary and the midwife's delivery note — both record the cord clamped at ~90s, so delayed clamping is documented."*
- CFM concordant: *"The bedside CFM note and the formal neurology report both read an abnormal background with no seizures — concordant."*
- CFM conflict: *"The bedside CFM note read a normal background, but the neurology report records electrographic seizures — flagged as a conflict."*
Also replace any "Impatient database" wording with "EHR".

**Population cadence + activity length:** add a couple more thinking lines (less terse) and a
small `rnd(min,max)` helper; mix the cadence — sometimes a full-column batch, sometimes 2–3
columns at once, sometimes single cells — with randomized waits so it no longer marches
column-by-column on a fixed clock. (Stale "Finalizing…" headline is fixed in T4.)

**Second dataset — Chest Pain (Flow B / the email):** generalize `mockData.js` into a small
dataset-descriptor shape (extract the cord-pH `{sheet,columns,rowOrder,records,makeCell,
populationSteps,buildWorkbookEvent}` into a `cordPh` object) and add a parallel `chestPain`
object:
- Sheet `"Chest Pain"`, label `"chest-pain-audit.xlsx"`.
- Columns: **Patient, Age, Presenting complaint, Troponin (ng/L), ECG findings, Time to ECG (min),
  Diagnosis, Discharge/Admit decision.**
- ~8 patient records (`CP001…`). Direct cells from EHR tables (`patient_encounters`,
  `ecg_results`, troponin) — each result carrying `PATIENT_CODE`; interpretive cells from
  `clinical_notes` (triage / cardiology / discharge-summary) for Presenting complaint, ECG
  findings, Diagnosis, Discharge/Admit, with verbatim `evidence` quotes. Include 1–2
  Unavailable/empty-but-clickable cells per the rules above.
- Its own randomized `populationSteps`.
- `resolveSql` builds `SQL_RESULTS` from **both** datasets and its fragment fallback recognizes
  both table-name sets.
- `buildTimeline`: `A` → cord-pH (structure ready, populate); `B` → chest-pain (Reading request →
  Building the spreadsheet → Adding columns, then populate column-by-column).
- `buildWorkbookEvent`/`buildPopulatedWorkbook` become dataset-aware (cord-pH stays the
  `mockGetWorkbook` reload fallback).

**The copy-paste email** — set `mockSampleEmail` to this (also paste-able by the user):

> Hi team,
>
> For the chest-pain pathway review I need an audit of the adult chest-pain attendances on the
> EHR database for the last quarter.
>
> For each patient please pull: age, presenting complaint at triage, the first troponin result,
> the time from arrival to first ECG, and the documented ECG findings. On top of the structured
> fields, read the triage and cardiology notes and give me the working diagnosis, and whether the
> patient was discharged or admitted.
>
> Flag any case where a troponin or ECG is missing.
>
> Thanks,
> Dr Mark Alvarez
> Emergency Medicine

## T4 — RESULT-LAYOUT (`ResultsView.svelte`)

- **Reorder to: user message → agent activity → file chip → live spreadsheet.** The chip is an
  assistant `chip`-type message currently rendered in the top messages loop (so it lands above
  the activity card). Split it out:
  ```
  $: topMessages  = $messages.filter(m => !(m.role==="assistant" && m.type==="chip"));
  $: chipMessages = $messages.filter(m =>  (m.role==="assistant" && m.type==="chip"));
  ```
  Top loop uses `topMessages`; render `{#each chipMessages}<MessageBubble>` **after** the
  `agent-card` block and **before** `{#if $activeWorkbook}<SpreadsheetViewer/>`.
- **Fix stale "Finalizing the analysis…" after done** (`:80`): the collapsed line shows the last
  activity headline forever. Change to a completed state when not running:
  `{isRunning ? (headline || "Working…") : "Analysis complete"}`.
- **Stack spinner + stop ("post") button** (`:63-69` + styles): wrap them in one fixed 16px slot
  with both overlaid (absolute). Spinner visible at rest; on hover of the slot fade the spinner
  out and the stop button in (`.slot:hover .spinner{opacity:0}`, `.slot:hover .stop-btn{opacity:1}`).

## T5 — CHIP-DOWNLOAD (`SpreadsheetChip.svelte`, `chat.js`)

Real `.xlsx` download from the chip's download icon.
- `chat.js`: add `downloadWorkbook(runId, label)` — resolve the workbook exactly like
  `openWorkbook` (live `activeWorkbook` if `runId` matches, else owner audit's stored `workbook`),
  then `import * as XLSX from "xlsx"` → `XLSX.utils.aoa_to_sheet(sheet.data)` →
  `book_new`/`book_append_sheet(wb, ws, sheet.name)` → `XLSX.writeFile(wb, label || "result.xlsx")`.
- `SpreadsheetChip.svelte`: always render the download control (drop the `{#if downloadUrl}`
  gate); on click `e.stopPropagation()` then call `downloadWorkbook(getRunId(workbookUrl), label)`.

## T6 — PANEL-EVIDENCE (`RightPanel.svelte`, `NoteEvidenceView.svelte`)

Right panel reads as one clean column: **explanation box → SQL query → result/notes.**
- **Remove the redundant top header bar** (`RightPanel.svelte:14-19`, the `Cell source` title).
  Preserve a way to close: add a small ghost **close (×)** icon button floating at the panel's
  top-right corner (absolute), calling the existing `closeCommand`.
- **Relabel the explanation box** label "How this value was derived" (`:25`) → **"Source"**.
- **One highlight color = light blue.** Keep the explanation box's existing light-blue treatment
  (`--color-accent-weak` bg / `--color-accent-border`), and change `NoteEvidenceView`'s `<mark>`
  (`NoteEvidenceView.svelte:121`) from the yellow `--color-highlight`/`--color-highlight-edge` to
  the **same light blue** (`background: var(--color-accent-weak)`, edge
  `box-shadow: 0 0 0 1px var(--color-accent-border)`) so the explanation box and the highlighted
  evidence share one highlight color.

## T7 — SHELL-DIVIDER (`App.svelte`)

The right panel's separator looks much thicker than the left panel's hairline because the
`.resize-divider` is a 4px bar filled with `var(--color-border)` (`App.svelte:80-85`) **on top of**
`RightPanel`'s own 1px `border-left`. Mirror the LeftPanel resizer pattern: make `.resize-divider`
**transparent by default** and only color on `:hover` / `.resizing` (keep its 4px hit-area width
for grabbing). The visible separator then becomes just `RightPanel`'s 1px `border-left` — a thin
line matching the left panel.

---

## Verification (manual, `cd app && npm run dev:mock`)
1. **T1:** click "Search analyses" → blinking cursor only; no box, no placeholder text, no blue glow.
2. **T2:** home heading reads "Start any analysis"; the describe card is collapsed at the same height as the others, expands on click to an empty textarea + Run (no placeholder email, no ⌘↵ hint).
3. **T3 (Flow A):** open a card → DB dropdown lists EHR/Lab/Radiology, pick EHR. Five pre-loaded analyses, no Cord pH. Upload Cord pH `.xlsx`, run it: cells fill irregularly; CPH003 pH shows "Unavailable", non-NICU CFM cells are empty; every cell (incl. empties) is clickable.
4. **T4:** results order is message → activity → chip → sheet; finished run shows "Analysis complete" (not "Finalizing…"); hovering the spinner reveals the stop button.
5. **T5:** chip download icon saves a real `.xlsx` of the populated sheet.
6. **T6:** click a value → no top "Cell source" bar; column is Source box → SQL → result/notes; the only highlight is light blue (box + note mark match). Click a direct cell → result shows PATIENT_CODE + columns + values for the right patient. Click an Unavailable pH cell → the clotted-sample note with the relevant passage highlighted. Click an empty CFM cell → "not admitted to NICU" + an empty NICU lookup for that patient.
7. **T7:** the right-panel separator is a thin hairline matching the left panel.
8. **T3 (Flow B):** paste the chest-pain email into the describe card → builds a **Chest Pain** workbook column-by-column, then populates a dataset distinct from cord-pH, with its own evidence and a couple of Unavailable/empty cells.

---

## Agent prompts (copy-paste, one per task)

Each agent starts from the **`mock`** branch (this file is already merged there). It reads this
file + `docs/demo/README.md` + `docs/demo/DESIGN-SYSTEM.md`, edits **only its owned files**,
branches `feature/demo-<task>` off `mock`, verifies in `npm run dev:mock`, and opens a PR into
`mock`. The **Interface stability rule** from `TASKS.md` applies: never change a component's
public props, dispatched events, or exported store API.

### T1 — LEFT-SEARCH
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T1 — LEFT-SEARCH"),
plus docs/demo/README.md and docs/demo/DESIGN-SYSTEM.md for context. Implement T1 exactly as
specified, editing ONLY app/src/components/LeftPanel.svelte. Create a branch
feature/demo-left-search off `mock`. Verify with `cd app && npm install && npm run dev:mock`
(clicking "Search analyses" leaves only a blinking cursor — no box, no placeholder, no blue glow).
Open a PR into `mock`.
```

### T2 — HOME-CARDS
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T2 — HOME-CARDS"),
plus docs/demo/README.md and docs/demo/DESIGN-SYSTEM.md. Implement T2 exactly as specified,
editing ONLY app/src/components/HomeScreen.svelte: heading "Start any analysis"; rebuild the
describe card into a click-to-expand card the same height as the other cards (collapsed = title +
one-line description; expands on click to an empty textarea — no placeholder email — plus a
"Run analysis" button); remove the ⌘↵ hint. Do not change the startDescribeRun store API. Branch
feature/demo-home-cards off `mock`. Verify with `cd app && npm install && npm run dev:mock`. Open
a PR into `mock`.
```

### T3 — MOCK-DATA (start first; largest)
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T3 — MOCK-DATA"),
plus docs/demo/README.md (§6 mock data & event contract) and the existing fixtures under
database/cord-ph/. Implement T3 exactly as specified, editing ONLY app/src/lib/mockData.js and
app/src/lib/mock.js: EHR/Lab/Radiology databases (EHR used); five pre-loaded analyses (Sentinel
Stroke, Paediatric Diabetes, Emergency Laparotomy, Heart Failure, Early Inflammatory Autoimmune
Diseases) with Cord pH removed from defaults; direct-cell SQL results that include PATIENT_CODE +
column names; CPH003 pH → "Unavailable" backed by the clotted-sample note; non-NICU CFM cells
empty-but-clickable with an empty NICU lookup; crisp source-first explanations (no first person,
no "the agent"); randomized population cadence; and a NEW Chest Pain dataset for Flow B (distinct
columns/records/notes/SQL + build-then-populate timeline) with mockSampleEmail set to the
chest-pain email in POLISH.md. Keep the mock event/data contract shapes from README §6 unchanged.
Branch feature/demo-mock-data off `mock`. Verify both flows with `cd app && npm install &&
npm run dev:mock`. Open a PR into `mock`.
```

### T4 — RESULT-LAYOUT
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T4 — RESULT-LAYOUT")
plus docs/demo/README.md (§5 agent-activity card). Implement T4 exactly as specified, editing ONLY
app/src/components/ResultsView.svelte: reorder to user message → agent activity → file chip →
spreadsheet (split chip-type messages out of the top loop and render them after the activity card);
show "Analysis complete" instead of the stale "Finalizing…" headline when not running; stack the
spinner and stop button in one slot so the spinner shows at rest and the stop button appears on
hover. Branch feature/demo-result-layout off `mock`. Verify with `cd app && npm install &&
npm run dev:mock`. Open a PR into `mock`.
```

### T5 — CHIP-DOWNLOAD
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T5 — CHIP-DOWNLOAD").
Implement T5 exactly as specified, editing ONLY app/src/components/SpreadsheetChip.svelte and
app/src/stores/chat.js: add a downloadWorkbook(runId, label) helper to chat.js that resolves the
workbook the same way openWorkbook does and writes a real .xlsx via the already-installed SheetJS
(`xlsx`); make the chip always show its download icon and call downloadWorkbook on click. Do not
change other exported store APIs. Branch feature/demo-chip-download off `mock`. Verify with
`cd app && npm install && npm run dev:mock` (clicking the chip's download icon saves a real .xlsx).
Open a PR into `mock`.
```

### T6 — PANEL-EVIDENCE
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T6 — PANEL-EVIDENCE")
plus docs/demo/DESIGN-SYSTEM.md. Implement T6 exactly as specified, editing ONLY
app/src/components/RightPanel.svelte and app/src/components/NoteEvidenceView.svelte: remove the
redundant "Cell source" top header bar (keep a small floating close button that calls the existing
closeCommand); relabel the explanation box to "Source"; layout reads explanation box → SQL → result/
notes; unify the highlight color to light blue by switching the NoteEvidenceView <mark> from the
yellow highlight tokens to --color-accent-weak / --color-accent-border so it matches the
explanation box. Branch feature/demo-panel-evidence off `mock`. Verify with `cd app && npm install
&& npm run dev:mock`. Open a PR into `mock`.
```

### T7 — SHELL-DIVIDER
```
Work in the intero repo on the `mock` branch. Read docs/demo/POLISH.md (task "T7 — SHELL-DIVIDER").
Implement T7 exactly as specified, editing ONLY app/src/App.svelte: make the .resize-divider
transparent by default and only color on :hover / .resizing (keep its 4px grab width), so the
visible right-panel separator becomes just RightPanel's 1px border-left — a thin hairline matching
the left panel. Branch feature/demo-shell-divider off `mock`. Verify with `cd app && npm install &&
npm run dev:mock`. Open a PR into `mock`.
```
