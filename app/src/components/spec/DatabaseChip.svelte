<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import Chip from "./Chip.svelte";
  import ChipPopover from "./ChipPopover.svelte";
  import { databases, refreshDatabases } from "../../stores/databases.js";

  // The `database` chip. Renders a value-only pill + a searchable popover listing
  // databases from the store. Selecting one updates chip.value (name) + chip.raw (id).
  export let chip;

  const dispatch = createEventDispatcher();

  let open = false;
  let query = "";

  onMount(() => {
    refreshDatabases().catch(() => {});
  });

  // Prefer ready databases; fall back to all if none are ready yet.
  $: ready = $databases.filter((d) => d.status === "ready");
  $: available = ready.length ? ready : $databases;
  $: filtered = query.trim()
    ? available.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    : available;

  function select(db) {
    chip = { ...chip, value: db.name, raw: db.id };
    open = false;
    query = "";
    dispatch("change", chip);
  }
</script>

<span class="anchor">
  <Chip value={chip.value} {open} on:toggle={() => (open = !open)} />
  <ChipPopover
    {open}
    searchable
    bind:query
    placeholder={$_("spec.searchDatabases")}
    on:close={() => (open = false)}
  >
    <ul class="list">
      {#each filtered as db (db.id)}
        <li>
          <button type="button" class="option" on:click={() => select(db)}>
            <span class="name">{db.name}</span>
            {#if db.id === chip.raw}
              <span class="check" aria-hidden="true">✓</span>
            {/if}
          </button>
        </li>
      {:else}
        <li class="empty">{$_("spec.noDatabasesFound")}</li>
      {/each}
    </ul>
  </ChipPopover>
</span>

<style>
  .anchor {
    position: relative;
    display: inline-block;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 4px;
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    font: inherit;
    font-size: 13px;
    color: #111827;
    text-align: left;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .option:hover {
    background: #f3f4f6;
  }

  .check {
    color: #2563eb;
    font-size: 12px;
  }

  .empty {
    padding: 8px 10px;
    font-size: 13px;
    color: #9ca3af;
  }
</style>
