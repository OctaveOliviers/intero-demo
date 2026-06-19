// Pure join + description-derivation logic for the audit-detail three-section
// page (doc 9 §Card detail view). No Svelte, no fetch — node:test drives it.
//
// - Template chips: spec.json `fields` joined with mapping.json `fields[]`
//   (by section/region + cell, header as fallback); the one-sentence
//   description depends on the mapped field's kind/code.
// - Database chips: mapping `databases` ids resolved to names + a sentence
//   (`database_summaries` first, generic summary/description as fallback).
// - Criteria chips: mechanical display regeneration + predicate-value parsing
//   for the editable `fixed_criteria` chips.

import { monthNames } from "../i18n/localeTag.js";

const CODE_PREVIEW_LIMIT = 4;

function isCodeMap(code) {
  return Boolean(code) && typeof code === "object" && !Array.isArray(code) && Object.keys(code).length > 0;
}

// Mechanically derived code explanation — e.g. "1 = Male, 2 = Female" — never
// LLM/prose (doc 9: a code can never be hallucinated). Capped at
// CODE_PREVIEW_LIMIT entries, then "…".
export function codeText(code) {
  if (!isCodeMap(code)) return "";
  const entries = Object.entries(code).map(([k, v]) => `${k} = ${v}`);
  if (entries.length > CODE_PREVIEW_LIMIT) {
    return entries.slice(0, CODE_PREVIEW_LIMIT).join(", ") + ", …";
  }
  return entries.join(", ");
}

function cellKey(section, cell) {
  const s = typeof section === "string" ? section.trim().toUpperCase() : "";
  const c = typeof cell === "string" ? cell.trim().toUpperCase() : "";
  return s && c ? `${s}:${c}` : null;
}

function headerKey(header) {
  const h = typeof header === "string" ? header.trim().toLowerCase() : "";
  return h || null;
}

// One chip descriptor per spec field. Join key: spec `section`+`cell` against
// mapping `region`+`cell` (positional, exact in the artifacts), with a
// case-insensitive header/name match as fallback. With no mapping every chip
// is name-only (`notes` kept where present) and `mapped` is false throughout.
export function buildFieldChips(spec, mapping) {
  const specFields = Array.isArray(spec?.fields) ? spec.fields : [];
  const mappingFields = Array.isArray(mapping?.fields) ? mapping.fields : [];

  const byCell = new Map();
  const byHeader = new Map();
  for (const mf of mappingFields) {
    const ck = cellKey(mf?.region ?? mf?.section, mf?.cell);
    if (ck && !byCell.has(ck)) byCell.set(ck, mf);
    const hk = headerKey(mf?.header);
    if (hk && !byHeader.has(hk)) byHeader.set(hk, mf);
  }

  return specFields.map((f, i) => {
    const name = typeof f?.name === "string" ? f.name : "";
    const mapped = mapping
      ? byCell.get(cellKey(f?.section ?? f?.region, f?.cell)) || byHeader.get(headerKey(name)) || null
      : null;
    const notes = typeof f?.notes === "string" ? f.notes.trim() : "";
    // Coded direct → mechanical code text; interpret / uncoded direct /
    // unmapped → the spec field's notes (plain one-liner, may be empty).
    const description = mapped && isCodeMap(mapped.code) ? codeText(mapped.code) : notes;
    return {
      key: f?.id || `${f?.section || ""}/${f?.cell || ""}/${i}`,
      name,
      kind: mapped?.kind || null,
      description,
      mapped: Boolean(mapped),
    };
  });
}

// One chip per mapping `databases` id: the database name (resolved from the
// list rows, the id as fallback) + one sentence — the template-specific
// `database_summaries` entry first, then the database's generic
// `summary`/`description`. No mapping → no chips (the section shows a hint).
export function buildDatabaseChips(mapping, databaseRows) {
  if (!mapping) return [];
  const ids = Array.isArray(mapping.databases) ? mapping.databases : [];
  const rows = Array.isArray(databaseRows) ? databaseRows : [];
  const summaries =
    mapping.database_summaries && typeof mapping.database_summaries === "object"
      ? mapping.database_summaries
      : {};
  const sentence = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return ids.map((id) => {
    const row = rows.find((r) => r?.id === id) || null;
    return {
      id,
      name: row?.name || id,
      summary: sentence(summaries[id]) || sentence(row?.summary) || sentence(row?.description) || "",
    };
  });
}

const MONTHS = monthNames("short");

function formatValue(v, type) {
  if (type === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${Number(m[1])}`;
  }
  return String(v);
}

// Mechanical one-line rendering of a fixed criterion, used to regenerate
// `display` after the user edits a predicate value.
export function predicateDisplay(criterion) {
  const label = criterion?.label || criterion?.criterion_id || "";
  const p = criterion?.predicate || {};
  const unit = p.unit ? ` ${p.unit}` : "";
  const vals = (Array.isArray(p.value) ? p.value : [p.value]).map((v) => formatValue(v, criterion?.type));
  switch (p.op) {
    case "gte":
      return `${label} ≥ ${vals[0]}${unit}`;
    case "lte":
      return `${label} ≤ ${vals[0]}${unit}`;
    case "eq":
      return `${label} = ${vals[0]}${unit}`;
    case "in":
      return `${label}: ${vals.join(", ")}`;
    case "between":
      return `${label} ${vals[0]} – ${vals[1]}${unit}`;
    default:
      return label;
  }
}

// Raw text shown in the chip's edit input: the scalar value, or array values
// comma-joined (between bounds, in members).
export function predicateInputText(criterion) {
  const v = criterion?.predicate?.value;
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

// Parse the edit input back into the criterion: keeps the predicate's shape
// (scalar vs array), casts number-type values, and regenerates `display`
// mechanically. Returns the updated criterion, or null when the input is
// unusable (empty, non-numeric for a number dimension, wrong arity for
// `between`) so the caller can keep the previous value.
export function applyPredicateInput(criterion, text) {
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
  if (criterion.predicate.op === "between" && (!Array.isArray(value) || value.length !== 2)) return null;
  const next = { ...criterion, predicate: { ...criterion.predicate, value } };
  return { ...next, display: predicateDisplay(next) };
}
