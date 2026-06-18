<script>
  import { tick } from "svelte";
  import {
    activeCommand,
    activity,
    reviewSummary,
    runStatus,
    runStartedAt,
    runEndedAt,
    runStopping,
    startRefreshFromPanel,
    stopActiveRun,
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
  import AgentActivityStream from "./AgentActivityStream.svelte";
  import {
    latestRefreshSummaryEvent,
    shouldShowRefreshAction,
    summaryRows,
  } from "../lib/refreshActivity.js";

  $: panelMode = $resultViewUiState.rightPanelMode;
  $: currentAudit = $audits.find((a) => a.id === $currentAuditId) || null;
  $: criteriaCohort = buildReadOnlyCohort(currentAudit);
  $: hasEvidence = !!($activeCommand && $activeCommand.evidence && $activeCommand.evidence.length);
  // The clicked cell's metadata — drives the Status block (state + the blocking
  // reason for a blocked cell). Every clicked cell has this; only traceable
  // cells additionally have a SQL `$activeCommand`.
  $: selectedCellMeta = $resultViewUiState.selectedCellMeta || null;
  $: cellStatus = describeCellStatus(selectedCellMeta);
  $: cellExplanation = $activeCommand?.explanation || selectedCellMeta?.explanation || null;
  $: showRefreshAction = shouldShowRefreshAction($runStatus, currentAudit?.refreshInFlight);
  // The single flat activity stream the box renders — refresh_summary events
  // are a counts payload (shown in their own block below), not activity lines.
  $: activityEvents = ($activity || []).filter((event) => event?.type !== "refresh_summary");
  $: latestSummary = latestRefreshSummaryEvent($activity);
  $: latestSummaryRows = latestSummary ? summaryRows(latestSummary.summary) : [];

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

  // Human-readable status for the clicked cell + the blocking reason. A blocked
  // cell ALWAYS carries reason_code + reason_detail (the DB enforces it), so the
  // panel can finally explain why a cell is blocked instead of looking empty.
  function describeCellStatus(meta) {
    if (!meta || typeof meta !== "object") return null;
    const state = String(meta.state || "").toLowerCase();
    const reviewState = String(meta.review_state ?? meta.reviewState ?? "").toLowerCase();
    const confidence = String(meta.confidence || "").toLowerCase();
    let label = "Filled";
    let tone = "settled";
    if (state === "blocked") {
      label = "Blocked";
      tone = "blocked";
    } else if (state === "not_applicable") {
      label = "Not applicable";
      tone = "muted";
    } else if (state === "pending") {
      label = "Pending";
      tone = "muted";
    } else if (reviewState === "reviewed") {
      label = "Reviewed";
      tone = "settled";
    } else if (reviewState === "not_reviewed") {
      label = "Filled · needs review";
      tone = "review";
    }
    return {
      label,
      tone,
      confidence: confidence === "low" || confidence === "medium" ? confidence : null,
      reasonCode: meta.reason_code || null,
      reasonDetail: meta.reason_detail || null,
    };
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
      {#if !cellStatus && !$activeCommand}
        <div class="status">Select a cell to inspect its evidence.</div>
      {/if}

      {#if cellStatus}
        <section class="block">
          <div class="block-label">Status</div>
          <div class="cell-status cell-status--{cellStatus.tone}">
            {cellStatus.label}{#if cellStatus.confidence} · {cellStatus.confidence} confidence{/if}
          </div>
          {#if cellStatus.reasonCode || cellStatus.reasonDetail}
            <div class="cell-reason">
              {#if cellStatus.reasonCode}
                <span class="reason-code">{cellStatus.reasonCode}</span>
              {/if}
              {#if cellStatus.reasonDetail}
                <p class="reason-detail">{cellStatus.reasonDetail}</p>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      {#if cellExplanation}
        <section class="block">
          <div class="block-label">Explanation</div>
          <div class="explanation">
            <p class="explanation-text">{cellExplanation}</p>
          </div>
        </section>
      {/if}

      {#if $activeCommand?.sql}
        <section class="block">
          <div class="block-label">Query</div>
          <SqlDisplay sql={$activeCommand.sql} />
        </section>
      {/if}

      {#if $activeCommand?.sql}
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

        <!-- The whole live stream lives in ONE collapsible gray box. Keyed on the
             audit so its fold/scroll state is per-audit, not carried across a
             sidebar switch (the box is a single reused instance otherwise). -->
        {#key $currentAuditId}
          <AgentActivityStream
            events={activityEvents}
            runStatus={$runStatus}
            startedAt={$runStartedAt}
            endedAt={$runEndedAt}
            stopping={$runStopping}
            onStop={stopActiveRun}
          />
        {/key}

        {#if showTerminalSummary}
          <!-- The summary is a SEPARATE box below the activity stream and only
               exists once the run has finished (doc 11 §agent_activity item 3). -->
          <div
            class="review-entry"
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

        {#if latestSummaryRows.length}
          <!-- Downstream-update counts from a refresh run. Shown ONLY once the
               counts exist — never as a from-the-start placeholder. -->
          <div class="summary-block">
            <div class="summary-label">Downstream updates</div>
            {#each latestSummaryRows as row (row.key)}
              <div class="summary-row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            {/each}
          </div>
        {/if}
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

  .review-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.5;
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

  .cell-status {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    border-radius: var(--radius-pill);
    padding: 2px 10px;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }
  .cell-status--blocked {
    border-color: var(--color-danger);
    background: var(--color-danger-weak);
    color: var(--color-danger);
  }
  .cell-status--review {
    border-color: var(--color-warning);
    background: var(--color-warning-weak);
    color: var(--color-warning);
  }
  .cell-status--settled {
    border-color: var(--color-success);
    background: var(--color-success-weak);
    color: var(--color-success);
  }
  .cell-status--muted {
    color: var(--color-text-muted);
  }
  .cell-reason {
    margin-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .reason-code {
    align-self: flex-start;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--color-danger);
    background: var(--color-danger-weak);
    border-radius: var(--radius-md);
    padding: 1px 6px;
  }
  .reason-detail {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: 1.5;
    white-space: pre-wrap;
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
