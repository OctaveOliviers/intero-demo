import { writable } from "svelte/store";
import { listTemplates } from "./api.js";

// All templates come from the server API (var-backed in stage 1).
// This store is the single source of truth for the home screen.
export const templates = writable([]);
export const templatesLoading = writable(false);

const DEFAULT_FILTERS = { dateFrom: "", dateTo: "", hospitals: "", cohort: "" };

export async function refreshTemplates() {
  templatesLoading.set(true);
  try {
    const items = await listTemplates();
    templates.set(
      items.map((a) => ({
        ...a,
        id: a.id,
        name: a.name,
        description: a.description,
        // Keep both keys so existing consumers can move gradually.
        excel_path: a.excel_path || null,
        fileName: a.fileName || a.excel_path || null,
        columns: Array.isArray(a.columns) ? a.columns : [],
        category: a.category || "Local audits",
        submissionDeadline: a.submissionDeadline || a.deadline || a.dueDate || null,
        defaultFilters: { ...DEFAULT_FILTERS },
      })),
    );
  } finally {
    templatesLoading.set(false);
  }
}
