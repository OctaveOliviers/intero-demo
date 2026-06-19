// templateCatalog.js — the catalog of output templates the contract can target.
//
// A Template names a deliverable Excel workbook and the columns it will be
// populated with. `columns` feeds the hover-preview in OutputSpec; `description`
// is the one-line blurb shown above it. Real local workbooks live under
// docs/templates/*.xlsx; the National entries are plausible invented audits
// (NNAP / NHFD / MINAP) used only for the picker + preview.
//
// Template = { id, name, category, fileName, description, columns: string[] }
//
// The translatable content — each group's `category` and each template's `name`,
// `description` and `columns` (alongside the fixed id/fileName/submissionDeadline)
// — lives in the locale-selected content pack (src/lib/mock/content). Switching
// the active locale switches the catalog's language with no logic change here.

import { CONTENT } from "./mock/content/index.js";

export const TEMPLATE_CATALOG = CONTENT.catalog;

let runtimeTemplateGroups = null;

// Optional runtime override used by the real-mode Home flow so template
// pickers + resolution can point to backend audits (/api/audits). Mock mode
// leaves this unset and continues to use TEMPLATE_CATALOG.
export function setRuntimeTemplateGroups(groups) {
  runtimeTemplateGroups = Array.isArray(groups) ? groups : null;
}

function activeTemplateGroups() {
  return runtimeTemplateGroups || TEMPLATE_CATALOG;
}

// Flat lookup by template id.
export function getTemplateById(id) {
  for (const group of activeTemplateGroups()) {
    const found = group.templates.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// The catalog as-is (grouped by category) — used by the OutputSpec picker.
export function allTemplatesGrouped() {
  return activeTemplateGroups();
}

// Flat list used by template resolution paths that need a single pool.
export function allTemplatesFlat() {
  return activeTemplateGroups().flatMap((group) => group.templates);
}
