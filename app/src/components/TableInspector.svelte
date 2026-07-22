<script>
  // The inline TABLE INSPECTOR — Issue 2's real replacement for Issue 1's stub
  // (data-seam="issue-2:inspector"). Given a table_id from an agent message, it:
  //   - tracks the table's wrapped run via the EXISTING table-population/run pipeline
  //     (stores/tables.js → startTablePopulation + startRunStream — NOT a rebuild), so the
  //     run fills live and its state survives navigation (Q36);
  //   - shows a quiet running → done status line (reusing the activity-feed idiom);
  //   - is click-to-open: opens the live-filling table in the main panel via
  //     selectPopulatedTable (the completion toast hyperlink uses the same seam).
  // The completion toast (Q42) is fired by the store, not here.
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    trackTable,
    openTrackedTable,
    tableInspectorState,
  } from "../stores/tables.js";

  export let tableId;

  // Kick off tracking once mounted: load the table and route its run into the
  // run pipeline so it fills. Idempotent in the store — re-mounting (navigating
  // back to the thread) re-attaches to the same run, showing its CURRENT state.
  onMount(() => {
    if (tableId) trackTable(tableId);
  });

  // Derived inspector state for THIS table: { status: running|done|error, title }.
  $: state = $tableInspectorState[tableId] || { status: "running", title: "" };
  $: status = state.status;
  $: clickable = status === "done" || status === "running";
  $: statusLine =
    status === "done" ? $_("tableInspector.done")
    : status === "error" ? $_("tableInspector.error")
    : status === "queued" ? $_("tableInspector.queued")
    : $_("tableInspector.running");

  function open() {
    if (!clickable) return;
    openTrackedTable(tableId);
  }

  function onKeydown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }
</script>

<!-- /prototype RESIDUAL (the ONLY taste call): the split-panel transition
     choreography. DEFAULT chosen here — clicking opens the table FULL in the main
     panel (selectPopulatedTable → currentView="results"), the thread is left intact and
     re-openable (it is not forked). A "thread + filling table" SPLIT variant is
     viable cheaply (render ThreadView and ResultsView side by side under a
     split view state) but is deferred to the visual /prototype pass so it doesn't
     block this issue. -->
<div
  class="inspector"
  class:running={status === "running"}
  class:done={status === "done"}
  class:error={status === "error"}
  class:clickable
  role={clickable ? "button" : undefined}
  tabindex={clickable ? 0 : undefined}
  on:click={open}
  on:keydown={onKeydown}
  title={clickable ? $_("tableInspector.openTitle") : undefined}
>
  <span class="icon" aria-hidden="true">
    {#if status === "running"}
      <span class="spinner"></span>
    {:else if status === "done"}
      ▦
    {:else if status === "queued"}
      ◷
    {:else}
      !
    {/if}
  </span>
  <div class="body">
    <div class="title">{state.title || $_("tableInspector.fallbackTitle")}</div>
    <div class="status-line">{statusLine}</div>
  </div>
  {#if status === "done"}
    <span class="open-cta">{$_("tableInspector.openCta")}</span>
  {/if}
</div>

<style>
  .inspector {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    padding: var(--space-3);
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease);
  }
  .inspector.clickable {
    cursor: pointer;
  }
  .inspector.clickable:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface);
  }
  .inspector.done {
    border-color: var(--color-success);
  }
  .inspector.error {
    border-color: var(--color-danger);
    background: var(--color-danger-weak);
  }

  .icon {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-lg);
    color: var(--color-text-secondary);
    line-height: 1;
  }
  .done .icon {
    color: var(--color-success);
  }
  .error .icon {
    color: var(--color-danger);
  }

  /* A small indeterminate spinner — the quiet "building…" idiom, reusing tokens. */
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-strong);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .body {
    min-width: 0;
    flex: 1 1 auto;
  }
  .title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-line {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .open-cta {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-success);
  }
</style>
