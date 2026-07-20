import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactTray.svelte", import.meta.url), "utf8");

test("ArtifactTray aligns to the top right of its workspace slot", () => {
  compile(source, { filename: "ArtifactTray.svelte", generate: false });

  assert.match(source, /\.artifact-tray\s*\{[\s\S]*align-self:\s*start/);
  assert.match(source, /\.artifact-tray\s*\{[\s\S]*justify-self:\s*end/);
});
