import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./SpreadsheetViewer.svelte", import.meta.url), "utf8");

test("SpreadsheetViewer highlight style uses light blue fill and dark blue inset border", () => {
  compile(source, { filename: "SpreadsheetViewer.svelte", generate: false });

  assert.match(source, /const HIGHLIGHT_ON = "box-shadow: inset 0 0 0 9999px rgba\(37, 99, 235, 0\.14\), inset 0 0 0 2px var\(--color-accent\);"/);
});

test("SpreadsheetViewer passes a selected cell anchor to custom evidence handlers", () => {
  compile(source, { filename: "SpreadsheetViewer.svelte", generate: false });

  assert.match(source, /const anchor = anchorForDisplayCell\(x1,\s*y1\)/);
  assert.match(source, /onCellEvidence\(cellRef,\s*normalized,\s*source,\s*anchor\)/);
});
