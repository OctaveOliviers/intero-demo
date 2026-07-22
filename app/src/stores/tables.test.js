import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

// Exercise the tables store (the bridge that turns a thread's table_id into a
// live-filling run via the EXISTING populatedTables/run pipeline) against the in-memory
// mock layer. Force mock mode before importing anything that pulls api.js.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const { getTable, createTable } = await import("../lib/api.js");
const {
  populatedTables,
  currentPopulatedTableId,
  startTablePopulation,
  setPopulatedTablePopulationId,
  setPopulatedTableStatus,
} = await import("./populatedTables.js");
const { toasts } = await import("./toasts.js");
const {
  trackedTables,
  trackTable,
  tableInspectorState,
  openTrackedTable,
  tables,
  refreshTables,
  openTableCard,
  filterTables,
  tableSourceTemplates,
  currentTableId,
  removeTable,
  renameTable,
  resetTables,
} = await import("./tables.js");
const { currentView } = await import("./navigation.js");

async function spawnTableId() {
  const table = await createTable({
    title: "Audit discharge summaries per patient",
    source_template: "cord-ph",
  });
  return table.id;
}

test("trackTable registers a run in the populatedTables store and tracks the association", async () => {
  const tableId = await spawnTableId();
  const before = get(populatedTables).length;

  await trackTable(tableId);

  // A NEW populatedTables entry was created for the table's run (reusing startTablePopulation).
  assert.equal(get(populatedTables).length, before + 1);
  const tracked = get(trackedTables)[tableId];
  assert.ok(tracked, "the table is now tracked");
  assert.ok(tracked.populatedTableEntryId, "it owns a populatedTables entry");
  assert.ok(tracked.tablePopulationId, "it knows the wrapped run id");

  // The owning populatedTables entry carries that tablePopulationId (the bridge wired startTablePopulation →
  // setPopulatedTablePopulationId → startRunStream).
  const owner = get(populatedTables).find((a) => a.id === tracked.populatedTableEntryId);
  assert.ok(owner);
  assert.equal(owner.tablePopulationId, tracked.tablePopulationId);
});

test("trackTable is idempotent — tracking the same table twice reuses the entry", async () => {
  const tableId = await spawnTableId();
  await trackTable(tableId);
  const first = get(trackedTables)[tableId].populatedTableEntryId;
  const count = get(populatedTables).length;
  await trackTable(tableId);
  assert.equal(get(trackedTables)[tableId].populatedTableEntryId, first, "same entry");
  assert.equal(get(populatedTables).length, count, "no second run registered");
});

test("the inspector state derives running while the run is live", async () => {
  const tableId = await spawnTableId();
  await trackTable(tableId);
  const state = get(tableInspectorState)[tableId];
  assert.ok(state, "an inspector state exists for the tracked table");
  assert.equal(state.status, "running");
  assert.equal(typeof state.title, "string");
});

test("openTrackedTable routes the run into ResultsView via selectPopulatedTable", async () => {
  const tableId = await spawnTableId();
  await trackTable(tableId);
  const { populatedTableEntryId } = get(trackedTables)[tableId];

  await openTrackedTable(tableId);

  // selectPopulatedTable flips the view synchronously; it points currentPopulatedTableId at the
  // entry either synchronously (active run) or after the snapshot fetch resolves
  // (a run whose live stream already settled re-reads the backend workbook
  // first). Assert the immediate view switch, then let the pointer land.
  assert.equal(get(currentView), "results");
  const deadline = Date.now() + 2000;
  while (get(currentPopulatedTableId) !== populatedTableEntryId && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(get(currentPopulatedTableId), populatedTableEntryId);
});

test("the run completes → inspector flips to done and a completion toast fires", async () => {
  const tableId = await spawnTableId();
  await trackTable(tableId);

  // Drive the mock timeline to completion. The mock run stream plays on
  // setTimeout; poll the derived state until it reaches a terminal status.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const s = get(tableInspectorState)[tableId];
    if (s && (s.status === "done" || s.status === "error")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const finalState = get(tableInspectorState)[tableId];
  assert.equal(finalState.status, "done", "the run reached done");

  // A completion toast was fired carrying a click ACTION (the Q42 hyperlink).
  const completionToast = get(toasts).find(
    (t) => t.action && typeof t.action.onClick === "function",
  );
  assert.ok(completionToast, "a toast with a click action was added on completion");
  assert.match(completionToast.message, /ready|table/i);
});

// The completion toast fires exactly once per tracked table via the module-level
// `notified` guard. removeTable must ALSO clear that guard (#6): if a table is
// removed and later re-tracked under the SAME id, its second run must be able to
// fire the completion toast AGAIN — otherwise the leaked guard suppresses it
// forever. We drive the DONE state through the same store inputs the inspector
// derives from (a completed populatedTables record + a trackedTables entry) rather than
// the run stream, so the SAME id can be re-established after removal (the mock
// deletes the table on remove, so it can't re-issue the same id itself).

// Count completion toasts (those carrying the Q42 click action).
function completionToastCount() {
  return get(toasts).filter(
    (t) => t.action && typeof t.action.onClick === "function",
  ).length;
}

// Mark a tracked table DONE the way the run stream would: a completed populatedTables
// record + a trackedTables entry pointing at it. The toast subscriber, watching
// tableInspectorState, then fires the completion toast for that id.
function markTrackedTableDone(tableId, title) {
  const populatedTableEntryId = startTablePopulation({ id: "cord-ph", name: title }, {});
  const tablePopulationId = "tp-" + tableId;
  setPopulatedTablePopulationId(populatedTableEntryId, tablePopulationId);
  setPopulatedTableStatus(populatedTableEntryId, "completed");
  trackedTables.update((m) => ({
    ...m,
    [tableId]: { tableId, populatedTableEntryId, tablePopulationId, title },
  }));
}

test("removeTable clears the completion-toast guard so a re-tracked id can re-fire", async () => {
  // A real mock table so removeTable's server delete succeeds (it must, to reach
  // the tracked-set + notified-guard clearing).
  const table = await createTable({ title: "Re-tracked table", source_template: "cord-ph" });
  const tableId = table.id;

  // First run reaches done → a completion toast fires (notified.add(tableId)).
  markTrackedTableDone(tableId, table.title);
  await new Promise((r) => setTimeout(r, 30));
  const firstState = get(tableInspectorState)[tableId];
  assert.equal(firstState.status, "done", "the first run reached done");
  const firstCount = completionToastCount();
  assert.ok(firstCount >= 1, "the first run fired a completion toast");

  // Remove the table, then re-track and complete the SAME id (a fresh run).
  await removeTable(tableId);
  assert.equal(get(trackedTables)[tableId], undefined, "untracked after remove");
  markTrackedTableDone(tableId, table.title);
  await new Promise((r) => setTimeout(r, 30));

  // With the guard cleared on remove, the second completion fires the toast AGAIN.
  const secondCount = completionToastCount();
  assert.ok(
    secondCount > firstCount,
    "the re-tracked id fired its completion toast again (guard was cleared on remove)",
  );
});

// --- removeTable: delete server-side, drop from the list + tracked set -------
// Mirrors threads.removeThread: deletes the table via the API, drops it from the
// $tables list, and (if it was tracked) drops it from $trackedTables.

test("removeTable deletes the table and drops it from the list", async () => {
  await refreshTables();
  const seed = get(tables)[0];
  assert.ok(seed, "a seeded table is present");
  assert.ok(get(tables).some((t) => t.id === seed.id), "present before");

  await removeTable(seed.id);

  assert.ok(!get(tables).some((t) => t.id === seed.id), "dropped from the list");
});

test("removeTable also drops a tracked table from the tracked set", async () => {
  const tableId = await spawnTableId();
  await refreshTables();
  await trackTable(tableId);
  assert.ok(get(trackedTables)[tableId], "tracked before");

  await removeTable(tableId);

  assert.equal(get(trackedTables)[tableId], undefined, "dropped from tracked set");
  assert.ok(!get(tables).some((t) => t.id === tableId), "dropped from the list");
});

test("renameTable updates the list entry's title", async () => {
  await refreshTables();
  const seed = get(tables)[0];
  assert.ok(seed, "a seeded table is present");

  await renameTable(seed.id, "A renamed table");

  assert.equal(
    get(tables).find((t) => t.id === seed.id)?.title,
    "A renamed table",
  );
});

// --- currentTableId: which table is the one currently OPEN -------------------
// The left panel highlights the open table's row off this explicit pointer (set
// by openTableCard, symmetric to threads.openThread setting currentThreadId) —
// guarded on currentView==="results". It must be set for BOTH open branches: the
// streaming (in-progress) path AND the instant (complete) snapshot path. The old
// derived activeTableId/findActiveTableId missed the instant path (a finished
// table never enters trackedTables), which is why the row didn't stay highlighted.

// --- The Tables-section list store (the LeftPanel cards) --------------------

test("refreshTables loads the recency-ordered table summaries", async () => {
  await refreshTables();
  const list = get(tables);
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1, "the seeded tables are present");
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].updated_at >= list[i].updated_at, "newest first");
  }
  // The card fields the section renders are present.
  const card = list[0];
  for (const key of ["id", "title", "source_template", "reporting_period_label", "status"]) {
    assert.ok(key in card, `card carries ${key}`);
  }
});

test("filterTables searches over title + description (case-insensitive)", () => {
  const list = [
    { id: "a", title: "Cord pH compliance", description: "missing cord-gas", source_template: "cord-ph" },
    { id: "b", title: "Chest pain timings", description: "door to ECG", source_template: "chest-pain" },
    { id: "c", title: "Other audit", description: "matches CORD by description only? no", source_template: "cord-ph" },
  ];
  // Title match.
  assert.deepEqual(filterTables(list, "cord ph", "all").map((t) => t.id), ["a"]);
  // Description match (case-insensitive).
  assert.deepEqual(filterTables(list, "ECG", "all").map((t) => t.id), ["b"]);
  // Empty query returns all.
  assert.equal(filterTables(list, "", "all").length, 3);
});

test("filterTables filters by source_template", () => {
  const list = [
    { id: "a", title: "x", description: "", source_template: "cord-ph" },
    { id: "b", title: "y", description: "", source_template: "chest-pain" },
    { id: "c", title: "z", description: "", source_template: "cord-ph" },
  ];
  assert.deepEqual(filterTables(list, "", "cord-ph").map((t) => t.id), ["a", "c"]);
  // The template filter composes with the text search.
  assert.deepEqual(filterTables(list, "z", "cord-ph").map((t) => t.id), ["c"]);
  // "all" disables the template filter.
  assert.equal(filterTables(list, "", "all").length, 3);
});

test("tableSourceTemplates lists the distinct templates present (for the filter)", async () => {
  await refreshTables();
  const templates = tableSourceTemplates(get(tables));
  assert.ok(Array.isArray(templates));
  // Distinct, no duplicates.
  assert.equal(new Set(templates).size, templates.length);
  // The seeded tables include cord-ph and chest-pain.
  assert.ok(templates.includes("cord-ph"));
  assert.ok(templates.includes("chest-pain"));
});

test("openTableCard streams an IN-PROGRESS table: tracks then opens via selectPopulatedTable", async () => {
  // A freshly-spawned (chat) table is in_progress — it must keep the live
  // streaming path (trackTable → openTrackedTable).
  const tableId = await spawnTableId();

  await openTableCard(tableId);

  // It tracked the table through the SAME pipeline trackTable uses (populatedTables entry).
  const tracked = get(trackedTables)[tableId];
  assert.ok(tracked, "the in-progress table is tracked via the existing pipeline");
  assert.ok(tracked.populatedTableEntryId, "it owns a populatedTables entry (reused run pipeline)");

  // And it routed into ResultsView via selectPopulatedTable (currentView flips to results).
  assert.equal(get(currentView), "results");
  const deadline = Date.now() + 2000;
  while (get(currentPopulatedTableId) !== tracked.populatedTableEntryId && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(get(currentPopulatedTableId), tracked.populatedTableEntryId);

  // Bug B: the streaming branch points currentTableId at the opened table so the
  // sidebar row highlights (and stays highlighted) while it's open.
  assert.equal(get(currentTableId), tableId, "streaming branch sets currentTableId");
});

test("openTableCard opens a COMPLETE table INSTANTLY via the snapshot path (no re-run)", async () => {
  await refreshTables();
  // The seed cards are status:"complete" — opening one must NOT re-spin the
  // agent. It reuses the populated-snapshot path (openWorkbook), exactly like a
  // saved BPT dashboard: a populatedTables owner for the table's population, a populated
  // workbook, and NO stream registration (no trackedTables entry / no replay).
  const seed = get(tables).find((t) => t.status === "complete");
  assert.ok(seed, "a complete seed table is present");
  // The list summary carries the status the open-decision branches on; the population
  // id lives on the full table (fetched by the instant path) — read it directly.
  const fullTable = await getTable(seed.id);
  assert.ok(fullTable.table_population_id, "the seed wraps a table population");

  await openTableCard(seed.id);

  // Routed into ResultsView, pointed at a populatedTables entry that owns the population.
  assert.equal(get(currentView), "results");
  const deadline = Date.now() + 2000;
  let owner = null;
  while (Date.now() < deadline) {
    owner = get(populatedTables).find((a) => a.id === get(currentPopulatedTableId));
    if (owner && owner.tablePopulationId === fullTable.table_population_id && owner.workbook) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(owner, "a populatedTables owner is selected");
  assert.equal(owner.tablePopulationId, fullTable.table_population_id, "the owner wraps the table's run");
  assert.ok(owner.workbook, "the workbook is populated from the snapshot");

  // The instant path does NOT register a streaming-tracked entry (no re-run).
  assert.equal(get(trackedTables)[seed.id], undefined, "no trackTable / stream replay");

  // Bug B: the instant (complete) branch ALSO sets currentTableId — the case the
  // old trackedTables-derived highlight missed, leaving finished tables unlit.
  assert.equal(get(currentTableId), seed.id, "instant branch sets currentTableId");
});

// --- Per-user "opened" (the blue dot clears when the full grid is opened) ----
// Opening the FULL grid — from the sidebar card, the inline inspector, OR the
// completion toast — marks the table opened: optimistically (opened:true in the
// $tables store so the blue dot clears immediately) AND durably (the server call,
// proven via listTables reporting opened:true after a refresh).

async function listTablesById(id) {
  const { listTables } = await import("../lib/api.js");
  return (await listTables()).find((t) => t.id === id);
}

test("openTableCard (sidebar) on a COMPLETE table marks it opened, optimistically + on the server", async () => {
  await refreshTables();
  // A complete seed table this session has NOT opened yet (the mock opened-set
  // is module-level; pick a pristine one so the precondition is honest).
  const seed = get(tables).find((t) => t.status === "complete" && !t.opened);
  assert.ok(seed, "a complete, unopened seed table is present");
  assert.equal((await listTablesById(seed.id)).opened, false, "unopened before");

  await openTableCard(seed.id);

  // Optimistic: the $tables entry flips opened:true immediately (blue dot clears).
  assert.equal(get(tables).find((t) => t.id === seed.id).opened, true, "optimistic");
  // Durable: the server now reports it opened.
  assert.equal((await listTablesById(seed.id)).opened, true, "server marked opened");
});

test("openTableCard (sidebar) on an IN-PROGRESS table marks it opened too", async () => {
  // Opening marks opened regardless of status; "opened" only suppresses the BLUE
  // state, so a still-working table stays amber but is still recorded opened.
  const tableId = await spawnTableId();
  await refreshTables();
  await openTableCard(tableId);
  assert.equal((await listTablesById(tableId)).opened, true, "server marked opened");
});

test("openTrackedTable (inline inspector / completion toast) marks the table opened", async () => {
  // The inline inspector's open action and the completion toast's onClick BOTH
  // funnel through openTrackedTable — opening from either marks the table opened.
  const tableId = await spawnTableId();
  await refreshTables();
  await trackTable(tableId);
  await openTrackedTable(tableId);
  assert.equal((await listTablesById(tableId)).opened, true, "server marked opened");
});

// --- #11: openTrackedTable sets currentTableId (sidebar highlight) ------------
// The inline inspector click and the completion toast call openTrackedTable
// DIRECTLY (not through openTableCard). It must point currentTableId at the table
// so the Tables card highlights while its grid is open.

test("openTrackedTable sets currentTableId so the sidebar card highlights (#11)", async () => {
  const tableId = await spawnTableId();
  await refreshTables();
  await trackTable(tableId);
  currentTableId.set(null); // ensure the assertion proves openTrackedTable set it

  await openTrackedTable(tableId);

  assert.equal(get(currentTableId), tableId, "openTrackedTable points the highlight at the table");
});

// --- #9: a delete during trackTable's await aborts re-registration -----------
// trackTable awaits getTable; if the table is removed (removeTable) in that
// window, resuming must NOT re-register a deleted table with a live run stream.

test("trackTable aborts re-registration when the table is deleted mid-await (#9)", async () => {
  const tableId = await spawnTableId();
  await refreshTables();
  const populatedTablesBefore = (await import("./populatedTables.js")).populatedTables;
  const countBefore = get(populatedTablesBefore).length;

  // Kick off tracking (it adds to the in-flight set synchronously, then awaits
  // getTable), then delete the table before the track resolves.
  const tracking = trackTable(tableId);
  await removeTable(tableId);
  const entryId = await tracking;

  assert.equal(entryId, null, "trackTable aborted — no populatedTables entry id returned");
  assert.equal(get(trackedTables)[tableId], undefined, "the deleted table is NOT tracked");
  assert.equal(
    get(populatedTablesBefore).length,
    countBefore,
    "no run was registered for the deleted table",
  );
  assert.ok(!get(tables).some((t) => t.id === tableId), "and it's gone from the list");
});

// --- #12: a refresh during the optimistic-open window preserves opened:true ---
// markOpened flips opened:true locally + fires a (not-awaited) POST. A
// refreshTables that resolves before the POST commits must NOT overwrite opened
// back to the server's stale false (the blue-dot flicker).

test("refreshTables preserves a locally-pending optimistic opened (#12)", async () => {
  await refreshTables();
  const seed = get(tables).find((t) => t.status === "complete" && !t.opened);
  assert.ok(seed, "a complete, unopened seed table is present");

  // Open it (marks opened optimistically + fires the fire-and-forget POST), then
  // IMMEDIATELY refresh before the POST can commit — the server list still
  // reports opened:false for this id in that window.
  await openTableCard(seed.id);
  assert.equal(get(tables).find((t) => t.id === seed.id).opened, true, "optimistic flip");
  await refreshTables();

  assert.equal(
    get(tables).find((t) => t.id === seed.id)?.opened,
    true,
    "the refresh did not clobber the optimistic opened back to false",
  );
});

// --- #7: resetTables wipes table state for the next sign-in -------------------

test("resetTables clears the list, the open-table pointer and the tracked set (#7)", async () => {
  const tableId = await spawnTableId();
  await refreshTables();
  await trackTable(tableId);
  currentTableId.set(tableId);
  assert.ok(get(tables).length > 0 && get(trackedTables)[tableId], "state is resident before");

  resetTables();

  assert.deepEqual(get(tables), [], "card list cleared");
  assert.deepEqual(get(trackedTables), {}, "tracked set cleared");
  assert.equal(get(currentTableId), null, "open-table pointer cleared");
});
