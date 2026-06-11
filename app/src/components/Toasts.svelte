<script>
  import { toasts, dismissToast } from "../stores/toasts.js";
</script>

<div class="toasts">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" on:click={() => dismissToast(t.id)} role="status">
      {t.message}
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
</style>
