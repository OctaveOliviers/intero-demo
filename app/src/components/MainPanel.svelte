<script>
  import { currentView } from "../stores/navigation.js";
  import { currentThreadId } from "../stores/threads.js";
  import HomeScreen from "./HomeScreen.svelte";
  import ResultsView from "./ResultsView.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";
  import SettingsPage from "./SettingsPage.svelte";
  import ThreadView from "./ThreadView.svelte";
</script>

<div class="main-panel">
  {#if $currentView === "home"}
    <HomeScreen />
  {:else if $currentView === "thread"}
    <!-- Remount ThreadView per conversation: switching threads must re-run the
         per-message TableInspector tracking (onMount → trackTable) for the NEW
         thread's tables (#1) and reset the auto-scroll baseline so the new thread
         scrolls to its own tail even at the same message count (#13). Without the
         key, the index-keyed message each reuses inspector instances in place and
         their onMount never re-fires. Keyed on the thread id (null on the pending
         new-chat landing → also a clean remount when the first message mints it). -->
    {#key $currentThreadId}
      <ThreadView />
    {/key}
  {:else if $currentView === "results"}
    <ResultsView />
  {:else if $currentView === "library"}
    <LibraryPanel />
  {:else if $currentView === "settings"}
    <SettingsPage />
  {:else}
    <ResultsView />
  {/if}
</div>

<style>
  .main-panel {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100vh;
    min-height: 0;
    background: var(--color-bg);
    /* Without this, the grid 1fr track grows to fit wide content (e.g. a
       wide spreadsheet) instead of staying within the viewport, which
       breaks the inner spreadsheet's own horizontal scrolling. */
    min-width: 0;
  }
</style>
