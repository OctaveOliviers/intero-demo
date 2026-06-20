# Paediatric BPT Performance Dashboards — Front-End Spec (mock/demo)

**Status:** Draft for build. Mock-only. Paediatrics department demo.
**Product user:** a paediatrics Head of Department / clinical lead who wants to track UK NHS
Best Practice Tariffs (BPTs), drill into the supporting data, and see source evidence — to
maximise their department's BPT revenue.
**Scope of this turn:** spec only — no app code.

This spec is written to be **buildable end-to-end by an independent engineer with no further
questions.** Every existing component it references was verified by reading the file (paths
are links). It deliberately does **not** prescribe build order — see the component inventory
(§9) and acceptance criteria (§10); the builder sequences the work.

**Companion research (Part A) — complete:**
[`docs/research/nhs-paediatric-bpt-research.md`](../research/nhs-paediatric-bpt-research.md)
— current NHS framework (2025/26 NHS Payment Scheme, Annex C / Annex DpC), the three chosen
BPTs, the **§3 tracker tables (21 trackers: 8 / 7 / 6)** with exact per-criterion DB
fields/conditions/thresholds/time-windows, and the **§4 submission deadlines**. Every tracker
in §8 below maps to a numbered row in research §3; the builder reads the exact field-level
criteria there.

---

## 0. Brief → section map

| Requirement | Section |
|---|---|
| Home: existing input on top | [§2.1](#21-existing--unchanged) |
| Home: card grid (one per dashboard) w/ logo **and deadline**; card → opens dashboard | [§2.2](#22-dashboard-card-grid-net-new) |
| Home: typing → agent suggestion **overlays the cards on top; cards stay put, nothing else moves** | [§2.3](#23-typing-overlays-the-cards-corrected) |
| Audit page: title on top → **deadline** → view-switch chip; title spans both views | [§3.2](#32-title-deadline-then-the-view-chip) |
| Audit page: default = full tracker dashboard (a **live artifact**, §5) | [§3.3](#33-single-view--dashboard-default) |
| Audit page: chip → workbook only (whole panel) | [§3.4](#34-single-view--workbook) |
| Audit page: tracker element click → main-panel split, rows highlighted | [§3.5](#35-element-click--split-view-net-new) |
| Audit page: **dual close-chips** in split (one per pane, hover-✕ closes a pane) | [§3.6](#36-the-split-view-chips-corrected) |
| Audit page: workbook cell click → RIGHT panel evidence (unchanged) | [§3.7](#37-workbook-cell-click--right-panel-evidence-unchanged) |
| Left panel: fold-in + tracked dashboards by logo (list + rail), logo → opens dashboard | [§4](#4-left-panel) |
| Dashboard = a live (Claude-artifact-style) visual; click-to-drill only, no other controls | [§5](#5-the-tracker-dashboard-is-a-live-artifact) |
| Epilepsy + trauma need **new mock datasets** | [§6](#6-mock-wiring--the-two-new-datasets) |
| 5–10 relevant trackers **per** dashboard (15–30 total) | [§8](#8-dashboards--trackers-from-part-a-research) |
| Data shapes / contracts | [§7](#7-data-shapes-mock-only) |
| Component inventory + acceptance criteria | [§9](#9-components-to-create--edit), [§10](#10-acceptance-criteria-definition-of-done) |

---

## 1. What exists today (verified by reading the files)

Svelte 4 + Vite, source under `app/src`.

- **Shell — [`app/src/App.svelte`](../../app/src/App.svelte):** CSS grid `auto 1fr` →
  `auto 1fr auto auto` when the right panel is open. Right panel opens only when
  `currentView === "results" && resultViewUiState.rightPanelOpen`.
- **Router — [`app/src/components/MainPanel.svelte`](../../app/src/components/MainPanel.svelte):**
  switches on `currentView` → `HomeScreen | ResultsView | LibraryPanel`.
- **Home — [`app/src/components/HomeScreen.svelte`](../../app/src/components/HomeScreen.svelte):**
  two zones meeting at a centre divider. Top = request bar (`+` menu, `textarea` bound to
  `requestText`, run arrow `.send-btn`/`requestRun`). Bottom = **agent zone**, rendered only
  when `phase !== "idle"` (`idle → parsing → ready → error`) showing `InputSpec`+`OutputSpec`.
  **When `phase === "idle"` the agent zone is empty today** — this is where the card grid goes.
- **Audit/results — [`app/src/components/ResultsView.svelte`](../../app/src/components/ResultsView.svelte):**
  `header.top-band` = `h1` title (`currentAudit.title`) + `.band-controls` (download /
  inclusion-criteria / activity eye) + `.status-counters`; then a `.subtitle` deadline line
  (`getDeadlineSubtitle(currentAudit.submissionDeadline)`); then `section.sheet-viewport`
  rendering **`SpreadsheetViewer`**. **Today the workbook is the only main-panel content;
  there is no tracker, no view switch.**
- **Workbook — [`app/src/components/SpreadsheetViewer.svelte`](../../app/src/components/SpreadsheetViewer.svelte):**
  `jspreadsheet-ce` grid. Cell background = status (`STATUS_BACKGROUND`); `onselection`
  (single cell) → `openCellEvidence(cellRef, meta)` + `runCommand(...)`. Styles applied via a
  post-mount/`applyUpdates` `setStyle` pass. **No row-highlight prop today.**
- **Right panel — [`app/src/components/RightPanel.svelte`](../../app/src/components/RightPanel.svelte):**
  modes in [`resultViewUi.js`](../../app/src/stores/resultViewUi.js): `CELL_EVIDENCE`
  (status + explanation + SQL + source via `SqlResultViewer`/`NoteEvidenceView`),
  `AGENT_ACTIVITY`, `INCLUSION_CRITERIA`. Opens as the 4th grid column.
- **Left panel — [`app/src/components/LeftPanel.svelte`](../../app/src/components/LeftPanel.svelte):**
  expanded (header logo + collapse; `.menu` rows New / Search / Templates / Databases;
  `.list` of audits **by `audit.title` text**; footer) and a collapsed `.rail` of fixed nav
  icons. Collapse persisted in `localStorage`. **Audit rows have no logo; the rail has no
  per-audit entries.**
- **Navigation — [`app/src/stores/navigation.js`](../../app/src/stores/navigation.js):**
  `currentView`, `currentAuditId`, `selectAudit(id)` (sets audit + `currentView="results"` +
  `openWorkbook`), `goHome()`.
- **Catalog / datasets — [`templateCatalog.js`](../../app/src/lib/templateCatalog.js) +
  content pack [`en.js`](../../app/src/lib/mock/content/en.js):** each audit is a `catalog`
  entry (`id`, `name`, `fileName`, **`submissionDeadline`**, `description`, `columns`). NPDA =
  `npda-lo-audit`, `submissionDeadline: "2026-07-20"`. The seeded home/sidebar list is
  `CONTENT.analyses`.
- **Mock data engine — [`mockData.js`](../../app/src/lib/mockData.js):** `buildDataset({ id,
  sheet, label, columns, rowOrder, records, makeCell })` assembles a dataset; `cordAll`,
  `cordNicu`, `chestPain`, **`npda`** are built this way (NPDA = "Dataset 3", lines ~447–800,
  with `makeNpdaCell`, code maps, and `X.npda*` explanation builders). `buildTimeline(flow)`
  replays a run (Flow C = NPDA). Mock toggled by `VITE_MOCK` (`npm run dev:mock`).
- **Icons — [`Icon.svelte`](../../app/src/components/Icon.svelte):** a **fixed named set**
  (`logo, new, search, settings, …`). **No per-dashboard logos exist** → net-new (§4.1).

**Net-new this spec:** `TrackerDashboard.svelte`, `TrackerChart.svelte`,
`DashboardCardGrid.svelte`, a view-switch chip + per-pane close-chips, per-dashboard logo
glyphs, a `highlightRefs` prop on `SpreadsheetViewer`, two new mock datasets (epilepsy,
trauma), and `trackers`/dashboard descriptors in the content pack. Everything else is a delta.

---

## 2. Home screen

`HomeScreen.svelte`. Keep the input; add a card grid below it; the agent suggestion overlays
the cards without moving them.

### 2.1 Existing — unchanged
Heading, request bar (`+` menu, `textarea`, run arrow), the `idle→parsing→ready→error`
machine, and `requestRun`/`runFromSpec` ("start analysis") are unchanged.

### 2.2 Dashboard card grid (net-new)
Render a card grid in the agent zone (the area below the divider). One card per **tracked
dashboard** (the seeded BPT audits, §7.1). Each card shows:
1. the dashboard's **logo** (§4.1),
2. its **title** (BPT / national-audit name),
3. a one-line **subtitle** (tariff focus),
4. the **submission deadline** (same `submissionDeadline` the audit page shows — e.g.
   "Submission deadline: 20 Jul 2026", formatted via `getDeadlineSubtitle`).

Click a card → open that dashboard in the main panel, identical to selecting it from the left
panel: `selectAudit(dashboard.auditId)`. New component **`DashboardCardGrid.svelte`** reads
the dashboard list (§7.1) and emits `select` → `HomeScreen` calls `selectAudit`.

```
            ┌───────────────── HOME (phase = idle) ─────────────────┐
            │                What would you like to know?           │  heading (existing)
            │        ┌───────────────────────────────────────┐     │
            │        │ +  Ask anything…                    →  │     │  request bar (existing)
            │        └───────────────────────────────────────┘     │  ── centre divider ──
            │        ┌──────────┐ ┌──────────┐ ┌──────────┐        │
            │        │  ◇ logo  │ │  ◇ logo  │ │  ◇ logo  │        │  NEW card grid
            │        │ Diabetes │ │ Epilepsy │ │ Trauma   │        │  (one per dashboard)
            │        │ BPT·NPDA │ │ BPT·E12  │ │ BPT·NMTR │        │
            │        │ due 20Jul│ │ due …    │ │ due …    │        │  ← deadline on each card
            │        └──────────┘ └──────────┘ └──────────┘        │
            └───────────────────────────────────────────────────────┘
```

### 2.3 Typing overlays the cards (CORRECTED)
**The cards do not disappear and do not move.** When the user starts typing, the agent
suggestion **unfolds on top of the cards** (a higher z-index overlay); the cards stay exactly
in place and recede to the background (e.g. dimmed / slightly lowered contrast). **The only
thing that moves or changes on the home screen is the agent suggestion unfolding.** Clearing
the input collapses the overlay; the cards return to the foreground in place.

Implementation: in `HomeScreen`, render `DashboardCardGrid` in the agent zone **always**.
Render the existing agent fold (thinking → `InputSpec`/`OutputSpec`) as an **absolutely
positioned overlay** within the same agent zone, shown only when `phase !== "idle"`, layered
above the cards (`z-index`), with the cards visually de-emphasised while it is open. Do **not**
unmount or reflow the cards. The request bar and run logic are unchanged.

```
            ┌──────────── HOME (user is typing) ────────────────────┐
            │        ┌───────────────────────────────────────┐     │
            │        │ +  children under 12 with HbA1c…    →  │     │  request bar (existing)
            │        └───────────────────────────────────────┘     │  ── divider ──
            │        ┌───── agent suggestion (overlay) ──────┐     │  unfolds ON TOP
            │        │ ◐ Reading request…                    │     │  (z-index above cards)
            │        │ ┌ Cohort ┐  ┌ Output ┐                │     │
            │        │ └────────┘  └────────┘                │     │
            │        └───────────────────────────────────────┘     │
            │        ░░ Diabetes ░░ Epilepsy ░░ Trauma ░░          │  cards: same place,
            └───────────────────────────────────────────────────────┘  dimmed, NOT moved
```

---

## 3. Audit / dashboard page

`ResultsView.svelte`. The title sits above the deadline, above a single view chip. Tracker and
workbook are two views of the **same audit environment**. This supersedes any tab-based idea.

### 3.1 View-state model (local state in `ResultsView`)
```
view: { mode: "single", pane: "dashboard" }   // default — full tracker dashboard
     | { mode: "single", pane: "workbook"  }   // full workbook
     | { mode: "split",  selection: { trackerId, elementKey } }  // dashboard L + workbook R
```
Transitions:
- selector chip (single mode) switches `pane` "dashboard" ⇄ "workbook".
- clicking a tracker element (only possible in `single/dashboard`) → `split` with that
  `selection`.
- in `split`, closing a pane → `single` showing the surviving pane; `selection` cleared.

The **title `h1` and the deadline render once, above the chip area**, for every mode (they are
outside the swapped view region). `.band-controls` and `.status-counters` stay in the title
row, unchanged.

### 3.2 Title, deadline, then the view chip
Order, top to bottom: **(1) title row** (existing `h1` + band-controls + status-counters) →
**(2) deadline subtitle** (existing `.subtitle`, always present for BPT audits because each
sets `submissionDeadline`) → **(3) the view chip** (net-new, single mode only — see §3.6) →
**(4) the view region**.

```
   ┌──────────────────────── AUDIT PAGE — top ────────────────────────┐
   │  Paediatric Diabetes BPT (NPDA)        [⤓] [⚙] [👁]   ⬤2  ⬤5     │ (1) title row
   │  Submission deadline: 20 Jul 2026                                 │ (2) deadline
   │  ▣ Dashboard ⌄                                                    │ (3) view chip (single)
   ├──────────────────────────────────────────────────────────────────┤
   │  … view region …                                                  │ (4)
   └──────────────────────────────────────────────────────────────────┘
```

### 3.3 Single view — Dashboard (default)
`view = single/dashboard`: the whole region below the chip is **`TrackerDashboard.svelte`**
(a live artifact — §5), rendering this BPT's 5–10 trackers (§8). Each chart element is
clickable (§3.5).

### 3.4 Single view — Workbook
`view = single/workbook`: the whole region below the chip is **only** `SpreadsheetViewer`
(today's behaviour, full workbook, no tracker beside it). Reached via the selector chip.

### 3.5 Element click → split view (net-new)
From the dashboard (single) only, clicking a tracker element (donut slice, time-series point,
histogram bar, stat card) **splits the main panel side by side: tracker LEFT, workbook
RIGHT** — *in the main panel, not the right panel.* The right pane is `SpreadsheetViewer`
showing the data for that tracker with **the rows for the exact value clicked highlighted**
(via the new `highlightRefs` prop, §7.3; refs come from the clicked element's `highlightRefs`,
§7.2). `view` becomes `split` with `selection = { trackerId, elementKey }`.

```
   ┌──────────────── split (a tracker element was clicked) ───────────────┐
   │  ┌ ▣ Dashboard  ✕ ┐            ┌ ▦ Workbook  ✕ ┐                      │ ← per-pane chips (§3.6)
   │  ┌──── dashboard (left) ────┐ │ ┌──── workbook (right) ───────────┐  │
   │  │  DKA-related admissions  │ │ │  rows for THIS value highlighted │  │
   │  │     ◔ 18%  ◀ clicked     │ │ │  ▓ NPD003  …                     │  │
   │  └──────────────────────────┘ │ │  ▓ NPD006  …                     │  │
   │                               │ └──────────────────────────────────┘  │
   │            main panel split (NOT the right panel)                     │
   └──────────────────────────────────────────────────────────────────────┘
```

### 3.6 The view / split chips (CORRECTED)
Two chip behaviours, by mode:

**Single mode — one selector chip** (below the deadline): a caret chip labelled by the current
pane, with a dropdown to choose the other view.
- `single/dashboard` → `[▣ Dashboard ⌄]`; dropdown → choose **Workbook** → `single/workbook`.
- `single/workbook`  → `[▦ Workbook ⌄]`; dropdown → choose **Dashboard** → `single/dashboard`.

**Split mode — two per-pane chips, no caret** (the selector chip is gone): one chip at the top
of each pane — `[▣ Dashboard]` above the left pane, `[▦ Workbook]` above the right pane.
- On **hover** of a pane chip, a small **✕** appears at its right end.
- Clicking the **✕** closes that pane → return to `single` showing the **surviving** pane,
  and the selector chip (with caret) returns. The split `selection`/highlight is cleared.
  - close ✕ on **Workbook** chip → `single/dashboard`.
  - close ✕ on **Dashboard** chip → `single/workbook`.

```
   SINGLE (dashboard)            SINGLE (workbook)            SPLIT
   ┌ ▣ Dashboard ⌄ ┐             ┌ ▦ Workbook ⌄ ┐             ┌ ▣ Dashboard ✕┐   ┌ ▦ Workbook ✕┐
     │ dropdown:                   │ dropdown:                   (hover→✕ closes      (hover→✕ closes
     │  • Dashboard ✓              │  • Dashboard                 left pane →           right pane →
     │  • Workbook                 │  • Workbook ✓                single/workbook)      single/dashboard)
```

### 3.7 Workbook cell click → right panel evidence (unchanged)
Clicking a value/cell in the workbook (in `single/workbook` or in the split's right pane)
opens the **right panel** with the existing behaviour **unchanged**:
`openCellEvidence(cellRef, meta)` → `RightPanel` `CELL_EVIDENCE` → status + explanation + SQL
query + source material (`SqlResultViewer` for DB values, `NoteEvidenceView` for doctor
notes). No change to `SpreadsheetViewer.onselection`, `resultViewUi.js`, or `RightPanel`. In
split, this yields the full drill chain: tracker value → its rows (main-panel split) → one
row's evidence (right panel, the 4th grid column) — all three visible at once.

---

## 4. Left panel

`LeftPanel.svelte`. Fold-in is **unchanged**. Delta: tracked dashboards gain logos and appear
in the collapsed rail.

### 4.1 Per-dashboard logos (net-new)
Each dashboard gets a **recognizable logo**. `Icon.svelte` has none today, so add one icon key
per dashboard (e.g. `dash-diabetes`, `dash-epilepsy`, `dash-trauma` — a distinct single-colour,
token-driven glyph each), and a `logo` field on the dashboard descriptor (§7.1).

### 4.2 Expanded — list rows with logos
The existing `.list` renders audits by `audit.title`. The tracked dashboards ARE those rows.
Delta: render a **leading logo** (`Icon name={dash.logo}`) in each row, below the existing
`.menu` buttons where the list already sits. Row click still calls `selectAudit(id)`.

### 4.3 Collapsed — dashboard logos in the rail
When folded, the `.rail` shows the fixed nav icons (unchanged) and **below them a stack of the
dashboard logos**. Pressing a logo → `selectAudit(id)` (same as a card or an expanded row).

```
   EXPANDED                        COLLAPSED RAIL
   ◉ Intero            [‹]         ◉  (expand)
   ＋ New audit                    ＋  🔍  ▦  ▤
   🔍 Search                       ───
   ▦ Templates                     ◇  ← Diabetes BPT
   ▤ Databases                     ◇  ← Epilepsy BPT
   ── Tracked dashboards ──        ◇  ← Trauma BPT
   ◇ Paediatric Diabetes BPT       ⚙  ⎋  (pinned bottom)
   ◇ Paediatric Epilepsy BPT
   ◇ Paediatric Trauma BPT
```

---

## 5. The tracker dashboard IS a live artifact

The tracker dashboard must be built as a **self-contained, presentational "live artifact"** —
the same shape as a Claude artifact ([reference](https://code.claude.com/docs/en/artifacts)):
a single self-contained page expressible in **HTML + CSS + inline JS (and SVG)**, **no external
requests, no backend, live/interactive**. Concretely for this build:

- **What it is:** `TrackerDashboard.svelte` renders the dashboard's trackers as **SVG / HTML /
  CSS charts** (via `TrackerChart.svelte`), driven entirely by the mock `trackers` data (§7.2).
  Self-contained and presentational — it reads data and draws; it owns no run state.
- **Chart kinds** (enough for the demo): `donut` (proportion meeting a criterion),
  `timeseries` (a metric across clinic months), `histogram` (distribution across bands),
  `stat` (single headline number vs target). Prefer hand-rolled SVG so each datum is a
  hit-target; a self-contained chart lib is acceptable but not required.
- **No interactive controls.** Do **not** add filters, sliders, toggles, dropdowns, date
  pickers, or text inputs on the dashboard. The **only** interaction is **clicking a single
  data element** — a donut slice, a time-series point, a histogram bar/column, or a stat card —
  which emits a drill event `{ trackerId, elementKey }` → `ResultsView` enters split view and
  highlights the relevant workbook rows (§3.5).
- **Scope note (do not over-build):** we are **not** publishing to claude.ai's artifacts
  feature (that needs a Team/Enterprise login and produces a static capture). We implement the
  same *shape* inside the app as the Svelte component above. No network calls, no app/run state
  mutation from the dashboard — render + emit-drill only.

Each tracker element carries the workbook row refs it highlights (§7.2), so the drill is a
pure data lookup, not a query.

---

## 6. Mock wiring & the two new datasets

Mock-only (`npm run dev:mock`, `VITE_MOCK=true`, and the prod build). The 3 BPT dashboards are
**seeded audits**: a `catalog` entry + a `CONTENT.analyses` entry (so they appear in the home
cards and the left-panel list) + a `buildDataset(...)` dataset replayed by a run timeline.

- **Dashboard 1 (Diabetes) reuses the existing NPDA flow** `npda-lo-audit` end-to-end
  (`mockData.js` Dataset 3 + its catalog/analyses entries). No new dataset needed.
- **Dashboards 2 (Epilepsy) and 3 (Trauma) each need a NEW mock dataset.** This is explicit:
  replicate the NPDA pattern for each. For dashboard *X* ∈ {epilepsy, trauma}, add:
  1. **Content pack** (`en.js`, mirrored in `de.js`/`fr.js`/`nl.js`):
     - `columns.X` — the audit's column headers (translatable),
     - `records.X` — one record per patient/case (human text translatable; codes/dates/numbers
       not),
     - any `codeMaps.*` the audit needs (permitted-value labels),
     - `explain.X*` — the right-panel explanation builders per field,
     - a **`catalog` entry** (`id`, `name`, `fileName`, **`submissionDeadline`** from §8,
       `description`, `columns`),
     - an **`analyses` entry** (or equivalent seed) so it shows as a tracked dashboard.
  2. **`mockData.js`:** `X_RECORDS`, `X_ROW_ORDER`, `X_COLUMNS`, code maps, a `makeXCell(colKey,
     {r, ref, db})` builder (DIRECT cells via a `xDirect` helper → SQL + structured result;
     INTERPRETIVE cells via a `xInterp` helper → doctor-notes query + verbatim `evidence`
     spans — exactly as `makeNpdaCell` does), and `const X = buildDataset({ id, sheet, label,
     columns: X_COLUMNS, rowOrder: X_ROW_ORDER, records: X_RECORDS, makeCell: makeXCell })`.
     Wire it into the run replay (a new timeline flow, or map the template id → dataset) so the
     seeded run produces a populated workbook with cell evidence.
  - Keep each dataset modest (≈8–12 cases) but include the fields every tracker's criterion
    needs (§8), plus a few genuine "not done / blocked" cells so cell-evidence states show.
- **Tracker data lives in the content pack** too: a `trackers` map keyed by dashboard id
  (§7.2). `TrackerDashboard` reads it by dashboard id. Human-readable tracker strings are
  translatable; numbers/codes/refs are not.

---

## 7. Data shapes (mock-only)

### 7.1 Tracked-dashboard descriptor (drives home cards §2.2 + left panel §4)
```js
{
  id: "paediatric-diabetes-bpt",
  auditId: "npda-lo-audit",          // the seeded audit selectAudit() opens
  title: "Paediatric Diabetes BPT",
  logo: "dash-diabetes",             // Icon.svelte key (§4.1)
  subtitle: "NPDA · 7 care processes",
  submissionDeadline: "2026-07-20",  // shown on the card AND the audit page (§2.2, §3.2)
  trackers: ["t-hba1c-coverage", "t-care-processes", "t-mean-hba1c", "..."], // ids into §7.2
}
```
`submissionDeadline` may be read through from the catalog entry to avoid duplication.

**Deadline display (date OR cadence).** `submissionDeadline` is either an **ISO date**
(diabetes `"2026-07-20"`, epilepsy `"2027-01-12"`) formatted via the existing
`getDeadlineSubtitle`, or a **free-text cadence string** (trauma `"Submit ≤25 days of
discharge"`) shown **verbatim**. Both the home card (§2.2) and the audit-page subtitle (§3.2)
must render a non-date string as-is rather than passing it through date formatting — a tiny
guard: if the value parses as a date, format it; otherwise show the string.

### 7.2 Tracker descriptor
```js
{
  id: "t-dka-admissions",
  dashboardId: "paediatric-diabetes-bpt",
  title: "DKA-related admissions",
  kind: "donut",                       // "donut" | "timeseries" | "histogram" | "stat"
  target: { op: "<=", value: 0.10 },   // optional target line/threshold drawn on the chart
  elements: [                          // each clickable element → the rows it highlights
    { key: "dka",    label: "DKA",    value: 0.18, highlightRefs: ["NPDA!B4","NPDA!B7"] },
    { key: "no-dka", label: "No DKA", value: 0.82, highlightRefs: ["NPDA!B3","NPDA!B5"] },
  ],
  criterion: "BPT criterion + citation [n] (from the research doc §3)",
}
```
- `donut`/`histogram`: `elements[].value` = proportions / bar heights; `timeseries`:
  `elements` are ordered points (`label`=month, `value`=metric); `stat`: single `elements[0]`.
- `highlightRefs` = full `sheet!A1` refs passed to `SpreadsheetViewer.highlightRefs` (§7.3).
- `criterion` ties the tracker to the precise BPT database criterion in the research doc.

### 7.3 `SpreadsheetViewer` highlight prop (delta to an existing component)
New optional prop `highlightRefs: string[]` (default `[]`). When non-empty, those rows get a
highlight style layered onto the existing status backgrounds in the post-mount/`applyUpdates`
`setStyle` pass. **No change** to `onselection`, evidence, status logic, or any other caller
(default `[]` is a no-op for `single/workbook`).

---

## 8. Dashboards & trackers (from Part A research)

Three dashboards, **21 trackers total** (5–10 each), tracking only revenue/compliance-relevant
values — no padding. Each tracker below names its chart kind and its research row; the **exact
DB fields / conditions / thresholds / time-windows / cohort live in research §3** (the
builder reads them there to populate the mock workbook fields and the tracker `criterion`).
**Cohort defaults** (research §3): A = `diabetes_type` recorded, age 0–18, `visit_date` ∈
audit year, scoped by `pdu_number`; B = CYP ≤18 with epilepsy diagnosis, first year of care,
TFC 223; C = paediatric (<16) major-trauma at the MTC with ≥1 AIS3+ injury.

### Dashboard 1 — Paediatric Diabetes BPT · reuse `npda-lo-audit` · 8 trackers
Deadline: keep the catalog's `submissionDeadline: "2026-07-20"` (research §4: NPDA audit year
1 Apr–31 Mar, quarterly windows; final 16 Apr 2027 — the existing value is fine for the demo).

| # | Tracker | Chart | Research |
|---|---|---|---|
| A1 | HbA1c ≥4×/yr coverage (target ≥90%) | donut | §3 A1 |
| A2 | Seven NICE annual health checks (per-check + % all-7) | histogram + stat | §3 A2 |
| A3 | MDT clinic ≥4/yr + ≥8 extra contacts | stat / histogram | §3 A3 |
| A4 | Annual psychology assessment | donut | §3 A4 |
| A5 | Additional dietitian appointment offered | donut | §3 A5 |
| A6 | Carb-counting ≤14d of diagnosis (new T1) | donut | §3 A6 |
| A7 | High-HbA1c (≥69 mmol/mol) follow-up flag | stat / histogram | §3 A7 |
| A8 | Coeliac + thyroid screening at diagnosis (new T1) | donut | §3 A8 |

### Dashboard 2 — Paediatric Epilepsy BPT (Epilepsy12) · NEW dataset · 7 trackers
Deadline: `submissionDeadline: "2027-01-12"` (research §4: Cohort 8; census closes 30 Nov,
submission ~mid-January).

| # | Tracker | Chart | Research |
|---|---|---|---|
| B1 | Epilepsy-expert paediatrician ≤2 weeks of referral | donut | §3 B1 |
| B2 | ESN input within first year | donut | §3 B2 |
| B3 | MRI ≤6 weeks where indicated | donut | §3 B3 |
| B4 | ECG in convulsive seizures | donut | §3 B4 |
| B5 | Mental-health screening + support | donut / stacked stat | §3 B5 |
| B6 | Comprehensive care plan by 12 months | donut | §3 B6 |
| B7 | Valproate/topiramate safety (PPP, females ≥12) | donut / stat | §3 B7 |

### Dashboard 3 — Paediatric Major Trauma BPT (NMTR/TARN) · NEW dataset · 6 trackers
Deadline: **rolling per-case, not an annual date** — `submissionDeadline: "Submit ≤25 days of
discharge"` shown verbatim (research §4: 25 days for the BPT vs 40 days for the registry
audit). See §7.1 for how a non-date deadline string is displayed.

| # | Tracker | Chart | Research |
|---|---|---|---|
| C1 | Registry submission ≤25 days of discharge (the BPT trigger) | donut + stat (median days) | §3 C1 |
| C2 | Consultant-led trauma-team reception ≤5 min (Level 2, ISS ≥16) | donut | §3 C2 |
| C3 | CT head ≤60 min (GCS ≤13 head injury, Level 2) | donut | §3 C3 |
| C4 | Tranexamic acid ≤1 h (Level 2) | donut | §3 C4 |
| C5 | Airway considered ≤30 min (GCS <9, Level 1) | donut | §3 C5 |
| C6 | Rehabilitation prescription (ISS ≥9, Level 1) | donut | §3 C6 |

---

## 9. Components to create / edit

| File | New/Edit | Responsibility |
|---|---|---|
| `app/src/components/DashboardCardGrid.svelte` | **New** | Home card grid (logo+title+subtitle+deadline); emits `select`. |
| `app/src/components/TrackerDashboard.svelte` | **New** | The live-artifact dashboard; lays out a BPT's trackers; emits drill `{trackerId, elementKey}`. |
| `app/src/components/TrackerChart.svelte` | **New** | One chart (`donut`/`timeseries`/`histogram`/`stat`) in SVG; each element a hit-target; emits element clicks. |
| `app/src/components/HomeScreen.svelte` | Edit | Always-render `DashboardCardGrid`; render agent fold as a z-index overlay above it (§2.3). |
| `app/src/components/ResultsView.svelte` | Edit | `view` state machine; order title→deadline→chip; render selector chip (single) / per-pane chips (split); dashboard/workbook/split regions. |
| `app/src/components/SpreadsheetViewer.svelte` | Edit | Add `highlightRefs` prop (§7.3). |
| `app/src/components/LeftPanel.svelte` | Edit | Logos on list rows + a logo stack in the collapsed rail (§4). |
| `app/src/components/Icon.svelte` | Edit | Add `dash-diabetes`, `dash-epilepsy`, `dash-trauma` glyphs. |
| `app/src/lib/mock/content/en.js` (+ de/fr/nl) | Edit | `trackers` map; dashboard descriptors; epilepsy+trauma `columns`/`records`/`codeMaps`/`explain`/`catalog`/`analyses`. |
| `app/src/lib/mockData.js` | Edit | Epilepsy + trauma datasets via `buildDataset`; wire their run replay. |

No new stores or routes: card/logo clicks reuse `selectAudit`; the view machine is local to
`ResultsView`; the right panel is untouched.

## 10. Acceptance criteria (definition of done)

1. **Home cards:** in `idle`, one card per dashboard shows logo + title + subtitle + deadline;
   clicking a card opens that dashboard (`selectAudit`).
2. **Home overlay:** typing unfolds the agent suggestion **on top of** the cards; the cards do
   not move or unmount (verify positions are identical before/after); clearing the input
   restores them to the foreground.
3. **Audit order:** title, then deadline, then the chip, then the view region — in that order.
4. **Default view** is the tracker dashboard, full width; the selector chip toggles to the
   full workbook and back.
5. **Live artifact:** the dashboard has no filters/sliders/inputs; only data-element clicks do
   anything.
6. **Split:** clicking a tracker element splits the main panel (dashboard left, workbook right)
   and highlights exactly the rows for the clicked value; the split is in the main panel, not
   the right panel.
7. **Split chips:** in split there is one chip above each pane (no caret); hovering a chip
   reveals an ✕; clicking ✕ closes that pane, returns to the single view of the surviving pane,
   and restores the caret selector chip.
8. **Evidence unchanged:** clicking a workbook cell (single or split) opens the right panel
   with status + explanation + SQL + source material, exactly as today.
9. **Left panel:** each tracked dashboard shows its logo in the expanded list and the collapsed
   rail; clicking a logo opens it.
10. **Datasets:** all three dashboards run in `npm run dev:mock` with populated workbooks and
    working cell evidence; epilepsy and trauma have their own datasets (not NPDA replays).
11. **Trackers:** each dashboard renders 5–10 trackers; every tracker's value/criterion traces
    to the research doc, and every tracker element's `highlightRefs` point at real rows in that
    dashboard's workbook.
