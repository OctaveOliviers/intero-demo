import { writable, derived } from "svelte/store";
import { addToast } from "./toasts.js";
import { isMockMode } from "../lib/mock.js";

// Map of "<kind>:<id>" -> { kind, id, name, status, error }
export const indexingMap = writable(new Map());

// Keys that just transitioned indexing -> ready. We surface a green "ready"
// chip for these briefly, then drop the key so the chip disappears.
export const flashing = writable(new Set());

const FLASH_MS = 5000;

let eventSource = null;
let prevStatus = new Map();

function key(kind, id) {
  return `${kind}:${id}`;
}

function flash(k) {
  flashing.update((s) => new Set(s).add(k));
  setTimeout(() => {
    flashing.update((s) => {
      const next = new Set(s);
      next.delete(k);
      return next;
    });
  }, FLASH_MS);
}

function applyEntry(entry) {
  indexingMap.update((m) => {
    const k = key(entry.kind, entry.id);
    const before = prevStatus.get(k);
    m.set(k, entry);
    // Only toast/flash on a real transition (not on the initial snapshot).
    if (before && before !== entry.status) {
      if (entry.status === "ready") {
        addToast({ kind: "success", message: `${entry.name} is ready to use.` });
        if (before === "indexing") flash(k);
      } else if (entry.status === "error") {
        addToast({ kind: "error", message: `${entry.name} indexing failed: ${entry.error || "unknown error"}` });
      }
    }
    prevStatus.set(k, entry.status);
    return m;
  });
}

export function startIndexingSubscription() {
  // In mock mode there is no backend; indexing entries are pushed into the
  // store directly by mockSimulateIndexing, so the SSE stream would only spam
  // connection-refused errors and reconnect forever.
  if (isMockMode("indexing")) return;
  if (eventSource) return;
  try {
    eventSource = new EventSource("/api/indexing/stream");
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        applyEntry(data);
      } catch {
        // ignore malformed lines
      }
    };
    eventSource.onerror = () => {
      // Auto-reconnect happens implicitly via EventSource retry.
    };
  } catch (err) {
    console.error("Failed to subscribe to indexing stream:", err);
  }
}

// Pure chip resolver: returns "indexing" | "error" | "ready" (transient green)
// | null (no chip). Pass the current store values so callers stay reactive.
export function chipOf(kind, id, map, flashSet) {
  const entry = map.get(key(kind, id));
  if (!entry) return null;
  if (entry.status === "indexing") return "indexing";
  if (entry.status === "error") return "error";
  if (entry.status === "ready" && flashSet.has(key(kind, id))) return "ready";
  return null;
}

// Error detail for a card's tooltip, if any.
export function errorOf(kind, id, map) {
  return map.get(key(kind, id))?.error || "";
}

export function statusFor(kind, id) {
  return derived(indexingMap, (m) => m.get(key(kind, id))?.status || "ready");
}
