<script>
  import {
    artifactWorkspaceDemoState,
    addDemoCellContext,
    addDemoIndicatorContext,
    clearDemoContextRefs,
    closeDemoArtifact,
    closeDemoEvidence,
    openDemoArtifact,
    removeDemoContextRef,
    selectDemoCell,
    selectDemoIndicator,
    toggleDemoContextCapture,
    toggleDemoChatFold,
  } from "../../stores/artifactWorkspaceDemo.js";
  import {
    ARTIFACT_WORKSPACE_STATES,
    artifactById,
    demoArtifacts,
    evidenceById,
  } from "../../lib/artifactWorkspaceDemo.js";
  import Icon from "../Icon.svelte";
  import ContextChip from "./ContextChip.svelte";
  import InlineMiniAnalysis from "./InlineMiniAnalysis.svelte";
  import ArtifactTray from "./ArtifactTray.svelte";
  import ArtifactWindow from "./ArtifactWindow.svelte";

  const inlineArtifact = demoArtifacts.find((artifact) => artifact.id === "stroke-inline-trend");

  let followUpPrompt = "";

  $: state = $artifactWorkspaceDemoState;
  $: workspaceState = state.workspaceState;
  $: isArtifactClosed = workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED;
  $: isArtifactExpanded = workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED;
  $: activeArtifact = artifactById(state.activeArtifactId);
  $: tableArtifact = artifactById("door-to-ct-table");
  $: evidence = evidenceById(state.activeEvidenceId);
  $: selectedContextRefs = state.selectedContextRefs || [];
  $: canSubmitFollowUp = followUpPrompt.trim().length > 0 || selectedContextRefs.length > 0;

  function submitFollowUp() {
    const prompt = followUpPrompt.trim();
    if (!prompt && selectedContextRefs.length === 0) return;

    followUpPrompt = "";
    clearDemoContextRefs();
  }

  function appendContextNote(note) {
    followUpPrompt = note;
  }
</script>

<div
  class="artifact-workspace-demo"
  class:artifact-closed={workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED}
  class:chat-and-artifact={workspaceState === ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT}
  class:artifact-expanded={workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED}
  class:state-artifact-closed={workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED}
  class:state-chat-and-artifact={workspaceState === ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT}
  class:state-artifact-expanded={workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED}
  data-testid="artifact-workspace-demo"
>
  <div class="workspace-grid">
    <section class="chat-column" aria-label="Artifact workspace chat" aria-hidden={isArtifactExpanded}>
      <div class="messages">
        <div class="message-row user-row">
          <div class="message user-message">Show me the door-to-CT trend for Q2.</div>
        </div>

        <div class="message-row agent-row">
          <div class="message agent-message">
            <p>Median door-to-CT improved after week 4. The delay spike is mainly scanner availability.</p>
            {#if inlineArtifact}
              <InlineMiniAnalysis artifact={inlineArtifact} onOpen={openDemoArtifact} />
            {/if}
          </div>
        </div>
      </div>

      <form class="bar" aria-label="Ask about this audit" on:submit|preventDefault={submitFollowUp}>
        {#if selectedContextRefs.length}
          <div class="context-row">
            <ContextChip refs={selectedContextRefs} onRemove={removeDemoContextRef} />
          </div>
        {/if}
        <div class="input-row">
          <button class="add-btn" type="button" aria-label="Add source" disabled>
            <span class="plus">+</span>
          </button>
          <textarea
            class="bar-input"
            rows="1"
            placeholder="Ask a follow-up about the trend"
            aria-label="Ask a follow-up about the trend"
            bind:value={followUpPrompt}
          ></textarea>
          <button class="send-btn" type="submit" aria-label="Send" disabled={!canSubmitFollowUp}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </form>
    </section>

    {#if isArtifactClosed}
      <ArtifactTray artifacts={demoArtifacts} onOpen={openDemoArtifact} />
    {/if}

    {#if !isArtifactClosed && activeArtifact}
      <ArtifactWindow
        {state}
        {activeArtifact}
        {tableArtifact}
        {evidence}
        onToggleFold={toggleDemoChatFold}
        onClose={closeDemoArtifact}
        onEvidenceClose={closeDemoEvidence}
        onIndicator={selectDemoIndicator}
        onIndicatorContext={addDemoIndicatorContext}
        onCell={selectDemoCell}
        onCellContext={addDemoCellContext}
        contextCaptureMode={state.contextCaptureMode}
        contextCount={selectedContextRefs.length}
        onContextToggle={toggleDemoContextCapture}
        onContextSend={submitFollowUp}
        onContextNote={appendContextNote}
      />
    {/if}
  </div>
</div>

<style>
  .artifact-workspace-demo {
    --artifact-radius: var(--radius-md);
    container-type: inline-size;
    height: 100%;
    min-height: 0;
    padding: var(--space-8) var(--space-6);
    color: var(--color-text);
    background: var(--color-bg);
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, min(100%, var(--content-width)));
    align-items: stretch;
    justify-content: center;
    gap: var(--space-6);
    height: 100%;
    min-height: 0;
    width: 100%;
    min-width: 0;
    transition:
      grid-template-columns 260ms cubic-bezier(0.22, 0.61, 0.36, 1),
      gap 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .chat-column {
    width: 100%;
    max-width: var(--content-width);
    min-width: 0;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    overflow: hidden;
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--dur) var(--ease),
      visibility var(--dur) var(--ease);
  }

  .artifact-workspace-demo.state-artifact-expanded .chat-column {
    height: 0;
    max-height: 0;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .messages {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .message-row {
    display: flex;
    width: 100%;
  }

  .user-row {
    justify-content: flex-end;
  }

  .agent-row {
    justify-content: flex-start;
  }

  .message {
    max-width: min(100%, 520px);
    overflow: hidden;
    font-size: var(--text-base);
    line-height: 1.5;
  }

  .user-message {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--artifact-radius);
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  .agent-message {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    color: var(--color-text);
  }

  .bar {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: var(--content-width);
    flex: 0 0 auto;
    box-sizing: border-box;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--artifact-radius);
  }

  .bar:focus-within {
    border-color: var(--color-border-strong);
  }

  .context-row {
    display: flex;
    min-width: 0;
    padding: var(--space-2) var(--space-2) 0;
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .bar-input {
    flex: 1;
    min-width: 0;
    min-height: 24px;
    max-height: 104px;
    padding: var(--space-1);
    border: none;
    outline: none;
    resize: none;
    overflow-y: auto;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .bar-input:focus {
    box-shadow: none;
  }

  .bar-input::placeholder {
    color: var(--color-text-faint);
  }

  .add-btn,
  .send-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    line-height: 1;
  }

  .add-btn {
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 22px;
  }

  .add-btn:hover:not(:disabled) {
    background: var(--color-hover);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .plus {
    display: block;
    line-height: 1;
    transform: translateY(-1px);
  }

  .send-btn {
    background: var(--color-primary);
    color: var(--color-on-primary);
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .send-btn:hover:not(:disabled),
  .send-btn:focus-visible {
    background: var(--color-primary-hover);
    color: var(--color-on-primary);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn :global(.icon) {
    transform: rotate(-90deg);
  }

  @container (min-width: 720px) {
    .workspace-grid {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    }

    .artifact-workspace-demo.state-artifact-closed .workspace-grid {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    }

    .artifact-workspace-demo.state-chat-and-artifact .workspace-grid {
      grid-template-columns: minmax(260px, 0.34fr) minmax(0, 0.66fr);
      justify-content: stretch;
    }

    .artifact-workspace-demo.state-artifact-expanded .workspace-grid {
      grid-template-columns: minmax(0, 0fr) minmax(0, 1fr);
      gap: 0;
    }
  }

  @media (max-width: 900px) {
    .artifact-workspace-demo {
      padding: var(--space-6) var(--space-4);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .artifact-workspace-demo *,
    .artifact-workspace-demo *::before,
    .artifact-workspace-demo *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
