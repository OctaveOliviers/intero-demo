<script>
  // One artifact CONTENT view: the evidence-matrix table. It knows nothing
  // about the surrounding box (toolbar, evidence panel, resize) — the box swaps
  // this in for artifacts of kind "table". A cell click flows out through
  // onCell / onCellContext; the box decides what to open (evidence panel).
  import ArtifactSpreadsheetTable from "./ArtifactSpreadsheetTable.svelte";

  export let table;
  export let state;
  export let cellClass = () => "direct";
  export let contextCaptureMode = false;
  export let onCell = () => {};
  export let onCellContext = () => {};

  $: selectedCells = state?.selectedCellRefs || [];
  // Cells being picked in capture mode get the same blue highlight.
  $: contextCellRefs = state?.pendingContextCells || [];
  // Drive in-place cell fills (streamed opening, conflict resolve, MOC notes).
  $: updateTick = state?.tableTick || 0;
  $: updatedRefs = state?.lastUpdatedRefs || [];
</script>

<div class="table-view">
  {#if table}
    <ArtifactSpreadsheetTable
      {table}
      {selectedCells}
      contributingCells={[]}
      {contextCellRefs}
      {contextCaptureMode}
      {cellClass}
      {updateTick}
      {updatedRefs}
      {onCell}
      {onCellContext}
    />
  {/if}
</div>

<style>
  .table-view {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    overflow: hidden;
  }
</style>
