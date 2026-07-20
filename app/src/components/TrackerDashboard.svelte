<script>
  // TrackerDashboard — the live-artifact tracker dashboard (spec §3.3, §5).
  //
  // It resolves the dashboard for the current populated table, lays its trackers out in a
  // responsive grid of cards, and composes the existing presentational
  // TrackerChart for each one. It is a "live artifact": self-contained and
  // presentational — it reads mock data and draws; it owns NO run state and has
  // NO interactive controls (no filters, sliders, inputs, toggles, dropdowns).
  //
  // The only interaction is a chart element click. TrackerChart dispatches
  // `elementclick` with detail `{ key }`; this component re-emits a `drill`
  // event with detail `{ trackerId, elementKey }` — the §3.1 selection model
  // that ResultsView uses to enter split view.
  import { createEventDispatcher } from "svelte";
  import { populatedTables, currentPopulatedTableId } from "../stores/populatedTables.js";
  import { CONTENT } from "../lib/mock/content/index.js";
  import TrackerChart from "./TrackerChart.svelte";

  const dispatch = createEventDispatcher();

  // Resolve the current dashboard reactively, then its trackers (skip any id
  // that doesn't resolve to a tracker descriptor). Match by the record's id OR its
  // templateId so a freshly created record (uuid id, catalog templateId) maps to
  // its dashboard too — not only the seeded records.
  $: populatedTable = $populatedTables.find((a) => a.id === $currentPopulatedTableId) || null;
  $: dashboard = populatedTable
    ? CONTENT.dashboards.find(
        (d) => d.templateId === populatedTable.id || d.templateId === populatedTable.templateId,
      ) || null
    : null;
  $: trackers = dashboard
    ? dashboard.trackers.map((id) => CONTENT.trackers[id]).filter(Boolean)
    : [];

  // A child chart fired `elementclick` { key } for tracker `t` → re-emit the
  // selection as `drill` { trackerId, elementKey }.
  function onElementClick(t, key) {
    if (key == null) return;
    dispatch("drill", { trackerId: t.id, elementKey: key });
  }
</script>

{#if trackers.length === 0}
  <div class="empty">No trackers for this dashboard.</div>
{:else}
  <div class="tracker-grid">
    {#each trackers as t (t.id)}
      <section class="tracker-card">
        <h3 class="tracker-title">{t.title}</h3>
        <div class="tracker-chart">
          <TrackerChart
            kind={t.kind}
            elements={t.elements}
            target={t.target ?? null}
            on:elementclick={(e) => onElementClick(t, e.detail.key)}
          />
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  /* Responsive grid: cards reflow to a single column when shown narrow (it is
     used both full-width and in the narrower split pane). */
  .tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-4);
    align-items: start;
    width: 100%;
  }

  .tracker-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .tracker-title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text);
  }

  .tracker-chart {
    display: flex;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    padding: var(--space-6);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
