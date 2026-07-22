<script>
  // The generic artifact widget: a reusable box (toolbar · resize · body ·
  // flying context composer) that is IDENTICAL for every artifact type. The
  // body content is swapped by artifact kind via VIEW_REGISTRY — adding a new
  // type (dashboard, note/document, …) is one registry line plus its view
  // component; this shell never changes.
  //
  // The evidence panel is box-level, NOT owned by any one view: a table cell, a
  // note hyperlink, or a dashboard tile can all open it. Whenever `evidence` is
  // set the box splits its body into [content | evidence].
  import { ARTIFACT_WORKSPACE_STATES } from "../../lib/artifactWorkspaceDemo.js";
  import { CONTENT } from "../../lib/mock/content/index.js";
  import Icon from "../Icon.svelte";
  import ArtifactEvidence from "./ArtifactEvidence.svelte";
  import ArtifactTableView from "./ArtifactTableView.svelte";
  import ArtifactNoteView from "./ArtifactNoteView.svelte";

  const AW = CONTENT.artifactWorkspace;

  export let state;
  export let tabs = [];
  export let activeTab = null;
  export let tableArtifact;
  export let noteDoc = null;
  export let evidence;
  export let cellClass = () => "direct";
  export let onToggleFold = () => {};
  export let onClose = () => {};
  export let onActivateTab = () => {};
  export let onCloseTab = () => {};
  export let onEvidenceClose = () => {};
  export let onResolve = () => {};
  export let onReference = () => {};
  export let onCell = () => {};
  export let onCellContext = () => {};
  export let contextCaptureMode = false;
  export let onContextToggle = () => {};
  export let onContextSend = () => {};
  export let onContextCommit = () => {};
  export let resizable = false;
  export let resizeActive = false;
  export let onResizeStart = () => {};

  // tab.kind -> content view component. The one place that knows the types.
  const VIEW_REGISTRY = {
    table: ArtifactTableView,
    note: ArtifactNoteView,
  };

  let contextDraft = "";

  function submitContextNote() {
    const comment = contextDraft.trim();
    // The comment IS the follow-up question, so an empty one can't be sent or
    // matched — don't let it commit a stuck chip.
    if (!comment || pendingCount === 0) return;
    onContextCommit(comment);
    contextDraft = "";
  }

  function anchorStyle(anchor) {
    const x = Number(anchor?.x);
    const y = Number(anchor?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return "--annotation-x: 48px; --annotation-y: 64px;";
    }
    return `--annotation-x: ${Math.round(x)}px; --annotation-y: ${Math.round(y)}px;`;
  }

  $: isExpanded = state?.workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED;
  $: ContentView = VIEW_REGISTRY[activeTab?.kind] ?? null;
  // Per-kind props for the swapped-in view. Referencing the deps inline keeps
  // Svelte's reactivity tracking them (a helper fn would only track `kind`).
  $: contentProps =
    activeTab?.kind === "table"
      ? { table: tableArtifact, state, cellClass, contextCaptureMode, onCell, onCellContext }
      : activeTab?.kind === "note"
        ? { doc: noteDoc }
        : {};
  // The side-panel evidence belongs to the table tab only (a note tab IS the report).
  $: showEvidence = activeTab?.kind === "table" && !!evidence;
  $: contextCount = state?.contextChips?.length || 0;
  $: hasContext = contextCount > 0;
  $: pendingCount = state?.pendingContextCells?.length || 0;
  $: annotationStyle = anchorStyle(state?.contextComposerAnchor);
</script>

<section
  class:context-capture={contextCaptureMode}
  class="artifact-box"
  aria-label={activeTab?.title}
>
  {#if resizable}
    <button
      class:active={resizeActive}
      class="artifact-resize-handle"
      type="button"
      aria-label={AW.box.resizeHandle}
      on:mousedown={onResizeStart}
      title={AW.box.resizeHandle}
    ></button>
  {/if}

  <div class="artifact-toolbar">
    <div class="artifact-tabs" role="tablist">
      {#each tabs as tab (tab.id)}
        <div class="tab" class:active={tab.id === activeTab?.id}>
          <button
            class="tab-label"
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab?.id}
            title={tab.title}
            on:click={() => onActivateTab(tab.id)}
          >
            <Icon name={tab.kind === "note" ? "file" : "table"} size={14} />
            <span class="tab-title">{tab.title}</span>
          </button>
          <button class="tab-close" type="button" aria-label={AW.box.closeTab(tab.title)} on:click={() => onCloseTab(tab.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      {/each}
    </div>

    <div class="artifact-actions">
      <button
        class:active={contextCaptureMode}
        class:send-mode={hasContext}
        class="context-button icon-button"
        type="button"
        aria-label={hasContext ? AW.box.sendContext(contextCount) : AW.box.addContext}
        on:click={hasContext ? onContextSend : onContextToggle}
      >
        {#if hasContext}
          <span>{AW.box.send}</span>
          <span class="context-count-inline">{contextCount}</span>
        {:else}
          <Icon name="chat-plus" size={18} />
        {/if}
      </button>

      <button
        class="fold-button icon-button"
        type="button"
        aria-label={isExpanded ? AW.box.showChat : AW.box.expandArtifact}
        on:click={onToggleFold}
      >
        <Icon name={isExpanded ? "collapse-diagonal" : "expand-diagonal"} size={18} />
      </button>

      <button class="close-button icon-button" type="button" aria-label={AW.box.closeArtifact} on:click={onClose}>
        <Icon name="close" size={18} />
      </button>
    </div>
  </div>

  <div class:has-evidence={showEvidence} class="artifact-body">
    <div class="artifact-content">
      {#if ContentView}
        <svelte:component this={ContentView} {...contentProps} />
      {/if}
    </div>

    {#if showEvidence}
      <div class="evidence-divider" aria-hidden="true"></div>
      <ArtifactEvidence {evidence} onClose={onEvidenceClose} {onResolve} {onReference} />
    {/if}
  </div>

  {#if contextCaptureMode && pendingCount > 0}
    <form
      class="annotation-composer"
      aria-label={AW.box.contextNote}
      style={annotationStyle}
      on:submit|preventDefault={submitContextNote}
    >
      <textarea
        rows="2"
        placeholder={AW.box.askPlaceholder(pendingCount === 1 ? AW.box.askAboutOne : AW.box.askAboutMany(pendingCount))}
        bind:value={contextDraft}
        on:keydown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitContextNote();
          }
        }}
      ></textarea>
      <!-- Same send affordance as the main composer (→), one "send" everywhere. -->
      <button class="note-send" type="submit" aria-label={AW.box.addToContext} disabled={pendingCount === 0 || !contextDraft.trim()}>→</button>
    </form>
  {/if}
</section>

<style>
  .artifact-box {
    container-type: inline-size;
    position: relative;
    width: auto;
    min-width: 0;
    margin: var(--screen-margin, var(--space-6)) var(--screen-margin, var(--space-6)) var(--screen-margin, var(--space-6)) 0;
    overflow: visible;
    border: 1px solid var(--color-border);
    border-radius: var(--artifact-radius, var(--radius-md));
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    height: calc(100% - (2 * var(--screen-margin, var(--space-6))));
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .artifact-toolbar {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 52px;
    padding: var(--space-2) var(--space-4);
    flex: 0 0 auto;
  }

  .artifact-resize-handle {
    position: absolute;
    top: var(--space-2);
    bottom: var(--space-2);
    left: -5px;
    z-index: 8;
    width: 10px;
    appearance: none;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: col-resize;
  }

  .artifact-resize-handle::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 4px;
    width: 1px;
    border-radius: var(--radius-pill);
    background: var(--color-border-strong);
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .artifact-resize-handle:hover::after,
  .artifact-resize-handle.active::after {
    opacity: 1;
  }

  .artifact-tabs {
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .artifact-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 240px;
    display: inline-flex;
    align-items: center;
    padding-right: 2px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .tab.active {
    background: var(--color-surface-muted);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .tab:not(.active):hover {
    background: var(--color-hover);
  }

  .tab-label {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
    color: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .tab-label :global(.icon) {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .tab-title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tab-close {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
  }

  .tab-close:hover,
  .tab-close:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .tab-label:focus-visible,
  .tab-close:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .icon-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 50%;
    color: var(--color-text-secondary);
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .icon-button:hover,
  .icon-button:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .context-button {
    position: relative;
  }

  .artifact-actions {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    min-width: 0;
  }

  .context-button.active,
  .context-button:hover,
  .context-button:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .context-button.send-mode {
    width: auto;
    min-width: 66px;
    padding: 0 var(--space-3);
    gap: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-text);
    color: var(--color-surface);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .context-button.send-mode:hover,
  .context-button.send-mode:focus-visible {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .context-count-inline {
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 10px;
    font-weight: var(--weight-semibold);
    line-height: 1;
  }

  .artifact-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: var(--space-3);
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--space-3) var(--space-4) var(--space-4);
    overflow: hidden;
    border-radius: 0 0 var(--artifact-radius, var(--radius-md)) var(--artifact-radius, var(--radius-md));
    transition:
      grid-template-columns var(--dur) var(--ease),
      gap var(--dur) var(--ease);
  }

  .artifact-body.has-evidence {
    grid-template-columns: minmax(0, 1fr) auto minmax(220px, 280px);
    gap: 0;
  }

  /* The content region that hosts the swapped-in view (table / dashboard /
     note). Views fill it and own their internal layout. */
  .artifact-content {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: var(--space-5);
    overflow: hidden;
  }

  .evidence-divider {
    width: 1px;
    height: auto;
    align-self: stretch;
    margin: 0;
    /* Same seam as the frozen Patient column: a #ccc gridline + a leftward
       elevation shadow, so the table reads as sliding under the panel. Sits
       above the grid's sticky cells (max z 7) or the header row cuts it off. */
    background: #ccc;
    position: relative;
    z-index: 8;
    box-shadow: -8px 0 10px -4px rgba(13, 13, 13, 0.18);
  }

  .context-capture .artifact-body {
    cursor: crosshair;
  }

  .annotation-composer {
    position: absolute;
    left: clamp(var(--space-4), var(--annotation-x, 48px), calc(100% - 292px));
    top: clamp(64px, var(--annotation-y, 64px), calc(100% - 132px));
    z-index: 9; /* above the evidence panel/divider (z 8) */
    width: min(280px, calc(100% - var(--space-8)));
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--artifact-radius, var(--radius-md));
    background: var(--color-surface);
    box-shadow: var(--shadow-md);
  }

  .annotation-composer textarea {
    min-width: 0;
    min-height: 48px;
    max-height: 120px;
    padding: var(--space-2);
    border: 0;
    resize: vertical;
    background: transparent;
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .annotation-composer textarea:focus {
    box-shadow: none;
  }

  .note-send {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-size: 16px;
    font-weight: var(--weight-bold);
    line-height: 1;
  }

  .note-send:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @container (max-width: 420px) {
    .artifact-body.has-evidence {
      grid-template-columns: 1fr;
    }

    .evidence-divider {
      width: 100%;
      height: 1px;
      margin: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .artifact-box,
    .artifact-box *,
    .artifact-box *::before,
    .artifact-box *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }

    .fold-button :global(.icon) {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
