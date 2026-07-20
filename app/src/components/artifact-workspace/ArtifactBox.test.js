import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ArtifactBox.svelte", import.meta.url), "utf8");

test("ArtifactBox compiles", () => {
  compile(source, { filename: "ArtifactBox.svelte", generate: false });
});

test("ArtifactBox swaps content by tab kind via a registry, not hardcoded views", () => {
  assert.match(source, /const VIEW_REGISTRY = \{/);
  assert.match(source, /table: ArtifactTableView/);
  assert.match(source, /note: ArtifactNoteView/);
  assert.match(source, /\$: ContentView = VIEW_REGISTRY\[activeTab\?\.kind\]/);
  assert.match(source, /<svelte:component this=\{ContentView\} \{\.\.\.contentProps\} \/>/);
});

test("ArtifactBox is pure chrome — no table-specific rendering leaks into the shell", () => {
  assert.doesNotMatch(source, /ArtifactSpreadsheetTable/);
  assert.doesNotMatch(source, /import SpreadsheetViewer/);
});

test("ArtifactBox renders a Chrome-style tab bar with closeable tabs", () => {
  assert.match(source, /class="artifact-tabs" role="tablist"/);
  assert.match(source, /\{#each tabs as tab \(tab\.id\)\}/);
  assert.match(source, /on:click=\{\(\) => onActivateTab\(tab\.id\)\}/);
  assert.match(source, /on:click=\{\(\) => onCloseTab\(tab\.id\)\}/);
});

test("ArtifactBox shows the side-panel evidence only for the table tab", () => {
  assert.match(source, /import ArtifactEvidence from "\.\/ArtifactEvidence\.svelte"/);
  assert.match(source, /\$: showEvidence = activeTab\?\.kind === "table" && !!evidence/);
  assert.match(source, /\{#if showEvidence\}[\s\S]*<ArtifactEvidence \{evidence\} onClose=\{onEvidenceClose\} \{onResolve\}/);
});

test("ArtifactBox keeps context/fold/close controls, resize handle and flying composer", () => {
  assert.match(source, /class="context-button icon-button"[\s\S]*class="fold-button icon-button"[\s\S]*class="close-button icon-button"/);
  assert.match(source, /\{#if resizable\}[\s\S]*class="artifact-resize-handle"/);
  assert.match(source, /class:send-mode=\{hasContext\}/);
  assert.match(source, /class="annotation-composer"/);
  assert.match(source, /\$: annotationStyle = anchorStyle\(state\?\.contextComposerAnchor\)/);
});

test("ArtifactBox builds table view props reactively (tracks table + state deps)", () => {
  assert.match(source, /activeTab\?\.kind === "table"\s*\?\s*\{ table: tableArtifact, state, cellClass, contextCaptureMode, onCell, onCellContext \}/);
  assert.match(source, /activeTab\?\.kind === "note"\s*\?\s*\{ doc: noteDoc \}/);
});
