// Top-band status counters (doc 11 §Status counters): blocked and
// needs-review counts derived live from the workbook's cellMetadata, so they
// update with every cell_update batch during a run and drop as the user
// reviews cells. "Needs review" is the DERIVED needs-verification view of
// doc 5 §Cell state model — an interpret cell with a value that has not been
// reviewed — sharing the review-state semantics of cellVisualStatus.js.

function norm(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function countWorkbookStatus(cellMetadata) {
  let blocked = 0;
  let needsReview = 0;
  for (const meta of Object.values(cellMetadata || {})) {
    if (!meta || typeof meta !== "object") continue;
    const state = norm(meta.state);
    if (state === "blocked") {
      blocked += 1;
      continue;
    }
    if (state === "not_applicable") continue;
    const kind = norm(meta.kind);
    const reviewState = norm(meta.review_state ?? meta.reviewState);
    const isInterpret = kind === "interpret" || kind === "interpretive";
    if (
      reviewState === "not_reviewed" ||
      (isInterpret && !reviewState)
    ) {
      needsReview += 1;
    }
  }
  return { blocked, needsReview };
}
