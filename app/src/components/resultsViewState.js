export function shouldShowTerminalSummary(tablePopulationStatus, reviewSummary) {
  return tablePopulationStatus === "completed" && !!reviewSummary;
}
