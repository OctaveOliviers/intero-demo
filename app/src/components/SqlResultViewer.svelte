<script>
  import { onDestroy } from "svelte";
  import jspreadsheet from "jspreadsheet-ce";
  import "jspreadsheet-ce/dist/jspreadsheet.css";

  export let result;

  let container;
  let instance = null;

  function columnWidthFor(name, rows, index) {
    const values = [name, ...(rows || []).map((row) => (
      Array.isArray(row) ? row[index] : row?.[name]
    ))];
    const longest = values.reduce((max, value) => Math.max(max, String(value ?? "").length), 0);
    return Math.max(70, Math.min(140, Math.round(longest * 7.5 + 28)));
  }

  function mountGrid() {
    if (!container) return;
    if (instance) {
      jspreadsheet.destroy(container);
      instance = null;
    }

    const isEmpty = !result.rows || result.rows.length === 0;

    const cols = result.columns.map((name, index) => ({
      title: name,
      width: columnWidthFor(name, result.rows, index),
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

  // Remount whenever `result` changes: the panel stays mounted while the user
  // clicks from cell to cell, so a mount-once grid would keep showing the first
  // cell's rows. (`container` is referenced so this also runs once bind:this
  // resolves.)
  $: if (container && result) mountGrid();

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
  }

  .result-grid :global(.jss_spreadsheet),
  .result-grid :global(.jss_container),
  .result-grid :global(.jss_content),
  .result-grid :global(.jtabs),
  .result-grid :global(.jtabs-content),
  .result-grid :global(.jtabs-content > div) {
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  .result-grid :global(.jss_tab) {
    display: none !important;
  }

  .result-grid :global(.jtabs-content) {
    padding: 0 !important;
  }

  .result-grid :global(.jss_content) {
    padding: 0 !important;
    max-width: 100% !important;
    overflow: auto !important;
    box-shadow: none !important;
    scrollbar-width: thin;
  }

  .result-grid :global(.jexcel_container),
  .result-grid :global(.jss_container) {
    font-family: var(--font-sans) !important;
    font-size: var(--text-sm) !important;
    color: var(--color-text) !important;
    padding: 0 !important;
  }

  .result-grid :global(table.jexcel),
  .result-grid :global(table.jss_worksheet) {
    border: 0 !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    box-shadow: none !important;
    background: var(--color-surface) !important;
    width: auto !important;
  }

  .result-grid :global(td),
  .result-grid :global(th) {
    border: 1px solid var(--color-border) !important;
    color: var(--color-text) !important;
    line-height: 1.25 !important;
    padding: 4px 6px !important;
    white-space: nowrap !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
    text-overflow: clip !important;
    vertical-align: top !important;
  }

  /* Column + row headers: muted ChatGPT-calm tone */
  .result-grid :global(thead td),
  .result-grid :global(tbody > tr > td.jss_header) {
    background: var(--color-surface-muted) !important;
    color: var(--color-text-secondary) !important;
    font-weight: var(--weight-medium) !important;
  }
  .result-grid :global(.jss_selectall),
  .result-grid :global(.jss_row),
  .result-grid :global(.jss_worksheet > thead > tr > td:first-child),
  .result-grid :global(.jss_worksheet > tbody > tr > td:first-child),
  .result-grid :global(.jss_worksheet > colgroup > col:first-child) {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }
</style>
