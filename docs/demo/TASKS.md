# Intero Demo — Task Breakdown

Read [`README.md`](README.md) and [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) first.

Tasks are designed to be **orthogonal**: each owns a disjoint set of files, so
several agents can work in parallel and land independently. Point each agent at
**one task card** below.

## Ownership matrix

| Task | Owns (edit these) | Reads only (do not edit) |
|---|---|---|
| **DS** Design + icon foundation | `app/src/app.css`, `app/src/components/Icon.svelte` *(new)*, `app/src/App.svelte`, `app/src/components/MainPanel.svelte` | — |
| **MOCK** Mock data & run engine | `app/src/lib/mock.js`, `app/src/lib/mockData.js` *(new)*, mock branches in `app/src/lib/api.js`, `app/src/lib/templates.js` | stores (contract in README §6) |
| **RUN** Run lifecycle & live population glue | `app/src/stores/chat.js`, `app/src/stores/navigation.js`, `app/src/stores/audits.js` | MOCK event contract |
| **HOME** Home screen | `app/src/components/HomeScreen.svelte` | `Icon.svelte`, RUN/MOCK contracts |
| **CARD** Template card | `app/src/components/TemplateCard.svelte` | `Icon.svelte`, indexing store |
| **LEFT** Left panel (ChatGPT-style) | `app/src/components/LeftPanel.svelte` | `Icon.svelte`, audits/navigation stores |
| **SET** Settings modal | `app/src/components/SettingsModal.svelte` | `Icon.svelte` |
| **RESULT** Results, activity & chip | `app/src/components/ResultsView.svelte`, `app/src/components/MessageBubble.svelte`, `app/src/components/SpreadsheetChip.svelte` | `Icon.svelte`, RUN stores |
| **SHEET** Spreadsheet viewer + live fill | `app/src/components/SpreadsheetViewer.svelte` | `Icon.svelte`, `chat.js` (read), MOCK contract |
| **PANEL** Right panel & evidence | `app/src/components/RightPanel.svelte`, `app/src/components/SqlDisplay.svelte`, `app/src/components/SqlResultViewer.svelte`, `app/src/components/NoteEvidenceView.svelte` | `Icon.svelte` |
| **TOAST** Toasts | `app/src/components/Toasts.svelte` | — |

No file appears in two "Owns" cells. The only shared, read-only contracts are the
**design tokens + `Icon.svelte`** (DESIGN-SYSTEM §1) and the **mock event/data
shapes** (README §6) — both fully specified, so component tasks don't need
DS/MOCK/RUN merged before starting (use `<Icon name="…">` against the documented
registry).

## Suggested order & dependencies

- **DS** is foundational (tokens + icon set); start it first. Other tasks code
  against the documented tokens/icon names even before it lands.
- **MOCK** is foundational for data; **RUN** depends on its event contract
  (README §6.4). **SHEET** and **RESULT** consume RUN's stores but only read them.
- Pure visual tasks (**LEFT**, **SET**, **CARD**, **HOME**, **PANEL**, **TOAST**)
  are independent once DS exists.

---

## DS — Design + icon foundation

**Goal:** establish the visual system and the shared icon set.

- Add all tokens from [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) §1.1 to `:root` in
  `app/src/app.css` (ChatGPT-calm palette).
- Normalize base elements (body, button, input/select/textarea) per §1.2.
- Create **`app/src/components/Icon.svelte`** — the inline-SVG line-icon registry
  (§1.3): all icons one family, ~1.75px stroke, `currentColor`, `fill:none`, round
  caps; props `name`, `size`. Include at least the icons listed in the §1.3 table
  (`logo`/eye, `new`, `search`, `settings`, `sidebar`, `more`, `close`, `chevron`,
  `download`, `table`, `stop`, `rename`, `trash`).
- Optionally add shared utility classes (`.btn*`, `.badge`, `.card`) if generic.
- Tokenize the **app shell**: in `App.svelte` migrate the grid background and the
  `resize-divider` colors to tokens; in `MainPanel.svelte` migrate its scroll
  container styling. Do **not** change the component interfaces (props/events) or
  the panel-open grid logic — only the styling values.

**Done when:** tokens resolve, base inputs/buttons look uniform, `Icon.svelte`
renders any registry icon consistently, the shell uses tokens, no regression in
`dev:mock`.

> **Interface stability rule (all tasks):** never change a component's public
> props, dispatched events, or exported store API. Those are the seams other
> tasks read across (e.g. `App.svelte` passes `rightPanelWidth` to `RightPanel`;
> `HomeScreen` renders `TemplateCard` with `template`/`expanded`/`toggle`). Change
> styling and internals freely; keep the seams fixed.

---

## MOCK — Mock data & run engine

**Goal:** run the whole demo with no backend and drive live population.
**Scenario:** CordPhLo (cord blood pH at birth), grounded in
[`database/cord-ph/`](../../database/cord-ph) (README §6).

- Provide the fixed **template** (Cord pH at Birth Audit, README §6.1) and the
  **"Impatient database"** (§6.2); short-circuit `lib/api.js` so `listAudits`,
  `listDatabases`, `uploadAudit`, etc. resolve from the mock in mock mode (today
  only some calls are mocked). Surface mock templates via `lib/templates.js`.
- Implement **indexing simulation** on upload (§6.3): register the template, push
  `indexing` then `ready` after 5–10 s into the indexing store.
- Implement the **run timeline** (§6.4): extend `mockStartRunStream` to emit
  `activity` (each with a short **`headline`** for the collapsed status line, plus
  fuller `summary` reasoning), `workbook_created` (early), a varied sequence of
  `cell_update` batches over ~15–20 s, then `done`. Two scripts:
  - **Flow A** (template): structure ready, populate quickly.
  - **Flow B** (describe): a build phase first ("Building the spreadsheet…",
    "Adding columns: …"), then `workbook_created`, then populate.
- Author the **demo workbook** + **cell metadata** with both evidence types
  (§6.5) using cord-pH fields: direct cells (e.g. Gestation weeks, Birth weight,
  Cord arterial pH, Apgar at 5 min) and interpretive cells combining the
  obstetrician birth-summary note + midwife note (e.g. delayed-cord-clamping
  documented, or the deliberate CFM structured-vs-note conflict).
- Implement `mockExecuteSql` (§6.6): structured rows for direct cells; one
  full-note row per source note for interpretive cells, with `evidence` quotes
  that are verbatim substrings. Branch off SQL fragments (`clinical_notes`,
  `cord_ph_birth_records`).
- Export a realistic **sample doctor's email** for Flow B.

**Done when:** both flows play end-to-end in `dev:mock` purely from the mock
layer; cells fill progressively; direct vs interpretive cells yield the right
evidence.

---

## RUN — Run lifecycle & live-population glue

**Goal:** wire the mock timeline into the stores; fix chip/population timing.

- In `stores/chat.js`, handle the new events: on `workbook_created`, set
  `activeWorkbook` (structured, blank body) **and emit the file chip now** (move
  chip emission off `done`). On `cell_update`, apply value(s)+metadata into
  `activeWorkbook` immutably so the viewer reacts; mark just-changed cells for
  SHEET's flash. On `done`, finalize status without a second chip. Surface each
  activity event's `headline` so RESULT can render the collapsed single line.
- Ensure `runCommand` (cell select) never interrupts population, and an
  in-progress run's workbook + activity survive navigation (extend per-audit sync
  in `audits.js`).
- Keep `navigation.js` transitions consistent with early-chip behavior.

**Done when:** chip is clickable ~1–2 s in; opening it shows a grid that fills
live; switching analyses and back preserves state.

---

## HOME — Home screen

**Goal:** redesign home; rewire the describe box to start a run.

- Apply the design system; remove `＋`/`✦`; redesign the upload + describe cards.
- Rename **"Generate" → "Run analysis"** (README §7).
- **Rewire** the describe action: instead of `generateData` text streaming, start
  the same run flow as the template (build + populate via RUN/MOCK, Flow B).
  Offer the mock sample email as placeholder.
- Use "analysis" terminology in copy.

**Done when:** home looks consistent and icon-free; "Run analysis" launches Flow B.

---

## CARD — Template card

**Goal:** redesign the card; fix run configuration.

- Apply tokens; **delete the `→` arrow**; replace `⋯` with the `more` icon menu;
  text-only badges; the run button reads **"Run analysis"**.
- **Filters start empty** — remove the last-year date defaults in
  `buildDefaultFilters`; all fields blank.
- **Pre-select "Impatient database"** when expanded (it is the single ready
  database; verify the existing default-to-sole-ready path selects it).
- Show the indexing explanation line while a freshly uploaded template indexes.

**Done when:** card is clean and arrow-free; expanding shows empty filters +
preselected Impatient database; Run analysis works in mock mode.

---

## LEFT — Left panel (ChatGPT-style)

**Goal:** rebuild the sidebar to the reference layout (DESIGN-SYSTEM §6).

- **Expanded:** logo (eye) + `sidebar` collapse icon in the header; **New
  analysis** (`new`) and **Search analyses** (`search`) menu rows; then the past
  analyses **by name only** (no date) with a gray-box hover and a `more` menu
  (Rename/Delete) revealed on hover; **Settings** (`settings`) pinned at the
  bottom.
- **Collapsed:** thin rail with logo (top), `new` + `search` icons, and
  `settings` at the bottom; analyses list hidden.
- Single canonical `sidebar` collapse control in both states. Keep persisted
  width/collapsed behavior; restyle to tokens. (A working client-side name filter
  for "Search analyses" is preferred but optional.)

**Done when:** the sidebar matches the ChatGPT-style spec, icon-only when
collapsed, gray-box hover + `more` menu on list rows, settings at the bottom.

---

## SET — Settings modal

**Goal:** redesign settings.

- Apply tokens; remove `🗄️`/`＋`; `more`/`close` icon buttons; text-only badges;
  consistent tabs (DESIGN §3.5, §3.7, §3.9, §7).

**Done when:** modal matches the system; no emojis; tabs/menus consistent.

---

## RESULT — Results, agent activity & chip

**Goal:** redesign the run view, fix the activity-card folding, restyle the chip.

- **Agent-activity card (README §5):**
  - **Collapsed = one fixed-height line** showing the latest event's short
    `headline` (single sentence, ellipsis-truncated). The row height must not
    change as messages change — drop the current "show full latest message"
    behavior that causes height jumps.
  - **Expanded = fixed-height scroll window** through the full reasoning; the
    container height stays constant.
  - **Keep the pin-to-bottom logic:** auto-scroll only when the user is already at
    the bottom; if scrolled up, do not yank them down.
  - Disclosure via the `chevron` icon (rotate); stop control via the `stop` icon;
    spinner restyled to tokens.
- `MessageBubble.svelte`: token styling.
- `SpreadsheetChip.svelte`: the plain chip with the `table` line icon (no `📊`,
  no `↓`) — DESIGN §3.3.

**Done when:** collapsed activity is a stable single line; expanded scrolls at a
fixed height without auto-yank; chip is a modern monochrome file chip.

---

## SHEET — Spreadsheet viewer + live fill

**Goal:** style the grid and render progressive population.

- Restyle viewer/tabs and the clickable-cell affordance to tokens (accent
  underline, no raw `#0066cc`, no in-cell icon).
- **Incremental updates:** support updating cell values **in place** as
  `activeWorkbook` data changes (read RUN's store) without a full `jspreadsheet`
  remount, and apply the **fill flash** (DESIGN §3.8) to newly written cells.
- Keep cell-click → `runCommand` traceability working during population.

**Done when:** the grid fills cell-by-cell/region-by-region with a flash, stays
clickable throughout, and matches the system visually.

---

## PANEL — Right panel & evidence

**Goal:** redesign "Cell source" and its sub-views.

- Apply tokens to `RightPanel.svelte` (DESIGN §4); replace `×` with a `close`
  icon button.
- `SqlDisplay.svelte`, `SqlResultViewer.svelte`, `NoteEvidenceView.svelte`: token
  styling; keep the highlight + scroll-into-view behavior.
- Confirm both branches read well: direct (explanation → SQL → result table) and
  interpretive (explanation → SQL → full notes with highlights).

**Done when:** the panel reads as one clean column for both evidence types and is
icon-consistent.

---

## TOAST — Toasts

**Goal:** restyle toasts to the system (DESIGN §3.10). Small, self-contained.

**Done when:** toasts use surface + shadow + status left-border, text only.
