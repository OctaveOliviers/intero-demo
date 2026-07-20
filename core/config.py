import json
import logging
import os
import shutil
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
# `.env` is the gitignored file holding your keys. Create it once from the
# committed template with `cp -n .env.example .env` (the `-n` keeps a re-run
# from clobbering keys you've added).
load_dotenv(ROOT / ".env")
APP_DIR = ROOT / "app"
STATIC_DIR = APP_DIR / "static"

# The state plane: authored definitions AND durable table-population state, per
# specs/product/contracts/storage-layout.md §1. Gitignored, mountable as a
# deployment volume — everything that varies per hospital deployment lives here.
VAR_DIR = ROOT / "var"
# A Table (later a Dashboard) is an Artifact — an Output with its own id and its
# own persistent, rerunnable sub-agent workspace (CONTEXT.md §Artifact). That
# workspace is the Artifact's home: var/artifacts/<id>/ is the opencode project
# root its table agent is launched from (storage-layout.md §4). A one-shot
# startup migration (server/main.py::migrate_legacy_runs_dir) moves any
# pre-existing var/runs/ into place.
ARTIFACTS_DIR = VAR_DIR / "artifacts"
# The stored authored object under var/templates/<id>/ (spec.json + mapping.json +
# optional workbook.xlsx) is a Template, never an "audit" (glossary) — the
# audit-named directory is retired. A one-shot startup migration
# (server/main.py::migrate_legacy_templates_dir) moves any pre-existing
# var/audits/ into place.
TEMPLATES_DIR = VAR_DIR / "templates"
DATABASES_DIR = VAR_DIR / "databases"
# A Dataset is a saved, named filter that scopes the hospital database to a slice
# (library-and-sources.md). Each persists as var/datasets/<id>/dataset.json — its
# grounded criteria + composed cohort SQL + cached count — per the additive
# `dataset` storage contract (storage-layout.md §3).
DATASETS_DIR = VAR_DIR / "datasets"
# A thread is the free-ranging, unscoped conversation surface (product-flows.md).
# Each persists as var/threads/<id>/thread.json — its messages + per-message
# agent resolution metadata — per the additive `thread` storage contract (storage-layout.md
# §3). A thread carries no fixed Dataset and does not fork (decisions/0004).
THREADS_DIR = VAR_DIR / "threads"
# Legacy one-off chat worktree root. Production threads keep their persistent
# opencode worktree/session beside the thread at var/threads/<id>/opencode so
# opencode owns the conversation context for that thread.
CHATS_DIR = VAR_DIR / "chats"
# LEGACY table-metadata location. A table's metadata is transactional state and
# lives as a row in var/state.db (storage-layout.md §3); this dir is read once
# at startup to adopt pre-migration var/tables/<id>/table.json files
# (core/tables/store.py::import_legacy_table_files) and is never written again.
TABLES_DIR = VAR_DIR / "tables"
# The single state store for the deployment (invariant §7: one writable cell
# store at var/state.db; never copied into an agent worktree.
STATE_DB_PATH = VAR_DIR / "state.db"
# Canonical filename for the source workbook of an uploaded audit
# (storage-layout §3 file-name convention). The upload route, the indexer, and
# the compiled executable all reference this one name.
WORKBOOK_NAME = "workbook.xlsx"

# The code plane: the canonical agent bundle lives flat at core/agent/ (§2) —
# tools/, skills/, node_modules/ and the template opencode.json. It is committed
# code, never written to at run time. Each agent worktree (a table run root, a
# thread's chat dir) is materialized by core/agent/worktree.py with a .opencode/
# dir of symlinks into this bundle, so tool and skill code has one source of
# truth.
AGENT_DIR = ROOT / "core" / "agent"
AGENT_OPENCODE_CONFIG = AGENT_DIR / "opencode.json"

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "opencode")
OPENCODE_SERVER_HOST = os.environ.get("OPENCODE_SERVER_HOST", "127.0.0.1")
OPENCODE_SERVER_PORT = int(os.environ.get("OPENCODE_SERVER_PORT", "0"))

# Per-call HTTP timeout for every LLM request (seconds). Operational knob, not
# per-stage — reasoning models / large mappings can exceed the 120s default.
# Endpoint/model/key are NOT global anymore: they live per stage in
# models.yaml / models.local.yaml (see core/model_config.py).
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "120"))


# The applied-migrations marker: a single durable JSON file under var/ recording
# which one-shot startup migrations/adoptions have already run. Each step is
# keyed by a stable name; once its key is present the step is skipped on every
# subsequent boot, so the scan/open cost is paid at most once and a completed
# migration's code can be deleted in a later release without behavior change
# (the marker still records it as applied). See run_migration_once (issue #335).
MIGRATIONS_MARKER_PATH = VAR_DIR / "migrations_applied.json"


def _load_applied_migrations(marker_path: Path) -> set[str]:
    """Read the set of applied-migration keys. A missing or unreadable marker
    reads as empty (fail-open: a corrupt marker re-runs the idempotent steps
    rather than wedging startup)."""
    try:
        data = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    if isinstance(data, dict):
        applied = data.get("applied")
        if isinstance(applied, list):
            return {str(k) for k in applied}
    return set()


def migration_applied(key: str, *, marker_path: Path | None = None) -> bool:
    """True iff the one-shot migration ``key`` has been recorded as applied."""
    marker = MIGRATIONS_MARKER_PATH if marker_path is None else marker_path
    return key in _load_applied_migrations(marker)


def mark_migration_applied(key: str, *, marker_path: Path | None = None) -> None:
    """Durably record that the one-shot migration ``key`` has been applied.

    Writes the marker atomically (temp file + rename) so a crash mid-write can
    never leave a truncated marker that loses already-recorded keys."""
    marker = MIGRATIONS_MARKER_PATH if marker_path is None else marker_path
    applied = _load_applied_migrations(marker)
    if key in applied:
        return
    applied.add(key)
    marker.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"applied": sorted(applied)}, indent=2)
    tmp = marker.with_suffix(marker.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    # fsync the temp file before the atomic replace so a crash immediately
    # after the rename cannot leave the marker naming keys whose bytes never
    # reached disk — the applied record must be durable once written.
    with open(tmp, "rb") as fh:
        os.fsync(fh.fileno())
    tmp.replace(marker)


def run_migration_once(
    key: str,
    step: Callable[[], object],
    *,
    marker_path: Path | None = None,
) -> bool:
    """Run one-shot startup ``step`` exactly once across boots.

    Skips (and returns False) when ``key`` is already recorded in the
    applied-migrations marker; otherwise runs ``step`` and, only if it does not
    raise, records ``key`` as applied and returns True. A step that raises is
    NOT marked, so the next boot retries it (the steps are individually
    idempotent). This is the single gate for every one-shot legacy-adoption
    step wired in server/main.py's lifespan (issue #335)."""
    if migration_applied(key, marker_path=marker_path):
        return False
    step()
    mark_migration_applied(key, marker_path=marker_path)
    return True


def ensure_runs_storage() -> None:
    """Make sure var/artifacts exists. Idempotent; called at server startup.

    Per the artifact-rooted contract (storage-layout §4), each Artifact's table
    agent runs from a self-contained opencode project root under
    var/artifacts/<artifact_id>/. There is no longer a shared agent/runs
    symlink — each artifact workspace is launched from directly, so this helper
    only has to guarantee the parent exists.
    """
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def _adopt_legacy_dir(legacy: Path, target: Path, *, label: str) -> bool:
    """Move a retired legacy storage dir's children into ``target``, adopting
    any legacy data even when ``target`` already exists (issue #331).

    Keys on "is there legacy data to adopt", NOT on "does target exist": if the
    new-layout dir exists while a legacy dir reappears (backup restore /
    rollback-then-forward), each legacy child is still merged in rather than
    silently stranded as 'unknown'. Per-child moves so an existing target child
    is never clobbered (the new layout wins per-id). Defensive against a
    vanished source at every step, so a concurrent startup that already moved a
    child cannot crash the second caller (single-worker today, but future-proof
    for multi-worker). No-op when the legacy dir is absent. Returns True iff any
    child was adopted."""
    if not legacy.is_dir():
        return False
    target.mkdir(parents=True, exist_ok=True)
    adopted = 0
    for child in sorted(legacy.iterdir()):
        dest = target / child.name
        if dest.exists():
            # New layout already owns this id — leave the legacy copy in place.
            continue
        try:
            child.rename(dest)
        except FileNotFoundError:
            # Source vanished (a concurrent caller already moved it) — skip.
            continue
        except OSError:
            # A same-filesystem rename failed — most likely a cross-device link
            # (var/ can be a mounted volume, storage-layout §1), where rename
            # raises EXDEV. Fall back to a copy+delete move so the legacy data
            # is adopted rather than silently stranded.
            try:
                shutil.move(str(child), str(dest))
            except (FileNotFoundError, OSError) as exc:
                logger.warning(
                    "could not adopt legacy entry %s -> %s (%s)", child, dest, exc
                )
                continue
        adopted += 1
    # Remove the now-empty legacy dir; tolerate it being non-empty (children the
    # new layout already owned) or already gone (a concurrent caller removed it).
    try:
        legacy.rmdir()
    except OSError:
        pass
    if adopted:
        logger.info("adopted %d legacy entries from %s -> %s", adopted, label, target)
    return adopted > 0


def migrate_legacy_templates_dir(
    *, legacy_dir: Path | None = None, templates_dir: Path | None = None
) -> bool:
    """One-shot forward migration (startup): adopt the retired ``var/audits/``
    directory into its Template-named home ``var/templates/``.

    The stored object is a Template, never an "audit" (glossary), so the
    audit-named storage directory was renamed. Adopts every legacy child even
    when the target already exists, so legacy data is never stranded (issue
    #331); an id the new layout already owns is left untouched. Idempotent and
    safe. Returns True iff anything was adopted. MUST run before anything reads
    ``TEMPLATES_DIR``.
    """
    legacy = (VAR_DIR / "audits") if legacy_dir is None else legacy_dir
    target = TEMPLATES_DIR if templates_dir is None else templates_dir
    return _adopt_legacy_dir(legacy, target, label="var/audits")


def migrate_legacy_runs_dir(
    *, legacy_dir: Path | None = None, artifacts_dir: Path | None = None
) -> bool:
    """One-shot forward migration (startup): adopt the retired ``var/runs/``
    directory into its Artifact-named home ``var/artifacts/``.

    A Table (later a Dashboard) is an Artifact whose persistent, rerunnable
    sub-agent workspace lives at ``var/artifacts/<artifact_id>/`` (CONTEXT.md
    §Artifact; storage-layout §4), so the run-named storage directory was
    renamed. Same shape as :func:`migrate_legacy_templates_dir`: adopts every
    legacy child even when the target already exists (issue #331), idempotent,
    safe. Returns True iff anything was adopted. MUST run before anything reads
    ``ARTIFACTS_DIR``.
    """
    legacy = (VAR_DIR / "runs") if legacy_dir is None else legacy_dir
    target = ARTIFACTS_DIR if artifacts_dir is None else artifacts_dir
    return _adopt_legacy_dir(legacy, target, label="var/runs")
