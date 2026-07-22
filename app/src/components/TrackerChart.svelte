<script>
  // TrackerChart — a self-contained, presentational "live artifact" chart for the
  // tracker dashboard (spec §5, §7.2). It reads props and draws hand-rolled inline
  // SVG (plus HTML/CSS); no external chart library, no network, no app/run state.
  //
  // The ONLY interaction is clicking a single data element (donut slice / time-series
  // point / histogram bar / the stat card), which dispatches `elementclick` with
  // detail `{ key }`. There are no filters, sliders, toggles, dropdowns, date
  // pickers, or text inputs anywhere in this component.
  import { createEventDispatcher } from "svelte";

  // --- Props (fixed by spec §7.2) -------------------------------------------
  // kind: "donut" | "timeseries" | "histogram" | "stat"
  export let kind = "stat";
  // elements: Array<{ key, label, value, status?, highlightRefs? }>
  //   donut/histogram → value = proportion (0..1) / bar height
  //   timeseries      → ordered points (label = month, value = metric)
  //   stat            → single elements[0]
  //   status: "met" | "not-met" drives the fill colour (Fix 3).
  export let elements = [];
  // target: { op, value } | null — a threshold/target to draw where given.
  export let target = null;

  const dispatch = createEventDispatcher();

  // A datum was activated (click or keyboard). Emit the element's key only;
  // the parent (TrackerDashboard) adds trackerId → drill { trackerId, elementKey }.
  function activate(key) {
    if (key == null) return;
    dispatch("elementclick", { key });
  }

  function onKey(e, key) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      activate(key);
    }
  }

  // --- Defensive normalisation ----------------------------------------------
  $: items = Array.isArray(elements) ? elements.filter((d) => d != null) : [];
  $: hasData = items.length > 0;

  const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const num = (n) => (Number.isFinite(n) ? n : 0);

  // Format a 0..1 proportion as a whole-number percent.
  const pct = (v) => `${Math.round(clamp01(v) * 100)}%`;

  // Status-driven fill (Fix 3): met (clears its target) = green, not-yet-met =
  // light orange. Blue (--color-accent) is reserved for the workbook cell
  // highlight and is never used on the charts.
  const STATUS_FILL = {
    met: "var(--color-chart-met)",
    "not-met": "var(--color-chart-unmet)",
  };
  const fillFor = (d) => STATUS_FILL[d && d.status] || "var(--color-chart-unmet)";

  // -------------------------------------------------------------------------
  // DONUT — the first element is the "pass"/headline proportion drawn as a
  // filled arc with a centre percentage label; remaining elements are the
  // rest of the ring. A target (e.g. <= / >= threshold) is drawn as a tick
  // on the ring. Each slice is a hit-target.
  // -------------------------------------------------------------------------
  const DONUT = { size: 132, stroke: 18 };
  $: donutR = (DONUT.size - DONUT.stroke) / 2;
  $: donutC = 2 * Math.PI * donutR;
  // Cumulative offsets so slices sit end-to-end around the ring.
  $: donutSlices = (() => {
    if (kind !== "donut") return [];
    let acc = 0;
    return items.map((d, i) => {
      const frac = clamp01(d.value);
      const slice = { ...d, i, frac, start: acc };
      acc += frac;
      return slice;
    });
  })();
  // Headline proportion shown in the centre = the first ("pass") element.
  $: donutHeadline = donutSlices.length ? donutSlices[0] : null;
  // Target tick angle (fraction of the ring), drawn when a numeric target exists.
  $: donutTarget =
    kind === "donut" && target && Number.isFinite(target.value)
      ? clamp01(target.value)
      : null;

  // Point on the ring circle for a given fraction (0 = 12 o'clock, clockwise).
  function ringPoint(frac, radius) {
    const a = frac * 2 * Math.PI - Math.PI / 2;
    const cx = DONUT.size / 2;
    const cy = DONUT.size / 2;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }
  $: donutTargetTick =
    donutTarget == null
      ? null
      : {
          inner: ringPoint(donutTarget, donutR - DONUT.stroke / 2 - 2),
          outer: ringPoint(donutTarget, donutR + DONUT.stroke / 2 + 2),
        };

  // -------------------------------------------------------------------------
  // TIMESERIES — ordered points (label = month, value = metric) drawn as a
  // line with a clickable dot per point. A target draws a horizontal line.
  // -------------------------------------------------------------------------
  const TS = { w: 300, h: 132, padX: 14, padTop: 14, padBottom: 24 };
  $: tsValues = items.map((d) => num(d.value));
  $: tsMax = (() => {
    const vals = tsValues.slice();
    if (target && Number.isFinite(target.value)) vals.push(target.value);
    const m = Math.max(0, ...vals);
    return m === 0 ? 1 : m;
  })();
  $: tsPlotW = TS.w - TS.padX * 2;
  $: tsPlotH = TS.h - TS.padTop - TS.padBottom;
  function tsX(i) {
    if (items.length <= 1) return TS.padX + tsPlotW / 2;
    return TS.padX + (tsPlotW * i) / (items.length - 1);
  }
  function tsY(v) {
    return TS.padTop + tsPlotH * (1 - num(v) / tsMax);
  }
  $: tsPoints = items.map((d, i) => ({ ...d, i, x: tsX(i), y: tsY(d.value) }));
  $: tsLine = tsPoints.map((p) => `${p.x},${p.y}`).join(" ");
  $: tsTargetY =
    kind === "timeseries" && target && Number.isFinite(target.value)
      ? tsY(target.value)
      : null;

  // -------------------------------------------------------------------------
  // HISTOGRAM — one clickable bar per element (value = bar height). Heights
  // are scaled to the tallest bar (or the target if it is taller). A target
  // draws a horizontal reference line.
  // -------------------------------------------------------------------------
  const HG = { w: 300, h: 132, padX: 14, padTop: 14, padBottom: 24, gap: 8 };
  $: hgMax = (() => {
    const vals = items.map((d) => num(d.value));
    if (target && Number.isFinite(target.value)) vals.push(target.value);
    const m = Math.max(0, ...vals);
    return m === 0 ? 1 : m;
  })();
  $: hgPlotW = HG.w - HG.padX * 2;
  $: hgPlotH = HG.h - HG.padTop - HG.padBottom;
  $: hgBarW =
    items.length > 0
      ? Math.max(4, (hgPlotW - HG.gap * (items.length - 1)) / items.length)
      : 0;
  // Heights look like proportions (0..1) so show their % too, but fall back to
  // raw values for non-proportional bands.
  $: hgIsProportion = items.every((d) => num(d.value) >= 0 && num(d.value) <= 1);
  $: hgBars = items.map((d, i) => {
    const h = (num(d.value) / hgMax) * hgPlotH;
    return {
      ...d,
      i,
      x: HG.padX + i * (hgBarW + HG.gap),
      y: HG.padTop + (hgPlotH - h),
      w: hgBarW,
      h: Math.max(1, h),
    };
  });
  $: hgTargetY =
    kind === "histogram" && target && Number.isFinite(target.value)
      ? HG.padTop + hgPlotH * (1 - num(target.value) / hgMax)
      : null;

  // -------------------------------------------------------------------------
  // STAT — a single headline number/percentage vs target on a clickable card.
  // Values in 0..1 read as percentages; anything else is shown as-is. The
  // headline colour follows the element's status (Fix 3).
  // -------------------------------------------------------------------------
  $: statEl = hasData ? items[0] : null;
  $: statIsProportion =
    statEl != null && num(statEl.value) >= 0 && num(statEl.value) <= 1;
  $: statDisplay = statEl == null
    ? ""
    : statIsProportion
      ? pct(statEl.value)
      : String(statEl.value);
  $: statTargetDisplay =
    target && Number.isFinite(target.value)
      ? statIsProportion
        ? pct(target.value)
        : String(target.value)
      : null;

  // Human-readable target label reused by the legend / caption.
  $: targetLabel =
    target && Number.isFinite(target.value)
      ? `${target.op || ""} ${
          // proportions read nicer as a percent
          target.value >= 0 && target.value <= 1
            ? pct(target.value)
            : target.value
        }`.trim()
      : null;
</script>

{#if !hasData}
  <div class="empty">No data</div>
{:else if kind === "donut"}
  <div class="chart donut-chart">
    <svg
      viewBox="0 0 {DONUT.size} {DONUT.size}"
      role="img"
      aria-label="Donut chart"
    >
      <!-- track -->
      <circle
        class="donut-track"
        cx={DONUT.size / 2}
        cy={DONUT.size / 2}
        r={donutR}
        fill="none"
        stroke-width={DONUT.stroke}
      />
      <!-- slices (each a hit-target) -->
      {#each donutSlices as s (s.key)}
        <circle
          class="donut-slice"
          cx={DONUT.size / 2}
          cy={DONUT.size / 2}
          r={donutR}
          fill="none"
          stroke={fillFor(s)}
          stroke-width={DONUT.stroke}
          stroke-dasharray="{s.frac * donutC} {donutC}"
          stroke-dashoffset={-s.start * donutC}
          transform="rotate(-90 {DONUT.size / 2} {DONUT.size / 2})"
          role="button"
          tabindex="0"
          aria-label="{s.label}: {pct(s.value)}"
          on:click={() => activate(s.key)}
          on:keydown={(e) => onKey(e, s.key)}
        >
          <title>{s.label}: {pct(s.value)}</title>
        </circle>
      {/each}
      <!-- target tick on the ring -->
      {#if donutTargetTick}
        <line
          class="donut-target"
          x1={donutTargetTick.inner.x}
          y1={donutTargetTick.inner.y}
          x2={donutTargetTick.outer.x}
          y2={donutTargetTick.outer.y}
        >
          <title>Target {targetLabel}</title>
        </line>
      {/if}
      <!-- centre headline = first ("pass") element -->
      {#if donutHeadline}
        <text
          class="donut-center"
          x={DONUT.size / 2}
          y={DONUT.size / 2}
          text-anchor="middle"
          dominant-baseline="central">{pct(donutHeadline.value)}</text
        >
      {/if}
    </svg>
    <!-- Legend BELOW the chart (Fix 2): full-width rows, fully readable. -->
    <ul class="legend">
      {#each donutSlices as s (s.key)}
        <li>
          <button
            class="legend-item"
            type="button"
            on:click={() => activate(s.key)}
          >
            <span class="swatch" style="background:{fillFor(s)}"></span>
            <span class="legend-label">{s.label}</span>
            <span class="legend-value">{pct(s.value)}</span>
          </button>
        </li>
      {/each}
      {#if targetLabel}
        <li class="legend-target">Target {targetLabel}</li>
      {/if}
    </ul>
  </div>
{:else if kind === "timeseries"}
  <div class="chart">
    <svg
      viewBox="0 0 {TS.w} {TS.h}"
      role="img"
      aria-label="Time-series chart"
    >
      <!-- baseline -->
      <line
        class="axis"
        x1={TS.padX}
        y1={TS.padTop + tsPlotH}
        x2={TS.w - TS.padX}
        y2={TS.padTop + tsPlotH}
      />
      <!-- target line -->
      {#if tsTargetY != null}
        <line
          class="target-line"
          x1={TS.padX}
          y1={tsTargetY}
          x2={TS.w - TS.padX}
          y2={tsTargetY}
        >
          <title>Target {targetLabel}</title>
        </line>
      {/if}
      <!-- metric line -->
      {#if tsPoints.length > 1}
        <polyline class="ts-line" points={tsLine} fill="none" />
      {/if}
      <!-- points (each a hit-target), coloured by status -->
      {#each tsPoints as p (p.key)}
        <g
          class="ts-point"
          role="button"
          tabindex="0"
          aria-label="{p.label}: {p.value}"
          on:click={() => activate(p.key)}
          on:keydown={(e) => onKey(e, p.key)}
        >
          <!-- generous transparent hit area -->
          <circle class="ts-hit" cx={p.x} cy={p.y} r="12" />
          <circle class="ts-dot" cx={p.x} cy={p.y} r="4" style="fill:{fillFor(p)}" />
          <text class="ts-x" x={p.x} y={TS.h - 6} text-anchor="middle"
            >{p.label}</text
          >
          <title>{p.label}: {p.value}</title>
        </g>
      {/each}
    </svg>
    {#if targetLabel}
      <div class="caption">Target {targetLabel}</div>
    {/if}
  </div>
{:else if kind === "histogram"}
  <div class="chart">
    <svg viewBox="0 0 {HG.w} {HG.h}" role="img" aria-label="Histogram">
      <!-- baseline -->
      <line
        class="axis"
        x1={HG.padX}
        y1={HG.padTop + hgPlotH}
        x2={HG.w - HG.padX}
        y2={HG.padTop + hgPlotH}
      />
      <!-- bars (each a hit-target), coloured by status -->
      {#each hgBars as b (b.key)}
        <g
          class="hg-bar"
          role="button"
          tabindex="0"
          aria-label="{b.label}: {hgIsProportion ? pct(b.value) : b.value}"
          on:click={() => activate(b.key)}
          on:keydown={(e) => onKey(e, b.key)}
        >
          <rect
            class="hg-rect"
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="2"
            style="fill:{fillFor(b)}"
          />
          <text
            class="hg-x"
            x={b.x + b.w / 2}
            y={HG.h - 6}
            text-anchor="middle">{b.label}</text
          >
          <title>{b.label}: {hgIsProportion ? pct(b.value) : b.value}</title>
        </g>
      {/each}
      <!-- target line -->
      {#if hgTargetY != null}
        <line
          class="target-line"
          x1={HG.padX}
          y1={hgTargetY}
          x2={HG.w - HG.padX}
          y2={hgTargetY}
        >
          <title>Target {targetLabel}</title>
        </line>
      {/if}
    </svg>
    <!-- Legend BELOW the chart (Fix 2): one full-width row per band. -->
    <ul class="legend">
      {#each hgBars as b (b.key)}
        <li>
          <button
            class="legend-item"
            type="button"
            on:click={() => activate(b.key)}
          >
            <span class="swatch" style="background:{fillFor(b)}"></span>
            <span class="legend-label">{b.label}</span>
            <span class="legend-value">{hgIsProportion ? pct(b.value) : b.value}</span>
          </button>
        </li>
      {/each}
      {#if targetLabel}
        <li class="legend-target">Target {targetLabel}</li>
      {/if}
    </ul>
  </div>
{:else if kind === "stat"}
  <!-- whole card is the single hit-target; headline colour follows status -->
  <button
    class="stat-card"
    class:status-met={statEl && statEl.status === "met"}
    class:status-unmet={statEl && statEl.status === "not-met"}
    type="button"
    on:click={() => activate(statEl && statEl.key)}
  >
    <span class="stat-value">{statDisplay}</span>
    {#if statEl && statEl.label}
      <span class="stat-label">{statEl.label}</span>
    {/if}
    {#if statTargetDisplay != null}
      <span class="stat-target">Target {target.op || ""} {statTargetDisplay}</span>
    {/if}
  </button>
{:else}
  <div class="empty">Unsupported chart</div>
{/if}

<style>
  .chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
  }

  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    color: var(--color-text-faint);
    font-size: var(--text-sm);
  }

  /* --- Donut --------------------------------------------------------------- */
  /* Legend sits BELOW the chart (Fix 2): column layout, svg centred on top. */
  .donut-chart {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .donut-chart svg {
    flex: 0 0 auto;
    width: 132px;
  }

  .donut-track {
    stroke: var(--color-surface-muted);
  }

  .donut-slice {
    cursor: pointer;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .donut-slice:hover {
    opacity: 0.8;
  }
  .donut-slice:focus-visible {
    outline: none;
    stroke-width: 22;
  }

  .donut-target {
    stroke: var(--color-text);
    stroke-width: 2;
  }

  .donut-center {
    font-size: 26px;
    font-weight: var(--weight-bold);
    fill: var(--color-text);
  }

  /* --- Legend (below donut + histogram) ----------------------------------- */
  .legend {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 2px var(--space-1);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .legend-item:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .swatch {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .legend-label {
    flex: 1;
    min-width: 0;
  }
  .legend-value {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    font-weight: var(--weight-medium);
  }
  .legend-target {
    margin-top: 2px;
    padding-left: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* --- Axes / targets (shared by timeseries + histogram) ------------------ */
  .axis {
    stroke: var(--color-border);
    stroke-width: 1;
  }
  .target-line {
    stroke: var(--color-text);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .caption {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* --- Timeseries (line neutral; dots coloured by status inline) ---------- */
  .ts-line {
    stroke: var(--color-border-strong);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .ts-point {
    cursor: pointer;
  }
  .ts-hit {
    fill: transparent;
  }
  .ts-dot {
    transition: r var(--dur-fast) var(--ease);
  }
  .ts-point:hover .ts-dot,
  .ts-point:focus-visible .ts-dot {
    r: 6;
  }
  .ts-point:focus-visible {
    outline: none;
  }
  .ts-x {
    fill: var(--color-text-muted);
    font-size: 10px;
  }

  /* --- Histogram (bars coloured by status inline) ------------------------- */
  .hg-bar {
    cursor: pointer;
  }
  .hg-rect {
    transition: opacity var(--dur-fast) var(--ease);
  }
  .hg-bar:hover .hg-rect,
  .hg-bar:focus-visible .hg-rect {
    opacity: 0.82;
  }
  .hg-bar:focus-visible {
    outline: none;
  }
  .hg-x {
    fill: var(--color-text-muted);
    font-size: 10px;
  }

  /* --- Stat --------------------------------------------------------------- */
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    width: 100%;
    min-height: 120px;
    justify-content: center;
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .stat-card:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-sm);
  }
  .stat-card:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 2px;
  }
  .stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .stat-card.status-met .stat-value {
    color: var(--color-chart-met);
  }
  .stat-card.status-unmet .stat-value {
    color: var(--color-chart-unmet);
  }
  .stat-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .stat-target {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
</style>
