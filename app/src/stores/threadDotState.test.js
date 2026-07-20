import test from "node:test";
import assert from "node:assert/strict";

import { threadDotState } from "./threadDotState.js";

test('a running thread summary shows the "working" dot', () => {
  assert.equal(threadDotState({ status: "running", opened: false }), "working");
});

test('a complete unopened thread summary shows the "unopened" dot', () => {
  assert.equal(threadDotState({ status: "complete", opened: false }), "unopened");
});

test("a complete opened thread summary shows no dot", () => {
  assert.equal(threadDotState({ status: "complete", opened: true }), "none");
});

test("an old thread summary without status shows no dot", () => {
  assert.equal(threadDotState({ id: "thread-old", title: "Old mock" }), "none");
});
