<script>
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let items = [];
  export let onOpen = () => {};
</script>

<div class="attention-list" aria-label={AW.attentionListLabel}>
  {#each items as item (item.id)}
    <button
      type="button"
      class="attention-item"
      aria-label={item.label}
      on:click={() => onOpen(item)}
    >
      <span class="attention-head">
        <span class="attention-label">{item.label}</span>
        {#if item.flag}
          <span class="attention-flag" class:danger={item.severity === "danger"}>{item.flag}</span>
        {/if}
      </span>
      <span class="attention-detail">{item.detail}</span>
    </button>
  {/each}
</div>

<style>
  .attention-list {
    width: min(100%, 520px);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Same visual family as the run-artifact chip and the activity box: surface,
     hairline border, radius-md. Severity lives in the text-only status pill
     (the demo's own Missing / Conflicting flags), not in decoration. */
  .attention-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease);
  }

  /* Chip-family hover, identical to .run-artifact-chip. */
  .attention-item:hover,
  .attention-item:focus-visible {
    border-color: var(--color-border-strong);
    background: var(--color-surface-muted);
  }

  .attention-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .attention-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .attention-label {
    min-width: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .attention-flag {
    flex-shrink: 0;
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-warning-weak);
    color: var(--color-warning);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .attention-flag.danger {
    background: var(--color-danger-weak);
    color: var(--color-danger);
  }

  .attention-detail {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .attention-item {
      transition-duration: 1ms !important;
    }
  }
</style>
