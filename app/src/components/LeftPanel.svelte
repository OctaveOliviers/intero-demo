<script>
  import { onMount, tick } from "svelte";
  import { currentPopulatedTableId, resetPopulatedTableHistory } from "../stores/populatedTables.js";
  import {
    goHome,
    currentView,
    libraryPage,
    openTemplatesLibrary,
    openDatabasesLibrary,
    openSettings,
    openDataLibrary,
    openThreadView,
  } from "../stores/navigation.js";
  import {
    startNewChat,
    threads,
    refreshThreads,
    openThread,
    removeThread,
    renameThread,
    currentThreadId,
    pendingNewChat,
    sending,
    filterThreads,
    resetThreads,
  } from "../stores/threads.js";
  import { threadDotState } from "../stores/threadDotState.js";
  import {
    resetTables,
  } from "../stores/tables.js";
  import { authStatus } from "../stores/auth.js";
  import {
    hasPendingDatasetShares,
    refreshSharedNotifications,
  } from "../stores/sharedNotifications.js";
  import { resetChatRuntime } from "../stores/chat.js";
  import { authLogout } from "../lib/api.js";
  import { isMockMode } from "../lib/mock.js";
  import { clearAuth } from "../stores/auth.js";
  import { attachmentTypeIcon } from "../lib/attachmentTypes.js";
  import {
    ARTIFACT_WORKSPACE_STATES,
    ARTIFACT_WORKSPACE_THREAD_ID,
    visibleDemoArtifacts,
  } from "../lib/artifactWorkspaceDemo.js";
  import { artifactWorkspaceDemoState, openDemoPinnedArtifact } from "../stores/artifactWorkspaceDemo.js";
  import Icon from "./Icon.svelte";
  import SidebarItem from "./SidebarItem.svelte";
  import FeedbackModal from "./FeedbackModal.svelte";
  import { _ } from "svelte-i18n";

  let showFeedback = false;
  let logoutBusy = false;
  const showDatabasesNav = !isMockMode("databases");
  // The mock's seeded inbound shares are long-accepted history, not news — no
  // notification dot for them in the demo.
  const showShareDots = !isMockMode("grants");
  // The demo starts clean: the Lung MOC chat appears in the sidebar only once
  // the streamed opening has been triggered (a "moc" message from a New chat
  // starts the run). An artifact shows under PINNED ARTIFACTS only when the
  // doctor pins it from the tray's three-dot menu — never automatically.
  $: demoStarted = $artifactWorkspaceDemoState.runStatus !== "idle";
  $: pinnedArtifacts = demoStarted
    ? visibleDemoArtifacts($artifactWorkspaceDemoState).filter(
        (artifact) => artifact.kind !== "inline_analysis" && artifact.pinned,
      )
    : [];
  $: hideResizer =
    $currentView === "thread" &&
    $currentThreadId === ARTIFACT_WORKSPACE_THREAD_ID &&
    $artifactWorkspaceDemoState.workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED;

  const WIDTH_KEY = "intero.leftPanel.width";
  const COLLAPSED_KEY = "intero.leftPanel.collapsed";
  const MIN = 180;
  const MAX = 480;
  const DEFAULT = 260;

  let width = DEFAULT;
  let collapsed = false;
  let dragging = false;

  // The single top search bar — one query that filters BOTH the Tables and the
  // Chats sections by title (case-insensitive); empty shows all.
  let searchOpen = false;
  let query = "";
  let searchInput;

  // A SINGLE "which row menu is open" state for chat rows, so opening any row's
  // menu closes any other and the window-click closeMenus clears it.
  let openMenuKey = null;
  const chatKey = (id) => `chat:${id}`;
  function toggleMenu(key) {
    openMenuKey = openMenuKey === key ? null : key;
  }

  // Populate the Tables + Threads sections once authenticated (and re-populate on
  // a user change). Reuses the stores' existing refresh actions — no polling. The
  // thread store already refreshes its own list on send/new/delete.
  let sectionsLoadedFor = null;
  $: if ($authStatus === "authenticated" && sectionsLoadedFor !== "authenticated") {
    sectionsLoadedFor = "authenticated";
    void refreshThreads();
    void refreshSharedNotifications();
  } else if ($authStatus !== "authenticated") {
    sectionsLoadedFor = null;
  }

  // The single top search filters chats by title (case-insensitive); pinned
  // artifacts remain visible as quick access. The (pre-seeded) demo thread is
  // held back until the demo run has been triggered.
  $: filteredThreads = filterThreads($threads, query).filter(
    (thread) => demoStarted || thread.id !== ARTIFACT_WORKSPACE_THREAD_ID,
  );

  onMount(() => {
    const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    if (!Number.isNaN(w)) width = Math.min(MAX, Math.max(MIN, w));
    collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  });

  $: if (typeof localStorage !== "undefined") {
    localStorage.setItem(WIDTH_KEY, String(width));
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }

  // Publish the panel's rendered width + collapsed state so content areas can
  // pick their centering reference — see ThreadView's .thread-col: panel OPEN
  // → the chat centers on the SCREEN; panel folded → on the main area.
  $: if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--left-panel-width", `${collapsed ? 56 : width}px`);
    document.documentElement.classList.toggle("left-panel-collapsed", collapsed);
  }

  // Open a fresh chat — the thread conversation surface (UI label "New chat";
  // "thread" stays the backend/domain term). This is the single primary entry
  // (it replaces the old "New audit"): a chat can produce a table, so populated tables are
  // created through it. Switch to the thread view and open the PENDING landing —
  // NO thread is persisted until the first message is sent (startNewChat just
  // clears the open thread + flags the landing; sendFirstMessage mints it).
  function handleNewChat() {
    currentPopulatedTableId.set(null);
    openThreadView();
    startNewChat();
  }

  // Open a chat from the Threads section: load the thread FIRST, then route to the
  // chat surface — so selecting a chat never flashes the new-chat landing or the
  // previously-open chat while getThread is still awaiting (Bug A). openThread
  // clears the pending landing up front; the view switch waits for the load.
  async function handleOpenThread(id) {
    // Guard against switching threads mid-send: a send disables the composer but
    // the chat rows stay clickable, so without this a click during $sending could
    // race the in-flight post (the store also drops stale post-await writes, but
    // blocking the switch here keeps the send landing in the thread it began in).
    if ($sending) return;
    await openThread(id);
    openThreadView();
  }

  async function handleOpenPinnedArtifact(id) {
    if ($sending) return;
    await openThread(ARTIFACT_WORKSPACE_THREAD_ID);
    openThreadView();
    openDemoPinnedArtifact(id);
  }

  function handleTemplates() {
    void refreshSharedNotifications({ force: true });
    openTemplatesLibrary();
  }

  function handleDatabases() {
    openDatabasesLibrary();
  }

  function handleDataLibrary() {
    void refreshSharedNotifications({ force: true });
    openDataLibrary();
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
    if (collapsed) {
      searchOpen = false;
      openMenuKey = null;
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

  function closeMenus() {
    openMenuKey = null;
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
      showFeedback = false;
      searchOpen = false;
      query = "";
      openMenuKey = null;
      resetChatRuntime();
      resetPopulatedTableHistory();
      // Clear the previous user's thread + table state so it doesn't stay
      // resident for the next sign-in on this tab (the fresh-chat landing fires
      // again via App.svelte's chatDefaulted reset on the auth gate).
      resetThreads();
      resetTables();
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
      <button
        class="menu-row"
        class:active-link={$currentView === "thread" && $pendingNewChat}
        on:click={handleNewChat}
        disabled={$sending}
      >
        <Icon name="new" size={18} />
        <span>{$_("leftPanel.newChat")}</span>
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
          <span>{$_("leftPanel.search")}</span>
        </button>
      {/if}
      <button
        class="menu-row"
        class:active-link={$currentView === "library" && $libraryPage.section === "datasets"}
        on:click={handleDataLibrary}
      >
        <Icon name={attachmentTypeIcon("dataset")} size={18} />
        <span class="menu-label">{$_("leftPanel.dataLibrary")}</span>
        {#if showShareDots && $hasPendingDatasetShares}
          <span class="nav-dot" title={$_("leftPanel.newSharedDataset")} aria-hidden="true" />
        {/if}
      </button>
      <button
        class="menu-row"
        class:active-link={$currentView === "library" && $libraryPage.section === "templates"}
        on:click={handleTemplates}
      >
        <Icon name={attachmentTypeIcon("template")} size={18} />
        <span class="menu-label">{$_("leftPanel.templates")}</span>
      </button>
      {#if showDatabasesNav}
        <button
          class="menu-row"
          class:active-link={$currentView === "library" && $libraryPage.section === "databases"}
          on:click={handleDatabases}
        >
          <Icon name="database" size={18} />
          <span>{$_("leftPanel.databases")}</span>
        </button>
      {/if}
    </nav>

    <div class="list">
      {#if pinnedArtifacts.length}
        <div class="section">
          <div class="section-head">
            <span class="section-title">{$_("leftPanel.pinnedArtifacts")}</span>
          </div>
          {#each pinnedArtifacts as artifact (artifact.id)}
            <button class="artifact-link" type="button" on:click={() => handleOpenPinnedArtifact(artifact.id)}>
              <Icon name={artifact.kind === "table" ? "table" : "chart"} size={16} />
              <span>{artifact.title}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Threads section: the chats, recency order. The single top search filters
           this list by title; click opens the chat surface; a per-row delete
           removes the chat (behind the row-menu affordance). -->
      <div class="section">
        <div class="section-head">
          <span class="section-title">{$_("leftPanel.threads")}</span>
        </div>
        {#if filteredThreads.length === 0}
          <div class="empty">
            {query.trim() ? $_("leftPanel.noChatMatches") : $_("leftPanel.noChats")}
          </div>
        {:else}
          {#each filteredThreads as thread (thread.id)}
            <SidebarItem
              title={thread.title}
              active={$currentThreadId === thread.id && $currentView === "thread"}
              dot={threadDotState(thread)}
              menuOpen={openMenuKey === chatKey(thread.id)}
              deleteConfirm={$_("leftPanel.deleteChatConfirm")}
              onOpen={() => handleOpenThread(thread.id)}
              onToggleMenu={() => toggleMenu(chatKey(thread.id))}
              onRename={(next) => renameThread(thread.id, next)}
              onDelete={() => removeThread(thread.id)}
            />
          {/each}
        {/if}
      </div>
    </div>

    <div class="footer">
      <button class="menu-row" on:click={() => (showFeedback = true)}>
        <Icon name="feedback" size={18} />
        <span>{$_("leftPanel.feedback")}</span>
      </button>
      <button class="menu-row" on:click={openSettings}>
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
      class:hidden={hideResizer}
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
      <button
        class="icon-btn"
        class:rail-active={$currentView === "thread" && $pendingNewChat}
        on:click={() => { collapsed = false; handleNewChat(); }}
        title={$_("leftPanel.newChat")}
        aria-label={$_("leftPanel.newChat")}
        disabled={$sending}
      >
        <Icon name="new" />
      </button>
      <button
        class="icon-btn"
        on:click={() => { collapsed = false; toggleSearch(); }}
        title={$_("leftPanel.search")}
        aria-label={$_("leftPanel.search")}
      >
        <Icon name="search" />
      </button>
      <button
        class="icon-btn"
        class:rail-active={$currentView === "library" && $libraryPage.section === "datasets"}
        on:click={handleDataLibrary}
        title={$_("leftPanel.dataLibrary")}
        aria-label={$_("leftPanel.dataLibrary")}
      >
        <Icon name={attachmentTypeIcon("dataset")} />
        {#if showShareDots && $hasPendingDatasetShares}
          <span class="rail-dot" title={$_("leftPanel.newSharedDataset")} aria-hidden="true" />
        {/if}
      </button>
      <button
        class="icon-btn"
        class:rail-active={$currentView === "library" && $libraryPage.section === "templates"}
        on:click={handleTemplates}
        title={$_("leftPanel.templates")}
        aria-label={$_("leftPanel.templates")}
      >
        <Icon name={attachmentTypeIcon("template")} />
      </button>
      {#if showDatabasesNav}
        <button
          class="icon-btn"
          class:rail-active={$currentView === "library" && $libraryPage.section === "databases"}
          on:click={handleDatabases}
          title={$_("leftPanel.databases")}
          aria-label={$_("leftPanel.databases")}
        >
          <Icon name="database" />
        </button>
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
        on:click={openSettings}
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

{#if showFeedback}
  <FeedbackModal on:close={() => (showFeedback = false)} />
{/if}

<style>
  .left-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-right: 0;
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
    padding: var(--space-6) var(--space-3) var(--space-3);
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
    position: relative;
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

  .menu-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-dot,
  .rail-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    flex-shrink: 0;
  }

  .nav-dot {
    margin-left: auto;
  }

  .rail-dot {
    position: absolute;
    top: 7px;
    right: 7px;
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

  /* Artifacts / Chats list */
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

  /* Artifacts / Threads sections — quiet labeled groups in the scroll region. */
  .section {
    margin-top: var(--space-3);
    padding-top: var(--space-1);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .section-head {
    display: flex;
    align-items: center;
    padding: 0 var(--space-2) var(--space-1);
  }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .artifact-link {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    color: var(--color-text);
    text-align: left;
    font-size: var(--text-sm);
  }

  .artifact-link:hover,
  .artifact-link:focus-visible {
    background: var(--color-hover);
  }

  .artifact-link :global(.icon) {
    color: var(--color-text-secondary);
  }

  .artifact-link span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The Tables/Chats rows themselves — title button, status dot, more-btn,
     menu-pop, and inline rename — live in the shared SidebarItem component. */

  /* Footer */
  .footer {
    padding: var(--space-2) var(--space-2) var(--space-6);
    flex-shrink: 0;
  }

  /* Collapsed rail */
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) 0;
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

  .rail-feedback {
    margin-top: auto;
  }

  /* Resizer */
  .resizer {
    position: absolute;
    top: var(--space-6);
    right: 0;
    bottom: var(--space-6);
    width: 1px;
    height: auto;
    cursor: col-resize;
    z-index: 10;
    background: var(--color-border);
    transition: background var(--dur-fast) var(--ease);
  }

  .resizer::before {
    content: "";
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    left: -4px;
  }

  .resizer:hover,
  .resizer.active {
    background: var(--color-border-strong);
  }

  .resizer.hidden {
    opacity: 0;
    pointer-events: none;
  }
</style>
