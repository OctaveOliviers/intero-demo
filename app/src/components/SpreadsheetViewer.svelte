<script>
  import { onDestroy } from "svelte";
  import { activeCommand, activeWorkbook, runCommand } from "../stores/chat.js";
  import { updateCurrentAuditWorkbook } from "../stores/audits.js";
  import {
    RIGHT_PANEL_MODES,
    openCellEvidence,
    patchSelectedCellMeta,
    resultViewUiState,
  } from "../stores/resultViewUi.js";
  import {
    CELL_VISUAL_STATUS,
    mapCellVisualStatus,
  } from "../lib/cellVisualStatus.js";
  import { get } from "svelte/store";
  import jspreadsheet from "jspreadsheet-ce";
  import "jspreadsheet-ce/dist/jspreadsheet.css";

  // A cell with metadata is clickable (-> evidence panel). No link styling: the
  // value stays plain black text; the cell's STATE is conveyed by its background
  // colour (below), not by a blue underline. Just the pointer affordance.
  const CLICKABLE_STYLE = "cursor: pointer;";
  const STATUS_BACKGROUND = Object.freeze({
    [CELL_VISUAL_STATUS.LEGACY]: "var(--cell-bg-legacy-not-applicable)",
    [CELL_VISUAL_STATUS.BLOCKED]: "var(--cell-bg-blocked)",
    [CELL_VISUAL_STATUS.BLOCKED_SEEN]: "var(--cell-bg-blocked-seen)",
    [CELL_VISUAL_STATUS.NEEDS_REVIEW]: "var(--cell-bg-needs-review)",
    [CELL_VISUAL_STATUS.REVIEWED]: "var(--cell-bg-reviewed-settled)",
  });
  const STATUS_STYLE = Object.freeze({
    [CELL_VISUAL_STATUS.LEGACY]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.LEGACY]};`,
    [CELL_VISUAL_STATUS.BLOCKED]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.BLOCKED]};`,
    [CELL_VISUAL_STATUS.BLOCKED_SEEN]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.BLOCKED_SEEN]};`,
    [CELL_VISUAL_STATUS.NEEDS_REVIEW]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.NEEDS_REVIEW]};`,
    [CELL_VISUAL_STATUS.REVIEWED]:
      `background-color: ${STATUS_BACKGROUND[CELL_VISUAL_STATUS.REVIEWED]};`,
  });
  const HEADER_ROWS = 1;
  const AUTO_REVIEW_DELAY_MS = 2000;
  // Render at least this many data rows so the grid fills the viewport and
  // scrolls like a real worksheet even for a small cohort. cell_update only
  // ever targets real cohort rows, so the padding rows stay blank.
  const MIN_DISPLAY_ROWS = 100;

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

  // The traceable source of a cell: legacy run metadata carries a flat `sql`
  // (+ database/evidence); spine cell metadata carries `sources` — an array of
  // {database, query, table_column, row_id?, citations?}. Normalize both into
  // the {sql, database, evidence, explanation} shape runCommand consumes.
  function getMetaSource(meta) {
    const normalized = normalizeCellMeta(meta);
    if (!normalized) return null;
    const explanation = normalized.explanation ?? null;
    if (typeof normalized.sql === "string" && normalized.sql) {
      return {
        sql: normalized.sql,
        database: normalized.database ?? null,
        evidence: normalized.evidence ?? null,
        explanation,
      };
    }
    const sources = Array.isArray(normalized.sources) ? normalized.sources : [];
    const first = sources.find((s) => s && typeof s.query === "string" && s.query);
    if (!first) return null;
    const citations = sources.flatMap((s) => (Array.isArray(s?.citations) ? s.citations : []));
    return {
      sql: first.query,
      database: first.database ?? null,
      evidence: citations.length ? citations : null,
      explanation,
    };
  }

  function isInterpretiveNotReviewed(meta) {
    const normalized = normalizeCellMeta(meta);
    const kind = normalizeMetaValue(normalized?.kind);
    const reviewState = normalizeMetaValue(normalized?.review_state);
    const interpretive = kind === "interpret" || kind === "interpretive";
    return interpretive && reviewState === "not_reviewed";
  }

  // A blocked cell that hasn't been acknowledged yet (red, not yet gray).
  function isBlockedNotSeen(meta) {
    const normalized = normalizeCellMeta(meta);
    const state = normalizeMetaValue(normalized?.state ?? normalized?.audit_state);
    const reviewState = normalizeMetaValue(normalized?.review_state);
    return state === "blocked" && reviewState !== "reviewed";
  }

  // Both interpret-not-reviewed and blocked-not-seen settle on dwell by the same
  // marker (review_state=reviewed): interpret yellow -> white, blocked red ->
  // gray. One mechanism, one timer, two visual outcomes keyed on `state`.
  function isAcknowledgeableOnDwell(meta) {
    return isInterpretiveNotReviewed(meta) || isBlockedNotSeen(meta);
  }

  // The v5 worksheet object lives on the rendered .jss_container element.
  function getWs() {
    const fromDom = container?.querySelector(".jss_container")?.jssWorksheet;
    if (fromDom && typeof fromDom.setValueFromCoords === "function") return fromDom;
    // During mount/update bursts, the DOM hook can briefly lag behind the
    // instance object. Fall back to the in-memory worksheet handle.
    if (Array.isArray(instance) && typeof instance[0]?.setValueFromCoords === "function") {
      return instance[0];
    }
    if (instance && typeof instance?.setValueFromCoords === "function") return instance;
    return null;
  }

  // Build initial mount-time style map (A1 -> css) from cell metadata:
  // status background for all metadata cells + clickable treatment for traceable cells.
  function backgroundForMeta(meta) {
    const status = mapCellVisualStatus(meta);
    return STATUS_BACKGROUND[status] || STATUS_BACKGROUND[CELL_VISUAL_STATUS.REVIEWED];
  }

  function styleForMeta(meta) {
    let style = STATUS_STYLE[mapCellVisualStatus(meta)] || STATUS_STYLE[CELL_VISUAL_STATUS.REVIEWED];
    // Any cell carrying metadata is inspectable (a tier touched it: filled,
    // blocked, etc.), so it opens the evidence panel on click — pointer cursor
    // for all of them, not just the ones with a SQL source.
    if (meta) style += CLICKABLE_STYLE;
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
    let didReview = false;
    updateCurrentAuditWorkbook((wb) => {
      const cellMetadata = getCellMetadataMap(wb);
      if (!cellMetadata[cellRef]) return wb;
      const currentMeta = normalizeCellMeta(cellMetadata[cellRef]);
      if (!currentMeta) return wb;
      if (!isAcknowledgeableOnDwell(currentMeta)) return wb;
      didReview = true;
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
    if (didReview) patchSelectedCellMeta(cellRef, { review_state: "reviewed" });
  }

  function scheduleAutoReview(cellRef, meta) {
    if (!isAcknowledgeableOnDwell(meta)) {
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
            Math.max(displayData.length, MIN_DISPLAY_ROWS),
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
        const normalized = normalizeCellMeta(meta);
        // No metadata at all (a blank/spacer cell) → nothing to inspect.
        if (!normalized) {
          cancelAutoReviewTimer();
          return;
        }
        // Open the panel for ANY cell with metadata, passing its meta so the
        // panel can show the status + (for blocked cells) the blocking reason.
        openCellEvidence(cellRef, normalized);
        const source = getMetaSource(meta);
        if (source) {
          runCommand(source.sql, source.explanation, source.database, source.evidence);
          scheduleAutoReview(cellRef, normalized);
        } else {
          // Blocked / status-only cell: no query to run. Clear any stale query
          // from a previously inspected cell so the panel shows just this cell's
          // status + reason (read from the selected cell meta).
          activeCommand.set(null);
          // Still arm the dwell so a blocked cell settles red -> gray once seen,
          // mirroring interpret yellow -> white. scheduleAutoReview cancels and
          // returns for anything not acknowledgeable (legacy / already-seen), so
          // this stays a no-op for genuine status-only cells.
          scheduleAutoReview(cellRef, normalized);
        }
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
    if (!sheet || !ws) return false;

    const prefix = sheet.name + "!";
    const styleMap = {};
    try {
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
      return true;
    } catch (_) {
      // A transient worksheet readiness error should trigger full catch-up
      // instead of consuming the tick and dropping this batch visually.
      return false;
    }
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
      const applied = applyUpdates(wb, idx);
      if (!applied) {
        // Recovery path for missed batches: remount from the current workbook
        // snapshot so no prior writes are dropped during rapid init bursts.
        mountSheet(wb, idx);
        return;
      }
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
