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
    // "Needs review" mirrors the backend's needs_verification EXACTLY — a FILLED
    // cell awaiting sign-off (review_state "not_reviewed") — so the top-band chip
    // can never diverge from the review summary. The store now sets review_state
    // on every filled interpret cell (DB trigger) and cell_wire forwards it, so
    // there is no longer a kind/interpret fallback (which over-counted pending
    // and review_state-less cells the backend never counted).
    const reviewState = norm(meta.review_state ?? meta.reviewState);
    if (state === "filled" && reviewState === "not_reviewed") {
      needsReview += 1;
    }
  }
  return { blocked, needsReview };
}
