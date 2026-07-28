<script>
  // One field of a patient's record: label above, value below, and a source
  // control at the bottom-right of the value — bottom, so it stays findable when
  // the value runs to several lines.
  //
  // Every field behaves the same way, whatever it holds. A value is editable; a
  // conflicting value is not a special widget, just a field with two sources and
  // a red edge that clears once the clinician writes what stands.
  //
  // While the run is still filling this field, prose types itself in rather than
  // appearing at once — the difference between a value looked up in a structured
  // record and one synthesised out of notes, made visible in how it arrives.
  import Icon from "../Icon.svelte";
  import { CONTENT } from "../../lib/mock/content/index.js";

  const AW = CONTENT.artifactWorkspace;

  export let field;
  export let streaming = false;
  // Capture mode borrows the click: fields stop taking text and a click picks
  // the field as context for a question instead.
  export let contextCaptureMode = false;
  export let picked = false;
  export let onEdit = () => {};
  export let onSource = () => {};
  export let onPick = () => {};

  let sourcesOpen = false;
  let typed = "";
  let typingTimer = null;
  let lastTypedFrom = "";

  // Type prose in while the run is still working. Short values pop — a lab
  // result does not "arrive gradually", and pretending it does would be a lie
  // about where it came from.
  $: retypeIfNeeded(field.value, streaming, field.kind);

  function retypeIfNeeded(value, isStreaming, kind) {
    const target = String(value ?? "");
    if (!isStreaming || kind !== "prose" || !target) {
      clearTimeout(typingTimer);
      typingTimer = null;
      typed = target;
      lastTypedFrom = target;
      return;
    }
    if (target === lastTypedFrom) return;
    lastTypedFrom = target;
    clearTimeout(typingTimer);
    typed = "";
    const step = Math.max(1, Math.ceil(target.length / 40));
    const advance = () => {
      typed = target.slice(0, typed.length + step);
      if (typed.length < target.length) typingTimer = setTimeout(advance, 24);
      else typingTimer = null;
    };
    typingTimer = setTimeout(advance, 24);
  }

  // Read-only while the field is still filling: you cannot correct a value the
  // agent has not finished writing.
  $: readOnly = contextCaptureMode || streaming;
  $: shownValue = streaming && field.kind === "prose" ? typed : String(field.value ?? "");
  $: hasSources = field.sources.length > 0;

  // Values wrap rather than scroll out of sight: a registration field like
  // "Moderately differentiated (code 2)" must be readable whole, and a
  // single-line <input> would clip it behind the source control.
  function autoGrow(node) {
    const fit = () => {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    };
    // Measure after the browser has the new value, not before — Svelte sets the
    // `value` attribute and calls this action's update in the same flush, so a
    // synchronous read here sizes to the PREVIOUS text.
    const schedule = () => requestAnimationFrame(fit);
    schedule();
    node.addEventListener("input", fit);
    return {
      update: schedule,
      destroy: () => node.removeEventListener("input", fit),
    };
  }

  function handleInput(event) {
    onEdit(field.id, event.target.value);
  }

  // The list opens on hover (below); a click keeps a keyboard/tap path — one
  // source opens straight away, several toggle the list.
  function openSources(event) {
    if (field.sources.length === 1) {
      onSource(field.sources[0].id);
      return;
    }
    sourcesOpen = !sourcesOpen;
    event.stopPropagation();
  }

  function hoverSources(open) {
    if (field.sources.length > 1) sourcesOpen = open;
  }

  function pickSource(sourceId) {
    sourcesOpen = false;
    onSource(sourceId);
  }

  function handleFieldClick(event) {
    if (!contextCaptureMode) return;
    event.preventDefault();
    // Read the geometry now: after any await, `event.currentTarget` is null.
    const rect = event.currentTarget.getBoundingClientRect();
    onPick(field.id, { x: rect.left, y: rect.bottom });
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  class="field status-{field.status}"
  class:picked
  class:capture={contextCaptureMode}
  on:click={handleFieldClick}
  on:mouseleave={() => (sourcesOpen = false)}
>
  <div class="label-row">
    <span class="label">{field.label}</span>
    {#if field.statusLabel}
      <span class="status-word">{field.statusLabel}</span>
    {/if}
  </div>

  <div class="value-wrap">
    <textarea
      class="value"
      class:prose={field.kind === "prose"}
      rows="1"
      readonly={readOnly}
      value={shownValue}
      placeholder={AW.form.empty}
      use:autoGrow={shownValue}
      on:input={handleInput}
    ></textarea>

    {#if hasSources}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="source-affordance"
        on:mouseenter={() => hoverSources(true)}
        on:mouseleave={() => hoverSources(false)}
      >
        <button
          class="source-btn"
          type="button"
          aria-label={field.sources.length === 1 ? AW.form.sourceOne(field.sources[0].title) : AW.form.sourceButton}
          aria-expanded={field.sources.length > 1 ? sourcesOpen : undefined}
          on:click|stopPropagation={openSources}
        >
          <Icon name="file" size={13} />
          {#if field.sources.length > 1}<span class="count">{field.sources.length}</span>{/if}
        </button>

        {#if sourcesOpen && field.sources.length > 1}
          <ul class="source-list" aria-label={AW.form.sourceListLabel}>
            {#each field.sources as source (source.id)}
              <li>
                <button type="button" on:click|stopPropagation={() => pickSource(source.id)}>{source.title}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Status is a light tint alone — no edge, no border — never a filled block: a
     record with three interpretive values should read as informative, not as a
     page full of validation errors. The status word beside the label says why
     it is tinted; hovering deepens the same colour. */
  .field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition:
      background var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }

  .field.status-interpreted {
    background: color-mix(in srgb, var(--color-warning) 7%, transparent);
  }
  .field.status-interpreted:hover {
    background: color-mix(in srgb, var(--color-warning) 14%, transparent);
  }

  .field.status-conflict {
    background: color-mix(in srgb, var(--color-danger) 7%, transparent);
  }
  .field.status-conflict:hover {
    background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  }

  .field.status-edited {
    background: color-mix(in srgb, var(--color-accent) 6%, transparent);
  }
  .field.status-edited:hover {
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  }

  /* A reviewed interpretive value has settled — it reads as neutral now, with
     no tint left asking to be looked at. */

  .field.capture {
    cursor: crosshair;
  }

  /* Capture mode: hovering previews the pick and a committed pick holds it —
     light-blue fill plus a blue outline (an inset shadow, so nothing shifts),
     taking over from whatever status tint the field carried. Listed after the
     status rules so it wins on a coloured field too. */
  .field.capture:hover,
  .field.picked {
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    box-shadow: inset 0 0 0 1.5px var(--color-accent);
  }

  .label-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  /* Muted, like the section heading above it — a label must not out-weigh the
     heading it sits under, and the value is the only thing here in full black. */
  .label {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }

  .status-word {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .value-wrap {
    position: relative;
  }

  .value {
    display: block;
    width: 100%;
    /* Room on the right for the source control, on every wrapped line. */
    padding: 2px 34px 2px 0;
    border: 0;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow: hidden;
    resize: none;
  }

  .value.prose {
    min-height: 46px;
  }

  .value:hover:not([readonly]) {
    border-bottom-color: var(--color-border);
  }

  .value:focus {
    outline: none;
    border-bottom-color: var(--color-accent);
    box-shadow: none;
  }

  .value[readonly] {
    cursor: default;
  }

  /* Bottom-right of the content, so a multi-line value still has it in reach.
     The affordance is the positioned box — the button and its hover list live
     inside it, so hovering either one counts as hovering the group. */
  .source-affordance {
    position: absolute;
    right: 0;
    bottom: 2px;
  }

  .source-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .source-btn:hover,
  .source-btn:focus-visible {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .source-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .count {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    line-height: 1;
  }

  .source-list {
    position: absolute;
    right: 0;
    /* Flush against the button (no gap) so moving the pointer up into the list
       never crosses a dead zone that would dismiss it. */
    bottom: 100%;
    z-index: 10;
    min-width: 220px;
    max-width: 320px;
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-md);
  }

  .source-list button {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-xs);
    text-align: left;
    line-height: 1.35;
    cursor: pointer;
  }

  .source-list button:hover,
  .source-list button:focus-visible {
    background: var(--color-hover);
  }

  @media (prefers-reduced-motion: reduce) {
    .field,
    .value,
    .source-btn {
      transition-duration: 1ms;
    }
  }
</style>
