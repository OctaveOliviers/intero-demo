<script>
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import Icon from "./Icon.svelte";
  import TemplateDetail from "./TemplateDetail.svelte";
  import DatabaseDetail from "./DatabaseDetail.svelte";
  import DatasetDetail from "./DatasetDetail.svelte";
  import ShareModal from "./ShareModal.svelte";
  import {
    renameTemplate,
    deleteTemplate,
    uploadTemplate,
    reindexTemplate,
    reindexDatabase,
    listDatasets,
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
    pendingDatasetGrantByResourceId,
    pendingTemplateGrantByResourceId,
    markSharedGrantProcessed,
    refreshSharedNotifications,
  } from "../stores/sharedNotifications.js";
  import {
    libraryPage,
    openTemplateLibraryDetail,
    openDatabaseLibraryDetail,
    backToLibraryList,
  } from "../stores/navigation.js";
  import { getDeadlineSubtitle } from "../lib/deadlineSubtitle.js";

  // --- Templates ---
  let clones = [];
  let cloneSeq = 0;
  let templateError = "";
  let templateDragOver = false;
  let templateFileInput;
  let templateMenuOpenId = null;

  // --- Share dialog (table templates) ---
  let shareResource = null; // { type, id, title } | null

  function openShareTemplate(a) {
    templateMenuOpenId = null;
    shareResource = { type: "template", id: a.id, title: a.name };
  }

  // --- Databases ---
  let dbError = "";
  let dbDragOver = false;
  let dbFileInput;
  let dbMenuOpenId = null;
  let dbItems = [];

  // --- Datasets (data library) ---
  let datasets = [];
  let datasetsLoading = false;
  let datasetError = "";

  const LEVELS = ["National", "Regional", "Local", "Other"];

  $: section = $libraryPage.section;
  $: selectedTemplateId = $libraryPage.templateId;
  $: selectedDatabaseId = $libraryPage.databaseId;

  function normalizeLevel(level) {
    if (level === "National" || level === "Regional" || level === "Local") return level;
    return "Other";
  }

  $: templateItems = [...$templates, ...clones].map((t) => {
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

  $: templateGroups = LEVELS.map((level) => ({
    level,
    items: templateItems.filter((t) => t.level === level),
  })).filter((g) => g.items.length > 0);

  $: selectedTemplate = selectedTemplateId
    ? templateItems.find((a) => a.id === selectedTemplateId) || null
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
    refreshTemplates().catch((e) => (templateError = e.message || String(e)));
    refreshDatabases().catch((e) => (dbError = e.message || String(e)));
    refreshSharedNotifications().catch(() => {});
    refreshDatasets();
  });

  async function refreshDatasets() {
    datasetsLoading = true;
    datasetError = "";
    try {
      datasets = await listDatasets();
    } catch (e) {
      datasetError = e.message || String(e);
    } finally {
      datasetsLoading = false;
    }
  }

  function openTemplate(a) {
    templateMenuOpenId = null;
    const pendingShareGrantId = $pendingTemplateGrantByResourceId[a.id]?.grant_id || null;
    if (pendingShareGrantId) markSharedGrantProcessed(pendingShareGrantId);
    openTemplateLibraryDetail(a.id);
  }

  function openDatabase(d) {
    dbMenuOpenId = null;
    openDatabaseLibraryDetail(d.id);
  }

  // --- Template handlers ---
  async function handleTemplateFile(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".xlsx", ".xlsm"].includes(ext)) {
      templateError = $_("library.errXlsxOnly");
      return;
    }
    templateError = "";
    try {
      await uploadTemplate(file);
      await refreshTemplates();
    } catch (err) {
      templateError = err.message || String(err);
    }
  }

  function onTemplateDrop(e) {
    e.preventDefault();
    templateDragOver = false;
    handleTemplateFile(e.dataTransfer.files[0]);
  }

  function onTemplatePick(e) {
    handleTemplateFile(e.target.files[0]);
    e.target.value = "";
  }

  function handleCloneTemplate(a) {
    templateMenuOpenId = null;
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
    addToast({ kind: "success", message: $_("library.cloned", { values: { name: a.name } }) });
  }

  async function handleRenameTemplate(a) {
    templateMenuOpenId = null;
    const next = prompt($_("template.renamePrompt"), a.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === a.name) return;
    if (a._clone) {
      clones = clones.map((c) => (c.id === a.id ? { ...c, name } : c));
      return;
    }
    try {
      await renameTemplate(a.id, name);
      await refreshTemplates();
    } catch (e) {
      templateError = e.message || String(e);
    }
  }

  async function handleDeleteTemplate(a) {
    templateMenuOpenId = null;
    if (!confirm($_("template.deleteConfirm", { values: { name: a.name } }))) return;
    if (a._clone) {
      clones = clones.filter((c) => c.id !== a.id);
      return;
    }
    try {
      await deleteTemplate(a.id);
      await refreshTemplates();
      if (selectedTemplateId === a.id) backToLibraryList();
    } catch (e) {
      templateError = e.message || String(e);
    }
  }

  async function handleReindexTemplate(a) {
    templateMenuOpenId = null;
    templateError = "";
    try {
      await reindexTemplate(a.id);
    } catch (e) {
      templateError = e.message || String(e);
    }
  }

  // --- Database handlers ---
  async function handleDbFile(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".sqlite", ".sqlite3", ".db"].includes(ext)) {
      dbError = $_("library.errDbOnly");
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
    const next = prompt($_("library.renameDbPrompt"), d.name);
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
    if (!confirm($_("library.removeDbConfirm", { values: { name: d.name } }))) return;
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
    if (sectionName === "template") {
      templateMenuOpenId = templateMenuOpenId === id ? null : id;
    } else {
      dbMenuOpenId = dbMenuOpenId === id ? null : id;
    }
  }

  function closeMenus() {
    templateMenuOpenId = null;
    dbMenuOpenId = null;
  }
</script>

<svelte:window on:click={closeMenus} />

<div class="library-panel">
  <section class="content">
    {#if section === "datasets"}
      <h2 class="page-title">{$_("library.dataLibraryTitle")}</h2>
      {#if datasetError}<div class="error">{datasetError}</div>{/if}
      {#if datasetsLoading && datasets.length === 0}
        <div class="empty">{$_("library.loadingDatasets")}</div>
      {:else if datasets.length === 0}
        <div class="empty">{$_("library.noDatasets")}</div>
      {/if}
      <div class="dataset-list">
        {#each datasets as d (d.id)}
          <DatasetDetail
            dataset={d}
            pendingShareGrant={$pendingDatasetGrantByResourceId[d.id] || null}
            on:changed={refreshDatasets}
          />
        {/each}
      </div>
    {:else if section === "templates"}
      {#if selectedTemplate}
        <TemplateDetail
          template={selectedTemplate}
          readonly={selectedTemplate.readOnly}
          on:back={backToLibraryList}
          on:clone={() => {
            handleCloneTemplate(selectedTemplate);
            backToLibraryList();
          }}
        />
      {:else}
        <h2 class="page-title">{$_("library.templatesTitle")}</h2>
        {#if templateError}<div class="error">{templateError}</div>{/if}
        {#if $templatesLoading && templateItems.length === 0}
          <div class="empty">{$_("library.loadingTemplates")}</div>
        {:else if templateItems.length === 0}
          <div class="empty">{$_("library.noTemplates")}</div>
        {/if}

        {#each templateGroups as group (group.level)}
          <div class="group">
            <h3 class="group-title">{$_("level." + group.level.toLowerCase())}</h3>
            <div class="grid">
              {#each group.items as a (a.id)}
                {@const chip = chipOf("audit", a.id, $indexingMap, $flashing)}
                {@const pendingShareGrant = $pendingTemplateGrantByResourceId[a.id] || null}
                <div class="card-wrap" class:pending-share={Boolean(pendingShareGrant)}>
                  <div
                    class="card clickable"
                    role="button"
                    tabindex="0"
                    on:click={() => openTemplate(a)}
                    on:keydown={(e) => (e.key === "Enter" || e.key === " ") && openTemplate(a)}
                  >
                    <div class="card-body">
                      <h3>
                        <span class="card-name">{a.name}</span>
                        {#if a.readOnly}<span class="badge readonly">{$_("common.readOnly")}</span>{/if}
                        {#if chip === "indexing"}<span class="badge indexing">{$_("common.indexing")}</span>{/if}
                        {#if chip === "ready"}<span class="badge ready">{$_("common.ready")}</span>{/if}
                        {#if chip === "error"}
                          <span class="badge error" title={errorOf("audit", a.id, $indexingMap)}>{$_("common.error")}</span>
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
                    class:open={templateMenuOpenId === a.id}
                    on:click={(e) => toggleMenu("template", a.id, e)}
                    aria-label={$_("common.options")}
                  >
                    <Icon name="more" />
                  </button>
                  {#if templateMenuOpenId === a.id}
                    <div class="menu">
                      {#if chip === "error"}
                        <button class="menu-item" on:click={() => handleReindexTemplate(a)}>
                          <span class="menu-icon-spacer"></span>{$_("common.tryIndexingAgain")}
                        </button>
                      {/if}
                      {#if a.readOnly}
                        <button class="menu-item" on:click={() => handleCloneTemplate(a)}>
                          <span class="menu-icon-spacer"></span>{$_("common.cloneToLocal")}
                        </button>
                      {:else}
                        <button class="menu-item" on:click={() => handleRenameTemplate(a)}>
                          <Icon name="rename" size={16} />{$_("common.rename")}
                        </button>
                      {/if}
                      {#if !a.readOnly}
                        <button class="menu-item" on:click={() => openShareTemplate(a)}>
                          <Icon name="share" size={16} />{$_("sharing.share")}
                        </button>
                        <button class="menu-item danger" on:click={() => handleDeleteTemplate(a)}>
                          <Icon name="trash" size={16} />{$_("common.delete")}
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
          class:drag-over={templateDragOver}
          on:click={() => templateFileInput && templateFileInput.click()}
          on:drop={onTemplateDrop}
          on:dragover|preventDefault={() => (templateDragOver = true)}
          on:dragleave={() => (templateDragOver = false)}
        >
          <div class="card-body">
            <h3>Add audit template</h3>
            <p>Drop an Excel file (.xlsx) or click to browse</p>
          </div>
        </button>
        <input
          bind:this={templateFileInput}
          type="file"
          accept=".xlsx,.xlsm"
          on:change={onTemplatePick}
          style="display:none"
        />
        -->
      {/if}
    {:else}
      {#if selectedDatabase}
        <DatabaseDetail database={selectedDatabase} on:back={backToLibraryList} />
      {:else}
        <h2 class="page-title">{$_("library.databasesTitle")}</h2>
        {#if dbError}<div class="error">{dbError}</div>{/if}
        {#if $databasesLoading && dbItems.length === 0}
          <div class="empty">{$_("library.loadingDatabases")}</div>
        {:else if dbItems.length === 0}
          <div class="empty">{$_("library.noDatabases")}</div>
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
                    {#if d.readOnly}<span class="badge readonly">{$_("common.readOnly")}</span>{/if}
                    {#if chip === "indexing"}<span class="badge indexing">{$_("common.indexing")}</span>{/if}
                    {#if chip === "ready"}<span class="badge ready">{$_("common.ready")}</span>{/if}
                    {#if chip === "error"}
                      <span class="badge error" title={errorOf("database", d.id, $indexingMap)}>{$_("common.error")}</span>
                    {/if}
                  </h3>
                  <p>{d.description || d.path}</p>
                </div>
              </div>
              <button
                class="menu-btn"
                class:open={dbMenuOpenId === d.id}
                on:click={(e) => toggleMenu("db", d.id, e)}
                aria-label={$_("common.options")}
              >
                <Icon name="more" />
              </button>
              {#if dbMenuOpenId === d.id}
                <div class="menu">
                  {#if chip === "error"}
                    <button class="menu-item" on:click={() => handleReindexDb(d)}>
                      <span class="menu-icon-spacer"></span>{$_("common.tryIndexingAgain")}
                    </button>
                  {/if}
                  <button class="menu-item" on:click={() => handleRenameDb(d)}>
                    <Icon name="rename" size={16} />{$_("common.rename")}
                  </button>
                  <button class="menu-item danger" on:click={() => handleDeleteDb(d)}>
                    <Icon name="trash" size={16} />{$_("common.delete")}
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

{#if shareResource}
  <ShareModal resource={shareResource} on:close={() => (shareResource = null)} />
{/if}

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

  /* Datasets live inline in the library: one expandable box each, stacked. */
  .dataset-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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

  .card-wrap.pending-share {
    background: var(--color-accent-weak);
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
