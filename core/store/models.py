"""Row dataclasses for the state store + the status derivation rule.

One dataclass per table in the W0.2 contract. Status is **not** a free field:
``derive_status`` computes a run's status from its persisted ``cells`` alone —
the single source of truth (doc 7 §State data model, doc 10 §lifecycle, GAP-3),
never the chat stream or the workbook.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dc_field


@dataclass
class Run:
    id: str
    audit_id: str
    user_id: str | None = None
    request: str | None = None
    template_version: str | None = None
    database_ids: list[str] = dc_field(default_factory=list)
    status: str = "queued"
    prompt_versions: dict = dc_field(default_factory=dict)
    filters: list = dc_field(default_factory=list)
    parameters: dict = dc_field(default_factory=dict)
    started_at: str | None = None
    ended_at: str | None = None
    # Table-population PROCESS status (issue #326): the ONLY population
    # lifecycle record — queued | running | stopped | error | completed.
    # DISTINCT from ``status`` above (the cell-derived RESULT status).
    # ``population_result_status`` snapshots the result status at the terminal
    # transition. None means no lifecycle transition has been recorded.
    population_status: str | None = None
    population_status_detail: str | None = None
    population_result_status: str | None = None


@dataclass
class Cell:
    run_id: str
    ref: str
    field: str | None = None
    member: str | None = None
    kind: str | None = None
    state: str | None = None
    value: str | None = None
    confidence: str | None = None
    resolved_by: str | None = None
    hypothesis: str | None = None
    attempts: list = dc_field(default_factory=list)
    review_state: str | None = None
    corrected: bool | None = None
    explanation: str | None = None
    sources: list = dc_field(default_factory=list)
    prompt_version: str | None = None
    extracted_at: str | None = None
    reason_code: str | None = None
    reason_detail: str | None = None
    owner_needed: str | None = None
    outstanding_since: str | None = None


@dataclass
class Event:
    run_id: str
    type: str
    payload: dict = dc_field(default_factory=dict)
    execution_id: str | None = None
    ts: str | None = None
    id: int | None = None


@dataclass
class RunExecution:
    id: str
    run_id: str
    status: str = "queued"  # queued | running | completed | error | stopped
    started_at: str | None = None
    ended_at: str | None = None
    summary_json: dict = dc_field(default_factory=dict)


@dataclass
class RunMember:
    run_id: str
    member: str
    row_index: int | None = None
    active: bool = True
    first_seen_execution_id: str | None = None
    last_seen_execution_id: str | None = None


def derive_status(cells: list[Cell], *, started: bool = True) -> str:
    """Derive a run's status from its cells (doc 10 §Audit status lifecycle).

    - ``blocked`` whenever ≥1 cell is ``blocked`` (the blocked count is surfaced
      separately; presence is what flips the run).
    - ``in_verification`` when ≥1 cell awaits sign-off and none is blocked.
    - ``complete`` only when every cell is ``filled``/``not_applicable``.
    - otherwise ``in_progress`` (cells exist but extraction is mid-flight), or
      ``queued`` before the run has started.

    Mirrors the contract's ``run.status`` enum and is the function B4 uses to keep
    ``runs.status`` durable so it survives a crashed run.
    """
    states = [c.state for c in cells]
    if "blocked" in states:
        return "blocked"
    # Needs-verification is DERIVED, never stored (doc 5 §Cell state model):
    # a filled cell awaiting its interpret sign-off keeps the run in
    # verification — and out of complete — until reviewed.
    awaiting_review = any(
        c.state == "filled" and c.review_state == "not_reviewed" for c in cells
    )
    if states and all(s in ("filled", "not_applicable") for s in states):
        return "in_verification" if awaiting_review else "complete"
    if awaiting_review:
        return "in_verification"
    return "in_progress" if started else "queued"
