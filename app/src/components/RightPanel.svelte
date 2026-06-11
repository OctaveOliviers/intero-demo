<script>
  import { tick } from "svelte";
  import {
    activeCommand,
    activity,
    reviewSummary,
    runStatus,
    startRefreshFromPanel,
  } from "../stores/chat.js";
  import { audits, currentAuditId } from "../stores/audits.js";
  import {
    resultViewUiState,
    RIGHT_PANEL_MODES,
    closePanel,
    summaryScrollRequest,
  } from "../stores/resultViewUi.js";
  import { shouldShowTerminalSummary } from "./resultsViewState.js";
  import Icon from "./Icon.svelte";
  import SqlDisplay from "./SqlDisplay.svelte";
  import SqlResultViewer from "./SqlResultViewer.svelte";
  import NoteEvidenceView from "./NoteEvidenceView.svelte";
  import InputSpec from "./spec/InputSpec.svelte";
  import {
    groupActivityByExecution,
    latestRefreshSummaryEvent,
    shouldShowRefreshAction,
    summaryRows,
  } from "../lib/refreshActivity.js";

  $: panelMode = $resultViewUiState.rightPanelMode;
  $: currentAudit = $audits.find((a) => a.id === $currentAuditId) || null;
  $: criteriaCohort = buildReadOnlyCohort(currentAudit);
  $: hasEvidence = !!($activeCommand && $activeCommand.evidence && $activeCommand.evidence.length);
  $: showRefreshAction = shouldShowRefreshAction($runStatus, currentAudit?.refreshInFlight);
  $: activityEvents = ($activity || []).filter((event) => event?.type !== "refresh_summary");
  $: activityGroups = groupActivityByExecution(activityEvents);
  $: latestSummary = latestRefreshSummaryEvent($activity);
  $: latestSummaryRows = latestSummary ? summaryRows(latestSummary.summary) : [];
  $: latestSummaryLabel = latestSummary?.executionId
    ? activityGroups.find((group) => group.executionId === latestSummary.executionId)?.label || "Refresh"
    : null;
  $: refreshSummaryText = currentAudit?.refreshInFlight
    ? "Checking for updates..."
    : currentAudit?.refreshAvailable
      ? "Updates are available for this audit."
      : "Use the action below to check for downstream updates.";

  export let rightPanelWidth = 380;
  let refreshError = "";
  let refreshMessage = "";
  let refreshPending = false;
  let summaryEl = null;
  let lastScrollRequest = 0;

  // The review summary is the TERMINAL ENTRY of the feed (doc 11
  // §agent_activity item 3) — its only home; it appears once the run
  // finishes.
  $: showTerminalSummary = shouldShowTerminalSummary($runStatus, $reviewSummary);
  $: summaryTotals = $reviewSummary?.totals || null;
  $: summaryVerification = $reviewSummary?.verification || null;
  $: blockingReasons = Object.entries($reviewSummary?.blocking?.reason_codes || {}).sort(
    (a, b) => b[1] - a[1],
  );

  // A top-band counter click opens this panel and scrolls to the summary.
  $: if ($summaryScrollRequest !== lastScrollRequest) {
    lastScrollRequest = $summaryScrollRequest;
    void tick().then(() => {
      summaryEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function labelFromField(field) {
    if (!field) return "Criteria";
    const spaced = String(field).replace(/[_-]+/g, " ").replace(/([A-Z])/g, " $1");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
  }

  function buildReadOnlyCohort(audit) {
    const criteria = audit?.criteria;
    if (Array.isArray(criteria) && criteria.length) {
      return criteria.map((c, i) => ({
        ...c,
        id: c?.id || `criteria-${i}`,
        label: c?.label || labelFromField(c?.field),
        value: c?.value ?? "",
      }));
    }
    const filters = audit?.filters || {};
    return Object.entries(filters)
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([field, value], i) => ({
        id: `filter-${field}-${i}`,
        kind: "value",
        field,
        label: labelFromField(field),
        value: String(value),
      }));
  }

  async function onCheckForUpdates() {
    refreshError = "";
    refreshMessage = "";
    refreshPending = true;
    try {
      await startRefreshFromPanel();
      refreshMessage = "Update check started.";
    } catch (err) {
      refreshError = err?.message || String(err);
      console.error("check-for-updates failed", err);
    } finally {
      refreshPending = false;
    }
  }
</script>

<div class="right-panel" style="width: {rightPanelWidth}px">
  <button class="close-btn" on:click={closePanel} aria-label="Close panel">
    <Icon name="close" size={18} />
  </button>

  {#if panelMode === RIGHT_PANEL_MODES.CELL_EVIDENCE}
    <div class="panel-body">
      {#if $activeCommand?.explanation}
        <section class="block">
          <div class="block-label">Explanation</div>
          <div class="explanation">
            <p class="explanation-text">{$activeCommand.explanation}</p>
          </div>
        </section>
      {/if}

      <section class="block">
        <div class="block-label">Query</div>
        {#if $activeCommand?.sql}
          <SqlDisplay sql={$activeCommand.sql} />
        {:else}
          <div class="status">Select a traceable cell to inspect evidence.</div>
        {/if}
      </section>

      {#if $activeCommand}
        <section class="block">
          {#if $activeCommand.loading}
            <div class="status">Running query…</div>
          {:else if $activeCommand.error}
            <div class="error">{$activeCommand.error}</div>
          {:else if $activeCommand.result}
            {#if hasEvidence}
              <div class="block-label">
                Source note{$activeCommand.result.rowCount !== 1 ? "s" : ""}
              </div>
              <NoteEvidenceView result={$activeCommand.result} quotes={$activeCommand.evidence} />
            {:else}
              <div class="block-label">
                Result · {$activeCommand.result.rowCount} row{$activeCommand.result.rowCount !== 1 ? "s" : ""} · {$activeCommand.result.durationMs}ms
              </div>
              <SqlResultViewer result={$activeCommand.result} />
            {/if}
          {/if}
        </section>
      {/if}
    </div>
  {:else if panelMode === RIGHT_PANEL_MODES.AGENT_ACTIVITY}
    <div class="panel-body">
      <section class="block">
        <div class="block-label">Agent activity</div>
        {#if !activityGroups.length && !showTerminalSummary}
          <div class="status">No activity yet.</div>
        {:else}
          <div class="activity-list">
            {#each activityGroups as group (group.key)}
              <div class="activity-group">
                <div class="activity-group-label">{group.label}</div>
                {#each group.events as event, i (i)}
                  <div class="activity-item">
                    <div class="activity-head">{event.headline || event.name || event.type || "Event"}</div>
                    {#if event.detail || event.summary}
                      <div class="activity-text">{event.detail || event.summary}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}

            {#if showTerminalSummary}
              <!-- The terminal feed entry (doc 11): the structured review
                   summary, rendered after the last activity entry. -->
              <div
                class="activity-item review-entry"
                bind:this={summaryEl}
                aria-live="polite"
                aria-label="Review summary"
              >
                <div class="review-entry-head">Review summary</div>
                <div class="review-totals">
                  <span class="total">Cells <strong>{summaryTotals?.cells ?? 0}</strong></span>
                  <span class="total">Filled <strong>{summaryTotals?.filled ?? 0}</strong></span>
                  <span class="total is-needs-review">Needs review <strong>{summaryTotals?.needs_verification ?? 0}</strong></span>
                  <span class="total is-needs-review">Low confidence <strong>{summaryTotals?.low_confidence ?? 0}</strong></span>
                  <span class="total is-blocked">Blocked <strong>{summaryTotals?.blocked ?? 0}</strong></span>
                </div>
                {#if blockingReasons.length}
                  <div class="review-detail-title">Blocked — why / who to chase</div>
                  <div class="reason-list">
                    {#each blockingReasons as [code, count]}
                      <span class="reason-pill">{code}: {count}</span>
                    {/each}
                  </div>
                {/if}
                <div class="review-detail-title">Verification queue</div>
                <div class="queue-row">
                  <span>Pending: {summaryVerification?.pending ?? 0}</span>
                  <span>Reviewed: {summaryVerification?.reviewed ?? 0}</span>
                  <span>Corrected: {summaryVerification?.corrected ?? 0}</span>
                </div>
              </div>
            {/if}
          </div>
        {/if}
        <div class="summary-block">
          <div class="summary-label">Summary</div>
          {#if latestSummaryRows.length}
            {#if latestSummaryLabel}
              <div class="summary-text">Latest {latestSummaryLabel.toLowerCase()} counters</div>
            {/if}
            {#each latestSummaryRows as row (row.key)}
              <div class="summary-row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            {/each}
          {:else}
            <div class="summary-text">{refreshSummaryText}</div>
          {/if}
        </div>
        {#if refreshMessage}
          <div class="status">{refreshMessage}</div>
        {/if}
        {#if refreshError}
          <div class="error">{refreshError}</div>
        {/if}
        {#if showRefreshAction}
          <button
            type="button"
            class="refresh-action"
            on:click={onCheckForUpdates}
            disabled={refreshPending || currentAudit?.refreshInFlight}
            aria-label="Check for updates"
          >
            <Icon name="loop" size={14} />
            <span>Check for updates</span>
          </button>
        {/if}
      </section>
    </div>
  {:else if panelMode === RIGHT_PANEL_MODES.INCLUSION_CRITERIA}
    <div class="panel-body">
      <section class="block">
        <div class="block-label">Inclusion criteria</div>
        {#if criteriaCohort.length}
          <InputSpec cohort={criteriaCohort} showTitle={false} readOnly />
        {:else}
          <div class="status">No inclusion criteria available for this run.</div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .right-panel {
    position: relative;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 250px;
    max-width: 800px;
  }

  .close-btn {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .close-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-10) var(--space-4) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .explanation {
    background: var(--color-surface-muted);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
  }
  .explanation-text {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: 1.5;
    white-space: pre-wrap;
    margin: 0;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .block-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .activity-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .activity-group-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .activity-item {
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .activity-head {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text);
    font-weight: var(--weight-normal);
  }
  .activity-text {
    margin-top: var(--space-1);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text-muted);
    white-space: pre-wrap;
  }

  .review-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
  }
  .review-entry-head {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
  .review-totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .total {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: 2px 8px;
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    background: var(--color-surface);
  }
  .total strong {
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }
  .total.is-needs-review {
    border-color: var(--color-warning);
    background: var(--color-warning-weak);
  }
  .total.is-blocked {
    border-color: var(--color-danger);
    background: var(--color-danger-weak);
  }
  .review-detail-title {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-weight: var(--weight-semibold);
  }
  .reason-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .reason-pill {
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    background: var(--color-surface);
  }
  .queue-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .summary-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    padding: var(--space-3);
  }
  .summary-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .summary-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
  .summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: 1.4;
  }
  .summary-row strong {
    color: var(--color-text-secondary);
    font-weight: var(--weight-semibold);
  }

  .refresh-action {
    margin-top: var(--space-1);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .refresh-action:hover:not(:disabled) {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .refresh-action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    color: var(--color-text-muted);
    font-style: italic;
    padding: var(--space-3) 0;
    font-size: var(--text-sm);
  }
  .error {
    color: var(--color-danger);
    background: var(--color-danger-weak);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    font-size: var(--text-sm);
  }

  @media (max-width: 899px) {
    .right-panel {
      width: 100% !important;
      border-left: none;
      border-top: 1px solid var(--color-border);
      max-height: 50vh;
    }
  }
</style>
