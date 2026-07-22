import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./CellEvidencePanel.svelte", import.meta.url), "utf8");

test("compact evidence panel keeps moderate horizontal padding inside artifacts", () => {
  compile(source, { filename: "CellEvidencePanel.svelte", generate: false });

  assert.match(source, /\.cell-evidence-panel\.compact\s*\{[\s\S]*padding:\s*0\s+var\(--space-4\)\s+var\(--space-2\)/);
  assert.doesNotMatch(source, /\.cell-evidence-panel\.compact\s*\{[\s\S]*padding:\s*0\s+calc\(var\(--space-3\) \* 3\)\s+var\(--space-2\)/);
  assert.doesNotMatch(source, /\.cell-evidence-panel\.compact\s*\{[\s\S]*padding:\s*0\s+var\(--space-1\)\s+var\(--space-2\)/);
});
