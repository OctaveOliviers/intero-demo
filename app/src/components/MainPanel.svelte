<script>
  import { currentView } from "../stores/navigation.js";
  import HomeScreen from "./HomeScreen.svelte";
  import ResultsView from "./ResultsView.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";
</script>

<div class="main-panel">
  {#if $currentView === "home"}
    <HomeScreen />
  {:else if $currentView === "results"}
    <ResultsView />
  {:else if $currentView === "library"}
    <LibraryPanel />
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
