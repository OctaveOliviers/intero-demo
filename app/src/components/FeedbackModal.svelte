<script>
  import { createEventDispatcher } from "svelte";
  import Icon from "./Icon.svelte";
  import { submitFeedback } from "../lib/api.js";
  import { addToast } from "../stores/toasts.js";

  const dispatch = createEventDispatcher();

  let title = "";
  let message = "";
  let submitting = false;
  let error = "";

  function close() { dispatch("close"); }
  function onBackdrop(e) { if (e.target === e.currentTarget) close(); }
  function onKey(e) { if (e.key === "Escape") close(); }

  async function handleSubmit() {
    if (submitting) return;
    if (!message.trim()) { error = "Please describe what you'd like to share."; return; }
    submitting = true;
    error = "";
    try {
      await submitFeedback({
        title: title.trim() || message.trim().slice(0, 60),
        body: message.trim(),
      });
      addToast({ kind: "success", message: "Thanks — your feedback was sent." });
      close();
    } catch (e) {
      error = e.message || "Could not send feedback. Please try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="backdrop" on:click={onBackdrop} on:keydown={() => {}} role="dialog" aria-modal="true" tabindex="-1">
  <div class="modal">
    <header class="modal-header">
      <h2>Send feedback</h2>
      <button class="icon-btn" on:click={close} title="Close" aria-label="Close">
        <Icon name="close" />
      </button>
    </header>

    <form class="modal-body" on:submit|preventDefault={handleSubmit}>
      <p class="intro">
        Spotted something broken, slow, or worth changing? Let us know and it
        goes straight to our issue tracker.
      </p>

      <label class="field">
        <span class="field-label">Title <span class="optional">(optional)</span></span>
        <input
          class="input"
          type="text"
          placeholder="Short summary"
          bind:value={title}
          disabled={submitting}
        />
      </label>

      <label class="field">
        <span class="field-label">Details</span>
        <textarea
          class="input textarea"
          rows="6"
          placeholder="What happened? What did you expect?"
          bind:value={message}
          disabled={submitting}
        ></textarea>
      </label>

      {#if error}<div class="error">{error}</div>{/if}

      <div class="actions">
        <button type="button" class="btn ghost" on:click={close} disabled={submitting}>Cancel</button>
        <button type="submit" class="btn primary" disabled={submitting}>
          {submitting ? "Sending…" : "Submit"}
        </button>
      </div>
    </form>
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
    width: min(520px, 92vw);
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
  .icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    overflow-y: auto;
  }
  .intro {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }
  .optional {
    font-weight: var(--weight-normal);
    color: var(--color-text-faint);
  }
  .input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color var(--dur-fast) var(--ease);
  }
  .input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .textarea { resize: vertical; }
  .error {
    font-size: var(--text-sm);
    color: var(--color-danger, #c0392b);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .btn {
    padding: var(--space-2) var(--space-4);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn.ghost {
    background: transparent;
    border-color: var(--color-border);
    color: var(--color-text-secondary);
  }
  .btn.ghost:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
  .btn.primary {
    background: var(--color-accent);
    color: var(--color-on-accent, #fff);
  }
  .btn.primary:hover:not(:disabled) { filter: brightness(0.95); }
</style>
