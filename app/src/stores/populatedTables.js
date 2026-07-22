// The single source of truth for per-populated-table population state (decision 14 / Phase-4 T3).
//
// Every populated table (a sidebar row) owns ONE record here: identity, status, tablePopulationId,
// and the streamed artifacts (messages, activity, reviewSummary, workbook).
// The stream sink (chat.js) writes ONLY through the mutators below; the live
// views the components read (activity / activeWorkbook / reviewSummary /
// tablePopulationStatus / messages in chat.js) are DERIVED from these records — there is
// no second copy to keep in sync and no mirror layer.
//
// Persistence is the explicit subscriber at the bottom: the record list is
// saved to a per-user localStorage key on every change. This module imports
// no UI/navigation/chat modules — it is pure data.
import { writable, get } from "svelte/store";
import { authUser } from "./auth.js";
import { deleteTablePopulation } from "../lib/api.js";

// Frozen legacy key: this store predates the Table/population vocabulary and
// existing browsers hold per-user history under it — renaming it would strand
// that persisted data.
const STORAGE_PREFIX = "intero.audits.v1";
let currentStorageKey = null;
let suppressNextPersist = false;

function storageKeyForUser(user) {
  const id = user?.id || user?.username || null;
  return id ? `${STORAGE_PREFIX}:${id}` : null;
}

function normalizeTablePopulationId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function normalizeWorkbook(workbook, tablePopulationId) {
  if (!workbook || typeof workbook !== "object") return workbook;
  const workbookTablePopulationId = normalizeTablePopulationId(
    workbook.tablePopulationId || tablePopulationId,
  );
  return {
    ...workbook,
    tablePopulationId: workbookTablePopulationId,
  };
}

function normalizePopulatedTableEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const tablePopulationId = normalizeTablePopulationId(entry.tablePopulationId);
  return {
    ...entry,
    tablePopulationId,
    workbook: normalizeWorkbook(entry.workbook, tablePopulationId),
  };
}

function load(key) {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normalizePopulatedTableEntry).filter(Boolean)
      : [];
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

export const populatedTables = writable([]);
export const currentPopulatedTableId = writable(null);

// The table-population lifecycle currently in flight: { populatedTableId, tablePopulationId|null } from the
// moment a table population starts (before the table population id exists) until the stream reaches
// a terminal state. Drives the derived tablePopulationStatus — a record whose stored
// status is "running" but which is NOT the active stream (e.g. after a page
// reload) reads as idle.
export const activeStream = writable(null);

// Switch persisted namespace when authenticated user changes. Each user gets an
// isolated local history key; unauthenticated state shows no persisted history.
authUser.subscribe((user) => {
  const nextKey = storageKeyForUser(user);
  if (nextKey === currentStorageKey) return;
  currentStorageKey = nextKey;
  populatedTables.set(load(currentStorageKey));
  currentPopulatedTableId.set(null);
});

// The explicit persistence layer: records -> localStorage, nothing else.
populatedTables.subscribe((list) => {
  if (suppressNextPersist) {
    suppressNextPersist = false;
    return;
  }
  save(currentStorageKey, list);
});

function updatePopulatedTable(id, patch) {
  populatedTables.update((list) =>
    list.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}

function titleFromRequest(text) {
  const line = String(text || "").split("\n").map((v) => v.trim()).find(Boolean) || "";
  if (!line) return null;
  return line.length > 48 ? line.slice(0, 47).trimEnd() + "…" : line;
}

function mapServerTablePopulation(row) {
  const tablePopulationId = normalizeTablePopulationId(
    row?.tablePopulationId,
  );
  if (!tablePopulationId) return null;
  const request = row?.request || "";
  const parsedStartedAt = Date.parse(String(row?.started_at || ""));
  const startedAt = Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now();
  return {
    id: `table-population:${tablePopulationId}`,
    tablePopulationId,
    title:
      titleFromRequest(request) ||
      row?.audit_id ||
      `Table population ${tablePopulationId.slice(0, 8)}`,
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

// Merge server table-population history into the local sidebar model without duplicates.
// Canonical dedupe key is tablePopulationId; local richer fields
// (messages/workbook/status) are preserved when an entry for the same
// table-population already exists.
export function mergeServerTablePopulationHistory(rows) {
  const incoming = Array.isArray(rows)
    ? rows.map(mapServerTablePopulation).filter(Boolean)
    : [];
  if (incoming.length === 0) return;

  populatedTables.update((list) => {
    const byTablePopulationId = new Map();
    const withoutTablePopulation = [];

    for (const item of list) {
      const tablePopulationId = normalizeTablePopulationId(
        item?.tablePopulationId,
      );
      if (tablePopulationId) {
        byTablePopulationId.set(tablePopulationId, {
          ...item,
          tablePopulationId,
        });
      } else {
        withoutTablePopulation.push(item);
      }
    }

    for (const serverItem of incoming) {
      const prev = byTablePopulationId.get(serverItem.tablePopulationId);
      if (!prev) {
        byTablePopulationId.set(serverItem.tablePopulationId, serverItem);
        continue;
      }
      byTablePopulationId.set(serverItem.tablePopulationId, {
        ...serverItem,
        ...prev,
        // Keep a stable local id when present; keep canonical tablePopulationId always.
        id: prev.id || serverItem.id,
        tablePopulationId: serverItem.tablePopulationId,
        workbook: normalizeWorkbook(
          prev.workbook || serverItem.workbook,
          serverItem.tablePopulationId,
        ),
      });
    }

    const merged = [...byTablePopulationId.values(), ...withoutTablePopulation];
    merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return merged;
  });
}

export function startTablePopulation(template, filters, criteria = []) {
  const id = crypto.randomUUID();
  const entry = {
    id,
    title: template?.name || "Table",
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
    tablePopulationId: null,
    // Epoch ms the live run started / ended — drives the activity-box elapsed
    // timer. Seeded locally on a fresh run, from the backend on a resume.
    runStartedAt: null,
    runEndedAt: null,
  };
  populatedTables.update((list) => [entry, ...list]);
  currentPopulatedTableId.set(id);
  // The table-population is in flight from this moment (the id arrives when the
  // create call returns) — keeps the derived tablePopulationStatus "running" through
  // the network round-trip instead of flashing idle.
  activeStream.set({ populatedTableId: id, tablePopulationId: null });
  return id;
}

// Idempotently add seeded mock dashboard records to the sidebar. Adds only
// records whose id is not already present, so re-running on every login is a
// no-op. `createdAt` is stamped here to keep the seed source pure.
export function seedMockDashboardRecords(records) {
  if (!Array.isArray(records) || !records.length) return;
  populatedTables.update((list) => {
    const have = new Set(list.map((a) => a.id));
    const additions = records.filter((r) => r && r.id && !have.has(r.id)).map((r) => ({ createdAt: Date.now(), ...r }));
    return additions.length ? [...additions, ...list] : list;
  });
}

export function setPopulatedTableRefreshState(id, state = {}) {
  const patch = {};
  if (typeof state.refreshAvailable === "boolean") patch.refreshAvailable = state.refreshAvailable;
  if (typeof state.refreshInFlight === "boolean") patch.refreshInFlight = state.refreshInFlight;
  if (Object.keys(patch).length) updatePopulatedTable(id, patch);
}

export function setPopulatedTablePopulationId(id, tablePopulationId) {
  updatePopulatedTable(id, { tablePopulationId: normalizeTablePopulationId(tablePopulationId) });
}

// Set the table-population's start/end timestamps (epoch ms) for the activity-box timer.
// Pass only the keys you mean to change; `null` is a meaningful value (reset).
export function setPopulatedTableRunTiming(id, { startedAt, endedAt } = {}) {
  const patch = {};
  if (startedAt !== undefined) patch.runStartedAt = startedAt;
  if (endedAt !== undefined) patch.runEndedAt = endedAt;
  if (Object.keys(patch).length) updatePopulatedTable(id, patch);
}

export function setPopulatedTableStatus(id, status) {
  updatePopulatedTable(id, { status });
}

export function syncPopulatedTableMessages(id, msgs) {
  updatePopulatedTable(id, { messages: msgs });
}

export function syncPopulatedTableActivity(id, acts) {
  updatePopulatedTable(id, { activity: acts });
}

export function syncPopulatedTableReviewSummary(id, summary) {
  updatePopulatedTable(id, { reviewSummary: summary || null });
}

// Persist the (live or finished) workbook onto the owner populated table so an
// in-progress run's populated grid survives navigation away and back, and a
// completed analysis stays populated in the sidebar history.
export function syncPopulatedTableWorkbook(id, workbook) {
  const entry = get(populatedTables).find((a) => a.id === id) || null;
  updatePopulatedTable(id, {
    workbook: normalizeWorkbook(workbook, entry?.tablePopulationId || null),
  });
}

// Functional update of the CURRENT populated table's workbook (review-state
// flips, sheet switches). No-op when none is selected or it has no workbook yet.
export function updateCurrentPopulatedTableWorkbook(updater) {
  const id = get(currentPopulatedTableId);
  if (!id) return;
  populatedTables.update((list) =>
    list.map((a) => {
      if (a.id !== id || !a.workbook) return a;
      const next = updater(a.workbook);
      return next && next !== a.workbook ? { ...a, workbook: next } : a;
    }),
  );
}

// Delete a sidebar analysis. If it reached the backend (has a tablePopulationId), delete it
// there FIRST — stop its execution and remove its run dir + state-DB rows + the
// attribution — so it can't resurrect on the next reload via mergeServerTablePopulationHistory.
// Only on backend success (404 counts as already-gone) do we drop it locally.
// A purely-local entry that never ran (no tablePopulationId) is just removed locally.
export async function deletePopulatedTable(id) {
  const entry = get(populatedTables).find((a) => a.id === id);
  if (entry?.tablePopulationId) {
    await deleteTablePopulation(entry.tablePopulationId);
  }
  populatedTables.update((list) => list.filter((a) => a.id !== id));
  if (get(currentPopulatedTableId) === id) {
    currentPopulatedTableId.set(null);
  }
}

// Logout-scoped wipe for visible state. Persistence is user-scoped by key;
// keeping it allows the same authenticated user to regain their own history.
export function resetPopulatedTableHistory() {
  suppressNextPersist = true;
  populatedTables.set([]);
  currentPopulatedTableId.set(null);
  activeStream.set(null);
}
