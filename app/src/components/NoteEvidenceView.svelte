<script>
  import { _ } from "svelte-i18n";
  import { tick } from "svelte";

  // result: { columns: string[], rows: any[][] } from /api/sql
  // quotes: string[] verbatim phrases to highlight within the note text
  export let result;
  export let quotes = [];

  let scroller;

  // Treat the longest string cell in a row as the note body; shorter cells
  // (ids, dates, authors) become a compact header line above it.
  function toNotes(res, qs) {
    const cols = res?.columns || [];
    const rows = res?.rows || [];
    return rows.map((row) => {
      const cells = cols.map((col, i) => ({ col, val: row[i] }));
      let body = null;
      for (const cell of cells) {
        if (typeof cell.val === "string" && (!body || cell.val.length > body.val.length)) {
          body = cell;
        }
      }
      const header = cells
        .filter((cell) => cell !== body && cell.val !== null && cell.val !== "" && cell.val !== undefined)
        .map((cell) => `${cell.col}: ${cell.val}`)
        .join("  ·  ");
      return {
        header,
        segments: body ? segmentize(body.val, qs) : [],
        hasBody: !!body,
      };
    });
  }

  // Split text into ordered segments, marking the spans covered by any quote.
  function segmentize(text, qs) {
    const ranges = [];
    for (const q of qs || []) {
      if (!q) continue;
      let from = 0;
      while (true) {
        const i = text.indexOf(q, from);
        if (i === -1) break;
        ranges.push([i, i + q.length]);
        from = i + q.length;
      }
    }
    if (!ranges.length) return [{ text, mark: false }];
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (let k = 1; k < ranges.length; k++) {
      const last = merged[merged.length - 1];
      if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
      else merged.push(ranges[k].slice());
    }
    const segs = [];
    let pos = 0;
    for (const [s, e] of merged) {
      if (s > pos) segs.push({ text: text.slice(pos, s), mark: false });
      segs.push({ text: text.slice(s, e), mark: true });
      pos = e;
    }
    if (pos < text.length) segs.push({ text: text.slice(pos), mark: false });
    return segs;
  }

  $: notes = toNotes(result, quotes);

  // Bring the first highlight into view once the notes render.
  $: if (notes && scroller) scrollToFirstMark();

  async function scrollToFirstMark() {
    await tick();
    const mark = scroller?.querySelector("mark");
    if (mark) mark.scrollIntoView({ block: "center", behavior: "smooth" });
  }
</script>

<div class="notes" bind:this={scroller}>
  {#each notes as note}
    <div class="note">
      {#if note.header}<div class="note-header">{note.header}</div>{/if}
      {#if note.hasBody}
        <div class="note-body">{#each note.segments as seg}{#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</div>
      {:else}
        <div class="note-empty">{$_("noteEvidence.empty")}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .note {
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    padding: var(--space-3) var(--space-4);
  }
  .note-header {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    padding: 0;
    margin-bottom: var(--space-1);
    font-variant-numeric: tabular-nums;
  }
  .note-body {
    font-family: var(--font-sans);
    padding: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .note-body :global(mark) {
    background: var(--color-accent-weak);
    box-shadow: 0 0 0 1px var(--color-accent-border);
    border-radius: 2px;
    padding: 0 1px;
    color: inherit;
  }
  .note-empty {
    font-family: var(--font-sans);
    padding: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--color-text-muted);
  }
</style>
