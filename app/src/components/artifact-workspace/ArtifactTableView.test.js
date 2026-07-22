import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactTableView.svelte", import.meta.url), "utf8");

test("ArtifactTableView compiles", () => {
  compile(source, { filename: "ArtifactTableView.svelte", generate: false });
});

test("ArtifactTableView renders the real spreadsheet, not a bespoke table", () => {
  assert.match(source, /import ArtifactSpreadsheetTable from "\.\/ArtifactSpreadsheetTable\.svelte"/);
});

test("ArtifactTableView derives selection/context from state and forwards cell handlers", () => {
  assert.match(source, /export let table/);
  assert.match(source, /export let cellClass = \(\) => "direct"/);
  assert.match(source, /\$: selectedCells = state\?\.selectedCellRefs \|\| \[\]/);
  assert.match(source, /\$: contextCellRefs = state\?\.pendingContextCells \|\| \[\]/);
  assert.match(source, /\{onCell\}/);
  assert.match(source, /\{onCellContext\}/);
});

test("ArtifactTableView is a content view — it knows nothing about the box chrome", () => {
  assert.doesNotMatch(source, /artifact-toolbar|ArtifactEvidence|annotation-composer|resize-handle/);
});
