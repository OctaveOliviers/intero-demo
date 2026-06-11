# Result View — Workbook-First

Read [2-product-flows.md](./2-product-flows.md), [5-run-engine.md](./5-run-engine.md),
and [6-traceability-evidence.md](./6-traceability-evidence.md) first. This document
locks the frontend contract for the **result view** (the screen shown when a run is
open): full-screen spreadsheet, compact top band, and one right panel that switches
between audit criteria, agent activity, and cell evidence.

---

## Goal

The result screen should feel like opening Excel: the workbook is the primary surface.
Outside of the sheet itself, only two chrome areas exist:
- a thin **top band** (title block + three icon buttons placed immediately beside the title),
- an optional **right panel** for contextual details.

No chat-style stack should compete with the workbook on this screen.

---

## Layout contract

1. The workbook grid owns the viewport height and width, minus the top band and (when open)
   the right panel.
2. The top band is always visible.
3. The right panel is closed by default when entering the result view.
4. When the right panel opens, the workbook shrinks horizontally (no overlay on top of the
   active cells).
5. The right panel has one content slot with three modes:
   - `inclusion_criteria`
   - `agent_activity`
   - `cell_evidence`

---

## Top band

Left side:
- A compact title block:
  - first row: audit/run title + three small icons immediately to the right of the title,
  - second row (optional): submission deadline text in small, light-gray type.

Right side (far right of the same band):
- The **status counters** (below) — the band gains no extra height for them.

Icons (in this order, directly beside the title):
1. **Download** (`lucide` download icon): downloads the current run's `.xlsx` exactly like
   today's export action.
2. **Inclusion criteria** (small settings wheel icon for now): opens the right panel in
   `inclusion_criteria` mode.
3. **Agent activity** (small eye icon): opens the right panel in `agent_activity` mode.

Button behavior:
- Clicking either non-download icon opens the right panel if closed, or switches the existing
  right panel content if already open.
- Clicking the already-active non-download icon toggles the panel closed.

### Status counters (top band, far right)

Two compact counters sit at the **far right of the top band** — same band as the title and
icons, so no extra chrome row is added above the workbook:

1. **Blocked** — count of `blocked` cells.
2. **Needs review** — count of cells in the derived needs-verification view
   ([doc 5 §Cell state model](./5-run-engine.md#cell-state-model)).

Rules:
- Each counter is **hidden when its count is zero**; with both at zero the band's right side
  is empty.
- Counts **live-update** during a run/refresh (driven by `cell_update` metadata), not only at
  completion.
- **Clicking either counter** opens the right panel in `agent_activity` mode, scrolled to the
  **review summary** entry (the queue detail lives there). The click never starts or stops
  anything — it is a pure open/scroll.
- Counter colors reuse the existing review-status semantic tokens
  ([8-design-system.md](./8-design-system.md)); no new color values.

### Submission deadline text
- Render only when the source audit template carries a submission deadline.
- Position: directly below the title line in small, light-gray text (not a chip).
- Display rules:
  - if the deadline is more than 10 days away, show the explicit deadline date;
  - if the deadline is 10 days away or fewer, show countdown text (for example,
    "9 days until submission");
  - if due today, show "submission due today".

---

## Right panel modes

### `inclusion_criteria`
- Shows all active inclusion criteria for this run.
- Criteria rendering must reuse the same UI pattern as the home screen: same typography,
  spacing scale, chip styles, and interaction affordances (read-only in this view).
- This panel is read-only in MVP result view (editing stays in setup/home flows).

### `agent_activity`
- Shows the run's streamed `activity` entries (strict-v2: `headline` + optional `detail`,
  doc 5 §Streaming) as one feed.
- New events append live while the run is active.
- The panel structure is fixed and ordered:
  1. title: `Agent activity`
  2. foldable activity boxes (expand/collapse)
  3. the **review summary** — the **terminal entry of the feed**, rendered from the
     `review_summary` event (doc 5): a structured account of what was completed, the
     **blocked** values (why / who to chase) and the **needs-review** queue. It appears once
     per execution, after the last activity entry. **It is the summary's only home — there is
     no summary banner above, below, or over the workbook.** On a refresh execution, the
     refresh's "what changed" summary (`refresh_summary`) renders with it.
  4. small `Check for updates` action (loop icon, two arrows) that starts refresh.
- `Check for updates` visibility rule (MVP): show only when execution is idle.
  While an initial run or refresh execution is active, hide this action.

### `cell_evidence`
- Triggered by clicking a workbook cell.
- Opens/switches the right panel to show evidence for that specific cell, following
  [6-traceability-evidence.md](./6-traceability-evidence.md):
  explanation, SQL query/queries, results, and note excerpts/highlights where applicable.

---

## Eye icon state contract (activity button)

The top-band eye icon reflects execution state:

1. **Execution active** (initial run or refresh)
   - Eye is **blue**.
   - Pupil is animated/scanning (same motion language as current scanning-eye animation).
   - `Check for updates` is hidden in `agent_activity`.
2. **Execution idle** (no active execution)
   - Eye is **gray**.
   - No animation.
   - Clicking the eye toggles the `agent_activity` panel.
   - `Check for updates` is visible and actionable in `agent_activity`.

The icon remains clickable in all states; click behavior is always a pure panel toggle/switch.

---

## Interactions and precedence

1. Click settings icon → right panel opens in `inclusion_criteria`.
2. Click eye icon → right panel opens/switches to `agent_activity`.
3. Click any workbook cell → right panel opens/switches to `cell_evidence` for that cell.
4. If right panel is closed manually, workbook reclaims full width.
5. Download action does not change right-panel state.
6. Click an already-active settings icon or eye icon → right panel closes.
7. In `agent_activity` while idle, click the `Check for updates` action (loop icon) →
   start refresh run.
8. During refresh, click eye → open/switch `agent_activity`.

---

## Acceptance (result view)

- Result view shows a full-screen workbook-first layout with a persistent top band.
- Top band has a compact title block; three small icons sit immediately to the right of the
  title (not pinned to the far-right page edge).
- The **blocked / needs-review counters** sit at the **far right of the top band**, hidden at
  zero, live-updating during a run; clicking one opens `agent_activity` scrolled to the review
  summary.
- The **review summary renders only as the terminal entry of the agent-activity feed** — no
  summary banner above/over the workbook exists in any state.
- Download icon triggers the existing workbook download behavior.
- Inclusion criteria and agent activity icons both drive the same right panel (different modes),
  and clicking an already-active icon toggles the panel closed.
- Inclusion criteria panel reuses the same visual treatment as home-screen criteria chips/text.
- Clicking a cell switches the right panel to evidence for that cell.
- If a submission deadline exists, small light-gray text appears under the title and uses:
  explicit date when >10 days out; countdown when <=10 days out.
- Activity icon is blue animated eye while run/refresh is in progress, and gray eye when idle.
- Eye click is a pure toggle/switch for `agent_activity`; it never starts refresh directly.
- `Check for updates` appears inside the `agent_activity` panel as a small loop-icon action and
  starts refresh when clicked.
- `Check for updates` is shown only when execution is idle; it is hidden during any active
  initial or refresh execution.
- When refresh finishes, activity shows a clear summary of what changed and the icon returns to
  gray idle.

---

## Post-MVP extension note

Automatic refresh recommendation/detection (listeners/probes that decide when refresh is likely
needed before user click) is **not** part of this short-term UI contract. It is specified as a
separate post-MVP phase in
[11-refresh-detection-and-incremental-refresh.md](./11-refresh-detection-and-incremental-refresh.md).
