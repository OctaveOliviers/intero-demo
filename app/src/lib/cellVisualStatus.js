/**
 * Minimal metadata contract consumed by the visual-status mapper.
 *
 * @typedef {Object} CellVisualStatusMeta
 * @property {string | null | undefined} [state]
 * @property {string | null | undefined} [audit_state]
 * @property {string | null | undefined} [confidence]
 * @property {string | null | undefined} [confidence_level]
 * @property {string | null | undefined} [review_state]
 * @property {string | null | undefined} [reviewState]
 * @property {string | null | undefined} [kind]
 * @property {CellVisualStatusMeta | null | undefined} [meta]
 * @property {CellVisualStatusMeta | null | undefined} [metadata]
 */

export const CELL_VISUAL_STATUS = Object.freeze({
  LEGACY: "legacy",
  NEEDS_REVIEW: "needs_review",
  REVIEWED: "reviewed",
});

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function readMetaField(meta, keys) {
  const source = asObject(meta);
  if (!source) return "";
  let emptyTopLevel = undefined;
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (hasMeaningfulValue(value)) return value;
    if (emptyTopLevel === undefined) emptyTopLevel = value;
  }
  const nested = asObject(source.meta) || asObject(source.metadata);
  if (!nested) return emptyTopLevel === undefined ? "" : emptyTopLevel;
  let emptyNested = undefined;
  for (const key of keys) {
    if (!(key in nested)) continue;
    const value = nested[key];
    if (hasMeaningfulValue(value)) return value;
    if (emptyNested === undefined) emptyNested = value;
  }
  if (emptyTopLevel !== undefined) return emptyTopLevel;
  return emptyNested === undefined ? "" : emptyNested;
}

/**
 * Map cell metadata to a visual status.
 *
 * Precedence:
 * 1) state=not_applicable -> legacy
 * 2) confidence=low|medium -> needs_review
 * 3) review_state=not_reviewed -> needs_review
 * 4) kind=interpret|interpretive with missing review_state -> needs_review
 * 5) otherwise -> reviewed
 *
 * @param {CellVisualStatusMeta | null | undefined} meta
 * @returns {"legacy" | "needs_review" | "reviewed"}
 */
export function mapCellVisualStatus(meta) {
  const state = normalize(readMetaField(meta, ["state", "audit_state"]));
  const confidence = normalize(readMetaField(meta, ["confidence", "confidence_level"]));
  const reviewState = normalize(readMetaField(meta, ["review_state", "reviewState"]));
  const kind = normalize(readMetaField(meta, ["kind"]));

  if (state === "not_applicable") {
    return CELL_VISUAL_STATUS.LEGACY;
  }

  if (confidence === "low" || confidence === "medium") {
    return CELL_VISUAL_STATUS.NEEDS_REVIEW;
  }

  if (reviewState === "not_reviewed") {
    return CELL_VISUAL_STATUS.NEEDS_REVIEW;
  }

  if ((kind === "interpret" || kind === "interpretive") && !reviewState) {
    return CELL_VISUAL_STATUS.NEEDS_REVIEW;
  }

  return CELL_VISUAL_STATUS.REVIEWED;
}
