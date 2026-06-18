import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
# `.env` is the templated base (README quickstart copies `.env.example` → `.env`,
# which clobbers anything you'd added). `.env.local` is the gitignored,
# never-templated override for secrets — same precedence pattern as
# models.local.yaml over models.yaml — so a `.env` reset can't wipe your keys.
# `.env.local` is loaded second with override=True, so it always wins.
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local", override=True)
APP_DIR = ROOT / "app"
STATIC_DIR = APP_DIR / "static"

# The state plane: authored definitions AND durable run state, per
# docs/mvp/contracts/storage-layout.md §1. Gitignored, mountable as a deployment
# volume — everything that varies per hospital deployment lives here.
VAR_DIR = ROOT / "var"
RUNS_DIR = VAR_DIR / "runs"
AUDITS_DIR = VAR_DIR / "audits"
DATABASES_DIR = VAR_DIR / "databases"
# The single state store for the deployment (invariant §7: one writable cell
# store at var/state.db; never per-run, never copied — Tier 3 reaches it via
# the run dir's audit/cells.sqlite symlink).
STATE_DB_PATH = VAR_DIR / "state.db"
# Canonical filename for the source workbook of an uploaded audit
# (storage-layout §3 file-name convention). The upload route, the indexer, and
# the compiled executable all reference this one name.
WORKBOOK_NAME = "workbook.xlsx"

# The code plane: the opencode template lives at core/agent/ (§2). It is
# committed code, never written to at run time. Each Tier-3 run is provisioned
# its own opencode project root under var/runs/<run_id>/ that references this
# template via .opencode symlink — so tool and skill code has one source of
# truth.
AGENT_DIR = ROOT / "core" / "agent"
AGENT_OPENCODE_DIR = AGENT_DIR / ".opencode"
AGENT_OPENCODE_CONFIG = AGENT_DIR / "opencode.json"

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "opencode")
OPENCODE_SERVER_HOST = os.environ.get("OPENCODE_SERVER_HOST", "127.0.0.1")
OPENCODE_SERVER_PORT = int(os.environ.get("OPENCODE_SERVER_PORT", "0"))

# LLM endpoint for deterministic indexing builders (OpenAI Responses API shape).
LLM_API_BASE = os.environ.get("LLM_API_BASE", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "")
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "120"))


def tier_enabled(tier: str) -> bool:
    """Run-engine tier toggle for perf isolation. ``TIER2_ENABLED=0`` skips the
    per-cell LLM tier (cells go Tier 1 → Tier 3 agent); ``TIER3_ENABLED=0`` skips
    the agent. Both default on. Read at RUN TIME (not import) so the server's
    ``--no-tier2`` / ``--no-tier3`` flags — which set these env vars for the
    reload worker — take effect. Accepts 0/false/no/off (case-insensitive)."""
    value = os.environ.get(f"{tier.upper()}_ENABLED")
    if value is None:
        return True
    return value.strip().lower() not in ("0", "false", "no", "off", "")


def tier_env_overrides(*, no_tier2: bool, no_tier3: bool) -> dict[str, str]:
    """Map the server's ``--no-tier2`` / ``--no-tier3`` flags to the
    ``TIER*_ENABLED`` env the run worker reads. Each var is set EXPLICITLY (not
    only when disabling), so a flag-less start always runs every tier regardless
    of any stale value left in the shell — the flag, not a sticky export, is the
    authority for that run."""
    return {
        "TIER2_ENABLED": "0" if no_tier2 else "1",
        "TIER3_ENABLED": "0" if no_tier3 else "1",
    }


def ensure_runs_storage() -> None:
    """Make sure var/runs exists. Idempotent; called at server startup.

    Per the run-rooted contract (storage-layout §4), Tier-3 runs are
    self-contained opencode project roots under var/runs/<run_id>/. There is
    no longer a shared agent/runs symlink — each run dir is launched from
    directly, so this helper only has to guarantee the parent exists.
    """
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
