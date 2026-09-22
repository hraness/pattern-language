#!/usr/bin/env python3
"""Freeze, generate, or report the lifecycle study; never execute candidates.

prepare is offline. run requires a separately authorized 54-call/$27 allowance.
No runner retries or resume: uncertain calls consume an admission and require
reconciliation. Raw provider output stays in the private run directory.
"""
import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
BENCH = 'benchmarks/lifecycle-v2'
MODEL = 'claude-haiku-4-5'
ARMS = ('direct', 'checklist', 'pattern')
FAMILIES = ('mapper', 'retry', 'atomic')
SYSTEM = 'You generate correct JavaScript modules from supplied requirements. Return only the requested source code.'
INTRO = ('Solve the task below. Use only the supplied prompt. Do not use tools, '
         'browse, or inspect repository files. Return one complete ES module with no Markdown fences.')
LIMITS = {'maxCalls': 54, 'maxUsdPerCall': 0.50, 'maxTotalUsd': 27.0,
          'concurrency': 3, 'timeoutSecondsPerCall': 240, 'retryBudget': 0}
COMMAND = ['claude', '-p', '--model', MODEL, '--safe-mode', '--tools', '',
           '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
           '--output-format', 'json', '--max-budget-usd', '0.50', '--system-prompt', SYSTEM]


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def write_text(path, text):
    with open(path, 'w', encoding='utf-8') as handle:
        os.chmod(path, 0o600)
        handle.write(text)


def write_json(path, value):
    temporary = path.with_name('.' + path.name + '.tmp')
    write_text(temporary, json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def schedule():
    jobs = []
    for stage in ('base', 'change'):
        for repetition in range(3):
            families = FAMILIES[repetition:] + FAMILIES[:repetition]
            arms = ARMS[repetition:] + ARMS[:repetition]
            for family in families:
                for arm in arms:
                    jobs.append({'id': f'{family}-{arm}-r{repetition + 1}-{stage}',
                                 'family': family, 'arm': arm, 'repetition': repetition + 1,
                                 'stage': stage})
    return jobs


def versions():
    return {name: subprocess.check_output([name, '--version'], text=True, timeout=15).strip()
            for name in ('claude', 'node')}


def prepare(output, root=ROOT, version_reader=versions):
    root, output = root.resolve(), output.resolve()
    if output == root or root in output.parents:
        raise ValueError('Use a private output directory outside the repository')
    # Version probes do not invoke generation, authentication, or the network.
    tool_versions = version_reader()
    paths = []
    for folder in (root / BENCH, root / 'benchmarks/code-design'):
        for path in folder.rglob('*'):
            if 'results' in path.relative_to(folder).parts:
                continue
            if folder == root / BENCH and path == folder / 'README.md':
                continue
            if path.is_symlink():
                raise ValueError(f'Cannot freeze symlink: {path}')
            if path.is_file():
                paths.append(path)
    paths.append(root / 'scripts/run-lifecycle-study.py')
    tests = root / 'scripts/test_lifecycle_runner.py'
    if tests.exists():
        paths.append(tests)
    files = {}
    for path in sorted(paths):
        text = path.read_bytes().decode('utf-8')
        files[str(path.relative_to(root))] = {'sha256': sha(text), 'text': text}
    protocol = {
        **LIMITS, 'requestedModel': MODEL, 'command': COMMAND, 'systemPrompt': SYSTEM,
        'promptIntro': INTRO,
        'cliVersions': tool_versions, 'repetitions': 3, 'families': list(FAMILIES),
        'arms': list(ARMS), 'stages': ['base', 'change'], 'tools': [], 'feedback': 'none',
        'schedule': 'Per repetition rotate both family order and arm order; all base before all change.',
        'denominator': 54, 'denominatorPerFamilyArmStage': 3,
        'missingOrSkippedCountsAsFailure': True,
        'samplingSeed': None, 'immutableProviderRevision': None,
        'limitations': ['CLI budget is configured, not an independent provider-side hard spending guarantee.',
                       'No runner retries; opaque CLI transport retries are not independently observable.',
                       'Provider alias and reported identity cannot prove an immutable model revision.',
                       'Three exploratory repetitions per cell do not establish general effectiveness.'],
    }
    plan = {'schema': 'pattern-language.lifecycle-plan.v1', 'preparedAt': now(),
            'protocol': protocol, 'files': files, 'jobs': schedule()}
    validate_plan(plan)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    write_json(output / 'plan.json', plan)
    return plan


def validate_plan(plan):
    if plan.get('schema') != 'pattern-language.lifecycle-plan.v1' or plan.get('jobs') != schedule():
        raise ValueError('Plan schema or balanced 54-job schedule differs from the runner')
    protocol = plan['protocol']
    for key, value in {**LIMITS, 'requestedModel': MODEL, 'command': COMMAND,
                       'systemPrompt': SYSTEM, 'promptIntro': INTRO, 'tools': [], 'feedback': 'none'}.items():
        if protocol.get(key) != value:
            raise ValueError(f'Changed protocol field: {key}')
    for path, frozen in plan['files'].items():
        parts = Path(path).parts
        if Path(path).is_absolute() or '..' in parts or sha(frozen['text']) != frozen['sha256']:
            raise ValueError(f'Invalid frozen file: {path}')
    required = [f'{BENCH}/guidance/{arm}.md' for arm in ARMS]
    required += [f'{BENCH}/tasks/{family}/{stage}.md'
                 for family in FAMILIES for stage in ('base', 'change')]
    required += ['scripts/run-lifecycle-study.py', 'benchmarks/code-design/cases.mjs',
                 'benchmarks/code-design/fixtures/reference.mjs']
    required += [f'{BENCH}/{name}' for name in ('protocol.md', 'evaluate.mjs', 'families.mjs',
                                               'worker.mjs', 'self-test.mjs', 'score.mjs')]
    if any(path not in plan['files'] for path in required):
        raise ValueError('Missing frozen prompt, runner, or mapper dependency')


def prompt_for(plan, job, prior=None):
    paths = [f'{BENCH}/guidance/{job["arm"]}.md', f'{BENCH}/tasks/{job["family"]}/base.md']
    sections = [INTRO] + [plan['files'][path]['text'].strip() for path in paths]
    if job['stage'] == 'change':
        if not isinstance(prior, str) or not prior.strip():
            raise ValueError('Change prompt requires this job\'s own base source')
        path = f'{BENCH}/tasks/{job["family"]}/change.md'
        paths.append(path)
        sections += [plan['files'][path]['text'].strip(), 'Prior implementation:\n' + prior]
    return '\n\n'.join(sections) + '\n', paths


def invoke(command, prompt, cwd, timeout=240):
    started = time.monotonic()
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, cwd=cwd, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = proc.communicate(prompt, timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            stdout, stderr = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            stdout, stderr = proc.communicate()
    return {'exitCode': proc.returncode, 'stdout': stdout, 'stderr': stderr,
            'timeout': timed_out, 'elapsedSeconds': round(time.monotonic() - started, 3)}


def syntax_check(source):
    # Node's --check parses only; it does not import or execute the candidate.
    result = subprocess.run(['node', '--check', '--input-type=module'], input=source,
                            text=True, capture_output=True, timeout=15)
    return result.returncode == 0


def has_tools(value):
    if isinstance(value, list):
        return any(has_tools(item) for item in value)
    if not isinstance(value, dict):
        return False
    if value.get('type') in ('tool_use', 'tool_result', 'server_tool_use'):
        return True
    for key, child in value.items():
        if key in ('tool_calls', 'tool_uses', 'permission_denials') and child:
            return True
        if key in ('webSearchRequests', 'web_search_requests', 'web_fetch_requests') and child != 0:
            return True
        if key == 'server_tool_use' and isinstance(child, dict) and any(child.values()):
            return True
        if has_tools(child):
            return True
    return False


def decode_response(raw, checker=syntax_check):
    record = {key: raw[key] for key in ('exitCode', 'timeout', 'elapsedSeconds')}
    record.update(status='failed-generation', costUsd=None, countAsFailure=True)
    stops = []
    try:
        response = json.loads(raw['stdout'])
        if not isinstance(response, dict):
            raise ValueError('Expected a JSON object')
    except (ValueError, TypeError):
        record['failureReason'] = 'invalid-provider-json'
        return record, ['missing-cost-and-identity']
    record['providerEnvelope'] = {key: response[key] for key in
                                  ('type', 'subtype', 'is_error', 'stop_reason', 'stopReason')
                                  if key in response and isinstance(response[key], (str, bool, type(None)))}
    cost = response.get('total_cost_usd')
    if isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0:
        record['costUsd'] = cost
        if cost > LIMITS['maxUsdPerCall'] + 1e-9:
            stops.append('per-call-cost-exceeded')
    else:
        stops.append('missing-or-invalid-cost')
    model_usage = response.get('modelUsage')
    identity = None
    if isinstance(model_usage, dict) and len(model_usage) == 1:
        model, details = next(iter(model_usage.items()))
        if isinstance(details, dict):
            identity = {'model': model,
                        'canonicalModel': details.get('canonicalModel') if isinstance(details.get('canonicalModel'), str) else None,
                        'provider': details.get('provider') if isinstance(details.get('provider'), str) else None}
            record['provider'] = {**identity, 'turns': response.get('num_turns'),
                                  'usage': {key: details[key] for key in
                                            ('inputTokens', 'outputTokens', 'cacheReadInputTokens',
                                             'cacheCreationInputTokens', 'thinkingTokens')
                                            if isinstance(details.get(key), int) and not isinstance(details[key], bool)
                                            and details[key] >= 0}}
            if not isinstance(record['provider']['turns'], int):
                record['provider']['turns'] = None
    if identity != {'model': MODEL, 'canonicalModel': MODEL, 'provider': 'firstParty'}:
        stops.append('missing-or-changed-model-identity')
    if has_tools(response) or response.get('num_turns') != 1:
        stops.append('tool-use-or-unexpected-turn-count')
    if raw['timeout']:
        stops.append('provider-timeout-reconcile')
    if raw['exitCode'] != 0 or response.get('is_error'):
        stops.append('provider-error-reconcile')
    if response.get('type') != 'result' or response.get('subtype') != 'success':
        stops.append('unexpected-provider-envelope')
    result = response.get('result')
    if isinstance(result, str):
        record['resultText'] = result
    if stops:
        record['failureReason'] = 'provider-protocol-violation'
        return record, stops
    stop_reason = response.get('stop_reason', response.get('stopReason'))
    if stop_reason in ('max_tokens', 'max_output_tokens', 'length', 'model_context_window_exceeded'):
        record['failureReason'] = 'provider-output-truncated'
        return record, []
    if stop_reason == 'refusal' or response.get('is_refusal'):
        record['failureReason'] = 'provider-refusal'
        return record, []
    if not isinstance(result, str) or not result.strip():
        record['failureReason'] = 'provider-error-or-empty-result'
        return record, []
    source = result.strip()
    if source.startswith('```') and source.endswith('```') and '\n' in source:
        source = source.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        record['strippedOuterFence'] = True
    source += '\n'
    try:
        valid = checker(source)
    except (OSError, subprocess.SubprocessError):
        record['failureReason'] = 'local-syntax-check-unavailable'
        return record, ['local-syntax-check-unavailable']
    if not valid:
        record['failureReason'] = 'result-not-parseable-module'
        return record, []
    record.update(status='generated-not-reviewed', countAsFailure=False,
                  source=source, sourceSha256=sha(source))
    return record, []


def run_study(output, provider=invoke, checker=syntax_check, version_reader=versions, root=ROOT):
    output = output.resolve()
    if output.stat().st_mode & 0o077:
        raise ValueError('Run directory must be private (mode 0700)')
    plan_text = (output / 'plan.json').read_text()
    plan = json.loads(plan_text)
    validate_plan(plan)
    frozen_runner = plan['files']['scripts/run-lifecycle-study.py']['sha256']
    if sha((root / 'scripts/run-lifecycle-study.py').read_text()) != frozen_runner:
        raise ValueError('Runner changed after preparation; prepare a new plan')
    if version_reader() != plan['protocol']['cliVersions']:
        raise ValueError('CLI versions changed after preparation; prepare a new plan')
    # Exclusive creation is the persistent no-retry boundary, including crashes.
    with open(output / 'started.json', 'x') as handle:
        os.chmod(output / 'started.json', 0o600)
        json.dump({'startedAt': now(), 'planSha256': sha(plan_text)}, handle)
    (output / 'raw').mkdir(mode=0o700)
    (output / 'candidates').mkdir(mode=0o700)
    run = {'schema': 'pattern-language.lifecycle-generation.v1', 'planSha256': sha(plan_text),
           'status': 'running', 'startedAt': now(), 'calls': [], 'admittedCalls': 0,
           'knownCostUsd': 0.0, 'costComplete': True, 'stopReasons': [],
           'cliVersions': plan['protocol']['cliVersions'], 'denominator': len(plan['jobs']),
           'sourceReviewRequired': True, 'evaluationStatus': 'not-run'}
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
        return decode_response(raw, checker)

    # Fixed windows keep admission order deterministic despite completion timing.
    # A violation stops new admissions; already admitted calls are collected.
    with ThreadPoolExecutor(max_workers=LIMITS['concurrency']) as pool:
        for stage in ('base', 'change'):
            jobs = [job for job in plan['jobs'] if job['stage'] == stage]
            for offset in range(0, len(jobs), LIMITS['concurrency']):
                pending = {}
                admitted = []
                for job in jobs[offset:offset + LIMITS['concurrency']]:
                    if run['stopReasons']:
                        break
                    prior = completed.get(job['id'].removesuffix('-change') + '-base')
                    if stage == 'change' and (not prior or 'source' not in prior):
                        record = {**job, 'admitted': False, 'status': 'skipped-no-base-source',
                                  'countAsFailure': True, 'costUsd': 0.0}
                        run['calls'].append(record)
                        completed[job['id']] = record
                        continue
                    if run['admittedCalls'] >= LIMITS['maxCalls']:
                        run['stopReasons'].append('call-limit-reached')
                        break
                    # Reserve the full configured cap for every outstanding call.
                    reserve = (len(admitted) + 1) * LIMITS['maxUsdPerCall']
                    if run['knownCostUsd'] + reserve > LIMITS['maxTotalUsd'] + 1e-9:
                        run['stopReasons'].append('total-cost-reservation-exceeded')
                        break
                    prompt, paths = prompt_for(plan, job, prior['source'] if stage == 'change' else None)
                    record = {**job, 'admitted': True, 'status': 'admitted-awaiting-response',
                              'admittedAt': now(),
                              'countAsFailure': True, 'costUsd': None, 'prompt': prompt,
                              'promptSha256': sha(prompt), 'promptFiles': paths,
                              'priorSourceSha256': prior['sourceSha256'] if stage == 'change' else None}
                    run['calls'].append(record)
                    run['admittedCalls'] += 1
                    run['costComplete'] = False
                    write_json(output / 'run.json', run)
                    admitted.append((job, prompt, record))
                # Persist every reservation before any provider in this window starts.
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
    """Only the selected run metadata and generated text; never raw responses."""
    return json.loads((output / 'run.json').read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('prepare', 'run', 'report'):
        command = sub.add_parser(action)
        command.add_argument('output', type=Path)
        if action == 'run':
            command.add_argument('--approve-live-54-calls-27-usd', action='store_true', required=True,
                                 help='Only use after receiving authorization for this study')
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
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(2, f'{error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
