"""scripts/eval_lib scoring functions (T10) driven by the REAL seed goldens.

The invariant that makes the eval trustworthy: golden-vs-golden scores a
perfect 1.0 on every rate, and a known perturbation moves the right metric
below 1.0 AND names the drift in `mismatches` (diagnosable, not just
detectable).
"""

import copy
import json
import unittest
from pathlib import Path

from scripts.eval_lib import score_audit_spec, score_database_model, score_mapping

ROOT = Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "seed/audits/cord-ph/spec.json").read_text())
MAPPING = json.loads((ROOT / "seed/audits/cord-ph/mapping.json").read_text())
MODEL = json.loads((ROOT / "seed/databases/cord-ph/model.json").read_text())


def _unit_rates(metrics: dict) -> dict:
    return {k: v for k, v in metrics.items() if isinstance(v, float) and 0.0 <= v <= 1.0}


class GoldenSelfScoreTest(unittest.TestCase):
    def test_audit_spec_golden_vs_golden_is_perfect(self):
        scored = score_audit_spec(SPEC, SPEC)
        for name, value in _unit_rates(scored["metrics"]).items():
            self.assertEqual(value, 1.0, name)
        self.assertEqual(scored["mismatches"], [])

    def test_database_model_golden_vs_golden_is_perfect(self):
        scored = score_database_model(MODEL, MODEL)
        for name, value in _unit_rates(scored["metrics"]).items():
            self.assertEqual(value, 1.0, name)
        self.assertEqual(scored["mismatches"], [])

    def test_mapping_golden_vs_golden_is_perfect(self):
        scored = score_mapping(MAPPING, MAPPING)
        for name, value in _unit_rates(scored["metrics"]).items():
            self.assertEqual(value, 1.0, name)
        self.assertEqual(scored["mismatches"], [])


class PerturbationTest(unittest.TestCase):
    def test_dropped_spec_field_lowers_recall_and_is_named(self):
        cand = copy.deepcopy(SPEC)
        dropped = cand["fields"].pop(0)
        scored = score_audit_spec(SPEC, cand)
        self.assertLess(scored["metrics"]["field_recall"], 1.0)
        self.assertTrue(any(repr(dropped["name"]) in m for m in scored["mismatches"]))

    def test_type_drift_is_detected(self):
        cand = copy.deepcopy(SPEC)
        cand["fields"][0]["type"] = "free_text_changed"
        scored = score_audit_spec(SPEC, cand)
        self.assertLess(scored["metrics"]["type_match"], 1.0)
        self.assertTrue(any("type drift" in m for m in scored["mismatches"]))

    def test_permitted_values_drift_is_detected(self):
        # The cord-pH golden carries no permitted_values today (its codes live
        # in the mapping's code maps) — a golden gap T11 will close. The
        # scorer's behaviour is pinned with a synthetic golden instead.
        golden = copy.deepcopy(SPEC)
        golden["fields"][0]["permitted_values"] = {"1": "Yes", "2": "No"}
        match = copy.deepcopy(golden)
        self.assertEqual(score_audit_spec(golden, match)["metrics"]["code_set_match"], 1.0)
        drifted = copy.deepcopy(golden)
        drifted["fields"][0]["permitted_values"] = {"999": "made up"}
        scored = score_audit_spec(golden, drifted)
        self.assertLess(scored["metrics"]["code_set_match"], 1.0)
        self.assertTrue(any("permitted_values drift" in m for m in scored["mismatches"]))

    def test_filterable_drift_is_detected(self):
        cand = copy.deepcopy(MODEL)
        flipped = None
        for t in cand["tables"]:
            for c in t["columns"]:
                if c.get("filterable"):
                    c["filterable"] = False
                    flipped = f"{t['name']}.{c['name']}"
                    break
            if flipped:
                break
        self.assertIsNotNone(flipped, "seed model must carry a filterable column")
        scored = score_database_model(MODEL, cand)
        self.assertLess(scored["metrics"]["filterable_agreement"], 1.0)
        self.assertTrue(any("filterable drift" in m for m in scored["mismatches"]))

    def test_mapping_kind_flip_is_detected(self):
        cand = copy.deepcopy(MAPPING)
        cand["fields"][0]["kind"] = (
            "interpret" if cand["fields"][0]["kind"] == "direct" else "direct"
        )
        scored = score_mapping(MAPPING, cand)
        self.assertLess(scored["metrics"]["kind_agreement"], 1.0)
        self.assertTrue(any("kind drift" in m for m in scored["mismatches"]))

    def test_mapping_source_drift_is_detected(self):
        cand = copy.deepcopy(MAPPING)
        cand["fields"][0]["sources"] = ["cord-ph -> wrong_table.wrong_column"]
        scored = score_mapping(MAPPING, cand)
        self.assertLess(scored["metrics"]["sources_agreement"], 1.0)
        self.assertTrue(any("sources drift" in m for m in scored["mismatches"]))

    def test_identity_anchor_drift_is_detected(self):
        cand = copy.deepcopy(MAPPING)
        cand["identity"]["anchor"] = "cord-ph -> somewhere.else"
        scored = score_mapping(MAPPING, cand)
        self.assertEqual(scored["metrics"]["identity_anchor_match"], 0.0)


if __name__ == "__main__":
    unittest.main()
