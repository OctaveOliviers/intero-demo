<script>
  import { createEventDispatcher } from "svelte";
  import Icon from "./Icon.svelte";

  const dispatch = createEventDispatcher();

  let compactSidebar = false;
  let confirmDeletes = true;

  function close() {
    dispatch("close");
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="backdrop"
  on:click={onBackdrop}
  on:keydown={() => {}}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="modal">
    <header class="modal-header">
      <h2>Settings</h2>
      <button class="icon-btn" on:click={close} title="Close" aria-label="Close">
        <Icon name="close" />
      </button>
    </header>

    <section class="content">
      <div class="group">
        <h3>Workspace</h3>
        <label class="row">
          <span>Compact sidebar</span>
          <input type="checkbox" bind:checked={compactSidebar} />
        </label>
        <p class="hint">UI preferences only. Library management now lives in the left panel.</p>
      </div>

      <div class="group">
        <h3>Safety</h3>
        <label class="row">
          <span>Confirm destructive actions</span>
          <input type="checkbox" bind:checked={confirmDeletes} />
        </label>
      </div>
    </section>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(13, 13, 13, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--color-surface);
    width: min(560px, 92vw);
    max-height: 84vh;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-1);
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .icon-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--color-text);
    gap: var(--space-3);
  }

  .hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }
</style>
