<script>
  import { createEventDispatcher } from "svelte";
  import { _ } from "svelte-i18n";

  const dispatch = createEventDispatcher();

  let dragOver = false;
  let fileName = "";

  const ACCEPTED = ".xlsx,.xlsm,.csv";

  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer.files[0];
    if (file) acceptFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFilePick(e) {
    const file = e.target.files[0];
    if (file) acceptFile(file);
  }

  function acceptFile(file) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) return;
    fileName = file.name;
    dispatch("fileSelect", file);
  }
</script>

<div
  class="upload-zone"
  class:drag-over={dragOver}
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  role="button"
  tabindex="0"
>
  <input
    type="file"
    accept={ACCEPTED}
    on:change={handleFilePick}
    id="file-input"
    class="file-input"
  />
  <label for="file-input" class="label">
    {#if fileName}
      <span>📎 {fileName}</span>
    {:else}
      <span>{$_("fileUpload.dropExcel")}</span>
    {/if}
  </label>
</div>

<style>
  .upload-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
    margin: 8px 0;
  }
  .upload-zone.drag-over {
    border-color: #0066cc;
    background: #f0f7ff;
  }
  .file-input {
    display: none;
  }
  .label {
    cursor: pointer;
    font-size: 13px;
    color: #666;
    display: block;
  }
  .label:hover {
    color: #0066cc;
  }
</style>
