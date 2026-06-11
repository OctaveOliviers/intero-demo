// cohortMerge.js — diff-only, never-overwrite merge for the filter chips.
//
// The home screen extracts candidate filters live as the operator types (a
// fresh full extraction per parse) and hands them to InputSpec. Per doc 2
// §"Filter interaction" (S4), that extraction must be **additive and diff-only**:
// it adds/removes agent-suggested chips but must **never overwrite the user's
// own choices** and **never collapse the set to zero**.
//
// mergeCohort(prev, next) folds a fresh agent extraction (`next`) onto the
// user's current working set (`prev`):
//   - Untouched agent fields take the new extraction (so it can add a newly
//     mentioned filter or drop one the text no longer implies — the diff).
//   - Fields the user OWNS — anything they manually added (`added`) or edited
//     (`userEdited`), plus their database selection — are preserved verbatim and
//     never replaced by a suggestion.
//   - The result is never empty while the extraction is non-empty.
//
// It is idempotent: mergeCohort(x, x) yields the same chips in the same order,
// so re-applying the same extraction can't churn the set.

// Fields the user has taken ownership of: any field with a manually-added or
// edited chip, plus `database` (agent-suggested but user-confirmable — once a
// working selection exists it is the user's to manage, never silently reset).
function ownedFields(prev) {
  const owned = new Set();
  for (const c of prev) {
    if (c.added || c.userEdited) owned.add(c.field);
  }
  if (prev.some((c) => c.field === "database")) owned.add("database");
  return owned;
}

export function mergeCohort(prev = [], next = []) {
  // First extraction (no working set yet): take it as-is.
  if (!prev.length) return next;

  const owned = ownedFields(prev);
  const chipsFor = (arr, field) => arr.filter((c) => c.field === field);

  // Preserve the agent's field order, then append any user-owned fields the new
  // extraction dropped entirely (pure user additions live at the end).
  const order = [];
  for (const c of next) if (!order.includes(c.field)) order.push(c.field);
  for (const c of prev) if (owned.has(c.field) && !order.includes(c.field)) order.push(c.field);

  const result = [];
  for (const field of order) {
    // Owned field → keep the user's chips; otherwise take the fresh suggestion.
    const source = owned.has(field) ? prev : next;
    result.push(...chipsFor(source, field));
  }

  // Never collapse to zero: fall back to the extraction if the merge emptied.
  return result.length ? result : next;
}
