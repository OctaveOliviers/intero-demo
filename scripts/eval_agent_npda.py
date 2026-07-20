"""Headless NPDA prepopulate → agent pass — a real end-to-end eval.

Mirrors the production table-population wiring in
``server/routes/table_populations.py::_execute_table_population_session`` but
drives it from the command line so we can inspect the agent's behaviour:

  * ``prepopulate`` copies the deterministic cells from the executable.
  * the table agent is the REAL opencode agent (gpt-5.4-nano via
    models.local.yaml), standing up a live ``opencode serve`` exactly as the
    server does.

After the run it prints a cell-state summary (filled / blocked / pending),
the INTERPRET-cell breakdown by field, every blocked reason, and a digest of
the agent's tool activity (which databases it queried, repeated queries,
thinking volume) so we can judge: does it reach demographics, does it stop
relitigating, does it fill the previously-blocked cells.

Run::

    python3 -m scripts.eval_agent_npda [--cohort N] [--audit npda]
"""

from __future__ import annotations

import core.config  # noqa: F401  -- import FIRST: loads .env (Azure keys)

import argparse
import asyncio
import json
import os
import sqlite3
import tempfile
import time
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from core import table_population  # noqa: E402
from core.config import ROOT  # noqa: E402
from core.filters import cohort as cohort_filters  # noqa: E402
from core.runtime import Runtime  # noqa: E402
from core.store import Run, Store  # noqa: E402
from core.table_population.populate import (  # noqa: E402
    TablePopulationContext,
    run_population_steps,
)

SEED = ROOT / "data" / "seed"
VAR = ROOT / "var"


def _log(msg: str) -> None:
    print(f"[eval {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _resolve_cohort(
    executable: dict, db_paths: dict[str, Path], extra_where: list[str] | None = None
) -> list[str]:
    """The ONE core cohort resolver (was a private SQL copy); ``extra_where``
    (the eval's --dob-after predicate) rides through as runtime WHERE terms."""
    return [
        str(m)
        for m in cohort_filters.resolve_cohort(
            executable, db_paths, runtime_where=extra_where
        )
    ]


def _parse_dob(raw: str) -> date | None:
    text = (raw or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _dob_cohort_where(dob_after: str, db_paths: dict[str, Path]) -> list[str]:
    """Scope the cohort to patients born strictly after ``dob_after`` (ISO).

    DOB lives in npda-demographics (``patients.date_of_birth``, stored DD/MM/YYYY
    text), while the cohort is built on npda-clinical. We resolve the eligible
    patient identifiers here (``clinic_visits.patient_ref == patients.nhs_number``)
    and return an ``IN (...)`` predicate over the cohort's ``b`` alias. Parsing the
    date is required — a raw string compare on DD/MM/YYYY is wrong.
    """
    cutoff = _parse_dob(dob_after)
    if cutoff is None:
        raise ValueError(f"--dob-after must be a date, got {dob_after!r}")
    demo = db_paths.get("npda-demographics")
    if demo is None or not demo.exists():
        raise ValueError("npda-demographics database not available for --dob-after")
    conn = sqlite3.connect(f"file:{demo}?mode=ro", uri=True)
    try:
        rows = conn.execute("SELECT nhs_number, date_of_birth FROM patients").fetchall()
    finally:
        conn.close()
    refs = sorted(
        str(nhs)
        for nhs, dob in rows
        if (parsed := _parse_dob(dob)) is not None and parsed > cutoff
    )
    if not refs:
        return []
    quoted = ", ".join(f"'{r}'" for r in refs)
    _log(f"DOB filter: {len(refs)} patient(s) born after {dob_after}: {refs}")
    return [f"b.patient_ref IN ({quoted})"]


# Anchor-bearing source tables come from the ONE core derivation
# (core.table_population.resolve_cohort_tables) — the private copy that
# mirrored the route is gone.
_resolve_cohort_tables = table_population.resolve_cohort_tables


def _interpret_fields(executable: dict) -> set[str]:
    interpret_regions = {
        r["id"] for r in executable.get("regions") or [] if r.get("kind") == "interpret"
    }
    return {
        entry.get("field")
        for r in executable.get("regions") or []
        if r["id"] in interpret_regions
        for entry in r.get("cell_map") or []
    }


def _summarize_cells(cells, executable: dict) -> None:
    by_state = Counter(c.state for c in cells)
    _log(f"CELL STATES: {dict(by_state)}")

    interpret = _interpret_fields(executable)
    interp_cells = [c for c in cells if c.field in interpret]
    _log(f"INTERPRET cells: {len(interp_cells)} (the cross-DB / notes-reading ones)")
    by_field: dict[str, Counter] = {}
    for c in interp_cells:
        by_field.setdefault(c.field, Counter())[c.state] += 1
    for field, counts in sorted(by_field.items()):
        _log(f"  {field}: {dict(counts)}")

    blocked = [c for c in cells if c.state == "blocked"]
    if blocked:
        _log(f"BLOCKED cells ({len(blocked)}):")
        for c in blocked[:40]:
            reason = c.reason_code or "?"
            detail = (c.reason_detail or "").replace("\n", " ")[:160]
            _log(f"  {c.ref} {c.field}/{c.member}: {reason} — {detail}")

    filled = [c for c in cells if c.state == "filled"]
    interp_filled = [c for c in filled if c.field in interpret]
    if interp_filled:
        _log(f"FILLED interpret cells ({len(interp_filled)}) — sample values:")
        for c in interp_filled[:25]:
            val = str(c.value).replace("\n", " ")[:80]
            _log(f"  {c.ref} {c.field}/{c.member} = {val!r} (by={c.resolved_by})")


def _digest_activity(run_dir: Path) -> None:
    """Read the agent's activity log and report tool usage / relitigation."""
    candidates = sorted(run_dir.glob("*.jsonl")) + sorted(run_dir.glob("**/*.jsonl"))
    seen: set[Path] = set()
    records: list[dict] = []
    activity_file: Path | None = None
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        if "activity" not in path.name and "transcript" not in path.name:
            continue
        activity_file = path
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        break

    if activity_file is None:
        _log("ACTIVITY: no activity/transcript jsonl found in run dir; files present:")
        for p in sorted(run_dir.iterdir()):
            _log(f"  {p.name}")
        return

    _log(f"ACTIVITY: {len(records)} records in {activity_file.name}")
    kinds = Counter(r.get("kind") or r.get("type") or "?" for r in records)
    _log(f"  record kinds: {dict(kinds)}")

    sql_queries: list[str] = []
    for r in records:
        blob = json.dumps(r).lower()
        if "sql_execute" in blob or '"sql"' in blob or "select " in blob:
            # pull a query string if present
            for key in ("sql", "query", "input", "text"):
                v = r.get(key)
                if isinstance(v, str) and "select" in v.lower():
                    sql_queries.append(v)
                    break
    if sql_queries:
        _log(
            f"  sql_execute queries observed: {len(sql_queries)} "
            f"(distinct: {len(set(q.strip() for q in sql_queries))})"
        )
        for q in sql_queries[:15]:
            _log(f"    » {q.replace(chr(10), ' ')[:200]}")
    # surface any obvious cross-DB errors
    for r in records:
        blob = json.dumps(r)
        for needle in (
            "no such column",
            "no such table",
            "cross-database",
            "cross database",
            "no cross",
            "nhs_number",
        ):
            if needle in blob.lower():
                _log(f"  !! ERROR SIGNAL ({needle}): {blob[:240]}")
                break


def _digest_opencode_log(since: float) -> None:
    """Read the opencode server's own log (the most reliable record of which
    model ran + the LLM round-trips) for logs touched at/after ``since``."""
    log_dir = Path.home() / ".local" / "share" / "opencode" / "log"
    logs = [p for p in log_dir.glob("*.log") if p.stat().st_mtime >= since - 5]
    if not logs:
        _log("OPENCODE LOG: none found for this run window")
        return
    newest = max(logs, key=lambda p: p.stat().st_mtime)
    lines = newest.read_text(encoding="utf-8", errors="replace").splitlines()
    models = Counter()
    llm_calls = 0
    errors: list[str] = []
    for ln in lines:
        if "service=llm " in ln and "providerID=" in ln:
            llm_calls += 1
            prov = ln.split("providerID=", 1)[1].split()[0]
            mid = ln.split("modelID=", 1)[1].split()[0] if "modelID=" in ln else "?"
            models[f"{prov}/{mid}"] += 1
        low = ln.lower()
        if any(s in low for s in ("error", "fail", " 4", " 5")) and (
            "level=error" in low
            or "err=" in low
            or "status=4" in low
            or "status=5" in low
        ):
            errors.append(ln[:240])
    _log(f"OPENCODE LOG: {newest.name} — {llm_calls} llm round-trips")
    _log(
        f"  MODEL(S) USED: {dict(models)}  <-- must be remote/<gpt-5.4-nano> to be a valid eval"
    )
    if errors:
        _log(f"  errors in log ({len(errors)}):")
        for e in errors[:8]:
            _log(f"    {e}")


async def run_eval(
    audit_id: str, cohort_cap: int, agent_stage: str, dob_after: str | None = None
) -> int:
    # The opencode agent process is configured from the `table_agent` stage via
    # model_config.agent_env(). gpt-5.4-nano can't be driven through
    # opencode on the Azure /chat/completions endpoint (opencode injects the
    # Responses-API param `reasoningSummary`, which the endpoint rejects), so for
    # a behavioural eval allow pointing the agent at a known-working stage
    # (e.g. `index_db` -> Kimi-K2.6) without editing the user's models.local.yaml.
    if agent_stage != "table_agent":
        from core import model_config as _mc

        cfg = _mc.resolve_stage(agent_stage)
        _mc.agent_env = lambda: {
            "LLM_TABLE_API_BASE": cfg.endpoint,
            "LLM_TABLE_MODEL": cfg.model,
            "LLM_TABLE_API_KEY": cfg.api_key,
        }
        _log(
            f"AGENT MODEL OVERRIDE: stage '{agent_stage}' -> {cfg.model} @ {cfg.endpoint}"
        )

    mapping = json.loads((SEED / "templates" / audit_id / "mapping.json").read_text())
    audit_spec = json.loads((SEED / "templates" / audit_id / "spec.json").read_text())
    executable = mapping["executable"]
    db_ids = mapping.get("databases") or []
    db_paths = {d: VAR / "databases" / d / "database.sqlite" for d in db_ids}
    for d, p in db_paths.items():
        if not p.exists():
            _log(f"FATAL: missing seeded database {d}: {p} (run `make db seed`)")
            return 2

    extra_where = _dob_cohort_where(dob_after, db_paths) if dob_after else []
    if dob_after and not extra_where:
        _log(f"FATAL: no patients born after {dob_after}")
        return 2
    cohort_all = _resolve_cohort(executable, db_paths, extra_where=extra_where)
    cohort = cohort_all if dob_after else cohort_all[:cohort_cap]
    anchor = next(iter(executable.get("identity_keys") or []), None)
    cohort_tables: dict[str, list[str]] = {}
    for d in db_ids:
        cohort_tables.update(_resolve_cohort_tables(d, anchor))

    _log(f"audit={audit_id} databases={db_ids}")
    _log(f"anchor={anchor!r} cohort_tables={cohort_tables}")
    _log(f"cohort: using {len(cohort)} of {len(cohort_all)} members -> {cohort}")
    if not cohort:
        _log("FATAL: empty cohort")
        return 2

    _log("starting opencode runtime (opencode serve + gpt-5.4-nano)…")
    since = time.time()
    runtime = Runtime()
    await runtime.startup()
    relay = table_population.get_session_relay()
    client = relay.agent_client() if relay is not None else None
    if client is None:
        _log("FATAL: runtime did not expose an agent client")
        await runtime.shutdown()
        return 2
    _log("opencode runtime up; agent client ready.")

    run_id = f"eval-{audit_id}-{int(time.time())}"
    artifact_dir = VAR / "artifacts" / run_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    tmp = tempfile.mkdtemp(prefix="eval-store-")
    store = Store(Path(tmp) / "state.db")
    rc = 0
    try:
        store.create_run(
            Run(
                id=run_id,
                audit_id=audit_id,
                status="in_progress",
                database_ids=db_ids,
            )
        )
        _log(f"orchestrating run {run_id} (artifact_dir={artifact_dir})…")
        t0 = time.time()
        # Guard against a headless stall: opencode pauses on a `question` /
        # `doom_loop` permission "ask" with no one to answer, so the session may
        # never reach `session.idle`. The deadline cancels the wait; cells the
        # agent already wrote (via sql_execute on the "cells" db) are persisted,
        # and the activity log / opencode server log capture what it did.
        #
        # The eval drives the INGREDIENT-shaped inner seam
        # (run_population_steps on a hand-built TablePopulationContext), not
        # the request-shaped populate_table: this harness reads the SEED
        # mapping (not the var/ cache the assembly resolves) and caps the
        # cohort to --cohort members — a context no request identity produces.
        run_store = TablePopulationContext(
            store,
            run_id,
            executable=executable,
            cohort=cohort,
            database_paths=db_paths,
            field_spec=audit_spec,
            anchor=anchor,
            cohort_tables=cohort_tables,
        )
        deadline = float(os.environ.get("EVAL_DEADLINE", "480"))
        try:
            await asyncio.wait_for(
                run_population_steps(
                    run_store,
                    store,
                    artifact_dir=artifact_dir,
                    agent_client=client,
                    session_directory=str(artifact_dir),
                ),
                timeout=deadline,
            )
            _log(f"populate_table finished in {time.time() - t0:.1f}s")
        except asyncio.TimeoutError:
            _log(
                f"populate_table hit the {deadline:.0f}s deadline — "
                f"reading partial results (agent likely stalled on a permission ask)."
            )
        cells = store.get_cells(run_id)
        print("\n" + "=" * 72, flush=True)
        _summarize_cells(cells, executable)
        print("=" * 72, flush=True)
        _digest_activity(artifact_dir)
        print("-" * 72, flush=True)
        _digest_opencode_log(since)
        print("=" * 72, flush=True)
        _log(f"artifact workspace for manual inspection: {artifact_dir}")
    except Exception as exc:  # noqa: BLE001
        _log(f"RUN FAILED: {type(exc).__name__}: {exc}")
        import traceback

        traceback.print_exc()
        rc = 1
    finally:
        store.close()
        await runtime.shutdown()
    return rc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--audit", default="npda")
    ap.add_argument(
        "--cohort",
        type=int,
        default=3,
        help="cap the cohort to N members (keeps the agent run fast/cheap)",
    )
    ap.add_argument(
        "--agent-stage",
        default="table_agent",
        help="models.yaml stage to drive the opencode agent (default table_agent; "
        "use index_db to run the agent on Kimi-K2.6 if gpt-5.4-nano is blocked)",
    )
    ap.add_argument(
        "--dob-after",
        default=None,
        help="scope the cohort to patients born strictly after this ISO date "
        "(e.g. 2020-01-01); selects the single-patient NPDA cohort and "
        "ignores --cohort",
    )
    args = ap.parse_args()
    return asyncio.run(
        run_eval(args.audit, args.cohort, args.agent_stage, args.dob_after)
    )


if __name__ == "__main__":
    raise SystemExit(main())
