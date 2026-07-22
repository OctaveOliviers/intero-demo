// Structural-parity contract for the four artifactWorkspace locale packs.
//
// The Lung MOC demo authors every human-readable string in English and mirrors
// it into fr/nl/de (see the spec's Localization contract). This test proves the
// two normative invariants of that mirror:
//
//   1. Identical shape — all four packs expose the SAME set of key paths, and
//      the leaf at each path has the same kind (string / function / number) and,
//      for functions, the same arity. A translator cannot add, drop, rename, or
//      retype a key without failing here.
//   2. Identical language-invariant values — patient IDs, ISO dates, numeric
//      measurements (%, mm, cm, mg, Gy, counts), TNM strings, UICC stage groups,
//      Annexe 55 code numbers, ECOG scores and the fixed biomarker/genomic
//      tokens embedded in any pack string must be BYTE-IDENTICAL across the four
//      packs. Only the surrounding prose may differ. A translator who rewrites a
//      date, drops a "%", or re-spells "2.1cm" as "2,1cm" fails here.
//
// Linguistic quality is deliberately NOT checked — that is the human reviewer's
// job. This test only guards structure and invariants.

import test from "node:test";
import assert from "node:assert/strict";

import en from "./mock/content/en.js";
import fr from "./mock/content/fr.js";
import nl from "./mock/content/nl.js";
import de from "./mock/content/de.js";

const PACKS = { en, fr, nl, de };
const LOCALES = Object.keys(PACKS);

// --- Shape walk -------------------------------------------------------------
// Collect, for every leaf, its key path and a kind descriptor. Functions record
// their arity; strings/numbers record their type. Objects/arrays recurse.
function collectShape(node, path, out) {
  if (typeof node === "function") {
    out.set(path, `function/${node.length}`);
  } else if (Array.isArray(node)) {
    out.set(path, `array/${node.length}`);
    node.forEach((item, i) => collectShape(item, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    const keys = Object.keys(node).sort();
    out.set(path, `object/${keys.join(",")}`);
    for (const key of keys) collectShape(node[key], `${path}.${key}`, out);
  } else {
    out.set(path, typeof node);
  }
  return out;
}

// --- Invariant-token extraction ---------------------------------------------
// The verbatim, language-invariant tokens any pack string may legitimately
// carry. If two packs disagree on these, an invariant leaked or was mangled.
const INVARIANT_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/g, // ISO dates
  /L-\d{4}/g, // patient ids
  /\d+(?:\.\d+)?\s?(?:%|mm|cm|mg|Gy)/g, // measurements with units
  /\b[cyp]{1,2}T\d\w*\b/g, // TNM T-token
  /\b[cyp]?N\d\b/g, // TNM N-token
  /\bcM\d\w*\b/g, // TNM M-token
  /\b(?:IA|IB|IIA|IIB|IIIA|IIIB|IVA|IVB|IV)\b/g, // UICC stage groups
  /KRAS G12C|exon 19 del|ALK\+|22C3|EGFR|PD-L1|TPS|FEV1|G-CSF|QTc|LFTs/g, // fixed clinical tokens
  /\bAnnexe 55\b/g, // schema name (invariant across languages)
  /\d+/g, // any remaining bare integer (ECOG scores, counts, ward numbers, "55")
];

function invariantTokens(str) {
  const tokens = [];
  for (const re of INVARIANT_PATTERNS) {
    const matches = str.match(re);
    if (matches) tokens.push(...matches);
  }
  return tokens.sort();
}

// Every string a pack renders: plain string leaves, plus the literal text of
// function leaves (a function that hardcodes an invariant would surface it in
// its source). Keyed by path so we compare like-for-like across packs.
function collectStrings(node, path, out) {
  if (typeof node === "function") {
    out.set(path, node.toString());
  } else if (typeof node === "string") {
    out.set(path, node);
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const key of Object.keys(node)) collectStrings(node[key], `${path}.${key}`, out);
  }
  return out;
}

test("all four artifactWorkspace packs expose the identical shape", () => {
  const shapes = {};
  for (const loc of LOCALES) {
    assert.ok(PACKS[loc].artifactWorkspace, `${loc} pack is missing the artifactWorkspace namespace`);
    shapes[loc] = collectShape(PACKS[loc].artifactWorkspace, "aw", new Map());
  }
  const enShape = shapes.en;
  for (const loc of LOCALES.filter((l) => l !== "en")) {
    const locShape = shapes[loc];
    // Same set of paths.
    const enPaths = [...enShape.keys()].sort();
    const locPaths = [...locShape.keys()].sort();
    assert.deepEqual(locPaths, enPaths, `${loc} pack key paths differ from en`);
    // Same kind/arity at each path.
    for (const path of enPaths) {
      assert.equal(
        locShape.get(path),
        enShape.get(path),
        `${loc} pack leaf kind/arity differs from en at ${path} (${locShape.get(path)} vs ${enShape.get(path)})`,
      );
    }
  }
});

// Every ${...} interpolation expression inside a function leaf, sorted. A leaf
// like `(name, code) => `${name} (code ${code})`` yields ["code", "name"].
function interpolationExprs(fnSource) {
  const exprs = [];
  const re = /\$\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(fnSource)) !== null) exprs.push(m[1].trim());
  return exprs.sort();
}

test("function leaves preserve the identical interpolation expressions across packs", () => {
  // A translator who drops or renames a ${...} interpolation keeps the function
  // arity but silently breaks rendering (a value the logic supplies goes
  // missing). Arity parity alone would not catch it; this does. Walk en's
  // functions and compare each against the other packs.
  const enFns = new Map();
  (function walk(node, path) {
    if (typeof node === "function") enFns.set(path, interpolationExprs(node.toString()));
    else if (Array.isArray(node)) node.forEach((it, i) => walk(it, `${path}[${i}]`));
    else if (node && typeof node === "object") for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`);
  })(en.artifactWorkspace, "aw");

  for (const loc of LOCALES.filter((l) => l !== "en")) {
    (function walk(node, path) {
      if (typeof node === "function") {
        assert.deepEqual(
          interpolationExprs(node.toString()),
          enFns.get(path),
          `${loc} pack interpolation expressions differ from en at ${path}`,
        );
      } else if (Array.isArray(node)) node.forEach((it, i) => walk(it, `${path}[${i}]`));
      else if (node && typeof node === "object") for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`);
    })(PACKS[loc].artifactWorkspace, "aw");
  }
});

test("language-invariant tokens are identical across all four packs", () => {
  const strings = {};
  for (const loc of LOCALES) strings[loc] = collectStrings(PACKS[loc].artifactWorkspace, "aw", new Map());
  const enStrings = strings.en;
  for (const path of [...enStrings.keys()].sort()) {
    const enTokens = invariantTokens(enStrings.get(path));
    for (const loc of LOCALES.filter((l) => l !== "en")) {
      const locStr = strings[loc].get(path);
      assert.ok(locStr !== undefined, `${loc} pack is missing string leaf ${path}`);
      assert.deepEqual(
        invariantTokens(locStr),
        enTokens,
        `${loc} pack invariant tokens differ from en at ${path}\n  en:  ${enStrings.get(path)}\n  ${loc}: ${locStr}`,
      );
    }
  }
});
