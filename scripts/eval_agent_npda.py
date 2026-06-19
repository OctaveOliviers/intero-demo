"""Headless NPDA Tier-1 → Tier-3 agent pass — a real end-to-end eval.

Mirrors the production run wiring in ``server/routes/runs.py::_run_spine`` but
drives it from the command line so we can inspect the agent's behaviour:

  * Tier 1 (``try_direct``) auto-fills the deterministic cells.
  * Tier 2 is SKIPPED (``TIER2_ENABLED=0``) — cells go straight to the agent.
  * Tier 3 is the REAL opencode agent (gpt-5.4-nano via models.local.yaml),
    standing up a live ``opencode serve`` exactly as the server does.

After the run it prints a cell-state summary (filled / blocked / pending),
the INTERPRET-cell breakdown by field, every blocked reason, and a digest of
the agent's tool activity (which databases it queried, repeated queries,
thinking volume) so we can judge: does it reach demographics, does it stop
relitigating, does it fill the previously-blocked cells.

Run::

    python3 -m scripts.eval_agent_npda [--cohort N] [--audit npda]
"""

from __future__ import annotations

import core.config  # noqa: F401  -- import FIRST: loads .env.local (Azure keys)

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

from core.config import ROOT, DATABASES_DIR  # noqa: E402
from core.runtime import Runtime  # noqa: E402
from core.running import stream_runner  # noqa: E402
from core.running.orchestrator import orchestrate_run  # noqa: E402
from core.running.try_agent import make_tier_agent  # noqa: E402
from core.running.try_direct import try_direct  # noqa: E402
from core.store import Run, Store  # noqa: E402

SEED = ROOT / "seed"
VAR = ROOT / "var"


def _log(msg: str) -> None:
    print(f"[eval {time.strftime('%H:%M:%S')}] {msg}", flush=True)


async def _noop_tier(_run_store) -> None:
    """Tier 2 placeholder — never invoked because TIER2_ENABLED=0."""
    return None


def _resolve_cohort(executable: dict, db_paths: dict[str, Path]) -> list[str]:
    cohort = executable.get("cohort") or {}
    db_path = db_paths.get(cohort.get("database"))
    if db_path is None:
        return []
    sql = f"SELECT DISTINCT {cohort['identity_select']} FROM {cohort['from']}"
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return [str(r[0]) for r in conn.execute(sql).fetchall()]
    finally:
        conn.close()


def _resolve_cohort_tables(database_id: str, anchor: str | None) -> dict[str, list[str]]:
    """Mirror server/routes/runs.py::_resolve_cohort_tables."""
    if not anchor:
        return {}
    model_path = DATABASES_DIR / database_id / "model.json"
    if not model_path.exists():
        return {database_id: []}
    model = json.loads(model_path.read_text(encoding="utf-8"))
    tables: list[str] = []
    anchor_lower = anchor.lower()
    for table in model.get("tables", []) or []:
        if not isinstance(table, dict):
            continue
        cols = table.get("columns", []) or []
        if any(
            isinstance(col, dict) and str(col.get("name") or "").lower() == anchor_lower
            for col in cols
        ):
            name = str(table.get("name") or "").strip()
            if name:
                tables.append(name)
    return {database_id: tables}


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
        _log(f"  sql_execute queries observed: {len(sql_queries)} "
             f"(distinct: {len(set(q.strip() for q in sql_queries))})")
        for q in sql_queries[:15]:
            _log(f"    » {q.replace(chr(10),' ')[:200]}")
    # surface any obvious cross-DB errors
    for r in records:
        blob = json.dumps(r)
        for needle in ("no such column", "no such table", "cross-database",
                       "cross database", "no cross", "nhs_number"):
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
            "level=error" in low or "err=" in low or "status=4" in low or "status=5" in low
        ):
            errors.append(ln[:240])
    _log(f"OPENCODE LOG: {newest.name} — {llm_calls} llm round-trips")
    _log(f"  MODEL(S) USED: {dict(models)}  <-- must be remote/<gpt-5.4-nano> to be a valid eval")
    if errors:
        _log(f"  errors in log ({len(errors)}):")
        for e in errors[:8]:
            _log(f"    {e}")


async def run_eval(audit_id: str, cohort_cap: int, agent_stage: str) -> int:
    os.environ["TIER2_ENABLED"] = "0"  # cells go Tier 1 -> Tier 3 agent
    os.environ["TIER3_ENABLED"] = "1"

    # The opencode agent process is configured from the `tier3_agent` stage via
    # model_config.tier3_agent_env(). gpt-5.4-nano can't be driven through
    # opencode on the Azure /chat/completions endpoint (opencode injects the
    # Responses-API param `reasoningSummary`, which the endpoint rejects), so for
    # a behavioural eval allow pointing the agent at a known-working stage
    # (e.g. `index_db` -> Kimi-K2.6) without editing the user's models.local.yaml.
    if agent_stage != "tier3_agent":
        from core import model_config as _mc
        cfg = _mc.resolve_stage(agent_stage)
        _mc.tier3_agent_env = lambda: {
            "LLM_API_BASE": cfg.endpoint,
            "LLM_MODEL": cfg.model,
            "LLM_API_KEY": cfg.api_key,
        }
        _log(f"AGENT MODEL OVERRIDE: stage '{agent_stage}' -> {cfg.model} @ {cfg.endpoint}")

    mapping = json.loads((SEED / "audits" / audit_id / "mapping.json").read_text())
    audit_spec = json.loads((SEED / "audits" / audit_id / "spec.json").read_text())
    executable = mapping["executable"]
    db_ids = mapping.get("databases") or []
    db_paths = {d: VAR / "databases" / d / "database.sqlite" for d in db_ids}
    for d, p in db_paths.items():
        if not p.exists():
            _log(f"FATAL: missing seeded database {d}: {p} (run `make db seed`)")
            return 2

    cohort_all = _resolve_cohort(executable, db_paths)
    cohort = cohort_all[:cohort_cap]
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
    client = stream_runner.runner.agent_client() if stream_runner.runner else None
    if client is None:
        _log("FATAL: runtime did not expose an agent client")
        await runtime.shutdown()
        return 2
    _log("opencode runtime up; agent client ready.")

    run_id = f"eval-{audit_id}-{int(time.time())}"
    run_dir = VAR / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    tmp = tempfile.mkdtemp(prefix="eval-store-")
    store = Store(Path(tmp) / "state.db")
    rc = 0
    try:
        store.create_run(Run(
            id=run_id, audit_id=audit_id, status="in_progress",
            database_ids=db_ids,
        ))
        tier_agent = make_tier_agent(
            run_dir=run_dir,
            session_directory=str(run_dir),
            databases_dir=DATABASES_DIR,
            client=client,
        )
        _log(f"orchestrating run {run_id} (run_dir={run_dir})…")
        t0 = time.time()
        # Guard against a headless stall: opencode pauses on a `question` /
        # `doom_loop` permission "ask" with no one to answer, so the session may
        # never reach `session.idle`. The deadline cancels the wait; cells the
        # agent already wrote (via sql_execute on the "cells" db) are persisted,
        # and the activity log / opencode server log capture what it did.
        deadline = float(os.environ.get("EVAL_DEADLINE", "480"))
        try:
            await asyncio.wait_for(
                orchestrate_run(
                    store, run_id, executable, cohort,
                    tier_direct=try_direct,
                    tier_llm=_noop_tier,
                    tier_agent=tier_agent,
                    database_paths=db_paths,
                    audit=audit_spec,
                    anchor=anchor,
                    cohort_tables=cohort_tables,
                ),
                timeout=deadline,
            )
            _log(f"orchestrate_run finished in {time.time() - t0:.1f}s")
        except asyncio.TimeoutError:
            _log(f"orchestrate_run hit the {deadline:.0f}s deadline — "
                 f"reading partial results (agent likely stalled on a permission ask).")
        cells = store.get_cells(run_id)
        print("\n" + "=" * 72, flush=True)
        _summarize_cells(cells, executable)
        print("=" * 72, flush=True)
        _digest_activity(run_dir)
        print("-" * 72, flush=True)
        _digest_opencode_log(since)
        print("=" * 72, flush=True)
        _log(f"run dir for manual inspection: {run_dir}")
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
    ap.add_argument("--cohort", type=int, default=3,
                    help="cap the cohort to N members (keeps the agent run fast/cheap)")
    ap.add_argument("--agent-stage", default="tier3_agent",
                    help="models.yaml stage to drive the opencode agent (default tier3_agent; "
                         "use index_db/tier2 to run the agent on Kimi-K2.6 if gpt-5.4-nano is blocked)")
    args = ap.parse_args()
    return asyncio.run(run_eval(args.audit, args.cohort, args.agent_stage))


if __name__ == "__main__":
    raise SystemExit(main())
