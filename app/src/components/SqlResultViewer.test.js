import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./SqlResultViewer.svelte", import.meta.url), "utf8");

test("SqlResultViewer renders compact evidence grids without row-index gutter or shadow", () => {
  compile(source, { filename: "SqlResultViewer.svelte", generate: false });

  assert.match(source, /function\s+columnWidthFor/);
  assert.doesNotMatch(source, /width:\s*150/);
  assert.match(source, /Math\.min\(140/);
  assert.match(source, /Math\.max\(70/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_content\)\s*\{[\s\S]*box-shadow:\s*none\s*!important/);
  assert.match(source, /\.result-grid\s+:global\(\.jtabs-content\s*>\s*div\)/);
  assert.match(source, /border-collapse:\s*collapse\s*!important/);
  assert.match(source, /border:\s*1px solid var\(--color-border\)\s*!important/);
  assert.match(source, /white-space:\s*nowrap\s*!important/);
  assert.match(source, /overflow-wrap:\s*normal\s*!important/);
  assert.doesNotMatch(source, /overflow-wrap:\s*anywhere/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_selectall\)/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_row\)/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_worksheet\s*>\s*thead\s*>\s*tr\s*>\s*td:first-child\)/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_worksheet\s*>\s*tbody\s*>\s*tr\s*>\s*td:first-child\)/);
  assert.match(source, /\.result-grid\s+:global\(\.jss_worksheet\s*>\s*colgroup\s*>\s*col:first-child\)/);
});
