<script>
  // Inline trend charts shown in a follow-up reply. Each has a labelled y-axis
  // (0 → yMax) and an x-axis of measurement dates, so the values are readable.
  // The SVG is drawn 1:1 in CSS pixels at the card's measured width (no viewBox
  // scaling), so the tick/value labels keep a FIXED, readable font size no
  // matter how narrow the chat column gets. Clickable point targets are HTML
  // buttons overlaid at the same pixel coordinates.
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let charts = [];
  export let onPoint = () => {};

  const VIEW_H = 120;
  const PAD = { left: 38, right: 12, top: 18, bottom: 26 };
  const FALLBACK_W = 220;
  const baselineY = VIEW_H - PAD.bottom;

  // Measured width of each chart's visual area, keyed by chart id
  // (bind:clientWidth below; falls back until the first measure lands).
  let widths = {};

  function geometry(values, yMax, width) {
    const w = width || FALLBACK_W;
    const plotW = Math.max(10, w - PAD.left - PAD.right);
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const max = yMax || Math.max(1, ...values);
    const n = values.length;
    const x = (i) => (n > 1 ? PAD.left + (i * plotW) / (n - 1) : PAD.left + plotW / 2);
    const y = (v) => PAD.top + (1 - v / max) * plotH;
    const points = values.map((value, i) => ({ value, x: x(i), y: y(value) }));
    return {
      max,
      width: w,
      points,
      polyline: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    };
  }

  const fmt = (v, unit) => `${v}${unit || ""}`;
</script>

<div class="inline-mini-analysis">
  {#each charts.slice(0, 2) as chart (chart.id)}
    {@const geo = geometry(chart.values, chart.yMax, widths[chart.id])}
    <div class="chart-card">
      <span class="chart-title">{chart.title}</span>

      <span class="chart-visual" bind:clientWidth={widths[chart.id]}>
        <svg width={geo.width} height={VIEW_H} role="img" aria-label={chart.title}>
          <!-- axes -->
          <line class="axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={baselineY} />
          <line class="axis" x1={PAD.left} y1={baselineY} x2={geo.width - PAD.right} y2={baselineY} />
          <!-- y ticks: 0 and max -->
          <text class="tick" x={PAD.left - 5} y={baselineY + 3} text-anchor="end">0</text>
          <text class="tick" x={PAD.left - 5} y={PAD.top + 3} text-anchor="end">{fmt(geo.max, chart.unit)}</text>
          <!-- trend line -->
          <polyline class="chart-line" points={geo.polyline} />
          {#each geo.points as p, i}
            <circle class="dot" cx={p.x} cy={p.y} r="3" />
            <text class="value" x={p.x} y={p.y - 8} text-anchor="middle">{fmt(p.value, chart.unit)}</text>
            <text class="xlabel" x={p.x} y={VIEW_H - 8} text-anchor="middle">{chart.pointLabels?.[i] ?? ""}</text>
          {/each}
        </svg>

        <span class="chart-points">
          {#each geo.points as p, i}
            <button
              type="button"
              class="chart-point-btn"
              style={`left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;`}
              aria-label={AW.chartPointAria(chart.title, fmt(p.value, chart.unit), chart.pointLabels?.[i] ?? "")}
              on:click={() => onPoint(chart.scanIds?.[i])}
            >
              <span class="point-hit" aria-hidden="true"></span>
            </button>
          {/each}
        </span>
      </span>
    </div>
  {/each}
</div>

<style>
  .inline-mini-analysis {
    width: min(100%, 560px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .chart-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--artifact-radius, var(--radius-md));
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
  }

  .chart-title {
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chart-visual {
    position: relative;
    display: block;
    min-width: 0;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .axis {
    stroke: var(--color-border-strong);
    stroke-width: 0.75;
  }

  /* Fixed pixel sizes: the SVG is unscaled, so these stay readable at any
     chat-column width. */
  .tick,
  .xlabel {
    fill: var(--color-text-muted);
    font-size: 10px;
    font-family: var(--font-sans);
  }

  .value {
    fill: var(--color-text);
    font-size: 11px;
    font-weight: var(--weight-semibold);
    font-family: var(--font-sans);
  }

  .chart-line {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dot {
    fill: var(--color-surface);
    stroke: var(--color-accent);
    stroke-width: 1.5;
  }

  .chart-points {
    position: absolute;
    inset: 0;
  }

  .chart-point-btn {
    position: absolute;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transform: translate(-50%, -50%);
  }

  .point-hit {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }

  .chart-point-btn:hover .point-hit,
  .chart-point-btn:focus-visible .point-hit {
    background: var(--color-accent-weak);
  }

  .chart-point-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .inline-mini-analysis,
    .inline-mini-analysis * {
      transition-duration: 1ms !important;
    }
  }

  @container (max-width: 520px) {
    .inline-mini-analysis {
      grid-template-columns: 1fr;
    }
  }
</style>
