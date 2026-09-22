"""Offline design-study runner checks. Fake providers never contact Claude."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

SPEC = importlib.util.spec_from_file_location('design_runner', Path(__file__).with_name('run-design-study.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
VERSIONS = {'claude': 'fake-claude-1', 'node': 'fake-node-1'}
SOURCE = 'export function example() { return 1; }\n'
DESIGN = '  ```json\n{"deliberately":"not the schema"}\n```  \n'


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
        for path in runner.required_paths():
            self.put(path, 'PRIVATE_HARNESS_SENTINEL')
        for family in runner.FAMILIES:
            self.put(f'{runner.BENCH}/tasks/{family}/task.md', f'{family} PUBLIC_CONTRACT')
            self.put(f'{runner.BENCH}/tasks/{family}/model.json', json.dumps({'family': family, 'vocabulary': ['public']}))
        for arm in runner.ARMS:
            self.put(f'{runner.BENCH}/guidance/{arm}.md', f'GUIDANCE_{arm}')
        self.put(f'{runner.BENCH}/artifact.md', 'SHARED_SCHEMA')
        self.put(f'{runner.BENCH}/facts.md', 'SHARED_FACTS')
        for relative in runner.SCRIPT_PATHS:
            self.put(relative, (runner.ROOT / relative).read_text())
        self.put(f'{runner.BENCH}/README.md', 'MUTABLE STATUS')
        self.put(f'{runner.BENCH}/results/old.json', 'PRIVATE_OLD_RESULT')
        self.put(f'{runner.BENCH}/support-helper.mjs', 'PRIVATE_HELPER_SENTINEL')

    def put(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def prepare(self):
        return runner.prepare(self.output, self.root, lambda: VERSIONS)

    def save_plan(self, plan):
        runner.write_json(self.output / 'plan.json', plan)

    def run_fake(self, provider=None, checker=None, versions=None):
        return runner.run_study(self.output, provider or (lambda *args: raw_response()),
                                checker or (lambda source: True),
                                versions or (lambda: VERSIONS), self.root)

    def test_private_complete_freeze_and_no_overwrite(self):
        plan = self.prepare()
        self.assertEqual(len(plan['jobs']), 36)
        self.assertEqual(plan['protocol']['pairDenominator'], 18)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.output / 'plan.json').stat().st_mode & 0o777, 0o600)
        self.assertNotIn(f'{runner.BENCH}/README.md', plan['files'])
        self.assertNotIn(f'{runner.BENCH}/results/old.json', plan['files'])
        for path in runner.required_paths():
            self.assertIn(path, plan['files'])
        self.assertIn(f'{runner.BENCH}/support-helper.mjs', plan['files'])
        for frozen in plan['files'].values():
            self.assertEqual(runner.sha(frozen['text']), frozen['sha256'])
        with self.assertRaises(FileExistsError):
            self.prepare()
        with self.assertRaises(ValueError):
            runner.prepare(self.root / 'output', self.root, lambda: VERSIONS)

    def test_schedule_balance_and_all_design_barrier(self):
        jobs = runner.schedule()
        self.assertEqual(len({job['id'] for job in jobs}), 36)
        self.assertEqual([job['stage'] for job in jobs], ['design'] * 18 + ['code'] * 18)
        for stage in runner.STAGES:
            for family in runner.FAMILIES:
                first_positions, arm_positions = [], {arm: [] for arm in runner.ARMS}
                for repetition in (1, 2, 3):
                    sequence = [job for job in jobs if job['stage'] == stage and job['repetition'] == repetition]
                    first_positions.append(next(i // 3 for i, job in enumerate(sequence) if job['family'] == family))
                    family_jobs = [job for job in sequence if job['family'] == family]
                    for index, job in enumerate(family_jobs):
                        arm_positions[job['arm']].append(index)
                self.assertEqual(len(set(first_positions)), 2)
                for positions in arm_positions.values():
                    self.assertEqual(sorted(positions), [0, 1, 2])

    def test_prompt_allowlist_and_frozen_text(self):
        plan = self.prepare()
        self.put(f'{runner.BENCH}/tasks/jobs/task.md', 'MUTATED_AFTER_PREPARE')
        for job in plan['jobs']:
            prior = f'\nRAW_OWN_DESIGN {job["id"]}  \n'
            prompt, paths = runner.prompt_for(plan, job, prior if job['stage'] == 'code' else None)
            self.assertEqual(len(paths), 5)
            self.assertIn('SHARED_SCHEMA', prompt)
            self.assertIn('SHARED_FACTS', prompt)
            self.assertIn(f'GUIDANCE_{job["arm"]}', prompt)
            self.assertIn(f'{job["family"]} PUBLIC_CONTRACT', prompt)
            self.assertNotIn('PRIVATE_', prompt)
            self.assertNotIn('MUTATED_', prompt)
            for other in set(runner.ARMS) - {job['arm']}:
                self.assertNotIn(f'GUIDANCE_{other}', prompt)
            if job['stage'] == 'code':
                self.assertTrue(prompt.endswith(runner.PRIOR_LABEL + prior + '\n'))
            else:
                self.assertNotIn('RAW_OWN_DESIGN', prompt)
        with self.assertRaises(ValueError):
            runner.prompt_for(plan, plan['jobs'][18], '')

    def test_full_run_caps_concurrency_provenance_and_no_duplicate(self):
        self.prepare()
        lock = threading.Lock()
        observed = {'active': 0, 'peak': 0, 'calls': 0, 'completed_design': 0}

        def provider(command, prompt, cwd, timeout):
            self.assertEqual(command, runner.COMMAND)
            self.assertEqual(timeout, 240)
            self.assertEqual(cwd, self.output.resolve())
            is_code = prompt.startswith(runner.INTROS['code'])
            with lock:
                if is_code:
                    self.assertEqual(observed['completed_design'], 18)
                observed['active'] += 1
                observed['calls'] += 1
                observed['peak'] = max(observed['peak'], observed['active'])
            time.sleep(0.004)
            with lock:
                observed['active'] -= 1
                if not is_code:
                    observed['completed_design'] += 1
            return raw_response(result=SOURCE if is_code else DESIGN, total_cost_usd=0.5)

        run = self.run_fake(provider)
        self.assertEqual(run['status'], 'generation-complete-awaiting-review')
        self.assertEqual(run['admittedCalls'], 36)
        self.assertEqual(run['knownCostUsd'], 18)
        self.assertTrue(run['costComplete'])
        self.assertEqual(observed['calls'], 36)
        self.assertGreater(observed['peak'], 1)
        self.assertLessEqual(observed['peak'], 3)
        self.assertEqual(run['planSha256'], runner.sha((self.output / 'plan.json').read_text()))
        for call in run['calls']:
            self.assertIn('admittedAt', call)
            self.assertIn('finishedAt', call)
            self.assertEqual(call['promptSha256'], runner.sha(call['prompt']))
            if call['stage'] == 'design':
                self.assertNotIn('source', call)
                self.assertEqual(call['designText'], DESIGN)
                self.assertEqual(call['resultText'], DESIGN)
                self.assertEqual(call['designSha256'], runner.sha(DESIGN))
                self.assertEqual((self.output / call['designCandidate']).read_text(), DESIGN)
            else:
                self.assertEqual(call['sourceSha256'], runner.sha(call['source']))
                self.assertEqual((self.output / call['candidate']).read_text(), call['source'])
                self.assertEqual(call['priorDesignSha256'], runner.sha(DESIGN))
        public = json.dumps(runner.report(self.output))
        self.assertNotIn('DO_NOT_EXPORT', public)
        self.assertNotIn('PRIVATE_STDERR', public)
        with self.assertRaises(FileExistsError):
            self.run_fake(provider)
        self.assertEqual(observed['calls'], 36)

    def test_malformed_design_forwarded_exactly_without_checker(self):
        self.prepare()
        checked = []

        def provider(command, prompt, cwd, timeout):
            is_code = prompt.startswith(runner.INTROS['code'])
            if is_code:
                self.assertTrue(prompt.endswith(runner.PRIOR_LABEL + DESIGN + '\n'))
            return raw_response(result=SOURCE if is_code else DESIGN)

        def checker(source):
            checked.append(source)
            return source == SOURCE

        run = self.run_fake(provider, checker)
        self.assertEqual(run['admittedCalls'], 36)
        self.assertEqual(checked, [SOURCE] * 18)
        self.assertTrue(all(call['designText'] == DESIGN for call in run['calls'][:18]))
        self.assertTrue(all(call['status'] == 'generated-not-reviewed' for call in run['calls']))

    def test_available_refusal_or_truncation_text_still_gets_code(self):
        self.prepare()

        def provider(command, prompt, cwd, timeout):
            if prompt.startswith(runner.INTROS['code']):
                return raw_response()
            reason = 'refusal' if 'jobs PUBLIC_CONTRACT' in prompt else 'max_tokens'
            return raw_response(result='  incomplete but exact  \n', stop_reason=reason)

        run = self.run_fake(provider)
        self.assertEqual(run['admittedCalls'], 36)
        self.assertTrue(all(call['status'] == 'failed-generation' for call in run['calls'][:18]))
        self.assertTrue(all(call['status'] == 'generated-not-reviewed' for call in run['calls'][18:]))
        self.assertTrue(all(call['prompt'].endswith(runner.PRIOR_LABEL + '  incomplete but exact  \n\n')
                            for call in run['calls'][18:]))

    def test_absent_design_text_skips_only_dependent_code(self):
        self.prepare()
        run = self.run_fake(lambda *args: raw_response(result='  \n'))
        self.assertEqual(run['admittedCalls'], 18)
        self.assertEqual(len(run['calls']), 36)
        self.assertAlmostEqual(run['knownCostUsd'], 0.18)
        self.assertTrue(run['costComplete'])
        self.assertTrue(all(call['status'] == 'skipped-no-design-text' for call in run['calls'][18:]))
        self.assertTrue(all(call['countAsFailure'] for call in run['calls']))

    def test_code_uses_only_own_distinct_raw_design(self):
        self.prepare()

        def provider(command, prompt, cwd, timeout):
            return raw_response(result=SOURCE if prompt.startswith(runner.INTROS['code'])
                                else f'\n  design for {runner.sha(prompt)}  \n')

        run = self.run_fake(provider)
        designs = {call['id']: call for call in run['calls'][:18]}
        self.assertEqual(len({call['designText'] for call in designs.values()}), 6)
        for call in run['calls'][18:]:
            prior = designs[call['id'].removesuffix('-code') + '-design']
            self.assertEqual(call['priorDesignSha256'], prior['designSha256'])
            self.assertTrue(call['prompt'].endswith(runner.PRIOR_LABEL + prior['designText'] + '\n'))
            for other in designs.values():
                if other['designText'] != prior['designText']:
                    self.assertNotIn(other['designText'], call['prompt'])

    def test_missing_cost_collects_window_and_preserves_denominator(self):
        self.prepare()
        run = self.run_fake(lambda *args: raw_response(total_cost_usd=None))
        self.assertEqual(run['admittedCalls'], 3)
        self.assertEqual(len(run['calls']), 36)
        self.assertFalse(run['costComplete'])
        self.assertEqual(run['knownCostUsd'], 0)
        self.assertEqual(run['status'], 'partial-reconciliation-required')
        self.assertIn('missing-or-invalid-cost', run['stopReasons'])
        self.assertTrue(all(call['countAsFailure'] for call in run['calls']))

    def test_identity_tools_and_overbudget_stops(self):
        scenarios = [
            ({'modelUsage': {'other-model': {}}}, 'missing-or-changed-model-identity'),
            ({'num_turns': 2}, 'tool-use-or-unexpected-turn-count'),
            ({'permission_denials': [{'tool_name': 'Read'}]}, 'tool-use-or-unexpected-turn-count'),
            ({'usage': {'server_tool_use': {'web_fetch_requests': 1}}}, 'tool-use-or-unexpected-turn-count'),
            ({'total_cost_usd': 0.51}, 'per-call-cost-exceeded'),
            ({'is_error': True}, 'provider-error-reconcile'),
        ]
        for changes, reason in scenarios:
            with self.subTest(reason=reason):
                record, stops = runner.decode_response(raw_response(**changes), lambda source: True)
                self.assertIn(reason, stops)
                self.assertNotIn('source', record)
                self.assertEqual(record['resultText'], SOURCE)

    def test_provider_launch_failure_or_timeout_stops_without_retry(self):
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

    def test_whole_window_reserved_before_provider_total_cost_recorded(self):
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

    def test_stale_any_input_rejected_before_provider(self):
        self.prepare()
        self.put(f'{runner.BENCH}/tasks/jobs/cases.mjs', 'CHANGED_EVALUATOR')
        with self.assertRaisesRegex(ValueError, 'Frozen input changed'):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())

    def test_omitted_extra_dependency_rejected_before_provider(self):
        plan = self.prepare()
        del plan['files'][f'{runner.BENCH}/support-helper.mjs']
        self.save_plan(plan)
        with self.assertRaisesRegex(ValueError, 'closure differs'):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())

    def test_new_dependency_rejected_but_mutable_status_excluded(self):
        plan = self.prepare()
        self.put(f'{runner.BENCH}/README.md', 'NEW STATUS')
        self.put(f'{runner.BENCH}/results/other.json', 'NEW RESULT')
        runner.verify_current_files(plan, self.root)
        self.put(f'{runner.BENCH}/new-helper.mjs', 'NEW DEPENDENCY')
        with self.assertRaisesRegex(ValueError, 'closure differs'):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())

    def test_missing_required_freeze_and_bad_protocol_rejected(self):
        plan = self.prepare()
        for name in ('guidance/freeze.json', 'tasks/review-fixes.json', 'test-score.mjs', 'test-artifact.mjs',
                     'self-test.mjs', 'tasks/jobs/self-test.mjs', 'tasks/batch/self-test.mjs'):
            with self.subTest(name=name):
                changed = json.loads(json.dumps(plan))
                del changed['files'][f'{runner.BENCH}/{name}']
                with self.assertRaisesRegex(ValueError, 'Missing frozen'):
                    runner.validate_plan(changed)
        plan = json.loads((self.output / 'plan.json').read_text())
        plan['protocol']['command'] = ['unsafe-provider']
        with self.assertRaisesRegex(ValueError, 'Changed protocol'):
            runner.validate_plan(plan)
        plan = json.loads((self.output / 'plan.json').read_text())
        plan['files'][f'{runner.BENCH}/facts.md']['text'] = 'tampered'
        with self.assertRaisesRegex(ValueError, 'Invalid frozen'):
            runner.validate_plan(plan)

    def test_version_change_and_nonprivate_output_rejected(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'CLI versions changed'):
            self.run_fake(versions=lambda: {'claude': 'changed', 'node': VERSIONS['node']})
        self.assertFalse((self.output / 'started.json').exists())
        self.output.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'private'):
            self.run_fake()
        self.assertFalse((self.output / 'started.json').exists())

    def test_symlink_dependency_cannot_freeze(self):
        path = self.root / runner.BENCH / 'support-helper.mjs'
        path.unlink()
        path.symlink_to(self.root / runner.BENCH / 'artifact.md')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_code_syntax_check_parses_without_executing(self):
        marker = self.parent / 'must-not-exist'
        source = f'import fs from "node:fs"; fs.writeFileSync({json.dumps(str(marker))}, "executed");'
        self.assertTrue(runner.syntax_check(source))
        self.assertFalse(marker.exists())
        self.assertFalse(runner.syntax_check('export function incomplete('))
        record, stops = runner.decode_response(raw_response(result='```js\n' + SOURCE + '```'))
        self.assertFalse(stops)
        self.assertEqual(record['source'], SOURCE)


if __name__ == '__main__':
    unittest.main()
