// Resume / live-reconnect contract for reopening an in-flight run (PR #241).
//
// The snapshot served by /workbook is a one-shot pull; to keep a still-running
// run updating after a reload/navigate-away the frontend reconnects the SSE
// stream and applies live deltas ON TOP of the snapshot. These tests pin the
// two pieces that carry the risk:
//   1. startRunStream({resume:true}) seeds the sink from what's on screen, so a
//      live cell_update lands on top of the snapshot instead of clearing it
//      (and a fresh, non-resume start still resets prior state).
//   2. openWorkbook reconnects only when the backend's authoritative tablePopulationStatus
//      says the run is still live — never for a finished run.
//
// Driven through the REAL stores, with EventSource + fetch stubbed at the
// global seam (mock mode forced off so the real SSE/HTTP paths run).
import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

// Force the real (non-mock) API + stream path regardless of ambient env.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "false" };

import {
  populatedTables,
  currentPopulatedTableId,
  activeStream,
  startTablePopulation,
  setPopulatedTablePopulationId,
  setPopulatedTableStatus,
  syncPopulatedTableActivity,
  syncPopulatedTableWorkbook,
  resetPopulatedTableHistory,
} from "./populatedTables.js";
import {
  startRunStream,
  openWorkbook,
  activeWorkbook,
  activity,
  tablePopulationStatus,
} from "./chat.js";
import { selectPopulatedTable } from "./navigation.js";

// Minimal EventSource stand-in: records every instance and lets a test push
// SSE frames through onmessage / trip onerror.
class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  close() {
    this.closed = true;
  }
}
globalThis.EventSource = FakeEventSource;

function snapshotWorkbook(tablePopulationId) {
  return {
    tablePopulationId,
    sheets: [
      { name: "ALL", data: [["Code", "Delivery"], ["P1", null]], meta: { columns: [{}, {}] } },
    ],
    cellMetadata: { "ALL!A2": { state: "filled", resolved_by: "direct" } },
    currentSheetIndex: 0,
  };
}

function reset() {
  resetPopulatedTableHistory();
  activeStream.set(null);
  FakeEventSource.instances.length = 0;
}

test("resume seeds the sink so a live cell_update lands on top of the snapshot", () => {
  reset();
  const id = startTablePopulation({ id: "npda", name: "NPDA" }, {});
  setPopulatedTablePopulationId(id, "r1");
  syncPopulatedTableWorkbook(id, snapshotWorkbook("r1"));
  syncPopulatedTableActivity(id, [{ type: "activity", headline: "Earlier work." }]);
  activeStream.set(null);

  startRunStream("r1", id, { resume: true });

  // The snapshot + activity already on screen survive a resume start.
  assert.equal(get(activeWorkbook).sheets[0].data[1][0], "P1", "snapshot value kept");
  assert.equal(get(activity).length, 1, "hydrated activity kept");

  // A live delta applies ON TOP — snapshot cell preserved, new cell filled.
  FakeEventSource.instances.at(-1).emit({
    type: "cell_update",
    sheet: "ALL",
    cells: [{ ref: "B2", value: "SVD", meta: { state: "filled", resolved_by: "agent" } }],
  });

  const wb = get(activeWorkbook);
  assert.equal(wb.sheets[0].data[1][0], "P1", "snapshot value still present after the delta");
  assert.equal(wb.sheets[0].data[1][1], "SVD", "live delta applied on top of the snapshot");
  assert.equal(wb.cellMetadata["ALL!B2"].resolved_by, "agent", "live cell metadata merged in");
});

test("starting a new stream tears down the prior one (single active stream)", () => {
  reset();
  // Run A is streaming live.
  const a = startTablePopulation({ id: "audit-a", name: "A" }, {});
  setPopulatedTablePopulationId(a, "rA");
  startRunStream("rA", a);
  const sourceA = FakeEventSource.instances.at(-1);
  assert.equal(sourceA.closed, false, "A's stream is open");

  // Opening run B (e.g. a resumed in-flight run) must close A's source rather
  // than orphan it under the shared activeSource global.
  const b = startTablePopulation({ id: "audit-b", name: "B" }, {});
  setPopulatedTablePopulationId(b, "rB");
  startRunStream("rB", b, { resume: true });

  assert.equal(sourceA.closed, true, "A's stream was torn down when B started");
  assert.equal(FakeEventSource.instances.at(-1).closed, false, "B's stream is open");
  assert.equal(get(activeStream).tablePopulationId, "rB", "activeStream now tracks B");
});

test("a fresh (non-resume) start resets the prior snapshot and activity", () => {
  reset();
  const id = startTablePopulation({ id: "npda", name: "NPDA" }, {});
  setPopulatedTablePopulationId(id, "r1");
  syncPopulatedTableWorkbook(id, snapshotWorkbook("r1"));
  syncPopulatedTableActivity(id, [{ type: "activity", headline: "Stale." }]);

  startRunStream("r1", id); // no resume

  assert.equal(get(activeWorkbook), null, "workbook cleared on a fresh start");
  assert.equal(get(activity).length, 0, "activity cleared on a fresh start");
});

test("on resume, a stream error settles to completed without discarding the snapshot", () => {
  reset();
  const id = startTablePopulation({ id: "npda", name: "NPDA" }, {});
  setPopulatedTablePopulationId(id, "r1");
  syncPopulatedTableWorkbook(id, snapshotWorkbook("r1"));
  activeStream.set(null);

  startRunStream("r1", id, { resume: true });
  // The broker yields `error` ("run already finished") when a finished+errored
  // run is reattached; a resume must read that as "no longer live", not a fail.
  FakeEventSource.instances.at(-1).emit({ type: "error", message: "run already finished" });

  assert.equal(get(tablePopulationStatus), "completed", "resume settles the spinner to completed");
  assert.ok(get(activeWorkbook), "snapshot preserved through the resume error");
});

test("openWorkbook reconnects only when the backend reports the population is still live", async () => {
  // A live population (`status.json` writes `running`) → reconnect; a finished population → no stream.
  for (const { tablePopulationId, tablePopulationStatus: status, expectStream } of [
    { tablePopulationId: "live1", tablePopulationStatus: "running", expectStream: true },
    { tablePopulationId: "done1", tablePopulationStatus: "completed", expectStream: false },
  ]) {
    reset();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...snapshotWorkbook(tablePopulationId), tablePopulationStatus: status }),
    });

    const id = startTablePopulation({ id: `a-${tablePopulationId}`, name: tablePopulationId }, {});
    setPopulatedTablePopulationId(id, tablePopulationId);
    // History hydrates everything as "completed" — the local flag is NOT the
    // signal; the backend tablePopulationStatus is. Set it wrong on purpose to prove that.
    setPopulatedTableStatus(id, "completed");
    activeStream.set(null);

    await openWorkbook(tablePopulationId);

    assert.equal(
      FakeEventSource.instances.length,
      expectStream ? 1 : 0,
      `tablePopulationStatus=${status} should ${expectStream ? "" : "not "}reconnect`,
    );
    // Settle any stream we opened so it can't leak into the next iteration.
    if (expectStream) FakeEventSource.instances.at(-1).emit({ type: "error", message: "x" });
  }

  delete globalThis.fetch;
});

test("selecting a table population from the sidebar recovers it from the backend and reconnects a live population", async () => {
  // The user's real gesture: sign out / close the browser / come back later,
  // then pick a table population in the sidebar. selectPopulatedTable must re-fetch the state.db
  // snapshot AND reconnect the live stream — without it, the grid would sit on
  // the stale localStorage copy while the backend keeps writing cells.
  reset();
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...snapshotWorkbook("rLive"), tablePopulationStatus: "running" }),
    };
  };

  // A table population hydrated from server history after a fresh session: no workbook on
  // screen, status "completed" (history always hydrates that way), not streaming.
  const id = startTablePopulation({ id: "a-live", name: "Live" }, {});
  setPopulatedTablePopulationId(id, "rLive");
  setPopulatedTableStatus(id, "completed");
  syncPopulatedTableWorkbook(id, null);
  activeStream.set(null);

  selectPopulatedTable(id);
  // selectPopulatedTable fires openWorkbook fire-and-forget; flush the async fetch chain.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(fetched, 1, "sidebar select re-fetched the /workbook snapshot");
  assert.ok(get(activeWorkbook), "snapshot populated the grid on open");
  assert.equal(get(activeWorkbook).sheets[0].data[1][0], "P1", "every state.db cell is shown");
  assert.equal(FakeEventSource.instances.length, 1, "still-live population reconnected the stream");

  // Remaining streamed events land live on the recovered grid.
  FakeEventSource.instances.at(-1).emit({
    type: "cell_update",
    sheet: "ALL",
    cells: [{ ref: "B2", value: "SVD", meta: { state: "filled", resolved_by: "agent" } }],
  });
  assert.equal(get(activeWorkbook).sheets[0].data[1][1], "SVD", "live tail applies after recovery");

  FakeEventSource.instances.at(-1).emit({ type: "error", message: "x" }); // settle
  delete globalThis.fetch;
});

test("selecting a finished population from the sidebar recovers the grid but opens no stream", async () => {
  reset();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ...snapshotWorkbook("rDone"), tablePopulationStatus: "completed" }),
  });

  const id = startTablePopulation({ id: "a-done", name: "Done" }, {});
  setPopulatedTablePopulationId(id, "rDone");
  setPopulatedTableStatus(id, "completed");
  syncPopulatedTableWorkbook(id, null);
  activeStream.set(null);

  selectPopulatedTable(id);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(get(activeWorkbook), "finished run still recovers its full grid from state.db");
  assert.equal(FakeEventSource.instances.length, 0, "a terminal run must not reconnect a stream");

  delete globalThis.fetch;
});
