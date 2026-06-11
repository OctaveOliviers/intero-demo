import test from "node:test";
import assert from "node:assert/strict";

import { applyRunEvent, terminalStatusForEventType } from "./runStreamHandlers.js";
import { shouldShowTerminalSummary } from "../components/resultsViewState.js";

function makeSink() {
  return {
    activity: [],
    workbook: null,
    cells: [],
    summary: null,
    messages: [],
    append(event) {
      this.activity.push(event);
    },
    createWorkbook(event) {
      this.workbook = event;
    },
    emitChip(_label) {},
    applyCells(event) {
      this.cells.push(event);
    },
    setReviewSummary(event) {
      this.summary = event;
    },
    emitMessage(message) {
      this.messages.push(message);
    },
  };
}

test("review_summary is captured even when no activity events are processed", () => {
  const sink = makeSink();
  const terminal = applyRunEvent(
    {
      type: "review_summary",
      totals: { cells: 1, filled: 1, blocked: 0, needs_verification: 0, low_confidence: 0 },
      blocking: { count: 0, reason_codes: {}, focus: [] },
      verification: {
        pending: 0,
        reviewed: 0,
        corrected: 0,
        focus: { needs_review: [], low_confidence: [], assumptions: [] },
      },
    },
    sink,
  );

  assert.equal(terminal, null);
  assert.equal(sink.activity.length, 0);
  assert.equal(sink.summary?.type, "review_summary");
  assert.equal(shouldShowTerminalSummary("completed", sink.summary), true);
});

test("legacy and malformed activity payloads are ignored", () => {
  const sink = makeSink();
  assert.equal(applyRunEvent({ type: "thinking", headline: "legacy thinking" }, sink), null);
  assert.equal(applyRunEvent({ type: "tool", headline: "legacy tool" }, sink), null);
  assert.equal(applyRunEvent({ type: "text", summary: "legacy" }, sink), null);
  assert.equal(applyRunEvent({ type: "activity", headline: "   " }, sink), null);
  assert.equal(sink.activity.length, 0);
});

test("terminal lifecycle status mapping remains intact", () => {
  assert.equal(terminalStatusForEventType("done"), "completed");
  assert.equal(terminalStatusForEventType("error"), "error");
  assert.equal(terminalStatusForEventType("review_summary"), null);
});
