<script>
  // One pill per committed context chip. A chip bundles the cells the doctor
  // selected in capture mode plus the comment they typed. Hover/focus reveals
  // the cells and the full comment.
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let chips = [];
  export let onRemove = () => {};

  let openId = null;

  function label(chip) {
    if (chip.comment) return chip.comment;
    return chip.cells.length === 1 ? AW.contextChip.oneCell : AW.contextChip.manyCells(chip.cells.length);
  }
</script>

<div class="context-chips" role="group" aria-label={AW.contextChip.listLabel}>
  {#each chips as chip (chip.id)}
    <div
      class="context-chip"
      on:mouseenter={() => (openId = chip.id)}
      on:mouseleave={() => (openId = openId === chip.id ? null : openId)}
      on:focusin={() => (openId = chip.id)}
      on:focusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) openId = openId === chip.id ? null : openId;
      }}
    >
      <button
        type="button"
        class="chip-trigger"
        aria-expanded={openId === chip.id}
        on:click={() => (openId = openId === chip.id ? null : chip.id)}
      >
        <span class="chip-count">{chip.cells.length}</span>
        <span class="chip-label">{label(chip)}</span>
      </button>
      <button type="button" class="chip-remove" aria-label={AW.contextChip.remove} on:click={() => onRemove(chip.id)}>×</button>

      <div class="context-peek" role="group" aria-label={AW.contextChip.detailLabel} hidden={openId !== chip.id}>
        {#if chip.comment}
          <p class="peek-comment">{chip.comment}</p>
        {/if}
        <ul class="peek-cells">
          {#each chip.cells as cell (cell.refId)}
            <li class="peek-cell">{cell.label}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/each}
</div>

<style>
  .context-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .context-chip {
    position: relative;
    flex: 0 1 auto;
    max-width: min(220px, 44vw);
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .chip-trigger {
    max-width: 100%;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
    border: 1px solid var(--color-accent-border);
    border-radius: var(--radius-pill);
    background: var(--color-accent-weak);
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.3;
    outline: none;
  }

  .chip-trigger:focus-visible {
    box-shadow: 0 0 0 2px var(--color-accent);
  }

  .chip-count {
    flex-shrink: 0;
    min-width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-on-primary, #fff);
    font-size: 10px;
    font-weight: var(--weight-semibold);
    line-height: 1;
  }

  .chip-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chip-remove {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--color-text-secondary);
    font-size: 15px;
    line-height: 1;
  }

  .chip-remove:hover,
  .chip-remove:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .context-peek {
    position: absolute;
    left: 0;
    bottom: calc(100% + var(--space-2));
    z-index: 5;
    width: min(300px, 80vw);
    max-height: 220px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    box-shadow: var(--shadow-md);
  }

  .context-peek[hidden] {
    display: none;
  }

  .peek-comment {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .peek-cells {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .peek-cell {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-mono, monospace);
  }
</style>
