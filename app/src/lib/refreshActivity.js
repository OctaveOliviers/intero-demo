import { get } from "svelte/store";
import { _ } from "svelte-i18n";

// [summary field, i18n key] — the label is resolved per-call against the active
// locale so the downstream-update rows render in the chosen language.
const SUMMARY_KEYS = [
  ["new_members_count", "refresh.newMembers"],
  ["departed_members_count", "refresh.departedMembers"],
  ["retried_blocked_count", "refresh.retriedBlocked"],
  ["resolved_blocked_count", "refresh.resolvedBlocked"],
  ["remaining_blocked_count", "refresh.remainingBlocked"],
  ["updated_cells_count", "refresh.updatedCells"],
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
      const t = get(_);
      const label = executionId
        ? t("refresh.refreshN", { values: { n: ++refreshOrdinal } })
        : t("refresh.initialRun");
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
  const t = get(_);
  return SUMMARY_KEYS.map(([key, labelKey]) => ({
    key,
    label: t(labelKey),
    value: countValue(summary, key),
  }));
}
