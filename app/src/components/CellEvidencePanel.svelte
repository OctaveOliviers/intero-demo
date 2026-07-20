<script>
  import { _ } from "svelte-i18n";
  import SqlDisplay from "./SqlDisplay.svelte";
  import SqlResultViewer from "./SqlResultViewer.svelte";
  import NoteEvidenceView from "./NoteEvidenceView.svelte";

  export let command = null;
  export let selectedCellMeta = null;
  export let compact = false;

  $: hasEvidence = !!(command && command.evidence && command.evidence.length);
  $: cellStatus = describeCellStatus(selectedCellMeta);
  $: cellExplanation = command?.explanation || selectedCellMeta?.explanation || null;

  function describeCellStatus(meta) {
    if (!meta || typeof meta !== "object") return null;
    const state = String(meta.state || "").toLowerCase();
    const reviewState = String(meta.review_state ?? meta.reviewState ?? "").toLowerCase();
    const confidence = String(meta.confidence || "").toLowerCase();
    let label = $_("rightPanel.statusFilled");
    let tone = "settled";
    if (state === "blocked") {
      label = $_("rightPanel.statusBlocked");
      tone = "blocked";
    } else if (state === "not_applicable") {
      label = $_("rightPanel.statusNotApplicable");
      tone = "muted";
    } else if (state === "pending") {
      label = $_("rightPanel.statusPending");
      tone = "muted";
    } else if (reviewState === "reviewed") {
      label = $_("rightPanel.statusReviewed");
      tone = "settled";
    } else if (reviewState === "not_reviewed") {
      label = $_("rightPanel.statusFilledNeedsReview");
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
</script>

<div class="cell-evidence-panel" class:compact>
  {#if !cellStatus && !command}
    <div class="status">{$_("rightPanel.selectCell")}</div>
  {/if}

  {#if cellStatus}
    <section class="block">
      <div class="block-label">{$_("rightPanel.status")}</div>
      <div class="cell-status cell-status--{cellStatus.tone}">
        <span>{cellStatus.label}</span>
        {#if cellStatus.confidence}
          <span class="cell-status-confidence">{$_("confidence.suffix", { values: { level: $_("confidence." + cellStatus.confidence) } })}</span>
        {/if}
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
      <div class="block-label">{$_("rightPanel.explanation")}</div>
      <div class="explanation">
        <p class="explanation-text">{cellExplanation}</p>
      </div>
    </section>
  {/if}

  {#if command?.sql}
    <section class="block">
      <div class="block-label">{$_("rightPanel.query")}</div>
      <SqlDisplay sql={command.sql} />
    </section>
  {/if}

  {#if command?.sql}
    <section class="block">
      {#if command.loading}
        <div class="status">{$_("rightPanel.runningQuery")}</div>
      {:else if command.error}
        <div class="error">{command.error}</div>
      {:else if command.result}
        {#if hasEvidence}
          <div class="block-label">
            {command.result.rowCount !== 1 ? $_("rightPanel.sourceNotes") : $_("rightPanel.sourceNote")}
          </div>
          <NoteEvidenceView result={command.result} quotes={command.evidence} />
        {:else}
          <div class="block-label">
            {$_("rightPanel.result")} · {$_("rightPanel.resultMeta", { values: { rows: command.result.rowCount } })}
          </div>
          <SqlResultViewer result={command.result} />
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .cell-evidence-panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-10) var(--space-4) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .cell-evidence-panel.compact {
    padding: 0 var(--space-4) var(--space-2);
    gap: var(--space-4);
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

  .status {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
    white-space: pre-wrap;
  }

  .cell-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    border-radius: var(--radius-pill);
    padding: 2px var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    border: 1px solid var(--color-border);
    background: var(--color-surface-muted);
    color: var(--color-text-secondary);
  }

  .cell-status--settled {
    border-color: var(--color-success);
    background: var(--color-success-weak);
    color: var(--color-success);
  }

  .cell-status--review {
    border-color: var(--color-warning);
    background: var(--color-warning-weak);
    color: var(--color-warning);
  }

  .cell-status--blocked {
    border-color: var(--color-danger);
    background: var(--color-danger-weak);
    color: var(--color-danger);
  }

  .cell-status--muted {
    color: var(--color-text-muted);
  }

  .cell-status-confidence {
    color: inherit;
    opacity: 0.78;
    font-weight: var(--weight-normal);
  }

  .cell-reason {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    padding: var(--space-3) var(--space-4);
  }

  .reason-code {
    align-self: flex-start;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    padding: 1px var(--space-2);
  }

  .reason-detail {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
</style>
