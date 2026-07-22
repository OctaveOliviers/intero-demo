import { writable } from "svelte/store";

export const toasts = writable([]);
let nextId = 1;

// `action` (optional) carries a click target so a toast can be a hyperlink/CTA
// (Q42 — the table-completion toast that opens the finished table). Shape:
// { label, onClick }. Existing toasts (no action) are unchanged — the field is
// simply absent. A longer default duration applies when an action is present so
// the user has time to click it.
export function addToast({ kind = "info", message, duration, action = null }) {
  const id = nextId++;
  const ttl = duration ?? (action ? 8000 : 4000);
  const toast = { id, kind, message };
  if (action) toast.action = action;
  toasts.update((list) => [...list, toast]);
  if (ttl > 0) {
    setTimeout(() => dismissToast(id), ttl);
  }
}

export function dismissToast(id) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}
