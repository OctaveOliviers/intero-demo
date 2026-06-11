<script>
  import { onMount, onDestroy } from "svelte";
  import jspreadsheet from "jspreadsheet-ce";
  import "jspreadsheet-ce/dist/jspreadsheet.css";

  export let result;

  let container;
  let instance = null;

  function mountGrid() {
    if (!container) return;
    if (instance) {
      jspreadsheet.destroy(container);
      instance = null;
    }

    const isEmpty = !result.rows || result.rows.length === 0;

    const cols = result.columns.map((name) => ({
      title: name,
      width: 150,
      type: "text",
      readOnly: true,
    }));

    const data = isEmpty
      ? [Object.assign(new Array(result.columns.length).fill(""), { 0: "No results" })]
      : result.rows;

    instance = jspreadsheet(container, {
      tabs: false,
      worksheets: [
        {
          data,
          columns: cols,
          minDimensions: [result.columns.length, data.length],
          tableOverflow: true,
          tableHeight: "auto",
          columnSorting: true,
          editable: false,
        },
      ],
    });
  }

  onMount(() => {
    if (result) mountGrid();
  });

  onDestroy(() => {
    if (instance) {
      jspreadsheet.destroy(container);
      instance = null;
    }
  });
</script>

<div class="result-grid" bind:this={container}></div>

<style>
  .result-grid {
    width: 100%;
    max-height: 60vh;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .result-grid :global(.jss_tab) {
    display: none !important;
  }
  .result-grid :global(.jexcel_container),
  .result-grid :global(.jss_container) {
    border: none !important;
    font-family: var(--font-sans) !important;
    font-size: var(--text-sm) !important;
    color: var(--color-text) !important;
  }
  .result-grid :global(table.jexcel),
  .result-grid :global(table.jss_worksheet) {
    border-color: var(--color-border) !important;
  }
  .result-grid :global(td),
  .result-grid :global(th) {
    border-color: var(--color-border) !important;
    color: var(--color-text) !important;
  }
  /* Column + row headers: muted ChatGPT-calm tone */
  .result-grid :global(thead td),
  .result-grid :global(.jss_row > td:first-child),
  .result-grid :global(tbody > tr > td.jss_header) {
    background: var(--color-surface-muted) !important;
    color: var(--color-text-secondary) !important;
    font-weight: var(--weight-medium) !important;
  }
</style>
