<script>
  // The single gray box that holds ALL agent activity (doc 11 §agent_activity).
  //
  // Folded: one line — stop button · elapsed timer · 3–5 word "now" line.
  // Unfolded: the same header line above a fixed-height, scrollable log of every
  // activity event (orchestrator steps, agent tool calls, thinking). The log
  // auto-scrolls to the bottom as events arrive UNLESS the user has scrolled up;
  // folding out always returns to the bottom. The terminal summary is a separate
  // box (rendered by the parent) — it is NOT part of this stream.
  import { onDestroy, tick } from "svelte";
  import snarkdown from "snarkdown";
  import DOMPurify from "dompurify";

  export let events = [];
  export let runStatus = "idle";
  export let startedAt = null; // epoch ms
  export let endedAt = null; // epoch ms
  export let stopping = false;
  export let onStop = () => {};

  let collapsed = false; // default expanded while a run is active, so you can follow along
  let logEl = null;
  let pinnedToBottom = true;
  const BOTTOM_THRESHOLD = 24; // px from the bottom that still counts as "at the bottom"

  $: running = runStatus === "running";

  // --- Elapsed timer: ticks every second while running, frozen once terminal ---
  let now = Date.now();
  let timerHandle = null;

  $: {
    if (running && startedAt != null) {
      if (!timerHandle) {
        now = Date.now();
        timerHandle = setInterval(() => (now = Date.now()), 1000);
      }
    } else if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }
  onDestroy(() => timerHandle && clearInterval(timerHandle));

  $: elapsedMs =
    startedAt == null ? 0 : Math.max(0, (running ? now : endedAt || now) - startedAt);
  $: elapsedLabel = formatElapsed(elapsedMs);

  function formatElapsed(ms) {
    const total = Math.floor(ms / 1000);
    if (total < 60) return `${total}s`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  // --- The folded "now" line --------------------------------------------------
  $: latest = events.length ? events[events.length - 1] : null;
  $: nowLine = stopping
    ? "Finalizing…"
    : running
      ? latest?.label || firstWords(latest?.headline) || "Working…"
      : runStatus === "error"
        ? "Run failed"
        : runStatus === "stopped"
          ? "Stopped"
          : events.length
            ? "Completed"
            : "No activity yet";

  function firstWords(headline) {
    if (!headline) return "";
    return String(headline).replace(/[….\s]+$/, "").split(/\s+/).slice(0, 5).join(" ");
  }

  // --- Auto-scroll: follow the tail unless the user scrolled up ---------------
  function onScroll() {
    if (!logEl) return;
    const distance = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight;
    pinnedToBottom = distance <= BOTTOM_THRESHOLD;
  }

  function scrollToBottom() {
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  // New events arrive → if expanded and pinned to the bottom, follow them.
  $: if (events && !collapsed && pinnedToBottom) {
    tick().then(() => pinnedToBottom && scrollToBottom());
  }

  function toggle() {
    collapsed = !collapsed;
    if (!collapsed) {
      // Folding out always returns to the latest, even if the user had scrolled
      // up before folding in.
      pinnedToBottom = true;
      tick().then(scrollToBottom);
    }
  }

  function jumpToLatest() {
    pinnedToBottom = true;
    scrollToBottom();
  }

  function kindClass(kind) {
    if (kind === "tool") return "is-tool";
    if (kind === "thinking") return "is-thinking";
    return "is-step";
  }

  // --- Markdown rendering + per-line expand -----------------------------------
  // Activity content is markdown (the agent's thinking, step detail). Render it
  // compiled — bold/italic/code/lists instead of raw `**`/`[]` noise — and
  // sanitize since it originates from the model. Each line shows at most
  // PREVIEW_CHARS; clicking it (or "Show more") reveals the full content,
  // in place, still inside the scrollable box.
  const PREVIEW_CHARS = 280;
  let expanded = {};

  function md(text) {
    return DOMPurify.sanitize(snarkdown(String(text ?? "")));
  }
  function preview(text, isExpanded) {
    const s = String(text ?? "");
    if (isExpanded || s.length <= PREVIEW_CHARS) return s;
    return s.slice(0, PREVIEW_CHARS).trimEnd() + "…";
  }
  function isLong(event) {
    return (
      (event?.headline || "").length > PREVIEW_CHARS ||
      (event?.detail || "").length > PREVIEW_CHARS
    );
  }
  function toggleExpand(i) {
    expanded = { ...expanded, [i]: !expanded[i] };
  }
</script>

<div class="activity-box" class:collapsed>
  <div class="box-header">
    <button
      type="button"
      class="stop-btn"
      on:click|stopPropagation={onStop}
      disabled={!running || stopping}
      title="Stop the run and write its summary"
      aria-label="Stop the run and write its summary"
    >
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
        <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
      </svg>
    </button>

    <button
      type="button"
      class="header-main"
      on:click={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand agent activity" : "Collapse agent activity"}
    >
      <span class="timer" class:is-live={running}>{elapsedLabel}</span>
      <span class="now-line">{nowLine}</span>
      <span class="chevron" class:open={!collapsed} aria-hidden="true">
        <svg viewBox="0 0 12 12" width="12" height="12">
          <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>
  </div>

  {#if !collapsed}
    <div class="log-wrap">
      <div class="log" bind:this={logEl} on:scroll={onScroll}>
        {#if events.length}
          {#each events as event, i (i)}
            <div
              class="log-line {kindClass(event.kind)}"
              class:expandable={isLong(event)}
              on:click={() => isLong(event) && toggleExpand(i)}
              role={isLong(event) ? "button" : undefined}
              tabindex={isLong(event) ? 0 : undefined}
              on:keydown={(e) => isLong(event) && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleExpand(i))}
            >
              <span class="dot" aria-hidden="true"></span>
              <div class="log-body">
                <div class="log-head md">
                  {@html md(preview(event.headline || event.label || event.name || "Activity", expanded[i]))}
                </div>
                {#if event.detail}
                  <div class="log-detail md">{@html md(preview(event.detail, expanded[i]))}</div>
                {/if}
                {#if isLong(event)}
                  <button type="button" class="more-toggle" on:click|stopPropagation={() => toggleExpand(i)}>
                    {expanded[i] ? "Show less" : "Show more"}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <div class="log-empty">No activity yet.</div>
        {/if}
      </div>

      {#if !pinnedToBottom}
        <button type="button" class="jump-latest" on:click={jumpToLatest}>
          Jump to latest ↓
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .activity-box {
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .box-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }

  .stop-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .stop-btn svg rect {
    fill: currentColor;
  }
  .stop-btn:hover:not(:disabled) {
    background: var(--color-danger-weak);
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  .stop-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .header-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: var(--color-text);
  }

  .timer {
    flex: 0 0 auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 30px;
  }
  .timer.is-live {
    color: var(--color-text-secondary);
  }

  .now-line {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--color-text-muted);
    transition: transform var(--dur-fast) var(--ease);
  }
  .chevron.open {
    transform: rotate(180deg);
  }

  .log-wrap {
    position: relative;
    border-top: 1px solid var(--color-border);
  }
  .log {
    height: 280px;
    overflow-y: auto;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .log-line {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
  }
  .dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-top: 6px;
    background: var(--color-text-muted);
  }
  .is-tool .dot {
    background: var(--color-accent);
  }
  .is-thinking .dot {
    background: var(--color-warning);
  }
  .log-body {
    min-width: 0;
    flex: 1 1 auto;
  }
  .log-line.expandable {
    cursor: pointer;
    border-radius: var(--radius-md);
  }
  .log-line.expandable:hover {
    background: var(--color-hover);
  }
  .log-head {
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--color-text);
    word-break: break-word;
  }
  .is-thinking .log-head {
    color: var(--color-text-secondary);
  }
  .log-detail {
    margin-top: 2px;
    font-size: var(--text-xs);
    line-height: 1.45;
    color: var(--color-text-muted);
    word-break: break-word;
  }

  .more-toggle {
    margin-top: 4px;
    border: none;
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-xs);
    cursor: pointer;
    padding: 0;
  }
  .more-toggle:hover {
    text-decoration: underline;
  }

  /* Compiled-markdown content (sanitized {@html}) — tame the block elements so
     thinking/detail reads cleanly inside the compact log line. */
  .md :global(p) {
    margin: 0 0 4px;
  }
  .md :global(p:last-child) {
    margin-bottom: 0;
  }
  .md :global(strong) {
    font-weight: var(--weight-semibold);
  }
  .md :global(em) {
    font-style: italic;
  }
  .md :global(code) {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.92em;
    background: var(--color-surface);
    border-radius: 3px;
    padding: 0 3px;
  }
  .md :global(a) {
    color: var(--color-accent);
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 4px 0;
    padding-left: 18px;
  }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4) {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    margin: 4px 0;
  }
  .log-empty {
    color: var(--color-text-muted);
    font-style: italic;
    font-size: var(--text-sm);
  }

  .jump-latest {
    position: absolute;
    bottom: var(--space-2);
    left: 50%;
    transform: translateX(-50%);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    border-radius: var(--radius-pill);
    padding: 2px var(--space-3);
    font-size: var(--text-xs);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }
  .jump-latest:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
</style>
