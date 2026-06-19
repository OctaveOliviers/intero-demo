<script>
  import { _ } from "svelte-i18n";
  import { createEventDispatcher } from "svelte";
  import Icon from "./Icon.svelte";
  import {
    renameAudit,
    deleteAudit,
    reindexAudit,
    createRunFromAudit,
  } from "../lib/api.js";
  import { refreshTemplates } from "../lib/templates.js";
  import { isSubmitting, addMessage, startRunStream } from "../stores/chat.js";
  import { startAudit, setAuditRunId, setAuditStatus, activeStream } from "../stores/audits.js";
  import { goToResults } from "../stores/navigation.js";
  import { indexingMap, flashing, chipOf, errorOf } from "../stores/indexing.js";
  import { databases } from "../stores/databases.js";

  export let template;
  export let expanded = false;

  const dispatch = createEventDispatcher();

  let menuOpen = false;
  let busy = false;

  // Live indexing chip: "indexing" | "ready" (transient green) | "error" | null.
  $: chip = chipOf("audit", template.id, $indexingMap, $flashing);

  let filters = {};
  let initializedFor = null;

  // The database this run binds to. Without a bound, indexed database there is
  // no field mapping, so the run is gated on a selection (see runDisabled).
  let selectedDatabase = "";

  // Only ready (fully indexed) databases can be bound — an indexing/error one
  // has no schema model to map against.
  $: readyDatabases = $databases.filter((d) => d.status === "ready");

  // Drop a stale selection if the chosen database disappears or stops being
  // ready, and default to the sole ready database when there's exactly one.
  $: if (expanded) {
    if (selectedDatabase && !readyDatabases.some((d) => d.id === selectedDatabase)) {
      selectedDatabase = "";
    }
    if (!selectedDatabase && readyDatabases.length === 1) {
      selectedDatabase = readyDatabases[0].id;
    }
  }

  $: runDisabled = $isSubmitting || !selectedDatabase;

  // Filters start empty — every field is blank until the user fills it in.
  function buildDefaultFilters(t) {
    return { ...(t.defaultFilters || {}) };
  }

  // Initialize filters when this card becomes expanded for a new template.
  $: if (expanded && template) {
    const key = template.id;
    if (initializedFor !== key) {
      filters = buildDefaultFilters(template);
      initializedFor = key;
    }
  }

  function labelFromKey(key) {
    return $_("template.filterLabel." + key);
  }

  function placeholderFromKey(key) {
    return $_("template.filterPlaceholder." + key);
  }

  function buildUserMessage(audit, activeFilters) {
    const lines = Object.entries(activeFilters)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `• ${labelFromKey(k)}: ${v}`);
    return [audit.name, ...lines].join("\n");
  }

  function toggleMenu(e) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  async function handleRename(e) {
    e.stopPropagation();
    menuOpen = false;
    const next = window.prompt($_("template.renamePrompt"), template.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === template.name) return;
    busy = true;
    try {
      await renameAudit(template.id, name);
      await refreshTemplates();
    } catch (err) {
      window.alert($_("template.renameFailed", { values: { error: err.message } }));
    } finally {
      busy = false;
    }
  }

  async function handleDelete(e) {
    e.stopPropagation();
    menuOpen = false;
    if (!window.confirm($_("template.deleteConfirm", { values: { name: template.name } }))) return;
    busy = true;
    try {
      await deleteAudit(template.id);
      await refreshTemplates();
    } catch (err) {
      window.alert($_("template.deleteFailed", { values: { error: err.message } }));
    } finally {
      busy = false;
    }
  }

  async function handleReindex(e) {
    e.stopPropagation();
    menuOpen = false;
    busy = true;
    // Status updates arrive over the indexing SSE stream; no reload needed.
    try {
      await reindexAudit(template.id);
    } catch (err) {
      window.alert($_("template.retryFailed", { values: { error: err.message } }));
    } finally {
      busy = false;
    }
  }

  function handleHeaderClick() {
    if (busy) return;
    dispatch("toggle");
  }

  async function handleRun(e) {
    e.stopPropagation();
    if (runDisabled) return;

    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v && v.trim()),
    );

    isSubmitting.set(true);
    let histId = null;
    try {
      const runTarget = {
        id: template.id,
        name: template.name,
        submissionDeadline: template.submissionDeadline || null,
      };

      histId = startAudit(runTarget, activeFilters);
      goToResults();
      addMessage({
        role: "user",
        type: "text",
        content: buildUserMessage(runTarget, activeFilters),
      });
      const data = await createRunFromAudit(runTarget.id, activeFilters, selectedDatabase);
      setAuditRunId(histId, data.runId);
      startRunStream(data.runId, histId);
    } catch (err) {
      addMessage({ role: "assistant", type: "text", content: "Run failed: " + err.message });
      if (histId) setAuditStatus(histId, "error");
      activeStream.set(null);
      isSubmitting.set(false);
    }
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(e);
  }
</script>

<svelte:window on:click={closeMenu} />

<div class="card-wrap" class:expanded>
  <button class="card" on:click={handleHeaderClick} disabled={busy}>
    <div class="content">
      <h3>
        {template.name}
        {#if chip === "indexing"}<span class="badge indexing">{$_("common.indexing")}</span>{/if}
        {#if chip === "ready"}<span class="badge ready">{$_("common.ready")}</span>{/if}
        {#if chip === "error"}<span class="badge error" title={errorOf("audit", template.id, $indexingMap)}>{$_("common.error")}</span>{/if}
      </h3>
      {#if chip === "indexing"}
        <p class="indexing-note">{$_("template.indexingHelp")}</p>
      {:else if !expanded && template.description}
        <p>{template.description}</p>
      {/if}
    </div>
  </button>

  <button class="menu-btn" on:click={toggleMenu} aria-label="Audit options">
    <Icon name="more" size={18} />
  </button>
  {#if menuOpen}
    <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
    <div class="menu" on:click|stopPropagation>
      {#if chip === "error"}
        <button class="menu-item" on:click={handleReindex}>{$_("common.tryIndexingAgain")}</button>
      {/if}
      <button class="menu-item" on:click={handleRename}>{$_("common.rename")}</button>
      <button class="menu-item danger" on:click={handleDelete}>{$_("common.delete")}</button>
    </div>
  {/if}

  {#if expanded}
    <div class="panel">
      <div class="field">
        <label for="{initializedFor}-database">Database</label>
        <select id="{initializedFor}-database" bind:value={selectedDatabase}>
          <option value="" disabled>
            {readyDatabases.length ? $_("template.selectDatabase") : $_("template.noDatabases")}
          </option>
          {#each readyDatabases as d (d.id)}
            <option value={d.id}>{d.name}</option>
          {/each}
        </select>
      </div>

      <div class="filters-grid">
        {#each Object.keys(template.defaultFilters || {}) as key}
          <div class="field" class:half={key === "dateFrom" || key === "dateTo"}>
            <label for="{initializedFor}-{key}">{labelFromKey(key)}</label>
            <input
              id="{initializedFor}-{key}"
              type="text"
              bind:value={filters[key]}
              placeholder={placeholderFromKey(key)}
              on:keydown={handleKeydown}
            />
          </div>
        {/each}
      </div>

      <div class="actions">
        <button class="run-btn" on:click={handleRun} disabled={runDisabled}>
          {$isSubmitting ? $_("template.running") : $_("template.runAudit")}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .card-wrap {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }

  .card-wrap.expanded {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-md);
  }

  .card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-5) 56px var(--space-5) var(--space-6);
    background: transparent;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }

  .card-wrap:not(.expanded):hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-sm);
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .badge {
    display: inline-block;
    margin-left: var(--space-2);
    padding: 1px var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-pill);
    vertical-align: middle;
  }
  .badge.indexing { background: var(--color-warning-weak); color: var(--color-warning); }
  .badge.ready { background: var(--color-success-weak); color: var(--color-success); }
  .badge.error { background: var(--color-danger-weak); color: var(--color-danger); cursor: help; }

  p {
    margin: 0;
    font-size: var(--text-base);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .indexing-note {
    color: var(--color-text-secondary);
  }

  .menu-btn {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .menu-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .menu {
    position: absolute;
    top: 40px;
    right: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    z-index: 10;
    min-width: 140px;
  }

  .menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text);
    cursor: pointer;
  }

  .menu-item:hover {
    background: var(--color-hover);
  }

  .menu-item.danger {
    color: var(--color-danger);
  }

  .menu-item.danger:hover {
    background: var(--color-danger-weak);
  }

  .panel {
    padding: var(--space-3) var(--space-6) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    grid-column: 1 / -1;
  }

  .field.half {
    grid-column: span 1;
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  input,
  select {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    color: var(--color-text);
    background: var(--color-surface);
    outline: none;
    transition: border-color var(--dur-fast) var(--ease);
  }

  input:focus,
  select:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-weak);
  }

  input::placeholder {
    color: var(--color-text-faint);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .card-wrap.expanded .card {
    padding-bottom: var(--space-3);
  }

  .run-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }

  .run-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
