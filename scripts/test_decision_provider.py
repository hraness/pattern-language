import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("evolve_jury", ROOT / "scripts/evolve-jury.py")
evolve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evolve)
agent_spec = importlib.util.spec_from_file_location("agent_executor", ROOT / "scripts/agent-executor.py")
agent = importlib.util.module_from_spec(agent_spec)
agent_spec.loader.exec_module(agent)

REWIRES = {
    "sha256:c026b7bccfeff9667f44dbfd48f61d7dd220e04d412d92e85c70e0f3aa2f82d9": "sha256:3848344b2c53aa5c1495854674868b48da78e6fcc2898fd5f7ed1984a8fb7d95",
    "sha256:10109cb60910964eb69fd360fe19e80b35760af87664228465474eb8db363d75": "sha256:ead1cf5318d198930381a91b7939d1c9a033e4287f47d3698688e07ee4b32832",
    "sha256:54b37c8306967b51a7c7ffdde3ffb957149a0f8d307b60bc62cfbcb90d9dffe9": "sha256:b199ffdf84f21afe2cd584035a719bfc94df72ab6ba614d1ce68aba35bc62c23",
    "sha256:8436dce370fed01033d32aa4aea75e4dafa138434b0722ac3f45d555441802b2": "sha256:d1debdf82c010c3d747f367ba95e82ec92b199b0a72d5bdd54ca066ed945ec69",
    "sha256:421b3dc1fe87e5c56a4343885210f601dca2ac89df0870c5765b9818a15de708": "sha256:148da8db211dae725aa9b6d8f19b34ca0feddec12ff0125abee491d56e218cd2",
}


def frozen(path):
    return subprocess.check_output(["git", "show", evolve.FROZEN_SOURCE + ":" + str(path.relative_to(ROOT))], cwd=ROOT, timeout=10)


class DecisionProviderTests(unittest.TestCase):
    def test_current_routes_change_only_provider_and_declared_parent_references(self):
        routed = []
        for directory in [ROOT / "programs", *sorted((ROOT / "habitat").iterdir())]:
            if not directory.is_dir():
                continue
            for path in directory.glob("*.algal.json"):
                old = json.loads(frozen(path))
                for cell in old["cells"]:
                    if cell.get("kind") == "decide":
                        self.assertEqual(cell["route"]["provider"], "jev")
                        cell["route"]["provider"] = "clef"
                        routed.append(path)
                    if "manifest" in cell:
                        cell["manifest"] = REWIRES.get(cell["manifest"], cell["manifest"])
                self.assertEqual(json.loads(path.read_text()), old, path)
        self.assertEqual(len(set(routed)), 8)

    def test_frozen_source_restores_exact_bytes_without_runtime_or_digest_calls(self):
        with tempfile.TemporaryDirectory() as target:
            habitat = ROOT / "habitat/commit-subject"
            before = {p.name: p.read_bytes() for p in habitat.glob("*.algal.json")}
            with patch.object(evolve, "run_algal", side_effect=AssertionError("runtime forbidden")):
                evolve.legacy_modules(habitat, target)
            restored = {p.name: p.read_bytes() for p in Path(target).glob("*.algal.json")}
            self.assertEqual(set(restored), set(before))
            for name, blob in restored.items():
                self.assertEqual(blob, frozen(habitat / name))
            self.assertEqual(before, {p.name: p.read_bytes() for p in habitat.glob("*.algal.json")})
            original = json.loads(restored["jury.algal.json"])
            self.assertEqual(original["cells"][1]["manifest"], "sha256:54b37c8306967b51a7c7ffdde3ffb957149a0f8d307b60bc62cfbcb90d9dffe9")

    def test_frozen_source_rejects_paths_outside_source_boundaries(self):
        for path in [ROOT / "receipts", ROOT.parent, ROOT / "scripts"]:
            with self.assertRaises(SystemExit):
                evolve.legacy_modules(path, "unused")

    def test_live_flags_and_scripted_replay(self):
        self.assertEqual(evolve.decision_args(True, None), ["--clef"])
        self.assertEqual(evolve.decision_args(True, None, "jev"), ["--jev"])
        self.assertEqual(evolve.decision_args(False, "fixture.json"), ["--responses", "fixture.json"])
        with self.assertRaises(SystemExit):
            evolve.decision_args(True, None, "other")
        receipt = {"outcome": "complete", "cells": {"tally": {"outputs": {"out": {"champion": "fake"}}}}}
        with patch.object(evolve, "run_algal", return_value=(receipt, None)) as run:
            evolve.jury("habitat", [], {}, ["--clef"], "habitat")
            self.assertIn("--clef", run.call_args.args[0])
            self.assertNotIn("--jev", run.call_args.args[0])

    def test_live_opt_in_and_new_output_are_required_before_effects(self):
        for args in (["driver", "missing"], ["driver", "missing", "--live"], ["driver", "missing", "--live", "--responses", "fixture"]):
            with patch.object(sys, "argv", args), patch.object(evolve, "run_algal") as run:
                with self.assertRaises(SystemExit):
                    evolve.main()
                run.assert_not_called()

    def test_live_output_rejects_existing_candidate_paths_before_effects(self):
        with patch.object(sys, "argv", ["driver", "missing", "--live", "--out", "new-report"]), patch.object(evolve.os.path, "lexists", side_effect=[False, True]), patch.object(evolve, "run_algal") as run:
            with self.assertRaises(SystemExit):
                evolve.main()
            run.assert_not_called()

    def test_environment_is_provider_specific_and_does_not_mutate_input(self):
        source = {"CLOUDFLARE_ACCOUNT_ID": "1" * 32, "CLOUDFLARE_API_TOKEN": " token ", "CLOUDFLARE_AUTH_TOKEN": "alias", "TYPESAFE_API_KEY": "legacy", "OTHER": "kept"}
        current = evolve.decision_env(True, "clef", source)
        self.assertEqual(current["CLOUDFLARE_API_TOKEN"], "token")
        self.assertNotIn("TYPESAFE_API_KEY", current)
        self.assertNotIn("CLOUDFLARE_AUTH_TOKEN", current)
        legacy = evolve.decision_env(True, "jev", source)
        self.assertEqual(legacy["TYPESAFE_API_KEY"], "legacy")
        self.assertNotIn("CLOUDFLARE_API_TOKEN", legacy)
        self.assertEqual(evolve.decision_env(False, "clef", source), {"OTHER": "kept"})
        self.assertEqual(source["CLOUDFLARE_API_TOKEN"], " token ")
        alias = evolve.decision_env(True, "clef", {**source, "CLOUDFLARE_API_TOKEN": ""})
        self.assertEqual(alias["CLOUDFLARE_API_TOKEN"], "alias")
        for changes in [{"CLOUDFLARE_ACCOUNT_ID": "bad"}, {"CLOUDFLARE_API_TOKEN": "", "CLOUDFLARE_AUTH_TOKEN": ""}]:
            with self.assertRaises(SystemExit):
                evolve.decision_env(True, "clef", {**source, **changes})

    def test_agent_writer_is_text_only_and_does_not_inherit_decision_credentials(self):
        source = {"TYPESAFE_API_KEY": "legacy", "CLOUDFLARE_API_TOKEN": "cf", "CLOUDFLARE_AUTH_TOKEN": "alias", "CLOUDFLARE_ACCOUNT_ID": "1" * 32, "OTHER": "kept"}
        self.assertEqual(agent.agent_env(source), {"OTHER": "kept"})
        self.assertIn("Images are unsupported and are not automatically sent", agent.build_prompt({"kind": "agent", "cellId": "writer"}))

    def test_runtime_has_one_bounded_attempt_and_cleans_output_on_timeout(self):
        with patch.object(evolve.subprocess, "run", side_effect=subprocess.TimeoutExpired("mock", 660)) as run:
            with self.assertRaises(SystemExit):
                evolve.run_algal(["run", "mock"])
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.kwargs["timeout"], 660)
            self.assertNotIn("TYPESAFE_API_KEY", run.call_args.kwargs["env"])
            self.assertFalse(Path(run.call_args.kwargs["stdout"].name).exists())


if __name__ == "__main__":
    unittest.main()
