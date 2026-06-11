import { writable } from "svelte/store";
import {
  listDatabases,
  uploadDatabase,
  renameDatabase as apiRename,
  deleteDatabase as apiDelete,
} from "../lib/api.js";
export const databases = writable([]);
export const databasesLoading = writable(false);

export async function refreshDatabases() {
  databasesLoading.set(true);
  try {
    // Library cards/details read these API rows as authoritative metadata.
    const items = await listDatabases();
    databases.set(items.map((d) => ({ ...d })));
  } finally {
    databasesLoading.set(false);
  }
}

export async function addDatabase(file) {
  const info = await uploadDatabase(file);
  await refreshDatabases();
  return info;
}

export async function renameDatabase(id, name) {
  const info = await apiRename(id, name);
  await refreshDatabases();
  return info;
}

export async function deleteDatabase(id) {
  await apiDelete(id);
  await refreshDatabases();
}
