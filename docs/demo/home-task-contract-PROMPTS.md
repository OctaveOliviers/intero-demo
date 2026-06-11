# Subagent Prompts — Home Screen Task Contract

Copy-paste one block per subagent. **Every prompt assumes the agent first reads**
[`docs/demo/home-task-contract-SPEC.md`](./home-task-contract-SPEC.md) — the shared
contract, visual language, file map, and git workflow live there.

**Dispatch order (see SPEC §3 merge ordering):**

- **Wave 1 (parallel):** F1, F2 → merge both into `mock`.
- **Wave 2 (parallel):** T3, T4, T5, T6, T7 → merge all into `mock`.
- **Wave 3 (sequential):** T8 → merge → T9 → merge.

Do not start a wave until the previous wave's PRs are merged into `mock`, or the
dependency files won't exist on the new branch.

---

## F1 — Data layer (parsers + template catalog)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full — it defines the data contract, visual
language, file map, and git workflow. Follow it exactly.

Branch: from `mock`, create `feature/demo-f1-data-layer` (see SPEC §3 for the exact git
steps; PR must target `mock`, never `main`).

Your task (SPEC §6): create the front-end mock data layer. Two new files only:

1. app/src/lib/spec.js — export:
   - the JobSpec / Chip shapes (as JSDoc comments per §6.1–6.2),
   - parseRequest(text): Promise<JobSpec>  (~3500 ms delay; deterministic keyword parse;
     emits ONLY the filters present in the text, each prefilled; resolvedCount MUST seed
     to 42 with countNoun 'patients' to match the "Found 42 matching patient records"
     line in app/src/lib/mock.js; relative dates resolve against today = 2026-06-03;
     the database chip defaults to value 'EHR database'),
   - parseAdditionalFilters(text): Promise<Chip[]>  (~1000 ms delay),
   - resolveCohortCount(cohort): number  (deterministic; 42 for the seed cohort; each
     extra filter reduces it ~15–30%; no Math.random for the base).
2. app/src/lib/templateCatalog.js — TEMPLATE_CATALOG grouped by category (National audits,
   Local audits), getTemplateById(id), allTemplatesGrouped(). Include "Cord pH (local) →
   cord-ph-lo-audit.xlsx" under Local audits (the demo's chosen output). Each Template has
   { id, name, category, fileName, description, columns: string[] }. Draw Cord pH columns
   from seed/audits/cord-ph-audit/audit.md; invent plausible National entries (e.g. NNAP,
   NHFD) with realistic columns for the hover preview.

Pure JS, no UI, no backend calls, no new dependencies. Verify it imports cleanly
(cd app && VITE_MOCK=true npm run dev shows no errors). Then commit, push, and open a PR
into `mock`. Commit message ends with the Co-Authored-By: Claude trailer.
```

---

## F2 — Chip UI primitives

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full — it defines the data contract, visual
language, file map, and git workflow. Follow it exactly.

Branch: from `mock`, create `feature/demo-f2-chip-primitives` (SPEC §3; PR targets `mock`).

Your task (SPEC §7.1–7.3): three new presentational Svelte 4 components in
app/src/components/spec/ . No data-layer dependency — these are pure UI built to the APIs
in the spec:

1. Chip.svelte — a VALUE-ONLY pill (the descriptive label is rendered by the parent BESIDE
   the chip; only `value` goes inside). Props value, variant ('filter'|'template'), open,
   editable. Dispatches 'toggle' on click. Styling per SPEC §4 and §7.1.
2. ChipPopover.svelte — a floating popover shell anchored under its trigger. Props open,
   searchable, query (bindable), placeholder. Optional search input at top; <slot> body;
   dispatches 'close' on outside-click / Escape. Per §7.2.
3. AddFilterChip.svelte — a "+ Add filter" pill that expands in place into an inline text
   input; Enter dispatches 'submit' {text}, Escape collapses; shows a "thinking…" state
   while prop `loading` is true. Per §7.3.

Match the visual language in SPEC §4 exactly. Build a tiny throwaway harness in your head
(or a scratch route) to eyeball them, but do not commit scratch files. Verify no console
errors (cd app && VITE_MOCK=true npm run dev). Commit, push, open a PR into `mock`.
Commit message ends with the Co-Authored-By: Claude trailer.
```

---

## T3 — Database chip  (Wave 2 — needs F1 + F2 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1 (app/src/lib/spec.js) and F2
(app/src/components/spec/Chip.svelte, ChipPopover.svelte) are already merged into `mock` —
build on them.

Branch: from `mock`, create `feature/demo-t3-database-chip` (PR targets `mock`).

Your task (SPEC §7.4): new file app/src/components/spec/DatabaseChip.svelte. Takes a
`chip` (kind:'database'). Renders <Chip value={chip.value}/> as trigger + <ChipPopover
searchable> listing databases from app/src/stores/databases.js (items {id,name,status};
prefer status==='ready', fall back to all). Search filters the list. Selecting a database
updates chip.value (name) and chip.raw (id) and dispatches 'change' with the updated chip.
Call refreshDatabases() on mount. value-only inside the pill. Verify with VITE_MOCK=true.
Commit, push, PR into `mock` with the Co-Authored-By trailer.
```

---

## T4 — Date chip + calendar  (Wave 2 — needs F1 + F2 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1 and F2 are already merged into `mock`.

Branch: from `mock`, create `feature/demo-t4-date-chip` (PR targets `mock`).

Your task (SPEC §7.5): two new files in app/src/components/spec/:
- DateChip.svelte — takes a `chip` (kind:'date', raw = ISO date). Renders
  <Chip value={chip.value}/> (human value like "3 Jan 2026") + <ChipPopover> wrapping
  <Calendar>. Picking a date updates chip.value (formatted) and chip.raw (ISO), closes the
  popover, and dispatches 'change' with the updated chip.
- Calendar.svelte — a minimal month grid (prev/next month nav, day cells, selected
  highlight) using plain JS Date, NO external date library. Prop value (ISO); dispatches
  'select' with the ISO date.

Match SPEC §4 styling. value-only inside the pill. Verify with VITE_MOCK=true. Commit,
push, PR into `mock` with the Co-Authored-By trailer.
```

---

## T5 — Output-spec panel + template-picker chip  (Wave 2 — needs F1 + F2 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1 (app/src/lib/spec.js,
app/src/lib/templateCatalog.js) and F2 (Chip.svelte, ChipPopover.svelte) are already
merged into `mock`.

Branch: from `mock`, create `feature/demo-t5-output-spec` (PR targets `mock`).

Your task (SPEC §7.6): new file app/src/components/spec/OutputSpec.svelte. Props
`output` = { summary, templateChip }. Renders an "Output specification" section: the crisp
`summary` line, then a label + a template chip (<Chip variant="template"
value={templateChip.value}/>).
- CLICK the chip → <ChipPopover> listing all templates grouped by category via
  allTemplatesGrouped() from templateCatalog.js (category header per group). Selecting one
  updates the chip (value=name, raw=id) and the summary line, and dispatches 'change'.
- HOVER the chip (when the picker is closed) → a small preview popover showing the
  template's description and its columns ("Columns: …"). Keep hover-preview and click-pick
  from fighting.
Match SPEC §4; the template variant is slightly more prominent. Verify with VITE_MOCK=true.
Commit, push, PR into `mock` with the Co-Authored-By trailer.
```

---

## T6 — Cohort preview  (Wave 2 — needs F1 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1 is already merged into `mock`.

Branch: from `mock`, create `feature/demo-t6-cohort-preview` (PR targets `mock`).

Your task (SPEC §7.7): new file app/src/components/spec/CohortPreview.svelte. Props
`count` (number) and `noun` ('patients'|'encounters', default 'patients'). Renders the
bottom-of-input health-check line, e.g. "≈ 42 patients match these filters." Subtle, muted
styling (#6b7280), small. Purely presentational. Verify with VITE_MOCK=true. Commit, push,
PR into `mock` with the Co-Authored-By trailer.
```

---

## T7 — Run bridge  (Wave 2 — needs F1 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full, especially §8 (integration seam). F1 is
already merged into `mock`.

Branch: from `mock`, create `feature/demo-t7-run-bridge` (PR targets `mock`).

Your task (SPEC §8): new file app/src/lib/runFromSpec.js exporting runFromSpec(spec). It
replicates the run chain from handleRun in app/src/components/TemplateCard.svelte (~line
150): build a synthetic runTarget { id: spec.output.templateChip.raw, name:
spec.output.summary }; map cohort chips to a flat filters object; isSubmitting.set(true);
startAudit; goToResults; addMessage a USER text message built by a buildContractMessage(spec)
helper (PLAIN multi-line string — messages render white-space:pre-wrap, NOT markdown; see
MessageBubble.svelte; include request, cohort label:value lines, the "≈ N patients" count,
and the output summary + template fileName per the example in §8); createRunFromAudit
(passing the database chip's raw id if present); setAuditRunId; startRunStream. Wrap in
try/catch mirroring TemplateCard's error handling. Do NOT modify any other file. In mock
mode this streams the cord-pH activity + workbook. Verify with VITE_MOCK=true. Commit,
push, PR into `mock` with the Co-Authored-By trailer.
```

---

## T8 — Input-spec panel  (Wave 3 — needs F1, F2, T3, T4, T6 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1, F2, T3 (DatabaseChip), T4 (DateChip/
Calendar), and T6 (CohortPreview) are already merged into `mock`.

Branch: from `mock`, create `feature/demo-t8-input-spec` (PR targets `mock`).

Your task (SPEC §7.8): new file app/src/components/spec/InputSpec.svelte. Props
`cohort: Chip[]`. Render an "Input specification" section, one ROW per chip: the plain-text
`label` then the chip widget by kind — database → <DatabaseChip>, date → <DateChip>,
value/codes → <Chip> + <ChipPopover searchable> for editing (list `options` if present,
else a text input that updates value). After all chips, render <AddFilterChip>: on its
'submit', set loading=true, call parseAdditionalFilters(text) from lib/spec.js, append the
returned chips to cohort, then loading=false. After any edit/add, recompute
resolveCohortCount(cohort) and render <CohortPreview> at the very bottom. Dispatch 'change'
with the updated cohort so the parent stays in sync. Keep each chip's value-only rule
(label is plain text beside the pill). Match SPEC §4. Verify with VITE_MOCK=true. Commit,
push, PR into `mock` with the Co-Authored-By trailer.
```

---

## T9 — HomeScreen capstone  (Wave 3 — needs F1, T5, T7, T8 merged)

```
You are implementing one task in a multi-agent build. FIRST read
docs/demo/home-task-contract-SPEC.md in full. F1, T5 (OutputSpec), T7 (runFromSpec), and
T8 (InputSpec) are already merged into `mock`.

Branch: from `mock`, create `feature/demo-t9-home-screen` (PR targets `mock`).

Your task (SPEC §7.9): rewrite app/src/components/HomeScreen.svelte. New structure:
1) hero + a single centered free-text box (reuse the existing describe-card textarea + send
   button styling; Enter submits, Shift+Enter newline; max-width ~640px);
2) a state machine idle → parsing (show an "agent thinking…" indicator while parseRequest
   runs, ~3–4s) → ready | error;
3) on ready, a "Task Contract" container rendering <InputSpec> (bind cohort) and
   <OutputSpec> (bind output), kept in sync via bind/change so the JobSpec stays current;
4) a "Run analysis" button at the bottom calling runFromSpec(spec) from lib/runFromSpec.js;
5) an "edit request / start over" affordance back to idle.
REMOVE the TemplateCard grid, the upload card, and the describe card from the render, and
drop the now-unused imports — but do NOT delete TemplateCard.svelte or lib/templates.js
from disk. Match SPEC §4. Verify the full demo flow end-to-end with VITE_MOCK=true
(paste a cord-pH request → thinking → contract → edit a chip → Run analysis → user message
+ contract at top of Results → activity streams → results.xlsx chip → opens spreadsheet).
Commit, push, PR into `mock` with the Co-Authored-By trailer.
```
