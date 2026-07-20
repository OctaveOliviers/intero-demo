# Table View

Read [product-flows.md](../product-flows.md), [table-population.md](table-population.md),
and [traceability-and-evidence.md](traceability-and-evidence.md) first. This document
locks the frontend contract for the **table view** (the screen shown when a table is
open): full-screen spreadsheet, compact top band, and one right panel that switches
between the **Activity** feed, the table's **Dataset** (read-only), and **cell evidence**.
The main panel shows one of **thread / table / split**
([product-flows.md](../product-flows.md)); this doc details the **table** mode.
*(Dashboards are deferred.)*

---

## Goal

The table screen should feel like opening Excel: the table is the primary surface.
Outside of the sheet itself, only two chrome areas exist:
- a thin **top band** (title block + three icon buttons placed immediately beside the title),
- an optional **right panel** for contextual details.

The table has **no chat of its own**. When a table occupies the main panel, the right panel shows the
**Activity** feed (the agent's narration + the review summary) — **not** the conversation; the
conversation stays in the **thread** (open it full, or **split** thread + table to ask while the
table fills — [product-flows.md](../product-flows.md)).

---

## Layout contract

1. The table grid owns the viewport height and width, minus the top band and (when open)
   the right panel.
2. The top band is always visible.
3. The right panel is closed by default when entering the result view.
4. When the right panel opens, the table shrinks horizontally (no overlay on top of the
   active cells).
5. The right panel has one content slot with three modes:
   - `inclusion_criteria` — the table's **pinned** Dataset (read-only; also how a *shared* table's
     cohort is read by a recipient)
   - `agent_activity` — the **Activity** feed (agent narration + review summary), **not** the
     conversation
   - `cell_evidence`

---

## Top band

Left side:
- A compact title block:
  - first row: table / run title + three small icons immediately to the right of the title,
  - second row (optional): submission deadline text in small, light-gray type.

Right side (far right of the same band):
- The **status counters** (below) — the band gains no extra height for them.

Icons (in this order, directly beside the title):
1. **Download** (`lucide` download icon): downloads the current run's `.xlsx` exactly like
   today's export action.
2. **Dataset** (small settings wheel icon): opens the right panel in `inclusion_criteria`
   mode — the **Dataset** scoping this run, shown read-only.
3. **Agent activity** (small eye icon): opens the right panel in `agent_activity` mode.

Button behavior:
- Clicking either non-download icon opens the right panel if closed, or switches the existing
  right panel content if already open.
- Clicking the already-active non-download icon toggles the panel closed.

### Status counters (top band, far right)

Two compact counters sit at the **far right of the top band** — same band as the title and
icons, so no extra chrome row is added above the table:

1. **Blocked** — count of `blocked` cells.
2. **Needs review** — count of cells in the derived needs-verification view
   ([table-population.md §Cell state model](table-population.md#cell-state-model)).

Rules:
- Each counter is **hidden when its count is zero**; with both at zero the band's right side
  is empty.
- Counts **live-update** during a run (driven by `cell_update` metadata), not only at
  completion.
- **Clicking either counter** opens the right panel in `agent_activity` mode, scrolled to the
  **review summary** entry (the queue detail lives there). The click never starts or stops
  anything — it is a pure open/scroll.
- Counter colors reuse the existing review-status semantic tokens
  ([design-system.md](design-system.md)); no new color values.

### Submission deadline text
- Render only when the source table template carries a submission deadline.
- Position: directly below the title line in small, light-gray text (not a chip).
- Display rules:
  - if the deadline is more than 10 days away, show the explicit deadline date;
  - if the deadline is 10 days away or fewer, show countdown text (for example,
    "9 days until submission");
  - if due today, show "submission due today".

---

## Right panel modes

### `inclusion_criteria` — the table's pinned Dataset
- Shows the **Dataset** this table is pinned to: its inclusion-criteria filter chips (label +
  value), **read-only** here. **This is also how a recipient of a *shared* table reads its cohort** —
  the table's Dataset is access-only and not in their library, so this panel is where they see "what
  cohort am I looking at" ([library-and-sources.md](library-and-sources.md) §Sharing).
- Chip rendering reuses the same UI pattern as the Dataset detail: same typography, spacing
  scale, and chip styles ([library-and-sources.md](library-and-sources.md)).
- Editing a Dataset happens in the **data library**, not here. *(The mode identifier stays
  `inclusion_criteria`; the panel renders the run's Dataset.)*

### `agent_activity`
- This panel is the **Activity feed** — the agent's streamed narration plus the terminal review
  summary. It is **not** the conversation (the table has no chat of its own; the thread holds the
  conversation — [product-flows.md](../product-flows.md)). Clicking a cell or an inline citation
  **toggles** it to `cell_evidence` and back.
- Shows the run's streamed `activity` entries (strict-v2: `headline` + optional `detail`,
  table-population.md §Streaming) as one feed.
- New events append live while the run is active.
- The panel structure is fixed and ordered:
  1. title: `Agent activity`
  2. foldable activity boxes (expand/collapse)
  3. the **review summary** — the **terminal entry of the feed**, rendered from the
     `review_summary` event (table-population.md): a structured account of what was completed, the
     **blocked** values (why / who to chase) and the **needs-review** queue. It appears once
     per execution, after the last activity entry. **It is the summary's only home — there is
     no summary banner above, below, or over the table.**
- *(Deferred — refresh is not in the product.)* The `Check for updates` action, the
  `refresh_summary` "what changed" rendering, and the refresh execution states below belong to the
  **deferred refresh feature** ([refresh.md](refresh.md)); today the panel shows the run's activity
  + review summary only.

### `cell_evidence`
- Triggered by clicking a table cell.
- Opens/switches the right panel to show evidence for that specific cell, following
  [traceability-and-evidence.md](traceability-and-evidence.md):
  explanation, SQL query/queries, results, and note excerpts/highlights where applicable.

---

## Eye icon state contract (activity button)

The top-band eye icon reflects execution state:

1. **Execution active** (the run is populating)
   - Eye is **blue**.
   - Pupil is animated/scanning (same motion language as current scanning-eye animation).
2. **Execution idle** (run complete)
   - Eye is **gray**.
   - No animation.
   - Clicking the eye toggles the `agent_activity` panel.

*(The `Check for updates` visibility rules tied to this state belong to the deferred refresh
feature — [refresh.md](refresh.md).)*

The icon remains clickable in all states; click behavior is always a pure panel toggle/switch.

---

## Interactions and precedence

1. Click settings icon → right panel opens in `inclusion_criteria`.
2. Click eye icon → right panel opens/switches to `agent_activity`.
3. Click any table cell → right panel opens/switches to `cell_evidence` for that cell.
4. If right panel is closed manually, table reclaims full width.
5. Download action does not change right-panel state.
6. Click an already-active settings icon or eye icon → right panel closes.
7. *(Deferred — refresh.)* The `Check for updates` action and the during-refresh interactions
   belong to the deferred refresh feature ([refresh.md](refresh.md)).

---

## Acceptance (result view)

- Result view shows a full-screen table-first layout with a persistent top band.
- Top band has a compact title block; three small icons sit immediately to the right of the
  title (not pinned to the far-right page edge).
- The **blocked / needs-review counters** sit at the **far right of the top band**, hidden at
  zero, live-updating during a run; clicking one opens `agent_activity` scrolled to the review
  summary.
- The **review summary renders only as the terminal entry of the agent-activity feed** — no
  summary banner above/over the table exists in any state.
- Download icon triggers the existing table download behavior.
- Inclusion criteria and agent activity icons both drive the same right panel (different modes),
  and clicking an already-active icon toggles the panel closed.
- Inclusion criteria panel reuses the same visual treatment as home-screen criteria chips/text.
- Clicking a cell switches the right panel to evidence for that cell.
- If a submission deadline exists, small light-gray text appears under the title and uses:
  explicit date when >10 days out; countdown when <=10 days out.
- Activity icon is a blue animated eye while the run is populating, and a gray eye when idle.
- Eye click is a pure toggle/switch for `agent_activity`.
- **Refresh is deferred** ([refresh.md](refresh.md)): there is no `Check for updates` action and no
  refresh execution states in the product.

---

## Deferred — refresh & automatic detection

The whole **refresh** feature — the `Check for updates` action, in-place refresh executions, and
automatic refresh recommendation/detection — is **deferred** and specified in
[refresh.md](refresh.md). It is not part of this UI contract today.
