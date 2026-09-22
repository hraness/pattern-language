#!/usr/bin/env python3
"""Prepare, generate, or report the design-decision study; never execute candidates.

prepare is offline. run requires a fresh 36-request/$18 authorization. Provider
handling is shared with the frozen lifecycle runner; no retries or resumption.
"""
import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BENCH = 'benchmarks/design-decisions-v3'
LEGACY_PATH = Path(__file__).with_name('run-lifecycle-study.py')
SPEC = importlib.util.spec_from_file_location('design_study_provider_primitives', LEGACY_PATH)
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)
sha, now = LEGACY.sha, LEGACY.now
write_text, write_json = LEGACY.write_text, LEGACY.write_json
invoke, syntax_check, versions = LEGACY.invoke, LEGACY.syntax_check, LEGACY.versions
decode_response = LEGACY.decode_response

MODEL = 'claude-haiku-4-5'
ARMS = ('direct', 'checklist', 'pattern')
FAMILIES = ('jobs', 'batch')
STAGES = ('design', 'code')
SYSTEM = ('Produce only the requested design artifact or JavaScript module from the '
          'supplied public requirements. Use no tools or external context.')
INTROS = {
    'design': ('Design a solution to the task below. Use only the supplied prompt. '
               'Do not use tools, browse, or inspect repository files. Return only '
               'one JSON design artifact conforming to the supplied schema, with no Markdown fences.'),
    'code': ('Implement the task below using your prior design response, reproduced '
             'exactly at the end of this prompt. Use only the supplied prompt. Do not '
             'use tools, browse, or inspect repository files. Return only one complete '
             'ES module, with no Markdown fences.'),
}
PRIOR_LABEL = 'Your exact prior design response:\n'
LIMITS = {'maxCalls': 36, 'maxUsdPerCall': 0.50, 'maxTotalUsd': 18.0,
          'concurrency': 3, 'timeoutSecondsPerCall': 240, 'retryBudget': 0}
COMMAND = ['claude', '-p', '--model', MODEL, '--safe-mode', '--tools', '',
           '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
           '--output-format', 'json', '--max-budget-usd', '0.50', '--system-prompt', SYSTEM]
SCRIPT_PATHS = ('scripts/run-design-study.py', 'scripts/test_design_runner.py',
                'scripts/run-lifecycle-study.py')


def schedule():
    jobs = []
    for stage in STAGES:
        for repetition in range(3):
            offset = repetition % len(FAMILIES)
            families = FAMILIES[offset:] + FAMILIES[:offset]
            arms = ARMS[repetition:] + ARMS[:repetition]
            for family in families:
                for arm in arms:
                    jobs.append({'id': f'{family}-{arm}-r{repetition + 1}-{stage}',
                                 'family': family, 'arm': arm,
                                 'repetition': repetition + 1, 'stage': stage})
    return jobs


def protocol_for(tool_versions):
    return {
        **LIMITS, 'requestedModel': MODEL, 'command': COMMAND,
        'systemPrompt': SYSTEM, 'promptIntros': INTROS, 'priorDesignLabel': PRIOR_LABEL,
        'cliVersions': tool_versions, 'repetitions': 3, 'families': list(FAMILIES),
        'arms': list(ARMS), 'stages': list(STAGES), 'tools': [], 'feedback': 'none',
        'schedule': 'Rotate family and arm order by repetition; all design before all code.',
        'denominator': 36, 'pairDenominator': 18, 'denominatorPerFamilyArmStage': 3,
        'pairDenominatorPerFamilyArm': 3, 'missingOrSkippedCountsAsFailure': True,
        'designForwarding': 'Exact resultText, including malformed artifacts; no validation feedback.',
        'samplingSeed': None, 'immutableProviderRevision': None,
        'limitations': [
            'CLI budget is configured, not an independent provider-side hard spending guarantee.',
            'No runner retries; opaque CLI transport retries are not independently observable.',
            'Provider alias and reported identity cannot prove an immutable model revision.',
            'Three exploratory repetitions per cell do not establish general effectiveness.',
            'Two families cannot occupy each order position equally across three repetitions.',
        ],
    }


def required_paths():
    paths = list(SCRIPT_PATHS)
    paths += [f'{BENCH}/{name}' for name in (
        'artifact.md', 'artifact.mjs', 'facts.md', 'protocol.md', 'evaluate.mjs',
        'worker.mjs', 'score.mjs', 'self-test.mjs', 'test-artifact.mjs', 'test-score.mjs',
        'tasks/freeze.json', 'tasks/review-fixes.json', 'guidance/freeze.json')]
    paths += [f'{BENCH}/guidance/{arm}.md' for arm in ARMS]
    paths += [f'{BENCH}/tasks/{family}/{name}' for family in FAMILIES
              for name in ('task.md', 'model.json', 'reference.mjs', 'cases.mjs',
                           'design-check.mjs', 'self-test.mjs')]
    return paths


def frozen_paths(root):
    """Exact local closure, including newly added helpers and freeze receipts."""
    paths = []
    folder = root / BENCH
    for path in folder.rglob('*'):
        relative = path.relative_to(folder)
        if 'results' in relative.parts or relative == Path('README.md'):
            continue
        if path.is_symlink():
            raise ValueError(f'Cannot freeze symlink: {path}')
        if path.is_file():
            paths.append(str(path.relative_to(root)))
    for relative in SCRIPT_PATHS:
        path = root / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Missing or symlinked runner dependency: {relative}')
        paths.append(relative)
    return sorted(set(paths))


def validate_plan(plan):
    if plan.get('schema') != 'pattern-language.design-plan.v1' or plan.get('jobs') != schedule():
        raise ValueError('Plan schema or balanced 36-job schedule differs from the runner')
    protocol = plan.get('protocol', {})
    tool_versions = protocol.get('cliVersions')
    if (not isinstance(tool_versions, dict) or set(tool_versions) != {'claude', 'node'}
            or any(not isinstance(value, str) or not value for value in tool_versions.values())):
        raise ValueError('Missing CLI versions')
    if protocol != protocol_for(tool_versions):
        raise ValueError('Changed protocol fields, command, or configured limits')
    files = plan.get('files')
    if not isinstance(files, dict) or any(path not in files for path in required_paths()):
        raise ValueError('Missing frozen prompt, evaluator, freeze receipt, or runner dependency')
    for path, frozen in files.items():
        parts = Path(path).parts
        permitted = (path in SCRIPT_PATHS or
                     (path.startswith(BENCH + '/') and 'results' not in parts
                      and path != BENCH + '/README.md'))
        if (Path(path).is_absolute() or '..' in parts or not permitted
                or not isinstance(frozen, dict) or not isinstance(frozen.get('text'), str)
                or sha(frozen['text']) != frozen.get('sha256')):
            raise ValueError(f'Invalid frozen file: {path}')


def verify_current_files(plan, root):
    if frozen_paths(root) != sorted(plan['files']):
        raise ValueError('Frozen input closure differs from the current tree; prepare a new plan')
    for path, frozen in plan['files'].items():
        if sha((root / path).read_bytes().decode('utf-8')) != frozen['sha256']:
            raise ValueError(f'Frozen input changed after preparation: {path}')


def private_output(output, root):
    output, root = output.resolve(), root.resolve()
    if output == root or root in output.parents:
        raise ValueError('Use a private output directory outside the repository')
    return output, root


def prepare(output, root=ROOT, version_reader=versions):
    output, root = private_output(output, root)
    # These local version probes do not issue generation or authentication calls.
    tool_versions = version_reader()
    files = {}
    for path in frozen_paths(root):
        text = (root / path).read_bytes().decode('utf-8')
        files[path] = {'sha256': sha(text), 'text': text}
    plan = {'schema': 'pattern-language.design-plan.v1', 'preparedAt': now(),
            'protocol': protocol_for(tool_versions), 'files': files, 'jobs': schedule()}
    validate_plan(plan)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    write_json(output / 'plan.json', plan)
    return plan


def prompt_for(plan, job, prior=None):
    paths = [f'{BENCH}/artifact.md', f'{BENCH}/facts.md',
             f'{BENCH}/guidance/{job["arm"]}.md',
             f'{BENCH}/tasks/{job["family"]}/task.md',
             f'{BENCH}/tasks/{job["family"]}/model.json']
    sections = [INTROS[job['stage']]] + [plan['files'][path]['text'].strip() for path in paths]
    if job['stage'] == 'code':
        if not isinstance(prior, str) or not prior.strip():
            raise ValueError('Code prompt requires this attempt\'s exact design response')
        sections.append(PRIOR_LABEL + prior)
    return '\n\n'.join(sections) + '\n', paths


def run_study(output, provider=invoke, checker=syntax_check, version_reader=versions, root=ROOT):
    output, root = private_output(output, root)
    if output.stat().st_mode & 0o077:
        raise ValueError('Run directory must be private (mode 0700)')
    plan_text = (output / 'plan.json').read_bytes().decode('utf-8')
    plan = json.loads(plan_text)
    validate_plan(plan)
    verify_current_files(plan, root)
    if version_reader() != plan['protocol']['cliVersions']:
        raise ValueError('CLI versions changed after preparation; prepare a new plan')
    # Exclusive creation is the no-resume boundary, including uncertain crashes.
    with open(output / 'started.json', 'x') as handle:
        os.chmod(output / 'started.json', 0o600)
        json.dump({'startedAt': now(), 'planSha256': sha(plan_text)}, handle)
    for directory in ('raw', 'designs', 'candidates'):
        (output / directory).mkdir(mode=0o700)
    run = {'schema': 'pattern-language.design-generation.v1', 'planSha256': sha(plan_text),
           'status': 'running', 'startedAt': now(), 'calls': [], 'admittedCalls': 0,
           'knownCostUsd': 0.0, 'costComplete': True, 'stopReasons': [],
           'cliVersions': plan['protocol']['cliVersions'], 'denominator': 36,
           'pairDenominator': 18, 'sourceReviewRequired': True, 'evaluationStatus': 'not-run'}
    write_json(output / 'run.json', run)
    completed = {}

    def execute(job, prompt):
        try:
            raw = provider(COMMAND[:], prompt, output, LIMITS['timeoutSecondsPerCall'])
        except Exception as error:
            raw = {'exitCode': None, 'timeout': False, 'elapsedSeconds': 0,
                   'stdout': '', 'stderr': f'{type(error).__name__}: {error}'}
        write_text(output / 'raw' / f'{job["id"]}.stdout.txt', raw['stdout'])
        write_text(output / 'raw' / f'{job["id"]}.stderr.txt', raw['stderr'])
        result, stops = decode_response(raw, (lambda source: True) if job['stage'] == 'design' else checker)
        if job['stage'] == 'design':
            # No schema check, fence removal, or whitespace normalization enters
            # the dependent prompt. Even malformed returned text is preserved.
            for key in ('source', 'sourceSha256', 'strippedOuterFence'):
                result.pop(key, None)
            if isinstance(result.get('resultText'), str):
                result['designText'] = result['resultText']
                result['designSha256'] = sha(result['designText'])
        return result, stops

    with ThreadPoolExecutor(max_workers=LIMITS['concurrency']) as pool:
        for stage in STAGES:
            jobs = [job for job in plan['jobs'] if job['stage'] == stage]
            for offset in range(0, len(jobs), LIMITS['concurrency']):
                pending, admitted = {}, []
                for job in jobs[offset:offset + LIMITS['concurrency']]:
                    if run['stopReasons']:
                        break
                    prior = completed.get(job['id'].removesuffix('-code') + '-design')
                    prior_text = prior.get('designText') if prior else None
                    if stage == 'code' and (not isinstance(prior_text, str) or not prior_text.strip()):
                        record = {**job, 'admitted': False, 'status': 'skipped-no-design-text',
                                  'countAsFailure': True, 'costUsd': 0.0}
                        run['calls'].append(record)
                        completed[job['id']] = record
                        continue
                    if run['admittedCalls'] >= LIMITS['maxCalls']:
                        run['stopReasons'].append('call-limit-reached')
                        break
                    reserve = (len(admitted) + 1) * LIMITS['maxUsdPerCall']
                    if run['knownCostUsd'] + reserve > LIMITS['maxTotalUsd'] + 1e-9:
                        run['stopReasons'].append('total-cost-reservation-exceeded')
                        break
                    prompt, paths = prompt_for(plan, job, prior_text if stage == 'code' else None)
                    record = {**job, 'admitted': True, 'status': 'admitted-awaiting-response',
                              'admittedAt': now(), 'countAsFailure': True, 'costUsd': None,
                              'prompt': prompt, 'promptSha256': sha(prompt), 'promptFiles': paths,
                              'priorDesignSha256': prior['designSha256'] if stage == 'code' else None}
                    run['calls'].append(record)
                    run['admittedCalls'] += 1
                    run['costComplete'] = False
                    write_json(output / 'run.json', run)
                    admitted.append((job, prompt, record))
                # The full window is persisted before the first provider call.
                for job, prompt, record in admitted:
                    pending[pool.submit(execute, job, prompt)] = record
                while pending:
                    finished, _ = wait(pending, return_when=FIRST_COMPLETED)
                    for future in finished:
                        record = pending.pop(future)
                        try:
                            result, stops = future.result()
                        except Exception:
                            result, stops = {'status': 'failed-generation', 'costUsd': None,
                                             'failureReason': 'local-collection-failed'}, ['local-collection-failed']
                        record.update(result)
                        record['finishedAt'] = now()
                        completed[record['id']] = record
                        run['stopReasons'] = sorted(set(run['stopReasons'] + stops))
                        if 'designText' in record:
                            record['designCandidate'] = f'designs/{record["id"]}.txt'
                            write_text(output / record['designCandidate'], record['designText'])
                        if 'source' in record:
                            record['candidate'] = f'candidates/{record["id"]}.mjs'
                            write_text(output / record['candidate'], record['source'])
                        run['knownCostUsd'] = math.fsum(call['costUsd'] for call in run['calls']
                                                       if call.get('costUsd') is not None)
                        if run['knownCostUsd'] > LIMITS['maxTotalUsd'] + 1e-9:
                            run['stopReasons'] = sorted(set(run['stopReasons'] + ['total-cost-exceeded']))
                        run['costComplete'] = all(call.get('costUsd') is not None for call in run['calls'])
                        write_json(output / 'run.json', run)
                if run['stopReasons']:
                    break
            if run['stopReasons']:
                break
    recorded = {call['id'] for call in run['calls']}
    for job in plan['jobs']:
        if job['id'] not in recorded:
            run['calls'].append({**job, 'admitted': False, 'status': 'not-admitted-study-stopped',
                                 'countAsFailure': True, 'costUsd': 0.0})
    order = {job['id']: index for index, job in enumerate(plan['jobs'])}
    run['calls'].sort(key=lambda call: order[call['id']])
    run['status'] = 'partial-reconciliation-required' if run['stopReasons'] else 'generation-complete-awaiting-review'
    run['finishedAt'] = now()
    write_json(output / 'run.json', run)
    return run


def report(output):
    """Selected provenance and returned artifacts; raw provider data stays private."""
    return json.loads((output / 'run.json').read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('prepare', 'run', 'report'):
        command = sub.add_parser(action)
        command.add_argument('output', type=Path)
        if action == 'run':
            command.add_argument('--approve-live-36-calls-18-usd', action='store_true', required=True,
                                 help='Only use after receiving fresh authorization for this study')
    args = parser.parse_args()
    try:
        if args.action == 'prepare':
            plan = prepare(args.output)
            print(json.dumps({'status': 'prepared-no-model-calls', 'jobs': len(plan['jobs']),
                              'output': str(args.output.resolve())}))
        elif args.action == 'run':
            run = run_study(args.output)
            print(json.dumps({key: run[key] for key in ('status', 'admittedCalls', 'knownCostUsd', 'costComplete', 'stopReasons')}))
            return 1 if run['stopReasons'] else 0
        else:
            print(json.dumps(report(args.output), indent=2, allow_nan=False))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(2, f'{error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
