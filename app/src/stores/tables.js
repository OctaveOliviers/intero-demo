// The tables store — the BRIDGE that turns a thread's `table_id` into a live,
// re-openable, filling table, reusing the existing table-population pipeline (it does NOT
// rebuild the stream, the spreadsheet, or the activity feed).
//
// A `table` (table.schema.json) wraps an existing table population. When a thread
// message resolves output="table", the inline TableInspector calls trackTable():
//   1. load the table  (api.getTable → { table_population_id, title, ... })
//   2. mint a populatedTables-store entry for its population (populatedTables.startTablePopulation)
//   3. point that entry at the wrapped population    (populatedTables.setPopulatedTablePopulationId)
//   4. start the live stream into it             (chat.startRunStream)
// This is the SAME wiring the template-run / "describe" flows use — so cells
// fill via the existing mock/SSE stream, the population state persists to
// localStorage (so it survives navigation — Q36), and click-to-open is just
// navigation.selectPopulatedTable(<entry id>) → ResultsView renders the filling grid.
//
// The completion toast (Q42) is fired here when a tracked run reaches a terminal
// state: a toast carrying a click ACTION that opens the finished table.
import { writable, derived, get } from "svelte/store";
import {
  getTable,
  listTables,
  markTableOpened,
  renameTable as apiRenameTable,
  deleteTable,
} from "../lib/api.js";
import {
  populatedTables,
  activeStream,
  startTablePopulation,
  setPopulatedTablePopulationId,
} from "./populatedTables.js";
import { addToast } from "./toasts.js";
import {
  inspectorStatus,
  inspectorLabel,
  openDecisionForStatus,
} from "./tableInspectorStatus.js";

// chat.js (the run stream) and navigation.js (selectPopulatedTable) form a static import
// cycle with populatedTables.js. Importing them STATICALLY here would pull tables.js into
// that cycle and, depending on load order, leave populatedTables.js's exports
// (currentPopulatedTableId, …) un-initialised at read time. So we DYNAMICALLY import them
// inside the functions that use them — the same cycle-breaking pattern api.js
// uses (runUnauthorizedResetOnce). populatedTables.js is a leaf, so it stays static.

// tableId -> { tableId, populatedTableEntryId, tablePopulationId, title }. The durable association
// between a thread's table and the populatedTables entry whose run fills it.
export const trackedTables = writable({});

// In-flight guard so concurrent trackTable() calls for the same table (e.g. a
// re-render while the first await is pending) don't register two runs.
const tracking = new Set();
// Tables whose completion toast already fired — fire exactly once per table.
const notified = new Set();
// Tables optimistically flipped opened:true whose durable markTableOpened POST
// has not yet committed. A list refresh that resolves inside this window would
// otherwise overwrite opened back to the server's stale false and re-show the
// blue dot — so refreshTables preserves opened:true for any id still in here.
const pendingOpened = new Set();
// Tables removed (removeTable) while a trackTable() for them was mid-await. The
// re-track guard checks this so a delete that lands during the getTable await
// aborts re-registration instead of resurrecting a deleted table with a live run.
const deletedWhileTracking = new Set();

// Track a thread's table: load it and route its wrapped run into the populatedTables/run
// pipeline so it fills live. Idempotent — re-tracking a known table is a no-op
// (its run is already registered and persisted; reopening shows current state,
// Q36). Returns the populatedTables entry id (the click-to-open / selectPopulatedTable target).
export async function trackTable(tableId) {
  if (!tableId) return null;
  const existing = get(trackedTables)[tableId];
  if (existing) return existing.populatedTableEntryId;
  if (tracking.has(tableId)) return null;
  tracking.add(tableId);
  // Clear any stale deletion mark from a prior aborted track so this fresh
  // attempt isn't pre-empted by an old delete.
  deletedWhileTracking.delete(tableId);
  try {
    const table = await getTable(tableId);
    if (!table?.table_population_id) {
      // No wrapped run yet (an ad-hoc / queued table the template-backed engine
      // can't populate, or a spawn that failed). Register it WITHOUT a run so the
      // inspector shows its persisted status (e.g. "queued") instead of spinning
      // forever. Reachable for a directly-created ad-hoc table.
      trackedTables.update((m) => ({
        ...m,
        [tableId]: {
          tableId,
          populatedTableEntryId: null,
          tablePopulationId: null,
          title: table?.title || "",
          status: table?.status || "queued",
        },
      }));
      return null;
    }
    // Re-tracking guard: another call may have won the race while we awaited.
    if (get(trackedTables)[tableId]) return get(trackedTables)[tableId].populatedTableEntryId;
    // Deletion guard: the table may have been removed (removeTable) while we
    // awaited getTable. Re-registering now would resurrect a deleted table with a
    // live run stream + a later completion toast — so abort instead.
    if (deletedWhileTracking.has(tableId)) return null;

    // Mint a populatedTables entry for this table's run, REUSING startTablePopulation. The entry's
    // title is the table title so the sidebar/Results header reads naturally.
    const populatedTableEntryId = startTablePopulation({ id: table.source_template, name: table.title }, {});
    setPopulatedTablePopulationId(populatedTableEntryId, table.table_population_id);
    // Drive the live fill through the EXISTING stream (mock or SSE).
    const { startRunStream } = await import("./chat.js");
    // Re-check after the dynamic-import await too (same guard as after getTable): a
    // delete that landed during it must not resurrect the table with a live stream.
    if (deletedWhileTracking.has(tableId)) return null;
    startRunStream(table.table_population_id, populatedTableEntryId);

    trackedTables.update((m) => ({
      ...m,
      [tableId]: { tableId, populatedTableEntryId, tablePopulationId: table.table_population_id, title: table.title },
    }));
    return populatedTableEntryId;
  } catch {
    // A failed load leaves the table untracked; the inspector shows nothing new
    // (the agent line still stands). No throw — tracking is best-effort.
    return null;
  } finally {
    tracking.delete(tableId);
    deletedWhileTracking.delete(tableId);
  }
}

// The single chokepoint that records a table as OPENED (per-user "seen") when its
// FULL grid is routed into ResultsView — from the sidebar card, the inline
// inspector, or the completion toast. It (1) optimistically flips `opened:true`
// on that table in the $tables store so the blue "finished, unopened" dot clears
// IMMEDIATELY, then (2) fires the durable server call so the "seen" survives
// across sessions. Best-effort + fire-and-forget: a failed mark leaves the dot
// cleared locally for the session (the catch swallows any error — a 404/401 is
// already tolerated, and a transient 5xx just retries on the next open/reload).
// Merely WATCHING the inline inspector fill does NOT pass through here — only
// opening the grid does.
//
// INVARIANT: every path that routes a table's FULL grid into ResultsView must
// funnel through here. Today that is openTrackedTable (inspector + completion
// toast + the card's streaming branch) and openFinishedTable (the card's instant
// branch). Any NEW full-grid open path must call markOpened too, or its blue dot
// will never clear.
function markOpened(tableId) {
  if (!tableId) return;
  tables.update((list) =>
    list.map((t) => (t.id === tableId ? { ...t, opened: true } : t)),
  );
  // Mark as pending until the durable POST commits, so a list refresh that lands
  // first doesn't clobber the optimistic opened:true back to the server's stale
  // false (the blue-dot flicker). Cleared once the server has recorded "seen".
  pendingOpened.add(tableId);
  void markTableOpened(tableId)
    .catch(() => {})
    .finally(() => pendingOpened.delete(tableId));
}

// Click-to-open: route the tracked table's run into ResultsView. Pure reuse of
// navigation.selectPopulatedTable — the inspector click and the completion-toast
// hyperlink both call this. selectPopulatedTable is dynamically imported to keep tables.js
// out of the chat/navigation static cycle (see the import note above).
export async function openTrackedTable(tableId) {
  const tracked = get(trackedTables)[tableId];
  if (!tracked) return;
  // Opening the full grid marks the table seen (inline inspector + completion
  // toast both land here); the sidebar card's instant path marks via
  // openFinishedTable, so all three open paths record "opened".
  markOpened(tableId);
  // Point the sidebar highlight at this table (symmetric to openTableCard /
  // openFinishedTable). The inline inspector click and the completion toast call
  // this directly — without this, the corresponding Tables card never lights even
  // though its grid is open (the row guards on currentTableId===id && results).
  currentTableId.set(tableId);
  const { selectPopulatedTable } = await import("./navigation.js");
  selectPopulatedTable(tracked.populatedTableEntryId);
}

// Derived inspector state per tracked table: { status: running|done|error,
// title }. Recomputes whenever the populatedTables store or the active stream changes —
// so the inline inspector flips running → done automatically as the run streams.
export const tableInspectorState = derived(
  [trackedTables, populatedTables, activeStream],
  ([tracked, list, stream]) => {
    const out = {};
    for (const [tableId, t] of Object.entries(tracked)) {
      // A table with no wrapped run (ad-hoc / queued) has no populatedTables record to
      // derive from — surface its persisted status as a non-running "queued"
      // state so the inspector doesn't spin forever.
      if (!t.tablePopulationId) {
        out[tableId] = { status: "queued", title: t.title };
        continue;
      }
      const record = list.find((a) => a.id === t.populatedTableEntryId) || null;
      const isActive = Boolean(stream && stream.populatedTableId === t.populatedTableEntryId);
      out[tableId] = { status: inspectorStatus(record, isActive), title: t.title };
    }
    return out;
  },
);

// Completion toast (Q42): when a tracked table's run reaches DONE, fire a toast
// carrying a click action that opens the finished table — wherever the user has
// roamed. Driven by subscribing to the derived state (one subscriber for all
// tracked tables); fires exactly once per table via the `notified` guard.
tableInspectorState.subscribe((states) => {
  for (const [tableId, s] of Object.entries(states)) {
    if (s.status !== "done" || notified.has(tableId)) continue;
    notified.add(tableId);
    addToast({
      kind: "success",
      message: `Your table “${s.title}” is ready.`,
      action: {
        label: "Open table",
        onClick: () => openTrackedTable(tableId),
      },
    });
  }
});

// The id of the table currently OPEN in the main panel (or null) — the explicit
// pointer the LeftPanel highlights, symmetric to threads.currentThreadId. Set by
// openTableCard for BOTH open branches (instant + streaming); the row highlight is
// guarded on currentView==="results", so opening a chat / new-chat / library
// shows no table highlighted with no manual clearing here. (Replaces the old
// trackedTables-derived activeTableId, which never lit a FINISHED table — it opens
// via the instant snapshot path and never enters trackedTables.)
export const currentTableId = writable(null);

// The inspector's human status line for a state (re-exported so the component
// imports one module). Pure pass-through to keep the seam in one place.
export { inspectorLabel };

// --- The Tables-section list store (the LeftPanel cards) --------------------
// The recency-ordered table summaries the left panel renders as cards:
// [{ id, title, description, source_template, reporting_period_label, status,
//   updated_at }]. A thin mirror of listTables() — the SAME shape threads.js
// mirrors for its section — so the section is purely additive: this store holds
// the list; opening a card reuses the run/results pipeline above (openTableCard).
export const tables = writable([]);
export const tablesError = writable(null);

// Reload the table summaries (recency-ordered server-side). On failure the list
// is left as-is and the error is surfaced — a refresh never blanks the section.
export async function refreshTables() {
  tablesError.set(null);
  try {
    const list = await listTables();
    const next = Array.isArray(list) ? list : [];
    // Preserve a locally-pending optimistic "opened" (markOpened flipped it but
    // the durable POST hasn't committed yet): the server list may still report
    // opened:false, which would otherwise re-show the cleared blue dot until the
    // POST lands. Once the POST commits the id leaves pendingOpened and the
    // server's own opened:true takes over.
    tables.set(
      pendingOpened.size === 0
        ? next
        : next.map((t) => (pendingOpened.has(t.id) ? { ...t, opened: true } : t)),
    );
  } catch (err) {
    tablesError.set((err && err.message) || "Failed to load tables");
  }
}

// Logout-scoped wipe: drop the card list, the open-table pointer, the tracked
// associations, and the per-table guard sets so the next user signing in on the
// same tab starts clean (no previous user's table resident/tracked). Mirrors
// threads.resetThreads / populatedTables.resetPopulatedTableHistory.
export function resetTables() {
  tables.set([]);
  tablesError.set(null);
  currentTableId.set(null);
  trackedTables.set({});
  notified.clear();
  pendingOpened.clear();
  deletedWhileTracking.clear();
}

// Rename a table server-side (title only — scope is pinned for life, 0004), then
// mirror the new title into the card-list entry (mirrors threads.renameThread).
export async function renameTable(id, title) {
  if (!id) return;
  const next = String(title || "").trim();
  if (!next) return;
  try {
    await apiRenameTable(id, next);
    tables.update((list) => list.map((t) => (t.id === id ? { ...t, title: next } : t)));
  } catch (err) {
    tablesError.set((err && err.message) || "Rename failed");
  }
}

// Delete a table server-side, drop it from the card list, and drop it from the
// tracked set if it was being tracked (mirrors threads.removeThread, at the table
// level). The open grid is owned by the populatedTables store; if the deleted table was the
// open one its populatedTables entry simply has no card left to reopen it from.
export async function removeTable(id) {
  if (!id) return;
  // If a trackTable() for this id is mid-await, mark it deleted SYNCHRONOUSLY —
  // before our own await — so its post-await re-track guard sees the deletion no
  // matter which request resolves first, and aborts re-registration instead of
  // resurrecting a deleted table with a live run stream + a later toast (#9).
  if (tracking.has(id)) deletedWhileTracking.add(id);
  try {
    await deleteTable(id);
    tables.update((list) => list.filter((t) => t.id !== id));
    if (get(currentTableId) === id) currentTableId.set(null);
    trackedTables.update((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
    // Also clear the completion-toast guard so a table re-tracked under the SAME
    // id can fire its toast again on a later run (#6) — without this the guard
    // leaks and suppresses every future completion for that id.
    notified.delete(id);
  } catch (err) {
    tablesError.set((err && err.message) || "Delete failed");
  }
}

// Pure search + filter over the card list (tested directly). `query` matches
// title OR description (case-insensitive); `template` narrows to one
// source_template, or "all" to disable the template filter. Server already
// returns recency order, so this preserves input order.
export function filterTables(list, query, template) {
  const q = String(query || "").trim().toLowerCase();
  const tmpl = template || "all";
  return (list || []).filter((t) => {
    if (tmpl !== "all" && t.source_template !== tmpl) return false;
    if (!q) return true;
    const hay = `${t.title || ""} ${t.description || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

// The distinct source_templates present in the list — the options the section's
// "filter by template" control offers (so it only ever shows templates that
// actually have tables). Order follows first appearance (recency).
export function tableSourceTemplates(list) {
  const seen = [];
  for (const t of list || []) {
    const s = t.source_template;
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen;
}

// Open a Tables-section card in the main panel — pure REUSE of the run/results
// pipeline above (it does NOT rebuild the grid or the run stream). The path
// BRANCHES on the table's status (openDecisionForStatus):
//   • FINISHED ("complete") → open INSTANTLY, fully populated, with NO agent
//     re-run: route to the populated-snapshot path (openWorkbook), exactly like
//     a saved BPT dashboard. No startRunStream — the finished table never
//     re-spins the agent just because it was clicked.
//   • still WORKING → keep the live streaming path: track the table's wrapped
//     run through the EXISTING populatedTables/run pipeline (trackTable), then route it
//     into ResultsView (openTrackedTable → navigation.selectPopulatedTable). This is the
//     SAME path the inline TableInspector and the completion toast use.
export async function openTableCard(tableId) {
  if (!tableId) return;
  // The list summary already carries the status (kept fresh by the backend's
  // list_tables run-status refresh), so the common case decides without a fetch.
  const summary = get(tables).find((t) => t.id === tableId);
  if (summary && openDecisionForStatus(summary.status) === "instant") {
    await openFinishedTable(tableId);
    return;
  }
  await trackTable(tableId);
  // Point the sidebar highlight at this table once the open succeeds — set right
  // before routing into ResultsView, symmetric to threads.openThread setting
  // currentThreadId only after its load resolves (so a failed open never lights
  // the wrong row). The row's currentView==="results" guard clears it on navigate.
  currentTableId.set(tableId);
  await openTrackedTable(tableId);
}

// Instant-open a FINISHED table: load it for its table_population_id, then route to the
// populated-snapshot path (chat.openWorkbook) — which ensures a "completed"
// populatedTables owner for the run, fetches the populated workbook, and (in mock mode)
// does NOT reconnect a stream. No trackTable, no startRunStream: the agent is
// never re-run. A table with no wrapped run falls back to the streaming path so
// it still surfaces its (queued/ad-hoc) state rather than opening empty.
async function openFinishedTable(tableId) {
  let table;
  try {
    table = await getTable(tableId);
  } catch {
    // Best-effort, like trackTable: a failed load (e.g. the table was deleted
    // between the list refresh and the click) opens nothing rather than throwing
    // an unhandled rejection out of the fire-and-forget click handler.
    return;
  }
  if (!table?.table_population_id) {
    await trackTable(tableId);
    currentTableId.set(tableId);
    await openTrackedTable(tableId);
    return;
  }
  // The card's instant path opens the full grid → mark it seen (the streaming
  // branch above marks via openTrackedTable instead, so each open marks once).
  markOpened(tableId);
  // Highlight the row now that the load succeeded (see openTableCard's note) —
  // a failed getTable above returns before reaching here, so the wrong row never
  // lights up.
  currentTableId.set(tableId);
  const { openWorkbook } = await import("./chat.js");
  const { goToResults } = await import("./navigation.js");
  goToResults();
  // openWorkbook self-catches its snapshot fetch and surfaces the cause via the
  // chat `error` store, so we don't double-handle it here.
  await openWorkbook(table.table_population_id);
}
