<script>
  import { activeWorkbook, downloadWorkbook, runStatus } from "../stores/chat.js";
  import { audits, currentAuditId } from "../stores/audits.js";
  import { dashboardDeadlineText } from "../lib/dashboardDeadline.js";
  import { countWorkbookStatus } from "../lib/statusCounters.js";
  import {
    RIGHT_PANEL_MODES,
    togglePanel,
    requestSummaryScroll,
  } from "../stores/resultViewUi.js";
  import { CONTENT } from "../lib/mock/content/index.js";
  import SpreadsheetViewer from "./SpreadsheetViewer.svelte";
  import TrackerDashboard from "./TrackerDashboard.svelte";
  import Icon from "./Icon.svelte";
  import ScanningEye from "./ScanningEye.svelte";
  import { _ } from "svelte-i18n";

  $: currentAudit = $audits.find((a) => a.id === $currentAuditId) || null;
  $: title = currentAudit?.title || $_("results.title");
  $: activeRunId = $activeWorkbook?.runId || currentAudit?.runId || null;
  $: templateDeadline = currentAudit?.submissionDeadline || null;
  // Deadline display (spec §3.2 / §7.1): render a non-date cadence string
  // verbatim (e.g. trauma's "Submit ≤25 days of discharge") instead of dropping
  // it the way date-only formatting would.
  $: deadlineSubtitle = dashboardDeadlineText(templateDeadline);
  // The eye tracks the LIVE run state, not resultViewUiState (whose
  // activityVisualState initializer is never wired to the stream): scanning +
  // accent while this audit's run is streaming, settled green once finished.
  $: activityRunning = $runStatus === "running";
  // Live status counters (doc 11 §Status counters): derived from cell
  // metadata, so they tick up during the run and down as cells are reviewed.
  $: counters = countWorkbookStatus($activeWorkbook?.cellMetadata);

  // View-state machine (spec §3.1). One of three shapes:
  //   { mode: "single", pane: "dashboard" }  — default, full tracker dashboard
  //   { mode: "single", pane: "workbook"  }  — full workbook
  //   { mode: "split",  selection: { trackerId, elementKey } }  — dashboard L + workbook R
  let view = { mode: "single", pane: "dashboard" };
  // Selector-chip dropdown open/closed (single mode only, spec §3.6).
  let selectorOpen = false;

  // Reset to the default view whenever the selected audit changes (spec §3.1).
  let lastAuditId = $currentAuditId;
  $: if ($currentAuditId !== lastAuditId) {
    lastAuditId = $currentAuditId;
    view = { mode: "single", pane: "dashboard" };
    selectorOpen = false;
  }

  // Resolve the rows the split's right workbook highlights from the selection
  // (spec §3.5 / §7.2): the clicked element's highlightRefs, or [] if unresolved.
  $: selectionRefs =
    view.mode === "split"
      ? CONTENT.trackers[view.selection.trackerId]?.elements.find(
          (e) => e.key === view.selection.elementKey,
        )?.highlightRefs || []
      : [];

  // A tracker element was clicked (single/dashboard or the split's left
  // dashboard) → enter/refresh split with that selection (spec §3.5–§3.6).
  function onDrill(e) {
    view = { mode: "split", selection: e.detail };
    selectorOpen = false;
  }

  // Selector chip (single mode): switch to the OTHER pane (spec §3.6).
  function selectPane(pane) {
    view = { mode: "single", pane };
    selectorOpen = false;
  }

  // Close a split pane via its hover-✕ → return to single showing the SURVIVING
  // pane and clear the selection; the caret selector chip returns (spec §3.6).
  function closePane(pane) {
    // pane = the pane being CLOSED.
    view = {
      mode: "single",
      pane: pane === "dashboard" ? "workbook" : "dashboard",
    };
    selectorOpen = false;
  }

  function onDownload() {
    if (!activeRunId) return;
    downloadWorkbook(activeRunId, "result.xlsx");
  }

  function onActivityControlClick() {
    togglePanel(RIGHT_PANEL_MODES.AGENT_ACTIVITY);
  }
</script>

<div class="results">
  <header class="top-band">
    <div class="title-block">
      <div class="title-row">
        <h1>{title}</h1>
        <div class="band-controls" aria-label={$_("results.controlsAria")}>
          <button
            type="button"
            class="control"
            on:click={onDownload}
            disabled={!activeRunId}
            title={activeRunId ? $_("results.downloadWorkbook") : $_("results.workbookNotReady")}
            aria-label={$_("results.downloadWorkbook")}
          >
            <Icon name="download" size={14} />
            <span class="sr-only">{$_("common.download")}</span>
          </button>

          <button
            type="button"
            class="control"
            on:click={() => togglePanel(RIGHT_PANEL_MODES.INCLUSION_CRITERIA)}
            aria-label={$_("results.toggleInclusion")}
            title={$_("results.inclusionCriteria")}
          >
            <Icon name="settings" size={14} />
            <span class="sr-only">{$_("results.inclusionCriteria")}</span>
          </button>

          <button
            type="button"
            class="control activity-control"
            class:is-running={activityRunning}
            class:is-complete={!activityRunning}
            on:click={onActivityControlClick}
            aria-label={$_("results.toggleActivity")}
            title={$_("results.activity")}
          >
            {#if activityRunning}
              <ScanningEye size={14} />
              <span class="sr-only">{$_("results.activityRunning")}</span>
            {:else}
              <Icon name="eye" size={14} />
              <span class="sr-only">{$_("results.activityIdle")}</span>
            {/if}
          </button>
        </div>

        <!-- Status counters: far right of the SAME band (doc 11 §Status
             counters) — hidden at zero, live-updating, click = pure
             open/scroll to the review summary in the activity feed. -->
        <div class="status-counters" aria-label={$_("results.countersAria")}>
          {#if counters.blocked > 0}
            <button
              type="button"
              class="counter is-blocked"
              on:click={requestSummaryScroll}
              title={$_("results.openReviewSummary")}
              aria-label={$_("results.blockedAria", { values: { count: counters.blocked } })}
            >
              {$_("results.blocked")} <strong>{counters.blocked}</strong>
            </button>
          {/if}
          {#if counters.needsReview > 0}
            <button
              type="button"
              class="counter is-needs-review"
              on:click={requestSummaryScroll}
              title={$_("results.openReviewSummary")}
              aria-label={$_("results.needsReviewAria", { values: { count: counters.needsReview } })}
            >
              {$_("results.needsReview")} <strong>{counters.needsReview}</strong>
            </button>
          {/if}
        </div>
      </div>

      {#if deadlineSubtitle}
        <div class="subtitle">{deadlineSubtitle}</div>
      {/if}
    </div>

    <!-- (3) Chip area (spec §3.6). Single mode: ONE caret selector chip,
         labelled by the current pane, with a dropdown to the other pane. Split
         mode: no selector chip here (the two per-pane chips live above each
         pane in the view region below). -->
    {#if view.mode === "single"}
      <div class="chip-area">
        <div class="selector">
          <button
            type="button"
            class="chip selector-chip"
            class:is-open={selectorOpen}
            aria-haspopup="menu"
            aria-expanded={selectorOpen}
            on:click={() => (selectorOpen = !selectorOpen)}
          >
            <Icon name={view.pane === "dashboard" ? "sidebar" : "table"} size={14} />
            <span>{view.pane === "dashboard" ? "Dashboard" : "Workbook"}</span>
            <span class="caret" class:is-open={selectorOpen}>
              <Icon name="chevron" size={14} />
            </span>
          </button>

          {#if selectorOpen}
            <!-- Outside-click closes the menu. -->
            <button
              type="button"
              class="menu-scrim"
              tabindex="-1"
              aria-hidden="true"
              on:click={() => (selectorOpen = false)}
            ></button>
            <div class="menu" role="menu">
              <button
                type="button"
                class="menu-item"
                role="menuitemradio"
                aria-checked={view.pane === "dashboard"}
                on:click={() => selectPane("dashboard")}
              >
                <Icon name="sidebar" size={14} />
                <span>Dashboard</span>
                {#if view.pane === "dashboard"}
                  <span class="menu-check"><Icon name="check" size={14} /></span>
                {/if}
              </button>
              <button
                type="button"
                class="menu-item"
                role="menuitemradio"
                aria-checked={view.pane === "workbook"}
                on:click={() => selectPane("workbook")}
              >
                <Icon name="table" size={14} />
                <span>Workbook</span>
                {#if view.pane === "workbook"}
                  <span class="menu-check"><Icon name="check" size={14} /></span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </header>

  <!-- (4) View region (spec §3.3–§3.5). -->
  {#if view.mode === "single" && view.pane === "dashboard"}
    <section class="view-region">
      <TrackerDashboard on:drill={onDrill} />
    </section>
  {:else if view.mode === "single" && view.pane === "workbook"}
    <section class="view-region sheet-viewport">
      {#if $activeWorkbook}
        <SpreadsheetViewer />
      {:else}
        <div class="empty-state">{$_("results.workbookPlaceholder")}</div>
      {/if}
    </section>
  {:else}
    <!-- Split: dashboard LEFT, workbook RIGHT — in the MAIN panel (spec §3.5).
         Each pane carries its per-pane chip on top; hovering a chip reveals a
         ✕ that closes that pane (spec §3.6). -->
    <section class="view-region split">
      <div class="pane pane-dashboard">
        <div class="pane-chip-row">
          <div class="chip pane-chip">
            <Icon name="sidebar" size={14} />
            <span>Dashboard</span>
            <button
              type="button"
              class="pane-close"
              aria-label="Close dashboard pane"
              on:click={() => closePane("dashboard")}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
        <div class="pane-body">
          <TrackerDashboard on:drill={onDrill} />
        </div>
      </div>

      <div class="pane pane-workbook">
        <div class="pane-chip-row">
          <div class="chip pane-chip">
            <Icon name="table" size={14} />
            <span>Workbook</span>
            <button
              type="button"
              class="pane-close"
              aria-label="Close workbook pane"
              on:click={() => closePane("workbook")}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
        <div class="pane-body sheet-viewport">
          {#if $activeWorkbook}
            <SpreadsheetViewer highlightRefs={selectionRefs} />
          {:else}
            <div class="empty-state">{$_("results.workbookPlaceholder")}</div>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .results {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: var(--space-4) var(--space-6);
    box-sizing: border-box;
    gap: var(--space-3);
  }

  .top-band {
    flex: 0 0 auto;
  }

  .title-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: var(--text-lg);
    line-height: 1.25;
    color: var(--color-text);
    font-weight: var(--weight-semibold);
  }

  .subtitle {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-height: 1.25rem;
  }

  .band-controls {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .control {
    display: inline-flex;
    align-items: center;
    height: 28px;
    width: 28px;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .control:hover:not(:disabled) {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .control:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .activity-control.is-running {
    color: var(--color-accent);
  }
  .activity-control.is-complete {
    color: var(--color-success);
  }
  .activity-control :global(.eye-search) {
    color: inherit;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .sheet-viewport {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .sheet-viewport :global(.viewer) {
    flex: 1;
    min-height: 0;
    min-width: 0;
    margin: 0;
  }

  .empty-state {
    width: 100%;
    height: 100%;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  /* ── Chip area + view region (spec §3.2, §3.6) ─────────────────────────── */
  .chip-area {
    display: flex;
    align-items: center;
    /* Match the .results gap that precedes the split's per-pane chip row, so the
       chip sits at the SAME vertical offset below the title in single AND split
       view — zero shift on toggle (Fix 1). */
    margin-top: var(--space-3);
  }

  .selector {
    position: relative;
    display: inline-flex;
  }

  /* Shared pill base — matches the app's other controls/pills. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  .selector-chip {
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .selector-chip:hover,
  .selector-chip.is-open {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .selector-chip .caret {
    display: inline-flex;
    transform: rotate(90deg);
    transition: transform var(--dur-fast) var(--ease);
  }
  .selector-chip .caret.is-open {
    transform: rotate(270deg);
  }

  /* Invisible full-viewport scrim that closes the dropdown on outside click. */
  .menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: default;
  }

  .menu {
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 0;
    z-index: 21;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12));
  }

  .menu-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 30px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-xs);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  .menu-item:hover {
    background: var(--color-hover);
  }
  .menu-check {
    display: inline-flex;
    margin-left: auto;
    color: var(--color-accent);
  }

  .view-region {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  /* Dashboard (single) scrolls if its card grid overflows the viewport. */
  .view-region:not(.split):not(.sheet-viewport) {
    overflow-y: auto;
  }

  /* ── Split (main-panel side-by-side, spec §3.5–§3.6) ───────────────────── */
  .split {
    display: flex;
    flex-direction: row;
    gap: var(--space-4);
  }
  .pane {
    flex: 1 1 50%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* Dashboard pane: the chip row stays fixed and only the body scrolls — mirrors
     the workbook pane (whose body, the SpreadsheetViewer, scrolls internally), so
     the dashboard chip stays pinned below the title on scroll (Fix 3 / spec §3.6). */
  .pane-dashboard .pane-body {
    overflow-y: auto;
  }
  .pane-chip-row {
    flex: 0 0 auto;
  }
  .pane-body {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  /* Per-pane chip: ✕ is hidden until the chip is hovered/focused (spec §3.6). */
  .pane-chip {
    position: relative;
  }
  .pane-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: var(--space-1);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .pane-chip:hover .pane-close,
  .pane-chip:focus-within .pane-close {
    opacity: 1;
  }
  .pane-close:hover {
    color: var(--color-text);
  }

  .status-counters {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .counter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 24px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: filter var(--dur-fast) var(--ease);
  }
  .counter:hover {
    filter: brightness(0.96);
  }
  .counter strong {
    font-weight: var(--weight-semibold);
  }
  /* Reuse the review-status semantic tokens (doc 11 / doc 8). */
  .counter.is-blocked {
    border-color: var(--color-danger);
    background: var(--color-danger-weak);
    color: var(--color-danger);
  }
  .counter.is-needs-review {
    border-color: var(--color-warning);
    background: var(--color-warning-weak);
    color: var(--color-warning);
  }
</style>
