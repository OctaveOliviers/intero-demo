<script>
  // The floating artifact list right of the chat. Each row opens its artifact;
  // a hover-revealed three-dot menu (same pattern as the sidebar rows) carries
  // Pin/Unpin (the sidebar's PINNED ARTIFACTS section), Rename (inline, in
  // place) and Delete.
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import Icon from "../Icon.svelte";

  export let artifacts = [];
  export let onOpen = () => {};
  export let onTogglePin = () => {};
  export let onRename = () => {};
  export let onDelete = () => {};

  function iconFor(kind) {
    return kind === "table" ? "table" : "chart";
  }

  // One open menu across all rows; any outside click closes it.
  let openMenuId = null;
  function toggleMenu(id) {
    openMenuId = openMenuId === id ? null : id;
  }
  function closeMenus() {
    openMenuId = null;
  }

  function handlePin(artifact) {
    closeMenus();
    onTogglePin(artifact.id);
  }

  function handleDelete(artifact) {
    closeMenus();
    onDelete(artifact.id);
  }

  // Inline rename, mirroring SidebarItem: the title becomes an input in place;
  // Enter or blur commits, Escape cancels.
  let editingId = null;
  let draft = "";
  let inputEl;

  async function startRename(artifact) {
    closeMenus();
    editingId = artifact.id;
    draft = artifact.title;
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function commitRename(artifact) {
    if (editingId !== artifact.id) return;
    editingId = null;
    const next = draft.trim();
    if (next && next !== artifact.title) onRename(artifact.id, next);
  }

  function onEditKey(event, artifact) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(artifact);
    } else if (event.key === "Escape") {
      event.preventDefault();
      editingId = null;
    }
  }
</script>

<svelte:window on:click={closeMenus} />

{#if artifacts.length}
  <aside class="artifact-tray" aria-label="Artifacts">
    {#each artifacts as artifact (artifact.id)}
      <div class="row-wrap">
        {#if editingId === artifact.id}
          <div class="artifact-row editing">
            <span class="artifact-icon">
              <Icon name={iconFor(artifact.kind)} size={18} />
            </span>
            <input
              class="rename-input"
              type="text"
              bind:this={inputEl}
              bind:value={draft}
              on:keydown={(event) => onEditKey(event, artifact)}
              on:blur={() => commitRename(artifact)}
              on:click|stopPropagation
            />
          </div>
        {:else}
          <button
            class="artifact-row"
            class:menu-open={openMenuId === artifact.id}
            type="button"
            on:click={() => onOpen(artifact.opensArtifactId ?? artifact.id)}
          >
            <span class="artifact-icon">
              <Icon name={iconFor(artifact.kind)} size={18} />
            </span>
            <span class="artifact-title">{artifact.title}</span>
          </button>
          <button
            type="button"
            class="more-btn"
            class:open={openMenuId === artifact.id}
            on:click|stopPropagation={() => toggleMenu(artifact.id)}
            title={$_("common.more")}
            aria-label={$_("common.moreOptions")}
          >
            <Icon name="more" size={16} />
          </button>
          {#if openMenuId === artifact.id}
            <div class="menu-pop" on:click|stopPropagation>
              <button class="pop-item" on:click={() => handlePin(artifact)}>
                <Icon name="pin" size={16} />
                <span>{artifact.pinned ? $_("common.unpin") : $_("common.pin")}</span>
              </button>
              <button class="pop-item" on:click={() => startRename(artifact)}>
                <Icon name="rename" size={16} />
                <span>{$_("common.rename")}</span>
              </button>
              <button class="pop-item danger" on:click={() => handleDelete(artifact)}>
                <Icon name="trash" size={16} />
                <span>{$_("common.delete")}</span>
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </aside>
{/if}

<style>
  .artifact-tray {
    width: auto;
    min-width: 0;
    align-self: start;
    justify-self: end;
    margin: var(--screen-margin, var(--space-6)) var(--screen-margin, var(--space-6)) var(--screen-margin, var(--space-6)) 0;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--artifact-radius, var(--radius-md));
    background: var(--color-surface);
    /* No inner scroll: the row menus (position: absolute) must escape the box,
       and any overflow value other than visible clips them. */
    overflow: visible;
  }

  .row-wrap {
    position: relative;
  }

  .artifact-row {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-align: left;
  }

  .artifact-row:hover,
  .artifact-row:focus-visible,
  .artifact-row.menu-open {
    background: var(--color-hover);
  }

  .artifact-row:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .artifact-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .artifact-title {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text);
    font-size: var(--text-sm);
    white-space: nowrap;
    text-overflow: ellipsis;
    /* Reserve the more-btn's space UNCONDITIONALLY (not just on hover/menu-open):
       the tray is width:auto, sized to its widest row, so a hover-only padding
       change would grow the tray itself on hover. Constant padding keeps the
       tray's width fixed — only the button's opacity/pointer-events react. */
    padding-right: 22px;
  }

  .artifact-row.editing {
    cursor: text;
    background: var(--color-hover);
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  .rename-input:focus {
    outline: none;
    border: none;
    box-shadow: none;
  }

  /* `more` button — revealed on row hover (same pattern as the sidebar rows). */
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
</style>
