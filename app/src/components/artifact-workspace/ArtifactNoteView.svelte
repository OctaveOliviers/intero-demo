<script>
  // A report tab's content: one source document rendered read-only, with the
  // relevant phrases highlighted. Today it's a structured note; the same tab
  // will host a PDF later. Reuses the product's NoteEvidenceView for the body.
  import NoteEvidenceView from "../NoteEvidenceView.svelte";
  import SqlDisplay from "../SqlDisplay.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let doc;

  function noteResult(body) {
    return { columns: ["report"], rows: [[body]], rowCount: 1, durationMs: 3 };
  }
</script>

{#if doc}
  <div class="artifact-note-view">
    <div class="block">
      <div class="block-label">{AW.evidence.blockSource}</div>
      <div class="note-title">{doc.header}</div>
    </div>
    <div class="block">
      <div class="block-label">{AW.evidence.blockQuery}</div>
      <SqlDisplay sql={`select document_text from clinical_notes where document_id = '${doc.id}'`} />
    </div>
    <div class="block">
      <div class="block-label">{AW.evidence.blockReport}</div>
      <NoteEvidenceView result={noteResult(doc.body)} quotes={doc.quotes} />
    </div>
  </div>
{/if}

<style>
  .artifact-note-view {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 720px;
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
    .artifact-note-view * {
      transition-duration: 1ms !important;
    }
  }
</style>
