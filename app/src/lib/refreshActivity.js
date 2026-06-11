const SUMMARY_KEYS = [
  ["new_members_count", "New members"],
  ["departed_members_count", "Departed members"],
  ["retried_blocked_count", "Retried blocked"],
  ["resolved_blocked_count", "Resolved blocked"],
  ["remaining_blocked_count", "Remaining blocked"],
  ["updated_cells_count", "Updated cells"],
];

function normalizeExecutionId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function countValue(summary, key) {
  const raw = summary?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function shouldShowRefreshAction(runStatus, refreshInFlight) {
  return runStatus !== "running" && !refreshInFlight;
}

export function groupActivityByExecution(events) {
  const groups = [];
  const byKey = new Map();
  let refreshOrdinal = 0;
  for (const event of events || []) {
    const executionId = normalizeExecutionId(event?.executionId);
    const key = executionId || "__initial__";
    let group = byKey.get(key);
    if (!group) {
      const label = executionId ? `Refresh ${++refreshOrdinal}` : "Initial run";
      group = { key, executionId, label, events: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

export function latestRefreshSummaryEvent(events) {
  const list = Array.isArray(events) ? events : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type !== "refresh_summary" || typeof event.summary !== "object" || !event.summary) {
      continue;
    }
    return {
      executionId: normalizeExecutionId(event.executionId),
      summary: event.summary,
    };
  }
  return null;
}

export function summaryRows(summary) {
  return SUMMARY_KEYS.map(([key, label]) => ({
    key,
    label,
    value: countValue(summary, key),
  }));
}
