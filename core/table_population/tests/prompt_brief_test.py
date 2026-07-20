"""The table agent's prompt carries the table's Brief (#326, commit 5).

The Brief (CONTEXT.md) is the delegation instruction: the user-intent text the
originating Table request recorded and the pinned table keeps for life. These
tests pin the prompt seam directly — ``build_prompt`` over a minimal run-store
stub — because the prompt is the ONE place the brief reaches the agent: with a
brief the prompt carries it verbatim (framed as context, never a new scope);
without one the prompt keeps its classic shape, no empty placeholder.
"""

from __future__ import annotations

import unittest

from core.table_population.populate import build_prompt


class _StubRunStore:
    """The minimal surface ``build_prompt`` reads: bound databases, the field
    spec (for the column triage), the pending cells, and the brief."""

    def __init__(self, brief: str | None = None) -> None:
        self.database_paths: dict = {}
        self.field_spec = None
        self.brief = brief

    def cells(self) -> list:
        return []


class PromptCarriesBriefTest(unittest.TestCase):
    def test_prompt_carries_the_brief_verbatim(self) -> None:
        brief = "Cord pH for term babies in Q2, flag anything under 7.0"
        prompt = build_prompt(_StubRunStore(brief=brief))
        self.assertIn(brief, prompt)
        # Framed as interpretation context, never a licence to re-scope.
        self.assertIn("not a new scope", prompt)
        # The skill instruction still leads — the brief supplements, it does
        # not replace the procedural anchor.
        self.assertIn("Follow the `table-fill` skill", prompt)

    def test_whitespace_only_brief_is_treated_as_absent(self) -> None:
        prompt = build_prompt(_StubRunStore(brief="   \n  "))
        self.assertNotIn("its brief", prompt)

    def test_no_brief_keeps_the_classic_prompt_shape(self) -> None:
        prompt = build_prompt(_StubRunStore(brief=None))
        self.assertNotIn("its brief", prompt)
        self.assertTrue(
            prompt.startswith("Fill this table's pending cells."),
            prompt.splitlines()[0],
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
