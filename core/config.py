import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
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


def ensure_runs_storage() -> None:
    """Make sure var/runs exists. Idempotent; called at server startup.

    Per the run-rooted contract (storage-layout §4), Tier-3 runs are
    self-contained opencode project roots under var/runs/<run_id>/. There is
    no longer a shared agent/runs symlink — each run dir is launched from
    directly, so this helper only has to guarantee the parent exists.
    """
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
