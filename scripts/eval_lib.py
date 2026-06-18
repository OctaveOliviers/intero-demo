"""Pure scoring functions for the indexing + mapping evals (Phase-4 T10).

The quality bars (decisions 6/8 of the reconciliation log):

* **Indexing** — re-index the source material and score the candidate
  `spec.json` / `model.json` against the human-verified seed goldens: field
  coverage, types, coded-value capture, criteria.
* **Mapping** — score a rebuilt `mapping.json` against the golden seed
  mapping per field (sources / kind / code agreement); the runner pairs this
  with a downstream Tier-1 fill-rate.

Every scorer returns ``{"metrics": {...0..1 rates + counts...},
"mismatches": [...human-readable strings...]}`` — the mismatch list is what
makes a regression diagnosable, not just detectable. No I/O, no LLM here;
``core/test/eval_lib_test.py`` drives these against the real seed shapes.
"""

from __future__ import annotations

import re
from typing import Any


def _rate(hits: int, total: int) -> float:
    return round(hits / total, 4) if total else 1.0


def _norm(value: Any) -> str:
    return str(value).strip().lower() if value is not None else ""


# --- audit spec (spec.json) --------------------------------------------------

_CRITERION_STOPWORDS = frozenset({"of", "in", "at", "the", "a", "an", "and", "status"})


def _criterion_tokens(criterion: dict) -> set[str]:
    """The significant tokens of a criterion's id + label, for concept matching."""
    text = f"{criterion.get('id') or ''} {criterion.get('label') or ''}"
    return {
        t for t in re.split(r"[^a-z0-9]+", _norm(text)) if t and t not in _CRITERION_STOPWORDS
    }


def _field_key(field: dict) -> tuple[str, str]:
    """Position is the stable identity: (section, cell). Ids/names are what the
    LLM writes — exactly what we're scoring — so they can't be the join key."""
    return (_norm(field.get("section")), _norm(field.get("cell")))


def score_audit_spec(golden: dict, candidate: dict) -> dict:
    gold_fields = {_field_key(f): f for f in golden.get("fields") or []}
    cand_fields = {_field_key(f): f for f in candidate.get("fields") or []}

    mismatches: list[str] = []
    matched = [k for k in gold_fields if k in cand_fields]
    for k in gold_fields:
        if k not in cand_fields:
            mismatches.append(f"missing field {k[0]}!{k[1]} ({gold_fields[k].get('name')!r})")
    for k in cand_fields:
        if k not in gold_fields:
            mismatches.append(f"extra field {k[0]}!{k[1]} ({cand_fields[k].get('name')!r})")

    type_hits = 0
    codes_total = 0
    codes_hits = 0
    notes_total = 0
    notes_hits = 0
    cand_notes = 0
    for k in matched:
        g, c = gold_fields[k], cand_fields[k]
        if _norm(g.get("type")) == _norm(c.get("type")):
            type_hits += 1
        else:
            mismatches.append(
                f"type drift {k[0]}!{k[1]}: golden {g.get('type')!r} vs candidate {c.get('type')!r}"
            )
        g_codes = g.get("permitted_values")
        if isinstance(g_codes, dict) and g_codes:
            codes_total += 1
            c_codes = c.get("permitted_values")
            if isinstance(c_codes, dict) and set(c_codes) == set(g_codes):
                codes_hits += 1
            else:
                mismatches.append(
                    f"permitted_values drift {k[0]}!{k[1]}: golden keys {sorted(g_codes)} "
                    f"vs candidate {sorted(c_codes) if isinstance(c_codes, dict) else c_codes!r}"
                )
        # Golden-relative: only fields the GOLDEN annotates count toward the
        # rate (the cord-pH golden carries very few notes today — a golden
        # weakness the eval surfaces via candidate_notes, not a candidate
        # failure). Candidate-side notes are reported as an absolute count.
        if _norm(c.get("notes")):
            cand_notes += 1
        if _norm(g.get("notes")):
            notes_total += 1
            if _norm(c.get("notes")):
                notes_hits += 1
            else:
                mismatches.append(f"missing notes {k[0]}!{k[1]} (golden has notes)")

    # Criteria are a ~5-item JUDGMENT (suggestions), so they are scored at the
    # CONCEPT level: a golden criterion is recalled when any candidate criterion
    # shares a significant token with its id/label (`gestation_weeks` matches a
    # suggested `gestation`; `delivery_mode` matches `mode of delivery`). Exact
    # slug equality over-penalises naming luck; the named mismatches keep a
    # genuine concept gap diagnosable.
    gold_criteria = [c for c in golden.get("inclusion_criteria") or [] if c.get("id")]
    cand_tokens = [
        _criterion_tokens(c) for c in candidate.get("inclusion_criteria") or []
    ]
    criteria_hits = 0
    for crit in gold_criteria:
        tokens = _criterion_tokens(crit)
        if any(tokens & ct for ct in cand_tokens):
            criteria_hits += 1
        else:
            mismatches.append(f"missing inclusion criterion {_norm(crit.get('id'))!r}")

    return {
        "metrics": {
            "fields_golden": len(gold_fields),
            "fields_candidate": len(cand_fields),
            "field_recall": _rate(len(matched), len(gold_fields)),
            "field_precision": _rate(len(matched), len(cand_fields)),
            "type_match": _rate(type_hits, len(matched)),
            "code_set_match": _rate(codes_hits, codes_total),
            "notes_coverage": _rate(notes_hits, notes_total),
            "candidate_notes": cand_notes,
            "criteria_recall": _rate(criteria_hits, len(gold_criteria)),
        },
        "mismatches": mismatches,
    }


# --- database model (model.json) ----------------------------------------------

def score_database_model(golden: dict, candidate: dict) -> dict:
    gold_tables = {_norm(t.get("name")): t for t in golden.get("tables") or []}
    cand_tables = {_norm(t.get("name")): t for t in candidate.get("tables") or []}

    mismatches: list[str] = []
    matched_tables = [n for n in gold_tables if n in cand_tables]
    for n in gold_tables:
        if n not in cand_tables:
            mismatches.append(f"missing table {n!r}")

    col_total = 0
    col_hits = 0
    filterable_total = 0
    filterable_hits = 0
    codes_total = 0
    codes_hits = 0
    desc_total = 0
    desc_hits = 0
    for n in matched_tables:
        g_cols = {_norm(c.get("name")): c for c in gold_tables[n].get("columns") or []}
        c_cols = {_norm(c.get("name")): c for c in cand_tables[n].get("columns") or []}
        for cn, g in g_cols.items():
            col_total += 1
            c = c_cols.get(cn)
            if c is None:
                mismatches.append(f"missing column {n}.{cn}")
                continue
            col_hits += 1
            desc_total += 1
            if _norm(c.get("description")):
                desc_hits += 1
            # The deterministic filterable surface must never drift (it is
            # profiler-owned, not LLM-owned).
            filterable_total += 1
            if bool(g.get("filterable")) == bool(c.get("filterable")) and _norm(
                g.get("filter_type")
            ) == _norm(c.get("filter_type")):
                filterable_hits += 1
            else:
                mismatches.append(f"filterable drift {n}.{cn}")
            g_codes = g.get("codes")
            if isinstance(g_codes, dict) and g_codes:
                codes_total += 1
                c_codes = c.get("codes")
                if isinstance(c_codes, dict) and set(c_codes) == set(g_codes):
                    codes_hits += 1
                else:
                    mismatches.append(f"codes drift {n}.{cn}")

    return {
        "metrics": {
            "tables_golden": len(gold_tables),
            "table_recall": _rate(len(matched_tables), len(gold_tables)),
            "column_recall": _rate(col_hits, col_total),
            "filterable_agreement": _rate(filterable_hits, filterable_total),
            "code_set_match": _rate(codes_hits, codes_total),
            "description_coverage": _rate(desc_hits, desc_total),
        },
        "mismatches": mismatches,
    }


# --- mapping (mapping.json) -----------------------------------------------------

def _mapping_key(field: dict) -> tuple[str, str]:
    return (_norm(field.get("region")), _norm(field.get("cell")))


def score_mapping(golden: dict, candidate: dict) -> dict:
    gold_fields = {_mapping_key(f): f for f in golden.get("fields") or []}
    cand_fields = {_mapping_key(f): f for f in candidate.get("fields") or []}

    mismatches: list[str] = []
    matched = [k for k in gold_fields if k in cand_fields]
    for k in gold_fields:
        if k not in cand_fields:
            mismatches.append(f"missing mapping field {k[0]}!{k[1]} ({gold_fields[k].get('header')!r})")

    kind_hits = 0
    source_hits = 0
    code_total = 0
    code_hits = 0
    for k in matched:
        g, c = gold_fields[k], cand_fields[k]
        if _norm(g.get("kind")) == _norm(c.get("kind")):
            kind_hits += 1
        else:
            mismatches.append(
                f"kind drift {k[0]}!{k[1]}: golden {g.get('kind')!r} vs candidate {c.get('kind')!r}"
            )
        g_sources = {_norm(s) for s in g.get("sources") or []}
        c_sources = {_norm(s) for s in c.get("sources") or []}
        if g_sources == c_sources:
            source_hits += 1
        else:
            mismatches.append(
                f"sources drift {k[0]}!{k[1]}: golden {sorted(g_sources)} vs candidate {sorted(c_sources)}"
            )
        g_code = g.get("code")
        if isinstance(g_code, dict) and g_code:
            code_total += 1
            c_code = c.get("code")
            if isinstance(c_code, dict) and set(c_code) == set(g_code):
                code_hits += 1
            else:
                mismatches.append(f"code-map drift {k[0]}!{k[1]}")

    g_anchor = _norm((golden.get("identity") or {}).get("anchor"))
    c_anchor = _norm((candidate.get("identity") or {}).get("anchor"))
    if g_anchor != c_anchor:
        mismatches.append(f"identity anchor drift: golden {g_anchor!r} vs candidate {c_anchor!r}")

    gold_criteria = {
        _norm(b.get("criterion_id"))
        for b in golden.get("criteria_bindings") or []
        if b.get("criterion_id")
    }
    cand_criteria = {
        _norm(b.get("criterion_id"))
        for b in candidate.get("criteria_bindings") or []
        if b.get("criterion_id")
    }

    return {
        "metrics": {
            "fields_golden": len(gold_fields),
            "field_recall": _rate(len(matched), len(gold_fields)),
            "kind_agreement": _rate(kind_hits, len(matched)),
            "sources_agreement": _rate(source_hits, len(matched)),
            "code_map_match": _rate(code_hits, code_total),
            "identity_anchor_match": 1.0 if g_anchor == c_anchor else 0.0,
            "criteria_binding_recall": _rate(len(gold_criteria & cand_criteria), len(gold_criteria)),
        },
        "mismatches": mismatches,
    }


def format_report(title: str, scored: dict) -> str:
    lines = [f"== {title} =="]
    for name, value in scored["metrics"].items():
        lines.append(f"  {name:24} {value}")
    if scored["mismatches"]:
        lines.append(f"  -- {len(scored['mismatches'])} mismatch(es):")
        lines.extend(f"     {m}" for m in scored["mismatches"][:20])
        if len(scored["mismatches"]) > 20:
            lines.append(f"     … and {len(scored['mismatches']) - 20} more")
    return "\n".join(lines)
