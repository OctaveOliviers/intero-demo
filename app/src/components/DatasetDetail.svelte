<script>
  import { createEventDispatcher } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    getDatasetDetail,
    getDatabaseDetail,
    patchDatasetCriterion,
    addDatasetFilter,
    removeDatasetCriterion,
    renameDataset,
    deleteDataset,
  } from "../lib/api.js";
  import {
    markSharedGrantProcessed,
  } from "../stores/sharedNotifications.js";
  import {
    criterionChipValue,
    criterionOptionHint,
    criterionInputText,
    isScalarDateCriterion,
    parseCriterionInput,
    inlineSql,
  } from "../lib/datasetDetailChips.js";
  import Chip from "./spec/Chip.svelte";
  import ChipPopover from "./spec/ChipPopover.svelte";
  import Calendar from "./spec/Calendar.svelte";
  import Icon from "./Icon.svelte";
  import ShareModal from "./ShareModal.svelte";

  // A Dataset is small, so it lives inline in the data library: one box per slice.
  // The box always shows the name (click to fold / unfold) and a ⋯ menu (rename /
  // delete) top-right; unfolded it shows the filters as label + value chips with an
  // add-filter row, the entity count bottom-left, and the Filters↔SQL toggle
  // bottom-right (library-and-sources.md §A). Edits re-derive deterministically (no
  // LLM); the API returns the re-scoped dataset with a new count + SQL.
  export let dataset; // summary: { id, name, databases, count }
  export let pendingShareGrant = null;
  export let autoExpand = false;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let loading = false;
  let error = "";
  let detail = null;
  let loadedId = null;
  let autoExpandedId = null;
  let databaseModelsById = {};
  let modelLoadToken = 0;
  let view = "normal"; // "normal" | "sql"

  $: name = dataset?.name ?? "";
  $: pendingShareGrantId = pendingShareGrant?.grant_id || null;
  $: if (autoExpand && dataset?.id && autoExpandedId !== dataset.id) {
    autoExpandedId = dataset.id;
    expanded = true;
    if (loadedId !== dataset.id && !loading) void loadDetail(dataset.id);
  }

  async function toggleExpand() {
    if (editingName) return;
    expanded = !expanded;
    if (expanded) {
      if (pendingShareGrantId) markSharedGrantProcessed(pendingShareGrantId);
      if (loadedId !== dataset.id) await loadDetail(dataset.id);
    }
  }

  async function loadDetail(id) {
    loadedId = id;
    loading = true;
    error = "";
    databaseModelsById = {};
    openCriterionId = null;
    view = "normal";
    try {
      detail = await getDatasetDetail(id);
      void loadDatabaseModels(id, detail?.databases || []);
    } catch (e) {
      detail = null;
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  async function loadDatabaseModels(datasetId, databaseIds) {
    const token = ++modelLoadToken;
    const ids = Array.isArray(databaseIds) ? databaseIds : [];
    if (!ids.length) {
      if (token === modelLoadToken && loadedId === datasetId) databaseModelsById = {};
      return;
    }
    const entries = await Promise.all(
      ids.map(async (dbId) => {
        try {
          const d = await getDatabaseDetail(dbId);
          return [dbId, d?.model || null];
        } catch {
          return [dbId, null];
        }
      }),
    );
    if (token !== modelLoadToken || loadedId !== datasetId) return;
    databaseModelsById = Object.fromEntries(entries);
  }

  $: criteria = Array.isArray(detail?.criteria) ? detail.criteria : [];
  $: notAvailable = Array.isArray(detail?.not_available) ? detail.not_available : [];
  $: count = (detail ?? dataset)?.count ?? 0;
  $: displaySql = inlineSql(detail?.cohort_sql || "", criteria);

  // --- The ⋯ menu (rename / delete / share) ----------------------------------
  let menuOpen = false;
  let showShare = false;

  function onWindowClick(e) {
    if (menuOpen && !e.target.closest?.(".menu-wrap")) menuOpen = false;
  }

  function openShare() {
    menuOpen = false;
    showShare = true;
  }

  async function del() {
    menuOpen = false;
    try {
      await deleteDataset(dataset.id);
      dispatch("changed");
    } catch (e) {
      error = e?.message || String(e);
    }
  }

  // --- Rename ----------------------------------------------------------------
  let editingName = false;
  let nameDraft = "";

  function startRename() {
    menuOpen = false;
    nameDraft = name;
    editingName = true;
  }

  async function saveName() {
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === name) return;
    const id = dataset.id;
    try {
      const d = await renameDataset(id, next);
      if (loadedId === id) detail = d;
      name = d.name;
      dispatch("changed");
    } catch (e) {
      error = e?.message || String(e);
    }
  }

  function nameKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    } else if (e.key === "Escape") {
      editingName = false;
    }
  }

  // --- Inline chip editing (one popover at a time) ---------------------------
  let openCriterionId = null;
  let draft = "";
  let busy = false;

  function toggleCriterion(c) {
    if (openCriterionId === c.criterion_id) {
      openCriterionId = null;
    } else {
      openCriterionId = c.criterion_id;
      draft = criterionInputText(c);
    }
  }

  async function applyDraft(c, text = draft) {
    const value = parseCriterionInput(c, text);
    openCriterionId = null;
    if (value == null) return;
    busy = true;
    error = "";
    const id = detail.id;
    try {
      const next = await patchDatasetCriterion(id, c.criterion_id, value);
      if (id === loadedId) {
        detail = next;
        dispatch("changed");
      }
    } catch (e) {
      if (id === loadedId) error = e?.message || String(e);
    } finally {
      if (id === loadedId) busy = false;
    }
  }

  async function removeCriterion(c) {
    if (busy) return;
    openCriterionId = null;
    busy = true;
    error = "";
    const id = detail.id;
    try {
      const next = await removeDatasetCriterion(id, c.criterion_id);
      if (id === loadedId) {
        detail = next;
        dispatch("changed");
      }
    } catch (e) {
      if (id === loadedId) error = e?.message || String(e);
    } finally {
      if (id === loadedId) busy = false;
    }
  }

  function draftKeydown(e, c) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyDraft(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      openCriterionId = null;
    }
  }

  function autofocus(node) {
    requestAnimationFrame(() => node.focus());
  }

  function isInlineValueEditor(c) {
    return openCriterionId === c.criterion_id
      && !busy
      && !isScalarDateCriterion(c)
      && !Array.isArray(c?.predicate?.value);
  }

  function codeHint(c) {
    return criterionOptionHint(c, databaseModelsById, 8);
  }

  // --- Add filter ------------------------------------------------------------
  let addText = "";
  let adding = false;

  async function submitAdd() {
    const text = addText.trim();
    if (!text || adding) return;
    adding = true;
    error = "";
    const id = detail.id;
    try {
      const next = await addDatasetFilter(id, text);
      if (id === loadedId) {
        detail = next;
        addText = "";
        dispatch("changed");
      }
    } catch (e) {
      if (id === loadedId) error = e?.message || String(e);
    } finally {
      if (id === loadedId) adding = false;
    }
  }

  function addKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAdd();
    }
  }

  function countText(n) {
    if (n === 0) return $_("dataset.countZero");
    if (n === 1) return $_("dataset.countOne", { values: { count: n } });
    return $_("dataset.countMany", { values: { count: n } });
  }
</script>

<svelte:window on:click={onWindowClick} />

<!-- One box per Dataset: name + ⋯ menu always visible; fold/unfold on the name. -->
<section
  class="panel"
  class:expanded
  class:pending-share={Boolean(pendingShareGrantId)}
  data-dataset-id={dataset.id}
>
  <div class="panel-head">
    {#if editingName}
      <input
        class="name-input"
        bind:value={nameDraft}
        use:autofocus
        on:blur={saveName}
        on:keydown={nameKeydown}
      />
    {:else}
      <button class="title" on:click={toggleExpand} aria-expanded={expanded}>
        <Icon name="chevron" size={16} />
        <span class="name-text">{name}</span>
      </button>
    {/if}

    <div class="menu-wrap">
      <button
        class="menu-btn"
        class:open={menuOpen}
        on:click|stopPropagation={() => (menuOpen = !menuOpen)}
        aria-label={$_("common.options")}
      ><Icon name="more" /></button>
      {#if menuOpen}
        <div class="menu">
          <button class="menu-item" on:click={startRename}>
            <Icon name="rename" size={16} />{$_("dataset.rename")}
          </button>
          <button class="menu-item" on:click={openShare}>
            <Icon name="share" size={16} />{$_("sharing.share")}
          </button>
          <button class="menu-item danger" on:click={del}>
            <Icon name="trash" size={16} />{$_("common.delete")}
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if expanded}
    {#if loading}
      <div class="state">{$_("dataset.loadingDetail")}</div>
    {:else if error && !detail}
      <div class="error">{error || $_("dataset.loadFailed")}</div>
    {:else if detail}
      {#if error}<div class="error">{error}</div>{/if}

      <div class="body">
        {#if view === "sql"}
          <pre class="sql" aria-readonly="true">{displaySql}</pre>
        {:else}
          {#if criteria.length}
            <div class="rows">
              {#each criteria as c, i (c.criterion_id + "#" + i)}
                <div class="filter-row">
                  <span class="filter-label">{c.label}</span>
                  <span class="anchor">
                    {#if isInlineValueEditor(c)}
                      <input
                        class="chip-inline-input"
                        type="text"
                        bind:value={draft}
                        use:autofocus
                        on:blur={() => applyDraft(c)}
                        on:keydown={(e) => draftKeydown(e, c)}
                      />
                    {:else}
                      <Chip
                        value={criterionChipValue(c)}
                        editable={!busy}
                        open={openCriterionId === c.criterion_id}
                        on:toggle={() => toggleCriterion(c)}
                      />
                    {/if}

                    {#if isScalarDateCriterion(c)}
                      <ChipPopover
                        open={openCriterionId === c.criterion_id}
                        on:close={() => (openCriterionId = null)}
                      >
                        <Calendar
                          value={criterionInputText(c)}
                          on:select={(e) => applyDraft(c, e.detail)}
                        />
                      </ChipPopover>
                    {:else if openCriterionId === c.criterion_id && Array.isArray(c?.predicate?.value)}
                      <ChipPopover
                        open={openCriterionId === c.criterion_id}
                        on:close={() => (openCriterionId = null)}
                      >
                        <div class="edit">
                          <input
                            class="edit-input"
                            type="text"
                            bind:value={draft}
                            use:autofocus
                            on:keydown={(e) => draftKeydown(e, c)}
                          />
                          <button type="button" class="apply" on:click={() => applyDraft(c)}>{$_("common.apply")}</button>
                        </div>
                      </ChipPopover>
                    {/if}
                  </span>
                  {#if openCriterionId === c.criterion_id && codeHint(c)}
                    <span class="chip-hint"><strong>{$_("dataset.valueHintLabel")}:</strong> {codeHint(c)}</span>
                  {/if}
                  <button
                    type="button"
                    class="remove"
                    aria-label={$_("dataset.removeFilter", { values: { label: c.label } })}
                    title={$_("dataset.removeFilter", { values: { label: c.label } })}
                    disabled={busy}
                    on:click={() => removeCriterion(c)}
                  ><Icon name="close" size={14} /></button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="add-row">
            <Icon name="new" size={16} />
            <input
              class="add-input"
              type="text"
              placeholder={$_("dataset.addFilterPlaceholder")}
              bind:value={addText}
              on:keydown={addKeydown}
              disabled={adding}
            />
            <button class="add-btn" on:click={submitAdd} disabled={adding || !addText.trim()}>
              {adding ? $_("dataset.adding") : $_("dataset.add")}
            </button>
          </div>

          {#if notAvailable.length}
            <div class="rows na">
              {#each notAvailable as na, i (na.phrase + "#" + i)}
                <div class="na-row">
                  <span class="na-phrase">{na.phrase}</span>
                  {#if na.reason}<span class="na-reason">{na.reason}</span>{/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <div class="panel-foot">
        <span class="count" class:busy aria-live="polite">{countText(count)}</span>
        <div class="view-toggle" role="tablist" aria-label="View">
          <button
            class="toggle-btn"
            class:active={view === "normal"}
            role="tab"
            aria-selected={view === "normal"}
            on:click={() => (view = "normal")}
          >{$_("dataset.viewNormal")}</button>
          <button
            class="toggle-btn"
            class:active={view === "sql"}
            role="tab"
            aria-selected={view === "sql"}
            on:click={() => (view = "sql")}
          >{$_("dataset.viewSql")}</button>
        </div>
      </div>
    {/if}
  {/if}
</section>

{#if showShare}
  <ShareModal
    resource={{ type: "dataset", id: dataset.id, title: name }}
    on:close={() => (showShare = false)}
  />
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .panel.pending-share {
    background: var(--color-accent-weak);
  }

  .panel-head { display: flex; align-items: center; gap: var(--space-2); }

  .title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex: 1;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text);
    text-align: left;
  }
  .title :global(svg) {
    flex-shrink: 0;
    color: var(--color-text-faint);
    transition: transform var(--dur-fast) var(--ease);
  }
  .expanded .title :global(svg) { transform: rotate(90deg); }
  .name-text {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    padding: 2px var(--space-2);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    outline: none;
  }

  /* ⋯ menu, top-right. */
  .menu-wrap { position: relative; flex-shrink: 0; }
  .menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .menu-btn:hover, .menu-btn.open { background: var(--color-hover); color: var(--color-text); }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    padding: var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
  }
  .menu-item:hover { background: var(--color-hover); }
  .menu-item.danger { color: var(--color-danger); }

  .body { display: flex; flex-direction: column; gap: var(--space-3); }
  .state { color: var(--color-text-muted); font-style: italic; font-size: var(--text-sm); }
  .error {
    background: var(--color-danger-weak);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }

  .rows { display: flex; flex-direction: column; gap: var(--space-2); }

  /* One filter per row: label, value chip right beside it, remove at the end. */
  .filter-row { display: flex; align-items: center; gap: var(--space-2); }
  .filter-label { font-size: var(--text-sm); color: var(--color-text); }
  .anchor { position: relative; display: inline-block; }
  .chip-inline-input {
    min-width: 68px;
    max-width: 220px;
    padding: 3px 7px;
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-accent);
    border-radius: 8px;
    outline: none;
  }
  .chip-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.3;
    max-width: 380px;
  }
  .remove {
    margin-left: auto;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-faint);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .remove:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
  .remove:disabled { opacity: 0.4; cursor: default; }

  .add-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
  }
  .add-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    outline: none;
  }
  .add-input::placeholder { color: var(--color-text-faint); }
  .add-btn {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  }
  .add-btn:hover:not(:disabled) { border-color: var(--color-accent); background: var(--color-accent-weak); }
  .add-btn:disabled { opacity: 0.5; cursor: default; }

  .na { margin-top: var(--space-1); }
  .na-row { display: flex; flex-direction: column; gap: 2px; }
  .na-phrase { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .na-reason { font-size: var(--text-xs); color: var(--color-text-muted); }

  .sql {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  /* Footer: entity count bottom-left, Filters↔SQL toggle bottom-right. */
  .panel-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    transition: opacity var(--dur-fast) var(--ease);
  }
  .count.busy { opacity: 0.5; }

  .view-toggle {
    display: inline-flex;
    padding: 2px;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .toggle-btn {
    padding: var(--space-1) var(--space-3);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .toggle-btn:hover { color: var(--color-text); }
  .toggle-btn.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
  }

  .edit { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); }
  .edit-input {
    flex: 1;
    min-width: 160px;
    padding: var(--space-1) var(--space-2);
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .edit-input:focus { border-color: var(--color-accent); }
  .apply {
    padding: var(--space-1) var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-on-primary);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .apply:hover { background: var(--color-accent-hover); }
</style>
