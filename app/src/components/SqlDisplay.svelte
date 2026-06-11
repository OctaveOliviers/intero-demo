<script>
  export let sql;
</script>

<pre class="sql-display">{sql}</pre>

<style>
  .sql-display {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--color-surface-muted);
    border-radius: var(--radius-md);
    max-height: 200px;
    overflow-y: auto;
  }
</style>
