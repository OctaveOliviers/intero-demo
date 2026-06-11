# Home Screen → Task Contract — Demo Build Spec

**Shared context for every subagent.** Read this in full before starting your task.
Each task below has its own copy-paste prompt in
[`home-task-contract-PROMPTS.md`](./home-task-contract-PROMPTS.md). This file is the
single source of truth for the data contract, component APIs, and visual language so
that independently-built pieces fit together without rework.

---

## 1. What we're building (and why)

Today the home screen ([`app/src/components/HomeScreen.svelte`](../../app/src/components/HomeScreen.svelte))
is a stack of audit cards: the user picks a template, fills a filter form, picks a
database, and runs — or uploads a template, or uses a "describe the data" box. Too many
paths, too long.

**New behavior:** the home screen becomes a **single free-text box**. The user types or
pastes a request (e.g. a forwarded clinician email) and presses Enter. The agent
"thinks" for ~3–4 seconds, then renders a **Task Contract** the user can eyeball and edit
before committing to an expensive run:

- **Input specification** — only the cohort filters the agent *actually extracted* from
  the request, each pre-filled, rendered as editable chips, plus a bottom-line health
  check: "≈ N patients/encounters match."
- **Output specification** — a crisp one-liner naming the deliverable, plus a chip naming
  the template (Excel) that will be populated.

Then a **Run analysis** button hands off to the **existing, unchanged** run pipeline.

### Demo flow (this is literally what gets recorded)

1. Operator pastes a prompt into the free-text box, presses Enter.
2. ~3–4 s "agent thinking" state.
3. The Task Contract appears (Input spec + Output spec).
4. Operator may click a chip to tweak a value (optional).
5. Operator clicks **Run analysis**.
6. The user message **and the full contract** appear at the top of the Results
   conversation; agent activity streams below; a `results.xlsx` chip appears; clicking it
   opens the spreadsheet and we watch it populate.
   **Steps 6 reuse the existing cord-pH mock stream + mock workbook with no changes.**

> Because mock mode ignores the template id (see `mockCreateRunFromTemplate` in
> [`app/src/lib/mock.js`](../../app/src/lib/mock.js)), the run always streams the cord-pH
> result regardless of what was parsed. The contract just needs to *look* right and hand
> off cleanly.

---

## 2. Scope / non-goals

- **In scope:** the home screen and the way we preprocess input into a contract.
- **Out of scope:** the backend, the run pipeline, the Results view, the spreadsheet
  viewer, the left/right panels. Do **not** modify them (except T7's single hand-off call
  and T9 mounting the new home screen).
- **Preprocessing is a front-end mock** — deterministic keyword parsing with an artificial
  delay. No new backend calls.
- The old `TemplateCard` / upload / describe cards are **removed from the home screen**
  but their files stay on disk (unused). Do not delete them.

---

## 3. Git workflow (EVERY task)

The integration branch for this demo is **`mock`** (it exists on `origin`).

> ⚠️ You cannot create a branch literally named `mock/...` — a `mock` branch already
> exists and a repo hook blocks trunk-named branches. Use the `feature/demo-<task>` names
> given in each prompt.

For every task:

```bash
git fetch origin
git checkout mock
git pull origin mock
git checkout -b feature/demo-<task-slug>   # exact name is in your prompt
# ... do the work ...
git add -A
git commit -m "<message>"                   # end with the Co-Authored-By trailer
git push -u origin feature/demo-<task-slug>
gh pr create --base mock --head feature/demo-<task-slug> --title "..." --body "..."
```

**Target the PR at `mock`, never `main`.**

### Merge ordering (respect the dependency waves)

Branches that depend on another task's files must only start **after that task's PR is
merged into `mock`** — otherwise the files won't exist on your branch.

```
Wave 1 (parallel):  F1 (data layer)      F2 (chip primitives)
                          └────────┬───────────┘
                          merge both into mock
                                   │
Wave 2 (parallel):  T3  T4  T5     (need F1 + F2)
                    T6  T7         (need F1 only)
                          └────────┬───────────┘
                          merge all into mock
                                   │
Wave 3 (sequential): T8  (needs F1,F2,T3,T4,T6)  → merge → T9 (needs F1,T5,T7,T8)
```

Only **F2** and **T9** touch existing component files; everything else is new files, so
within a wave there are no edit collisions.

---

## 4. Visual language (no design-token file exists — match these exactly)

Colors are inline per-component in this codebase. Reuse this palette:

| Role | Hex |
|---|---|
| Primary blue | `#2563eb` (hover `#1d4ed8`), accent `#3b82f6` |
| Text | `#111827` |
| Muted text | `#6b7280`, `#9ca3af` |
| Borders | `#e5e7eb`, `#d1d5db` |
| Surfaces | `#fff`, `#f9fafb`, `#f3f4f6` |
| Danger | `#b91c1c` / `#ef4444` |
| Radius | 6–12 px |

Reference components for styling parity: the filter form and `.badge` pill in
[`TemplateCard.svelte`](../../app/src/components/TemplateCard.svelte), and the textarea /
send button in [`HomeScreen.svelte`](../../app/src/components/HomeScreen.svelte)'s
`describe-card`. Font is inherited (`-apple-system…`, 14px base).

This is Svelte 4. Components use `<script>` + `createEventDispatcher` + scoped `<style>`.

---

## 5. File map (who creates what)

```
app/src/lib/spec.js              ← F1   (data model + parsers)
app/src/lib/templateCatalog.js   ← F1   (grouped template catalog)
app/src/lib/runFromSpec.js       ← T7   (run hand-off)

app/src/components/spec/Chip.svelte          ← F2  (value-only pill)
app/src/components/spec/ChipPopover.svelte   ← F2  (floating popover shell)
app/src/components/spec/AddFilterChip.svelte ← F2  ("+" expanding add-filter chip)
app/src/components/spec/DatabaseChip.svelte  ← T3
app/src/components/spec/DateChip.svelte      ← T4
app/src/components/spec/Calendar.svelte      ← T4
app/src/components/spec/OutputSpec.svelte    ← T5
app/src/components/spec/CohortPreview.svelte ← T6
app/src/components/spec/InputSpec.svelte     ← T8

app/src/components/HomeScreen.svelte         ← T9  (rewrite; remove old cards)
```

Run the app to verify with: `cd app && npm install && VITE_MOCK=true npm run dev`
(mock mode — no backend needed). The first run may need `npm install`.

---

## 6. The data contract (F1 owns the source of truth)

### 6.1 `Chip`

> **Critical UX rule:** the descriptive label is plain text rendered *beside* the chip by
> the container. **Only `value` lives inside the pill, and the pill is the click target.**
> A filter row reads: `Starting date  [ 3 Jan 2026 ]` where only `[ 3 Jan 2026 ]` is the chip.

```js
// Chip
{
  id: string,          // crypto.randomUUID()
  kind: 'value' | 'codes' | 'date' | 'database' | 'template',
  field: string,       // machine key: 'condition' | 'dateFrom' | 'dateTo' |
                       //   'specialty' | 'ward' | 'admissionMethod' | 'age' |
                       //   'codes' | 'patientList' | 'database' | 'outputTemplate'
  label: string,       // plain-text label shown BESIDE the pill, e.g. 'Starting date'
  value: string,       // display value INSIDE the pill, e.g. '3 Jan 2026'
  raw?: any,           // optional structured backing value, e.g. ISO '2026-01-03'
  options?: { value: string, label: string }[]  // for fixed-option value chips
}
```

### 6.2 `JobSpec` (returned by `parseRequest`)

```js
{
  request: string,        // original user text
  cohort: Chip[],         // ONLY the relevant, prefilled filters (never empty placeholders)
  output: {
    summary: string,      // crisp one-liner, e.g. 'Local medical Cord audit'
    templateChip: Chip,   // kind:'template'; value = template name; raw = templateId
  },
  resolvedCount: number,  // health-check N
  countNoun: 'patients' | 'encounters',
}
```

### 6.3 F1 functions

```js
parseRequest(text: string): Promise<JobSpec>
  // ~3500 ms artificial delay (the "agent thinking" pause).
  // Deterministic keyword parse. For ANY cord / pH / neonatal / "sore throat" /
  // generic clinical request it must return a credible cohort + a Local-audit output.
  // Seed value: resolvedCount = 42 and countNoun = 'patients'  ← MUST be 42 to match the
  //   mock activity line "Found 42 matching patient records" in app/src/lib/mock.js.
  // Recognise and prefill (only those present in the text):
  //   condition, specialty, ward, admissionMethod, age, codes, dateFrom/dateTo, database.
  //   Relative dates like "last 6 months" resolve against today = 2026-06-03
  //   (so "last 6 months" → dateFrom 2025-12-03). Render values human-readable
  //   ("3 Jan 2026") with raw = ISO.
  //   The 'database' chip defaults to value 'EHR database'.

parseAdditionalFilters(text: string): Promise<Chip[]>
  // ~1000 ms delay. Turns a free-text phrase into one or more new cohort Chips.
  // Used by the bottom "+" add-filter affordance.

resolveCohortCount(cohort: Chip[]): number
  // Deterministic. Returns 42 for the seed cohort; each filter added beyond the seed
  // reduces the count by a deterministic ~15–30%. Do not use Math.random for the base.
```

### 6.4 `templateCatalog.js`

```js
export const TEMPLATE_CATALOG = [
  { category: 'National audits', templates: [Template, ...] },
  { category: 'Local audits',    templates: [Template, ...] },
  // add more groups as useful
];
// Template = { id, name, category, fileName, description, columns: string[] }

export function getTemplateById(id): Template | undefined
export function allTemplatesGrouped(): typeof TEMPLATE_CATALOG
```

Use the real template files that exist for plausible names:
`docs/templates/cord-ph-lo-audit.xlsx`, `acute-sore-throat-audit.xlsx`,
`chest-pain-audit.xlsx`. Local audits should include **Cord pH (local) →
`cord-ph-lo-audit.xlsx`** (this is the demo's chosen output). National audits can be
plausible invented entries (e.g. NNAP — National Neonatal Audit Programme; NHFD; MINAP)
each with a short `description` and a realistic `columns` list (the column names feed the
hover preview). Cord pH columns can be drawn from
[`seed/audits/cord-ph-audit/audit.md`](../../seed/audits/cord-ph-audit/audit.md).

---

## 7. Component APIs (build to these exactly)

All new components live in `app/src/components/spec/`.

### 7.1 `Chip.svelte` (F2) — value-only pill

- **Props:** `value: string`, `variant: 'filter' | 'template' = 'filter'`,
  `open: boolean = false`, `editable: boolean = true`.
- **Renders:** an inline-flex pill showing only `value` + (if editable) a small `▾` caret
  in `#9ca3af`. `filter` variant: bg `#fff`, border `1px solid #d1d5db`, radius 8px,
  padding `3px 10px`, font 13px, text `#111827`; hover border `#3b82f6`. `template`
  variant: slightly more prominent — bg `#eef2ff`, border `#c7d2fe`, font-weight 600.
- **Events:** `dispatch('toggle')` on click.
- Pure presentational — it does **not** own the popover; the consumer renders a
  `<ChipPopover>` next to it. Keep it a single inline element so it sits inline after a
  plain-text label.

### 7.2 `ChipPopover.svelte` (F2) — floating popover shell

- **Props:** `open: boolean`, `searchable: boolean = false`, `query: string = ''`
  (bindable), `placeholder: string = 'Search…'`.
- **Renders (when `open`):** an absolutely-positioned panel under the trigger — bg `#fff`,
  border `1px solid #e5e7eb`, radius 8px, shadow `0 6px 20px rgba(0,0,0,.08)`,
  `z-index: 20`, `min-width: 220px`, `margin-top: 4px`. If `searchable`, a search input at
  the top (full width, border-bottom `1px solid #f3f4f6`, auto-focus). A `<slot>` for the
  body (the option list, calendar, preview, etc.).
- **Events:** `dispatch('close')` on outside-click or Escape. (Consumer owns `open`.)
- The consumer is responsible for relative positioning (wrap trigger + popover in a
  `position: relative` span).

### 7.3 `AddFilterChip.svelte` (F2) — the "+" expanding chip

- **Props:** `loading: boolean = false`.
- **Collapsed:** a pill identical to a filter chip but showing `+ Add filter`.
- **Expanded (on click):** the pill widens into an inline text input (placeholder e.g.
  "Describe a filter, e.g. only male patients over 60…"). Enter submits; Escape cancels
  and collapses.
- **Events:** `dispatch('submit', { text })`. While the parent processes (`loading=true`),
  show a small "thinking…" state and disable input; the parent collapses it back by
  resetting state after appending chips.

### 7.4 `DatabaseChip.svelte` (T3)

- **Props:** `chip: Chip` (the `database` chip), bindable or via change event.
- Renders `<Chip value={chip.value} />` as trigger + `<ChipPopover searchable>` listing
  ready databases from the `databases` store
  ([`app/src/stores/databases.js`](../../app/src/stores/databases.js); items
  `{id,name,status}` — show `status === 'ready'`, fall back to showing all if none).
  Search filters the list. Selecting one updates `chip.value` (name) + `chip.raw` (id).
- **Events:** `dispatch('change', updatedChip)`.
- On mount, call `refreshDatabases()` so the list is populated.

### 7.5 `DateChip.svelte` + `Calendar.svelte` (T4)

- `DateChip` props: `chip: Chip` (a `date` chip, `raw` = ISO date).
- Renders `<Chip value={chip.value} />` (human value like "3 Jan 2026") + `<ChipPopover>`
  containing `<Calendar>`. Picking a date updates `chip.value` (formatted) + `chip.raw`
  (ISO) and closes.
- **Events:** `dispatch('change', updatedChip)`.
- `Calendar.svelte`: a minimal month grid (prev/next month, day cells, selected
  highlight). Props `value: string` (ISO), event `dispatch('select', isoDate)`. No
  external date library — plain JS `Date`.

### 7.6 `OutputSpec.svelte` (T5)

- **Props:** `output: { summary, templateChip }`.
- Renders a section titled "Output specification": the crisp `summary` line, then a
  label + a **template** chip (`<Chip variant="template" value={templateChip.value} />`).
- **Click** the template chip → `<ChipPopover>` showing all templates **grouped by
  category** (`allTemplatesGrouped()` from the catalog): a category header per group, then
  its templates. Selecting one updates the chip (`value`=name, `raw`=id) and updates the
  `summary` line accordingly.
- **Hover** the template chip → a small preview popover with the template's `description`
  and its `columns` (e.g. "Columns: Patient code, Gestation (weeks), Cord arterial pH…").
  Hover-preview and click-to-pick are distinct interactions; keep them from fighting
  (e.g. preview on hover when closed; the picker on click).
- **Events:** `dispatch('change', updatedOutput)`.

### 7.7 `CohortPreview.svelte` (T6)

- **Props:** `count: number`, `noun: 'patients' | 'encounters' = 'patients'`.
- Renders the bottom-of-input health-check line, e.g. a subtle pill/row:
  "≈ 42 patients match these filters." Muted styling (`#6b7280`), small. This is the
  doctor's sanity check before an expensive run.

### 7.8 `InputSpec.svelte` (T8)

- **Props:** `cohort: Chip[]` (bindable).
- Renders one **row per chip**: the plain-text `label`, then the appropriate chip widget
  by `kind`:
  - `database` → `<DatabaseChip>`
  - `date` → `<DateChip>`
  - `value` / `codes` → `<Chip>` + a `<ChipPopover searchable>` (free-text edit; for
    chips with `options`, list them; otherwise a single text input that updates `value`).
- At the **bottom**, after all chips: `<AddFilterChip>`. On its `submit`, set
  `loading=true`, call `parseAdditionalFilters(text)`, append the returned chips to
  `cohort`, then `loading=false`.
- After any change (edit, add), recompute `resolveCohortCount(cohort)` and render
  `<CohortPreview count={...} noun={...} />` at the very bottom.
- **Events:** `dispatch('change', cohort)` so the parent (T9) keeps the spec in sync.

### 7.9 `HomeScreen.svelte` (T9) — capstone rewrite

- Replace the entire current content. New structure:
  1. A hero + **single free-text box** (reuse the existing `describe-card` textarea + send
     styling; Enter submits, Shift+Enter newline). Keep it centered, max-width ~640px.
  2. State machine: `idle` → (submit) `parsing` (show an "agent thinking…" indicator for
     the duration of `parseRequest`) → `ready` (render the contract) | `error`.
  3. On `ready`, render a **Task Contract** container with two sections:
     `<InputSpec bind:cohort />` and `<OutputSpec bind:output />` (or via `change` events).
  4. A **Run analysis** button at the bottom → calls `runFromSpec(spec)` (from T7).
  5. Provide a way back to `idle` (e.g. an "edit request" / "start over" affordance).
- **Remove** the `TemplateCard` grid, the upload card, and the describe card from the
  render. Drop now-unused imports. Do **not** delete `TemplateCard.svelte` or
  `lib/templates.js` from disk.

---

## 8. Integration seam — the existing run pipeline (T7 only)

The reference implementation is `handleRun` in
[`TemplateCard.svelte`](../../app/src/components/TemplateCard.svelte) (~line 150). T7's
`runFromSpec(spec)` must replicate that chain:

```js
import { isSubmitting, runStatus, addMessage, startRunStream } from '../stores/chat.js';
import { startAudit, setAuditRunId, setAuditStatus } from '../stores/audits.js';
import { goToResults } from '../stores/navigation.js';
import { createRunFromAudit } from './api.js';

// 1. Build a synthetic audit target from the chosen output template:
const runTarget = { id: spec.output.templateChip.raw, name: spec.output.summary };
// 2. Map cohort chips → a flat filters object { field: value, ... }.
const filters = Object.fromEntries(spec.cohort.map(c => [c.field, c.value]));
isSubmitting.set(true);
const histId = startAudit(runTarget, filters);
goToResults();
addMessage({ role: 'user', type: 'text', content: buildContractMessage(spec) });
const data = await createRunFromAudit(runTarget.id, filters, /*database id*/ dbChip?.raw);
setAuditRunId(histId, data.runId);
startRunStream(data.runId, histId);
// wrap in try/catch mirroring TemplateCard's error handling.
```

`buildContractMessage(spec)` returns a **plain multi-line string** (messages render with
`white-space: pre-wrap`, **not** markdown — see
[`MessageBubble.svelte`](../../app/src/components/MessageBubble.svelte)). It must include
the original request, the cohort (label: value per line), the resolved count, and the
output (summary + template file). Example:

```
All neonates with cord blood gas sampling in the last 6 months — local Cord pH audit.

Input — cohort
• Condition: cord blood gas sampling
• Specialty: Neonatology
• Starting date: 3 Jan 2026
• Database: EHR database
≈ 42 patients match

Output
• Local medical Cord audit → cord-ph-lo-audit.xlsx
```

In mock mode `createRunFromAudit` returns a mock runId and `startRunStream` plays the
cord-pH activity + workbook — no template id needs to be real.

---

## 9. Definition of done (every task)

- New/changed files exactly as scoped; no edits to out-of-scope files.
- `cd app && VITE_MOCK=true npm run dev` runs with no console errors introduced by your
  change; your component renders and behaves per its API.
- Styling matches §4.
- Branched off `mock`, PR opened **against `mock`** with a clear title/body.
- Commit messages end with the `Co-Authored-By: Claude …` trailer.
