<script>
  export let table;
  export let selectedCells = [];
  export let contributingCells = [];
  export let onCell = () => {};

  function cellKey(tableId, rowId, columnId) {
    return `${tableId}:${rowId}:${columnId}`;
  }

  function cellRefId(tableId, rowId, columnId) {
    return `cell:${tableId}:${rowId}:${columnId}`;
  }

  $: selectedCellKeys = new Set(
    selectedCells.map((cell) => cell.refId ?? cellRefId(cell.tableId, cell.rowId, cell.columnId)),
  );
  $: contributingCellKeys = new Set(
    contributingCells.map((cell) => cellKey(cell.tableId, cell.rowId, cell.columnId)),
  );

  function isSelected(rowId, columnId) {
    return selectedCellKeys.has(cellRefId(table?.tableId, rowId, columnId));
  }

  function isContributing(rowId, columnId) {
    return contributingCellKeys.has(cellKey(table?.tableId, rowId, columnId));
  }

  function cellId(rowId, columnId) {
    return `${table?.tableId}-${rowId}-${columnId}`;
  }
</script>

<table class="artifact-table" aria-label={table?.title}>
  <thead>
    <tr>
      {#each table?.columns || [] as column (column.id)}
        <th scope="col">{column.title}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each table?.rows || [] as row (row.id)}
      <tr>
        {#each table?.columns || [] as column (column.id)}
          <td>
            <button
              id={cellId(row.id, column.id)}
              class:selected={isSelected(row.id, column.id)}
              class:contributing={isContributing(row.id, column.id)}
              type="button"
              class="data-cell"
              on:click={() => onCell(table.tableId, row.id, column.id)}
              aria-pressed={isSelected(row.id, column.id)}
              aria-label={`${row.id} ${column.title}: ${row[column.id]}`}
            >
              <span class="cell-label">{row[column.id]}</span>
            </button>
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .artifact-table {
    min-width: 720px;
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border-top: 1px solid var(--color-border);
    border-left: 1px solid var(--color-border);
  }

  th,
  td {
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    padding: 0;
    vertical-align: middle;
  }

  th {
    min-height: 38px;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface-muted);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    overflow: hidden;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .data-cell {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text);
    font-size: var(--text-sm);
    overflow: hidden;
    text-align: left;
    transition:
      background var(--dur-fast) var(--ease),
      outline-color var(--dur-fast) var(--ease);
  }

  .cell-label {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .data-cell:hover,
  .data-cell:focus-visible {
    background: var(--color-hover);
  }

  .data-cell:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .data-cell.contributing {
    background: var(--color-accent-weak);
  }

  .data-cell.selected {
    position: relative;
    z-index: 1;
    background: var(--color-accent-weak);
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  @media (max-width: 840px) {
    .artifact-table {
      min-width: 640px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .artifact-table,
    .artifact-table *,
    .artifact-table *::before,
    .artifact-table *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
