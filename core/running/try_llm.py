"""Tier 2 — ``try_llm``: one cheap LLM pass per still-``pending`` cell (A2).

Per cell, up to two LLM looks and one read-only retry (cell-resolution.schema.json
§triage_decision): solve now, run one more query then solve, or escalate to Tier
3. The LLM authors only the interpretive part (value + verbatim ``citations`` /
``source_column`` + ``explanation``); the tier runs any SQL, grounds citations to
their rows, and builds the cell's ``sources[]``. Every cell is UPDATEd in place
through ``run_store``; the tier never returns a cell. Any failure — bad reply,
off-code value, ungroundable evidence — leaves the cell ``pending`` for Tier 3,
never aborts the run.

Storage-layout §6 invariant: schema is read from the canonical
``var/databases/<slug>/model.json`` and never by introspecting the live SQLite.
Tier 2 loads that model once per run (when a primary DB is bound), derives a
small per-cell schema hint from it, and reuses it across prompts. The live DB is
execution target only (``sql_runner`` runs LLM-proposed SQL read-only).
"""

from __future__ import annotations

import asyncio
import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal

import sqlglot
from sqlglot import expressions as exp
from pydantic import BaseModel, Field, model_validator

from core.clients import llm as llm_client
from core.config import DATABASES_DIR
from core.running.provenance import Source, make_attempt
from core.running.sql import run_readonly_sql

_MAX_CONCURRENCY = 8  # cells resolved at once (independent per-cell LLM I/O)


class TriageDecision(BaseModel):
    """The Tier-2 LLM's per-cell decision — a constrained structured output. The
    field descriptions ARE the prompt schema sent to the model."""

    model_config = {"extra": "forbid"}

    decision: Literal["solution", "retry", "escalate"] = Field(
        description=(
            "'solution' — you are confident of the final value, returned in `output` "
            "(a permitted code verbatim for a coded field). "
            "'retry' — put ONE read-only SQL statement in `output`; you'll be shown its "
            "rows once, then asked to solve or escalate. "
            "'escalate' — hand to the agent (set `output` to null)."
        )
    )
    output: str | None = Field(
        default=None,
        description="solution → the final value; retry → the SQL to run; escalate → null.",
    )
    reason: str = Field(
        min_length=1,
        description="One sentence justifying the decision (becomes the cell's hypothesis).",
    )
    citations: list[str] | None = Field(
        default=None,
        min_length=1,
        description=(
            "solution from free text only: the verbatim passage(s) you read the value from, "
            "copied EXACTLY — each MUST be a substring of a note shown in the retry rows."
        ),
    )
    explanation: str | None = Field(
        default=None,
        description="solution only: one-sentence account of how the value was derived.",
    )
    source_column: str | None = Field(
        default=None,
        description=(
            "solution from a STRUCTURED (non-note) read only: the 'table.column' the value "
            "came from (e.g. 'charts.value'). Use instead of citations for non-free-text values."
        ),
    )

    @model_validator(mode="after")
    def _shape_matches_decision(self) -> "TriageDecision":
        if self.decision in ("solution", "retry"):
            if not (self.output and self.output.strip()):
                raise ValueError(f"output required when decision={self.decision!r}")
        elif self.output is not None:
            raise ValueError("output must be null when decision='escalate'")
        if self.decision != "solution" and (
            self.citations or self.explanation or self.source_column
        ):
            raise ValueError("citations/explanation/source_column are solution-only")
        return self


# Async seam: per-cell prompt → validated TriageDecision (may raise; caught per cell).
LLM = Callable[[str], Awaitable[TriageDecision]]
# Run one read-only query; None when no clinical DB is bound (a retry then escalates).
SqlRunner = Callable[[str], list[dict[str, Any]]]

INSTRUCTIONS = (
    "You resolve ONE cell of a clinical audit from the evidence given; a deterministic "
    "pass already tried and failed. Decide: solution / retry (one more read-only query) / "
    "escalate. Quote the EXACT sentence(s) you used as citations. Never invent a value, and "
    "for a coded field return only a permitted code."
)

_TABLE_COL = re.compile(r"^\w+\.\w+$")  # a well-formed table.column
_QUOTES = str.maketrans("", "", '"`[]')  # strip identifier quoting the LLM may add
_PK_NAMES = ("id", "rowid", "row_id", "pk")
_PROMPT_ROWS = 5  # retry rows shown to the LLM; grounding scans exactly this slice
_WS = re.compile(r"\s+")
_MAX_SCHEMA_TABLES = 3
_MAX_SCHEMA_COLUMNS = 10


def _norm_col(s: str | None) -> str:
    """A model-provided ``table.column`` with any identifier quoting stripped."""
    return (s or "").translate(_QUOTES)


def _render_value(val: Any) -> str:
    """One-line, whitespace-normalised value — used for BOTH the prompt and citation
    matching so a multi-line note can't blur the layout yet a copy still grounds."""
    return _WS.sub(" ", str(val)).strip()


def _codes_by_field(run_store) -> dict[str, dict[str, str]]:
    """{field_id: permitted_values} built once per run from spec.json — PROMPT
    guidance only (so the LLM picks a valid code). Validation is the store's
    off-code trigger, not Tier 2; this never gates a write."""
    out: dict[str, dict[str, str]] = {}
    for f in (run_store.audit or {}).get("fields", []) or []:
        codes = f.get("permitted_values")
        if f.get("id") and isinstance(codes, dict) and codes:
            out[f["id"]] = codes
    return out


def _load_canonical_model(database_slug: str | None) -> dict[str, Any] | None:
    """Return ``var/databases/<slug>/model.json`` or None when unavailable."""
    if not database_slug:
        return None
    path = DATABASES_DIR / database_slug / "model.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return raw if isinstance(raw, dict) else None


def _schema_hint_for_cell(cell, model: dict[str, Any] | None) -> str | None:
    """Small prompt hint from canonical model.json (table/column/type/description)."""
    if not isinstance(model, dict):
        return None
    tables = model.get("tables")
    if not isinstance(tables, list):
        return None

    preferred_table = None
    if cell.attempts:
        table_col = _norm_col((cell.attempts[0] or {}).get("table_column"))
        if "." in table_col:
            preferred_table = table_col.split(".", 1)[0]
    field_tokens = {t for t in re.split(r"[^a-z0-9]+", (cell.field or "").lower()) if t}

    preferred_norm = (preferred_table or "").lower()

    def _score(tbl: dict[str, Any]) -> tuple[int, int]:
        name = str(tbl.get("name") or "")
        name_norm = name.lower()
        cols = tbl.get("columns") if isinstance(tbl.get("columns"), list) else []
        col_names = [str((c or {}).get("name") or "").lower()
                     for c in cols if isinstance(c, dict)]
        token_match = any(tok and any(tok in cn for cn in col_names) for tok in field_tokens)
        return (1 if preferred_norm and name_norm == preferred_norm else 0,
                1 if token_match else 0)

    ranked = [t for t in tables if isinstance(t, dict)]
    ranked.sort(key=_score, reverse=True)
    chosen = ranked[:_MAX_SCHEMA_TABLES]
    if not chosen:
        return None

    lines: list[str] = ["schema hints (canonical model.json):"]
    for tbl in chosen:
        tname = str(tbl.get("name") or "")
        tdesc = _render_value(tbl.get("description") or "")
        lines.append(f"  table {tname}: {tdesc}" if tdesc else f"  table {tname}")
        cols = tbl.get("columns") if isinstance(tbl.get("columns"), list) else []
        shown = 0
        for col in cols:
            if not isinstance(col, dict) or shown >= _MAX_SCHEMA_COLUMNS:
                continue
            cname = str(col.get("name") or "")
            ctype = str(col.get("type") or "unknown")
            cdesc = _render_value(col.get("description") or "")
            lines.append(f"    - {tname}.{cname} [{ctype}] {cdesc}".rstrip())
            shown += 1
    return "\n".join(lines)


def _short_rows(rows: list[dict[str, Any]], limit: int = 3, width: int = 120) -> str:
    """Compact, length-capped sample for ``attempts[].result`` (the durable log; Tier 2
    re-reads rows fresh, so a summary suffices — keeps wide ``SELECT *`` out of the DB)."""
    def cap(v: Any) -> str:
        s = str(v)
        return s if len(s) <= width else s[:width] + "…"
    sample = [{k: cap(v) for k, v in r.items()} for r in rows[:limit]]
    extra = "" if len(rows) <= limit else f" (+{len(rows) - limit} more)"
    return json.dumps(sample, default=str, ensure_ascii=False) + extra


def _rows_for_prompt(rows: list[dict[str, Any]], limit: int = _PROMPT_ROWS) -> str:
    """Retry rows as plain ``column: value`` blocks (not JSON), each value one line."""
    if not rows:
        return "(no rows)"
    blocks = []
    for i, row in enumerate(rows[:limit], 1):
        cols = "\n".join(f"    {c}: {_render_value(v)}" for c, v in row.items())
        blocks.append(f"  row {i}:\n{cols}")
    if len(rows) > limit:
        blocks.append(f"  (+{len(rows) - limit} more rows)")
    return "\n".join(blocks)


def _db_for_cell(run_store, cell) -> tuple[str | None, Path | None]:
    """The database THIS cell's evidence lives in (multi-DB runtime, T12):
    the Tier-1 attempt's `database` when it is one of the run's bound paths
    (the executable stamped it from the region query), else the run's single
    database. A cell on a multi-DB run with no resolvable provenance gets
    (None, None) — its retry can't be routed, so it escalates to Tier 3,
    which sees every database."""
    paths = run_store.database_paths
    if not paths:
        return None, None
    attempt_db = (cell.attempts[0].get("database") if cell.attempts else None)
    if attempt_db in paths:
        return attempt_db, paths[attempt_db]
    if len(paths) == 1:
        slug = next(iter(paths))
        return slug, paths[slug]
    return None, None


def _build_prompt(cell, *, codes, schema_hint=None, retry_sql=None, retry_rows=None) -> str:
    lines = [f"field: {cell.field}", f"patient (member): {cell.member}"]
    if schema_hint:
        lines.append(schema_hint)
    if codes:
        lines.append("permitted codes (a solution MUST be one of these CODES verbatim):")
        lines += [f"  {code}: {meaning}" for code, meaning in codes.items()]
    if cell.attempts:
        lines.append("attempts so far:")
        for a in cell.attempts:
            chunk = f"  - [{a.get('tier')}] {a.get('sql', '(no query)')}"
            if a.get("value") is not None:
                chunk += f"\n      value: {a['value']!r}"
            if a.get("result") is not None:
                chunk += f"\n      → {a['result']}"
            if a.get("error"):
                chunk += f"\n      ✗ {a['error']}"
            lines.append(chunk)
    if retry_sql is not None:
        lines.append(f"retry SQL executed: {retry_sql}")
        lines.append("retry rows:")
        lines.append(_rows_for_prompt(retry_rows or []))
        lines.append("Now decide: 'solution' (quote note citations verbatim from a row "
                     "value above) or 'escalate'.")
    return "\n".join(lines)


def _from_table(sql: str) -> str:
    """The retry's source table, parsed with sqlglot (so a ``FROM`` inside a string
    literal or a quoted/schema-qualified name doesn't fool a regex). ``(unknown)``
    if unparseable or table-less."""
    try:
        t = sqlglot.parse_one(sql).find(exp.Table)
        return t.name if t and t.name else "(unknown)"
    except Exception:
        return "(unknown)"


def _row_pk(row: dict[str, Any], table: str, anchor: str | None) -> str | None:
    """The row's OWN primary key, never a foreign key or the cohort identity: an
    exact ``id``/``rowid``/``pk`` column, else ``<table>_id`` (singular or plural),
    else any other ``*_id`` that isn't the anchor. None if none was projected."""
    keys = [k for k in row if row[k] is not None]
    table_ids = {f"{table.lower()}_id", f"{table.lower().rstrip('s')}_id"}
    for want in (lambda k: k in _PK_NAMES, lambda k: k in table_ids,
                 lambda k: k.endswith("_id") and k != anchor):
        for k in keys:
            if want(k):
                return str(row[k])
    return None


def _scoped_to_member(row: dict[str, Any], anchor: str | None, member: str | None) -> bool:
    """Does this retry row belong to the cell's patient? True when scoping can't be
    checked (no anchor configured yet — A4 wires it); otherwise the row must project
    the anchor and it must equal ``member`` (replaces the dropped identity trigger,
    so an unscoped LLM query can't attribute another patient's row)."""
    if not anchor or member is None:
        return True
    return anchor in row and _render_value(row[anchor]) == _render_value(member)


def _ground_citations(
    citations: list[str], rows: list[dict[str, Any]], *,
    table: str, db_slug: str, query: str, anchor: str | None, member: str | None,
) -> tuple[list[Source], list[str]]:
    """Map each citation to the (row, column) it was read from, one :class:`Source`
    per distinct (row, column). A citation must be a substring of EXACTLY ONE row
    that belongs to ``member`` (``_render_value`` normalisation, any column type);
    0/>1 matches or a cross-patient row → ``unmatched``. ``rows`` MUST be the slice
    the LLM saw."""
    grouped: dict[tuple[int, str], dict[str, Any]] = {}
    order: list[tuple[int, str]] = []
    unmatched: list[str] = []
    for cit in citations:
        needle = _render_value(cit or "")
        hits = []
        if needle:
            for idx, row in enumerate(rows):
                if not _scoped_to_member(row, anchor, member):
                    continue
                col = next((c for c, v in row.items()
                            if needle in _render_value(v)), None)
                if col is not None:
                    hits.append((idx, col))
        if len(hits) != 1:
            unmatched.append(cit)
            continue
        key = hits[0]
        if key not in grouped:
            grouped[key] = {"table_column": f"{table}.{key[1]}",
                            "row_id": _row_pk(rows[key[0]], table, anchor), "citations": []}
            order.append(key)
        grouped[key]["citations"].append(cit)
    sources = [
        Source(database=db_slug, query=query, table_column=grouped[k]["table_column"],
               row_id=grouped[k]["row_id"], citations=grouped[k]["citations"])
        for k in order
    ]
    return sources, unmatched


async def _leave_pending(run_store, cell, attempts, *, hypothesis) -> None:
    """Persist attempts + hypothesis, keep the cell ``pending`` (the escalate path)."""
    await run_store.update(cell.ref, attempts=attempts,
                           hypothesis=hypothesis or cell.hypothesis)


async def _settle_solution(run_store, cell, decision, *, attempts, sources,
                           confidence, db_slug) -> None:
    """Fill the cell. The store's triggers are the SOLE write-time validator (per
    the plan — no per-tier code-set check); a rejected write (off-code value, …)
    aborts the UPDATE (so nothing persisted), and we escalate with the value on
    ``attempts[]``, keeping the full retry trail."""
    try:
        await run_store.update(
            cell.ref, state="filled", value=decision.output, confidence=confidence,
            resolved_by="LLM", attempts=attempts, hypothesis=decision.reason,
            explanation=decision.explanation or decision.reason,
            sources=[s.as_dict() for s in sources])
    except sqlite3.Error as exc:
        attempts.append(make_attempt("LLM", db_slug, value=decision.output, error=str(exc)))
        await _leave_pending(run_store, cell, attempts, hypothesis=decision.reason)


async def _resolve_one(run_store, cell, *, llm, sql_runner, codes, db_slug, anchor,
                       schema_hint) -> None:
    """One cell: solve / retry-then-solve / escalate; every dead end leaves it pending."""
    attempts = list(cell.attempts or [])
    tier1 = cell.attempts[0] if cell.attempts else {}
    eff_db = db_slug or "(none)"  # retry attempts/sources never carry a None database

    try:
        look1 = await llm(_build_prompt(cell, codes=codes, schema_hint=schema_hint))
    except Exception as exc:
        attempts.append(make_attempt("LLM", "(none)", error=f"Tier-2 triage failed: {exc}"))
        await _leave_pending(run_store, cell, attempts,
                             hypothesis="Tier 2 could not obtain a valid triage decision")
        return

    if look1.decision == "solution":
        # Legitimate first-look = code-drift: Tier 1 actually READ a value (`value`
        # present, even falsy like 0) that the LLM re-codes. No reading (NULL) means
        # nothing to translate — filling would fabricate a value over an empty source.
        if not (tier1.get("value") is not None and tier1.get("sql")
                and _TABLE_COL.match(tier1.get("table_column") or "")):
            msg = ("first-look solution rejected: no Tier-1 attempt to anchor a "
                   "structured source; needs a retry to ground the value"
                   if not cell.attempts else
                   "first-look solution rejected: Tier 1 read no value to translate; "
                   "needs a retry or escalation")
            attempts.append(make_attempt(
                "LLM", tier1.get("database") or "(none)", value=look1.output, error=msg))
            await _leave_pending(run_store, cell, attempts, hypothesis=look1.reason)
            return
        # The narrowed Tier-1 query is self-verifying: its WHERE pins the identity, so
        # the value is traceable to the right patient without re-projecting it.
        source = Source(database=tier1.get("database") or "(none)", query=tier1["sql"],
                        table_column=tier1["table_column"])
        await _settle_solution(run_store, cell, look1, attempts=attempts,
                               sources=[source], confidence="high",
                               db_slug=eff_db)
        return

    if look1.decision == "retry":
        retry_sql = look1.output  # non-empty (validator)
        if sql_runner is None:
            attempts.append(make_attempt(
                "LLM", "(none)", sql=retry_sql,
                error="retry requested but no clinical database is bound; cannot run SQL"))
            await _leave_pending(run_store, cell, attempts, hypothesis=look1.reason)
            return
        retry_errored = False
        try:
            rows = await asyncio.to_thread(sql_runner, retry_sql)  # I/O off the loop
            attempts.append(make_attempt("LLM", eff_db, sql=retry_sql,
                                         result=_short_rows(rows)))
        except Exception as exc:
            rows, retry_errored = [], True
            attempts.append(make_attempt("LLM", eff_db, sql=retry_sql, error=str(exc)))

        try:
            look2 = await llm(_build_prompt(cell, codes=codes, schema_hint=schema_hint,
                                            retry_sql=retry_sql, retry_rows=rows))
        except Exception as exc:
            attempts.append(make_attempt("LLM", "(none)",
                                         error=f"Tier-2 second look failed: {exc}"))
            await _leave_pending(run_store, cell, attempts, hypothesis=look1.reason)
            return

        if look2.decision == "solution":
            shown = rows[:_PROMPT_ROWS]  # ground against exactly what the LLM saw
            if look2.citations:
                sources, unmatched = _ground_citations(
                    look2.citations, shown, table=_from_table(retry_sql),
                    db_slug=eff_db, query=retry_sql, anchor=anchor, member=cell.member)
                if unmatched or not sources:
                    err, sources = (
                        "evidence not verifiable: citation(s) not located in exactly one "
                        f"in-cohort shown row (0=not found/foreign, >1=ambiguous): {unmatched!r}",
                        None)
                else:
                    err = None
            elif retry_errored or not rows:
                err = ("evidence not verifiable: retry "
                       + ("errored" if retry_errored else "returned no rows")
                       + "; value has no supporting source")
                sources = None
            elif not all(_scoped_to_member(r, anchor, cell.member) for r in shown):
                err = "structured retry is not scoped to this patient; cannot attribute the value"
                sources = None
            elif (ncol := _norm_col(look2.source_column)) and _TABLE_COL.match(ncol):
                sources = [Source(database=eff_db, query=retry_sql,
                                  table_column=ncol)]
                err = None
            else:
                err = ("cannot record source: a structured solution must name the "
                       "table.column it read (source_column) or quote note citations")
                sources = None
            if not sources:
                attempts.append(make_attempt("LLM", eff_db, value=look2.output, error=err))
                await _leave_pending(run_store, cell, attempts,
                                     hypothesis=look2.reason or look1.reason)
                return
            await _settle_solution(run_store, cell, look2, attempts=attempts,
                                   sources=sources, confidence="medium",
                                   db_slug=eff_db)
            return
        await _leave_pending(run_store, cell, attempts,
                             hypothesis=look2.reason or look1.reason)
        return

    await _leave_pending(run_store, cell, attempts, hypothesis=look1.reason)


async def try_llm(run_store, *, llm: LLM, sql_runner: SqlRunner | None = None,
                  concurrency: int = _MAX_CONCURRENCY) -> None:
    """Resolve every still-``pending`` cell, ≤2 LLM calls + ≤1 query each, concurrently
    (bounded). With no injected ``sql_runner``, each cell's retry runs
    :func:`run_readonly_sql` against ITS OWN database (multi-DB runtime, T12):
    routed via the Tier-1 attempt's provenance. A multi-DB cell whose database
    can't be resolved keeps no runner and escalates."""
    if len(run_store.database_paths) > 1:
        await run_store.activity(
            "Routing each unresolved value to its own database. A value whose "
            "evidence spans databases is left for the agent step.")
    # Schema hints, loaded lazily once per database the open cells touch.
    models: dict[str | None, dict[str, Any] | None] = {}

    def _model_for(slug: str | None) -> dict[str, Any] | None:
        if slug not in models:
            models[slug] = _load_canonical_model(slug)
        return models[slug]

    codes_by_field = _codes_by_field(run_store)
    anchor = run_store.anchor
    sem = asyncio.Semaphore(max(1, concurrency))

    async def _bounded(cell) -> None:
        async with sem:
            db_slug, db_path = _db_for_cell(run_store, cell)
            runner = sql_runner
            if runner is None and db_path is not None:
                def runner(sql: str, _path: Path = db_path) -> list[dict[str, Any]]:  # type: ignore[no-redef]
                    return run_readonly_sql(_path, sql)
            try:
                await _resolve_one(run_store, cell, llm=llm, sql_runner=runner,
                                   codes=codes_by_field.get(cell.field), db_slug=db_slug,
                                   anchor=anchor,
                                   schema_hint=_schema_hint_for_cell(cell, _model_for(db_slug)))
            except Exception as exc:
                # Last-resort guard: an UNEXPECTED error (off-code etc. is handled in
                # _settle_solution) must not cancel the fan-out. Leave THIS cell pending
                # for Tier 3; the note is best-effort and uses the pre-call attempts
                # snapshot (any in-flight attempt rolled back with the failed write).
                try:
                    await run_store.update(
                        cell.ref, hypothesis="Tier 2 errored; deferred to Tier 3",
                        attempts=list(cell.attempts or [])
                        + [make_attempt("LLM", "(none)", error=f"Tier-2 aborted: {exc}")])
                except Exception:
                    pass

    await asyncio.gather(*(_bounded(c) for c in run_store.open_cells()),
                         return_exceptions=True)


async def _default_llm(prompt: str) -> TriageDecision:
    return await llm_client.respond_typed(INSTRUCTIONS, prompt, TriageDecision, stage="tier2")


def make_tier_llm(*, llm: LLM | None = None, sql_runner: SqlRunner | None = None,
                  concurrency: int = _MAX_CONCURRENCY):
    """Adapt :func:`try_llm` to the orchestrator's ``tier_llm(run_store)`` seam. With no
    ``llm`` the production :func:`_default_llm` (Chat Completions) is used."""
    resolved_llm = llm if llm is not None else _default_llm

    async def tier_llm(run_store) -> None:
        await try_llm(run_store, llm=resolved_llm, sql_runner=sql_runner,
                      concurrency=concurrency)

    return tier_llm
