#!/usr/bin/env python3
"""Focused regression tests for partition evidence, independent of ALGAL."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from partition_metrics import (pairwise_agreement, partition_metrics,
                               permutation_baseline, validate_partition)


class PartitionMetricsTests(unittest.TestCase):
    def test_identical_partition_ignores_group_labels_and_order(self):
        a = {"left": ["a", "b"], "right": ["c", "d"]}
        b = {"renamed": ["d", "c"], "other": ["b", "a"]}
        result = partition_metrics(a, b)
        self.assertEqual(result["rand_index"], 1)
        self.assertEqual(result["adjusted_rand_index"], 1)
        self.assertEqual(result["pair_precision"], 1)
        self.assertEqual(result["pair_recall"], 1)

    def test_crossed_pairs_have_known_negative_ari(self):
        result = partition_metrics([["a", "b"], ["c", "d"]],
                                   [["a", "c"], ["b", "d"]])
        self.assertAlmostEqual(result["rand_index"], 1 / 3)
        self.assertAlmostEqual(result["adjusted_rand_index"], -0.5)
        self.assertEqual(result["pair_f1"], 0)
        self.assertEqual(result["pair_counts"], {
            "both_together": 0, "candidate_only_together": 2,
            "oracle_only_together": 2, "both_separate": 2})

    def test_singletons_expose_separation_dominated_raw_metric(self):
        oracle = [[str(2 * i), str(2 * i + 1)] for i in range(10)]
        singletons = [[str(i)] for i in range(20)]
        result = partition_metrics(singletons, oracle)
        self.assertGreater(result["rand_index"], 0.94)
        self.assertEqual(result["adjusted_rand_index"], 0)
        self.assertIsNone(result["pair_precision"])
        self.assertEqual(result["pair_recall"], 0)
        self.assertEqual(pairwise_agreement(singletons, oracle), result["rand_index"])
        null = permutation_baseline(singletons, oracle, samples=8)
        self.assertEqual(null["mean_adjusted_rand_index"], 0)
        self.assertEqual(null["upper_tail_probability"], 1)

    def test_identical_degenerate_partitions(self):
        for groups in ([["a"]], [["a"], ["b"]], [["a", "b"]]):
            with self.subTest(groups=groups):
                result = partition_metrics(groups, groups)
                self.assertEqual(result["rand_index"], 1)
                self.assertEqual(result["adjusted_rand_index"], 1)

    def test_rejects_duplicates_missing_extra_and_invalid_groups(self):
        oracle = [["a", "b"], ["c"]]
        invalid = [[], [[]], [["a", "a", "b", "c"]],
                   [["a", "b"], ["b", "c"]], [["a", "b"]],
                   [["a", "b", "c", "extra"]], ["abc"], [[1, "b", "c"]]]
        for groups in invalid:
            with self.subTest(groups=groups):
                with self.assertRaises(ValueError):
                    partition_metrics(groups, oracle)
        with self.assertRaises(ValueError):
            partition_metrics(oracle, [["a", "b"], ["b", "c"]])
        with self.assertRaises(ValueError):
            partition_metrics(oracle, oracle, universe=["a", "b", "c", "d"])
        with self.assertRaises(ValueError):
            validate_partition([[""]])

    def test_null_is_deterministic_and_preserves_size_profile(self):
        parts = [[str(j) for j in range(i, i + 10)] for i in range(0, 60, 10)]
        baseline = permutation_baseline(parts, parts, samples=512, seed=73)
        reordered = [list(reversed(group)) for group in reversed(parts)]
        self.assertEqual(baseline, permutation_baseline(reordered, reordered,
                                                       samples=512, seed=73))
        self.assertLess(abs(baseline["mean_adjusted_rand_index"]), 0.01)
        self.assertLess(abs(baseline["mean_rand_index"] - baseline["expected_rand_index"]), 0.01)
        self.assertLess(baseline["p95_adjusted_rand_index"], 0.1)
        self.assertEqual(baseline["upper_tail_probability"], 1 / 513)
        self.assertNotEqual(baseline, permutation_baseline(parts, parts, samples=512, seed=74))

    def test_invalid_baseline_controls(self):
        for samples in (0, -1, True, 1.5):
            with self.subTest(samples=samples):
                with self.assertRaises(ValueError):
                    permutation_baseline([["a"]], [["a"]], samples=samples)
        with self.assertRaises(ValueError):
            permutation_baseline([["a"]], [["a"]], seed="0")


class BenchmarkCliTests(unittest.TestCase):
    def test_json_output_and_invalid_oracle(self):
        script = Path(__file__).with_name("decompose-village.py")
        with tempfile.TemporaryDirectory() as temp:
            ensemble, oracle = Path(temp) / "ensemble.json", Path(temp) / "oracle.json"
            ensemble.write_text(json.dumps({"misfits": [{"id": x} for x in "abcd"],
                                            "links": [{"a": "a", "b": "b"},
                                                      {"a": "c", "b": "d"}]}))
            oracle.write_text(json.dumps({"subsets": {"one": ["a", "b"], "two": ["c", "d"]}}))
            command = [sys.executable, str(script), "2", "avg", str(ensemble), str(oracle),
                       "--json", "--baseline-samples", "16", "--seed", "7"]
            process = subprocess.run(command, text=True, capture_output=True, check=True)
            report = json.loads(process.stdout)
            self.assertEqual(report["metrics"]["adjusted_rand_index"], 1)
            self.assertEqual(report["group_sizes"], [2, 2])
            self.assertEqual(report["baseline"]["samples"], 16)
            self.assertEqual(report["baseline"]["seed"], 7)
            oracle.write_text(json.dumps({"subsets": {"one": ["a", "b"], "two": ["b", "c", "d"]}}))
            invalid = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(invalid.returncode, 2)
            self.assertIn("duplicate partition ID", invalid.stderr)
            self.assertEqual(invalid.stdout, "")


if __name__ == "__main__":
    unittest.main()
