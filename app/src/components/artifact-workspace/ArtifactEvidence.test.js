import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactEvidence.svelte", import.meta.url), "utf8");

test("ArtifactEvidence keeps its left seam plain — no blur band", () => {
  compile(source, { filename: "ArtifactEvidence.svelte", generate: false });

  // The seam (line + leftward shadow) is owned by ArtifactBox's
  // .evidence-divider; the panel itself carries no edge treatment.
  assert.doesNotMatch(source, /backdrop-filter/);
  assert.doesNotMatch(source, /mask-image/);
  assert.doesNotMatch(source, /background:\s*linear-gradient/);
});
