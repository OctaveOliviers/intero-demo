import test from "node:test";
import assert from "node:assert/strict";
import { CELL_VISUAL_STATUS, mapCellVisualStatus } from "./cellVisualStatus.js";

test("maps state=blocked to its own blocked status (not needs_review)", () => {
  // A blocked cell carries confidence=low + agent provenance; it must read as
  // blocked, not be mis-coloured as needs_review via the confidence rule.
  const status = mapCellVisualStatus({
    state: "blocked",
    confidence: "low",
    reason_code: "NOT_LOCATED",
  });
  assert.equal(status, CELL_VISUAL_STATUS.BLOCKED);
});

test("a blocked cell acknowledged on dwell (review_state=reviewed) reads as blocked_seen", () => {
  // The viewer sets review_state=reviewed after the dwell; blocked then recedes
  // from red to gray (mirrors needs_review -> reviewed) while unseen blocks stay red.
  const status = mapCellVisualStatus({
    state: "blocked",
    confidence: "low",
    reason_code: "NOT_LOCATED",
    review_state: "reviewed",
  });
  assert.equal(status, CELL_VISUAL_STATUS.BLOCKED_SEEN);
});

test("a reviewed cell is settled even at low confidence", () => {
  const status = mapCellVisualStatus({ review_state: "reviewed", confidence: "low" });
  assert.equal(status, CELL_VISUAL_STATUS.REVIEWED);
});

test("maps state=not_applicable to legacy even when review signals exist", () => {
  const status = mapCellVisualStatus({
    state: "not_applicable",
    confidence: "low",
    review_state: "not_reviewed",
    kind: "interpret",
  });
  assert.equal(status, CELL_VISUAL_STATUS.LEGACY);
});

test("maps confidence=low to needs_review", () => {
  const status = mapCellVisualStatus({ confidence: "low" });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("maps confidence=medium to needs_review", () => {
  const status = mapCellVisualStatus({ confidence: "medium" });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("maps review_state=not_reviewed to needs_review", () => {
  const status = mapCellVisualStatus({ review_state: "not_reviewed" });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("maps kind=interpret with missing review_state to needs_review", () => {
  const status = mapCellVisualStatus({ kind: "interpret" });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("maps kind=interpretive with missing review_state to needs_review", () => {
  const status = mapCellVisualStatus({ kind: "interpretive", review_state: "" });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("maps direct with high confidence and reviewed state to reviewed", () => {
  const status = mapCellVisualStatus({
    kind: "direct",
    confidence: "high",
    review_state: "reviewed",
  });
  assert.equal(status, CELL_VISUAL_STATUS.REVIEWED);
});

test("maps direct with empty confidence and missing review_state to reviewed", () => {
  const status = mapCellVisualStatus({ kind: "direct", confidence: "" });
  assert.equal(status, CELL_VISUAL_STATUS.REVIEWED);
});

test("maps missing metadata to reviewed deterministically", () => {
  assert.equal(mapCellVisualStatus(), CELL_VISUAL_STATUS.REVIEWED);
  assert.equal(mapCellVisualStatus(null), CELL_VISUAL_STATUS.REVIEWED);
  assert.equal(mapCellVisualStatus({}), CELL_VISUAL_STATUS.REVIEWED);
  assert.equal(mapCellVisualStatus("not-an-object"), CELL_VISUAL_STATUS.REVIEWED);
  assert.equal(mapCellVisualStatus([]), CELL_VISUAL_STATUS.REVIEWED);
});

test("enforces precedence order legacy over needs_review over reviewed", () => {
  const status = mapCellVisualStatus({
    state: "not_applicable",
    confidence: "medium",
    review_state: "not_reviewed",
    kind: "interpretive",
  });
  assert.equal(status, CELL_VISUAL_STATUS.LEGACY);
});

test("supports nested meta payload shape", () => {
  const status = mapCellVisualStatus({
    meta: {
      kind: "interpretive",
      review_state: "not_reviewed",
    },
  });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});

test("supports camelCase and alternate field names", () => {
  const status = mapCellVisualStatus({
    audit_state: "not_applicable",
    confidence_level: "medium",
    reviewState: "not_reviewed",
  });
  assert.equal(status, CELL_VISUAL_STATUS.LEGACY);
});

test("falls back to nested state when top-level state is empty", () => {
  const status = mapCellVisualStatus({
    state: null,
    meta: { state: "not_applicable" },
  });
  assert.equal(status, CELL_VISUAL_STATUS.LEGACY);
});

test("falls back to nested confidence/review when top-level values are empty", () => {
  const status = mapCellVisualStatus({
    confidence: "",
    review_state: null,
    meta: { confidence: "medium", review_state: "not_reviewed" },
  });
  assert.equal(status, CELL_VISUAL_STATUS.NEEDS_REVIEW);
});
