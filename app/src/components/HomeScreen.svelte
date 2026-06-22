<script>
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { parseRequest, defaultCohortForTemplate } from "../lib/spec.js";
  import { runFromSpec } from "../lib/runFromSpec.js";
  import {
    allTemplatesGrouped, setRuntimeTemplateGroups,
  } from "../lib/templateCatalog.js";
  import { listAudits } from "../lib/api.js";
  import { isMockMode } from "../lib/mock.js";
  import Icon from "./Icon.svelte";
  import ScanningEye from "./ScanningEye.svelte";
  import InputSpec from "./spec/InputSpec.svelte";
  import OutputSpec from "./spec/OutputSpec.svelte";
  import DashboardCardGrid from "./DashboardCardGrid.svelte";
  import { selectAudit } from "../stores/navigation.js";

  // ONE surface. The agent analyses LIVE: as soon as the operator types, the
  // bottom folds out (divider → "thinking" → suggested filters) without any
  // submit. The request stays above the line, the agent's extraction below it.
  // The small round arrow is the only run trigger — clicking it (or Enter)
  // hands the finished contract to runFromSpec.
  // State machine: idle → parsing → ready | error.
  let phase = "idle"; // 'idle' | 'parsing' | 'ready' | 'error'
  let requestText = "";
  let spec = null;
  let errorMessage = "";
  let running = false;

  // The "+" affordance opens a small menu with the two file-based entry routes
  // (doc 2 Flow A · step 1): upload a new template, or select an already-indexed
  // one from the Library. The third route — describing the audit in the prompt —
  // needs no menu. All three converge on the same editable output-spec chip the
  // user confirms before running (GAP-2).
  let fileInput;
  let selectedFile = null;
  let menuOpen = false;
  let menuView = "root"; // 'root' | 'templates'
  // A newly UPLOADED template indexes in the background; its chip carries an
  // "indexing…" badge until ready. Selecting an existing template skips this —
  // it is already indexed. The arrow stays clickable throughout (non-blocking).
  let indexing = false;
  let indexingTimer = null;
  // True while the contract on screen was opened by attaching a file (upload
  // route), so removing that file folds the analysis back up.
  let fromUpload = false;
  let templateGroups = allTemplatesGrouped();
  let templateSourceReady = isMockMode("audits");

  function flatTemplates(groups) {
    return (groups || []).flatMap((group) => group.templates || []);
  }

  function toBackendTemplateGroup(audits) {
    return [{
      category: $_("home.availableAudits"),
      templates: (audits || []).map((a) => ({
        id: a.id,
        name: a.name,
        category: $_("home.availableAudits"),
        fileName: `${a.id}.xlsx`,
        description: a.description || "",
        columns: [],
      })),
    }];
  }

  onMount(async () => {
    if (isMockMode("audits")) {
      templateGroups = allTemplatesGrouped();
      templateSourceReady = true;
      return;
    }
    try {
      const audits = await listAudits();
      templateGroups = toBackendTemplateGroup(audits);
      setRuntimeTemplateGroups(templateGroups);
      templateSourceReady = true;
    } catch (err) {
      templateGroups = [];
      setRuntimeTemplateGroups([]);
      templateSourceReady = false;
    }
  });

  function toggleMenu() {
    menuOpen = !menuOpen;
    menuView = "root";
  }
  function closeMenu() {
    menuOpen = false;
    menuView = "root";
  }
  function chooseUpload() {
    closeMenu();
    fileInput.click();
  }

  // crypto.randomUUID-backed chip, matching spec.js's chip shape so InputSpec /
  // OutputSpec / runFromSpec read these the same as a parsed contract's chips.
  function mkChip(props) {
    return { id: crypto.randomUUID(), ...props };
  }
  // Strip the trailing "(local)" / "(regional)" / "(national)" qualifier — the
  // picker already groups by level, so the per-row bracket is redundant.
  function baseName(template) {
    return template.name.replace(/\s*\((?:local|regional|national)\)\s*$/i, "").trim();
  }

  // Open the contract for a directly chosen template (upload or existing),
  // bypassing the prompt parse. Shows the output-spec chip ready to confirm.
  function openContract({ summary, templateChip, request }) {
    clearTimeout(debounceTimer);
    parseSeq++; // cancel any in-flight prompt parse
    pendingRun = false;
    errorMessage = "";
    spec = {
      request,
      // Selecting (or uploading) a template prefills the SAME inclusion criteria a
      // typed request would (Change 2) — both paths converge to one contract state.
      cohort: defaultCohortForTemplate(templateChip.raw),
      output: { summary, templateChip },
      resolvedCount: 0,
      countNoun: "patients",
    };
    phase = "ready";
    revealRows = true;
    setTimeout(() => {
      revealRows = false;
    }, revealMs + 400);
  }

  // Route 2 — select an existing (already-indexed) template from the Library.
  function selectExistingTemplate(template) {
    clearTimeout(indexingTimer);
    indexing = false;
    fromUpload = false;
    openContract({
      summary: `${baseName(template)} audit`,
      templateChip: mkChip({
        kind: "template",
        field: "outputTemplate",
        label: "Template",
        value: template.name,
        raw: template.id,
      }),
      request: `Run the ${baseName(template)} audit`,
    });
    closeMenu();
  }

  // Staggered line-by-line reveal of the contract rows. Per-row delay derives
  // from row index while `revealRows` is true; it flips off once the entrance
  // has played so chips added later (via "+") appear instantly.
  const STEP = 70; // ms between successive rows
  let revealRows = false;
  $: nRows = spec ? spec.cohort.length : 0;
  // Input rows + add-row + preview finish cascading by this point. The output
  // column (on the right) reveals in parallel from the top, so the taller input
  // side is what determines when the whole entrance is done.
  $: revealMs = (nRows + 2) * STEP;

  // The persistent agent band's label. It only ever changes the wording while the
  // criteria below stay mounted (doc 2 §"The persistent agent band"): a first read
  // with nothing extracted yet, a re-read once criteria exist, or the settled state.
  $: bandLabel =
    phase === "parsing"
      ? spec
        ? "Updating criteria…"
        : "Reading your request…"
      : "Suggested criteria";

  // Token so a superseded/stopped parse can never flip us into `ready`.
  let parseSeq = 0;
  // Debounce so a fast typist re-analyses once they pause, not per keystroke.
  let debounceTimer = null;
  const DEBOUNCE = 400; // ms of quiet before parseRequest actually fires
  // Set when the arrow is clicked before the contract is ready, so the run
  // fires the moment parsing completes (the arrow is never blocked).
  let pendingRun = false;

  // Live trigger: every edit to the request (re)starts the agent. The thinking
  // animation shows immediately; the ~3.5s parse fires after a short pause.
  function onInput(e) {
    autoResize(e.target);
    scheduleParse();
  }

  function scheduleParse() {
    const text = requestText.trim();
    clearTimeout(debounceTimer);
    parseSeq++; // invalidate any in-flight / pending parse
    errorMessage = "";
    pendingRun = false; // a fresh edit cancels a queued run; click again to run
    if (!text) {
      phase = "idle";
      spec = null;
      return;
    }
    if (!templateSourceReady) {
      phase = "error";
      spec = null;
      errorMessage = $_("home.templatesLoading");
      return;
    }
    phase = "parsing"; // fold out + scanning eye right away
    const seq = parseSeq;
    debounceTimer = setTimeout(() => runParse(seq, text), DEBOUNCE);
  }

  async function runParse(seq, text) {
    try {
      const result = await parseRequest(text, { templates: flatTemplates(templateGroups) });
      if (seq !== parseSeq) return; // superseded by a newer edit, or stopped
      // The staggered row reveal plays ONLY on the first transition into criteria
      // (doc 2 §"The persistent agent band"). On a re-extraction the chips are
      // already mounted and morph in place via cohortMerge, so we must not replay
      // the entrance — that would re-stagger the whole set on every keystroke.
      const firstCriteria = !spec;
      spec = result;
      phase = "ready";
      if (firstCriteria) {
        revealRows = true;
        // Let the staggered entrance finish, then stop applying index delays.
        setTimeout(() => {
          revealRows = false;
        }, revealMs + 400);
      }
      // If the operator already hit the arrow while we were thinking, go now.
      if (pendingRun) {
        pendingRun = false;
        runAnalysis();
      }
    } catch (e) {
      if (seq !== parseSeq) return;
      pendingRun = false;
      errorMessage = e?.message || $_("home.parseError");
      phase = "error";
    }
  }

  // Stop the in-flight re-read. If criteria are already on screen, settle back to
  // showing them ("Suggested criteria") rather than folding the whole analysis
  // away; only collapse to idle when nothing has been extracted yet.
  function stopParsing() {
    clearTimeout(debounceTimer);
    parseSeq++;
    pendingRun = false;
    phase = spec ? "ready" : "idle";
  }

  // The arrow (and Enter) run the analysis. It's never blocked while the agent
  // is thinking: if the contract isn't ready yet, queue the run for the moment
  // it is.
  function requestRun() {
    // A menu-chosen template (upload / select existing) yields a ready spec with
    // no prompt text — the chip itself is the request, so allow the run.
    if (!requestText.trim() && !(phase === "ready" && spec)) return;
    if (!templateSourceReady) return;
    if (phase === "ready" && spec) {
      runAnalysis();
    } else {
      pendingRun = true;
    }
  }

  // Enter runs the analysis — same as clicking the arrow.
  // Shift+Enter inserts a newline.
  function onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      requestRun();
    }
  }

  // Auto-grow the request from one row up to a fixed cap; past the cap it
  // scrolls internally so the top never climbs into the title.
  const MAX_INPUT_H = 104; // px — keep in sync with .bar-input max-height
  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_H) + "px";
  }

  // Route 1 — upload a new template. The chip names the template-to-be (the file
  // name) and shows an "indexing…" badge while the background index runs; the
  // user can keep typing and even run before it clears.
  function handleFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    fromUpload = true;
    const name = file.name.replace(/\.[^.]+$/, "");
    openContract({
      summary: `${name} audit`,
      templateChip: mkChip({
        kind: "template",
        field: "outputTemplate",
        label: "Template",
        value: name,
        raw: null,
      }),
      request: `Run the ${name} audit`,
    });
    indexing = true;
    clearTimeout(indexingTimer);
    indexingTimer = setTimeout(() => {
      indexing = false;
    }, 2500);
  }
  function clearFile() {
    selectedFile = null;
    if (fileInput) fileInput.value = "";
    clearTimeout(indexingTimer);
    indexing = false;
    // Removing the attached template folds the upload-driven contract away.
    if (fromUpload) {
      fromUpload = false;
      parseSeq++;
      spec = null;
      phase = requestText.trim() ? "parsing" : "idle";
      if (requestText.trim()) scheduleParse();
    }
  }

  // Keep the JobSpec in sync as the operator edits chips, so runFromSpec sees
  // the current cohort/output. Reassigning `spec` refreshes object identity.
  function onCohortChange(e) {
    spec = { ...spec, cohort: e.detail };
  }
  function onOutputChange(e) {
    spec = { ...spec, output: e.detail };
  }

  async function runAnalysis() {
    if (running || phase !== "ready" || !spec) return;
    running = true;
    // runFromSpec hands off to the existing run pipeline and navigates to the
    // Results view; it owns isSubmitting and resets state on its error path.
    try {
      await runFromSpec(spec);
    } finally {
      running = false;
    }
  }
</script>

<div class="home">
  <h1 class="heading">{$_("home.heading")}</h1>

  <!-- ABOVE the line: the user request. Bottom-anchored to the divider, so it
       grows UPWARD (capped, then scrolls) and the line never moves. -->
  <div class="request-zone">
    <form class="bar" class:open={phase !== "idle"} on:submit|preventDefault={runAnalysis}>
      {#if selectedFile}
        <div class="file-chip">
          <span class="file-icon" aria-hidden="true">📎</span>
          <span class="file-name">{selectedFile.name}</span>
          <button class="file-remove" type="button" on:click={clearFile} aria-label={$_("home.removeFile")}
            >×</button
          >
        </div>
      {/if}

      <div class="input-row">
        <input type="file" bind:this={fileInput} on:change={handleFilePick} class="file-input" />
        <div class="add-wrap">
          <button
            class="add-btn"
            type="button"
            on:click={toggleMenu}
            title={$_("home.addTemplate")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={$_("home.addTemplate")}><span class="plus">+</span></button
          >
          {#if menuOpen}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div class="menu-backdrop" on:click={closeMenu}></div>
            <div class="add-menu" role="menu">
              {#if menuView === "root"}
                <button class="menu-item" type="button" role="menuitem" on:click={chooseUpload}>
                  {$_("home.uploadNewTemplate")}
                </button>
                <button
                  class="menu-item"
                  type="button"
                  role="menuitem"
                  on:click={() => (menuView = "templates")}
                >
                  {$_("home.selectExistingTemplate")}
                </button>
              {:else}
                <button class="menu-back" type="button" on:click={() => (menuView = "root")}>
                  {$_("home.backToTemplates")}
                </button>
                {#each templateGroups as group}
                  <div class="menu-group">{group.category}</div>
                  {#each group.templates as t (t.id)}
                    <button
                      class="menu-item"
                      type="button"
                      role="menuitem"
                      on:click={() => selectExistingTemplate(t)}
                    >
                      {baseName(t)}
                    </button>
                  {/each}
                {/each}
              {/if}
            </div>
          {/if}
        </div>
        <!-- svelte-ignore a11y-autofocus -->
        <textarea
          class="bar-input"
          bind:value={requestText}
          on:input={onInput}
          on:keydown={onKeydown}
          placeholder={$_("home.askAnything")}
          rows="1"
          autofocus
          disabled={!templateSourceReady}
        ></textarea>
        <!-- The single run trigger. The agent analyses live as you type; this
             arrow is always clickable (disabled only on an empty prompt) and
             runs the analysis the moment the contract is ready. -->
        <button
          class="send-btn"
          type="button"
          on:click={requestRun}
          disabled={!templateSourceReady || (!requestText.trim() && !(phase === "ready" && spec))}
          aria-label={$_("home.runAudit")}>→</button
        >
      </div>
    </form>
  </div>

  <!-- BELOW the line: the agent's analysis. Top-anchored to the divider, so it
       grows DOWNWARD (and scrolls if very tall) while the line stays put. -->
  <div class="agent-zone">
    <!-- The card grid is ALWAYS mounted in the same DOM position so its on-screen
         place never shifts. While the agent suggestion is open it is only dimmed
         (de-emphasised), never unmounted, hidden, or reflowed. -->
    <div class="cards" class:dimmed={phase !== "idle"} aria-hidden={phase !== "idle"}>
      <DashboardCardGrid on:select={(e) => selectAudit(e.detail.auditId)} />
    </div>
    {#if phase !== "idle"}
      <div class="fold overlay">
        {#if phase === "error"}
          <div class="error" role="alert">{errorMessage}</div>
        {:else if phase === "parsing" || spec}
          <div class="band" aria-live="polite">
            <span class="slot" class:interactive={phase === "parsing"}>
              <span class="eye" aria-hidden="true">
                <ScanningEye size={16} animate={phase === "parsing"} />
              </span>
              {#if phase === "parsing"}
                <button
                  class="stop-btn"
                  type="button"
                  on:click={stopParsing}
                  title={$_("home.stop")}
                  aria-label={$_("home.stopReading")}
                >
                  <Icon name="stop" size={16} />
                </button>
              {/if}
            </span>
            <span class="status">{bandLabel}</span>
          </div>
        {/if}

        {#if indexing}
          <div class="indexing-badge" aria-live="polite">
            <span class="eye-sm" aria-hidden="true"><ScanningEye size={12} /></span>
            <span>{$_("home.indexingTemplate")}</span>
          </div>
        {/if}

        {#if spec}
          <div class="sections">
            <InputSpec
              cohort={spec.cohort}
              noun={spec.countNoun}
              reveal={revealRows}
              on:change={onCohortChange}
            />
            <OutputSpec output={spec.output} reveal startDelay={0} on:change={onOutputChange} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Two zones meet at a divider pinned to the vertical midline: the request
     zone fills the top half (content bottom-anchored, grows up); the agent
     zone fills the bottom half (content top-anchored, grows down). Because
     each is flex:1 the boundary — the line between request and analysis —
     never moves, regardless of how either side grows. */
  .home {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 var(--space-6);
    box-sizing: border-box;
    overflow: hidden;
  }

  .heading {
    /* Fixed above the divider; the request grows up toward it but is capped
       before reaching it. Normal weight (not bold). */
    position: absolute;
    left: 0;
    right: 0;
    top: calc(50% - 168px);
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-normal);
    color: var(--color-text);
    letter-spacing: -0.01em;
    text-align: center;
  }

  .request-zone {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end; /* bar sits on the divider, grows upward */
  }
  .agent-zone {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start; /* fold starts at the divider, grows downward */
    overflow-y: auto; /* very tall analyses scroll here; the line stays put */
    position: relative; /* anchor for the agent-suggestion overlay */
  }

  /* The dashboard card grid lives here permanently. When the agent suggestion is
     open the cards stay in the EXACT same position and size — they only recede
     visually (lowered opacity/contrast), never unmount or reflow. */
  .cards {
    width: 100%;
    /* Breathing room between the request bar (above the divider) and the cards. */
    padding-top: var(--space-6);
    transition: opacity var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease);
  }
  .cards.dimmed {
    opacity: 0.35;
    filter: saturate(0.85);
    pointer-events: none; /* the overlay owns interaction while it's open */
  }

  /* The agent fold, rendered only while typing, sits ON TOP of the cards: pinned
     to the top of the zone (the divider) and layered above via z-index. Its own
     --color-surface background makes it read as a solid suggestion over the
     dimmed cards. Because it is absolute, the cards below do not move. */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
  }

  /* ── The request bar (above the line) ── */
  .bar {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-sizing: border-box;
  }
  /* When open, the bottom edge becomes the divider: square the bottom corners
     and let the agent box below share the line. */
  .bar.open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  /* Subtle focus only when it's a standalone pill (idle); when open the border
     must stay even with the agent box's border across the seam. */
  .bar:not(.open):focus-within {
    border-color: var(--color-border-strong);
  }

  .file-chip {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: var(--space-1);
    margin: var(--space-2) var(--space-2) 0;
    padding: var(--space-1) var(--space-2);
    background: var(--color-surface-muted);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    max-width: 280px;
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-remove {
    color: var(--color-text-muted);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
  }
  .file-remove:hover {
    color: var(--color-text);
  }
  .file-input {
    display: none;
  }

  /* Buttons pinned to the BOTTOM of the request region: as the prompt grows
     upward the textarea's top rises but the + and → stay put on the line. */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .bar-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: var(--text-base);
    line-height: 1.4;
    color: var(--color-text);
    resize: none;
    outline: none;
    /* Matches the 32px button height when empty (4px+24px+4px), so the row
       padding (8px) gives equal whitespace above and below the buttons. */
    padding: var(--space-1);
    min-height: 24px;
    /* Past this cap the request scrolls inside the bar; the top edge stays put
       below the title (height is driven by autoResize in the script — keep this
       in sync with MAX_INPUT_H). */
    max-height: 104px;
    overflow-y: auto;
  }
  /* The surface owns the border; the inner input must not draw its own focus
     ring, or it reads as a box-in-a-box. */
  .bar-input:focus {
    box-shadow: none;
  }
  .bar-input::placeholder {
    color: var(--color-text-faint);
  }
  .bar-input[readonly] {
    cursor: default;
  }

  .add-btn,
  .send-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .add-btn {
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 22px;
  }
  .add-btn:hover {
    background: var(--color-hover);
  }
  /* The "+" glyph's optical center sits ~1px below its line-box center in the
     system font, so a tiny translate brings it to the visual center of the
     32px hover circle. */
  .add-btn .plus {
    display: block;
    line-height: 1;
    transform: translateY(-1px);
  }

  /* ── The "+" menu (upload / select existing template) ── */
  .add-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
  .add-menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 11;
    min-width: 220px;
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md, 0 6px 20px rgba(0, 0, 0, 0.12));
  }
  .menu-item,
  .menu-back {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    color: var(--color-text);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .menu-item:hover,
  .menu-back:hover {
    background: var(--color-hover);
  }
  .menu-back {
    color: var(--color-text-secondary);
  }
  .menu-group {
    padding: var(--space-2) var(--space-3) var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── "indexing…" badge on a freshly uploaded template ── */
  .indexing-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    padding: var(--space-1) var(--space-2);
    background: var(--color-surface-muted);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }
  .eye-sm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }
  .send-btn {
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-size: 16px;
    font-weight: var(--weight-bold);
    transition: background var(--dur-fast) var(--ease);
  }
  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── The agent box (below the line) ── */
  /* No top border: the request bar's bottom border IS the shared divider, so
     the two boxes read as one continuous surface split by a single line. */
  .fold {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4) var(--space-5) var(--space-5);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-top: none;
    border-bottom-left-radius: var(--radius-xl);
    border-bottom-right-radius: var(--radius-xl);
    box-sizing: border-box;
  }

  /* ── The persistent agent band — scanning eye + hover-to-stop, like ResultsView ── */
  .band {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .slot {
    position: relative;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }
  /* Scanning-eye wrapper sized + positioned like the old spinner; colour
     inherits via currentColor from --color-text-secondary so it matches the
     stop button. Animation lives in ScanningEye.svelte. */
  .eye {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
    transition: opacity var(--dur-fast) var(--ease);
  }
  .stop-btn {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .stop-btn:hover {
    color: var(--color-text);
  }
  /* Only the parsing-state slot swaps eye→stop on hover; at rest the eye stays. */
  .slot.interactive:hover .eye {
    opacity: 0;
  }
  .slot.interactive:hover .stop-btn {
    opacity: 1;
  }
  .status {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-3);
    background: var(--color-danger-weak);
    border-radius: var(--radius-sm);
  }

  .sections {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: var(--space-5);
  }
  /* Input on the left, output on the right — equal halves meeting at the
     middle, so the two specifications sit beside each other. */
  .sections > :global(*) {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
