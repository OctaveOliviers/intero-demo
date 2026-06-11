<script>
  import { onDestroy } from "svelte";
  import { activeWorkbook, runCommand } from "../stores/chat.js";
  import { updateCurrentAuditWorkbook } from "../stores/audits.js";
  import {
    RIGHT_PANEL_MODES,
    openCellEvidence,
    resultViewUiState,
  } from "../stores/resultViewUi.js";
  import {
    CELL_VISUAL_STATUS,
    mapCellVisualStatus,
  } from "../lib/cellVisualStatus.js";
  import { get } from "svelte/store";
  import jspreadsheet from "jspreadsheet-ce";
  import "jspreadsheet-ce/dist/jspreadsheet.css";

  // Accent underline marks a cell as traceable (clickable -> right panel).
  const CLICKABLE_STYLE =
    "color: var(--color-accent);" +
    "text-decoration-line: underline;" +
    "text-decoration-color: var(--color-accent);" +
    "text-underline-offset: 2px;" +
    "cursor: pointer;";
  const STATUS_BACKGROUND = Object.freeze({
    [CELL_VISUAL_STATUS.LEGACY]: "var(--cell-bg-legacy-not-applicable)",
    [CELL_VISUAL_STATUS.NEEDS_REVIEW]: "var(--cell-bg-needs-review)",
    [CELL_VISUAL_STATUS.REVIEWED]: "var(--cell-bg-reviewed-settled)",
  });
  const STATUS_STYLE = Object.freeze({
    [CELL_VISUAL_STATUS.LEGACY]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.LEGACY]};`,
    [CELL_VISUAL_STATUS.NEEDS_REVIEW]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.NEEDS_REVIEW]};`,
    [CELL_VISUAL_STATUS.REVIEWED]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.REVIEWED]};`,
  });
  const HEADER_ROWS = 1;
  const AUTO_REVIEW_DELAY_MS = 2000;

  let container;
  let instance = null;
  let suppressContextMenu = null;
  let autoReviewTimer = null;
  let autoReviewCellRef = null;
  // What the live jspreadsheet instance is currently showing, so the reactive
  // sync can tell a fresh mount (new workbook / sheet) from an in-place update.
  let mountedRunId = null;
  let mountedIndex = -1;
  let lastTick = -1;

  function colToLetters(n) {
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  function refToRC(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
    if (!m) return null;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { row: parseInt(m[2], 10) - 1, col: col - 1 };
  }

  function a1WithDisplayOffset(a1, offsetRows) {
    const rc = refToRC(a1);
    if (!rc) return null;
    const displayRow = rc.row - offsetRows;
    if (displayRow < 0) return null;
    return colToLetters(rc.col) + (displayRow + 1);
  }

  function normalizeMetaValue(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function hasMeaningfulMetaValue(value) {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  }

  function normalizeCellMeta(meta) {
    const source = asObject(meta);
    if (!source) return null;
    const nested = asObject(source.meta) || asObject(source.metadata);
    if (!nested) return source;
    const merged = { ...nested };
    Object.entries(source).forEach(([key, value]) => {
      if (key === "meta" || key === "metadata") return;
      if (hasMeaningfulMetaValue(value) || !(key in merged)) merged[key] = value;
    });
    return merged;
  }

  function getCellMetadataMap(wb) {
    const map = wb?.cellMetadata;
    return asObject(map) || {};
  }

  function getMetaSql(meta) {
    const normalized = normalizeCellMeta(meta);
    return typeof normalized?.sql === "string" ? normalized.sql : "";
  }

  function isInterpretiveNotReviewed(meta) {
    const normalized = normalizeCellMeta(meta);
    const kind = normalizeMetaValue(normalized?.kind);
    const reviewState = normalizeMetaValue(normalized?.review_state);
    const interpretive = kind === "interpret" || kind === "interpretive";
    return interpretive && reviewState === "not_reviewed";
  }

  // The v5 worksheet object lives on the rendered .jss_container element.
  function getWs() {
    return container?.querySelector(".jss_container")?.jssWorksheet || null;
  }

  // Build initial mount-time style map (A1 -> css) from cell metadata:
  // status background for all metadata cells + clickable treatment for traceable cells.
  function backgroundForMeta(meta) {
    const status = mapCellVisualStatus(meta);
    return STATUS_BACKGROUND[status] || STATUS_BACKGROUND[CELL_VISUAL_STATUS.REVIEWED];
  }

  function styleForMeta(meta) {
    let style = STATUS_STYLE[mapCellVisualStatus(meta)] || STATUS_STYLE[CELL_VISUAL_STATUS.REVIEWED];
    if (getMetaSql(meta)) style += CLICKABLE_STYLE;
    return style;
  }

  function initialCellStyles(wb, sheetName) {
    const prefix = sheetName + "!";
    const styles = {};
    Object.entries(getCellMetadataMap(wb)).forEach(([ref, meta]) => {
      if (!ref.startsWith(prefix)) return;
      const displayRef = a1WithDisplayOffset(ref.slice(prefix.length), HEADER_ROWS);
      if (!displayRef) return;
      styles[displayRef] = styleForMeta(meta);
    });
    return styles;
  }

  function cancelAutoReviewTimer() {
    if (autoReviewTimer) {
      clearTimeout(autoReviewTimer);
      autoReviewTimer = null;
    }
    autoReviewCellRef = null;
  }

  function markCellReviewed(cellRef) {
    updateCurrentAuditWorkbook((wb) => {
      const cellMetadata = getCellMetadataMap(wb);
      if (!cellMetadata[cellRef]) return wb;
      const currentMeta = normalizeCellMeta(cellMetadata[cellRef]);
      if (!currentMeta) return wb;
      if (!isInterpretiveNotReviewed(currentMeta)) return wb;
      return {
        ...wb,
        cellMetadata: {
          ...cellMetadata,
          [cellRef]: { ...currentMeta, review_state: "reviewed" },
        },
        recentlyUpdated: [cellRef],
        updateTick: (wb.updateTick || 0) + 1,
      };
    });
  }

  function scheduleAutoReview(cellRef, meta) {
    if (!isInterpretiveNotReviewed(meta)) {
      cancelAutoReviewTimer();
      return;
    }
    // Re-opening the same evidence cell should not stack duplicate timers.
    if (autoReviewTimer && autoReviewCellRef === cellRef) return;

    cancelAutoReviewTimer();
    autoReviewCellRef = cellRef;
    autoReviewTimer = setTimeout(() => {
      const pendingRef = autoReviewCellRef;
      autoReviewTimer = null;
      autoReviewCellRef = null;
      if (!pendingRef) return;

      const ui = get(resultViewUiState);
      const stillFocused =
        ui.rightPanelOpen &&
        ui.rightPanelMode === RIGHT_PANEL_MODES.CELL_EVIDENCE &&
        ui.selectedCellRef === pendingRef;
      if (!stillFocused) return;

      markCellReviewed(pendingRef);
    }, AUTO_REVIEW_DELAY_MS);
  }

  function destroyInstance() {
    if (instance) {
      try { jspreadsheet.destroy(container); } catch (_) {}
      instance = null;
    }
    if (container) container.innerHTML = "";
    mountedRunId = null;
    mountedIndex = -1;
    lastTick = -1;
  }

  // Mount synchronously: an async gap here lets rapid cell_update batches each
  // re-enter with instance===null and trigger a fresh mount (a remount race)
  // instead of an in-place write.
  function mountSheet(wb, sheetIndex) {
    destroyInstance();

    if (!container) return;
    const sheet = wb.sheets[sheetIndex];
    if (!sheet) return;

    const columnMeta = (sheet.meta && sheet.meta.columns) || [];
    const numCols = sheet.data[0] ? sheet.data[0].length : columnMeta.length;
    const headerRow = sheet.data[0] || [];
    const displayData = (sheet.data || []).slice(HEADER_ROWS);
    const cols = [];
    for (let i = 0; i < numCols; i++) {
      const m = columnMeta[i];
      const w = m && m.width ? Math.max(60, Math.round(m.width * 7 + 5)) : 100;
      cols.push({ width: w, title: String(headerRow[i] ?? colToLetters(i)) });
    }

    instance = jspreadsheet(container, {
      tabs: false,
      worksheets: [
        {
          data: displayData,
          columns: cols,
          minDimensions: [
            numCols || 1,
            displayData.length || 1,
          ],
        },
      ],
      onselection: (_inst, x1, y1, x2, y2) => {
        if (x1 !== x2 || y1 !== y2) return;
        const wb2 = get(activeWorkbook);
        if (!wb2) return;
        const sn = wb2.sheets[wb2.currentSheetIndex].name;
        const cellRef = sn + "!" + colToLetters(x1) + (y1 + 1 + HEADER_ROWS);
        const meta = getCellMetadataMap(wb2)[cellRef];
        const sql = getMetaSql(meta);
        if (!sql) {
          cancelAutoReviewTimer();
          return;
        }
        const normalized = normalizeCellMeta(meta);
        openCellEvidence(cellRef, meta);
        runCommand(
          sql,
          normalized?.explanation ?? null,
          normalized?.database ?? null,
          normalized?.evidence ?? null,
        );
        scheduleAutoReview(cellRef, normalized || meta);
      },
    });

    // Apply mount-time status/clickable styles post-init so jspreadsheet's
    // alignment pass doesn't overwrite them.
    const styles = initialCellStyles(wb, sheet.name);
    if (Object.keys(styles).length) {
      const ws = getWs();
      if (ws) ws.setStyle(styles);
    }

    mountedRunId = wb.runId;
    mountedIndex = sheetIndex;
    lastTick = wb.updateTick ?? 0;
  }

  // Briefly flash a freshly written cell and settle back to its final status background.
  function flashCell(ws, col, row, finalBackground) {
    const td = ws.getCellFromCoords(col, row);
    if (!td) return;
    td.style.setProperty("--cell-flash-final-bg", finalBackground);
    td.classList.remove("cell-flash");
    void td.offsetWidth; // force reflow so re-flashing the same cell restarts
    td.classList.add("cell-flash");
    setTimeout(() => td.classList.remove("cell-flash"), 650);
  }

  // Write only the cells from the latest cell_update batch into the live grid —
  // no remount — then style + flash them.
  function applyUpdates(wb, sheetIndex) {
    const sheet = wb.sheets[sheetIndex];
    const ws = getWs();
    if (!sheet || !ws) return;

    const prefix = sheet.name + "!";
    const styleMap = {};
    for (const fullRef of wb.recentlyUpdated || []) {
      if (typeof fullRef !== "string") continue;
      if (!fullRef.startsWith(prefix)) continue; // batch landed in another sheet
      const a1 = fullRef.slice(prefix.length);
      const rc = refToRC(a1);
      if (!rc || rc.row < 0 || rc.col < 0) continue;
      const displayRow = rc.row - HEADER_ROWS;
      if (displayRow < 0) continue; // hidden header row
      const value = sheet.data[rc.row] ? sheet.data[rc.row][rc.col] : "";
      ws.setValueFromCoords(rc.col, displayRow, value ?? "", true);
      const displayRef = colToLetters(rc.col) + (displayRow + 1);
      const meta = getCellMetadataMap(wb)[fullRef];
      styleMap[displayRef] = styleForMeta(meta);
      flashCell(ws, rc.col, displayRow, backgroundForMeta(meta));
    }
    if (Object.keys(styleMap).length) ws.setStyle(styleMap);
  }

  // Reactive sync: mount on a new workbook/sheet, otherwise apply each batch in
  // place. `container` is referenced so this re-runs once bind:this resolves.
  $: syncSheet($activeWorkbook, container);

  function syncSheet(wb, el) {
    if (!wb) {
      destroyInstance();
      return;
    }
    if (!el) return;
    const idx = wb.currentSheetIndex ?? 0;
    if (wb.runId !== mountedRunId || idx !== mountedIndex || !instance) {
      mountSheet(wb, idx);
      return;
    }
    if ((wb.updateTick ?? 0) !== lastTick) {
      applyUpdates(wb, idx);
      lastTick = wb.updateTick ?? 0;
    }
  }

  // If evidence context is no longer active for the pending cell, abort timer.
  $: {
    const ui = $resultViewUiState;
    const timerInvalid =
      autoReviewCellRef &&
      (!ui.rightPanelOpen ||
        ui.rightPanelMode !== RIGHT_PANEL_MODES.CELL_EVIDENCE ||
        ui.selectedCellRef !== autoReviewCellRef);
    if (timerInvalid) cancelAutoReviewTimer();
  }

  function switchSheet(index) {
    updateCurrentAuditWorkbook((wb) => ({ ...wb, currentSheetIndex: index }));
  }

  onDestroy(() => {
    cancelAutoReviewTimer();
    if (container && suppressContextMenu) {
      container.removeEventListener("contextmenu", suppressContextMenu);
    }
    destroyInstance();
  });

  // This view is read-focused; the jspreadsheet default right-click menu is
  // awkward in our constrained layout and can get visually detached. Suppress
  // browser + library context menus on this surface.
  $: if (container && !suppressContextMenu) {
    suppressContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    container.addEventListener("contextmenu", suppressContextMenu);
  }
</script>

<div class="viewer">
  {#if $activeWorkbook && $activeWorkbook.sheets && $activeWorkbook.sheets.length > 1}
    <div class="sheet-tabs">
      {#each $activeWorkbook.sheets as sheet, i}
        <button
          class="tab"
          class:active={i === $activeWorkbook.currentSheetIndex}
          on:click={() => switchSheet(i)}
        >
          {sheet.name}
        </button>
      {/each}
    </div>
  {/if}
  <div class="spreadsheet-container" bind:this={container}></div>
</div>

<style>
  .viewer {
    /* Constrain to the panel width so the inner .spreadsheet-container can
       overflow and show its own scrollbars. The parent .content uses
       align-items: flex-start, so without an explicit width the viewer would
       grow to the full table width and the inner overflow:auto never kicks in. */
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin: 0;
    background: var(--color-surface);
  }
  .sheet-tabs {
    display: flex;
    gap: 0;
    background: var(--color-surface-muted);
    border-bottom: 1px solid var(--color-border);
    padding: 0 var(--space-2);
  }
  .tab {
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .tab:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .tab.active {
    color: var(--color-text);
    background: var(--color-surface);
    border-bottom-color: var(--color-text);
  }
  .spreadsheet-container {
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: auto;
    max-height: none;
  }
  .spreadsheet-container :global(.jss_worksheet) {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--color-text);
  }
  /* Fill flash for newly populated cells (DESIGN §3.8): accent-weak fading to
     the mapped status background over ~600ms. */
  .spreadsheet-container :global(td.cell-flash) {
    animation: cell-fill-flash 600ms var(--ease);
  }
  @keyframes cell-fill-flash {
    from { background-color: var(--color-accent-weak); }
    to { background-color: var(--cell-flash-final-bg, var(--color-surface)); }
  }
  .spreadsheet-container :global(.jss_tab) {
    display: none !important;
  }

  /* Freeze row/column in the scroll container without using jspreadsheet's
     tableOverflow mode, so normal scrolling remains intact. */
  .spreadsheet-container :global(.jss_worksheet thead td) {
    position: sticky;
    top: 0;
    z-index: 4;
    background: #f3f3f3;
  }

  /* First DATA column (nth-child(2); nth-child(1) is the row index gutter). */
  .spreadsheet-container :global(.jss_worksheet tbody td:nth-child(2)),
  .spreadsheet-container :global(.jss_worksheet thead td:nth-child(2)) {
    position: sticky;
    left: 0;
    background: var(--color-surface);
    /* Match native gridline color/weight from jspreadsheet defaults. */
    border-right: 1px solid #ccc;
    box-shadow: 1px 0 0 #ccc;
  }

  .spreadsheet-container :global(.jss_worksheet tbody td:nth-child(2)) {
    z-index: 3;
  }

  .spreadsheet-container :global(.jss_worksheet thead td:nth-child(2)) {
    z-index: 5;
    background: #f3f3f3;
  }

  /* Row index gutter: keep it narrow and frozen while horizontally scrolling. */
  .spreadsheet-container :global(.jss_worksheet > colgroup > col:first-child) {
    width: 27px !important;
    min-width: 27px !important;
    max-width: 27px !important;
  }

  .spreadsheet-container :global(.jss_worksheet > thead > tr > td:first-child),
  .spreadsheet-container :global(.jss_worksheet > tbody > tr > td:first-child) {
    width: 27px;
    min-width: 27px;
    max-width: 27px;
    background: #f3f3f3;
    position: sticky;
    left: 0;
    z-index: 6;
    /* Keep native default seam between row-index and first data column. */
    border-right: 1px solid transparent;
  }

  .spreadsheet-container :global(.jss_worksheet > thead > tr > td:first-child) {
    z-index: 7;
  }

  /* First data column sits immediately to the right of the frozen row index. */
  .spreadsheet-container :global(.jss_worksheet tbody td:nth-child(2)),
  .spreadsheet-container :global(.jss_worksheet thead td:nth-child(2)) {
    left: 27px;
  }
</style>
