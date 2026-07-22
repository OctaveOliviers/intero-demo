<script>
  // Home card grid (spec §2.2) — one card per tracked dashboard whose audit
  // EXISTS in the store (seeded, or created at runtime). Cord-pH is NOT seeded in
  // the base state, so it has no card until the user creates it; the moment its
  // audit exists its card appears alongside the three BPTs (Change 1).
  // Presentational: clicking a card emits `select` with { auditId } — the matching
  // audit's REAL id; the consumer (HomeScreen) calls selectAudit(auditId).
  import { createEventDispatcher } from "svelte";
  import { _ } from "svelte-i18n";
  import { audits } from "../stores/audits.js";
  import { CONTENT } from "../lib/mock/content/index.js";
  import { dashboardDeadlineValue } from "../lib/dashboardDeadline.js";
  import Icon from "./Icon.svelte";

  const dispatch = createEventDispatcher();

  // Show a card only for a dashboard whose audit exists, matched by the audit's id
  // OR templateId (a created audit has a uuid id but its templateId equals the
  // descriptor's auditId). `openId` is the matching audit's real id to open.
  $: cards = (CONTENT.dashboards || [])
    .map((d) => {
      const audit = $audits.find((a) => a.id === d.auditId || a.templateId === d.auditId);
      return audit ? { ...d, openId: audit.id } : null;
    })
    .filter(Boolean);

  function select(openId) {
    dispatch("select", { auditId: openId });
  }
</script>

<div class="card-grid">
  {#each cards as d (d.id)}
    {@const deadline = dashboardDeadlineValue(d.submissionDeadline)}
    <button type="button" class="card" on:click={() => select(d.openId)}>
      <span class="logo"><Icon name={d.logo} size={30} /></span>
      <span class="title">{d.title}</span>
      {#if deadline}
        <span class="deadline">{$_("tracker.submissionDeadline", { values: { date: deadline } })}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-5);
    text-align: left;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    color: var(--color-text);
    font-family: var(--font-sans);
    transition: border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }

  .card:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .card:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 2px;
  }

  .logo {
    display: inline-flex;
    color: var(--color-text);
    margin-bottom: var(--space-1);
  }

  /* Titles and deadlines are translated, so their length varies widely by
     language (German compounds are the worst case). Wrap inside the card —
     breaking a long word only when there is no other option — so text can
     never spill past the card edge. */
  .title,
  .deadline {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    hyphens: auto;
  }

  .title {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text);
  }

  .deadline {
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--color-text-muted);
  }
</style>
