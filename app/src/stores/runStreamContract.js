export const V2_RUN_EVENT_TYPES = new Set([
  "activity",
  "workbook_created",
  "cell_update",
  "review_summary",
  "refresh_summary",
  "done",
  "error",
]);

export function isV2RunEvent(event) {
  return !!event && typeof event.type === "string" && V2_RUN_EVENT_TYPES.has(event.type);
}

export function isValidV2Activity(event) {
  return (
    event?.type === "activity"
    && typeof event.headline === "string"
    && event.headline.trim().length > 0
  );
}
