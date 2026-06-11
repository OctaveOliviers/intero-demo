export function dispatchMockTimelineStep(step, callbacks) {
  if (step.kind === "activity") callbacks.onActivity && callbacks.onActivity(step.event);
  else if (step.kind === "workbook") callbacks.onWorkbookCreated && callbacks.onWorkbookCreated(step.event);
  else if (step.kind === "cells") callbacks.onCellUpdate && callbacks.onCellUpdate(step.event);
  else if (step.kind === "review_summary") callbacks.onReviewSummary && callbacks.onReviewSummary(step.event);
  else if (step.kind === "done") callbacks.onDone && callbacks.onDone(step.event || {});
}
