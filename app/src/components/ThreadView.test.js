import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

const source = readFileSync(new URL("./ThreadView.svelte", import.meta.url), "utf8");

test("ThreadView keys messages by stable message identity, not array index", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(
    source,
    /const\s+messageKey\s*=\s*createThreadMessageKeyer\s*\(\s*\)/,
    "ThreadView should use the shared message key contract",
  );
  assert.match(
    source,
    /\{#each\s+messages\s+as\s+message\s+\(messageKey\(message\)\)\}/,
    "the messages each-block should key by message identity",
  );
  assert.match(
    source,
    /messageIndex:\s*messageIndex\(message\)/,
    "citation evidence should receive the message index from the keyed each-block",
  );
  assert.doesNotMatch(
    source,
    /\{#each\s+messages\s+as\s+message\s*,\s*i\s+\(i\)\}/,
    "array-index keys can reuse TableInspector instances after insertion/replacement",
  );
});

test("ThreadView submits selected request attachments", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(
    source,
    /let\s+selectedAttachments\s*=\s*\[\]/,
    "the composer should keep explicit request attachments",
  );
  assert.match(
    source,
    /sendFirstMessage\(submittedText,\s*selectedAttachments\)/,
    "first-message sends must include selected attachments",
  );
  assert.match(
    source,
    /sendThreadMessage\(submittedText,\s*selectedAttachments\)/,
    "thread-message sends must include selected attachments",
  );
  assert.doesNotMatch(source, /coming soon/i, "the attach button must be live");
});

test("ThreadView keeps request attachments pinned until explicit removal", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.doesNotMatch(
    source,
    /sendFirstMessage\(text,\s*selectedAttachments\)[\s\S]{0,120}else\s+clearAttachments\(\)/,
    "first-message sends should not clear selected attachments automatically",
  );
  assert.doesNotMatch(
    source,
    /sendThreadMessage\(text,\s*selectedAttachments\)[\s\S]{0,120}clearAttachments\(\)/,
    "thread-message sends should keep attachments until the user removes them",
  );
  assert.match(
    source,
    /on:click=\{\(\) => removeAttachment\(attachment\.type\)\}/,
    "the chip remove affordance is the explicit way to clear a pin",
  );
});

test("ThreadView renders request attachments on sent user messages", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(
    source,
    /message\.attachments\?\.length/,
    "sent user messages should render their attached Dataset/template context",
  );
  assert.match(
    source,
    /message-attachment-chip/,
    "sent message attachments should use chip styling",
  );
});

test("ThreadView uses the shared attachment type icon registry", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(
    source,
    /from "\.\.\/lib\/attachmentTypes\.js"/,
    "attachment icons and labels should come from the shared registry",
  );
  assert.match(
    source,
    /attachmentTypeIcon\(attachment\.type\)/,
    "attachment chips should use the shared icon lookup",
  );
});

test("ThreadView renders agent activity for chat and table-producing turns", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(
    source,
    /\{#if\s+message\.resolution\?\.activity\?\.length\}/,
    "agent activity should be rendered whenever the message carries activity",
  );
  assert.doesNotMatch(
    source,
    /message\.resolution\?\.output\s*===\s*"chat"\s*&&\s*message\.resolution\.activity\?\.length/,
    "table-producing agent turns also need visible activity",
  );
  assert.match(
    source,
    /return\s+activityLabel\(events\[events\.length\s*-\s*1\]\)/,
    "the folded activity summary should show the latest activity label",
  );
  assert.match(source, /class="activity-caret"/, "activity summary should include an inline caret");
  assert.match(source, /class:linked-citation=\{segment\.linkedText\}/, "citation-backed text should render as a text link");
  assert.doesNotMatch(
    source,
    /open=\{message\.resolution\.activity\.length\s*>\s*1\}/,
    "activity details should be collapsed by default",
  );
});

test("ThreadView gives artifact chats a wider reading column and a floated tray", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(source, /--artifact-chat-width:\s*704px/);
  // The reading column width is carried by --thread-col-width so the chat can
  // center itself on the screen; the closed state is ONE full-width column
  // with the tray floated over the right edge (not a grid column).
  assert.match(source, /\.thread-workspace\.artifact-thread\s+\.thread-view\s*\{[\s\S]*--thread-col-width:\s*var\(--artifact-chat-width\)/);
  assert.match(
    source,
    /\.thread-workspace\.artifact-thread\.state-artifact-closed\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(source, /class="tray-float"/);
  assert.match(source, /\.tray-float\s*\{[\s\S]*position:\s*absolute/);
});

test("ThreadView wires artifact context capture into the real chat composer", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(source, /import ContextChip from "\.\/artifact-workspace\/ContextChip\.svelte"/);
  assert.match(source, /\$: contextChips = artifactMode \? artifactState\.contextChips \|\| \[\] : \[\]/);
  assert.match(source, /<ContextChip chips=\{contextChips\} onRemove=\{removeDemoContextChip\}/);
  assert.match(source, /onCellContext=\{toggleDemoPendingContextCell\}/);
  assert.match(source, /contextCaptureMode=\{artifactState\.contextCaptureMode\}/);
  assert.match(source, /onContextCommit=\{commitDemoContextChip\}/);
});

test("ThreadView lets the split artifact width be resized from the artifact border", () => {
  compile(source, { filename: "ThreadView.svelte", generate: false });

  assert.match(source, /let artifactPaneWidthPct = 50/);
  assert.match(source, /function startArtifactResize\(event\)/);
  assert.match(source, /let nextArtifactPaneWidthPct = artifactPaneWidthPct/);
  assert.match(source, /rect\.right - moveEvent\.clientX/);
  assert.match(source, /threadWorkspaceEl\.style\.setProperty\("--artifact-pane-width", `\$\{nextArtifactPaneWidthPct\}%`\)/);
  assert.match(source, /toggleDemoChatFold\(\)/);
  assert.match(source, /style=\{`--artifact-pane-width: \$\{artifactPaneWidthPct\}%; --tray-width: \$\{trayDockWidth\}px;`\}/);
  assert.match(
    source,
    /\.thread-workspace\.artifact-thread\.state-chat-and-artifact\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*var\(--artifact-pane-width,\s*50%\)\)/,
  );
  assert.match(source, /resizable=\{workspaceState === ARTIFACT_WORKSPACE_STATES\.CHAT_AND_ARTIFACT\}/);
  assert.match(source, /resizeActive=\{artifactResizing\}/);
  assert.match(source, /onResizeStart=\{startArtifactResize\}/);
  assert.match(source, /\.thread-workspace\.artifact-thread\.artifact-resizing\s*\{[\s\S]*transition:\s*none/);
});
