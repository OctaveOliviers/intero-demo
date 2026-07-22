// templateCatalog.js — the mock catalog of output templates.
//
// A Template names a deliverable Excel workbook and the columns it will be
// populated with. Real local workbooks live under data/templates/*.xlsx; the
// National entries are plausible invented audits (NNAP / NHFD / MINAP).
//
// Template = { id, name, category, fileName, description, columns: string[] }
//
// The translatable content — each group's `category` and each template's `name`,
// `description` and `columns` (alongside the fixed id/fileName/submissionDeadline)
// — lives in the locale-selected content pack (src/lib/mock/content). Switching
// the active locale switches the catalog's language with no logic change here.

import { CONTENT } from "./mock/content/index.js";

export const TEMPLATE_CATALOG = CONTENT.catalog;

// Flat lookup by template id.
export function getTemplateById(id) {
  for (const group of TEMPLATE_CATALOG) {
    const found = group.templates.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// Flat list used by template resolution paths that need a single pool.
export function allTemplatesFlat() {
  return TEMPLATE_CATALOG.flatMap((group) => group.templates);
}
