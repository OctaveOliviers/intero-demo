<script>
  // The cohort rail: every patient on tomorrow's list, always visible beside the
  // open record. Two lines each — the id, and the clinical one-liner composed
  // from strings already in the pack — plus a fill indicator that spins while
  // the agent is still working that patient and settles to a check when its own
  // last field has landed.
  //
  // Purely presentational: it renders whatever patientList() hands it.
  import Icon from "../Icon.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let patients = [];
  export let onSelect = () => {};
</script>

<nav class="cohort-rail" aria-label={AW.form.railLabel}>
  <ul>
    {#each patients as patient (patient.id)}
      <li>
        <button
          class:selected={patient.selected}
          type="button"
          aria-current={patient.selected ? "true" : undefined}
          on:click={() => onSelect(patient.id)}
        >
          <span class="head">
            <span class="id">{patient.id}</span>
            <span class="status" title={patient.complete ? AW.form.complete : AW.form.filling}>
              {#if patient.complete}
                <Icon name="check" size={14} />
              {:else}
                <span class="spinner" aria-hidden="true"></span>
              {/if}
              <span class="sr-only">{patient.complete ? AW.form.complete : AW.form.filling}</span>
            </span>
          </span>
          <span class="summary">{patient.summary}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .cohort-rail {
    flex: 0 0 auto;
    width: 188px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  button {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    padding: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }

  button:hover {
    background: var(--color-hover);
  }

  button.selected {
    background: var(--color-surface-muted);
    border-color: var(--color-border);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .id {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
  }

  .summary {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 1.75px solid var(--color-border-strong);
    border-top-color: transparent;
    border-radius: 50%;
    animation: rail-spin 700ms linear infinite;
  }

  @keyframes rail-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Narrow artifact: the rail gives up its summaries before the record gives up
     its width. Matched against the artifact box, which is the container. */
  @container (max-width: 520px) {
    .cohort-rail {
      width: 116px;
    }

    .summary {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2s;
    }
  }
</style>
