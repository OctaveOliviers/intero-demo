<script>
  import CellEvidencePanel from "../CellEvidencePanel.svelte";
  import NoteEvidenceView from "../NoteEvidenceView.svelte";
  import SqlDisplay from "../SqlDisplay.svelte";
  import Icon from "../Icon.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let evidence;
  export let onClose = () => {};
  // Called with a source id when a MOC-note reference hyperlink is clicked.
  export let onReference = () => {};

  // "simple" cell evidence still flows through the shared CellEvidencePanel.
  $: command =
    evidence && evidence.kind === "simple"
      ? {
          sql: evidence.query,
          explanation: evidence.explanation,
          evidence: evidence.evidence || null,
          result: evidence.result || null,
          loading: false,
          error: null,
        }
      : null;
  $: selectedCellMeta = evidence?.selectedCellMeta || null;

  function noteResult(body) {
    return { columns: ["report"], rows: [[body]], rowCount: 1, durationMs: 3 };
  }
</script>

{#if evidence}
  <section class="artifact-evidence" aria-label={evidence.title}>
    <button class="close-btn" type="button" on:click={onClose} aria-label={AW.evidence.close}>
      <Icon name="close" size={18} />
    </button>

    {#if evidence.kind === "conflict"}
      <div class="conflict">
        <div class="conflict-header">
          <span class="conflict-badge">{AW.evidence.conflictHeading}</span>
          <p class="conflict-hint">{AW.evidence.conflictHint}</p>
        </div>
        <!-- Both readings stay on file and both stay visible. Choosing between
             them is an ordinary edit of the field, not a button here — the
             clinician reads these, then writes what stands. -->
        {#each evidence.sources as source (source.id)}
          <article class="source">
            <header class="source-head">
              <span class="source-label">{source.label} · {source.date}</span>
              <span class="source-value">{source.value}</span>
            </header>
            <div class="source-body">
              <NoteEvidenceView result={noteResult(source.body)} quotes={source.quotes} />
            </div>
          </article>
        {/each}
      </div>
    {:else if evidence.kind === "moc-note"}
      <div class="moc-note-evidence">
        <div class="block">
          <div class="block-label">{AW.evidence.blockNote}</div>
          <p class="moc-note-content">{evidence.content}</p>
        </div>
        {#if evidence.references?.length}
          <div class="block">
            <div class="block-label">{AW.evidence.blockReferences}</div>
            <ul class="moc-refs">
              {#each evidence.references as ref (ref.id)}
                <li>
                  <button type="button" class="moc-ref-link" on:click={() => onReference(ref.id)}>
                    {ref.label} ↗
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {:else if evidence.kind === "note"}
      <div class="note-evidence">
        <div class="block">
          <div class="block-label">{AW.evidence.blockSource}</div>
          <div class="note-title">{evidence.header}</div>
        </div>
        {#if evidence.query}
          <div class="block">
            <div class="block-label">{AW.evidence.blockQuery}</div>
            <SqlDisplay sql={evidence.query} />
          </div>
        {/if}
        <div class="block">
          <div class="block-label">{AW.evidence.blockReport}</div>
          <NoteEvidenceView result={noteResult(evidence.body)} quotes={evidence.quotes} />
        </div>
      </div>
    {:else}
      <CellEvidencePanel {command} {selectedCellMeta} compact />
    {/if}
  </section>
{/if}

<style>
  /* The panel's left seam (line + leftward elevation shadow) is owned by
     ArtifactBox's .evidence-divider, mirroring the frozen Patient column.
     No blur band: the seam alone marks where the table is cut off. */
  .artifact-evidence {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: visible;
    z-index: 2;
  }

  .close-btn {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .close-btn:hover,
  .close-btn:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .conflict,
  .note-evidence,
  .moc-note-evidence {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-4) var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .moc-note-content {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .moc-refs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .moc-ref-link {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-sm);
    text-align: left;
    line-height: 1.4;
    cursor: pointer;
  }

  .moc-ref-link:hover {
    text-decoration: underline;
  }

  .moc-ref-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .conflict-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-right: var(--space-8);
  }

  .conflict-badge {
    align-self: flex-start;
    border-radius: var(--radius-pill);
    padding: 2px var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    border: 1px solid var(--color-danger);
    background: var(--color-danger-weak);
    color: var(--color-danger);
  }

  .conflict-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .source {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background: var(--color-surface);
  }

  .source-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .source-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  /* The reading this source carries, so the two are comparable at a glance
     without reading both note bodies. */
  .source-value {
    flex-shrink: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .block-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .note-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  @media (prefers-reduced-motion: reduce) {
    .artifact-evidence *,
    .artifact-evidence *::before,
    .artifact-evidence *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
