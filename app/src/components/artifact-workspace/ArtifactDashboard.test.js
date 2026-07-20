import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactDashboard.svelte", import.meta.url), "utf8");

test("ArtifactDashboard marks indicators already selected as follow-up context", () => {
  compile(source, { filename: "ArtifactDashboard.svelte", generate: false });

  assert.match(source, /export let contextIndicatorIds = new Set\(\)/);
  assert.match(source, /class:context-selected=\{isContextSelected\(indicator\)\}/);
  assert.match(source, /\.metric\.context-selected\s*\{[\s\S]*background:\s*var\(--color-accent-weak\)/);
  assert.match(source, /\.metric\.context-selected\s*\{[\s\S]*outline:\s*2px solid var\(--color-accent\)/);
});
