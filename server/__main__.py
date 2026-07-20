import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python3 -m server",
        description="Run the Intero API server.",
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="bind host (default 127.0.0.1)"
    )
    parser.add_argument(
        "--port", type=int, default=8000, help="bind port (default 8000)"
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="don't restart on file changes — keeps long-running audit runs alive",
    )
    args = parser.parse_args()

    # --reload watches *.py under the project tree. Editing code while a run is
    # in flight restarts the worker, which kills the in-flight _execute_table_population_session task
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
