"""Offline village-decomposition scorer tests; no provider calls are made."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
RSPEC = importlib.util.spec_from_file_location('village_runner', Path(__file__).with_name('run-village-study.py'))
runner = importlib.util.module_from_spec(RSPEC)
RSPEC.loader.exec_module(runner)
SSPEC = importlib.util.spec_from_file_location('village_scorer', Path(__file__).with_name('score-village-study.py'))
scorer = importlib.util.module_from_spec(SSPEC)
SSPEC.loader.exec_module(scorer)

IDENTITY = {'cliVersions': {'xcb': 'xcb 0.4.0', 'devin': 'fake-devin', 'node': 'fake-node'},
            'executablePaths': {'xcb': runner.PROVIDER.XCB, 'devin': runner.PROVIDER.DEVIN, 'node': '/fake/node'},
            'executableHashes': {'xcb': '1' * 64, 'devin': '2' * 64, 'node': '3' * 64}}
ORACLE = json.loads((ROOT / runner.BENCH / 'oracle.json').read_text())
UNIVERSE = sorted(member for members in ORACLE['subsets'].values() for member in members)


def partition_artifact(groups):
    return json.dumps({'schema': 'pattern-language.decompose.v1',
                       'groups': [{'name': f'g{i}', 'misfits': sorted(m)} for i, m in enumerate(groups)]})


def singletons_plus():
    # 141 items -> 11 chunks of 12 + one chunk of 9, ordered by id = structure-free partition.
    return [UNIVERSE[i:i + 12] for i in range(0, 141, 12)]


class VillageScorerTests(unittest.TestCase):
    def test_parse_artifact_bounds(self):
        valid = {'schema': 'pattern-language.decompose.v1',
                 'groups': [{'name': 'a', 'misfits': ['m1', 'm2']}] * 8}
        artifact, errors = scorer.parse_artifact(json.dumps(valid))
        self.assertEqual(errors, [])
        for bad in ['{}', '{"schema":"x","groups":[]}',
                    json.dumps({'schema': 'pattern-language.decompose.v1', 'groups': []}),
                    json.dumps({'schema': 'pattern-language.decompose.v1',
                                'groups': [{'name': 'a', 'misfits': ['m1']}] * 8}),
                    json.dumps({'schema': 'pattern-language.decompose.v1',
                                'groups': [{'name': '', 'misfits': ['m1', 'm2']}] * 8})]:
            artifact, errors = scorer.parse_artifact(bad)
            self.assertTrue(errors, bad)

    def test_oracle_partition_scores_perfect(self):
        artifact = {'groups': [{'name': name, 'misfits': members} for name, members in ORACLE['subsets'].items()]}
        groups = [set(g['misfits']) for g in artifact['groups']]
        metrics = scorer.METRICS.partition_metrics(groups, list(ORACLE['subsets'].values()), set(UNIVERSE))
        self.assertEqual(metrics['adjusted_rand_index'], 1.0)
        self.assertEqual(metrics['pair_precision'], 1.0)
        self.assertEqual(metrics['pair_recall'], 1.0)


class VillageEndToEndTests(unittest.TestCase):
    """Drive a full synthetic run against the real frozen tree, then score it."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / 'run'
        self.identity = copy.deepcopy(IDENTITY)
        self.qualification = {'runtimeVersion': '0.4.0', 'runtimeDigest': '1' * 64,
                              'evidenceDigest': '4' * 64, 'expiresAt': int(time.time() * 1000) + 3600000}
        self.cap = {'version': 1, 'supported': True, 'zeroTools': True, 'zeroHooks': True, 'ephemeral': True,
                    'limits': {'maxInputBytes': 1048576, 'maxOutputBytes': 262144, 'minTimeoutMs': 1000, 'maxTimeoutMs': 120000},
                    'accounts': [{'id': runner.PROVIDER.ACCOUNT, 'provider': 'devin', 'label': 'PRIVATE_LABEL',
                                  'enabled': True, 'busy': False, 'connected': True, 'runtimeAdmitted': True,
                                  'available': True, 'reason': None, 'qualification': self.qualification,
                                  'models': [{'key': runner.PROVIDER.MODEL, 'observedAtMs': int(time.time() * 1000) - 1000}]}]}
        self.listing = {'families': [{'models': [{'model_uid': runner.PROVIDER.MODEL_UID, 'cost_tier': 'Free'}]}]}

    def cap_reader(self):
        return {'raw': json.dumps(self.cap), 'data': copy.deepcopy(self.cap)}

    def catalog_reader(self):
        return {'raw': json.dumps(self.listing), 'data': copy.deepcopy(self.listing),
                'accountBinding': runner.PROVIDER.ACCOUNT_BINDING.copy()}

    def test_full_run_scores_oracle_direct_and_baseline(self):
        runner.prepare(self.output, ROOT, lambda: self.identity, self.cap_reader, self.catalog_reader)
        oracle_groups = [sorted(m) for m in ORACLE['subsets'].values()]
        counter = 0
        def provider(command, request, cwd, timeout):
            nonlocal_counter = provider
            provider.calls += 1
            arm = 'direct' if 'Direct decomposition' in request['prompt'] else (
                'checklist' if 'Decomposition checklist' in request['prompt'] else 'pattern')
            if arm == 'pattern':
                text = partition_artifact(oracle_groups)
            elif arm == 'checklist':
                text = partition_artifact(oracle_groups[1:] + [oracle_groups[0]])  # same partition relabeled
            else:
                text = partition_artifact(singletons_plus())
            envelope = {'version': 1, 'status': 'completed', 'requestId': f'fake-{provider.calls}',
                        'account': runner.PROVIDER.ACCOUNT, 'model': runner.PROVIDER.MODEL, 'text': text,
                        'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'none'}}
            return {'exitCode': 0, 'timeout': False, 'elapsedSeconds': 0.01, 'custodyUncertain': False,
                    'stdout': json.dumps(envelope), 'stderr': 'PRIVATE'}
        provider.calls = 0
        run = runner.run_study(self.output, provider=provider, version_reader=lambda: self.identity,
                               capability_reader=self.cap_reader, catalog_reader=self.catalog_reader, root=ROOT)
        self.assertEqual(run['status'], 'generation-complete-awaiting-evaluation')
        result = scorer.score_study((self.output / 'plan.json').read_text(),
                                    (self.output / 'run.json').read_text(), ROOT)
        self.assertEqual(result['denominator'], 36)
        self.assertEqual(result['summary']['generationCompleted'], 36)
        self.assertEqual(result['summary']['artifactValid'], 36)
        pattern = result['summary']['byArm']['pattern']
        checklist = result['summary']['byArm']['checklist']
        direct = result['summary']['byArm']['direct']
        self.assertAlmostEqual(pattern['meanAdjustedRandIndex'], 1.0)
        self.assertAlmostEqual(checklist['meanAdjustedRandIndex'], 1.0)
        self.assertLess(direct['meanAdjustedRandIndex'], 0.1)
        self.assertTrue(all(a['metrics']['linkIntegrity'] for a in result['attempts'] if a['arm'] == 'pattern'))
        # Determinism: scoring the same bytes twice is identical.
        again = scorer.score_study((self.output / 'plan.json').read_text(),
                                   (self.output / 'run.json').read_text(), ROOT)
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    unittest.main()
