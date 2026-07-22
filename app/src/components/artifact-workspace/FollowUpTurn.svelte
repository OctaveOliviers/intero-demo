<script>
  // A scripted follow-up's agent reply: either precedent cases (each fact with
  // its own source link) or response charts. The "Add to MOC Notes?" prompt is
  // NOT here — it's raised through the product AskUserQuestion in the composer.
  // Once answered, we show a small confirmation line.
  import InlineMiniAnalysis from "./InlineMiniAnalysis.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let followUp;
  export let answered = null;
  export let onSource = () => {};

  $: hasCases = Array.isArray(followUp?.cases);
  $: hasCharts = Array.isArray(followUp?.charts);
</script>

<div class="follow-up-turn">
  <p class="reply">{followUp?.reply}</p>

  {#if hasCases}
    <ul class="cases">
      {#each followUp.cases as caseItem (caseItem.patientId)}
        <li class="case">
          <p class="case-head">
            <span class="case-id">{caseItem.patientId}</span> — {caseItem.situation}
          </p>
          <ul class="facts">
            {#each caseItem.facts as fact (fact.id)}
              <li class="fact">
                <span class="fact-arrow" aria-hidden="true">→ </span><span class="fact-text">{fact.text}</span>
                <button
                  type="button"
                  class="source-link"
                  aria-label={AW.followUpSourceAria(fact.source.label, fact.source.date)}
                  on:click={() => onSource(fact.source.id)}
                >
                  {AW.followUpSource}
                </button>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {:else if hasCharts}
    <InlineMiniAnalysis charts={followUp.charts} onPoint={onSource} />
  {/if}

  {#if answered === "added"}
    <p class="note-confirm">{AW.followUpAddedConfirm(followUp?.noteRowId)}</p>
  {/if}
</div>

<style>
  .follow-up-turn {
    width: min(100%, 560px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    color: var(--color-text);
  }

  .reply {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-base);
    line-height: 1.5;
  }

  .cases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .case-head {
    margin: 0 0 var(--space-1);
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .case-id {
    font-weight: var(--weight-semibold);
  }

  .facts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .fact {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .fact-arrow {
    color: var(--color-text-muted);
  }

  .source-link {
    display: inline;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: var(--color-accent);
    font: inherit;
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
  }

  .source-link:hover {
    text-decoration: underline;
  }

  .source-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .note-confirm {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .follow-up-turn,
    .follow-up-turn * {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
