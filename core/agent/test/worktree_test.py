"""``core.agent.worktree`` — materializing agent worktrees.

``materialize_opencode_root`` is the ONE way any agent worktree (a Tier-3 run
dir, a thread's chat dir) becomes a self-contained opencode project root
(storage-layout §2/§4): an ``opencode.json`` copy plus a real ``.opencode/``
directory whose ``tools`` / ``skills`` / ``node_modules`` SYMLINK the canonical
committed bundle at ``core/agent/`` — one source of truth, no copies.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from core.agent import worktree
from core.config import AGENT_DIR, AGENT_OPENCODE_CONFIG


class MaterializeOpencodeRootTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name) / "wt"

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_creates_opencode_project_root_with_symlinked_bundle(self) -> None:
        worktree.materialize_opencode_root(self.root)
        self.assertTrue((self.root / "opencode.json").is_file())
        self.assertEqual(
            (self.root / "opencode.json").read_text(encoding="utf-8"),
            AGENT_OPENCODE_CONFIG.read_text(encoding="utf-8"),
        )
        dot = self.root / ".opencode"
        self.assertTrue(dot.is_dir())
        self.assertFalse(dot.is_symlink())
        for name in ("tools", "skills", "node_modules"):
            link = dot / name
            self.assertTrue(link.is_symlink(), name)
            self.assertEqual(link.resolve(), (AGENT_DIR / name).resolve(), name)

    def test_config_override_replaces_the_copied_template(self) -> None:
        worktree.materialize_opencode_root(
            self.root, config={"permission": {"*": "deny"}}
        )
        config = json.loads((self.root / "opencode.json").read_text(encoding="utf-8"))
        self.assertEqual(config, {"permission": {"*": "deny"}})

    def test_rerun_is_idempotent(self) -> None:
        worktree.materialize_opencode_root(self.root)
        first = sorted(p.name for p in (self.root / ".opencode").iterdir())
        worktree.materialize_opencode_root(self.root)
        self.assertEqual(
            sorted(p.name for p in (self.root / ".opencode").iterdir()), first
        )
        self.assertTrue((self.root / ".opencode" / "tools").is_symlink())


def _seed_database(databases_dir: Path, slug: str) -> None:
    """A registered database as the deployment lays it down:
    ``<databases_dir>/<slug>/database.sqlite`` + ``model.json``."""
    db_dir = databases_dir / slug
    db_dir.mkdir(parents=True, exist_ok=True)
    (db_dir / "database.sqlite").touch()
    (db_dir / "model.json").write_text(
        json.dumps({"database": slug, "identity_links": [], "foreign_keys": []}),
        encoding="utf-8",
    )


class MaterializeThreadWorktreeTest(unittest.TestCase):
    """``materialize`` — the thread agent's worktree: the opencode root, EVERY
    registered read-only clinical database (the whole hospital-DB ceiling,
    fail-closed at the registered set), and a per-id authorized projection of
    the Dataset/Template libraries. Authorization is an injected predicate so
    the caller's grants layer decides; NO predicate means NOTHING is exposed
    (fail-closed), and a re-run converges on the current grants."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        root = Path(self.tmpdir.name)
        self.worktree = root / "wt"
        self.databases_dir = root / "databases"
        self.datasets_dir = root / "datasets"
        self.templates_dir = root / "audits"
        for slug in ("cord-ph", "npda-clinical"):
            _seed_database(self.databases_dir, slug)
        for dataset_id in ("ds-a", "ds-b"):
            ds = self.datasets_dir / dataset_id
            ds.mkdir(parents=True)
            (ds / "dataset.json").write_text(
                json.dumps({"id": dataset_id, "name": dataset_id}), encoding="utf-8"
            )
        for template_id in ("tpl-a", "tpl-b"):
            tpl = self.templates_dir / template_id
            tpl.mkdir(parents=True)
            (tpl / "spec.json").write_text(
                json.dumps({"id": template_id, "fields": []}), encoding="utf-8"
            )

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def _materialize(self, authorize=None) -> None:
        worktree.materialize(
            self.worktree,
            authorize=authorize,
            databases_dir=self.databases_dir,
            datasets_dir=self.datasets_dir,
            templates_dir=self.templates_dir,
        )

    def test_materializes_opencode_root_and_all_registered_databases(self) -> None:
        self._materialize()
        self.assertTrue((self.worktree / "opencode.json").is_file())
        self.assertTrue((self.worktree / ".opencode" / "tools").is_symlink())
        for slug in ("cord-ph", "npda-clinical"):
            self.assertTrue(
                (self.worktree / "databases" / f"{slug}.sqlite").is_symlink(), slug
            )
            self.assertTrue(
                (self.worktree / "databases" / f"{slug}.model.json").is_file(), slug
            )
        context = json.loads(
            (self.worktree / "context.json").read_text(encoding="utf-8")
        )
        self.assertEqual(context["mode"], "chat")
        self.assertEqual(sorted(context["databases"]), ["cord-ph", "npda-clinical"])

    def test_unregistered_database_dir_is_not_linked(self) -> None:
        (self.databases_dir / "half-registered").mkdir()
        (self.databases_dir / "half-registered" / "database.sqlite").touch()
        self._materialize()
        self.assertFalse(
            (self.worktree / "databases" / "half-registered.sqlite").exists()
        )

    def test_no_authorizer_exposes_no_datasets_or_templates(self) -> None:
        self._materialize()
        self.assertEqual(list((self.worktree / "datasets").iterdir()), [])
        self.assertEqual(list((self.worktree / "templates").iterdir()), [])

    def test_exposes_exactly_the_authorized_ids(self) -> None:
        allowed = {("dataset", "ds-a"), ("template", "tpl-a")}
        self._materialize(authorize=lambda rt, rid: (rt, rid) in allowed)
        ds_link = self.worktree / "datasets" / "ds-a"
        self.assertTrue(ds_link.is_symlink())
        self.assertEqual(ds_link.resolve(), (self.datasets_dir / "ds-a").resolve())
        self.assertTrue((ds_link / "dataset.json").is_file())
        self.assertFalse((self.worktree / "datasets" / "ds-b").exists())
        tpl_link = self.worktree / "templates" / "tpl-a"
        self.assertTrue(tpl_link.is_symlink())
        self.assertTrue((tpl_link / "spec.json").is_file())
        self.assertFalse((self.worktree / "templates" / "tpl-b").exists())

    def test_rerun_converges_on_the_current_grants(self) -> None:
        self._materialize(authorize=lambda rt, rid: rid in ("ds-a", "tpl-a"))
        self.assertTrue((self.worktree / "datasets" / "ds-a").is_symlink())
        # The grant moved: ds-a revoked, ds-b granted. Re-materialize.
        self._materialize(authorize=lambda rt, rid: rid in ("ds-b", "tpl-a"))
        self.assertFalse((self.worktree / "datasets" / "ds-a").exists())
        self.assertTrue((self.worktree / "datasets" / "ds-b").is_symlink())
        self.assertTrue((self.worktree / "templates" / "tpl-a").is_symlink())


if __name__ == "__main__":
    unittest.main()
