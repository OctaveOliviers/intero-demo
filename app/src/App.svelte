<script>
  import { onMount } from "svelte";
  import { listMyTablePopulations } from "./lib/api.js";
  import { isMockMode } from "./lib/mock.js";
  import { seededDashboardPopulatedTableRecords } from "./lib/mockData.js";
  import {
    mergeServerTablePopulationHistory,
    seedMockDashboardRecords,
  } from "./stores/populatedTables.js";
  import { resultViewUiState } from "./stores/resultViewUi.js";
  import { currentView, openThreadView } from "./stores/navigation.js";
  import { startNewChat } from "./stores/threads.js";
  import { authStatus, authUser, bootstrapSession, setAuthenticated } from "./stores/auth.js";
  import LeftPanel from "./components/LeftPanel.svelte";
  import Login from "./components/Login.svelte";
  import MainPanel from "./components/MainPanel.svelte";
  import RightPanel from "./components/RightPanel.svelte";
  import Toasts from "./components/Toasts.svelte";
  import { startIndexingSubscription } from "./stores/indexing.js";
  import { _ } from "svelte-i18n";

  let indexingStarted = false;
  let chatDefaulted = false;
  let historyHydratingFor = null;
  let pendingHistoryUserKey = null;
  let lastHistoryUserKey = null;

  let rightPanelWidth = 380;
  let isResizing = false;

  onMount(() => {
    bootstrapSession();
  });

  $: if ($authStatus === "authenticated" && !indexingStarted) {
    startIndexingSubscription();
    indexingStarted = true;
  }

  // Default landing = a fresh chat (the user's choice). On first sign-in, switch
  // to the chat view and open
  // the PENDING landing (the clean centered composer) — NO thread is persisted
  // until the first message is sent (startNewChat just flags the landing;
  // sendFirstMessage mints the thread).
  $: if ($authStatus === "authenticated" && !chatDefaulted) {
    chatDefaulted = true;
    openThreadView();
    startNewChat();
  }

  // Reset the one-shot fresh-chat flag when the session ends, so the next user
  // signing in on this same tab gets the intended clean-composer landing instead
  // of inheriting chatDefaulted=true (which would skip startNewChat and drop them
  // on home). LeftPanel.handleLogout clears the previous user's thread/table state.
  $: if ($authStatus === "unauthenticated" && chatDefaulted) {
    chatDefaulted = false;
  }

  async function hydrateHistoryForUser(userKey) {
    if (!userKey) return;
    if (historyHydratingFor) {
      pendingHistoryUserKey = userKey;
      return;
    }
    historyHydratingFor = userKey;
    try {
      const rows = await listMyTablePopulations();
      const activeUserKey = $authUser?.id || $authUser?.username || null;
      // Ignore stale responses from a previous user session.
      if ($authStatus === "authenticated" && activeUserKey === userKey) {
        mergeServerTablePopulationHistory(rows);
      }
    } catch (err) {
      // Non-fatal for app shell; keep local history and continue.
      console.warn("Could not hydrate table-population history:", err);
    } finally {
      historyHydratingFor = null;
      const queued = pendingHistoryUserKey;
      pendingHistoryUserKey = null;
      const activeUserKey = $authUser?.id || $authUser?.username || null;
      if (queued && queued === activeUserKey && $authStatus === "authenticated") {
        void hydrateHistoryForUser(queued);
      }
    }
  }

  $: {
    const userKey = $authUser?.id || $authUser?.username || null;
    if ($authStatus !== "authenticated" || !userKey) {
      lastHistoryUserKey = null;
      pendingHistoryUserKey = null;
    } else if (userKey !== lastHistoryUserKey) {
      lastHistoryUserKey = userKey;
      if (isMockMode("templates")) seedMockDashboardRecords(seededDashboardPopulatedTableRecords());
      void hydrateHistoryForUser(userKey);
    }
  }

  // No mirror layer: the live run views in chat.js are DERIVED from the
  // per-populated-table records (single-run-store refactor, T3) — there is nothing to
  // keep in sync here.

  function handleMouseDown() {
    isResizing = true;
  }

  function handleMouseMove(e) {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 250 && newWidth <= 800) {
      rightPanelWidth = newWidth;
    }
  }

  function handleMouseUp() {
    isResizing = false;
  }

  $: panelOpen =
    ($currentView === "results" || $currentView === "thread") &&
    $resultViewUiState.rightPanelOpen;
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

{#if $authStatus === "booting"}
  <div class="auth-loading">{$_("app.loadingSession")}</div>
{:else if $authStatus === "unauthenticated"}
  <Login on:authenticated={(e) => setAuthenticated(e.detail)} />
{:else}
  <div class="app" class:panel-open={panelOpen} class:resizing={isResizing}>
    <LeftPanel />
    <MainPanel />
    {#if panelOpen}
      <div
        class="resize-divider"
        role="separator"
        aria-orientation="vertical"
        on:mousedown={handleMouseDown}
      ></div>
      <RightPanel {rightPanelWidth} />
    {/if}
  </div>
  <Toasts />
{/if}

<style>
  .auth-loading {
    height: 100vh;
    display: grid;
    place-items: center;
    color: var(--color-text-secondary);
    background: var(--color-bg);
    font-size: var(--text-sm);
  }
  .app {
    display: grid;
    height: 100vh;
    grid-template-columns: auto 1fr;
    background: var(--color-bg);
  }
  .app.panel-open {
    grid-template-columns: auto 1fr auto auto;
  }
  .app.resizing {
    user-select: none;
  }
  .resize-divider {
    width: 4px;
    background: transparent;
    cursor: col-resize;
    transition: background-color 0.2s;
  }
  .resize-divider:hover {
    background: var(--color-border-strong);
  }
  .app.resizing .resize-divider {
    background: var(--color-accent);
  }
  @media (max-width: 899px) {
    .app.panel-open {
      grid-template-columns: auto 1fr;
      grid-template-rows: 1fr auto;
    }
    .resize-divider {
      height: 4px;
      width: auto;
      cursor: row-resize;
    }
  }
</style>
