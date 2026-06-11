import test from "node:test";
import assert from "node:assert/strict";

import { dispatchMockTimelineStep } from "./mockTimeline.js";
import { buildTimeline } from "./mockData.js";

test("mock timeline dispatches review_summary through dedicated callback", () => {
  const calls = [];
  const callbacks = {
    onReviewSummary(event) {
      calls.push(["review_summary", event.type]);
    },
    onDone() {
      calls.push(["done"]);
    },
  };

  dispatchMockTimelineStep(
    {
      kind: "review_summary",
      event: {
        type: "review_summary",
        totals: { cells: 0, filled: 0, blocked: 0, needs_verification: 0, low_confidence: 0 },
        blocking: { count: 0, reason_codes: {}, focus: [] },
        verification: {
          pending: 0,
          reviewed: 0,
          corrected: 0,
          focus: { needs_review: [], low_confidence: [], assumptions: [] },
        },
      },
    },
    callbacks,
  );
  dispatchMockTimelineStep({ kind: "done", event: {} }, callbacks);

  assert.deepEqual(calls, [["review_summary", "review_summary"], ["done"]]);
});

test("mock timeline activity steps emit strict-v2 run event type", () => {
  const calls = [];
  dispatchMockTimelineStep(
    {
      kind: "activity",
      event: {
        type: "activity",
        headline: "Thinking through unresolved values.",
        detail: "Reading notes",
      },
    },
    {
      onActivity(event) {
        calls.push(event.type);
      },
    },
  );
  assert.deepEqual(calls, ["activity"]);
});

test("all mock flows keep strict-v2 activity shape and terminal review_summary ordering", () => {
  for (const flow of ["A", "B", "C"]) {
    const steps = buildTimeline(flow);
    const activitySteps = steps.filter((step) => step.kind === "activity");
    assert.ok(activitySteps.length > 0, `expected activity steps for flow ${flow}`);
    for (const step of activitySteps) {
      assert.equal(step.event.type, "activity", `flow ${flow} must emit strict-v2 activity type`);
      assert.equal(typeof step.event.headline, "string", `flow ${flow} activity headline must be string`);
      assert.ok(step.event.headline.trim().length > 0, `flow ${flow} activity headline must be non-empty`);
    }

    const kinds = steps.map((step) => step.kind);
    const reviewIdx = kinds.indexOf("review_summary");
    const doneIdx = kinds.indexOf("done");
    assert.ok(reviewIdx >= 0, `flow ${flow} must include review_summary`);
    assert.ok(doneIdx >= 0, `flow ${flow} must include done`);
    assert.ok(reviewIdx < doneIdx, `flow ${flow} review_summary must precede done`);
  }
});
