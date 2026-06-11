<script>
  import { createEventDispatcher } from "svelte";
  import { getDatabaseDetail } from "../lib/api.js";

  export let database;

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = "";
  let detail = null;

  $: databaseId = database?.id || null;
  $: if (databaseId) {
    loadDetail(databaseId);
  }

  async function loadDetail(id) {
    loading = true;
    error = "";
    try {
      detail = await getDatabaseDetail(id);
    } catch (e) {
      detail = null;
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  function normalizeLevel(level) {
    if (level === "National" || level === "Regional" || level === "Local") return level;
    return "Other";
  }

  $: model = detail?.model || null;
  $: tables = Array.isArray(model?.tables) ? model.tables : [];
  $: description = model?.description || detail?.description || "";
  $: identifiers = model?.identity?.keys || model?.identifiers || [];
  $: coded = model?.coded || [];
  $: metaLevel = normalizeLevel(detail?.level ?? database?.level ?? "Local");
  $: metaReadOnly = Boolean(detail?.readOnly ?? database?.readOnly);
  $: metaStale = Boolean(detail?.stale ?? database?.stale);
  $: metaScheme = detail?.scheme ?? database?.scheme ?? null;
  $: metaVersion = detail?.version ?? database?.version ?? null;
  $: metaLastPulled = detail?.lastPulled ?? database?.lastPulled ?? null;
  $: metaProvenanceRef = detail?.provenanceRef ?? database?.provenanceRef ?? null;
  $: metaProvenanceUrl = detail?.provenanceUrl ?? database?.provenanceUrl ?? null;
</script>

<div class="detail">
  <button class="back" on:click={() => dispatch("back")}>‹ Databases</button>

  <header class="detail-head">
    <h3>{database.name}</h3>
    {#if description}<p class="desc">{description}</p>{/if}
    <div class="meta-row">
      <span class="level level-{metaLevel.toLowerCase()}">{metaLevel}</span>
      {#if metaReadOnly}<span class="badge readonly">Read-only</span>{/if}
      {#if metaScheme || metaVersion}
        <span class="scheme">{metaScheme || metaVersion}</span>
        <span class="dot">·</span>
        <span>
          {#if metaLastPulled}
            Last pulled {metaLastPulled}
          {:else}
            No pull date
          {/if}
        </span>
      {:else}
        <span>User-managed · no published source</span>
      {/if}
      {#if metaStale}<span class="stale">⚠ Newer source may exist</span>{/if}
    </div>
    <div class="meta-row">
      <span class="source-label">Source:</span>
      {#if metaProvenanceRef || metaProvenanceUrl}
        {#if metaProvenanceUrl}
          <a class="source-link" href={metaProvenanceUrl} target="_blank" rel="noreferrer">
            {metaProvenanceRef || metaProvenanceUrl}
          </a>
        {:else}
          <span>{metaProvenanceRef}</span>
        {/if}
      {:else}
        <span>No source reference</span>
      {/if}
    </div>
  </header>

  <section class="pane">
    <h4 class="pane-title">Database model</h4>
    <p class="pane-sub">Model loaded from <code>var/databases/&lt;id&gt;/model.json</code>.</p>

    {#if loading}
      <p class="state">Loading database detail…</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if model}
      <h5 class="art">Tables &amp; key fields</h5>
      <div class="entities">
        {#each tables as t (t.name)}
          <div class="entity">
            <span class="ename">{t.name}</span>
            <ul>
              {#each (t.columns || []).slice(0, 8) as c}
                <li>{c.name}</li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>

      {#if identifiers.length}
        <h5 class="art">Identifiers / join keys</h5>
        <ul class="plain">
          {#each identifiers as id}<li>{typeof id === "string" ? id : JSON.stringify(id)}</li>{/each}
        </ul>
      {/if}

      {#if coded.length}
        <h5 class="art">Coded columns</h5>
        <ul class="plain">
          {#each coded as c}<li>{typeof c === "string" ? c : JSON.stringify(c)}</li>{/each}
        </ul>
      {/if}
    {:else}
      <p class="pane-sub">No indexed model yet for this source.</p>
    {/if}
  </section>
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

  .detail-head h3 { margin: 0 0 var(--space-1); font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--color-text); }
  .desc { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.4; }
  .meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--text-xs); }
  .source-label { color: var(--color-text-faint); font-weight: var(--weight-semibold); }
  .source-link { color: var(--color-accent); text-decoration: none; }
  .source-link:hover { text-decoration: underline; }
  .level {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-weight: var(--weight-semibold);
    font-size: var(--text-xs);
  }
  .level-national { background: var(--color-accent-weak); color: var(--color-accent); }
  .level-regional { background: var(--color-warning-weak); color: var(--color-warning); }
  .level-local { background: var(--color-success-weak); color: var(--color-success); }
  .level-other { background: var(--color-surface-muted); color: var(--color-text-secondary); }
  .badge.readonly {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-weight: var(--weight-semibold);
    background: var(--color-surface-muted);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }
  .scheme { color: var(--color-text-secondary); font-weight: var(--weight-medium); }
  .dot { color: var(--color-text-faint); }
  .stale { color: var(--color-warning); font-weight: var(--weight-medium); }

  .pane { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); background: var(--color-surface); }
  .pane-title { margin: 0 0 var(--space-1); font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--color-text); }
  .pane-sub { margin: 0 0 var(--space-3); font-size: var(--text-xs); color: var(--color-text-muted); line-height: 1.4; }
  .pane-sub code { color: var(--color-text-secondary); }

  .art {
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-faint);
  }

  .entities { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-3); }
  .entity { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
  .ename { font-weight: var(--weight-semibold); color: var(--color-text); font-size: var(--text-sm); }
  .entity ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .entity li { font-size: var(--text-xs); color: var(--color-text-secondary); font-family: var(--font-mono, ui-monospace, monospace); }

  .plain { margin: 0; padding-left: var(--space-5); }
  .plain li { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; }
</style>
