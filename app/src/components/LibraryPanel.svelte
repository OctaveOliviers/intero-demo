<script>
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import AuditDetail from "./AuditDetail.svelte";
  import DatabaseDetail from "./DatabaseDetail.svelte";
  import {
    renameAudit,
    deleteAudit,
    uploadAudit,
    reindexAudit,
    reindexDatabase,
  } from "../lib/api.js";
  import { templates, templatesLoading, refreshTemplates } from "../lib/templates.js";
  import {
    databases,
    databasesLoading,
    refreshDatabases,
    addDatabase,
    renameDatabase,
    deleteDatabase,
  } from "../stores/databases.js";
  import { indexingMap, flashing, chipOf, errorOf } from "../stores/indexing.js";
  import { addToast } from "../stores/toasts.js";
  import {
    libraryPage,
    openTemplateLibraryDetail,
    openDatabaseLibraryDetail,
    backToLibraryList,
  } from "../stores/navigation.js";
  import { getDeadlineSubtitle } from "../lib/deadlineSubtitle.js";

  // --- Audits ---
  let clones = [];
  let cloneSeq = 0;
  let auditError = "";
  let auditDragOver = false;
  let auditFileInput;
  let auditMenuOpenId = null;

  // --- Databases ---
  let dbError = "";
  let dbDragOver = false;
  let dbFileInput;
  let dbMenuOpenId = null;
  let dbItems = [];

  const LEVELS = ["National", "Regional", "Local", "Other"];

  $: section = $libraryPage.section;
  $: selectedTemplateId = $libraryPage.templateId;
  $: selectedDatabaseId = $libraryPage.databaseId;

  function normalizeLevel(level) {
    if (level === "National" || level === "Regional" || level === "Local") return level;
    return "Other";
  }

  $: auditItems = [...$templates, ...clones].map((t) => {
    const level = normalizeLevel(t.level || "Local");
    return {
      ...t,
      level,
      readOnly: Boolean(t.readOnly),
      stale: Boolean(t.stale),
      scheme: t.scheme ?? null,
      lastPulled: t.lastPulled ?? null,
      version: t.version ?? null,
      provenanceRef: t.provenanceRef ?? null,
      provenanceUrl: t.provenanceUrl ?? null,
    };
  });

  $: auditGroups = LEVELS.map((level) => ({
    level,
    items: auditItems.filter((t) => t.level === level),
  })).filter((g) => g.items.length > 0);

  $: selectedAudit = selectedTemplateId
    ? auditItems.find((a) => a.id === selectedTemplateId) || null
    : null;

  $: dbItems = $databases.map((d) => {
    const level = normalizeLevel(d.level || "Local");
    return {
      ...d,
      level,
      readOnly: Boolean(d.readOnly),
      stale: Boolean(d.stale),
      scheme: d.scheme ?? null,
      lastPulled: d.lastPulled ?? null,
      version: d.version ?? null,
      provenanceRef: d.provenanceRef ?? null,
      provenanceUrl: d.provenanceUrl ?? null,
    };
  });

  $: selectedDatabase = selectedDatabaseId
    ? dbItems.find((d) => d.id === selectedDatabaseId) || null
    : null;

  onMount(() => {
    refreshTemplates().catch((e) => (auditError = e.message || String(e)));
    refreshDatabases().catch((e) => (dbError = e.message || String(e)));
  });

  function openAudit(a) {
    auditMenuOpenId = null;
    openTemplateLibraryDetail(a.id);
  }

  function openDatabase(d) {
    dbMenuOpenId = null;
    openDatabaseLibraryDetail(d.id);
  }

  // --- Audit handlers ---
  async function handleAuditFile(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".xlsx", ".xlsm"].includes(ext)) {
      auditError = "Only .xlsx and .xlsm files are supported.";
      return;
    }
    auditError = "";
    try {
      await uploadAudit(file);
      await refreshTemplates();
    } catch (err) {
      auditError = err.message || String(err);
    }
  }

  function onAuditDrop(e) {
    e.preventDefault();
    auditDragOver = false;
    handleAuditFile(e.dataTransfer.files[0]);
  }

  function onAuditPick(e) {
    handleAuditFile(e.target.files[0]);
    e.target.value = "";
  }

  function handleCloneAudit(a) {
    auditMenuOpenId = null;
    cloneSeq += 1;
    const clone = {
      ...a,
      id: `${a.id}-local-${cloneSeq}`,
      name: `${a.name} (local copy)`,
      level: "Local",
      readOnly: false,
      stale: false,
      _clone: true,
    };
    clones = [...clones, clone];
    addToast({ kind: "success", message: `Cloned “${a.name}” into Local audits.` });
  }

  async function handleRenameAudit(a) {
    auditMenuOpenId = null;
    const next = prompt("Rename audit", a.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === a.name) return;
    if (a._clone) {
      clones = clones.map((c) => (c.id === a.id ? { ...c, name } : c));
      return;
    }
    try {
      await renameAudit(a.id, name);
      await refreshTemplates();
    } catch (e) {
      auditError = e.message || String(e);
    }
  }

  async function handleDeleteAudit(a) {
    auditMenuOpenId = null;
    if (!confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
    if (a._clone) {
      clones = clones.filter((c) => c.id !== a.id);
      return;
    }
    try {
      await deleteAudit(a.id);
      await refreshTemplates();
      if (selectedTemplateId === a.id) backToLibraryList();
    } catch (e) {
      auditError = e.message || String(e);
    }
  }

  async function handleReindexAudit(a) {
    auditMenuOpenId = null;
    auditError = "";
    try {
      await reindexAudit(a.id);
    } catch (e) {
      auditError = e.message || String(e);
    }
  }

  // --- Database handlers ---
  async function handleDbFile(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".sqlite", ".sqlite3", ".db"].includes(ext)) {
      dbError = "Only .sqlite, .sqlite3, and .db files are supported.";
      return;
    }
    dbError = "";
    try {
      await addDatabase(file);
    } catch (err) {
      dbError = err.message || String(err);
    }
  }

  function onDbDrop(e) {
    e.preventDefault();
    dbDragOver = false;
    handleDbFile(e.dataTransfer.files[0]);
  }

  function onDbPick(e) {
    handleDbFile(e.target.files[0]);
    e.target.value = "";
  }

  async function handleRenameDb(d) {
    dbMenuOpenId = null;
    const next = prompt("Rename database", d.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === d.name) return;
    try {
      await renameDatabase(d.id, name);
    } catch (e) {
      dbError = e.message || String(e);
    }
  }

  async function handleDeleteDb(d) {
    dbMenuOpenId = null;
    if (!confirm(`Remove "${d.name}" from the catalog? The SQLite file on disk will not be deleted.`)) return;
    try {
      await deleteDatabase(d.id);
      if (selectedDatabaseId === d.id) backToLibraryList();
    } catch (e) {
      dbError = e.message || String(e);
    }
  }

  async function handleReindexDb(d) {
    dbMenuOpenId = null;
    dbError = "";
    try {
      await reindexDatabase(d.id);
    } catch (e) {
      dbError = e.message || String(e);
    }
  }

  function toggleMenu(sectionName, id, e) {
    e.stopPropagation();
    if (sectionName === "audit") {
      auditMenuOpenId = auditMenuOpenId === id ? null : id;
    } else {
      dbMenuOpenId = dbMenuOpenId === id ? null : id;
    }
  }

  function closeMenus() {
    auditMenuOpenId = null;
    dbMenuOpenId = null;
  }
</script>

<svelte:window on:click={closeMenus} />

<div class="library-panel">
  <section class="content">
    {#if section === "templates"}
      {#if selectedAudit}
        <AuditDetail
          template={selectedAudit}
          readonly={selectedAudit.readOnly}
          on:back={backToLibraryList}
          on:clone={() => {
            handleCloneAudit(selectedAudit);
            backToLibraryList();
          }}
        />
      {:else}
        <h2 class="page-title">Templates</h2>
        {#if auditError}<div class="error">{auditError}</div>{/if}
        {#if $templatesLoading && auditItems.length === 0}
          <div class="empty">Loading templates…</div>
        {:else if auditItems.length === 0}
          <div class="empty">No templates found. Add an audit template to get started.</div>
        {/if}

        {#each auditGroups as group (group.level)}
          <div class="group">
            <h3 class="group-title">{group.level}</h3>
            <div class="grid">
              {#each group.items as a (a.id)}
                {@const chip = chipOf("audit", a.id, $indexingMap, $flashing)}
                <div class="card-wrap">
                  <div
                    class="card clickable"
                    role="button"
                    tabindex="0"
                    on:click={() => openAudit(a)}
                    on:keydown={(e) => (e.key === "Enter" || e.key === " ") && openAudit(a)}
                  >
                    <div class="card-body">
                      <h3>
                        <span class="card-name">{a.name}</span>
                        {#if a.readOnly}<span class="badge readonly">Read-only</span>{/if}
                        {#if chip === "indexing"}<span class="badge indexing">Indexing</span>{/if}
                        {#if chip === "ready"}<span class="badge ready">Ready</span>{/if}
                        {#if chip === "error"}
                          <span class="badge error" title={errorOf("audit", a.id, $indexingMap)}>Error</span>
                        {/if}
                      </h3>
                      {#if a.description}<p>{a.description}</p>{/if}
                      {#if a.submissionDeadline}
                        {@const deadline = getDeadlineSubtitle(a.submissionDeadline)}
                        {#if deadline}<div class="card-deadline">{deadline.text}</div>{/if}
                      {/if}
                    </div>
                  </div>
                  <button
                    class="menu-btn"
                    class:open={auditMenuOpenId === a.id}
                    on:click={(e) => toggleMenu("audit", a.id, e)}
                    aria-label="Options"
                  >
                    <Icon name="more" />
                  </button>
                  {#if auditMenuOpenId === a.id}
                    <div class="menu">
                      {#if chip === "error"}
                        <button class="menu-item" on:click={() => handleReindexAudit(a)}>
                          <span class="menu-icon-spacer"></span>Try indexing again
                        </button>
                      {/if}
                      {#if a.readOnly}
                        <button class="menu-item" on:click={() => handleCloneAudit(a)}>
                          <span class="menu-icon-spacer"></span>Clone to local
                        </button>
                      {:else}
                        <button class="menu-item" on:click={() => handleRenameAudit(a)}>
                          <Icon name="rename" size={16} />Rename
                        </button>
                        <button class="menu-item danger" on:click={() => handleDeleteAudit(a)}>
                          <Icon name="trash" size={16} />Delete
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}

        <!-- "Add audit template" upload card hidden for now (doc 9 §Design); kept to re-enable later.
        <button
          class="upload-card"
          class:drag-over={auditDragOver}
          on:click={() => auditFileInput && auditFileInput.click()}
          on:drop={onAuditDrop}
          on:dragover|preventDefault={() => (auditDragOver = true)}
          on:dragleave={() => (auditDragOver = false)}
        >
          <div class="card-body">
            <h3>Add audit template</h3>
            <p>Drop an Excel file (.xlsx) or click to browse</p>
          </div>
        </button>
        <input
          bind:this={auditFileInput}
          type="file"
          accept=".xlsx,.xlsm"
          on:change={onAuditPick}
          style="display:none"
        />
        -->
      {/if}
    {:else}
      {#if selectedDatabase}
        <DatabaseDetail database={selectedDatabase} on:back={backToLibraryList} />
      {:else}
        <h2 class="page-title">Databases</h2>
        {#if dbError}<div class="error">{dbError}</div>{/if}
        {#if $databasesLoading && dbItems.length === 0}
          <div class="empty">Loading databases…</div>
        {:else if dbItems.length === 0}
          <div class="empty">No databases found. Add a database to get started.</div>
        {/if}
        <div class="grid">
          {#each dbItems as d (d.id)}
            {@const chip = chipOf("database", d.id, $indexingMap, $flashing)}
            <div class="card-wrap">
              <div
                class="card clickable"
                role="button"
                tabindex="0"
                on:click={() => openDatabase(d)}
                on:keydown={(e) => (e.key === "Enter" || e.key === " ") && openDatabase(d)}
              >
                <div class="card-body">
                  <h3>
                    <span class="card-name">{d.name}</span>
                    {#if d.readOnly}<span class="badge readonly">Read-only</span>{/if}
                    {#if chip === "indexing"}<span class="badge indexing">Indexing</span>{/if}
                    {#if chip === "ready"}<span class="badge ready">Ready</span>{/if}
                    {#if chip === "error"}
                      <span class="badge error" title={errorOf("database", d.id, $indexingMap)}>Error</span>
                    {/if}
                  </h3>
                  <p>{d.description || d.path}</p>
                </div>
              </div>
              <button
                class="menu-btn"
                class:open={dbMenuOpenId === d.id}
                on:click={(e) => toggleMenu("db", d.id, e)}
                aria-label="Options"
              >
                <Icon name="more" />
              </button>
              {#if dbMenuOpenId === d.id}
                <div class="menu">
                  {#if chip === "error"}
                    <button class="menu-item" on:click={() => handleReindexDb(d)}>
                      <span class="menu-icon-spacer"></span>Try indexing again
                    </button>
                  {/if}
                  <button class="menu-item" on:click={() => handleRenameDb(d)}>
                    <Icon name="rename" size={16} />Rename
                  </button>
                  <button class="menu-item danger" on:click={() => handleDeleteDb(d)}>
                    <Icon name="trash" size={16} />Delete
                  </button>
                </div>
              {/if}
            </div>
          {/each}

          <!-- "Add database" upload card hidden for now (doc 9 §Design); kept to re-enable later.
          <button
            class="upload-card"
            class:drag-over={dbDragOver}
            on:click={() => dbFileInput && dbFileInput.click()}
            on:drop={onDbDrop}
            on:dragover|preventDefault={() => (dbDragOver = true)}
            on:dragleave={() => (dbDragOver = false)}
          >
            <div class="card-body">
              <h3>Add database</h3>
              <p>Drop a SQLite file (.sqlite / .db) or click to browse</p>
            </div>
          </button>
          <input
            bind:this={dbFileInput}
            type="file"
            accept=".sqlite,.sqlite3,.db"
            on:change={onDbPick}
            style="display:none"
          />
          -->
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .library-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .page-title {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
  }

  .error {
    background: var(--color-danger-weak);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-6) var(--space-3);
    font-size: var(--text-base);
  }

  .group {
    margin-bottom: var(--space-5);
  }

  .group-title {
    margin: 0 0 var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-faint);
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card.clickable {
    cursor: pointer;
  }

  .card-deadline {
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .card-wrap {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }

  .card-wrap:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-sm);
  }

  .card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-10) var(--space-4) var(--space-5);
  }

  .card-body {
    flex: 1;
    min-width: 0;
  }

  .card-body h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .card-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-body p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-btn {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease),
                background var(--dur-fast) var(--ease),
                color var(--dur-fast) var(--ease);
  }

  .menu-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .card-wrap:hover .menu-btn,
  .menu-btn:focus-visible,
  .menu-btn.open {
    opacity: 1;
  }

  .menu {
    position: absolute;
    top: 44px;
    right: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    z-index: 10;
    min-width: 168px;
    padding: var(--space-1);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: var(--space-2);
    background: transparent;
    border: none;
    font-size: var(--text-sm);
    color: var(--color-text);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--dur-fast) var(--ease);
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

  .menu-icon-spacer {
    display: inline-block;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* "Add audit template" / "Add database" upload-card styles — markup hidden for
     now (doc 9 §Design); kept commented to re-enable later.
  .upload-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: var(--color-surface);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
    font: inherit;
  }

  .upload-card:hover:not(:disabled),
  .upload-card.drag-over {
    border-color: var(--color-accent);
    background: var(--color-accent-weak);
  }
  */

  .badge {
    display: inline-block;
    padding: 1px var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-pill);
    vertical-align: middle;
  }

  .badge.indexing {
    background: var(--color-warning-weak);
    color: var(--color-warning);
  }

  .badge.ready {
    background: var(--color-success-weak);
    color: var(--color-success);
  }

  .badge.error {
    background: var(--color-danger-weak);
    color: var(--color-danger);
    cursor: help;
  }

  .badge.readonly {
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
  }

  @media (max-width: 780px) {
    .library-panel {
      padding: var(--space-4);
    }
  }
</style>
