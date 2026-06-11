<script>
  import { createEventDispatcher } from "svelte";

  // Value-only pill. The descriptive label is rendered BESIDE the chip by the
  // parent — only `value` lives inside the pill, and the pill is the click target.
  export let value = "";
  export let variant = "filter"; // 'filter' | 'template'
  export let open = false;
  export let editable = true;

  const dispatch = createEventDispatcher();

  function handleClick() {
    if (!editable) return;
    dispatch("toggle");
  }
</script>

<button
  type="button"
  class="chip {variant}"
  class:open
  disabled={!editable}
  aria-expanded={open}
  aria-disabled={!editable}
  on:click={handleClick}
>
  <span class="value">{value}</span>
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    color: #111827;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    vertical-align: middle;
    transition: border-color 0.12s ease, background 0.12s ease;
  }

  /* Template chip keeps the more generous horizontal padding — it sits alone
     on its row and trimmed filter padding looks pinched on a long name. */
  .chip.template {
    padding: 3px 10px;
  }

  .chip:hover,
  .chip.open {
    border-color: #3b82f6;
  }

  .chip:disabled {
    cursor: default;
  }

  .chip:disabled:hover {
    border-color: #d1d5db;
  }

  .value {
    white-space: nowrap;
  }
</style>
