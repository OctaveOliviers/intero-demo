// Pure chip helpers for the Dataset detail page (library-and-sources.md §A).
// The label is rendered BESIDE the chip; only the predicate VALUE lives inside
// the pill (e.g. label "Gestation (weeks)" + chip "≥ 39"). No Svelte, no fetch —
// node:test drives these directly.
//
// A Dataset criterion's predicate `op` is the contract symbol enum
// (specs/product/contracts/dataset.schema.json: ">=", "<=", ">", "<", "=", "in",
// "between") — NOT the template criteria's gte/lte vocabulary. The backend supplies a
// ready `display` one-liner (store.display_predicate); we prefer it and fall back
// to formatting the contract ops ourselves, so the chip is correct whether the
// data came from the real API or the mock.

const OP_SYMBOL = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=" };
const SOURCE_RE = /^\s*(.+?)\s*->\s*([^.]+)\.(.+?)\s*$/;

// The full "<label> <symbol> <value>" one-liner for a criterion, from the contract
// predicate. Mirrors the backend's store.display_predicate so the mock can recompute
// `display` after an edit and match what the server would return.
export function datasetPredicateDisplay(criterion) {
  const label = criterion?.label || criterion?.criterion_id || "";
  const p = criterion?.predicate || {};
  const v = p.value;
  if (p.op === "in") {
    const items = Array.isArray(v) ? v : [v];
    return `${label}: ${items.join(", ")}`;
  }
  if (p.op === "between") {
    const items = Array.isArray(v) ? v : [v];
    return `${label} ${items[0] ?? ""} – ${items[1] ?? ""}`;
  }
  return `${label} ${OP_SYMBOL[p.op] || p.op || ""} ${v}`.trim();
}

// The value shown inside a filter chip: the criterion's `display` with the label
// prefix stripped (the row renders the label separately), e.g. "≥ 39".
export function criterionChipValue(criterion) {
  const label = criterion?.label || criterion?.criterion_id || "";
  const full = criterion?.display || datasetPredicateDisplay(criterion);
  if (label && full.startsWith(label)) {
    return full.slice(label.length).replace(/^[\s:]+/, "").trim();
  }
  return full;
}

// The read-only SQL view, with the bind parameters substituted for their actual
// values, so the statement reads literally ("… gestation_weeks >= 39 …") instead
// of opaque ":c0" placeholders. Display-only — the stored SQL stays parameterised
// (the values are bound, never injected). Strings are quoted; numbers are bare.
export function inlineSql(cohortSql, criteria) {
  if (!cohortSql) return "";
  const params = {};
  for (const c of criteria || []) Object.assign(params, c?.params || {});
  return cohortSql.replace(/:([A-Za-z_]\w*)/g, (m, name) => {
    if (!(name in params)) return m;
    const v = params[name];
    return typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  });
}

// Raw text shown in the chip's edit input: the scalar value, or array values
// comma-joined (between bounds, in members).
export function criterionInputText(criterion) {
  const v = criterion?.predicate?.value;
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

// Parse the edit input back into a bind value, keeping the predicate's shape
// (scalar vs array) and casting number-type values. Returns the value to send to
// patchDatasetCriterion, or null when the input is unusable (empty, non-numeric
// for a number filter, wrong arity for `between`) so the caller keeps the old one.
export function parseCriterionInput(criterion, text) {
  const raw = String(text ?? "").trim();
  if (!raw || !criterion?.predicate) return null;
  const wasArray = Array.isArray(criterion.predicate.value);
  const parts = wasArray ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [raw];
  if (parts.length === 0) return null;
  let cast;
  if (criterion.type === "number") {
    cast = parts.map((s) => Number(s));
    if (cast.some((n) => Number.isNaN(n))) return null;
  } else {
    cast = parts;
  }
  const value = wasArray ? cast : cast[0];
  if (criterion.predicate.op === "between" && (!Array.isArray(value) || value.length !== 2)) {
    return null;
  }
  return value;
}

// Parse a criterion source reference ("<db> -> <table>.<column>").
export function parseCriterionSource(source) {
  const m = SOURCE_RE.exec(String(source || ""));
  if (!m) return null;
  return {
    database: m[1].trim(),
    table: m[2].trim(),
    column: m[3].trim(),
  };
}

function criterionModelColumn(criterion, databaseModelsById) {
  const src = parseCriterionSource(criterion?.source);
  if (!src) return null;
  const model = databaseModelsById?.[src.database];
  const tables = Array.isArray(model?.tables) ? model.tables : [];
  const table = tables.find((t) => t?.name === src.table);
  const cols = Array.isArray(table?.columns) ? table.columns : [];
  return cols.find((c) => c?.name === src.column) || null;
}

// The explicit structured values/codes a criterion can filter against, when its
// source column declares them in model.json.
export function criterionOptionValues(criterion, databaseModelsById) {
  const col = criterionModelColumn(criterion, databaseModelsById);
  if (!col) return [];
  const values = Array.isArray(col.values) ? col.values.map((v) => String(v)) : [];
  const codes = col.codes && typeof col.codes === "object"
    ? Object.keys(col.codes).map((v) => String(v))
    : [];
  return [...new Set([...values, ...codes])];
}

// Concise option hint for the chip editor ("a, b, c +2 more").
export function criterionOptionHint(criterion, databaseModelsById, limit = 6) {
  const values = criterionOptionValues(criterion, databaseModelsById);
  if (!values.length) return "";
  const shown = values.slice(0, Math.max(1, limit));
  const rest = values.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

// Structured-calendar editable only for scalar date predicates (not date ranges).
export function isScalarDateCriterion(criterion) {
  return criterion?.type === "date" && !Array.isArray(criterion?.predicate?.value);
}
