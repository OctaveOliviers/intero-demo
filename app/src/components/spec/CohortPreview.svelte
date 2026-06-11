<script>
  // Bottom-of-input health-check line, e.g. "Exactly 9 patients match these filters."
  // Purely presentational — the doctor's sanity check before an expensive run.
  export let count = 0;
  export let noun = "patients"; // 'patients' | 'encounters'
</script>

<div class="cohort-preview">
  Exactly {count.toLocaleString()} {noun} match these filters.
</div>

<style>
  .cohort-preview {
    font: inherit;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.4;
  }
</style>
