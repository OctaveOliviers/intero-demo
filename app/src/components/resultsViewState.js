export function shouldShowTerminalSummary(runStatus, reviewSummary) {
  return runStatus === "completed" && !!reviewSummary;
}
