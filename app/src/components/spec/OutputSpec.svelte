<script>
  import { createEventDispatcher } from "svelte";
  import { fly } from "svelte/transition";
  import Chip from "./Chip.svelte";
  import ChipPopover from "./ChipPopover.svelte";
  import AddFilterChip from "./AddFilterChip.svelte";
  import Icon from "../Icon.svelte";
  import { allTemplatesGrouped, getTemplateById } from "../../lib/templateCatalog.js";

  // The output specification: a crisp one-liner naming the deliverable, plus a
  // template chip naming the Excel workbook that will be populated, with an
  // optional list of free-text refinements the user can attach below it.
  //   output = { summary: string, templateChip: Chip, refinements?: Chip[] }
  export let output;
  // Staggered reveal, continuing from where InputSpec's rows left off so the
  // whole contract enters as one line-by-line cascade. `startDelay` is the ms
  // offset of this section's first line.
  export let reveal = false;
  export let startDelay = 0;

  const STEP = 70;
  const lineIn = (i) => ({ y: 6, duration: 240, delay: reveal ? startDelay + i * STEP : 0 });

  const dispatch = createEventDispatcher();

  // Two distinct interactions on the same chip, kept from fighting:
  //  • click  → the template picker (grouped list)
  //  • hover  → a small preview of the current template (only when picker closed)
  let pickerOpen = false;
  let hovering = false;
  let chipWrapEl;
  let previewStyle = "";

  $: showPreview = hovering && !pickerOpen;

  // The preview is `position: fixed` so it escapes the right panel's
  // `overflow` clipping; anchor it just below the chip.
  function onEnter() {
    hovering = true;
    const r = chipWrapEl.getBoundingClientRect();
    previewStyle = `top: ${r.bottom + 4}px; left: ${r.left}px;`;
  }

  // The full Template record backing the chip (for description + columns).
  $: currentTemplate = getTemplateById(output.templateChip.raw);

  function togglePicker() {
    pickerOpen = !pickerOpen;
    if (pickerOpen) hovering = false;
  }

  // Strip the trailing "(local)" / "(national)" qualifier from a template name.
  // The picker already groups templates under "Local audits" / "National
  // audits" headers, so the per-row bracket is redundant.
  function baseName(template) {
    return template.name.replace(/\s*\((?:local|regional|national)\)\s*$/i, "").trim();
  }

  // Derive a crisp summary line from a chosen template, e.g.
  // "Cord pH (local)" → "Cord pH audit", "NNAP (national)" → "NNAP audit".
  function summaryFor(template) {
    return `${baseName(template)} audit`;
  }

  function selectTemplate(template) {
    output = {
      ...output,
      summary: summaryFor(template),
      templateChip: { ...output.templateChip, value: template.name, raw: template.id },
    };
    pickerOpen = false;
    dispatch("change", output);
  }

  // Free-text refinements the user attaches to the output via the "+ Add filter"
  // pill — each becomes a removable chip on its own row below the template.
  let addingRefinement = false;
  $: refinements = output.refinements || [];

  function handleAddRefinement(e) {
    addingRefinement = true;
    const text = (e.detail.text || "").trim();
    if (!text) { addingRefinement = false; return; }
    const newChip = { id: crypto.randomUUID(), kind: "refinement", value: text };
    output = { ...output, refinements: [...refinements, newChip] };
    addingRefinement = false;
    dispatch("change", output);
  }

  function removeRefinement(id) {
    output = { ...output, refinements: refinements.filter((c) => c.id !== id) };
    dispatch("change", output);
  }
</script>

<section class="output-spec">
  <h3 class="title" in:fly={lineIn(0)}>Output specifications</h3>

  <div class="template-row" in:fly={lineIn(1)}>
    <span class="label">Template</span>
    <span
      class="chip-wrap"
      bind:this={chipWrapEl}
      on:mouseenter={onEnter}
      on:mouseleave={() => (hovering = false)}
      role="group"
    >
      <Chip
        variant="template"
        value={output.templateChip.value}
        open={pickerOpen}
        on:toggle={togglePicker}
      />

      <!-- Click: the grouped template picker -->
      <ChipPopover open={pickerOpen} on:close={() => (pickerOpen = false)}>
        {#each allTemplatesGrouped() as group}
          <div class="group-header">{group.category}</div>
          {#each group.templates as template (template.id)}
            <button
              type="button"
              class="option"
              class:selected={template.id === output.templateChip.raw}
              on:click={() => selectTemplate(template)}
            >
              {baseName(template)}
            </button>
          {/each}
        {/each}
      </ChipPopover>

      <!-- Hover: a small preview of the current template -->
      {#if showPreview && currentTemplate}
        <div class="preview" role="tooltip" style={previewStyle}>
          <p class="preview-desc">{currentTemplate.description}</p>
          <p class="preview-cols">
            <span class="cols-label">Columns:</span>
            {currentTemplate.columns.join(", ")}
          </p>
        </div>
      {/if}
    </span>
  </div>

  {#each refinements as r, i (r.id)}
    <div class="refinement-row" in:fly={lineIn(2 + i)}>
      <span class="label">Refinement</span>
      <span class="chip-slot removable">
        <span class="static-chip">{r.value}</span>
        <button
          type="button"
          class="remove"
          aria-label="Remove {r.value}"
          on:click={() => removeRefinement(r.id)}
        ><Icon name="close" size={10} /></button>
      </span>
    </div>
  {/each}

  <div class="add-row" in:fly={lineIn(2 + refinements.length)}>
    <AddFilterChip loading={addingRefinement} on:submit={handleAddRefinement} />
  </div>
</section>

<style>
  .output-spec {
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

  .template-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label {
    font-size: 13px;
    color: #6b7280;
  }

  .chip-wrap {
    position: relative;
    display: inline-flex;
  }

  .group-header {
    padding: 8px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .option {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 12px;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: #111827;
    background: #fff;
    border: none;
    cursor: pointer;
  }

  .option:hover {
    background: #f3f4f6;
  }

  .option.selected {
    color: #2563eb;
    font-weight: 600;
    background: #eef2ff;
  }

  .preview {
    position: fixed;
    width: 320px;
    max-width: 80vw;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
    z-index: 20;
  }

  .preview-desc {
    margin: 0 0 6px;
    font-size: 12.5px;
    line-height: 1.45;
    color: #111827;
  }

  .preview-cols {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #6b7280;
  }

  .cols-label {
    font-weight: 600;
    color: #6b7280;
  }

  /* Refinement row: same shape as a filter row in InputSpec — plain-text label
     beside a value-only pill that the user can remove on hover. */
  .refinement-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-row {
    margin-top: 2px;
  }

  .static-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 7px;
    font-size: 13px;
    line-height: 1.3;
    color: #111827;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    white-space: nowrap;
  }

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
</style>
