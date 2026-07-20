"""``migrate_legacy_templates_dir`` — the one-shot var/audits -> var/templates move.

The stored object under the directory is a Template, never an "audit" (glossary),
so the audit-named storage directory was retired. This startup migration moves a
pre-existing ``var/audits/`` into place; it is idempotent and safe, mirroring
``core/tables/store.py::import_legacy_table_files``.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.config import (
    migrate_legacy_runs_dir,
    migrate_legacy_templates_dir,
    migration_applied,
    run_migration_once,
)


class MigrateLegacyTemplatesDirTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.legacy = self.root / "audits"
        self.target = self.root / "templates"

    def tearDown(self):
        self._tmp.cleanup()

    def _call(self) -> bool:
        return migrate_legacy_templates_dir(
            legacy_dir=self.legacy, templates_dir=self.target
        )

    def test_moves_legacy_dir_when_target_absent(self):
        (self.legacy / "cord-ph").mkdir(parents=True)
        (self.legacy / "cord-ph" / "spec.json").write_text("{}", encoding="utf-8")

        self.assertTrue(self._call())

        self.assertFalse(self.legacy.exists())
        self.assertTrue((self.target / "cord-ph" / "spec.json").is_file())

    def test_noop_when_legacy_absent(self):
        self.assertFalse(self._call())
        self.assertFalse(self.target.exists())

    def test_idempotent_second_run_is_a_noop(self):
        (self.legacy / "npda").mkdir(parents=True)
        self.assertTrue(self._call())
        # The legacy dir is gone; a second run finds nothing to move.
        self.assertFalse(self._call())
        self.assertTrue((self.target / "npda").is_dir())

    def test_adopts_legacy_child_even_when_target_exists(self):
        # Issue #331 orphan-on-restore: the target dir already exists (new
        # layout) AND a legacy dir reappears (backup restore / rollback). The
        # legacy id must still be adopted, not stranded.
        (self.legacy / "restored").mkdir(parents=True)
        (self.legacy / "restored" / "spec.json").write_text("{}", encoding="utf-8")
        (self.target / "existing").mkdir(parents=True)

        self.assertTrue(self._call())

        # Both the pre-existing target id and the adopted legacy id are present.
        self.assertTrue((self.target / "existing").is_dir())
        self.assertTrue((self.target / "restored" / "spec.json").is_file())
        # The empty legacy dir is cleaned up.
        self.assertFalse(self.legacy.exists())

    def test_target_id_wins_when_same_id_in_both(self):
        # Same id present in legacy AND target: the new layout's copy wins; the
        # legacy copy is left in place rather than clobbering it.
        (self.legacy / "dup").mkdir(parents=True)
        (self.legacy / "dup" / "legacy.txt").write_text("legacy", encoding="utf-8")
        (self.target / "dup").mkdir(parents=True)
        (self.target / "dup" / "new.txt").write_text("new", encoding="utf-8")

        self.assertFalse(self._call())

        self.assertTrue((self.target / "dup" / "new.txt").is_file())
        self.assertFalse((self.target / "dup" / "legacy.txt").exists())
        # The legacy id it could not adopt is left untouched.
        self.assertTrue((self.legacy / "dup" / "legacy.txt").is_file())


class MigrateLegacyRunsDirTest(unittest.TestCase):
    """``migrate_legacy_runs_dir`` — the one-shot var/runs -> var/artifacts move.

    A Table (later a Dashboard) is an Artifact whose persistent sub-agent
    workspace lives at ``var/artifacts/<artifact_id>/`` (CONTEXT.md §Artifact),
    so the run-named directory was retired. Same shape as the templates move:
    idempotent, safe, target-wins.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.legacy = self.root / "runs"
        self.target = self.root / "artifacts"

    def tearDown(self):
        self._tmp.cleanup()

    def _call(self) -> bool:
        return migrate_legacy_runs_dir(
            legacy_dir=self.legacy, artifacts_dir=self.target
        )

    def test_moves_legacy_dir_when_target_absent(self):
        (self.legacy / "run-1").mkdir(parents=True)
        (self.legacy / "run-1" / "context.json").write_text("{}", encoding="utf-8")

        self.assertTrue(self._call())

        self.assertFalse(self.legacy.exists())
        self.assertTrue((self.target / "run-1" / "context.json").is_file())

    def test_noop_when_legacy_absent(self):
        self.assertFalse(self._call())
        self.assertFalse(self.target.exists())

    def test_idempotent_second_run_is_a_noop(self):
        (self.legacy / "run-2").mkdir(parents=True)
        self.assertTrue(self._call())
        # The legacy dir is gone; a second run finds nothing to move.
        self.assertFalse(self._call())
        self.assertTrue((self.target / "run-2").is_dir())

    def test_adopts_legacy_child_even_when_target_exists(self):
        # Issue #331 orphan-on-restore for var/runs -> var/artifacts.
        (self.legacy / "restored").mkdir(parents=True)
        (self.legacy / "restored" / "context.json").write_text("{}", encoding="utf-8")
        (self.target / "existing").mkdir(parents=True)

        self.assertTrue(self._call())

        self.assertTrue((self.target / "existing").is_dir())
        self.assertTrue((self.target / "restored" / "context.json").is_file())
        self.assertFalse(self.legacy.exists())

    def test_target_id_wins_when_same_id_in_both(self):
        (self.legacy / "dup").mkdir(parents=True)
        (self.legacy / "dup" / "legacy.txt").write_text("legacy", encoding="utf-8")
        (self.target / "dup").mkdir(parents=True)
        (self.target / "dup" / "new.txt").write_text("new", encoding="utf-8")

        self.assertFalse(self._call())

        self.assertTrue((self.target / "dup" / "new.txt").is_file())
        self.assertTrue((self.legacy / "dup" / "legacy.txt").is_file())


class RunMigrationOnceTest(unittest.TestCase):
    """The applied-migrations marker gate (issue #335): a step runs at most once
    across boots, keyed by a stable name recorded under var/."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.marker = Path(self._tmp.name) / "migrations_applied.json"

    def tearDown(self):
        self._tmp.cleanup()

    def test_runs_once_then_skips_on_second_boot(self):
        calls = []

        def step():
            calls.append(1)

        first = run_migration_once("k", step, marker_path=self.marker)
        second = run_migration_once("k", step, marker_path=self.marker)

        self.assertTrue(first)
        self.assertFalse(second)  # skipped: marker already records "k"
        self.assertEqual(len(calls), 1)  # ran exactly once
        self.assertTrue(migration_applied("k", marker_path=self.marker))

    def test_distinct_keys_run_independently(self):
        ran = []
        run_migration_once("a", lambda: ran.append("a"), marker_path=self.marker)
        run_migration_once("b", lambda: ran.append("b"), marker_path=self.marker)
        self.assertEqual(ran, ["a", "b"])
        self.assertTrue(migration_applied("a", marker_path=self.marker))
        self.assertTrue(migration_applied("b", marker_path=self.marker))

    def test_failing_step_is_not_marked_and_retries(self):
        attempts = []

        def flaky():
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            run_migration_once("k", flaky, marker_path=self.marker)
        # Not recorded — the next boot retries and this time succeeds.
        self.assertFalse(migration_applied("k", marker_path=self.marker))
        self.assertTrue(run_migration_once("k", flaky, marker_path=self.marker))
        self.assertEqual(len(attempts), 2)
        self.assertTrue(migration_applied("k", marker_path=self.marker))

    def test_corrupt_marker_reads_as_empty(self):
        self.marker.parent.mkdir(parents=True, exist_ok=True)
        self.marker.write_text("not json{", encoding="utf-8")
        # Fail-open: an unreadable marker re-runs the idempotent step rather than
        # wedging startup.
        self.assertTrue(run_migration_once("k", lambda: None, marker_path=self.marker))
        self.assertTrue(migration_applied("k", marker_path=self.marker))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
