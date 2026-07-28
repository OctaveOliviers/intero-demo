<script>
  // One artifact CONTENT view: the patient record. It knows nothing about the
  // surrounding box (toolbar, evidence panel, resize) — the box swaps this in
  // for artifacts of kind "table", whose rows are patients and whose columns are
  // the fields of one patient's registration.
  //
  // Layout is the cohort rail on the left and the record beside it. The record
  // holds a maximum width so it keeps page-like proportions in a wide artifact
  // and compresses rather than breaking in a narrow one.
  import CohortRail from "./CohortRail.svelte";
  import FormField from "./FormField.svelte";

  export let form = null;
  export let patients = [];
  export let streaming = false;
  export let contextCaptureMode = false;
  export let pickedRefIds = [];
  export let onSelectPatient = () => {};
  export let onEdit = () => {};
  export let onSource = () => {};
  export let onFieldPick = () => {};

  $: pickedSet = new Set(pickedRefIds);
</script>

<div class="form-view">
  <CohortRail {patients} onSelect={onSelectPatient} />

  <div class="record-scroll">
    {#if form}
      <article class="record" aria-label={form.title}>
        <header class="record-head">
          <h2>{form.title}</h2>
        </header>

        {#each form.sections as section (section.key)}
          <section class="record-section">
            <h3>{section.title}</h3>
            {#each section.fields as field (field.id)}
              <FormField
                {field}
                {contextCaptureMode}
                streaming={streaming && !form.complete}
                picked={pickedSet.has(field.refId)}
                {onEdit}
                {onSource}
                onPick={onFieldPick}
              />
            {/each}
          </section>
        {/each}
      </article>
    {/if}
  </div>
</div>

<style>
  .form-view {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    gap: var(--space-4);
    overflow: hidden;
  }

  .record-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  /* The page: a constant readable measure once there is room for it, centred in
     whatever width the artifact has. */
  .record {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding-bottom: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* Just the id. The clinical one-liner is already on the highlighted rail row
     beside it, so repeating it here only adds a second size of the same text. */
  .record-head {
    display: flex;
    flex-direction: column;
  }

  h2 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text);
  }

  .record-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  h3 {
    margin: 0 0 var(--space-1);
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  /* Narrow artifact: tighten the gap. The rail drops its summaries and narrows
     to match — see CohortRail's own container query. */
  @container (max-width: 520px) {
    .form-view {
      gap: var(--space-2);
    }
  }
</style>
