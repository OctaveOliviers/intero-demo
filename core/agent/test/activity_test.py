"""``core.agent.activity`` — message parts become CONCRETE UI activity.

The user must see WHAT the agent is touching (ADR 0006): a Dataset read, a
Template read, a named source-database query — not a generic "Querying the
database" for every tool. The mapping stays pure and bounded (one emit per
tool-status transition, throttled text growth).
"""

from __future__ import annotations

import unittest

from core.agent.activity import activity_from_part


def _tool_part(tool: str, *, status: str = "completed", input=None, part_id="p1"):
    return {
        "type": "tool",
        "id": part_id,
        "tool": tool,
        "state": {"status": status, "input": input},
    }


class ConcreteActivityLabelTest(unittest.TestCase):
    def test_describe_on_the_templates_collection_reads_a_template(self):
        activity = activity_from_part(
            _tool_part("describe_execute", input={"collection": "templates"}), {}
        )
        self.assertEqual(activity["label"], "Read a Template")

    def test_describe_on_the_datasets_collection_reads_a_dataset(self):
        activity = activity_from_part(
            _tool_part("describe_execute", input={"collection": "datasets"}), {}
        )
        self.assertEqual(activity["label"], "Read a Dataset")

    def test_catalog_running_on_datasets_is_listing_the_datasets(self):
        activity = activity_from_part(
            _tool_part(
                "catalog_execute", status="running", input={"collection": "datasets"}
            ),
            {},
        )
        self.assertEqual(activity["label"], "Querying the Datasets")

    def test_search_on_templates_names_the_collection(self):
        activity = activity_from_part(
            _tool_part(
                "search_execute", status="running", input={"collection": "templates"}
            ),
            {},
        )
        self.assertEqual(activity["label"], "Querying the Templates")

    def test_sql_execute_names_the_queried_source_database(self):
        activity = activity_from_part(
            _tool_part(
                "sql_execute",
                status="running",
                input={"database": "cord-ph", "sql": "SELECT 1"},
            ),
            {},
        )
        self.assertEqual(activity["label"], "Querying the cord-ph database")

    def test_tool_input_may_arrive_as_a_json_string(self):
        activity = activity_from_part(
            _tool_part("describe_execute", input='{"collection": "templates"}'), {}
        )
        self.assertEqual(activity["label"], "Read a Template")

    def test_collection_tools_default_to_the_database_wording(self):
        activity = activity_from_part(_tool_part("describe_execute"), {})
        self.assertEqual(activity["label"], "Read the database")

    def test_reasoning_part_stays_thinking(self):
        activity = activity_from_part(
            {"type": "reasoning", "id": "r1", "text": "pondering the cohort"}, {}
        )
        self.assertEqual(activity["label"], "Thinking")


if __name__ == "__main__":
    unittest.main()
