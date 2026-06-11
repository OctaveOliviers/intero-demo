<script>
  import { createEventDispatcher } from "svelte";
  import { fly } from "svelte/transition";
  import Chip from "./Chip.svelte";
  import ChipPopover from "./ChipPopover.svelte";
  import DatabaseChip from "./DatabaseChip.svelte";
  import DateChip from "./DateChip.svelte";
  import AddFilterChip from "./AddFilterChip.svelte";
  import CohortPreview from "./CohortPreview.svelte";
  import { parseAdditionalFilters, resolveCohortCount } from "../../lib/spec.js";
  import { mergeCohort } from "./cohortMerge.js";
  import Icon from "../Icon.svelte";
  import { databases, refreshDatabases } from "../../stores/databases.js";
  import { onMount } from "svelte";

  // The input specification: one editable row per cohort chip (a plain-text
  // label beside a value-only pill), a "+" add-filter affordance, and a
  // bottom-line health-check showing how many patients still match.
  //
  // `cohort` is the agent's live extraction (a fresh full set per parse). We
  // keep an editable `working` copy and fold each new extraction in diff-only
  // via mergeCohort, so re-extraction complements but never overwrites the
  // user's own edits/additions (doc 2 §Filter interaction, S4).
  export let cohort = [];
  export let noun = "patients"; // 'patients' | 'encounters'
  export let readOnly = false;
  export let showTitle = true;
  // When true, rows enter with a staggered line-by-line delay (initial reveal).
  // Once the entrance has played the parent flips this off, so a chip added via
  // the "+" affordance flies in immediately instead of waiting its turn.
  export let reveal = false;

  const STEP = 70; // ms between successive rows
  const rowIn = (i) => ({ y: 6, duration: 240, delay: reveal ? i * STEP : 0 });

  const dispatch = createEventDispatcher();

  let loading = false;

  // Editable working set. Each fresh extraction arriving on `cohort` is folded
  // in diff-only; user edits/additions live here and are emitted back up via
  // `change`. `prevProp`/`selfEmit` distinguish a genuine new extraction from
  // the echo of our own emitted value, so the merge can't loop or churn.
  let working = cohort;
  let prevProp = cohort;
  let selfEmit = null;

  $: if (cohort !== prevProp) {
    prevProp = cohort;
    if (cohort !== selfEmit) working = mergeCohort(working, cohort);
  }

  // Inline editing state for value/codes chips. Only one popover is open at a
  // time (`openId` names it). `query` filters option lists; `draft` backs the
  // single free-text input for option-less chips.
  let openId = null;
  let query = "";
  let draft = "";

  // Per-row add-chip ("+") popover state. Keyed by row field so each row
  // tracks its own open state independently of the chip popovers above.
  let addOpenField = null;
  let addQuery = "";

  onMount(() => {
    if (!readOnly) refreshDatabases().catch(() => {});
  });

  // Group consecutive chips that share a field into one row, so a single label
  // can sit beside multiple pills (e.g. several databases on the same row).
  $: rows = (() => {
    const out = [];
    for (const c of working) {
      const last = out[out.length - 1];
      if (last && last.field === c.field) last.chips.push(c);
      else out.push({ field: c.field, kind: c.kind, label: c.label, chips: [c] });
    }
    return out;
  })();

  $: dbOptions = $databases.filter((d) => d.status === "ready");
  $: filteredDbs = (() => {
    const s = addQuery.trim().toLowerCase();
    return s ? dbOptions.filter((d) => d.name.toLowerCase().includes(s)) : dbOptions;
  })();

  function addDatabase(db) {
    const newChip = {
      id: crypto.randomUUID(),
      kind: "database",
      field: "database",
      label: "Database",
      value: db.name,
      raw: db.id,
      added: true,
    };
    // Insert after the last existing database chip so the row stays grouped.
    let lastIdx = -1;
    for (let i = 0; i < working.length; i++) if (working[i].field === "database") lastIdx = i;
    working = [...working.slice(0, lastIdx + 1), newChip, ...working.slice(lastIdx + 1)];
    addOpenField = null;
    addQuery = "";
    emitChange();
  }

  // Deterministic health-check, recomputed on every cohort change.
  $: count = resolveCohortCount(working);

  function emitChange() {
    selfEmit = working; // mark so the echoed prop isn't re-merged
    dispatch("change", working);
  }

  // DatabaseChip / DateChip hand back a fully-updated chip; swap it in by id and
  // flag it user-edited so a later extraction can't overwrite the user's value.
  function replaceChip(updated) {
    working = working.map((c) => (c.id === updated.id ? { ...updated, userEdited: true } : c));
    emitChange();
  }

  // Multi-value rows let the user add several chips for the same filter
  // (e.g. several databases). Their chips become individually removable.
  const MULTI_FIELDS = new Set(["database"]);

  function removeChip(id) {
    working = working.filter((c) => c.id !== id);
    emitChange();
  }

  function patchChip(id, patch) {
    working = working.map((c) => (c.id === id ? { ...c, ...patch, userEdited: true } : c));
    emitChange();
  }

  function toggleChip(c) {
    if (openId === c.id) {
      openId = null;
    } else {
      openId = c.id;
      query = "";
      draft = c.value;
    }
  }

  function selectOption(c, opt) {
    patchChip(c.id, { value: opt.value });
    openId = null;
  }

  function applyDraft(c) {
    const v = draft.trim();
    if (v && v !== c.value) patchChip(c.id, { value: v });
    openId = null;
  }

  function filterOptions(options, q) {
    const s = (q || "").trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }

  // The "+" affordance: parse the phrase into new chips, append, recount.
  async function handleAddFilter(e) {
    loading = true;
    const newChips = await parseAdditionalFilters(e.detail.text);
    working = [...working, ...newChips];
    loading = false;
    emitChange();
  }

  function autofocus(node) {
    node.focus();
  }

  function draftKeydown(e, c) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyDraft(c);
    }
  }
</script>

<section class="input-spec">
  {#if showTitle}
    <h3 class="title">Inclusion criteria</h3>
  {/if}

  <div class="rows">
    {#each rows as r, i (r.field)}
      <div class="row" in:fly={rowIn(i)}>
        <span class="label">{r.label}</span>
        <div class="chips">
          {#each r.chips as c (c.id)}
            {#if c.connector}<span class="connector">{c.connector}</span>{/if}
            <span class="chip-slot" class:removable={MULTI_FIELDS.has(r.field)}>
            {#if readOnly}
              <Chip value={c.value} editable={false} />
            {:else if c.kind === "database"}
              <DatabaseChip chip={c} on:change={(e) => replaceChip(e.detail)} />
            {:else if c.kind === "date"}
              <DateChip chip={c} on:change={(e) => replaceChip(e.detail)} />
            {:else}
              <span class="anchor">
                <Chip value={c.value} open={openId === c.id} on:toggle={() => toggleChip(c)} />

                {#if c.options}
                  <ChipPopover
                    open={openId === c.id}
                    searchable
                    bind:query
                    placeholder="Search…"
                    on:close={() => (openId = null)}
                  >
                    <ul class="list">
                      {#each filterOptions(c.options, query) as opt (opt.value)}
                        <li>
                          <button type="button" class="option" on:click={() => selectOption(c, opt)}>
                            <span class="name">{opt.label}</span>
                            {#if opt.value === c.value}
                              <span class="check" aria-hidden="true">✓</span>
                            {/if}
                          </button>
                        </li>
                      {:else}
                        <li class="empty">No matches</li>
                      {/each}
                    </ul>
                  </ChipPopover>
                {:else}
                  <ChipPopover open={openId === c.id} on:close={() => (openId = null)}>
                    <div class="edit">
                      <input
                        class="edit-input"
                        type="text"
                        bind:value={draft}
                        use:autofocus
                        on:keydown={(e) => draftKeydown(e, c)}
                      />
                      <button type="button" class="apply" on:click={() => applyDraft(c)}>Apply</button>
                    </div>
                  </ChipPopover>
                {/if}
              </span>
            {/if}
            {#if !readOnly && MULTI_FIELDS.has(r.field)}
              <button
                type="button"
                class="remove"
                aria-label="Remove {c.value}"
                on:click={() => removeChip(c.id)}
              ><Icon name="close" size={10} /></button>
            {/if}
            </span>
          {/each}

          {#if !readOnly && r.field === "database"}
            <span class="anchor">
              <button
                type="button"
                class="plus-chip"
                class:open={addOpenField === r.field}
                aria-label="Add database"
                on:click={() => (addOpenField = addOpenField === r.field ? null : r.field)}
              >+</button>
              <ChipPopover
                open={addOpenField === r.field}
                searchable
                bind:query={addQuery}
                placeholder="Search databases…"
                on:close={() => (addOpenField = null)}
              >
                <ul class="list">
                  {#each filteredDbs as db (db.id)}
                    <li>
                      <button type="button" class="option" on:click={() => addDatabase(db)}>
                        <span class="name">{db.name}</span>
                      </button>
                    </li>
                  {:else}
                    <li class="empty">No databases found</li>
                  {/each}
                </ul>
              </ChipPopover>
            </span>
          {/if}
        </div>
      </div>
    {/each}

    {#if !readOnly}
      <div class="row add-row" in:fly={rowIn(rows.length)}>
        <AddFilterChip {loading} on:submit={handleAddFilter} />
      </div>
    {/if}
  </div>

  {#if !readOnly}
    <div in:fly={rowIn(working.length + 1)}>
      <CohortPreview {count} {noun} />
    </div>
  {/if}
</section>

<style>
  .input-spec {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .add-row {
    margin-top: 2px;
  }

  .chips {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .plus-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font: inherit;
    font-size: 14px;
    line-height: 1;
    color: #6b7280;
    background: #fff;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.12s ease, color 0.12s ease;
  }

  .plus-chip:hover,
  .plus-chip.open {
    color: #2563eb;
    border-color: #3b82f6;
  }

  /* Removable chip: the × sits at the chip's right edge and appears on hover.
     Only used on multi-value rows (databases today). */
  .chip-slot {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .chip-slot .remove {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    color: #fff;
    background: #d1d5db;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, background 0.12s ease;
  }

  .chip-slot.removable:hover .remove {
    opacity: 1;
    pointer-events: auto;
  }

  .chip-slot.removable:hover .remove:hover {
    background: #9ca3af;
  }

  .label {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.7;
  }

  /* Inline connector word (e.g. "and") between two chips on the same row. */
  .connector {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.7;
  }

  .anchor {
    position: relative;
    display: inline-block;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 4px;
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    font: inherit;
    font-size: 13px;
    color: #111827;
    text-align: left;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .option:hover {
    background: #f3f4f6;
  }

  .check {
    color: #2563eb;
    font-size: 12px;
  }

  .empty {
    padding: 8px 10px;
    font-size: 13px;
    color: #9ca3af;
  }

  .edit {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
  }

  .edit-input {
    flex: 1;
    min-width: 160px;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    color: #111827;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    outline: none;
  }

  .edit-input:focus {
    border-color: #3b82f6;
  }

  .apply {
    padding: 6px 10px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: #2563eb;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .apply:hover {
    background: #1d4ed8;
  }
</style>
