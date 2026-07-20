<script>
  // Share dialog. Reuses the FeedbackModal pattern: a backdrop + modal invoked by
  // a parent {#if show}. ONE "Share with" chip-input (inspired by Drive's "Add
  // people"): the dialog opens empty for a deliberate handoff; colleagues selected
  // in this modal render as chips with a revoke ✕ (DELETE /api/grants/{id}).
  // Typing in the field filters a dropdown of colleagues NOT yet selected
  // (GET /api/clinicians, self excluded). Picking
  // one POSTs /api/grants — sharing is ALWAYS editor (the recipient edits the same
  // file), so there is no access selector — and the new chip appears. Add/remove
  // are LIVE, and the footer closes after a final handoff message. A 403/failure
  // surfaces inline. No share path for threads — the parent never opens this for one.
  import { createEventDispatcher, onMount, tick } from "svelte";
  import { _ } from "svelte-i18n";
  import Icon from "./Icon.svelte";
  import {
    listClinicians,
    createGrant,
    deleteGrant,
  } from "../lib/api.js";
  import { authUser } from "../stores/auth.js";

  // The resource being shared: { type: "dataset"|"template"|"table", id, title }.
  export let resource;

  const dispatch = createEventDispatcher();

  // "dataset" | "template" | "table" → "Dataset" | "Template" | "Table" key suffix,
  // used to look up the resource-type noun in the edit hint.
  $: typeKey = resource.type.charAt(0).toUpperCase() + resource.type.slice(1);

  let clinicians = [];
  let grantees = []; // rows selected in this modal session — these are the chips
  let loading = true;
  let error = "";

  let queryText = "";
  let messageText = "";
  let sharingId = null; // id being added right now (chip pending) — disables input
  let revokingId = null;
  let inputEl;

  // The set of colleague ids already a chip — excluded from the add dropdown so we
  // never double-share to the same person (the create would just stack).
  $: grantedIds = new Set(grantees.map((g) => g.grantee.subject_id));

  // Add-dropdown candidates: directory minus self minus existing chips, filtered by
  // the typed query. The dropdown only renders while the field is focused/typed.
  $: candidates = filterCandidates(clinicians, queryText, $authUser?.id, grantedIds);

  function filterCandidates(list, q, selfId, granted) {
    // Never offer the signed-in clinician themselves: the backend excludes
    // subject_id == granted_by, so a self-share silently no-ops — a dead end.
    const visible = list.filter(
      (c) => c.id !== selfId && !granted.has(c.id),
    );
    const needle = q.trim().toLowerCase();
    if (!needle) return visible;
    return visible.filter((c) => c.display_name.toLowerCase().includes(needle));
  }

  function close() {
    dispatch("close");
  }
  function onBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  onMount(load);

  async function load() {
    loading = true;
    error = "";
    messageText = "";
    try {
      clinicians = await listClinicians();
      grantees = [];
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  // Add a colleague from the dropdown → grant immediately → they become a chip.
  async function addColleague(id) {
    if (sharingId) return;
    sharingId = id;
    error = "";
    try {
      // Sharing is always editor — the recipient edits the same file.
      const grant = await createGrant({
        resourceType: resource.type,
        resourceId: resource.id,
        subjectId: id,
      });
      const colleague = clinicians.find((c) => c.id === id);
      grantees = [
        ...grantees,
        {
          grant_id: grant.id,
          resource_type: resource.type,
          resource_id: resource.id,
          grantee: { subject_id: id, display_name: colleague?.display_name || id },
        },
      ];
      queryText = "";
      await tick();
      inputEl?.focus();
    } catch (e) {
      // 403 (not owner) or any failure surfaces inline — no chip is added.
      error = e?.message || String(e);
    } finally {
      sharingId = null;
    }
  }

  // Remove a chip → revoke that grant immediately → the chip disappears.
  async function handleRevoke(grantId) {
    if (revokingId) return;
    revokingId = grantId;
    error = "";
    try {
      await deleteGrant(grantId);
      grantees = grantees.filter((g) => g.grant_id !== grantId);
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      revokingId = null;
    }
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
      <h2>{$_("sharing.shareTitle", { values: { title: resource.title } })}</h2>
      <button
        class="icon-btn"
        on:click={close}
        title={$_("common.close")}
        aria-label={$_("common.close")}
      >
        <Icon name="close" />
      </button>
    </header>

    <div class="modal-body">
      {#if loading}
        <div class="state">{$_("sharing.loadingGrantees")}</div>
      {:else}
        <div class="field">
          <span class="field-label" id="share-with-label">
            {$_("sharing.colleagueLabel")}
          </span>

          <!-- One chip-input: existing grantees as chips + a filter input. -->
          <div class="chip-input">
            {#each grantees as g (g.grant_id)}
              <span class="chip">
                <span class="chip-name">{g.grantee.display_name}</span>
                <button
                  type="button"
                  class="chip-remove"
                  aria-label={$_("sharing.revoke", { values: { name: g.grantee.display_name } })}
                  title={$_("sharing.revoke", { values: { name: g.grantee.display_name } })}
                  disabled={revokingId === g.grant_id}
                  on:click={() => handleRevoke(g.grant_id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            {/each}
            <input
              class="chip-text"
              type="text"
              placeholder={$_("sharing.colleaguePlaceholder")}
              bind:value={queryText}
              bind:this={inputEl}
              disabled={sharingId !== null}
              aria-labelledby="share-with-label"
              autocomplete="off"
            />
          </div>

          <!-- Add dropdown: colleagues not yet shared with, filtered by the input. -->
          <div class="dropdown" role="listbox" aria-labelledby="share-with-label">
            {#if clinicians.length === 0}
              <div class="dropdown-empty">{$_("sharing.noColleagues")}</div>
            {:else if candidates.length === 0}
              <div class="dropdown-empty">{$_("sharing.noColleagueMatches")}</div>
            {:else}
              {#each candidates as c (c.id)}
                <button
                  type="button"
                  class="dropdown-row"
                  role="option"
                  aria-selected="false"
                  disabled={sharingId !== null}
                  on:click={() => addColleague(c.id)}
                >
                  <span class="dropdown-name">{c.display_name}</span>
                  {#if sharingId === c.id}
                    <span class="dropdown-spinner" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <label class="field">
          <span class="field-label">{$_("sharing.messageLabel")}</span>
          <textarea
            class="message"
            bind:value={messageText}
            rows="4"
            placeholder={$_("sharing.messagePlaceholder")}
          />
        </label>

        <p class="edit-hint">
          {$_("sharing.editHint", { values: { type: $_("sharing.typeNoun" + typeKey) } })}
        </p>

        {#if error}<div class="error">{error}</div>{/if}

        <div class="actions">
          <button type="button" class="btn primary" on:click={close}>
            {$_("sharing.share")}
          </button>
        </div>
      {/if}
    </div>
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
    width: min(480px, 92vw);
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    overflow-y: auto;
  }
  .state {
    color: var(--color-text-muted);
    font-style: italic;
    font-size: var(--text-sm);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }
  /* The single chip-input: existing grantees as chips + a wrapping filter input. */
  .chip-input {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color var(--dur-fast) var(--ease);
  }
  .chip-input:focus-within { border-color: var(--color-accent); }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    padding: 2px var(--space-1) 2px var(--space-2);
    background: var(--color-accent-weak);
    color: var(--color-accent);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-remove {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-accent);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .chip-remove:hover:not(:disabled) { background: var(--color-danger-weak); color: var(--color-danger); }
  .chip-remove:disabled { opacity: 0.4; cursor: default; }
  .chip-text {
    flex: 1;
    min-width: 8ch;
    padding: var(--space-1);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    background: transparent;
    border: none;
  }
  .chip-text:focus { outline: none; }
  .chip-text:disabled { cursor: default; }

  /* Add dropdown: colleagues not yet shared with (scrolls if long). */
  .dropdown {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 168px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-1);
  }
  .dropdown-empty {
    padding: var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-align: center;
  }
  .dropdown-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  .dropdown-row:hover:not(:disabled) { background: var(--color-hover); }
  .dropdown-row:disabled { cursor: default; opacity: 0.7; }
  .dropdown-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dropdown-spinner {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-accent-weak);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Editor-only hint: people you add can edit this resource. */
  .edit-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .message {
    width: 100%;
    min-height: 96px;
    box-sizing: border-box;
    resize: vertical;
    padding: var(--space-2) var(--space-3);
    font-family: inherit;
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color var(--dur-fast) var(--ease);
  }
  .message:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .error {
    background: var(--color-danger-weak);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }

  .actions { display: flex; justify-content: flex-end; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease);
  }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn.primary { background: var(--color-accent); color: var(--color-on-accent, #fff); }
  .btn.primary :global(svg) { color: var(--color-on-accent, #fff); }
  .btn.primary:hover:not(:disabled) { filter: brightness(0.95); }
</style>
