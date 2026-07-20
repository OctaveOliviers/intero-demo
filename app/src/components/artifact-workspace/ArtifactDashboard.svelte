<script>
  export let dashboard;
  export let selectedIndicatorId = null;
  export let contextIndicatorIds = new Set();
  export let onIndicator = () => {};

  function isSelected(indicator) {
    return indicator.id === selectedIndicatorId;
  }

  function isContextSelected(indicator) {
    return contextIndicatorIds?.has?.(indicator.id);
  }
</script>

<section class="artifact-dashboard" aria-label={dashboard?.title}>
  {#each dashboard?.indicators || [] as indicator (indicator.id)}
    <button
      class:selected={isSelected(indicator)}
      class:context-selected={isContextSelected(indicator)}
      type="button"
      class="metric"
      on:click={(event) => onIndicator(event, indicator.id)}
      aria-pressed={isSelected(indicator)}
    >
      <span class="metric-title">{indicator.title}</span>
      <span class="metric-value">{indicator.value}</span>
      <span class="metric-subtitle">{indicator.subtitle}</span>
    </button>
  {/each}
</section>

<style>
  .artifact-dashboard {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .metric {
    min-width: 0;
    min-height: 116px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text);
    overflow: hidden;
    text-align: left;
    transition:
      background var(--dur-fast) var(--ease),
      outline-color var(--dur-fast) var(--ease);
  }

  .metric:hover,
  .metric:focus-visible {
    background: var(--color-hover);
  }

  .metric:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .metric.selected {
    background: var(--color-accent-weak);
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .metric.context-selected {
    background: var(--color-accent-weak);
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .metric-title,
  .metric-value,
  .metric-subtitle {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .metric-title {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .metric-value {
    color: var(--color-text);
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    line-height: 1.1;
  }

  .metric-subtitle {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  @container (max-width: 760px) {
    .artifact-dashboard {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .artifact-dashboard {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .artifact-dashboard,
    .artifact-dashboard *,
    .artifact-dashboard *::before,
    .artifact-dashboard *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
