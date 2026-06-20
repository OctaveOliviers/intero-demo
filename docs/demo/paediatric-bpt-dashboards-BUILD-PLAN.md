# Paediatric BPT Dashboards — Build Plan

**Outcome:** an ordered, dependency-aware task list to implement
[`paediatric-bpt-dashboards-SPEC.md`](paediatric-bpt-dashboards-SPEC.md) end-to-end. Executing
every task in order yields all 11 spec §10 acceptance criteria passing in `npm run dev:mock`
and the prod build, with epilepsy and trauma on their own datasets.

- **Tasks:** 14 (T1–T14), one reviewable unit each.
- **Single branch / single PR** for the whole feature. Suggested branch:
  `feature/paediatric-bpt-dashboards` (off `main`, after the spec PR merges). The
  parallel/sequential structure below is subtask ordering *within this one PR*, not multiple PRs.
- **Parallel lanes:** 3 lanes run concurrently at the start — **Datasets** (T4, T5),
  **Code-contracts/infra** (T1, T3), **Visual-primitives** (T2, T8) — i.e. up to **6 tasks are
  startable immediately**.
- **Acceptance criteria coverage:** all **11/11** owned by ≥1 task; all **§9 files** owned by
  ≥1 task (coverage matrices in §5).
- **Critical path:** `T4/T5 → T6 → T9 → T13 → T14` (≈5 deep).

Conventions: tasks reference spec sections; they do **not** re-derive the spec. "Depends on"
lists the *hard* (build-time) dependency and the reason. Untouched by design (spec §3.7, §9):
the **right panel** (`RightPanel.svelte`, `resultViewUi.js` modes) and **`selectAudit`** — no
task modifies them.

---

## 1. Foundational / blocking tasks (build these first)

Everything else consumes these. They are the shared data contracts (spec §7) and the two new
datasets (spec §6):

- **T1 — `highlightRefs` prop (§7.3):** the code contract the split view's row-highlight needs.
- **T2 — dashboard logos (§4.1) / T3 — deadline display (§7.1):** small shared primitives the
  cards, left panel, and audit subtitle all consume.
- **T4 / T5 — epilepsy & trauma datasets (§6):** until these exist, the tracker descriptors
  can't reference real workbook rows (criterion #11) and the dashboards can't open to their own
  workbooks (criterion #10).
- **T6 — dashboard + tracker descriptors (§7.1/§7.2)** and **T7 — run/snapshot dispatch + seed
  the 3 dashboards (§6):** the data the entire UI reads. T6 depends on the datasets (real refs);
  T7 makes the seeded dashboards selectable and opens each to its own workbook.

UI work (home cards, tracker artifact, audit view-machine, left-panel logos) is sequenced
**after** the contracts it consumes, per the DAG in §4.

---

## 2. Tasks (execution order, top to bottom)

> Order is a valid linearization of the DAG (§4). Tasks marked **∥** with siblings may run in
> parallel; sequential tasks list their blocker + reason.

### T1 — SpreadsheetViewer `highlightRefs` prop  ∥ (with T2,T3,T4,T5,T8)
- **File (Edit):** `app/src/components/SpreadsheetViewer.svelte`.
- **Do:** add optional prop `highlightRefs: string[]` (default `[]`); when non-empty, layer a
  row-highlight style onto those `Sheet!A1` refs in the post-mount/`applyUpdates` `setStyle`
  pass (spec §7.3). Do **not** touch `onselection`, evidence, or status logic.
- **Depends on:** none.
- **Verify:** mount with a ref array → those rows highlight; default `[]` is a visual no-op and
  a cell click still opens the evidence panel.
- **Criteria:** #6, #8.

### T2 — Dashboard logo glyphs  ∥
- **File (Edit):** `app/src/components/Icon.svelte`.
- **Do:** add three distinct, single-colour, token-driven glyphs `dash-diabetes`,
  `dash-epilepsy`, `dash-trauma` (spec §4.1).
- **Depends on:** none.
- **Verify:** `<Icon name="dash-…">` renders each distinctly.
- **Criteria:** #1, #9 (enabler).

### T3 — Deadline display helper (date OR cadence)  ∥
- **File (New):** `app/src/lib/dashboardDeadline.js` (small wrapper).
- **Do:** wrap the existing `getDeadlineSubtitle` (which returns `null` for non-date input) so
  an ISO date is formatted as today, but a free-text cadence string (trauma "Submit ≤25 days of
  discharge") is returned verbatim (spec §7.1). *Note: small new file, spec-implied by §7.1, not
  in the §9 table.*
- **Depends on:** none.
- **Verify:** `"2027-01-12"` formats as a date; `"Submit ≤25 days of discharge"` returns the
  string unchanged.
- **Criteria:** #1, #3 (enabler).

### T4 — Epilepsy mock dataset  ∥
- **Files (Edit):** `app/src/lib/mock/content/en.js` (+ `de.js`/`fr.js`/`nl.js`),
  `app/src/lib/mockData.js`.
- **Do:** replicate the NPDA pattern (spec §6). Content pack: `columns.epilepsy`,
  `records.epilepsy` (≈8–12 cases incl. a few "not done/blocked" cells), needed `codeMaps.*`,
  `explain.epi*`, a `catalog` entry (`submissionDeadline: "2027-01-12"`), an `analyses` entry.
  `mockData.js`: `EPILEPSY_*` constants, `makeEpilepsyCell` (DIRECT via SQL+structured result,
  INTERPRETIVE via notes+evidence — like `makeNpdaCell`), `const epilepsy = buildDataset({…})`,
  `epilepsy.registerSql(SQL_RESULTS)`, and a `timelineEpilepsy()` builder. Carry the exact DB
  fields each epilepsy tracker needs (research §3, B1–B7).
- **Depends on:** none (follows existing NPDA "Dataset 3"). ∥ with T5.
- **Verify:** `epilepsy.populatedWorkbook()` yields a populated "Epilepsy" sheet whose cells
  carry SQL/notes evidence.
- **Criteria:** #10.

### T5 — Trauma mock dataset  ∥ (with T4)
- **Files (Edit):** same set as T4.
- **Do:** same pattern for trauma (spec §6): `columns.trauma`, `records.trauma`, `codeMaps`,
  `explain.tra*`, `catalog` entry (`submissionDeadline: "Submit ≤25 days of discharge"` — the
  cadence string, per §7.1/T3), `analyses` entry; `mockData.js` `TRAUMA_*` + `makeTraumaCell` +
  `buildDataset` + `registerSql` + `timelineTrauma()`. Carry the fields trauma trackers need
  (research §3, C1–C6).
- **Depends on:** none. ∥ with T4.
- **Verify:** `trauma.populatedWorkbook()` yields a populated "Trauma" sheet with cell evidence.
- **Criteria:** #10.

### T6 — Dashboard + tracker descriptors (content pack)  — after T4, T5
- **Files (Edit):** `app/src/lib/mock/content/en.js` (+ de/fr/nl).
- **Do:** add the `dashboards` array (3 entries — diabetes→`npda-lo-audit`, epilepsy, trauma —
  each `{id, auditId, title, logo, subtitle, submissionDeadline, trackers[]}`, spec §7.1) and
  the `trackers` map (21 trackers: 8/7/6, each `{id, dashboardId, title, kind, target,
  elements[{key,label,value,highlightRefs}], criterion}`, spec §7.2 / §8). Tracker labels,
  chart kinds and criteria come from research §3 (A1–A8, B1–B7, C1–C6); every
  `elements[].highlightRefs` must reference **real** rows in the matching dataset's workbook.
- **Depends on:** **T4, T5** — `highlightRefs` and element values reference real epilepsy/trauma
  workbook rows (diabetes uses the existing NPDA dataset). Reason: criterion #11 requires refs
  to point at real rows.
- **Verify:** 3 dashboards × 5–10 trackers (21 total); every tracker's `highlightRefs` resolves
  to an existing `Sheet!ref` in its dashboard's dataset.
- **Criteria:** #11.

### T7 — Mock run/snapshot dispatch + seed the 3 dashboards  — after T4, T5
- **Files (Edit):** `app/src/lib/mockData.js`, `app/src/lib/mock.js`, and a mock seed of the
  `audits` store (`app/src/stores/audits.js` seed helper invoked on load in mock mode). *Note:
  mock.js + the audits-store seed are spec §6 wiring that the §9 table abbreviates as
  "mockData.js (Edit)"; flagged here so it isn't lost.*
- **Do:** (a) make the run/snapshot dispatch **dataset-keyed** instead of hardcoded:
  `buildTimeline`/`buildPopulatedWorkbook`/`buildWorkbookEvent` and
  `mockCreateRunFromTemplate`/`mockGetWorkbook` resolve npda | epilepsy | trauma by template/run
  id (today they always return cord/NPDA). (b) **Seed 3 audit records** into the `audits` store
  on load in mock mode — `{id: auditId, title, submissionDeadline, runId, status: "done"}` — so
  the dashboards appear in the sidebar (§4.2) and open via `selectAudit` → `openWorkbook(runId)`
  → the matching dataset's populated workbook (spec §6, §2.2, §4.3). `selectAudit` itself is
  unchanged.
- **Depends on:** **T4, T5** — needs the dataset objects (`populatedWorkbook()`, timeline) and
  their catalog entries to register and to seed the records' title/deadline.
- **Verify:** in `dev:mock` the sidebar lists the 3 dashboards on load; selecting each opens its
  **own** populated workbook (epilepsy/trauma are not NPDA replays).
- **Criteria:** #10 (own datasets); enables #1, #9.

### T8 — TrackerChart.svelte  ∥ (with T1–T5)
- **File (New):** `app/src/components/TrackerChart.svelte`.
- **Do:** a self-contained SVG chart supporting `donut | timeseries | histogram | stat` (spec
  §5); render `target` where given; each datum is a hit-target that emits an element click
  `{key}`. **No controls** (no filters/sliders/inputs). Builds to the §7.2 tracker-descriptor
  shape (no data dependency).
- **Depends on:** none (shape is fixed by spec §7.2).
- **Verify:** each kind renders; clicking a slice/point/bar/stat fires an event with the correct
  element `key`; there are no interactive controls.
- **Criteria:** #5 (enabler), #6.

### T9 — TrackerDashboard.svelte  — after T8, T6
- **File (New):** `app/src/components/TrackerDashboard.svelte`.
- **Do:** the live-artifact dashboard (spec §3.3, §5): for the current dashboard (resolve
  `currentAuditId` → dashboard descriptor → its `trackers`), lay out its trackers and compose
  `TrackerChart`; presentational, owns no run state, no controls; re-emit a drill event
  `{trackerId, elementKey}` from a child element click.
- **Depends on:** **T8** (the chart component it composes) and **T6** (the `dashboards`/`trackers`
  data it reads).
- **Verify:** renders a dashboard's trackers from the content pack; a chart click bubbles a drill
  event carrying `trackerId` + `elementKey`.
- **Criteria:** #5.

### T10 — DashboardCardGrid.svelte  — after T6, T2, T3
- **File (New):** `app/src/components/DashboardCardGrid.svelte`.
- **Do:** render one card per `dashboards` entry — logo (T2), title, subtitle, deadline (T3) —
  and emit `select` (the consumer calls `selectAudit(dashboard.auditId)`) (spec §2.2).
- **Depends on:** **T6** (dashboard descriptors), **T2** (logos), **T3** (deadline display).
  *(Card click resolves at runtime only once T7 has seeded the audit records.)*
- **Verify:** 3 cards render with logo+title+subtitle+deadline.
- **Criteria:** #1.

### T11 — HomeScreen overlay + card grid integration  — after T10
- **File (Edit):** `app/src/components/HomeScreen.svelte`.
- **Do:** always-render `DashboardCardGrid` in the agent zone; render the existing agent fold as
  an **absolutely-positioned z-index overlay above** the cards when `phase !== "idle"`, with the
  cards fixed in place (dimmed, not unmounted/reflowed); clearing the input restores them (spec
  §2.3). Request bar + run logic unchanged.
- **Depends on:** **T10** (the grid it embeds).
- **Verify:** cards show in `idle`; typing overlays them on top without moving/unmounting them;
  clearing the input restores the cards to the foreground in place; card click opens the
  dashboard (with T7 seeded).
- **Criteria:** #2 (and #1 integration).

### T12 — LeftPanel logos (list + collapsed rail)  — after T2, T6, T7
- **File (Edit):** `app/src/components/LeftPanel.svelte`.
- **Do:** render a leading logo on each tracked-dashboard row in the expanded `.list`, and a
  stack of dashboard logos in the collapsed `.rail`; a logo click calls `selectAudit(id)` (spec
  §4.2/§4.3). Map audit row → logo via the dashboard descriptor (`auditId` → `logo`).
- **Depends on:** **T2** (glyphs), **T6** (auditId→logo map), **T7** (the dashboard rows must be
  seeded in `$audits` to render).
- **Verify:** the 3 dashboards show their logos in both expanded and collapsed states; clicking a
  logo opens the dashboard.
- **Criteria:** #9.

### T13 — ResultsView view-state machine + chips + split  — after T9, T1, T3
- **File (Edit):** `app/src/components/ResultsView.svelte`.
- **Do:** implement the spec §3.1 view machine `{single:dashboard | single:workbook | split}`;
  render order title → deadline (T3) → chip (spec §3.2); the **selector caret chip** (single
  mode) toggling dashboard/workbook (§3.6); default = `TrackerDashboard` (T9) full-width (§3.3);
  workbook-only via chip (§3.4); a tracker drill → **split** (dashboard left + `SpreadsheetViewer`
  with `highlightRefs` right, refs from the clicked element, §3.5); **per-pane close chips** (hover
  ✕) that close a pane → single view of the survivor + caret chip returns, clearing the split
  (§3.6); a workbook cell click still opens the **existing** right panel unchanged (§3.7).
- **Depends on:** **T9** (dashboard pane), **T1** (`highlightRefs` prop), **T3** (deadline
  display). *(Consumes T6 trackers + T7 workbook at runtime.)*
- **Verify:** every §3.1–§3.7 transition works (default tracker; chip toggle; element→split with
  correct rows highlighted in the main panel; per-pane ✕ → survivor + caret; cell→right-panel
  evidence unchanged; deadline appears between title and chip).
- **Criteria:** #3, #4, #5, #6, #7, #8.

### T14 — End-to-end verification gate (definition of done)  — after all
- **Files:** none (verification only).
- **Do:** run `npm run dev:mock` and the prod build; walk all 11 spec §10 criteria; confirm
  epilepsy and trauma open their **own** datasets (not NPDA replays).
- **Depends on:** T1–T13.
- **Verify:** 11/11 criteria pass in `dev:mock`; prod build succeeds and behaves identically.
- **Criteria:** #1–#11 (gate).

---

## 3. Parallel lanes

```
Lane DATASETS        T4 (epilepsy) ─┐
                     T5 (trauma)  ──┤
Lane CODE/INFRA      T1 (highlight)─┤   (T1,T3 independent)
                     T3 (deadline) ─┤
Lane VISUALS         T2 (icons) ────┤   (T2,T8 independent)
                     T8 (chart) ────┘
```
All six (T1, T2, T3, T4, T5, T8) are startable immediately. The lanes converge at T6/T7 (need
the datasets) and at T9–T13 (need the contracts + components).

---

## 4. Dependency DAG

| Task | Depends on | Reason | May run ∥ with |
|------|-----------|--------|----------------|
| T1 highlightRefs prop | — | independent code contract | T2,T3,T4,T5,T8 |
| T2 logos | — | independent visual primitive | T1,T3,T4,T5,T8 |
| T3 deadline helper | — | independent helper | T1,T2,T4,T5,T8 |
| T4 epilepsy dataset | — | follows existing NPDA pattern | T1,T2,T3,T5,T8 |
| T5 trauma dataset | — | follows existing NPDA pattern | T1,T2,T3,T4,T8 |
| T8 TrackerChart | — | builds to fixed §7.2 shape, no data dep | T1–T5 |
| T6 descriptors | T4, T5 | tracker refs/values must point at real rows | T7 |
| T7 dispatch + seed | T4, T5 | needs dataset objects + catalog to register/seed | T6 |
| T9 TrackerDashboard | T8, T6 | composes the chart; reads dashboards/trackers | T10,T12 |
| T10 DashboardCardGrid | T6, T2, T3 | reads descriptors; uses logo + deadline | T9,T12 |
| T12 LeftPanel logos | T2, T6, T7 | glyphs + auditId→logo map + seeded rows | T9,T10,T11,T13 |
| T11 HomeScreen overlay | T10 | embeds the card grid | T12,T13 |
| T13 ResultsView machine | T9, T1, T3 | dashboard pane + highlight prop + deadline | T11,T12 |
| T14 verification gate | T1–T13 | exercises the whole feature | — |

```
        ┌────────────────── Phase 1 (parallel) ──────────────────┐
   T1 ─┐  T2 ─┐  T3 ─┐         T4 ─┐  T5 ─┐            T8 ─┐
       │      │      │             │      │                │
       │      │      │             ▼      ▼                │
       │      │      │            T6 ◄────┘   T7 ◄─────────┤ (T7 also ← T4,T5)
       │      │      │             │           │           │
       │      │      └────────┐    │           │           │
       │      ▼               ▼    ▼           ▼           ▼
       │     T2,T3 ─────────► T10  T9 ◄────────────────────┘ (T9 ← T8,T6)
       │                       │    │
       │                       ▼    │
       │                      T11   │
       │   T2,T6,T7 ────────► T12   │
       └─► T13 ◄─────────────────── ┘  (T13 ← T9,T1,T3)
                       │
                       ▼
                      T14  (← all)
```

---

## 5. Coverage matrices

### 5a. Spec §9 file → task (every §9 file owned)
| §9 file | Task(s) |
|---|---|
| `DashboardCardGrid.svelte` (New) | T10 |
| `TrackerDashboard.svelte` (New) | T9 |
| `TrackerChart.svelte` (New) | T8 |
| `HomeScreen.svelte` (Edit) | T11 |
| `ResultsView.svelte` (Edit) | T13 |
| `SpreadsheetViewer.svelte` (Edit) | T1 |
| `LeftPanel.svelte` (Edit) | T12 |
| `Icon.svelte` (Edit) | T2 |
| `mock/content/en.js` (+de/fr/nl) (Edit) | T4, T5, T6 |
| `mockData.js` (Edit) | T4, T5, T7 |

*Beyond the §9 table (spec-implied, flagged in-task):* `dashboardDeadline.js` (new, §7.1 → T3);
`mock.js` + audits-store seed (§6 run-replay wiring → T7).

### 5b. Spec §10 criterion → task (all 11 owned)
| # | Criterion (abbrev.) | Owning task(s) |
|---|---|---|
| 1 | Home cards: logo+title+subtitle+deadline; click opens | T10 (+T2,T3,T7,T11) |
| 2 | Home overlay: cards stay, fold overlays | T11 |
| 3 | Audit order title→deadline→chip | T13 (+T3) |
| 4 | Default tracker view; chip toggles workbook | T13 |
| 5 | Live artifact: no controls, only element clicks | T8, T9 (+T13) |
| 6 | Split highlights right rows; in main panel | T13 (+T1) |
| 7 | Split per-pane close chips (hover ✕) | T13 |
| 8 | Cell click → right-panel evidence unchanged | T1, T13 |
| 9 | Left-panel logos list+rail; click opens | T12 (+T2,T7) |
| 10 | All 3 run in dev:mock with own datasets | T4, T5, T7 (+T14) |
| 11 | Each dashboard 5–10 trackers; refs real | T6 (+T14) |

---

## 6. Definition of done

The feature is complete when, executing T1–T14 in DAG order on the single
`feature/paediatric-bpt-dashboards` branch:

1. `npm run dev:mock` passes all 11 spec §10 acceptance criteria (matrix §5b).
2. The 3 dashboards (diabetes/epilepsy/trauma) appear as home cards and sidebar rows (with
   logos), each opening to its **own** populated workbook — epilepsy and trauma are **not** NPDA
   replays (criterion #10; verified in T7 and re-confirmed in T14).
3. Each dashboard shows 5–10 trackers and every tracker element drills to the correct,
   highlighted workbook rows (criteria #5, #6, #11).
4. The view machine, chips, split, and right-panel evidence behave exactly as spec §3 (criteria
   #3, #4, #7, #8); the home overlay behaves exactly as spec §2.3 (criterion #2).
5. The prod build (`npm run build`) succeeds and renders identically (mock-on in prod, per spec
   §6).
6. The right panel, `resultViewUi.js` modes, and `selectAudit` are unchanged (spec §3.7, §9).
