import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactSpreadsheetTable.svelte", import.meta.url), "utf8");

test("ArtifactSpreadsheetTable removes the shared spreadsheet outer frame inside the artifact", () => {
  compile(source, { filename: "ArtifactSpreadsheetTable.svelte", generate: false });

  assert.match(source, /\.artifact-spreadsheet-table\s+:global\(\.viewer\)\s*\{[\s\S]*border:\s*0/);
  assert.match(source, /\.artifact-spreadsheet-table\s+:global\(\.viewer\)\s*\{[\s\S]*background:\s*transparent/);
  assert.match(source, /\.artifact-spreadsheet-table\s+:global\(\.viewer\)\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(source, /\.artifact-spreadsheet-table\s+:global\(\.jss_content\)/);
});

test("ArtifactSpreadsheetTable highlights follow-up context cells with the normal cell highlight pipeline", () => {
  compile(source, { filename: "ArtifactSpreadsheetTable.svelte", generate: false });

  assert.match(source, /export let contextCellRefs = \[\]/);
  assert.match(source, /\.\.\.selectedCells,\s*\.\.\.contributingCells,\s*\.\.\.contextCellRefs/s);
  assert.match(source, /onCellContext\(table\.tableId,\s*row\.id,\s*column\.id,\s*anchor\)/);
});
