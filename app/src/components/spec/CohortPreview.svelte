<script>
  // Bottom-of-input health-check line, e.g. "Exactly 9 patients match these filters."
  // Purely presentational — the doctor's sanity check before an expensive run.
  import { _ } from "svelte-i18n";

  export let count = 0;
  export let noun = "patients"; // 'patients' | 'encounters'

  // Map the noun kind to its plural-aware catalog message; default to patients.
  $: nounKey = noun === "encounters" ? "cohort.encounters" : "cohort.patients";
</script>

<div class="cohort-preview">
  {$_(nounKey, { values: { count } })}
</div>

<style>
  .cohort-preview {
    font: inherit;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.4;
  }
</style>
