<script>
  import { createEventDispatcher, tick } from "svelte";

  // A "+ Add filter" pill that expands in place into an inline text input.
  // Enter dispatches 'submit' { text }; Escape collapses. While `loading` is
  // true it shows a "thinking…" state; the parent collapses it by resetting
  // `loading` to false after appending the returned chips.
  export let loading = false;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let text = "";
  let input;
  let wasLoading = false;

  // When the parent finishes processing (loading true → false), collapse + reset.
  $: {
    if (wasLoading && !loading) {
      expanded = false;
      text = "";
    }
    wasLoading = loading;
  }

  async function expand() {
    expanded = true;
    await tick();
    input && input.focus();
  }

  function collapse() {
    expanded = false;
    text = "";
  }

  function handleKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = text.trim();
      if (!value || loading) return;
      dispatch("submit", { text: value });
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      collapse();
    }
  }
</script>

{#if !expanded}
  <button type="button" class="chip add" on:click={expand}>
    <span class="plus" aria-hidden="true">+</span>
    <span>Add filter</span>
  </button>
{:else}
  <span class="input-wrap" class:loading>
    {#if loading}
      <span class="thinking">thinking…</span>
    {:else}
      <input
        bind:this={input}
        bind:value={text}
        type="text"
        placeholder="Describe a filter, e.g. only male patients over 60…"
        on:keydown={handleKeydown}
        on:blur={() => !text.trim() && collapse()}
      />
    {/if}
  </span>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    color: #6b7280;
    background: #fff;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    vertical-align: middle;
    transition: border-color 0.12s ease, color 0.12s ease;
  }

  .chip:hover {
    border-color: #3b82f6;
    color: #2563eb;
  }

  .plus {
    font-size: 14px;
    line-height: 1;
  }

  .input-wrap {
    display: inline-flex;
    align-items: center;
    padding: 0;
    background: #fff;
    border: 1px solid #3b82f6;
    border-radius: 8px;
    vertical-align: middle;
  }

  .input-wrap.loading {
    border-color: #d1d5db;
    background: #f9fafb;
    padding: 3px 7px;
  }

  .input-wrap input {
    width: 320px;
    max-width: 60vw;
    padding: 3px 7px;
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    color: #111827;
    background: transparent;
    border: none;
    border-radius: 8px;
    outline: none;
  }

  .input-wrap input::placeholder {
    color: #9ca3af;
  }

  .thinking {
    font-size: 13px;
    line-height: 1.3;
    color: #6b7280;
    font-style: italic;
  }
</style>
