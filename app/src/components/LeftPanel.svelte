<script>
  import { onMount, tick } from "svelte";
  import {
    audits, currentAuditId, deleteAudit, resetAuditHistory,
  } from "../stores/audits.js";
  import {
    goHome,
    currentView,
    libraryPage,
    openTemplatesLibrary,
    openDatabasesLibrary,
    selectAudit,
  } from "../stores/navigation.js";
  import { resetChatRuntime } from "../stores/chat.js";
  import { authLogout } from "../lib/api.js";
  import { clearAuth } from "../stores/auth.js";
  import { addToast } from "../stores/toasts.js";
  import Icon from "./Icon.svelte";
  import SettingsModal from "./SettingsModal.svelte";
  import FeedbackModal from "./FeedbackModal.svelte";
  import { CONTENT } from "../lib/mock/content/index.js";
  import { _ } from "svelte-i18n";

  // Tracked-dashboard descriptors (§7.1) drive the per-row leading logos and the
  // collapsed-rail logo stack (§4.2/§4.3). Map an audit row to its logo by its id
  // OR templateId, so a freshly created audit (uuid id) also shows its logo.
  const dashboards = CONTENT.dashboards || [];
  function dashboardFor(audit) {
    if (!audit) return undefined;
    return dashboards.find((d) => d.auditId === audit.id || d.auditId === audit.templateId);
  }
  // The collapsed rail shows a logo only for dashboards whose audit EXISTS, so
  // cord-pH appears only once created — not in the base state (Change 1). `openId`
  // is the matching audit's real id to open.
  $: railDashboards = dashboards
    .map((d) => {
      const a = $audits.find((x) => x.id === d.auditId || x.templateId === d.auditId);
      return a ? { logo: d.logo, title: d.title, openId: a.id } : null;
    })
    .filter(Boolean);

  let showSettings = false;
  let showFeedback = false;
  let logoutBusy = false;

  const WIDTH_KEY = "intero.leftPanel.width";
  const COLLAPSED_KEY = "intero.leftPanel.collapsed";
  const MIN = 180;
  const MAX = 480;
  const DEFAULT = 260;

  let width = DEFAULT;
  let collapsed = false;
  let dragging = false;

  // Search-analyses client-side filter.
  let searchOpen = false;
  let query = "";
  let searchInput;

  // Per-row overflow menu + inline rename.
  let menuOpenId = null;
  let renamingId = null;
  let renameValue = "";
  let renameInput;

  onMount(() => {
    const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    if (!Number.isNaN(w)) width = Math.min(MAX, Math.max(MIN, w));
    collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  });

  $: if (typeof localStorage !== "undefined") {
    localStorage.setItem(WIDTH_KEY, String(width));
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }

  $: filtered = query.trim()
    ? $audits.filter((a) =>
        (a.title || "").toLowerCase().includes(query.trim().toLowerCase()),
      )
    : $audits;

  function handleNew() {
    currentAuditId.set(null);
    goHome();
  }

  function handleTemplates() {
    openTemplatesLibrary();
  }

  function handleDatabases() {
    openDatabasesLibrary();
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
    if (collapsed) {
      searchOpen = false;
      menuOpenId = null;
      renamingId = null;
    }
  }

  async function toggleSearch() {
    searchOpen = !searchOpen;
    if (searchOpen) {
      await tick();
      searchInput?.focus();
    } else {
      query = "";
    }
  }

  function onSearchKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      searchOpen = false;
      query = "";
    }
  }

  // Collapse the inline search back to the button only when it's empty.
  function closeSearchIfEmpty() {
    if (!query.trim()) searchOpen = false;
  }

  function startDrag(e) {
    if (collapsed) return;
    dragging = true;
    e.preventDefault();
    const onMove = (ev) => {
      width = Math.min(MAX, Math.max(MIN, ev.clientX));
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function toggleMenu(e, id) {
    e.stopPropagation();
    menuOpenId = menuOpenId === id ? null : id;
  }

  async function startRename(id, title) {
    menuOpenId = null;
    renamingId = id;
    renameValue = title || "";
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function commitRename() {
    if (renamingId == null) return;
    const id = renamingId;
    const next = renameValue.trim();
    renamingId = null;
    if (!next) return;
    // Use the exported writable's update; the store's save subscription persists it.
    audits.update((list) =>
      list.map((a) => (a.id === id ? { ...a, title: next } : a)),
    );
  }

  function cancelRename() {
    renamingId = null;
  }

  function onRenameKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  async function handleDelete(id) {
    menuOpenId = null;
    if (!confirm($_("leftPanel.deleteConfirm"))) {
      return;
    }
    try {
      await deleteAudit(id);
    } catch (err) {
      // Backend delete failed — keep the row so the UI never lies about what's stored.
      addToast({ kind: "error", message: $_("leftPanel.deleteFailed") });
      console.warn("Delete analysis failed:", err);
    }
  }

  function closeMenus() {
    menuOpenId = null;
  }

  async function handleLogout() {
    if (logoutBusy) return;
    logoutBusy = true;
    try {
      await authLogout();
    } catch (err) {
      // Resilient logout: always clear local auth/runtime even if API call fails.
      console.warn("Logout request failed; clearing local auth state anyway.", err);
    } finally {
      showSettings = false;
      showFeedback = false;
      searchOpen = false;
      query = "";
      menuOpenId = null;
      renamingId = null;
      resetChatRuntime();
      resetAuditHistory();
      goHome();
      clearAuth();
      logoutBusy = false;
    }
  }
</script>

<svelte:window on:click={closeMenus} />

<aside
  class="left-panel"
  class:collapsed
  class:dragging
  style="width: {collapsed ? 56 : width}px"
>
  {#if !collapsed}
    <!-- Expanded -->
    <div class="header">
      <span class="logo" aria-label="Intero"><Icon name="logo" /></span>
      <button
        class="icon-btn"
        on:click={toggleCollapsed}
        title={$_("leftPanel.collapseSidebar")}
        aria-label={$_("leftPanel.collapseSidebar")}
      >
        <Icon name="sidebar" />
      </button>
    </div>

    <nav class="menu">
      <button class="menu-row" on:click={handleNew}>
        <Icon name="new" size={18} />
        <span>{$_("leftPanel.newAudit")}</span>
      </button>
      {#if searchOpen}
        <div class="menu-row search-row">
          <Icon name="search" size={18} />
          <input
            class="search-input"
            type="text"
            bind:this={searchInput}
            bind:value={query}
            on:keydown={onSearchKey}
            on:blur={closeSearchIfEmpty}
          />
        </div>
      {:else}
        <button class="menu-row" on:click={toggleSearch}>
          <Icon name="search" size={18} />
          <span>{$_("leftPanel.searchAudits")}</span>
        </button>
      {/if}
      <button
        class="menu-row"
        class:active-link={$currentView === "library" && $libraryPage.section === "templates"}
        on:click={handleTemplates}
      >
        <Icon name="table" size={18} />
        <span>{$_("leftPanel.templates")}</span>
      </button>
      <button
        class="menu-row"
        class:active-link={$currentView === "library" && $libraryPage.section === "databases"}
        on:click={handleDatabases}
      >
        <Icon name="database" size={18} />
        <span>{$_("leftPanel.databases")}</span>
      </button>
    </nav>

    <div class="list">
      {#if filtered.length === 0}
        <div class="empty">
          {query.trim() ? $_("leftPanel.noMatches") : $_("leftPanel.noAudits")}
        </div>
      {:else}
        {#each filtered as audit (audit.id)}
          <div class="row-wrap">
            {#if renamingId === audit.id}
              <input
                class="rename-input"
                type="text"
                bind:this={renameInput}
                bind:value={renameValue}
                on:keydown={onRenameKey}
                on:blur={commitRename}
                on:click|stopPropagation
              />
            {:else}
              <button
                class="item"
                class:active={$currentAuditId === audit.id && $currentView === "results"}
                class:menu-open={menuOpenId === audit.id}
                on:click={() => selectAudit(audit.id)}
                title={audit.title}
              >
                {#if dashboardFor(audit)}
                  <span class="item-logo">
                    <Icon name={dashboardFor(audit).logo} size={16} />
                  </span>
                {/if}
                <span class="title">{audit.title}</span>
                {#if audit.status === "running"}
                  <span class="dot running" title={$_("common.running")} aria-hidden="true" />
                {/if}
              </button>
              <button
                type="button"
                class="more-btn"
                class:open={menuOpenId === audit.id}
                on:click={(e) => toggleMenu(e, audit.id)}
                title={$_("common.more")}
                aria-label={$_("common.moreOptions")}
              >
                <Icon name="more" size={18} />
              </button>

              {#if menuOpenId === audit.id}
                <div class="menu-pop" on:click|stopPropagation>
                  <button
                    class="pop-item"
                    on:click={() => startRename(audit.id, audit.title)}
                  >
                    <Icon name="rename" size={16} />
                    <span>{$_("common.rename")}</span>
                  </button>
                  <button
                    class="pop-item danger"
                    on:click={() => handleDelete(audit.id)}
                  >
                    <Icon name="trash" size={16} />
                    <span>{$_("common.delete")}</span>
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="footer">
      <button class="menu-row" on:click={() => (showFeedback = true)}>
        <Icon name="feedback" size={18} />
        <span>{$_("leftPanel.feedback")}</span>
      </button>
      <button class="menu-row" on:click={() => (showSettings = true)}>
        <Icon name="settings" size={18} />
        <span>{$_("leftPanel.settings")}</span>
      </button>
      <button class="menu-row" on:click={handleLogout} disabled={logoutBusy}>
        <Icon name="logout" size={18} />
        <span>{logoutBusy ? $_("leftPanel.signingOut") : $_("leftPanel.signOut")}</span>
      </button>
    </div>

    <div
      class="resizer"
      class:active={dragging}
      role="separator"
      aria-orientation="vertical"
      on:mousedown={startDrag}
      on:dblclick={() => (width = DEFAULT)}
      title="Drag to resize, double-click to reset"
    />
  {:else}
    <!-- Collapsed rail -->
    <div class="rail">
      <button
        class="icon-btn rail-logo"
        on:click={toggleCollapsed}
        title={$_("leftPanel.expandSidebar")}
        aria-label={$_("leftPanel.expandSidebar")}
      >
        <span class="logo-default"><Icon name="logo" /></span>
        <span class="logo-hover"><Icon name="sidebar" /></span>
      </button>
      <button class="icon-btn" on:click={handleNew} title={$_("leftPanel.newAudit")} aria-label={$_("leftPanel.newAudit")}>
        <Icon name="new" />
      </button>
      <button
        class="icon-btn"
        on:click={() => { collapsed = false; toggleSearch(); }}
        title={$_("leftPanel.searchAudits")}
        aria-label={$_("leftPanel.searchAudits")}
      >
        <Icon name="search" />
      </button>
      <button
        class="icon-btn"
        class:rail-active={$currentView === "library" && $libraryPage.section === "templates"}
        on:click={handleTemplates}
        title={$_("leftPanel.templates")}
        aria-label={$_("leftPanel.templates")}
      >
        <Icon name="table" />
      </button>
      <button
        class="icon-btn"
        class:rail-active={$currentView === "library" && $libraryPage.section === "databases"}
        on:click={handleDatabases}
        title={$_("leftPanel.databases")}
        aria-label={$_("leftPanel.databases")}
      >
        <Icon name="database" />
      </button>

      {#if railDashboards.length}
        <div class="rail-dashboards">
          {#each railDashboards as d (d.openId)}
            <button
              class="icon-btn"
              on:click={() => selectAudit(d.openId)}
              title={d.title}
              aria-label={d.title}
            >
              <Icon name={d.logo} />
            </button>
          {/each}
        </div>
      {/if}

      <button
        class="icon-btn rail-feedback"
        on:click={() => (showFeedback = true)}
        title={$_("leftPanel.feedback")}
        aria-label={$_("leftPanel.feedback")}
      >
        <Icon name="feedback" />
      </button>
      <button
        class="icon-btn rail-settings"
        on:click={() => (showSettings = true)}
        title={$_("leftPanel.settings")}
        aria-label={$_("leftPanel.settings")}
      >
        <Icon name="settings" />
      </button>
      <button
        class="icon-btn"
        on:click={handleLogout}
        title={logoutBusy ? $_("leftPanel.signingOut") : $_("leftPanel.signOut")}
        aria-label={$_("leftPanel.signOut")}
        disabled={logoutBusy}
      >
        <Icon name="logout" />
      </button>
    </div>
  {/if}
</aside>

{#if showSettings}
  <SettingsModal on:close={() => (showSettings = false)} />
{/if}

{#if showFeedback}
  <FeedbackModal on:close={() => (showFeedback = false)} />
{/if}

<style>
  .left-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-sidebar);
    border-right: 1px solid var(--color-border);
    height: 100vh;
    min-height: 0;
    flex-shrink: 0;
    transition: width var(--dur) var(--ease);
  }

  .left-panel.dragging {
    transition: none;
    user-select: none;
  }

  /* Header (expanded) */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3);
    flex-shrink: 0;
    min-height: 52px;
    box-sizing: border-box;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text);
    width: var(--icon-lg);
    height: var(--icon-lg);
  }

  /* Icon button (ghost, square) — §3.1 */
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .icon-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .icon-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .icon-btn.rail-active {
    background: var(--color-hover);
    color: var(--color-text);
  }

  /* Menu rows (New / Search / Settings) — §6.2 ghost rows */
  .menu {
    padding: 0 var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .menu-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-2);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text);
    transition: background var(--dur-fast) var(--ease);
  }

  .menu-row:hover {
    background: var(--color-hover);
  }

  .menu-row:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .menu-row.active-link {
    background: var(--color-hover);
  }

  .menu-row :global(.icon) {
    color: var(--color-text-secondary);
  }

  /* Inline search: the "Search analyses" row becomes a borderless,
     transparent input in place — same text format as the label. The row
     keeps the gray box while active so it reads as the focused control. */
  .search-row {
    cursor: text;
    background: transparent;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text);
  }

  .search-input:focus {
    outline: none;
    border: none;
    box-shadow: none;
  }

  .search-input::placeholder {
    color: var(--color-text);
    opacity: 1;
  }

  .rename-input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  .rename-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-weak);
  }

  /* Analyses list */
  .list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    padding: var(--space-6) var(--space-3);
  }

  .row-wrap {
    position: relative;
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-2);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: background var(--dur-fast) var(--ease);
  }

  .item:hover,
  .item.active,
  .item.menu-open {
    background: var(--color-hover);
  }

  /* Leading dashboard logo on tracked-dashboard rows (§4.2). The `.item` flex
     row + its existing gap handle the spacing; keep the glyph from shrinking. */
  .item-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }

  .title {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
  }

  .dot.running {
    background: var(--color-warning);
    animation: pulse 1.4s ease-in-out infinite;
  }

  .row-wrap:hover .dot.running {
    display: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* `more` button — revealed on row hover (ChatGPT style) */
  .more-btn {
    position: absolute;
    top: 50%;
    right: var(--space-1);
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .row-wrap:hover .more-btn,
  .more-btn.open {
    opacity: 1;
    pointer-events: auto;
  }

  .more-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  /* Reserve space for the more-btn only while it is visible, so the name
     truncates instead of sliding under the button. */
  .row-wrap:hover .title,
  .item.menu-open .title {
    padding-right: 22px;
  }

  /* Overflow menu — §3.5 */
  .menu-pop {
    position: absolute;
    top: calc(100% - 2px);
    right: var(--space-2);
    z-index: 20;
    min-width: 140px;
    padding: var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pop-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-2);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    transition: background var(--dur-fast) var(--ease);
  }

  .pop-item:hover {
    background: var(--color-hover);
  }

  .pop-item.danger {
    color: var(--color-danger);
  }

  .pop-item.danger:hover {
    background: var(--color-danger-weak);
  }

  /* Footer */
  .footer {
    padding: var(--space-2);
    flex-shrink: 0;
  }

  /* Collapsed rail */
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    flex: 1;
    min-height: 0;
  }

  /* Rail logo doubles as the expand control: shows the eye at rest and
     swaps to the `sidebar` toggle icon on hover. */
  .rail-logo {
    color: var(--color-text);
    margin-bottom: var(--space-1);
  }

  .rail-logo .logo-default,
  .rail-logo .logo-hover {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .rail-logo .logo-hover {
    display: none;
  }

  .rail-logo:hover .logo-default {
    display: none;
  }

  .rail-logo:hover .logo-hover {
    display: inline-flex;
  }

  /* Collapsed-rail dashboard logo stack (§4.3): below the fixed nav icons,
     visually separated by a hairline divider, above the pinned controls. */
  .rail-dashboards {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding-top: var(--space-2);
    margin-top: var(--space-1);
    border-top: 1px solid var(--color-border);
  }

  .rail-dashboards .icon-btn {
    color: var(--color-text);
  }

  .rail-feedback {
    margin-top: auto;
  }

  /* Resizer */
  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    background: transparent;
    transition: background var(--dur-fast) var(--ease);
  }

  .resizer:hover,
  .resizer.active {
    background: var(--color-accent);
  }
</style>
