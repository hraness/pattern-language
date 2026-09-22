"""Offline SWE-2 adapter checks. Every provider and metadata response is fake."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('design_swe2_runner', Path(__file__).with_name('run-design-swe2.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
SOURCE = 'export function example() { return 1; }\n'
DESIGN = '  ```json\n{"malformed":"schema, not JSON"}\n```  \n'
IDENTITY = {'cliVersions': {'xcb': 'xcb 0.4.0', 'devin': 'fake-devin', 'node': 'fake-node'},
            'executablePaths': {'xcb': runner.XCB, 'devin': runner.DEVIN, 'node': '/fake/node'},
            'executableHashes': {'xcb': '1' * 64, 'devin': '2' * 64, 'node': '3' * 64}}


def record(data, **extra):
    return {'raw': json.dumps(data), 'data': data, **extra}


def raw_response(text=SOURCE, **changes):
    response = {'version': 1, 'status': 'completed', 'requestId': 'fake-request',
                'account': runner.ACCOUNT, 'model': runner.MODEL, 'text': text,
                'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'none'}}
    response.update(changes)
    return {'exitCode': 0, 'timeout': False, 'elapsedSeconds': 0.01, 'custodyUncertain': False,
            'stdout': json.dumps(response), 'stderr': 'PRIVATE_PROVIDER_STDERR'}


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / 'repository'
        self.root.mkdir()
        self.output = self.parent / 'private-run'
        parent_text = (runner.ROOT / runner.PARENT_PATH).read_text()
        parent = json.loads(parent_text)
        self.put(runner.PARENT_PATH, parent_text)
        for name, frozen in parent['files'].items():
            self.put(name, frozen['text'])
        for name in runner.SCRIPT_PATHS:
            self.put(name, (runner.ROOT / name).read_text())
        for name in ('protocol.md', 'score.mjs', 'test-score.mjs'):
            self.put(f'{runner.BENCH}/{name}', 'PRIVATE_ADAPTER_EVALUATION')
        self.put(f'{runner.BENCH}/README.md', 'MUTABLE_STATUS')
        self.put(f'{runner.BENCH}/results/old.json', 'PRIVATE_OLD_RESULT')
        self.identity = copy.deepcopy(IDENTITY)
        self.qualification = {'runtimeVersion': '0.4.0', 'runtimeDigest': '1' * 64,
                              'evidenceDigest': '4' * 64, 'expiresAt': int(time.time() * 1000) + 3600000}
        self.cap = {'version': 1, 'supported': True, 'zeroTools': True, 'zeroHooks': True, 'ephemeral': True,
                    'limits': {'maxInputBytes': 1048576, 'maxOutputBytes': 262144,
                               'minTimeoutMs': 1000, 'maxTimeoutMs': 120000},
                    'accounts': [{'id': runner.ACCOUNT, 'provider': 'devin', 'label': 'PRIVATE_ACCOUNT_LABEL',
                                  'enabled': True, 'busy': False, 'connected': True, 'runtimeAdmitted': True,
                                  'available': True, 'reason': None, 'qualification': self.qualification,
                                  'models': [{'key': runner.MODEL, 'label': 'SWE-2 High',
                                              'observedAtMs': int(time.time() * 1000) - 1000}]}]}
        self.listing = {'families': [{'label': 'SWE', 'models': [
            {'model_uid': runner.MODEL_UID, 'cost_tier': 'Free', 'label': 'SWE-2 High'}]}]}

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def cap_reader(self):
        return record(copy.deepcopy(self.cap))

    def catalog_reader(self):
        return record(copy.deepcopy(self.listing), accountBinding=runner.ACCOUNT_BINDING.copy())

    def prepare(self):
        return runner.prepare(self.output, self.root, lambda: self.identity, self.cap_reader, self.catalog_reader)

    def run_fake(self, provider=None, **changes):
        count = 0
        def default(command, request, cwd, timeout):
            nonlocal count
            count += 1
            code = request['prompt'].startswith(runner.INTROS['code'])
            return raw_response(SOURCE if code else DESIGN, requestId=f'fake-{count}')
        options = {'provider': provider or default, 'checker': lambda source: True,
                   'version_reader': lambda: self.identity, 'capability_reader': self.cap_reader,
                   'catalog_reader': self.catalog_reader, 'root': self.root}
        options.update(changes)
        return runner.run_study(self.output, **options)

    def test_parent_freeze_and_private_output(self):
        plan = self.prepare()
        self.assertEqual(len(plan['jobs']), 36)
        self.assertEqual(plan['parentPlan']['sha256'], runner.PARENT_SHA256)
        self.assertEqual(plan['protocol']['concurrency'], 1)
        self.assertIsNone(plan['protocol']['enforcedUsdBudget'])
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.output / 'plan.json').stat().st_mode & 0o777, 0o600)
        self.assertNotIn(f'{runner.BENCH}/README.md', plan['files'])
        self.assertNotIn(f'{runner.BENCH}/results/old.json', plan['files'])
        original = json.loads(plan['files'][runner.PARENT_PATH]['text'])
        self.assertEqual(len(original['files']), 44)
        for name, entry in original['files'].items():
            self.assertEqual(plan['files'][name], entry)
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_real_prepare_fails_closed_without_qualification(self):
        self.cap['supported'] = False
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_qualification_tool_context_and_account_guards(self):
        scenarios = [
            lambda cap: cap.update(zeroTools=False),
            lambda cap: cap.update(zeroHooks=False),
            lambda cap: cap.update(ephemeral=False),
            lambda cap: cap['accounts'][0].update(available=False),
            lambda cap: cap['accounts'][0].update(busy=True),
            lambda cap: cap['accounts'][0]['qualification'].update(expiresAt=0),
            lambda cap: cap['accounts'][0]['qualification'].update(runtimeDigest='0' * 64),
            lambda cap: cap['accounts'][0]['qualification'].update(runtimeVersion='wrong'),
            lambda cap: cap['accounts'][0]['models'][0].update(key='devin/paid'),
            lambda cap: cap['accounts'][0]['models'][0].update(observedAtMs=0),
        ]
        for mutate in scenarios:
            changed = copy.deepcopy(self.cap)
            mutate(changed)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                runner.eligibility(self.identity, record(changed), self.catalog_reader())

    def test_free_metadata_exact_uid_no_duplicate_and_binding(self):
        for row in ({'model_uid': runner.MODEL_UID, 'cost_tier': 'Paid'},
                    {'model_uid': 'wrong', 'cost_tier': 'Free'},
                    {'uid': runner.MODEL_UID, 'cost_tier': 'Free'}):
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, 'Free'):
                runner.eligibility(self.identity, self.cap_reader(), record([row], accountBinding=runner.ACCOUNT_BINDING))
        with self.assertRaisesRegex(ValueError, 'Free'):
            duplicated = self.listing['families'][0]['models'] * 2
            runner.eligibility(self.identity, self.cap_reader(), record(duplicated, accountBinding=runner.ACCOUNT_BINDING))
        with self.assertRaisesRegex(ValueError, 'binding'):
            runner.eligibility(self.identity, self.cap_reader(), record(self.listing))

    def test_full_serial_run_barrier_exact_forwarding_and_unknown_cost(self):
        self.prepare()
        observed = []
        def provider(command, request, cwd, timeout):
            self.assertEqual(command, runner.COMMAND)
            self.assertEqual(set(request), {'version', 'account', 'model', 'prompt', 'timeoutMs', 'maxOutputBytes'})
            self.assertEqual(request['account'], runner.ACCOUNT)
            self.assertEqual(request['model'], runner.MODEL)
            self.assertEqual(timeout, 180)
            persisted = json.loads((self.output / 'run.json').read_text())
            self.assertEqual(persisted['admittedCalls'], len(observed) + 1)
            self.assertEqual(len(persisted['calls']), len(observed) + 1)
            if observed:
                self.assertIn('finishedAt', persisted['calls'][-2])
            is_code = request['prompt'].startswith(runner.INTROS['code'])
            if is_code:
                self.assertEqual(sum(stage == 'design' for stage in observed), 18)
                self.assertTrue(request['prompt'].endswith(runner.PRIOR_LABEL + DESIGN + '\n'))
            observed.append('code' if is_code else 'design')
            self.assertNotIn('PRIVATE_', request['prompt'])
            return raw_response(SOURCE if is_code else DESIGN, requestId=f'fake-{len(observed)}')
        run = self.run_fake(provider)
        self.assertEqual(run['status'], 'generation-complete-awaiting-review')
        self.assertEqual(run['admittedCalls'], 36)
        self.assertEqual(run['knownCostUsd'], 0)
        self.assertFalse(run['costComplete'])
        self.assertEqual(observed, ['design'] * 18 + ['code'] * 18)
        for call in run['calls']:
            self.assertIsNone(call['costUsd'])
            self.assertEqual(call['costStatus'], 'not-reported')
            self.assertEqual(call['promptSha256'], runner.sha(call['prompt']))
            self.assertEqual(call['eligibility']['accountBinding'], runner.ACCOUNT_BINDING)
            if call['stage'] == 'design':
                self.assertEqual(call['designText'], DESIGN)
                self.assertEqual(call['designSha256'], runner.sha(DESIGN))
            else:
                self.assertEqual(call['priorDesignSha256'], runner.sha(DESIGN))
                self.assertEqual(call['source'], SOURCE)
        public = json.dumps(run)
        self.assertNotIn('PRIVATE_PROVIDER_STDERR', public)
        self.assertNotIn('PRIVATE_ACCOUNT_LABEL', public)
        with self.assertRaises(FileExistsError):
            self.run_fake(provider)
        self.assertEqual(len(observed), 36)

    def test_prompts_match_original_frozen_builder(self):
        plan = self.prepare()
        parent = json.loads(plan['files'][runner.PARENT_PATH]['text'])
        for job in plan['jobs']:
            prior = DESIGN if job['stage'] == 'code' else None
            self.assertEqual(runner.prompt_for(plan, job, prior), runner.ORIGINAL.prompt_for(parent, job, prior))

    def test_empty_design_skips_only_dependent_code(self):
        self.prepare()
        count = 0
        def provider(command, request, cwd, timeout):
            nonlocal count
            count += 1
            return raw_response(' \n', requestId=f'fake-{count}')
        run = self.run_fake(provider)
        self.assertEqual(count, 18)
        self.assertEqual(run['admittedCalls'], 18)
        self.assertTrue(all(call['status'] == 'skipped-no-design-text' for call in run['calls'][18:]))
        self.assertTrue(all(call['costUsd'] == 0 for call in run['calls'][18:]))

    def test_malformed_design_and_syntax_failure_are_not_retried(self):
        self.prepare()
        checked = []
        run = self.run_fake(checker=lambda source: checked.append(source) or False)
        self.assertEqual(run['admittedCalls'], 36)
        self.assertEqual(checked, [SOURCE] * 18)
        self.assertTrue(all(call['designText'] == DESIGN for call in run['calls'][:18]))
        self.assertTrue(all(call['status'] == 'failed-generation' for call in run['calls'][18:]))
        self.assertFalse(run['stopReasons'])

    def test_preflight_every_call_and_no_paid_fallback(self):
        self.prepare()
        count = 0
        def provider(*args):
            nonlocal count
            count += 1
            self.listing['families'][0]['models'][0]['cost_tier'] = 'Paid'
            return raw_response(DESIGN)
        run = self.run_fake(provider)
        self.assertEqual(count, 1)
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(run['stopReasons'], ['pre-admission-eligibility-failed'])
        self.assertEqual(len(run['calls']), 36)
        self.assertTrue(all(call['status'] == 'not-admitted-study-stopped' for call in run['calls'][1:]))

    def test_response_identity_effect_and_closed_schema_stops(self):
        for changes in ({'account': 'other'}, {'model': 'devin/other'}, {'requestId': ''},
                        {'version': True},
                        {'outcome': {'terminal': 'completed', 'joined': False, 'effects': 'none'}},
                        {'outcome': {'terminal': 'completed', 'joined': 1, 'effects': 'none'}},
                        {'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'tool'}},
                        {'tool_use': []}, {'text': 'x' * (runner.MAX_OUTPUT_BYTES + 1)}):
            with self.subTest(changes=list(changes)):
                result, stops = runner.decode_response(raw_response(**changes), 'code', lambda source: True)
                self.assertTrue(stops)
                self.assertNotIn('source', result)
                self.assertNotIn('resultText', result)

    def test_failure_diagnostics_do_not_publish_arbitrary_provider_text(self):
        for code in ('PRIVATE_PROVIDER_PAYLOAD', ['unexpected-type']):
            raw = raw_response()
            raw.update(exitCode=1, stdout=json.dumps({'version': 1, 'status': 'failed', 'code': code}))
            result, stops = runner.decode_response(raw, 'code')
            self.assertTrue(stops)
            self.assertNotIn('applicationFailureCode', result)
            self.assertNotIn('PRIVATE_PROVIDER', json.dumps(result))

    def test_provider_error_stops_serial_run_and_preserves_denominator(self):
        self.prepare()
        raw = raw_response()
        raw.update(exitCode=1, stdout=json.dumps({'version': 1, 'status': 'failed', 'code': 'deadline',
                                                'requestId': 'failure', 'joined': True, 'effects': 'none'}))
        run = self.run_fake(provider=lambda *args: raw)
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(run['status'], 'partial-reconciliation-required')
        self.assertEqual(len(run['calls']), 36)
        self.assertEqual(run['calls'][0]['applicationFailureCode'], 'deadline')

    def test_duplicate_application_identity_stops_and_keeps_response_private(self):
        self.prepare()
        run = self.run_fake(provider=lambda *args: raw_response(DESIGN, requestId='same-request'))
        self.assertEqual(run['admittedCalls'], 2)
        self.assertEqual(run['stopReasons'], ['duplicate-application-request-id'])
        self.assertEqual(len(run['calls']), 36)
        duplicate = run['calls'][1]
        self.assertEqual(duplicate['failureReason'], 'duplicate-application-request-id')
        self.assertEqual(duplicate['status'], 'failed-generation')
        for field in ('resultText', 'designText', 'designSha256', 'provider', 'providerEnvelope', 'source'):
            self.assertNotIn(field, duplicate)
        raw = json.loads((self.output / 'raw' / duplicate['id'] / 'stdout.txt').read_text())
        self.assertEqual(raw['requestId'], 'same-request')
        self.assertEqual(raw['text'], DESIGN)
        self.assertTrue(all(call['status'] == 'not-admitted-study-stopped' for call in run['calls'][2:]))

    def test_provider_exception_and_custody_uncertainty_stop(self):
        self.prepare()
        def broken(*args):
            raise OSError('private launch error')
        run = self.run_fake(broken)
        self.assertEqual(run['admittedCalls'], 1)
        self.assertEqual(run['stopReasons'], ['xcb-custody-uncertain'])
        self.assertNotIn('private launch error', json.dumps(run))

    def test_input_bound_and_nul(self):
        for prompt in ('', 'x\x00y', 'x' * runner.MAX_INPUT_BYTES):
            with self.subTest(length=len(prompt)), self.assertRaisesRegex(ValueError, 'bounds'):
                runner.request_for(prompt)
        self.assertEqual(set(runner.request_for('hello')), {'version', 'account', 'model', 'prompt', 'timeoutMs', 'maxOutputBytes'})

    def test_frozen_input_parent_new_closure_and_identity_drift(self):
        plan = self.prepare()
        self.put(f'{runner.BENCH}/README.md', 'new status')
        runner.verify_current_files(plan, self.root)
        self.put(f'{runner.BENCH}/added-helper.mjs', 'new helper')
        with self.assertRaisesRegex(ValueError, 'closure'):
            self.run_fake()
        (self.root / runner.BENCH / 'added-helper.mjs').unlink()
        self.identity['executableHashes']['xcb'] = 'a' * 64
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.run_fake()
        self.identity = copy.deepcopy(IDENTITY)
        self.put('benchmarks/design-decisions-v3/facts.md', 'changed')
        with self.assertRaisesRegex(ValueError, 'Frozen input changed'):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())

    def test_plan_alterations_rejected(self):
        plan = self.prepare()
        for change in (lambda p: p['protocol'].update(command=['unsafe']),
                       lambda p: p['protocol'].update(concurrency=3),
                       lambda p: p['protocol']['qualification'].update(expiresAt=0),
                       lambda p: p['parentPlan'].update(sha256='a' * 64),
                       lambda p: p['files'].pop('scripts/run-design-swe2.py'),
                       lambda p: p['files']['benchmarks/design-decisions-v3/facts.md'].update(text='bad')):
            changed = copy.deepcopy(plan)
            change(changed)
            with self.subTest(change=change), self.assertRaises(ValueError):
                runner.validate_plan(changed)

    def test_public_admission_receipt(self):
        ready = runner.eligibility(self.identity, self.cap_reader(), self.catalog_reader())
        admitted_ms = int(time.time() * 1000)
        runner.validate_admission_evidence(ready, self.identity, self.qualification, admitted_ms)
        for field, value in (('catalogCostTier', 'Paid'), ('accountBinding', {}),
                             ('catalogSha256', 'invalid'), ('checkedAt', '2020-01-01T00:00:00Z')):
            changed = copy.deepcopy(ready)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                runner.validate_admission_evidence(changed, self.identity, self.qualification, admitted_ms)

    def test_cancellation_joins_root_or_records_uncertainty_without_kill(self):
        for first, second, uncertain in (
            (subprocess.TimeoutExpired('xcb', 180), ('', ''), False),
            (KeyboardInterrupt(), ('', ''), False),
            (subprocess.TimeoutExpired('xcb', 180), subprocess.TimeoutExpired('xcb', 60), True),
        ):
            with self.subTest(uncertain=uncertain, interrupted=isinstance(first, KeyboardInterrupt)):
                calls = []
                class FakeProcess:
                    pid = 12345
                    returncode = None
                    def communicate(self, *args, **kwargs):
                        calls.append(('communicate', kwargs['timeout']))
                        if len([v for v in calls if v[0] == 'communicate']) == 1:
                            raise first
                        if isinstance(second, BaseException):
                            raise second
                        self.returncode = 1
                        return second
                    def send_signal(self, value):
                        calls.append(('signal', value))
                with patch.object(runner.subprocess, 'Popen', return_value=FakeProcess()):
                    raw = runner.invoke(runner.COMMAND, runner.request_for('fixture'), self.parent)
                self.assertEqual([v for v in calls if v[0] == 'signal'], [('signal', signal.SIGTERM)])
                self.assertEqual(raw['custodyUncertain'], uncertain)
                self.assertEqual(raw['cancelled'], isinstance(first, KeyboardInterrupt))
                custody = json.loads((self.parent / 'process.json').read_text())
                self.assertEqual(custody['pid'], 12345)
                self.assertEqual(custody['state'], 'uncertain' if uncertain else 'root-exited')

    def test_credentials_binding_is_read_only_private_and_rejects_override(self):
        native, imported = self.parent / 'credentials.toml', self.parent / 'windsurf-token'
        native.write_text('windsurf_api_key = "synthetic-fixture"\napi_server_url = "https://server.codeium.com"\n'
                          'devin_webapp_host = "app.devin.ai"\ndevin_api_url = "https://api.devin.ai"\n')
        imported.write_text('synthetic-fixture\n')
        imported.chmod(0o600)
        before = (native.read_bytes(), imported.read_bytes())
        environment = {'HOME': '/Users/bg'}
        # macOS's /var alias is normalized so this fixture itself has no symlinked ancestors.
        native, imported = native.resolve(), imported.resolve()
        identity = runner.credential_identity(native, imported, environment)
        self.assertEqual(identity[-1], 'synthetic-fixture')
        self.assertEqual(before, (native.read_bytes(), imported.read_bytes()))
        for key in ('WINDSURF_API_KEY', 'DEVIN_CONFIG_DIR', 'XDG_DATA_HOME', 'XCB_STATE'):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'overrides'):
                runner.credential_identity(native, imported, {**environment, key: 'override'})
        imported.write_text('different-fixture')
        with self.assertRaisesRegex(ValueError, 'does not match'):
            runner.credential_identity(native, imported, environment)
        imported.write_text('synthetic-fixture')
        imported.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'ownership, mode'):
            runner.credential_identity(native, imported, environment)

    def test_post_spawn_record_failure_cancels_and_joins_before_return(self):
        signals = []
        class FakeProcess:
            pid = 12346
            returncode = None
            def communicate(self, *args, **kwargs):
                self.returncode = 1
                return '', ''
            def send_signal(self, signum):
                signals.append(signum)
        with patch.object(runner.subprocess, 'Popen', return_value=FakeProcess()), \
                patch.object(runner, 'write_json', side_effect=OSError('private fixture failure')):
            raw = runner.invoke(runner.COMMAND, runner.request_for('fixture'), self.parent)
        self.assertEqual(signals, [signal.SIGTERM])
        self.assertFalse(raw['custodyUncertain'])
        self.assertTrue(raw['collectionError'])
        self.assertEqual(raw['pid'], 12346)
        result, stops = runner.decode_response(raw, 'code')
        self.assertEqual(stops, ['local-collection-failed'])
        self.assertNotIn('private fixture failure', json.dumps(result))

    def test_syntax_parser_does_not_execute_candidate(self):
        marker = self.parent / 'must-not-exist'
        source = f'import fs from "node:fs"; fs.writeFileSync({json.dumps(str(marker))}, "executed");'
        self.assertTrue(runner.syntax_check(source))
        self.assertFalse(marker.exists())
        parsed, stops = runner.decode_response(raw_response('```js\n' + SOURCE + '```'), 'code')
        self.assertFalse(stops)
        self.assertEqual(parsed['source'], SOURCE)


if __name__ == '__main__':
    unittest.main()
