export function handleRefreshConflict(code, tablePopulationId, populatedTableId, reconnect) {
  if (code === "TABLE_POPULATION_ACTIVE") {
    reconnect(tablePopulationId, populatedTableId);
    return { status: "resumed", tablePopulationId };
  }
  if (code === "TABLE_POPULATION_NOT_FOUND") {
    throw new Error("Table population not found. Start a new table population before checking for updates.");
  }
  if (code === "TABLE_POPULATION_NOT_REFRESHABLE") {
    throw new Error("This table population is not refreshable in its current state.");
  }
  return null;
}
