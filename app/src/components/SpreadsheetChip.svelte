<script>
  import { openWorkbook, downloadWorkbook } from "../stores/chat.js";
  import Icon from "./Icon.svelte";

  export let label;
  export let workbookUrl;
  export let downloadUrl;

  function getRunId(url) {
    const parts = url.split("/");
    return parts[parts.length - 2];
  }

  function handleClick() {
    openWorkbook(getRunId(workbookUrl));
  }

  function handleDownload(e) {
    e.stopPropagation();
    downloadWorkbook(getRunId(workbookUrl), label);
  }

  function handleKeydown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  // Split a trailing file extension so it can render muted (e.g. "result" + ".xlsx").
  $: extMatch = /\.[^.\s]+$/.exec(label || "");
  $: ext = extMatch ? extMatch[0] : "";
  $: name = ext ? label.slice(0, -ext.length) : (label || "");
</script>

<div class="chip" on:click={handleClick} on:keydown={handleKeydown} role="button" tabindex="0">
  <span class="icon"><Icon name="table" size={16} /></span>
  <span class="label">{name}{#if ext}<span class="ext">{ext}</span>{/if}</span>
  <button
    type="button"
    class="download"
    on:click={handleDownload}
    title="Download"
    aria-label="Download"
  >
    <Icon name="download" size={16} />
  </button>
</div>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }
  .chip:hover {
    background: var(--color-accent-weak);
    border-color: var(--color-accent-border);
  }
  .icon {
    display: inline-flex;
    color: var(--color-text-secondary);
  }
  .label {
    color: var(--color-text);
    font-weight: var(--weight-medium);
  }
  .ext {
    color: var(--color-text-faint);
    font-weight: var(--weight-normal);
  }
  .download {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-left: var(--space-1);
    padding: 0;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    text-decoration: none;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .download:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
</style>
