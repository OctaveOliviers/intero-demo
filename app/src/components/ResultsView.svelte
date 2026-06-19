<script>
  import { activeWorkbook, downloadWorkbook, runStatus } from "../stores/chat.js";
  import { audits, currentAuditId } from "../stores/audits.js";
  import { getDeadlineSubtitle } from "../lib/deadlineSubtitle.js";
  import { countWorkbookStatus } from "../lib/statusCounters.js";
  import {
    RIGHT_PANEL_MODES,
    togglePanel,
    requestSummaryScroll,
  } from "../stores/resultViewUi.js";
  import SpreadsheetViewer from "./SpreadsheetViewer.svelte";
  import Icon from "./Icon.svelte";
  import ScanningEye from "./ScanningEye.svelte";
  import { _ } from "svelte-i18n";

  $: currentAudit = $audits.find((a) => a.id === $currentAuditId) || null;
  $: title = currentAudit?.title || $_("results.title");
  $: activeRunId = $activeWorkbook?.runId || currentAudit?.runId || null;
  $: templateDeadline = currentAudit?.submissionDeadline || null;
  $: deadlineSubtitle = getDeadlineSubtitle(templateDeadline)?.text || null;
  // The eye tracks the LIVE run state, not resultViewUiState (whose
  // activityVisualState initializer is never wired to the stream): scanning +
  // accent while this audit's run is streaming, settled green once finished.
  $: activityRunning = $runStatus === "running";
  // Live status counters (doc 11 §Status counters): derived from cell
  // metadata, so they tick up during the run and down as cells are reviewed.
  $: counters = countWorkbookStatus($activeWorkbook?.cellMetadata);

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
  </header>

  <section class="sheet-viewport">
    {#if $activeWorkbook}
      <SpreadsheetViewer />
    {:else}
      <div class="empty-state">{$_("results.workbookPlaceholder")}</div>
    {/if}
  </section>
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
