import { derived, get, writable } from "svelte/store";
import { listSharedWithMe } from "../lib/api.js";
import {
  parseProcessedGrantIds,
  pendingGrantByResourceId,
  serializeProcessedGrantIds,
} from "../lib/sharedNotifications.js";
import { authStatus, authUser } from "./auth.js";

const STORAGE_PREFIX = "intero.sharedGrants.processed";

export const inboundSharedGrants = writable([]);
export const processedSharedGrantIds = writable(new Set());
export const sharedNotificationsError = writable(null);

let loadedForUserKey = null;
let refreshInFlight = null;

function userKey(user) {
  return user?.id || user?.username || null;
}

function storageKey(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined";
}

function readProcessedForUser(key) {
  if (!key || !canUseLocalStorage()) return new Set();
  return parseProcessedGrantIds(localStorage.getItem(storageKey(key)));
}

function writeProcessedForUser(key, ids) {
  if (!key || !canUseLocalStorage()) return;
  localStorage.setItem(storageKey(key), serializeProcessedGrantIds(ids));
}

function resetForNoUser() {
  loadedForUserKey = null;
  inboundSharedGrants.set([]);
  processedSharedGrantIds.set(new Set());
  sharedNotificationsError.set(null);
}

function ensureUserLoaded(key) {
  if (loadedForUserKey === key) return;
  loadedForUserKey = key;
  inboundSharedGrants.set([]);
  processedSharedGrantIds.set(readProcessedForUser(key));
  sharedNotificationsError.set(null);
}

export const pendingDatasetGrantByResourceId = derived(
  [inboundSharedGrants, processedSharedGrantIds],
  ([$inboundSharedGrants, $processedSharedGrantIds]) =>
    pendingGrantByResourceId($inboundSharedGrants, $processedSharedGrantIds),
);

export const pendingTemplateGrantByResourceId = derived(
  [inboundSharedGrants, processedSharedGrantIds],
  ([$inboundSharedGrants, $processedSharedGrantIds]) =>
    pendingGrantByResourceId($inboundSharedGrants, $processedSharedGrantIds, "template"),
);

export const hasPendingDatasetShares = derived(
  pendingDatasetGrantByResourceId,
  ($pendingDatasetGrantByResourceId) => Object.keys($pendingDatasetGrantByResourceId).length > 0,
);

export const hasPendingTemplateShares = derived(
  pendingTemplateGrantByResourceId,
  ($pendingTemplateGrantByResourceId) => Object.keys($pendingTemplateGrantByResourceId).length > 0,
);

export async function refreshSharedNotifications({ force = false } = {}) {
  if (get(authStatus) !== "authenticated") {
    resetForNoUser();
    return;
  }
  const key = userKey(get(authUser));
  if (!key) {
    resetForNoUser();
    return;
  }
  ensureUserLoaded(key);

  if (refreshInFlight && !force) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const rows = await listSharedWithMe();
      if (loadedForUserKey === key && get(authStatus) === "authenticated") {
        inboundSharedGrants.set(Array.isArray(rows) ? rows : []);
        sharedNotificationsError.set(null);
      }
    } catch (err) {
      if (loadedForUserKey === key) {
        sharedNotificationsError.set(err?.message || "Failed to load shared items");
      }
    } finally {
      if (refreshInFlight) refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function markSharedGrantProcessed(grantId) {
  if (!grantId) return;
  const key = loadedForUserKey || userKey(get(authUser));
  processedSharedGrantIds.update((ids) => {
    const next = new Set(ids);
    next.add(grantId);
    writeProcessedForUser(key, next);
    return next;
  });
}
