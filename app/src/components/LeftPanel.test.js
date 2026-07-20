import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./LeftPanel.svelte", import.meta.url), "utf8");

test("LeftPanel hides mock-mode database navigation and keeps artifacts inside normal chat navigation", () => {
  compile(source, { filename: "LeftPanel.svelte", generate: false });

  assert.match(source, /import\s+\{\s*isMockMode\s*\}\s+from\s+"..\/lib\/mock\.js"/);
  assert.match(source, /showDatabasesNav\s*=\s*!\s*isMockMode\("databases"\)/);
  assert.match(source, /\{#if\s+showDatabasesNav\}[\s\S]*leftPanel\.databases[\s\S]*\{\/if\}/);
  assert.match(source, /leftPanel\.pinnedArtifacts/);
  assert.match(source, /handleOpenPinnedArtifact/);
  assert.match(source, /openDemoPinnedArtifact/);
  assert.doesNotMatch(source, /openArtifactWorkspaceDemo/);
  assert.doesNotMatch(source, /leftPanel\.artifactWorkspaceDemo/);
  assert.doesNotMatch(source, /\$hasPendingTemplateShares/);
  assert.doesNotMatch(source, /newSharedTemplate/);
});
