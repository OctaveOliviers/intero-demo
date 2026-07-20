import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./Icon.svelte", import.meta.url), "utf8");

function iconBranch(name, nextName) {
  return source.match(new RegExp(`\\{:else if name === "${name}"\\}([\\s\\S]*?)\\{:else if name === "${nextName}"\\}`))?.[1] || "";
}

function assertDatabaseCylinderIcon(branch) {
  assert.equal((branch.match(/<ellipse/g) || []).length, 1);
  assert.match(branch, /<ellipse cx="12" cy="5" rx="9" ry="3"/);
  assert.match(branch, /<path d="M3 5v14a9 3 0 0 0 18 0V5"/);
  assert.match(branch, /<path d="M3 12a9 3 0 0 0 18 0"/);
  assert.doesNotMatch(branch, /<ellipse[\s\S]*<ellipse/);
  assert.doesNotMatch(branch, /M5 6v12|M19 6v12/);
}

test("dataset and database icons are the canonical database cylinder mark", () => {
  compile(source, { filename: "Icon.svelte", generate: false });

  assertDatabaseCylinderIcon(iconBranch("datasets", "database"));
  assertDatabaseCylinderIcon(iconBranch("database", "stop"));
});

test("expand and collapse icons use diagonal arrows", () => {
  compile(source, { filename: "Icon.svelte", generate: false });

  const expand = iconBranch("expand-diagonal", "collapse-diagonal");
  const collapse = iconBranch("collapse-diagonal", "eye");

  assert.match(expand, /M10 14 4 20/);
  assert.match(expand, /M14 10l6-6/);
  assert.match(collapse, /M4 20l6-6/);
  assert.match(collapse, /M20 4l-6 6/);
});
