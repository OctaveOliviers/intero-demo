<script>
  import { _ } from "svelte-i18n";
  import Icon from "./Icon.svelte";
  import { LOCALES, ACTIVE_LOCALE, setLocale } from "../i18n/index.js";
  import { userRole } from "../stores/auth.js";
  import { listIamUsers, listDatabases, uploadDatabase, renameDatabase, deleteDatabase, reindexDatabase } from "../lib/api.js";
  import { addToast } from "../stores/toasts.js";
  import {
    visibleSettingsSections,
    SECTION_GENERAL,
    SECTION_USERS_ROLES,
    SECTION_SOURCE_DATABASES,
  } from "../lib/settingsSections.js";

  // Section visibility is driven entirely by the role from `userRole` (the
  // `GET /api/auth/me` `role`, §13). A clinician/agent/null gets ONLY General —
  // the admin sub-nav items and panes are ABSENT (never rendered), matching the
  // server 403 on their endpoints. A pure helper keeps the decision testable.
  $: sections = visibleSettingsSections($userRole);

  // Keep the active section valid as the role resolves (e.g. if the role lands
  // after mount and the admin sections appear/disappear). Default to General.
  let active = SECTION_GENERAL;
  $: if (!sections.includes(active)) active = SECTION_GENERAL;

  const SECTION_LABELS = {
    [SECTION_GENERAL]: "settings.general",
    [SECTION_USERS_ROLES]: "settings.usersRoles",
    [SECTION_SOURCE_DATABASES]: "settings.sourceDatabases",
  };
  const SECTION_ICONS = {
    [SECTION_GENERAL]: "settings",
    [SECTION_USERS_ROLES]: "eye",
    [SECTION_SOURCE_DATABASES]: "database",
  };

  function chooseLocale(code) {
    // Persists the choice and reloads so both the UI and demo data come back in
    // the new language; a no-op when already active.
    setLocale(code);
  }

  // --- Users & roles (admin-only, read-only) -------------------------------
  let users = [];
  let usersLoading = false;
  let usersError = "";

  async function loadUsers() {
    usersLoading = true;
    usersError = "";
    try {
      users = await listIamUsers();
    } catch (err) {
      usersError = err?.message || $_("settings.usersLoadError");
    } finally {
      usersLoading = false;
    }
  }

  // --- Source databases (admin-only) ---------------------------------------
  let databases = [];
  let dbLoading = false;
  let dbError = "";
  let dbFileInput;

  async function loadDatabases() {
    dbLoading = true;
    dbError = "";
    try {
      databases = await listDatabases();
    } catch (err) {
      dbError = err?.message || $_("settings.databasesLoadError");
    } finally {
      dbLoading = false;
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await uploadDatabase(file);
      addToast({ kind: "success", message: $_("settings.uploadStarted") });
      await loadDatabases();
    } catch (err) {
      addToast({ kind: "error", message: err?.message || $_("settings.uploadFailed") });
    }
  }

  async function handleRename(db) {
    const name = (window.prompt($_("settings.renamePrompt"), db.name) || "").trim();
    if (!name || name === db.name) return;
    try {
      await renameDatabase(db.id, name);
      await loadDatabases();
    } catch (err) {
      addToast({ kind: "error", message: err?.message || $_("settings.renameFailed") });
    }
  }

  async function handleReindex(db) {
    try {
      await reindexDatabase(db.id);
      addToast({ kind: "success", message: $_("settings.reindexStarted") });
      await loadDatabases();
    } catch (err) {
      addToast({ kind: "error", message: err?.message || $_("settings.reindexFailed") });
    }
  }

  async function handleDelete(db) {
    if (!window.confirm($_("settings.deleteConfirm"))) return;
    try {
      await deleteDatabase(db.id);
      await loadDatabases();
    } catch (err) {
      addToast({ kind: "error", message: err?.message || $_("settings.deleteFailed") });
    }
  }

  // Lazy-load each admin section's data the first time it becomes active, and
  // only if the role is allowed to see it (the section won't appear otherwise).
  let usersLoaded = false;
  let databasesLoaded = false;
  $: if (active === SECTION_USERS_ROLES && !usersLoaded) {
    usersLoaded = true;
    loadUsers();
  }
  $: if (active === SECTION_SOURCE_DATABASES && !databasesLoaded) {
    databasesLoaded = true;
    loadDatabases();
  }
</script>

<div class="settings-page">
  <nav class="subnav" aria-label={$_("settings.title")}>
    <h1 class="subnav-title">{$_("settings.title")}</h1>
    {#each sections as section (section)}
      <button
        class="nav-item"
        class:active={active === section}
        on:click={() => (active = section)}
      >
        <Icon name={SECTION_ICONS[section]} size={18} />
        <span>{$_(SECTION_LABELS[section])}</span>
      </button>
    {/each}
  </nav>

  <section class="content">
    {#if active === SECTION_GENERAL}
      <h2 class="page-title">{$_("settings.general")}</h2>
      <div class="group">
        <h3 class="group-title">{$_("settings.language")}</h3>
        <div class="lang-list" role="radiogroup" aria-label={$_("settings.language")}>
          {#each LOCALES as l (l.code)}
            <button
              class="lang-row"
              class:selected={l.code === ACTIVE_LOCALE}
              role="radio"
              aria-checked={l.code === ACTIVE_LOCALE}
              on:click={() => chooseLocale(l.code)}
            >
              <span class="lang-name">{l.label}</span>
              {#if l.code === ACTIVE_LOCALE}
                <span class="check" aria-hidden="true"><Icon name="check" size={16} /></span>
              {/if}
            </button>
          {/each}
        </div>
        <p class="hint">{$_("settings.languageHint")}</p>
      </div>

    {:else if active === SECTION_USERS_ROLES}
      <h2 class="page-title">{$_("settings.usersRoles")}</h2>
      <p class="hint managed-note">{$_("settings.managedByIt")}</p>
      {#if usersError}
        <div class="error">{usersError}</div>
      {:else if usersLoading}
        <div class="empty">{$_("settings.loadingUsers")}</div>
      {:else if users.length === 0}
        <div class="empty">{$_("settings.noUsers")}</div>
      {:else}
        <table class="users-table">
          <thead>
            <tr>
              <th>{$_("settings.colName")}</th>
              <th>{$_("settings.colUsername")}</th>
              <th>{$_("settings.colRole")}</th>
              <th>{$_("settings.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {#each users as u (u.id)}
              <tr>
                <td>{u.display_name || u.username}</td>
                <td class="muted">{u.username}</td>
                <td><span class="badge role role-{u.role}">{u.role}</span></td>
                <td>
                  {#if !u.is_active}
                    <span class="badge status inactive">{$_("settings.statusInactive")}</span>
                  {:else if u.must_reset_password}
                    <span class="badge status pending">{$_("settings.statusResetPending")}</span>
                  {:else}
                    <span class="badge status active">{$_("settings.statusActive")}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    {:else if active === SECTION_SOURCE_DATABASES}
      <div class="section-head">
        <h2 class="page-title">{$_("settings.sourceDatabases")}</h2>
        <button class="primary-btn" on:click={() => dbFileInput?.click()}>
          <Icon name="new" size={16} />
          <span>{$_("settings.uploadDatabase")}</span>
        </button>
        <input
          class="hidden-file"
          type="file"
          accept=".sqlite,.sqlite3,.db"
          bind:this={dbFileInput}
          on:change={handleUpload}
        />
      </div>
      {#if dbError}
        <div class="error">{dbError}</div>
      {:else if dbLoading}
        <div class="empty">{$_("settings.loadingDatabases")}</div>
      {:else if databases.length === 0}
        <div class="empty">{$_("settings.noDatabases")}</div>
      {:else}
        <table class="users-table">
          <thead>
            <tr>
              <th>{$_("settings.colName")}</th>
              <th>{$_("settings.colStatus")}</th>
              <th class="actions-col">{$_("common.options")}</th>
            </tr>
          </thead>
          <tbody>
            {#each databases as db (db.id)}
              <tr>
                <td>{db.name}</td>
                <td>
                  {#if db.status === "indexing"}
                    <span class="badge status pending">{$_("common.indexing")}</span>
                  {:else if db.status === "error"}
                    <span class="badge status inactive">{$_("common.error")}</span>
                  {:else}
                    <span class="badge status active">{$_("common.ready")}</span>
                  {/if}
                </td>
                <td class="actions-col">
                  {#if db.status === "error"}
                    <button class="link-btn" on:click={() => handleReindex(db)}>{$_("common.tryIndexingAgain")}</button>
                  {/if}
                  <button class="link-btn" on:click={() => handleRename(db)}>{$_("common.rename")}</button>
                  <button class="link-btn danger" on:click={() => handleDelete(db)}>{$_("common.delete")}</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>
</div>

<style>
  .settings-page {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: 100%;
    min-height: 0;
  }

  .subnav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-5) var(--space-3);
    border-right: 1px solid var(--color-border);
  }

  .subnav-title {
    margin: 0 0 var(--space-3) var(--space-2);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .nav-item:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .nav-item.active {
    background: var(--color-accent-weak);
    border-color: var(--color-accent-border);
    color: var(--color-text);
    font-weight: var(--weight-medium);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    overflow-y: auto;
    min-width: 0;
  }

  .page-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 460px;
  }

  .group-title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .lang-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .lang-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }

  .lang-row:hover {
    background: var(--color-hover);
  }

  .lang-row.selected {
    background: var(--color-accent-weak);
    border-color: var(--color-accent-border);
  }

  .lang-name {
    font-weight: var(--weight-medium);
  }

  .check {
    display: inline-flex;
    color: var(--color-accent);
  }

  .hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .managed-note {
    font-size: var(--text-sm);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .users-table th {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
  }

  .users-table td {
    padding: var(--space-3);
    color: var(--color-text);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .users-table td.muted {
    color: var(--color-text-secondary);
  }

  .actions-col {
    text-align: right;
    white-space: nowrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    border: 1px solid var(--color-border);
  }

  .badge.role {
    text-transform: capitalize;
  }

  .badge.role-admin {
    background: var(--color-accent-weak);
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }

  .badge.status.active {
    color: var(--color-text-secondary);
  }

  .badge.status.pending {
    background: var(--color-accent-weak);
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }

  .badge.status.inactive {
    color: var(--color-text-muted);
  }

  .empty,
  .error {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    padding: var(--space-3) 0;
  }

  .error {
    color: var(--color-danger);
  }

  .primary-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    transition: background var(--dur-fast) var(--ease);
  }

  .primary-btn:hover {
    background: var(--color-hover);
  }

  .link-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .link-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .link-btn.danger:hover {
    color: var(--color-danger);
  }

  .hidden-file {
    display: none;
  }
</style>
