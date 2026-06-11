import { isV2RunEvent, isValidV2Activity } from "./runStreamContract.js";

export function applyRunEvent(event, sink) {
  if (!isV2RunEvent(event)) return null;

  switch (event.type) {
    case "activity":
      if (!isValidV2Activity(event)) return null;
      sink.append(event);
      return null;
    case "workbook_created":
      sink.createWorkbook(event);
      sink.emitChip(event.label);
      return null;
    case "cell_update":
      sink.applyCells(event);
      return null;
    case "review_summary":
      sink.setReviewSummary(event);
      return null;
    case "done":
      return "done";
    case "error":
      sink.emitMessage({ role: "assistant", type: "text", content: event.message || "unknown error" });
      return "error";
    default:
      return null;
  }
}

export function terminalStatusForEventType(eventType) {
  if (eventType === "done") return "completed";
  if (eventType === "error") return "error";
  return null;
}
