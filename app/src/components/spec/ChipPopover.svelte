<script>
  import { createEventDispatcher, tick, onDestroy } from "svelte";
  import { _ } from "svelte-i18n";

  // Floating popover shell, anchored under its trigger. The consumer owns `open`
  // and is responsible for wrapping trigger + popover in a position:relative span.
  export let open = false;
  export let searchable = false;
  export let query = "";
  export let placeholder = null;

  const dispatch = createEventDispatcher();

  let panel;
  let searchInput;

  // Auto-focus the search input when the popover opens.
  $: if (open && searchable) {
    tick().then(() => searchInput && searchInput.focus());
  }

  // Outside-click close. Attach the document listener only while open, and
  // defer the attach by a turn so the very click that opened the popover
  // (which bubbles to the document as an "outside" click) doesn't immediately
  // close it again.
  let detach = null;
  $: {
    if (open && !detach) {
      const onDocClick = (e) => {
        if (panel && !panel.contains(e.target)) dispatch("close");
      };
      const id = setTimeout(() => document.addEventListener("click", onDocClick), 0);
      detach = () => {
        clearTimeout(id);
        document.removeEventListener("click", onDocClick);
      };
    } else if (!open && detach) {
      detach();
      detach = null;
    }
  }

  onDestroy(() => detach && detach());

  function handleKeydown(e) {
    if (open && e.key === "Escape") {
      e.stopPropagation();
      dispatch("close");
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="popover" bind:this={panel} on:click|stopPropagation>
    {#if searchable}
      <input
        class="search"
        type="text"
        bind:this={searchInput}
        bind:value={query}
        placeholder={placeholder ?? $_("spec.search")}
      />
    {/if}
    <div class="body">
      <slot />
    </div>
  </div>
{/if}

<style>
  .popover {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 220px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
    z-index: 20;
    overflow: hidden;
  }

  .search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: none;
    border-bottom: 1px solid #f3f4f6;
    font: inherit;
    font-size: 13px;
    color: #111827;
    outline: none;
  }

  .search::placeholder {
    color: #9ca3af;
  }

  .body {
    max-height: 280px;
    overflow-y: auto;
  }
</style>
