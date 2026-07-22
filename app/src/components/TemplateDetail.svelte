<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { getTemplateDetail, saveTemplateCriteria } from "../lib/api.js";
  import { getDeadlineSubtitle } from "../lib/deadlineSubtitle.js";
  import {
    buildFieldChips,
    buildDatabaseChips,
    predicateInputText,
    applyPredicateInput,
  } from "../lib/templateDetailChips.js";
  import Chip from "./spec/Chip.svelte";
  import ChipPopover from "./spec/ChipPopover.svelte";
  import Icon from "./Icon.svelte";
  import { databases, refreshDatabases } from "../stores/databases.js";
  import { CONTENT } from "../lib/mock/content/index.js";

  // The doc-9 template detail: a single-column page — back-link, title,
  // description, deadline — then three sections: Inclusion criteria (editable
  // fixed_criteria chips, auto-saved), Databases (one chip per bound database
  // + a one-sentence summary), Template (one chip per spec field + a
  // kind-dependent one-sentence description).
  export let template;
  export let readonly = false;

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = "";
  let detail = null;

  $: templateId = template?.id || null;
  $: if (templateId) {
    loadDetail(templateId);
  }

  async function loadDetail(id) {
    loading = true;
    error = "";
    try {
      detail = await getTemplateDetail(id);
    } catch (e) {
      detail = null;
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // Database names/summaries for the Databases section chips.
    refreshDatabases().catch(() => {});
  });

  $: spec = detail?.spec || {};
  $: mapping = detail?.mapping || null;
  $: metaReadOnly = Boolean(detail?.readOnly ?? template?.readOnly ?? readonly);
  $: deadline = getDeadlineSubtitle(detail?.deadline ?? spec?.deadline ?? null);

  $: fieldChips = buildFieldChips(spec, mapping);
  $: databaseChips = buildDatabaseChips(mapping, $databases);

  // --- Metrics tracked (read-only) -------------------------------------------
  // Resolve the dashboard descriptor for this template from the content pack and
  // list its trackers. Only the four BPT/cord audits have a descriptor; for any
  // other template `descriptor` is undefined and the section is not rendered.
  $: descriptor = templateId
    ? CONTENT.dashboards?.find((d) => d.templateId === templateId)
    : null;
  $: metricTrackers = descriptor
    ? descriptor.trackers.map((id) => CONTENT.trackers?.[id]).filter(Boolean)
    : [];

  // Mirror TrackerChart's target convention: proportions (0–1) read as a percent.
  function formatTarget(target) {
    if (!target || !Number.isFinite(target.value)) return null;
    const v =
      target.value >= 0 && target.value <= 1
        ? `${Math.round(target.value * 100)}%`
        : String(target.value);
    return `${target.op || ""} ${v}`.trim();
  }

  // --- Inclusion criteria: editable working copy, auto-saved -----------------
  // `criteria` is the on-screen state; `savedCriteria` is the last state the
  // server accepted. Every change debounces into saveTemplateCriteria; a rejected
  // save (422) shows the server's message and reverts to `savedCriteria`.
  const SAVE_DEBOUNCE_MS = 500;
  let criteria = [];
  let savedCriteria = [];
  let saveError = "";
  let saveTimer = null;
  let criteriaTemplateId = null;

  $: if (detail && detail.id !== criteriaTemplateId) {
    criteriaTemplateId = detail.id;
    savedCriteria = Array.isArray(mapping?.fixed_criteria) ? mapping.fixed_criteria : [];
    criteria = savedCriteria.map((c) => ({ ...c }));
    saveError = "";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    openCriterionId = null;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistCriteria, SAVE_DEBOUNCE_MS);
  }

  async function persistCriteria() {
    saveTimer = null;
    const attempt = criteria;
    try {
      await saveTemplateCriteria(criteriaTemplateId, attempt);
      savedCriteria = attempt.map((c) => ({ ...c }));
      saveError = "";
    } catch (e) {
      saveError = e?.message || String(e);
      criteria = savedCriteria.map((c) => ({ ...c }));
    }
  }

  // Inline chip editing: one popover at a time, a single free-text input for
  // the predicate value (comma-separated for between/in), Enter/Apply commits.
  let openCriterionId = null;
  let draft = "";

  function toggleCriterion(c) {
    if (openCriterionId === c.criterion_id) {
      openCriterionId = null;
    } else {
      openCriterionId = c.criterion_id;
      draft = predicateInputText(c);
    }
  }

  function applyDraft(c) {
    const next = applyPredicateInput(c, draft);
    openCriterionId = null;
    if (!next || next.display === c.display) return;
    criteria = criteria.map((x) => (x.criterion_id === c.criterion_id ? next : x));
    saveError = "";
    scheduleSave();
  }

  function removeCriterion(c) {
    criteria = criteria.filter((x) => x.criterion_id !== c.criterion_id);
    if (openCriterionId === c.criterion_id) openCriterionId = null;
    saveError = "";
    scheduleSave();
  }

  function draftKeydown(e, c) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyDraft(c);
    }
  }

  function autofocus(node) {
    node.focus();
  }
</script>

<div class="detail">
  <button class="back" on:click={() => dispatch("back")}>{$_("templateDetail.back")}</button>

  <header class="detail-head">
    <div class="titles">
      <h3>{template.name}</h3>
      {#if template.description}<p class="desc">{template.description}</p>{/if}
      {#if deadline}<p class="deadline">{deadline.text}</p>{/if}
      {#if metaReadOnly}
        <div class="meta-row"><span class="badge readonly">{$_("common.readOnly")}</span></div>
      {/if}
    </div>
    {#if metaReadOnly}
      <button class="clone-btn" on:click={() => dispatch("clone")}>{$_("common.cloneToLocal")}</button>
    {/if}
  </header>

  {#if loading}
    <div class="state">{$_("templateDetail.loadingDetail")}</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if detail}
    <section class="section">
      <h4 class="section-title">{$_("templateDetail.inclusionCriteria")}</h4>
      {#if !mapping}
        <p class="hint">{$_("templateDetail.noCriteriaYet")}</p>
      {:else if criteria.length === 0}
        <p class="hint">{$_("templateDetail.noFixedCriteria")}</p>
      {:else}
        <div class="chips">
          {#each criteria as c (c.criterion_id)}
            <span class="chip-slot" class:removable={!metaReadOnly}>
              <span class="anchor">
                <Chip
                  value={c.display}
                  editable={!metaReadOnly}
                  open={openCriterionId === c.criterion_id}
                  on:toggle={() => toggleCriterion(c)}
                />
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
              </span>
              {#if !metaReadOnly}
                <button
                  type="button"
                  class="remove"
                  aria-label={$_("templateDetail.removeCriterion", { values: { label: c.display } })}
                  on:click={() => removeCriterion(c)}
                ><Icon name="close" size={10} /></button>
              {/if}
            </span>
          {/each}
        </div>
      {/if}
      {#if saveError}<p class="save-error">{saveError}</p>{/if}
    </section>

    <section class="section">
      <h4 class="section-title">{$_("templateDetail.databases")}</h4>
      {#if !mapping}
        <p class="hint">{$_("templateDetail.noDatabasePaired")}</p>
      {:else}
        <div class="rows">
          {#each databaseChips as db (db.id)}
            <div class="row">
              <Chip value={db.name} variant="template" editable={false} />
              {#if db.summary}<span class="row-desc">{db.summary}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="section">
      <h4 class="section-title">{$_("templateDetail.template")}</h4>
      {#if !mapping}
        <p class="hint">{$_("templateDetail.pairDatabaseHint")}</p>
      {/if}
      <div class="rows">
        {#each fieldChips as f (f.key)}
          <div class="row">
            <Chip value={f.name} variant="template" editable={false} />
            {#if f.description}<span class="row-desc">{f.description}</span>{/if}
          </div>
        {/each}
      </div>
    </section>

    {#if descriptor && metricTrackers.length}
      <section class="section">
        <h4 class="section-title">{$_("templateDetail.metrics")}</h4>
        <div class="rows">
          {#each metricTrackers as t (t.id)}
            <div class="row">
              <Chip value={t.title} variant="template" editable={false} />
              <span class="kind-badge">{t.kind}</span>
              {#if formatTarget(t.target)}
                <span class="kind-badge target">Target {formatTarget(t.target)}</span>
              {/if}
              {#if t.criterion}<span class="row-desc">{t.criterion}</span>{/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .detail { display: flex; flex-direction: column; gap: var(--space-4); }
  .state { color: var(--color-text-muted); font-style: italic; }
  .error { background: var(--color-danger-weak); color: var(--color-danger); border: 1px solid var(--color-danger); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    background: transparent;
    border: none;
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: var(--radius-md);
  }
  .back:hover { color: var(--color-text); }

  .detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
  .titles { min-width: 0; }
  h3 { margin: 0 0 var(--space-1); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); }
  .desc { margin: 0 0 var(--space-1); font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.4; }
  .deadline { margin: 0; font-size: var(--text-xs); color: var(--color-text-faint); }

  .meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-xs); margin-top: var(--space-2); }
  .badge.readonly {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-weight: var(--weight-semibold);
    background: var(--color-surface-muted);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .clone-btn {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  }
  .clone-btn:hover { border-color: var(--color-accent); background: var(--color-accent-weak); }

  .section { display: flex; flex-direction: column; gap: var(--space-2); }
  .section-title {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .hint { margin: 0; font-size: var(--text-sm); color: var(--color-text-faint); font-style: italic; }
  .save-error { margin: 0; font-size: var(--text-xs); color: var(--color-danger); }

  .chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rows { display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; align-items: baseline; gap: var(--space-2); }
  .row-desc { font-size: var(--text-xs); color: var(--color-text-muted); line-height: 1.5; }

  .kind-badge {
    flex-shrink: 0;
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    text-transform: capitalize;
  }
  .kind-badge.target { text-transform: none; }

  .anchor { position: relative; display: inline-block; }

  /* Removable criteria chip: the × sits at the chip's right edge on hover
     (same pattern as the spec/ multi-value rows). */
  .chip-slot { position: relative; display: inline-flex; align-items: center; }
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
    background: var(--color-border-strong, #d1d5db);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, background 0.12s ease;
  }
  .chip-slot.removable:hover .remove { opacity: 1; pointer-events: auto; }
  .chip-slot.removable:hover .remove:hover { background: var(--color-text-faint, #9ca3af); }

  .edit { display: flex; align-items: center; gap: 6px; padding: 8px; }
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
  .edit-input:focus { border-color: #3b82f6; }
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
  .apply:hover { background: #1d4ed8; }
</style>
