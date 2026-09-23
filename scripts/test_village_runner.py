"""Offline decomposition transport/provenance tests; no provider calls are made."""
import copy
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('village_runner', Path(__file__).with_name('run-village-study.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
IDENTITY = {'cliVersions': {'xcb': 'xcb 0.4.0', 'devin': 'fake-devin', 'node': 'fake-node'},
            'executablePaths': {'xcb': runner.PROVIDER.XCB, 'devin': runner.PROVIDER.DEVIN, 'node': '/fake/node'},
            'executableHashes': {'xcb': '1' * 64, 'devin': '2' * 64, 'node': '3' * 64}}
ARTIFACT = ' \ufeff```json\n{malformed raw artifact; NEVER PARSE DURING GENERATION}\n```\n '


def record(data, **extra):
    return {'raw': json.dumps(data), 'data': data, **extra}


def response(text=ARTIFACT, **changes):
    envelope = {'version': 1, 'status': 'completed', 'requestId': 'fake-request',
                'account': runner.PROVIDER.ACCOUNT, 'model': runner.PROVIDER.MODEL, 'text': text,
                'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'none'}}
    envelope.update(changes)
    return {'exitCode': 0, 'timeout': False, 'elapsedSeconds': 0.01, 'custodyUncertain': False,
            'stdout': json.dumps(envelope), 'stderr': 'PRIVATE_PROVIDER_STDERR'}


class VillageRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / 'repository'
        self.root.mkdir()
        self.output = self.parent / 'private-run'
        self.identity = copy.deepcopy(IDENTITY)
        self.qualification = {'runtimeVersion': '0.4.0', 'runtimeDigest': '1' * 64,
                              'evidenceDigest': '4' * 64, 'expiresAt': int(time.time() * 1000) + 3600000}
        self.cap = {'version': 1, 'supported': True, 'zeroTools': True, 'zeroHooks': True, 'ephemeral': True,
                    'limits': {'maxInputBytes': 1048576, 'maxOutputBytes': 262144, 'minTimeoutMs': 1000, 'maxTimeoutMs': 120000},
                    'accounts': [{'id': runner.PROVIDER.ACCOUNT, 'provider': 'devin', 'label': 'PRIVATE_ACCOUNT_LABEL',
                                  'enabled': True, 'busy': False, 'connected': True, 'runtimeAdmitted': True,
                                  'available': True, 'reason': None, 'qualification': self.qualification,
                                  'models': [{'key': runner.PROVIDER.MODEL, 'observedAtMs': int(time.time() * 1000) - 1000}]}]}
        self.listing = {'families': [{'models': [{'model_uid': runner.PROVIDER.MODEL_UID, 'cost_tier': 'Free'}]}]}
        names = set(runner.SCRIPT_PATHS) | set(runner.PUBLIC_PATHS) | set(runner.GUIDANCE_PATHS)
        names |= {f'{runner.BENCH}/{name}' for name in runner.REQUIRED_NAMES}
        for name in names:
            self.put(name, 'PUBLIC: ' + name if name in set(runner.PUBLIC_PATHS) | set(runner.GUIDANCE_PATHS) else 'PRIVATE: ' + name)
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
        counter = 0
        def default(*args):
            nonlocal counter
            counter += 1
            return response(requestId=f'fake-{counter}')
        options = {'provider': provider or default, 'version_reader': lambda: self.identity,
                   'capability_reader': self.cap_reader, 'catalog_reader': self.catalog_reader, 'root': self.root}
        options.update(changes)
        return runner.run_study(self.output, **options)

    def validate(self, run):
        text = (self.output / 'plan.json').read_text()
        runner.validate_run(json.loads(text), run, text)

    def test_freeze_plan_is_exact_private_and_metadata_only(self):
        plan = self.prepare()
        runner.validate_plan(plan)
        runner.verify_current_files(plan, self.root)
        self.assertEqual(len(plan['jobs']), 36)
        self.assertEqual({job['context'] for job in plan['jobs']}, {'village'})
        self.assertEqual(len({job['id'] for job in plan['jobs']}), 36)
        for arm in runner.ARMS:
            self.assertEqual(sum(job['arm'] == arm for job in plan['jobs']), 12)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.output / 'plan.json').stat().st_mode & 0o777, 0o600)
        self.assertNotIn(f'{runner.BENCH}/README.md', plan['files'])
        self.assertNotIn(f'{runner.BENCH}/results/old.json', plan['files'])
        self.assertIn('scripts/score-village-study.py', plan['files'])
        self.assertIn('scripts/partition_metrics.py', plan['files'])
        self.assertNotIn('scripts/score-village-study.py', json.loads(plan['files'][runner.TASK_FREEZE]['text'])['files'])
        self.assertFalse((self.output / 'started.json').exists())
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_freezes_reject_changes_omissions_and_bad_chronology(self):
        original = self.prepare()
        for target, mutate in [
            (runner.TASK_FREEZE, lambda value: value['files'].pop(next(iter(value['files'])))),
            (runner.TASK_FREEZE, lambda value: value.update(frozenAt='2999-01-01T00:00:00Z')),
            (runner.GUIDANCE_FREEZE, lambda value: value.update(taskFreezeSha256='0' * 64)),
            (runner.GUIDANCE_FREEZE, lambda value: value['files'].update({runner.PUBLIC_PATHS[0]: '0' * 64})),
            (runner.GUIDANCE_FREEZE, lambda value: value['files'].update({f'{runner.BENCH}/guidance/unknown.md': '0' * 64})),
        ]:
            with self.subTest(target=target):
                plan = copy.deepcopy(original)
                receipt = json.loads(plan['files'][target]['text'])
                mutate(receipt)
                text = json.dumps(receipt)
                plan['files'][target] = {'text': text, 'sha256': runner.sha(text)}
                with self.assertRaises(ValueError):
                    runner.validate_plan(plan)

    def test_changed_closure_and_symlinks_fail_before_admission(self):
        plan = self.prepare()
        self.put(f'{runner.BENCH}/new-helper.mjs', 'unfrozen')
        with self.assertRaisesRegex(ValueError, 'closure'):
            runner.verify_current_files(plan, self.root)
        (self.root / runner.BENCH / 'new-helper.mjs').unlink()
        path = self.root / runner.SCRIPT_PATHS[0]
        path.unlink()
        path.symlink_to(self.root / runner.SCRIPT_PATHS[1])
        with self.assertRaisesRegex(ValueError, 'symlink'):
            runner.frozen_paths(self.root)

    def test_plan_routing_schedule_limits_and_unknown_file_mutations_reject(self):
        plan = self.prepare()
        changes = [lambda p: p['jobs'].reverse(), lambda p: p['jobs'][0].update(repetition=True),
                   lambda p: p['protocol'].update(concurrency=True), lambda p: p['protocol'].update(retryBudget=1),
                   lambda p: p['protocol']['command'].append('--tools'),
                   lambda p: p['files'].update({'../secret': {'text': '', 'sha256': runner.sha('')}})]
        for mutate in changes:
            changed = copy.deepcopy(plan)
            mutate(changed)
            with self.assertRaises(ValueError):
                runner.validate_plan(changed)

    def test_full_run_preserves_raw_inert_text_and_private_provider_data(self):
        self.prepare()
        observed = []
        original_loads = json.loads
        def guarded_loads(text, *args, **kwargs):
            self.assertNotEqual(text, ARTIFACT, 'The runner must never parse a model artifact')
            return original_loads(text, *args, **kwargs)
        def provider(command, request, cwd, timeout):
            self.assertEqual(command, runner.PROVIDER.COMMAND)
            self.assertEqual(set(request), {'version', 'account', 'model', 'prompt', 'timeoutMs', 'maxOutputBytes'})
            self.assertEqual(timeout, 180)
            persisted = original_loads((self.output / 'run.json').read_text())
            self.assertEqual(persisted['admittedCalls'], len(observed) + 1)
            if observed:
                self.assertIn('finishedAt', persisted['calls'][-2])
            self.assertNotIn('PRIVATE', request['prompt'])
            self.assertNotIn(ARTIFACT, request['prompt'])
            self.assertFalse(any(path.name.endswith('.mjs') for path in self.output.rglob('*')))
            observed.append(request['prompt'])
            return response(requestId=f'fake-{len(observed)}')
        with patch.object(runner.json, 'loads', side_effect=guarded_loads), patch.object(runner.PROVIDER, 'syntax_check', side_effect=AssertionError('No compilation')):
            run = self.run_fake(provider)
        self.assertEqual(len(observed), 36)
        self.assertEqual(run['status'], 'generation-complete-awaiting-evaluation')
        self.assertIsNone(run['knownCostUsd'])
        self.assertFalse(run['costComplete'])
        for call in run['calls']:
            self.assertEqual(call['resultText'], ARTIFACT)
            self.assertEqual(call['resultSha256'], runner.sha(ARTIFACT))
            self.assertEqual((self.output / call['artifactCandidate']).read_text(), ARTIFACT)
            self.assertEqual(call['status'], 'generated-not-reviewed')
        self.assertNotIn('PRIVATE_PROVIDER_STDERR', json.dumps(run))
        self.assertNotIn('PRIVATE_ACCOUNT_LABEL', json.dumps(run))
        self.validate(run)
        with self.assertRaises(FileExistsError):
            self.run_fake(provider)
        self.assertEqual(len(observed), 36)

    def test_prompt_is_only_exact_public_selected_files(self):
        plan = self.prepare()
        for job in plan['jobs']:
            prompt, paths = runner.prompt_for(plan, job)
            expected = [f'{runner.BENCH}/{name}' for name in ('contract.md', 'dataset.md')]
            expected += [f'{runner.BENCH}/guidance/{job["arm"]}.md']
            self.assertEqual(paths, expected)
            self.assertEqual(prompt, '\n\n'.join([runner.INTRO] + [plan['files'][path]['text'].strip() for path in expected]) + '\n')
            self.assertNotIn('PRIVATE', prompt)

    def test_empty_response_is_failure_without_feedback_or_retry(self):
        self.prepare()
        counter = 0
        def provider(*args):
            nonlocal counter
            counter += 1
            return response(' \n', requestId=f'fake-{counter}')
        run = self.run_fake(provider)
        self.assertEqual(counter, 36)
        self.assertFalse(run['stopReasons'])
        self.assertTrue(all(call['failureReason'] == 'empty-result' for call in run['calls']))
        self.validate(run)

    def test_paid_catalog_stops_next_admission_no_fallback(self):
        self.prepare()
        counter = 0
        def provider(*args):
            nonlocal counter
            counter += 1
            self.listing['families'][0]['models'][0]['cost_tier'] = 'Paid'
            return response()
        run = self.run_fake(provider)
        self.assertEqual(counter, 1)
        self.assertEqual(run['stopReasons'], ['pre-admission-eligibility-failed'])
        self.assertEqual(run['admittedCalls'], 1)
        self.assertIsNone(run['knownCostUsd'])
        self.assertTrue(all(call['costUsd'] == 0 and call['costStatus'] == 'not-incurred' for call in run['calls'][1:]))
        self.validate(run)

    def test_unavailable_at_prepare_and_zero_admission_run(self):
        self.cap['supported'] = False
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())
        self.cap['supported'] = True
        self.prepare()
        self.cap['supported'] = False
        run = self.run_fake(lambda *args: self.fail('No provider admission'))
        self.assertEqual(run['admittedCalls'], 0)
        self.assertEqual(run['knownCostUsd'], 0)
        self.assertTrue(run['costComplete'])
        self.validate(run)

    def test_identity_drift_and_account_binding_fail_closed(self):
        self.prepare()
        changed = copy.deepcopy(self.identity)
        changed['executableHashes']['xcb'] = '9' * 64
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.run_fake(version_reader=lambda: changed)
        self.assertFalse((self.output / 'started.json').exists())
        run = self.run_fake(catalog_reader=lambda: record(self.listing))
        self.assertEqual(run['admittedCalls'], 0)
        self.validate(run)

    def test_transport_invalid_envelope_stops_and_remains_reportable(self):
        self.prepare()
        run = self.run_fake(lambda *args: response(model='devin/paid-fallback'))
        self.assertEqual(run['admittedCalls'], 1)
        self.assertNotIn('resultText', run['calls'][0])
        self.assertEqual(run['stopReasons'], ['application-protocol-or-provider-failure'])
        self.validate(run)

    def test_duplicate_request_is_kept_private_and_stops_without_duplicate_envelope(self):
        self.prepare()
        run = self.run_fake(lambda *args: response())
        self.assertEqual(run['admittedCalls'], 2)
        self.assertEqual(run['stopReasons'], ['duplicate-application-request-id'])
        self.assertNotIn('providerEnvelope', run['calls'][1])
        self.assertNotIn('resultText', run['calls'][1])
        self.assertIn(ARTIFACT, json.loads((self.output / 'raw' / run['calls'][1]['id'] / 'stdout.txt').read_text())['text'])
        self.validate(run)

    def test_exception_uncertain_custody_stops_no_retry(self):
        self.prepare()
        def provider(*args):
            raise OSError('PRIVATE_FAILURE')
        run = self.run_fake(provider)
        self.assertEqual(run['admittedCalls'], 1)
        self.assertTrue(run['calls'][0]['custodyUncertain'])
        self.assertNotIn('PRIVATE_FAILURE', json.dumps(run))
        self.validate(run)

    def test_transient_failure_retries_and_completes_with_attempt_evidence(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            if counter[0] == 1:
                return response(status='failed', code='deadline', requestId='fake-fail-1')
            return response(requestId=f'fake-{counter[0]}')
        old_delay = runner.RETRY_DELAY_SECONDS
        runner.RETRY_DELAY_SECONDS = 0
        try:
            run = self.run_fake(provider)
        finally:
            runner.RETRY_DELAY_SECONDS = old_delay
        self.assertEqual(run['status'], 'generation-complete-awaiting-evaluation')
        self.assertEqual(run['admittedCalls'], 36)
        first = run['calls'][0]
        self.assertEqual(first['status'], 'generated-not-reviewed')
        self.assertEqual(len(first['attempts']), 2)
        self.assertEqual(first['attempts'][0]['status'], 'failed-generation')
        self.assertEqual(first['attempts'][0]['failureCode'], 'deadline')
        self.assertEqual(first['attempts'][1]['status'], 'generated-not-reviewed')
        self.assertTrue((self.output / 'raw' / first['id'] / 'stdout-2.txt').exists())
        for call in run['calls'][1:]:
            self.assertEqual(len(call['attempts']), 1)
        self.validate(run)

    def test_nonretryable_failure_stops_without_retry(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            return response(status='failed', code='invalid_request', requestId=f'fake-bad-{counter[0]}')
        run = self.run_fake(provider)
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(len(run['calls'][0]['attempts']), 1)
        self.assertEqual(run['calls'][0]['attempts'][0]['failureCode'], 'invalid_request')
        self.assertEqual(run['stopReasons'], ['application-protocol-or-provider-failure'])
        self.validate(run)

    def test_retry_exhaustion_records_each_attempt_and_stops(self):
        self.prepare()
        counter = [0]
        def provider(*args):
            counter[0] += 1
            return response(status='failed', code='deadline', requestId=f'fake-dead-{counter[0]}')
        old_delay = runner.RETRY_DELAY_SECONDS
        runner.RETRY_DELAY_SECONDS = 0
        try:
            run = self.run_fake(provider)
        finally:
            runner.RETRY_DELAY_SECONDS = old_delay
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(len(run['calls'][0]['attempts']), 1 + runner.RETRY_BUDGET)
        self.assertTrue(all(attempt['failureCode'] == 'deadline' for attempt in run['calls'][0]['attempts']))
        self.assertEqual(run['stopReasons'], ['application-protocol-or-provider-failure'])
        self.validate(run)

    def test_cancelled_root_is_reportable(self):
        self.prepare()
        run = self.run_fake(lambda *args: {**response(), 'cancelled': True})
        self.assertEqual(run['stopReasons'], ['runner-cancelled'])
        self.assertEqual(run['admittedCalls'], 1)
        self.validate(run)

    def test_validator_rejects_tampered_receipts_prompts_counts_and_cost(self):
        self.prepare()
        original = self.run_fake()
        changes = [lambda run: run['calls'][0].update(prompt='changed'),
                   lambda run: run['calls'][0].update(resultText='changed'),
                   lambda run: run['calls'][0]['providerEnvelope'].update(requestId=run['calls'][1]['providerEnvelope']['requestId']),
                   lambda run: run['calls'][0]['providerEnvelope']['outcome'].update(joined=1),
                   lambda run: run['calls'][0]['eligibility'].update(catalogCostTier='Paid'),
                   lambda run: run['calls'][0]['eligibility']['accountBinding'].update(matched=1),
                   lambda run: run['calls'][0]['eligibility'].update(checkedAt='2026-01-01T00:00:00Z'),
                   lambda run: run.update(admittedCalls=35), lambda run: run.update(knownCostUsd=0),
                   lambda run: run.update(planSha256='0' * 64), lambda run: run.update(evaluationStatus='already-scored'),
                   lambda run: run['calls'][0].update(compiledSource='forbidden'),
                   lambda run: run.update(status='running'), lambda run: run['calls'].pop()]
        for mutate in changes:
            with self.subTest(mutate=mutate):
                changed = copy.deepcopy(original)
                mutate(changed)
                with self.assertRaises(ValueError):
                    self.validate(changed)

    def test_validator_rejects_resumption_or_forged_partial_stop(self):
        self.prepare()
        complete = self.run_fake()
        changed = copy.deepcopy(complete)
        changed['status'] = 'partial-reconciliation-required'
        changed['stopReasons'] = ['pre-admission-eligibility-failed']
        with self.assertRaisesRegex(ValueError, 'Stop reasons'):
            self.validate(changed)
        changed['calls'][1] = {**runner.schedule()[1], 'admitted': False, 'status': 'not-admitted-study-stopped',
                               'countAsFailure': True, 'costUsd': 0, 'costStatus': 'not-incurred'}
        with self.assertRaisesRegex(ValueError, 'after stop'):
            self.validate(changed)

    def test_frozen_helpers_invocation_cancels_root_and_never_kills_group(self):
        class Process:
            pid = 2468
            returncode = None
            calls = 0
            signals = []
            def communicate(self, text=None, timeout=None):
                self.calls += 1
                if self.calls == 1:
                    raise subprocess.TimeoutExpired('xcb', timeout)
                self.returncode = 1
                return '', ''
            def send_signal(self, value):
                self.signals.append(value)
        process = Process()
        with patch.object(runner.PROVIDER.subprocess, 'Popen', return_value=process):
            raw = runner.invoke(runner.PROVIDER.COMMAND, runner.PROVIDER.request_for('public prompt'), self.parent)
        self.assertEqual(process.signals, [signal.SIGTERM])
        self.assertFalse(raw['custodyUncertain'])
        self.assertTrue(raw['timeout'])
        self.assertEqual(json.loads((self.parent / 'process.json').read_text())['state'], 'root-exited')


if __name__ == '__main__':
    unittest.main()
