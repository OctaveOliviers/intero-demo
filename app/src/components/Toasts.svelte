<script>
  import { toasts, dismissToast } from "../stores/toasts.js";

  // An action toast (Q42 — the table-completion hyperlink) carries
  // { label, onClick }. Run the action, then dismiss. stopPropagation keeps the
  // body's dismiss-only handler from firing first.
  function runAction(t) {
    try {
      t.action.onClick();
    } finally {
      dismissToast(t.id);
    }
  }
</script>

<div class="toasts">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" on:click={() => dismissToast(t.id)} role="status">
      <span class="toast-message">{t.message}</span>
      {#if t.action}
        <button
          type="button"
          class="toast-action"
          on:click|stopPropagation={() => runAction(t)}
        >
          {t.action.label}
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: var(--space-5);
    right: var(--space-5);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 360px;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface);
    box-shadow: var(--shadow-md);
    border-left: 3px solid var(--color-border-strong);
    cursor: pointer;
  }
  .toast.success { border-left-color: var(--color-success); }
  .toast.error { border-left-color: var(--color-danger); }
  .toast-message {
    flex: 1 1 auto;
  }
  /* The Q42 hyperlink/CTA — a quiet inline action, not a heavy button. */
  .toast-action {
    flex: 0 0 auto;
    background: transparent;
    color: var(--color-primary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    padding: 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .toast-action:hover {
    text-decoration: underline;
  }
</style>
