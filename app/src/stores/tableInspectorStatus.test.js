import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectorStatus,
  isTerminalInspectorStatus,
  inspectorLabel,
  openDecisionForStatus,
  tableDotState,
} from "./tableInspectorStatus.js";

// The inspector's state-derivation logic, tested as a plain function (this repo
// has no Svelte component harness — Issue 1's pattern). It maps a tracked
// table's populated-tables-store record (status + whether it's the active stream) to the
// three inspector states: running → done, or error.

test("a running record (active stream) reads as running", () => {
  assert.equal(inspectorStatus({ status: "running" }, true), "running");
});

test("a record whose stream finished and completed reads as done", () => {
  assert.equal(inspectorStatus({ status: "completed" }, false), "done");
});

test("a stored 'running' record with NO active stream reads as running-but-stalled→done is NOT assumed", () => {
  // After a reload the stream is gone but the run may still be live server-side;
  // a stored "running" with no active stream is still SHOWN as running (the
  // inspector tracks the durable record — Q36). It is NOT silently flipped done.
  assert.equal(inspectorStatus({ status: "running" }, false), "running");
});

test("an errored record reads as error", () => {
  assert.equal(inspectorStatus({ status: "error" }, false), "error");
});

test("a missing record reads as running (the table was just spawned)", () => {
  assert.equal(inspectorStatus(null, false), "running");
});

test("done and error are terminal; running is not", () => {
  assert.equal(isTerminalInspectorStatus("done"), true);
  assert.equal(isTerminalInspectorStatus("error"), true);
  assert.equal(isTerminalInspectorStatus("running"), false);
});

test("inspectorLabel gives a human line per state", () => {
  assert.match(inspectorLabel("running"), /building/i);
  assert.match(inspectorLabel("done"), /ready|open|done/i);
  assert.match(inspectorLabel("error"), /fail|error|couldn/i);
});

// --- openDecisionForStatus: how a Tables-section card should open -----------
// A FINISHED table opens INSTANTLY via the populated-snapshot path (no agent
// re-run); anything still working keeps the live streaming path.

test("a complete table opens instantly (the snapshot path, no re-run)", () => {
  // The table contract's terminal success is "complete".
  assert.equal(openDecisionForStatus("complete"), "instant");
});

test("the populated-tables vocab 'completed' also opens instantly", () => {
  // VOCAB GOTCHA: populated-tables records use "completed"; treat it as finished too.
  assert.equal(openDecisionForStatus("completed"), "instant");
});

test("a working table streams (the live trackTable path)", () => {
  for (const s of ["queued", "in_progress", "blocked", "in_verification"]) {
    assert.equal(openDecisionForStatus(s), "stream", `${s} streams`);
  }
});

test("an errored or unknown status streams (safe default — never an empty re-open)", () => {
  assert.equal(openDecisionForStatus("error"), "stream");
  assert.equal(openDecisionForStatus(undefined), "stream");
});

// --- tableDotState: the honest sidebar dot ----------------------------------
// Merges the persisted summary status with the LIVE inspector overlay → the dot
// the LeftPanel shows: "working" (amber) vs "finished" (no dot). The live
// overlay WINS when present (a tracked table that just finished must clear its
// amber dot even though its summary still says "in_progress").

// THREE states (Slice 3): working (amber) / unopened (blue) / none. A finished
// table the user has NOT opened shows the blue "unopened" dot; once opened it
// shows nothing. `opened` is the per-user seen flag (default false = unopened).

test("a working summary status with no live overlay shows the amber dot", () => {
  for (const s of ["queued", "in_progress", "blocked", "in_verification"]) {
    assert.equal(tableDotState(s, null, false), "working", `${s} → working`);
  }
});

test("a finished, UNOPENED table shows the blue dot", () => {
  assert.equal(tableDotState("complete", null, false), "unopened");
});

test("a finished, OPENED table shows NO dot", () => {
  assert.equal(tableDotState("complete", null, true), "none");
});

test("an errored, unopened table shows the blue dot (error is finished)", () => {
  // Error is a terminal/finished state; until the user opens it, it's unopened.
  assert.equal(tableDotState("error", null, false), "unopened");
});

test("the live overlay WINS: a just-finished UNOPENED table shows the blue dot", () => {
  // Summary still says in_progress (the list hasn't refreshed) but the live run
  // reached done — the amber dot flips to blue (finished, not yet opened).
  assert.equal(tableDotState("in_progress", { status: "done" }, false), "unopened");
});

test("the live overlay WINS: a just-finished OPENED table shows NO dot", () => {
  // The user opened the still-working table; when it finishes it goes straight to
  // no-dot (opened suppresses the blue state).
  assert.equal(tableDotState("in_progress", { status: "done" }, true), "none");
});

test("opening a still-WORKING table keeps it amber (opened only suppresses blue)", () => {
  // A still-working table stays amber even when opened; it goes to no-dot only
  // when it finishes (then opened suppresses the blue state).
  assert.equal(tableDotState("in_progress", null, true), "working");
  assert.equal(tableDotState("in_progress", { status: "running" }, true), "working");
});

test("the live overlay keeps the dot amber while the run is genuinely running", () => {
  // Summary says complete (stale) but the live run is still streaming — trust live.
  assert.equal(tableDotState("complete", { status: "running" }, false), "working");
});

test("a tracked QUEUED table keeps its amber dot (queued is not terminal)", () => {
  // A no-run (ad-hoc) tracked table surfaces a live "queued" overlay; queued is a
  // working state, so opening its card must NOT clear the dot. Only a TERMINAL
  // live status (done/error) leaves the working state.
  assert.equal(tableDotState("queued", { status: "queued" }, false), "working");
  assert.equal(tableDotState("in_progress", { status: "queued" }, false), "working");
});

test("a live error overlay on an unopened table shows the blue dot", () => {
  assert.equal(tableDotState("in_progress", { status: "error" }, false), "unopened");
});
