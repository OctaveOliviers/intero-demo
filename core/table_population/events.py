"""Canonical strict-v2 run-stream event builders.

All orchestrator-emitted stream events should be built here so payload shape is
enforced in one place. The returned dict is the full stream event
(`{"type": ..., ...payload}`).
"""

from __future__ import annotations

from collections import Counter

from core.store import Cell


def event_payload(event: dict) -> dict:
    """Persistable payload for an emitted stream event (`event` without `type`)."""
    return {k: v for k, v in event.items() if k != "type"}


def build_activity_event(
    headline: str,
    *,
    detail: str | None = None,
    name: str | None = None,
    status: str | None = None,
    label: str | None = None,
    kind: str | None = None,
    id: str | None = None,
) -> dict:
    """Strict-v2 `activity` event with required `headline`.

    Optional fields are included only when provided; no legacy alias keys
    (such as `summary`) are emitted.

    ``label`` is the crisp 3–5 word "what's happening now" line the FE shows
    when the activity box is folded; ``kind`` ("step" | "tool" | "thinking")
    lets the FE distinguish an orchestrator step from an agent tool call or a
    thinking snippet. Both are optional — a missing ``kind`` reads as "step".
    ``id`` is a stable identity for a streaming element (an agent tool call or
    reasoning block): the FE UPSERTS by it, so a part that streams in chunks
    collapses into ONE growing line instead of many partial copies. Orchestrator
    steps omit it (each step is its own line).
    """
    headline = headline.strip()
    if not headline:
        raise ValueError("activity headline is required")
    event: dict[str, str] = {"type": "activity", "headline": headline}
    if detail is not None:
        event["detail"] = detail
    if name is not None:
        event["name"] = name
    if status is not None:
        event["status"] = status
    if label is not None:
        event["label"] = label
    if kind is not None:
        event["kind"] = kind
    if id is not None:
        event["id"] = id
    return event


def _ref(cell: Cell) -> str:
    return cell.ref


def _reason_counts(cells: list[Cell]) -> dict[str, int]:
    return dict(
        sorted(
            Counter(
                (c.reason_code or "UNSPECIFIED") for c in cells if c.state == "blocked"
            ).items()
        )
    )


def _low_confidence_cells(cells: list[Cell]) -> list[Cell]:
    return [c for c in cells if c.confidence == "low"]


def _needs_review_cells(cells: list[Cell]) -> list[Cell]:
    # The derived needs-verification view (doc 5 §Cell state model): a filled
    # cell whose interpret value awaits sign-off. Never a stored state.
    return [
        c for c in cells if c.state == "filled" and c.review_state == "not_reviewed"
    ]


def _focus_blocking(cells: list[Cell]) -> list[dict]:
    by_code: dict[str, list[Cell]] = {}
    for cell in cells:
        if cell.state != "blocked":
            continue
        code = cell.reason_code or "UNSPECIFIED"
        by_code.setdefault(code, []).append(cell)
    focus: list[dict] = []
    for code in sorted(by_code):
        group = by_code[code]
        sample_refs = [_ref(c) for c in group[:5]]
        detail = next((c.reason_detail for c in group if c.reason_detail), None)
        focus.append(
            {
                "reason_code": code,
                "count": len(group),
                "sample_refs": sample_refs,
                "detail": detail or "No additional detail captured.",
            }
        )
    return focus


def _focus_verification(cells: list[Cell]) -> dict:
    needs_review = [
        {
            "ref": _ref(c),
            "field": c.field,
            "member": c.member,
            "state": c.state,
        }
        for c in _needs_review_cells(cells)[:50]
    ]
    low_confidence = [
        {
            "ref": _ref(c),
            "confidence": c.confidence,
            "rationale": c.explanation
            or c.reason_detail
            or c.hypothesis
            or "No rationale captured.",
        }
        for c in _low_confidence_cells(cells)[:50]
    ]
    assumptions = [
        {
            "ref": _ref(c),
            "hypothesis": c.hypothesis,
        }
        for c in cells
        if c.hypothesis
    ][:50]
    return {
        "needs_review": needs_review,
        "low_confidence": low_confidence,
        "assumptions": assumptions,
    }


def _review_counts(
    cells: list[Cell],
) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    needs_review_cells = _needs_review_cells(cells)
    low_confidence_cells = _low_confidence_cells(cells)
    totals = {
        "cells": len(cells),
        "filled": sum(1 for c in cells if c.state == "filled"),
        "blocked": sum(1 for c in cells if c.state == "blocked"),
        "needs_verification": len(needs_review_cells),
        "low_confidence": len(low_confidence_cells),
    }
    blocking = {
        "count": totals["blocked"],
        "reason_codes": _reason_counts(cells),
        "focus": _focus_blocking(cells),
    }
    verification = {
        "pending": len(needs_review_cells),
        "reviewed": sum(1 for c in cells if c.review_state == "reviewed"),
        "corrected": sum(1 for c in cells if c.corrected is True),
        "focus": _focus_verification(cells),
    }
    return totals, blocking, verification


def build_review_summary_event(cells: list[Cell]) -> dict:
    """Strict-v2 terminal `review_summary` event."""
    totals, blocking, verification = _review_counts(cells)
    return {
        "type": "review_summary",
        "totals": totals,
        "blocking": blocking,
        "verification": verification,
    }
