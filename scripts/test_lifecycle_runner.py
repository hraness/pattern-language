"""Offline runner regression tests. Fake providers never contact Claude."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

SPEC = importlib.util.spec_from_file_location('lifecycle_runner', Path(__file__).with_name('run-lifecycle-study.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
VERSIONS = {'claude': 'fake-claude-1', 'node': 'fake-node-1'}
SOURCE = 'export function example() { return 1; }\n'


def raw_response(**changes):
    response = {'type': 'result', 'subtype': 'success', 'stop_reason': 'end_turn',
                'result': SOURCE, 'total_cost_usd': 0.01, 'num_turns': 1,
                'is_error': False, 'modelUsage': {runner.MODEL: {
                    'canonicalModel': runner.MODEL, 'provider': 'firstParty',
                    'inputTokens': 10, 'outputTokens': 20, 'webSearchRequests': 0}},
                'usage': {'server_tool_use': {'web_search_requests': 0, 'web_fetch_requests': 0}},
                'private-provider-field': 'DO_NOT_EXPORT'}
    response.update(changes)
    return {'exitCode': 0, 'stdout': json.dumps(response), 'stderr': 'PRIVATE_STDERR',
            'timeout': False, 'elapsedSeconds': 0.01}


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / 'repository'
        self.root.mkdir()
        self.output = self.parent / 'private-run'
        for family in runner.FAMILIES:
            for stage in ('base', 'change'):
                self.put(f'{runner.BENCH}/tasks/{family}/{stage}.md', f'{family} {stage} REQUIREMENTS')
            self.put(f'{runner.BENCH}/tasks/{family}/cases.mjs', 'PRIVATE_TEST_SENTINEL')
            self.put(f'{runner.BENCH}/tasks/{family}/reference.mjs', 'PRIVATE_REFERENCE_SENTINEL')
        for arm in runner.ARMS:
            self.put(f'{runner.BENCH}/guidance/{arm}.md', f'COMMON_GUIDANCE_{arm}')
        for path in ('cases.mjs', 'fixtures/reference.mjs'):
            self.put('benchmarks/code-design/' + path, 'PRIVATE_MAPPER_SENTINEL')
        self.put('scripts/run-lifecycle-study.py', Path(runner.__file__).read_text())
        for name in ('protocol.md', 'evaluate.mjs', 'families.mjs', 'worker.mjs', 'self-test.mjs', 'score.mjs'):
            self.put(f'{runner.BENCH}/{name}', 'PRIVATE_HARNESS_SENTINEL')
        self.put(f'{runner.BENCH}/README.md', 'MUTABLE STATUS')
        self.put(f'{runner.BENCH}/results/old.json', 'PRIOR_RESULT_SENTINEL')

    def put(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def prepare(self):
        return runner.prepare(self.output, self.root, lambda: VERSIONS)

    def run_fake(self, provider=None, checker=None):
        return runner.run_study(self.output, provider or (lambda *args: raw_response()),
                                checker or (lambda source: True), lambda: VERSIONS, self.root)

    def test_freeze_private_complete_and_no_overwrite(self):
        plan = self.prepare()
        self.assertEqual(len(plan['jobs']), 54)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertNotIn(f'{runner.BENCH}/README.md', plan['files'])
        self.assertNotIn(f'{runner.BENCH}/results/old.json', plan['files'])
        for file in plan['files'].values():
            self.assertEqual(runner.sha(file['text']), file['sha256'])
        self.assertIn('benchmarks/code-design/cases.mjs', plan['files'])
        with self.assertRaises(FileExistsError):
            self.prepare()
        with self.assertRaises(ValueError):
            runner.prepare(self.root / 'output', self.root, lambda: VERSIONS)

    def test_schedule_balance_and_stage_barrier(self):
        jobs = runner.schedule()
        self.assertEqual(len({job['id'] for job in jobs}), 54)
        self.assertEqual([job['stage'] for job in jobs], ['base'] * 27 + ['change'] * 27)
        for stage in ('base', 'change'):
            for family in runner.FAMILIES:
                first_positions, arm_positions = [], {arm: [] for arm in runner.ARMS}
                for repetition in (1, 2, 3):
                    sequence = [job for job in jobs if job['stage'] == stage and job['repetition'] == repetition]
                    first_positions.append(next(index // 3 for index, job in enumerate(sequence) if job['family'] == family))
                    family_jobs = [job for job in sequence if job['family'] == family]
                    for index, job in enumerate(family_jobs):
                        arm_positions[job['arm']].append(index)
                self.assertEqual(sorted(first_positions), [0, 1, 2])
                for positions in arm_positions.values():
                    self.assertEqual(sorted(positions), [0, 1, 2])

    def test_prompt_allowlist_and_frozen_text(self):
        plan = self.prepare()
        self.put(f'{runner.BENCH}/tasks/mapper/base.md', 'MUTATED AFTER PREPARE')
        for job in plan['jobs']:
            prior = f'export const ownBase = "{job["id"]}";'
            prompt, paths = runner.prompt_for(plan, job, prior if job['stage'] == 'change' else None)
            self.assertIn(f'COMMON_GUIDANCE_{job["arm"]}', prompt)
            self.assertIn(f'{job["family"]} base REQUIREMENTS', prompt)
            self.assertNotIn('PRIVATE_', prompt)
            self.assertNotIn('MUTATED', prompt)
            self.assertEqual(len(paths), 3 if job['stage'] == 'change' else 2)
            if job['stage'] == 'change':
                self.assertIn(prior, prompt)
                self.assertIn(f'{job["family"]} change REQUIREMENTS', prompt)
            else:
                self.assertNotIn('change REQUIREMENTS', prompt)
                self.assertNotIn('ownBase', prompt)

    def test_full_run_limits_concurrency_provenance_and_no_retry(self):
        plan = self.prepare()
        lock = threading.Lock()
        observed = {'active': 0, 'peak': 0, 'calls': 0, 'completed_base': 0}

        def provider(command, prompt, cwd, timeout):
            self.assertEqual(command, runner.COMMAND)
            self.assertEqual(timeout, 240)
            self.assertEqual(cwd, self.output.resolve())
            with lock:
                if 'Prior implementation:' in prompt:
                    self.assertEqual(observed['completed_base'], 27)
                observed['active'] += 1
                observed['calls'] += 1
                observed['peak'] = max(observed['peak'], observed['active'])
            time.sleep(0.004)
            with lock:
                observed['active'] -= 1
                if 'Prior implementation:' not in prompt:
                    observed['completed_base'] += 1
            return raw_response(total_cost_usd=0.5)

        run = self.run_fake(provider)
        self.assertEqual(run['status'], 'generation-complete-awaiting-review')
        self.assertEqual(run['admittedCalls'], 54)
        self.assertEqual(run['knownCostUsd'], 27)
        self.assertTrue(run['costComplete'])
        self.assertEqual(observed['calls'], 54)
        self.assertGreater(observed['peak'], 1)
        self.assertLessEqual(observed['peak'], 3)
        self.assertEqual(run['planSha256'], runner.sha((self.output / 'plan.json').read_text()))
        for call in run['calls']:
            self.assertIn('admittedAt', call)
            self.assertIn('finishedAt', call)
            self.assertEqual(call['sourceSha256'], runner.sha(call['source']))
            self.assertEqual(call['promptSha256'], runner.sha(call['prompt']))
            self.assertEqual((self.output / call['candidate']).read_text(), call['source'])
        public = json.dumps(runner.report(self.output))
        self.assertNotIn('DO_NOT_EXPORT', public)
        self.assertNotIn('PRIVATE_STDERR', public)
        self.assertEqual(len(plan['jobs']), len(run['calls']))
        with self.assertRaises(FileExistsError):
            self.run_fake(provider)
        self.assertEqual(observed['calls'], 54)

    def test_missing_cost_stops_window_and_preserves_denominator(self):
        self.prepare()
        run = self.run_fake(lambda *args: raw_response(total_cost_usd=None))
        self.assertEqual(run['admittedCalls'], 3)
        self.assertEqual(len(run['calls']), 54)
        self.assertFalse(run['costComplete'])
        self.assertEqual(run['knownCostUsd'], 0)
        self.assertEqual(run['status'], 'partial-reconciliation-required')
        self.assertTrue(all(call['countAsFailure'] for call in run['calls']))
        self.assertIn('missing-or-invalid-cost', run['stopReasons'])

    def test_identity_tool_and_overbudget_stop(self):
        scenarios = [
            ({'modelUsage': {'other-model': {}}}, 'missing-or-changed-model-identity'),
            ({'num_turns': 2}, 'tool-use-or-unexpected-turn-count'),
            ({'permission_denials': [{'tool_name': 'Read'}]}, 'tool-use-or-unexpected-turn-count'),
            ({'usage': {'server_tool_use': {'web_fetch_requests': 1}}}, 'tool-use-or-unexpected-turn-count'),
            ({'total_cost_usd': 0.51}, 'per-call-cost-exceeded'),
        ]
        for changes, reason in scenarios:
            with self.subTest(reason=reason):
                result, stops = runner.decode_response(raw_response(**changes), lambda source: True)
                self.assertIn(reason, stops)
                self.assertNotIn('source', result)
                self.assertEqual(result['resultText'], SOURCE)

    def test_unknown_launch_or_timeout_cost_is_not_retried(self):
        self.prepare()

        def broken(*args):
            raise OSError('simulated provider launch failure')

        run = self.run_fake(broken)
        self.assertEqual(run['admittedCalls'], 3)
        self.assertFalse(run['costComplete'])
        self.assertIn('missing-cost-and-identity', run['stopReasons'])
        raw = raw_response()
        raw['timeout'] = True
        _, stops = runner.decode_response(raw, lambda source: True)
        self.assertIn('provider-timeout-reconcile', stops)

    def test_failed_base_retained_and_change_skipped(self):
        self.prepare()
        run = self.run_fake(lambda *args: raw_response(result='I cannot provide that implementation.'),
                            lambda source: False)
        self.assertEqual(run['admittedCalls'], 27)
        self.assertEqual(len(run['calls']), 54)
        self.assertTrue(run['costComplete'])
        self.assertAlmostEqual(run['knownCostUsd'], 0.27)
        self.assertTrue(all(call['status'] == 'failed-generation' for call in run['calls'][:27]))
        self.assertTrue(all(call['status'] == 'skipped-no-base-source' for call in run['calls'][27:]))
        self.assertTrue(all(call['countAsFailure'] for call in run['calls']))
        self.assertEqual(run['calls'][0]['resultText'], 'I cannot provide that implementation.')

    def test_change_uses_only_own_distinct_base_source(self):
        self.prepare()

        def provider(command, prompt, cwd, timeout):
            return raw_response(result=f'export const promptId = "{runner.sha(prompt)}";')

        run = self.run_fake(provider)
        bases = {call['id']: call for call in run['calls'] if call['stage'] == 'base'}
        self.assertEqual(len({base['source'] for base in bases.values()}), 9)
        # Repetitions use identical prompts; identity differences are family/arm.
        for call in run['calls'][27:]:
            base = bases[call['id'].removesuffix('-change') + '-base']
            self.assertEqual(call['priorSourceSha256'], base['sourceSha256'])
            self.assertTrue(call['prompt'].endswith('Prior implementation:\n' + base['source'] + '\n'))
            for other in bases.values():
                if other['source'] != base['source']:
                    self.assertNotIn(other['source'], call['prompt'])

    def test_timeout_and_later_identity_drift_collect_window_then_stop(self):
        self.prepare()

        def provider(command, prompt, cwd, timeout):
            response = raw_response()
            if 'retry base REQUIREMENTS' in prompt:
                response['timeout'] = True
            return response

        run = self.run_fake(provider)
        self.assertEqual(run['admittedCalls'], 6)
        self.assertTrue(run['costComplete'])
        self.assertIn('provider-timeout-reconcile', run['stopReasons'])
        self.assertEqual(sum('source' in call for call in run['calls']), 3)

    def test_returned_error_still_consumes_call_and_cost(self):
        self.prepare()
        run = self.run_fake(lambda *args: raw_response(is_error=True))
        self.assertEqual(run['admittedCalls'], 3)
        self.assertAlmostEqual(run['knownCostUsd'], 0.03)
        self.assertIn('provider-error-reconcile', run['stopReasons'])
        self.assertTrue(all(call['failureReason'] == 'provider-protocol-violation' for call in run['calls'][:3]))

    def test_truncated_parseable_output_is_failure(self):
        result, stops = runner.decode_response(raw_response(stop_reason='max_tokens'), lambda source: True)
        self.assertFalse(stops)
        self.assertNotIn('source', result)
        self.assertEqual(result['resultText'], SOURCE)
        self.assertEqual(result['failureReason'], 'provider-output-truncated')

    def test_whole_window_reserved_before_provider_and_total_violation_collected(self):
        self.prepare()

        def provider(*args):
            persisted = json.loads((self.output / 'run.json').read_text())
            self.assertEqual(persisted['admittedCalls'], 3)
            self.assertEqual(len(persisted['calls']), 3)
            return raw_response(total_cost_usd=10)

        run = self.run_fake(provider)
        self.assertEqual(run['admittedCalls'], 3)
        self.assertEqual(run['knownCostUsd'], 30)
        self.assertTrue(run['costComplete'])
        self.assertIn('total-cost-exceeded', run['stopReasons'])

    def test_tampered_plan_runner_or_versions_rejected_before_call(self):
        plan = self.prepare()
        plan['protocol']['concurrency'] = 4
        with self.assertRaises(ValueError):
            runner.validate_plan(plan)
        self.put('scripts/run-lifecycle-study.py', 'changed')
        with self.assertRaises(ValueError):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())
        self.put('scripts/run-lifecycle-study.py', Path(runner.__file__).read_text())
        with self.assertRaises(ValueError):
            runner.run_study(self.output, version_reader=lambda: {'claude': 'changed'}, root=self.root)
        self.assertFalse((self.output / 'started.json').exists())

    def test_syntax_check_does_not_execute_candidate(self):
        marker = self.parent / 'must-not-exist'
        source = f'import fs from "node:fs"; fs.writeFileSync({json.dumps(str(marker))}, "executed");'
        self.assertTrue(runner.syntax_check(source))
        self.assertFalse(marker.exists())
        self.assertFalse(runner.syntax_check('export function incomplete('))
        result, stops = runner.decode_response(raw_response(result='```js\n' + SOURCE + '```'))
        self.assertFalse(stops)
        self.assertEqual(result['source'], SOURCE)
        result, stops = runner.decode_response(raw_response(result='```js\nexport function incomplete('))
        self.assertFalse(stops)
        self.assertEqual(result['failureReason'], 'result-not-parseable-module')


if __name__ == '__main__':
    unittest.main()
