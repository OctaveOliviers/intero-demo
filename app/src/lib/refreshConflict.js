export function handleRefreshConflict(code, runId, auditId, reconnect) {
  if (code === "RUN_EXECUTION_ACTIVE") {
    reconnect(runId, auditId);
    return { status: "resumed", runId };
  }
  if (code === "RUN_NOT_FOUND") {
    throw new Error("Run not found. Start a new run before checking for updates.");
  }
  if (code === "RUN_NOT_REFRESHABLE") {
    throw new Error("This run is not refreshable in its current state.");
  }
  return null;
}
