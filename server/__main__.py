import argparse
import os

import uvicorn

from core.config import tier_env_overrides


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python3 -m server",
        description="Run the Intero API server. By default every resolution tier "
        "is on (Tier 1 auto-fill → Tier 2 per-cell LLM → Tier 3 agent); the "
        "--no-tier flags skip a tier for performance isolation.",
    )
    parser.add_argument(
        "--no-tier2", action="store_true",
        help="skip the per-cell LLM tier — unresolved cells go Tier 1 → agent",
    )
    parser.add_argument(
        "--no-tier3", action="store_true",
        help="skip the agent tier — unresolved cells are left pending",
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="bind port (default 8000)")
    parser.add_argument(
        "--no-reload", action="store_true",
        help="don't restart on file changes — keeps long-running audit runs alive",
    )
    args = parser.parse_args()

    # The flag is the authority for THIS run: set both vars explicitly so a
    # flag-less start runs every tier even if the shell has a stale export. The
    # reload worker is a subprocess that inherits this environment + reads it via
    # core.config.tier_enabled at run time.
    os.environ.update(tier_env_overrides(no_tier2=args.no_tier2, no_tier3=args.no_tier3))

    # --reload watches *.py under the project tree. Editing code while a run is
    # in flight restarts the worker, which kills the in-flight _run_spine task
    # and the SSE stream (the opencode subprocess keeps going, so the agent
    # finishes and the run recovers via the state.db snapshot on next open, but
    # the live link drops). `--no-reload` disables the watcher for long agent
    # runs / demos. (var/ writes don't trigger reloads — uvicorn watches only
    # *.py — so no path exclusion is needed.)
    uvicorn.run(
        "server.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
    )


if __name__ == "__main__":
    main()
