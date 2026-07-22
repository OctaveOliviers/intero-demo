import test from "node:test";
import assert from "node:assert/strict";

import { answerSegments, markdownHtml, scopeDisclosureVariant } from "./chatAnswer.js";

test("answerSegments replaces inline markers with deterministic citation chips", () => {
  const segments = answerSegments("There were 412 births [10].", [
    { marker: "10", database: "cord-ph", query: "SELECT 1", table_column: "t.c" },
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "text", "citation"],
  );
  assert.equal(segments[0].text, "There were 412 births");
  assert.equal(segments[1].text, ".");
  assert.equal(segments[2].marker, "10");
  assert.equal(segments[2].displayNumber, 1);
  assert.equal(segments[2].text, "1");
  assert.equal(segments.map((segment) => segment.text || "").join(""), "There were 412 births.1");
});

test("answerSegments does not hyperlink the evidenced phrase", () => {
  const segments = answerSegments("There were 412 births this quarter [1].", [
    { marker: "1", database: "cord-ph", query: "SELECT 1", table_column: "t.c" },
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "text", "citation"],
  );
  assert.equal(segments[0].text, "There were 412 births this quarter");
  assert.equal(segments[1].text, ".");
  assert.equal(segments[2].text, "1");
});

test("answerSegments keeps non-numeric evidence as answer text", () => {
  const segments = answerSegments("The note says family declined escalation [1].", [
    { marker: "1", database: "cord-ph", query: "SELECT 1", table_column: "notes.note_text" },
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "text", "citation"],
  );
  assert.equal(segments[0].text, "The note says family declined escalation");
  assert.equal(segments[1].text, ".");
  assert.equal(segments[2].text, "1");
});

test("answerSegments numbers sources by first rendered occurrence", () => {
  const segments = answerSegments("First [10]. Second [3]. First again [10].", [
    { marker: "3", database: "cord-ph", query: "SELECT 3", table_column: "t.c" },
    { marker: "10", database: "cord-ph", query: "SELECT 10", table_column: "t.c" },
  ]);
  const chips = segments.filter((segment) => segment.type === "citation");
  assert.deepEqual(
    chips.map((chip) => [chip.marker, chip.displayNumber, chip.text]),
    [
      ["10", 1, "1"],
      ["3", 2, "2"],
      ["10", 1, "1"],
    ],
  );
});

test("answerSegments keeps adjacent citation chips after sentence punctuation", () => {
  const segments = answerSegments("Combined finding [10] [3].", [
    { marker: "3", database: "cord-ph", query: "SELECT 3", table_column: "t.c" },
    { marker: "10", database: "cord-ph", query: "SELECT 10", table_column: "t.c" },
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "text", "citation", "citation"],
  );
  assert.equal(segments[0].text, "Combined finding");
  assert.equal(segments[1].text, ".");
  assert.deepEqual(
    segments
      .filter((segment) => segment.type === "citation")
      .map((chip) => [chip.marker, chip.displayNumber, chip.text]),
    [
      ["10", 1, "1"],
      ["3", 2, "2"],
    ],
  );
});

test("answerSegments can render citation-backed text spans", () => {
  const segments = answerSegments("There are [12 paediatric diabetes patients]{1} in scope.", [
    { marker: "1", database: "diabetes", query: "SELECT 1", table_column: "t.c" },
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "citation", "text"],
  );
  assert.equal(segments[0].text, "There are ");
  assert.equal(segments[1].marker, "1");
  assert.equal(segments[1].text, "12 paediatric diabetes patients");
  assert.equal(segments[1].linkedText, true);
  assert.equal(segments[2].text, " in scope.");
});

test("markdownHtml renders pipe tables for chat answers", () => {
  const html = markdownHtml("| Metric | Value |\n| --- | ---: |\n| Births | 412 |");
  assert.match(html, /<table>/);
  assert.match(html, /<th>Metric<\/th>/);
  assert.match(html, />412<\/td>/);
});

test("scopeDisclosureVariant hides whole-db disclosure and keeps dataset chips", () => {
  assert.equal(scopeDisclosureVariant({ kind: "whole_db" }), null);
  assert.equal(scopeDisclosureVariant({ kind: "dataset", dataset_id: "dataset-1" }), "chip");
});

test("scopeDisclosureVariant hides unresolved dataset prompts", () => {
  assert.equal(scopeDisclosureVariant({ kind: "dataset", dataset_id: null }), null);
});
