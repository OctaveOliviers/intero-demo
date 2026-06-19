<script>
  import { createEventDispatcher } from "svelte";
  import { _ } from "svelte-i18n";
  import Icon from "./Icon.svelte";
  import { LOCALES, ACTIVE_LOCALE, setLocale } from "../i18n/index.js";

  const dispatch = createEventDispatcher();

  function close() {
    dispatch("close");
  }

  function choose(code) {
    // setLocale persists the choice and reloads so both the UI and the demo
    // data come back in the new language; a no-op when already active.
    setLocale(code);
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="backdrop"
  on:click={onBackdrop}
  on:keydown={() => {}}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="modal">
    <header class="modal-header">
      <h2>{$_("settings.title")}</h2>
      <button class="icon-btn" on:click={close} title={$_("common.close")} aria-label={$_("common.close")}>
        <Icon name="close" />
      </button>
    </header>

    <section class="content">
      <div class="group">
        <h3>{$_("settings.language")}</h3>
        <div class="lang-list" role="radiogroup" aria-label={$_("settings.language")}>
          {#each LOCALES as l (l.code)}
            <button
              class="lang-row"
              class:selected={l.code === ACTIVE_LOCALE}
              role="radio"
              aria-checked={l.code === ACTIVE_LOCALE}
              on:click={() => choose(l.code)}
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
    </section>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(13, 13, 13, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--color-surface);
    width: min(460px, 92vw);
    max-height: 84vh;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-1);
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .icon-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  h3 {
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
</style>
