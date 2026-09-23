"""Offline gateway-route transport/provenance tests; no provider calls are made."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

os.environ['VILLAGE_PROVIDER_FILE'] = 'provider-gateway.py'
SPEC = importlib.util.spec_from_file_location('village_gateway_runner', Path(__file__).with_name('run-village-study.py'))
runner = importlib.util.module_from_spec(SPEC)
try:
    SPEC.loader.exec_module(runner)
finally:
    del os.environ['VILLAGE_PROVIDER_FILE']
IDENTITY = {'cliVersions': {'python3': 'Python 3.14.0'},
            'executablePaths': {'python3': '/usr/bin/python3'},
            'executableHashes': {'python3': 'a' * 64}}
ARTIFACT = '{"schema":"pattern-language.decompose.v1","groups":[{"name":"g","misfits":["m1","m2"]}]}'


def record(data, **extra):
    return {'raw': json.dumps(data), 'data': data, **extra}


def response(text=ARTIFACT, cost=0.05, **changes):
    envelope = {'version': 1, 'status': 'completed', 'requestId': 'fake-request',
                'account': runner.PROVIDER.ACCOUNT, 'model': runner.PROVIDER.MODEL, 'text': text,
                'usage': {'cost': cost, 'totalTokens': 1000},
                'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'none'}}
    envelope.update(changes)
    return {'exitCode': 0, 'timeout': False, 'elapsedSeconds': 0.01, 'custodyUncertain': False,
            'stdout': json.dumps(envelope), 'stderr': 'PRIVATE_PROVIDER_STDERR'}


class VillageGatewayTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / 'repository'
        self.root.mkdir()
        self.output = self.parent / 'private-run'
        self.identity = copy.deepcopy(IDENTITY)
        self.qualification = {'runtimeVersion': 'vercel-ai-gateway',
                              'runtimeDigest': runner.PROVIDER._runtime_digest(),
                              'evidenceDigest': 'c' * 64, 'expiresAt': int(time.time() * 1000) + 3600000}
        self.cap = {'version': 1, 'supported': True, 'zeroTools': True, 'zeroHooks': True, 'ephemeral': True,
                    'limits': {'maxInputBytes': 1048576, 'maxOutputBytes': 262144,
                               'minTimeoutMs': 1000, 'maxTimeoutMs': 300000},
                    'accounts': [{'id': runner.PROVIDER.ACCOUNT, 'provider': 'vercel-ai-gateway',
                                  'label': 'local gateway key', 'enabled': True, 'busy': False,
                                  'connected': True, 'runtimeAdmitted': True, 'available': True,
                                  'reason': None, 'qualification': self.qualification,
                                  'models': [{'key': runner.PROVIDER.MODEL,
                                              'observedAtMs': int(time.time() * 1000) - 1000}]}]}
        self.listing = {'object': 'list',
                        'data': [{'id': runner.PROVIDER.MODEL_UID, 'pricing': {'input': '0.003', 'output': '0.015'}}]}
        names = set(runner.SCRIPT_PATHS) | set(runner.PUBLIC_PATHS) | set(runner.GUIDANCE_PATHS)
        names |= {f'{runner.BENCH}/{name}' for name in runner.REQUIRED_NAMES}
        for name in names:
            self.put(name, 'PUBLIC: ' + name if name in set(runner.PUBLIC_PATHS) | set(runner.GUIDANCE_PATHS) else 'PRIVATE: ' + name)
        self.put('scripts/provider-gateway.py',
                 Path(runner.__file__).with_name('provider-gateway.py').read_text())
        self.put(f'{runner.BENCH}/README.md', 'MUTABLE_README')
        self.put(f'{runner.BENCH}/results/old.json', 'PRIVATE_OLD_RESULT')
        self.freeze()

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def freeze(self):
        paths = runner.frozen_paths(self.root)
        task_paths = runner.task_paths(dict.fromkeys(paths))
        hashes = lambda names: {name: runner.sha((self.root / name).read_text()) for name in sorted(names)}
        self.put(runner.TASK_FREEZE, json.dumps({'schema': 'pattern-language.decompose-task-freeze.v1',
                 'frozenAt': '2026-01-01T00:00:00Z', 'files': hashes(task_paths)}))
        self.put(runner.GUIDANCE_FREEZE, json.dumps({'schema': 'pattern-language.decompose-guidance-freeze.v1',
                 'frozenAt': '2026-01-01T00:00:01Z', 'taskFreezeSha256': runner.sha((self.root / runner.TASK_FREEZE).read_text()),
                 'files': hashes(set(runner.PUBLIC_PATHS) | set(runner.GUIDANCE_PATHS))}))

    def cap_reader(self):
        return record(copy.deepcopy(self.cap))

    def catalog_reader(self):
        return record(copy.deepcopy(self.listing), accountBinding=runner.PROVIDER.ACCOUNT_BINDING.copy())

    def prepare(self):
        return runner.prepare(self.output, self.root, lambda: self.identity, self.cap_reader, self.catalog_reader)

    def run_fake(self, provider=None, **changes):
        counter = [0]
        def default(*args):
            counter[0] += 1
            return response(requestId=f'fake-{counter[0]}')
        options = {'provider': provider or default, 'version_reader': lambda: self.identity,
                   'capability_reader': self.cap_reader, 'catalog_reader': self.catalog_reader, 'root': self.root}
        options.update(changes)
        return runner.run_study(self.output, **options)

    def validate(self, run):
        text = (self.output / 'plan.json').read_text()
        runner.validate_run(json.loads(text), run, text)

    def test_plan_records_gateway_route_and_budget(self):
        plan = self.prepare()
        runner.validate_plan(plan)
        self.assertEqual(plan['protocol']['providerFile'], 'provider-gateway.py')
        self.assertEqual(plan['protocol']['providerName'], 'vercel-ai-gateway')
        self.assertEqual(plan['protocol']['costReporting'], 'reported')
        self.assertEqual(plan['protocol']['enforcedUsdBudget'], runner.PROVIDER.USD_BUDGET)
        self.assertEqual(plan['protocol']['requiredCatalogCostTier'], 'Paid')
        self.assertEqual(plan['protocol']['requestedModel'], runner.PROVIDER.MODEL)
        self.assertEqual(len(plan['jobs']), 36)

    def test_full_run_reports_cost_and_validates(self):
        self.prepare()
        run = self.run_fake()
        self.assertEqual(run['status'], 'generation-complete-awaiting-evaluation')
        self.assertEqual(run['admittedCalls'], 36)
        self.assertEqual(run['costStatus'], 'reported')
        self.assertAlmostEqual(run['knownCostUsd'], 36 * 0.05, places=5)
        self.assertTrue(all(call.get('costUsd') == 0.05 and call.get('costStatus') == 'reported'
                            for call in run['calls']))
        self.assertTrue(all(call.get('provider', {}).get('usage') == {'cost': 0.05, 'totalTokens': 1000}
                            for call in run['calls']))
        self.validate(run)

    def test_transient_retry_then_success_records_attempts(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            if counter[0] == 1:
                return response(status='failed', code='deadline', requestId='fake-fail-1', usage=None)
            return response(requestId=f'fake-{counter[0]}')
        old_delay = runner.RETRY_DELAY_SECONDS
        runner.RETRY_DELAY_SECONDS = 0
        try:
            run = self.run_fake(provider)
        finally:
            runner.RETRY_DELAY_SECONDS = old_delay
        self.assertEqual(run['status'], 'generation-complete-awaiting-evaluation')
        first = run['calls'][0]
        self.assertEqual(len(first['attempts']), 2)
        self.assertEqual(first['attempts'][0]['failureCode'], 'deadline')
        self.assertEqual(first['status'], 'generated-not-reviewed')
        self.assertEqual(first['costUsd'], 0.05)
        self.validate(run)

    def test_budget_cap_stops_run_with_reason(self):
        self.prepare()
        run = self.run_fake(provider=lambda *args: response(cost=99.0, requestId=f'fake-{time.time_ns()}'))
        self.assertIn('usd-budget-exceeded', run['stopReasons'])
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(run['costStatus'], 'reported')
        self.assertEqual(run['knownCostUsd'], 99.0)
        self.validate(run)

    def test_provider_quota_stop_maps_to_usd_budget(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            if counter[0] == 2:
                return response(status='failed', code='budget_exceeded', requestId='fake-quota', usage=None)
            return response(requestId=f'fake-{counter[0]}')
        old_delay = runner.RETRY_DELAY_SECONDS
        runner.RETRY_DELAY_SECONDS = 0
        try:
            run = self.run_fake(provider)
        finally:
            runner.RETRY_DELAY_SECONDS = old_delay
        self.assertEqual(run['admittedCalls'], 2)
        self.assertEqual(run['calls'][1]['applicationFailureCode'], 'budget_exceeded')
        self.assertEqual(run['calls'][1]['failureReason'], 'usd-budget-exceeded')
        self.assertEqual(run['stopReasons'], ['usd-budget-exceeded'])
        self.assertEqual(len(run['calls'][1]['attempts']), 1)
        self.validate(run)

    def test_nonretryable_failure_stops_without_retry(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            return response(status='failed', code='invalid_request', requestId=f'fake-bad-{counter[0]}', usage=None)
        run = self.run_fake(provider)
        self.assertEqual(len(run['calls'][0]['attempts']), 1)
        self.assertEqual(run['stopReasons'], ['application-protocol-or-provider-failure'])
        self.validate(run)


if __name__ == '__main__':
    unittest.main()
