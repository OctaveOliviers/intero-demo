<script>
  // One sidebar list row, shared verbatim by BOTH the Tables and the Chats
  // sections — they are the same menu (same names, format, behavior); they only
  // point at something different. So this component has ZERO table-vs-chat
  // branching: everything that differs is passed in as a prop or a callback.
  //   • the clickable title button, with the .active highlight and an OPTIONAL
  //     status dot (tables pass a dot state; chats pass none);
  //   • the hover-revealed three-dots "more" button;
  //   • the menu-pop with Rename (above) and Delete (danger, below);
  //   • the inline-rename editing state (Rename swaps the title for an input —
  //     prompt() is silently suppressed in this runtime, so we edit in place).
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import Icon from "./Icon.svelte";

  export let title;
  export let active = false;
  // Generic row dot state: "working" | "unopened" | "none". Tables and chats
  // derive it upstream and this component only renders the shared visuals.
  export let dot = null;
  // Whether THIS row's menu is open — controlled by the parent's single
  // open-menu state so only one row's menu is ever open across both sections.
  export let menuOpen = false;
  // The confirm() message shown before a delete.
  export let deleteConfirm = "";

  export let onOpen = () => {};
  export let onToggleMenu = () => {};
  export let onRename = () => {};
  export let onDelete = () => {};
  // Optional share action — Tables pass it; Chats (threads) do NOT (threads are
  // not shareable, §10). When null the menu shows no Share item.
  export let onShare = null;

  function handleShare() {
    onToggleMenu(); // close this row's menu
    onShare && onShare();
  }

  // Inline rename: while editing, the title becomes a text input seeded with the
  // current title; Enter or blur commits, Escape cancels.
  let editing = false;
  let draft = "";
  let inputEl;

  async function startRename() {
    onToggleMenu(); // close this row's menu (it's the open one)
    editing = true;
    draft = title;
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function commitRename() {
    if (!editing) return; // guard against blur firing after an Escape/Enter
    editing = false;
    const next = draft.trim();
    if (next && next !== title) onRename(next);
  }

  function cancelRename() {
    editing = false;
  }

  function onEditKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  function handleDelete() {
    onToggleMenu(); // close this row's menu
    if (deleteConfirm && !confirm(deleteConfirm)) return;
    onDelete();
  }
</script>

<div class="row-wrap">
  {#if editing}
    <!-- Inline rename: the title turns into a borderless input in place. -->
    <div class="item editing">
      <input
        class="rename-input"
        type="text"
        bind:this={inputEl}
        bind:value={draft}
        on:keydown={onEditKey}
        on:blur={commitRename}
        on:click|stopPropagation
      />
    </div>
  {:else}
    <button
      class="item"
      class:active
      class:menu-open={menuOpen}
      on:click={onOpen}
      {title}
    >
      <span class="title">{title}</span>
      {#if dot === "working"}
        <span class="dot running" title={$_("common.running")} aria-hidden="true" />
      {:else if dot === "unopened"}
        <span class="dot unopened" title={$_("leftPanel.tableReady")} aria-hidden="true" />
      {/if}
    </button>
    <button
      type="button"
      class="more-btn"
      class:open={menuOpen}
      on:click|stopPropagation={onToggleMenu}
      title={$_("common.more")}
      aria-label={$_("common.moreOptions")}
    >
      <Icon name="more" size={18} />
    </button>
    {#if menuOpen}
      <div class="menu-pop" on:click|stopPropagation>
        <button class="pop-item" on:click={startRename}>
          <Icon name="rename" size={16} />
          <span>{$_("common.rename")}</span>
        </button>
        {#if onShare}
          <button class="pop-item" on:click={handleShare}>
            <Icon name="share" size={16} />
            <span>{$_("sharing.share")}</span>
          </button>
        {/if}
        <button class="pop-item danger" on:click={handleDelete}>
          <Icon name="trash" size={16} />
          <span>{$_("common.delete")}</span>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
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

  /* Inline-rename: the row keeps its box; the title is replaced by a
     borderless, transparent input matching the title's text format. */
  .item.editing {
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
    font-weight: var(--weight-normal);
    color: var(--color-text);
  }

  .rename-input:focus {
    outline: none;
    border: none;
    box-shadow: none;
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

  /* Finished, not yet opened by this user — a solid blue "new" dot (no pulse). */
  .dot.unopened {
    background: var(--color-accent);
  }

  .row-wrap:hover .dot.running,
  .row-wrap:hover .dot.unopened {
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
</style>
