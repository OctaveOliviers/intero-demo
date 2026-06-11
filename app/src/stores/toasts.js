import { writable } from "svelte/store";

export const toasts = writable([]);
let nextId = 1;

export function addToast({ kind = "info", message, duration = 4000 }) {
  const id = nextId++;
  toasts.update((list) => [...list, { id, kind, message }]);
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
}

export function dismissToast(id) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}
