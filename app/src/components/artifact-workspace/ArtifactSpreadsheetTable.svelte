<script>
  import SpreadsheetViewer from "../SpreadsheetViewer.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let table;
  export let selectedCells = [];
  export let contributingCells = [];
  export let contextCellRefs = [];
  export let onCell = () => {};
  export let contextCaptureMode = false;
  export let onCellContext = () => {};
  // (rowId, columnId) -> "direct" | "interpreted" | "conflict". Drives the
  // cell background via the app's native status colours: direct -> reviewed
  // (white), interpreted -> needs_review (amber), conflict -> blocked (red).
  export let cellClass = () => "direct";
  // In-place cell updates: a monotonic tick + the refs changed last, so the grid
  // fills / edits cells without a full remount (matches the product's streaming).
  export let updateTick = 0;
  export let updatedRefs = [];

  const SHEET_NAME = "Sheet1";

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

  function fullRefForCell(cell) {
    const rowIndex = table?.rows.findIndex((row) => row.id === cell.rowId) ?? -1;
    const colIndex = table?.columns.findIndex((column) => column.id === cell.columnId) ?? -1;
    if (rowIndex < 0 || colIndex < 0) return null;
    return `${SHEET_NAME}!${colToLetters(colIndex)}${rowIndex + 2}`;
  }

  // Returns null for an empty cell (e.g. a blank MOC Notes cell) so it carries
  // no metadata: not inspectable, plain default background.
  function metadataFor(row, column) {
    const value = row[column.id];
    if (value == null || String(value).trim() === "") return null;
    const klass = cellClass(row.id, column.id);
    if (klass === "conflict") {
      return { kind: "direct", state: "blocked", explanation: AW.cellMeta.direct(column.title, row.id) };
    }
    if (klass === "interpreted") {
      return {
        kind: "interpret",
        state: "filled",
        review_state: "not_reviewed",
        explanation: AW.cellMeta.interpreted(column.title, row.id),
      };
    }
    // An interpreted cell the doctor has dwelt on: settled yellow -> white.
    if (klass === "interpreted-reviewed") {
      return {
        kind: "interpret",
        state: "filled",
        review_state: "reviewed",
        explanation: AW.cellMeta.interpreted(column.title, row.id),
      };
    }
    return { kind: "direct", state: "filled", review_state: "reviewed", explanation: AW.cellMeta.direct(column.title, row.id) };
  }

  // Stable population id (never remounts); cell changes flow through
  // updateTick + recentlyUpdated so SpreadsheetViewer writes them in place.
  function workbookForTable(source, tick, refs) {
    if (!source) return null;
    const columns = source.columns || [];
    const rows = source.rows || [];
    const data = [
      columns.map((column) => column.title),
      ...rows.map((row) => columns.map((column) => row[column.id] ?? "")),
    ];
    const cellMetadata = {};
    rows.forEach((row, rowIndex) => {
      columns.forEach((column, colIndex) => {
        const meta = metadataFor(row, column);
        if (meta) {
          cellMetadata[`${SHEET_NAME}!${colToLetters(colIndex)}${rowIndex + 2}`] = meta;
        }
      });
    });
    return {
      tablePopulationId: source.tableId,
      sheets: [
        {
          name: SHEET_NAME,
          data,
          meta: {
            // Each column declares its display width in the fixture (sized to
            // its longest value). (width -> max(60, w*7+5) px in the viewer.)
            columns: columns.map((column) => ({ width: column.width ?? 16 })),
          },
        },
      ],
      cellMetadata,
      currentSheetIndex: 0,
      updateTick: tick,
      recentlyUpdated: (refs || []).map(fullRefForCell).filter(Boolean),
    };
  }

  function handleCellEvidence(cellRef, _meta = null, _source = null, anchor = null) {
    const [, a1] = String(cellRef || "").split("!");
    const rc = refToRC(a1);
    if (!rc) return;
    const row = table?.rows[rc.row - 1];
    const column = table?.columns[rc.col];
    if (!row || !column) return;
    if (contextCaptureMode) {
      onCellContext(table.tableId, row.id, column.id, anchor);
      return;
    }
    onCell(table.tableId, row.id, column.id);
  }

  // Recompute when the data, colouring, or update tick changes.
  $: workbook = ((_c, _t) => workbookForTable(table, updateTick, updatedRefs))(cellClass, updateTick);
  $: highlightRefs = [...selectedCells, ...contributingCells, ...contextCellRefs]
    .map(fullRefForCell)
    .filter(Boolean);
</script>

<div class="artifact-spreadsheet-table">
  <SpreadsheetViewer {workbook} {highlightRefs} onCellEvidence={handleCellEvidence} />
</div>

<style>
  .artifact-spreadsheet-table {
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
  }

  .artifact-spreadsheet-table :global(.viewer) {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  /* Suppress jspreadsheet's native selection chrome — the black cell contour and
     the little black fill-handle square — so the ONLY cell emphasis is our own
     blue highlight (thin blue border + light-blue fill, applied via highlightRefs). */
  .artifact-spreadsheet-table :global(.jss_corner) {
    display: none !important;
  }

  /* No !important on box-shadow: our own blue highlight is an INLINE style
     (SpreadsheetViewer's HIGHLIGHT_ON) on the same cell jspreadsheet tags with
     .highlight-*; inline must win or a direct click renders plain white.
     Border colours are restored PER SIDE to jspreadsheet's defaults (top/left
     #ccc gridline, right/bottom transparent) rather than all-transparent: a
     td's own top/left borders ARE the gridlines it shares with its neighbours,
     so blanking them made those segments vanish around the selected cell. */
  .artifact-spreadsheet-table :global(.jss_worksheet .highlight-top),
  .artifact-spreadsheet-table :global(.jss_worksheet .highlight-bottom),
  .artifact-spreadsheet-table :global(.jss_worksheet .highlight-left),
  .artifact-spreadsheet-table :global(.jss_worksheet .highlight-right) {
    border-top-color: #ccc !important;
    border-left-color: #ccc !important;
    border-right-color: transparent !important;
    border-bottom-color: transparent !important;
    box-shadow: none;
  }

  .artifact-spreadsheet-table :global(.jss_worksheet .highlight-selected) {
    background-color: transparent !important;
  }

  .artifact-spreadsheet-table :global(.jss_worksheet .selection),
  .artifact-spreadsheet-table :global(.jss_worksheet .selection-left),
  .artifact-spreadsheet-table :global(.jss_worksheet .selection-right),
  .artifact-spreadsheet-table :global(.jss_worksheet .selection-top),
  .artifact-spreadsheet-table :global(.jss_worksheet .selection-bottom) {
    background-color: transparent !important;
    border-color: transparent !important;
  }

  .artifact-spreadsheet-table :global(.spreadsheet-container),
  .artifact-spreadsheet-table :global(.jss_container),
  .artifact-spreadsheet-table :global(.jss_content) {
    background: transparent !important;
  }

  .artifact-spreadsheet-table :global(.jss_container) {
    padding-right: 0 !important;
  }
</style>
