// The single source of truth for per-audit run state (decision 14 / Phase-4 T3).
//
// Every audit (a sidebar row) owns ONE record here: identity, status, runId,
// and the streamed artifacts (messages, activity, reviewSummary, workbook).
// The stream sink (chat.js) writes ONLY through the mutators below; the live
// views the components read (activity / activeWorkbook / reviewSummary /
// runStatus / messages in chat.js) are DERIVED from these records — there is
// no second copy to keep in sync and no mirror layer.
//
// Persistence is the explicit subscriber at the bottom: the record list is
// saved to a per-user localStorage key on every change. This module imports
// no UI/navigation/chat modules — it is pure data.
import { writable, get } from "svelte/store";
import { authUser } from "./auth.js";
import { deleteRun } from "../lib/api.js";

const STORAGE_PREFIX = "intero.audits.v1";
let currentStorageKey = null;
let suppressNextPersist = false;

function storageKeyForUser(user) {
  const id = user?.id || user?.username || null;
  return id ? `${STORAGE_PREFIX}:${id}` : null;
}

function load(key) {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key, list) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export const audits = writable([]);
export const currentAuditId = writable(null);

// The run lifecycle currently in flight: { auditId, runId|null } from the
// moment an audit starts (before the run id exists) until the stream reaches
// a terminal state. Drives the derived runStatus — a record whose stored
// status is "running" but which is NOT the active stream (e.g. after a page
// reload) reads as idle.
export const activeStream = writable(null);

// Switch persisted namespace when authenticated user changes. Each user gets an
// isolated local history key; unauthenticated state shows no persisted history.
authUser.subscribe((user) => {
  const nextKey = storageKeyForUser(user);
  if (nextKey === currentStorageKey) return;
  currentStorageKey = nextKey;
  audits.set(load(currentStorageKey));
  currentAuditId.set(null);
});

// The explicit persistence layer: records -> localStorage, nothing else.
audits.subscribe((list) => {
  if (suppressNextPersist) {
    suppressNextPersist = false;
    return;
  }
  save(currentStorageKey, list);
});

function updateAudit(id, patch) {
  audits.update((list) =>
    list.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}

function titleFromRequest(text) {
  const line = String(text || "").split("\n").map((v) => v.trim()).find(Boolean) || "";
  if (!line) return null;
  return line.length > 48 ? line.slice(0, 47).trimEnd() + "…" : line;
}

function mapServerRun(row) {
  const runId = String(row?.run_id || "").trim();
  if (!runId) return null;
  const request = row?.request || "";
  const startedAt = Date.parse(String(row?.started_at || "")) || Date.now();
  return {
    id: `run:${runId}`,
    runId,
    title: titleFromRequest(request) || row?.audit_id || `Run ${runId.slice(0, 8)}`,
    templateId: row?.audit_id || null,
    filters: row?.filters || {},
    createdAt: startedAt,
    status: "completed",
    messages: [],
    activity: [],
    workbook: null,
    runStartedAt: null,
    runEndedAt: null,
  };
}

// Merge server run history into the local sidebar model without duplicates.
// Canonical dedupe key is runId; local richer fields (messages/workbook/status)
// are preserved when an entry for the same run already exists.
export function mergeServerRunHistory(rows) {
  const incoming = Array.isArray(rows) ? rows.map(mapServerRun).filter(Boolean) : [];
  if (incoming.length === 0) return;

  audits.update((list) => {
    const byRunId = new Map();
    const noRunId = [];

    for (const item of list) {
      if (item?.runId) byRunId.set(item.runId, item);
      else noRunId.push(item);
    }

    for (const serverItem of incoming) {
      const prev = byRunId.get(serverItem.runId);
      if (!prev) {
        byRunId.set(serverItem.runId, serverItem);
        continue;
      }
      byRunId.set(serverItem.runId, {
        ...serverItem,
        ...prev,
        // Keep a stable local id when present; keep canonical runId always.
        id: prev.id || serverItem.id,
        runId: serverItem.runId,
      });
    }

    const merged = [...byRunId.values(), ...noRunId];
    merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return merged;
  });
}

export function startAudit(template, filters, criteria = []) {
  const id = crypto.randomUUID();
  const entry = {
    id,
    title: template?.name || "Audit",
    templateId: template?.id || null,
    submissionDeadline:
      template?.submissionDeadline ||
      template?.deadline ||
      template?.dueDate ||
      null,
    filters: filters || {},
    criteria: Array.isArray(criteria) ? criteria : [],
    refreshAvailable: false,
    refreshInFlight: false,
    createdAt: Date.now(),
    status: "running",
    messages: [],
    activity: [],
    reviewSummary: null,
    workbook: null,
    runId: null,
    // Epoch ms the live run started / ended — drives the activity-box elapsed
    // timer. Seeded locally on a fresh run, from the backend on a resume.
    runStartedAt: null,
    runEndedAt: null,
  };
  audits.update((list) => [entry, ...list]);
  currentAuditId.set(id);
  // The run is in flight from this moment (the run id arrives when the
  // create call returns) — keeps the derived runStatus "running" through
  // the network round-trip instead of flashing idle.
  activeStream.set({ auditId: id, runId: null });
  return id;
}

export function setAuditRefreshState(id, state = {}) {
  const patch = {};
  if (typeof state.refreshAvailable === "boolean") patch.refreshAvailable = state.refreshAvailable;
  if (typeof state.refreshInFlight === "boolean") patch.refreshInFlight = state.refreshInFlight;
  if (Object.keys(patch).length) updateAudit(id, patch);
}

export function setAuditRunId(id, runId) {
  updateAudit(id, { runId });
}

// Set the run's start/end timestamps (epoch ms) for the activity-box timer.
// Pass only the keys you mean to change; `null` is a meaningful value (reset).
export function setAuditRunTiming(id, { startedAt, endedAt } = {}) {
  const patch = {};
  if (startedAt !== undefined) patch.runStartedAt = startedAt;
  if (endedAt !== undefined) patch.runEndedAt = endedAt;
  if (Object.keys(patch).length) updateAudit(id, patch);
}

export function setAuditStatus(id, status) {
  updateAudit(id, { status });
}

export function syncAuditMessages(id, msgs) {
  updateAudit(id, { messages: msgs });
}

export function syncAuditActivity(id, acts) {
  updateAudit(id, { activity: acts });
}

export function syncAuditReviewSummary(id, summary) {
  updateAudit(id, { reviewSummary: summary || null });
}

// Persist the (live or finished) workbook onto the owner audit so an
// in-progress run's populated grid survives navigation away and back, and a
// completed analysis stays populated in the sidebar history.
export function syncAuditWorkbook(id, workbook) {
  updateAudit(id, { workbook });
}

// Functional update of the CURRENT audit's workbook (review-state flips,
// sheet switches). No-op when no audit is selected or it has no workbook yet.
export function updateCurrentAuditWorkbook(updater) {
  const id = get(currentAuditId);
  if (!id) return;
  audits.update((list) =>
    list.map((a) => {
      if (a.id !== id || !a.workbook) return a;
      const next = updater(a.workbook);
      return next && next !== a.workbook ? { ...a, workbook: next } : a;
    }),
  );
}

// Delete a sidebar analysis. If it reached the backend (has a runId), delete it
// there FIRST — stop its execution and remove its run dir + state-DB rows + the
// attribution — so it can't resurrect on the next reload via mergeServerRunHistory.
// Only on backend success (404 counts as already-gone) do we drop it locally.
// A purely-local entry that never ran (no runId) is just removed locally.
export async function deleteAudit(id) {
  const entry = get(audits).find((a) => a.id === id);
  if (entry?.runId) {
    await deleteRun(entry.runId);
  }
  audits.update((list) => list.filter((a) => a.id !== id));
  if (get(currentAuditId) === id) {
    currentAuditId.set(null);
  }
}

// Logout-scoped wipe for visible state. Persistence is user-scoped by key;
// keeping it allows the same authenticated user to regain their own history.
export function resetAuditHistory() {
  suppressNextPersist = true;
  audits.set([]);
  currentAuditId.set(null);
  activeStream.set(null);
}
