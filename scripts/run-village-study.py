#!/usr/bin/env python3
"""Collect a frozen, single-shot decomposition study through qualified XCB/SWE-2.

Preparation reads metadata only. Generation preserves inert response text; it
never parses an artifact or evaluates a partition. No retries, resumption,
continuation, or provider/model fallback are permitted.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('decompose_provider', Path(__file__).with_name('run-design-swe2.py'))
PROVIDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROVIDER)
# Route to the uncontended imported Devin account: a_9ddef4bd stays leased by a
# concurrent holder for most of the day, while a_8f76493c binds the same native
# credential (verified by credential_identity at preparation and admission).
PROVIDER.ACCOUNT = 'a_8f76493c947445aa9850ae62ae52222d'
PROVIDER.ACCOUNT_TOKEN_PATH = Path('/Users/bg/.local/share/xcb/accounts') / PROVIDER.ACCOUNT / 'windsurf-token'
_provider_credential_identity = PROVIDER.credential_identity
PROVIDER.credential_identity = lambda native_path=PROVIDER.CREDENTIAL_PATH, account_path=None, environment=None: (
    _provider_credential_identity(native_path, account_path or PROVIDER.ACCOUNT_TOKEN_PATH, environment))
sha, now = PROVIDER.sha, PROVIDER.now
write_text, write_json = PROVIDER.write_text, PROVIDER.write_json
identities, capabilities, catalog = PROVIDER.identities, PROVIDER.capabilities, PROVIDER.catalog
invoke = PROVIDER.invoke

BENCH = 'benchmarks/village-decompose'
ARMS = ('direct', 'checklist', 'pattern')
RETRY_BUDGET = 6
RETRY_DELAY_SECONDS = 30
TRANSIENT_FAILURE_CODES = frozenset({'deadline', 'busy', 'provider_error', 'unavailable'})
INTRO = ('Construct a solution to the task below. Use only the supplied prompt. '
         'Do not use tools, browse, or inspect repository files. Return only one '
         'JSON decomposition artifact conforming to the supplied schema, with no Markdown fences.')
SCRIPT_PATHS = ('scripts/run-village-study.py', 'scripts/test_village_runner.py',
                'scripts/score-village-study.py', 'scripts/test_village_scorer.py', 'scripts/partition_metrics.py',
                'scripts/run-design-swe2.py', 'scripts/run-design-study.py', 'scripts/run-lifecycle-study.py')
TASK_NAMES = ('contract.md', 'dataset.md', 'oracle.json', 'sample-links.json')
REQUIRED_NAMES = (*TASK_NAMES, 'task-freeze.json', 'guidance-freeze.json', 'protocol.md')
TASK_FREEZE = f'{BENCH}/task-freeze.json'
GUIDANCE_FREEZE = f'{BENCH}/guidance-freeze.json'
PUBLIC_PATHS = tuple(f'{BENCH}/{name}' for name in ('contract.md', 'dataset.md'))
GUIDANCE_PATHS = tuple(f'{BENCH}/guidance/{arm}.md' for arm in ARMS)
IDENTITY_KEYS = ('cliVersions', 'executablePaths', 'executableHashes')
MAX_CALLS = 36
STOP_REASONS = {'pre-admission-eligibility-failed', 'runner-cancelled', 'xcb-custody-uncertain',
                'local-collection-failed', 'invalid-application-json', 'application-protocol-or-provider-failure',
                'duplicate-application-request-id'}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def same_json(value, expected):
    return json.dumps(value, sort_keys=True, allow_nan=False) == json.dumps(expected, sort_keys=True, allow_nan=False)


def timestamp(value):
    try:
        return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() * 1000
    except (TypeError, ValueError):
        raise ValueError('Invalid UTC timestamp') from None


def schedule():
    jobs = []
    for repetition in range(12):
        arms = ARMS[repetition % 3:] + ARMS[:repetition % 3]
        for arm in arms:
            jobs.append({'id': f'village-{arm}-r{repetition + 1}', 'context': 'village',
                         'arm': arm, 'repetition': repetition + 1, 'stage': 'decomposition'})
    return jobs


def protocol_for(identity, qualification):
    PROVIDER.validate_identity(identity)
    return {
        'maxCalls': MAX_CALLS, 'concurrency': 1, 'timeoutMs': PROVIDER.TIMEOUT_MS,
        'maxInputBytes': PROVIDER.MAX_INPUT_BYTES, 'maxOutputBytes': PROVIDER.MAX_OUTPUT_BYTES,
        'outerTimeoutSeconds': PROVIDER.OUTER_TIMEOUT_SECONDS,
        'cancellationGraceSeconds': PROVIDER.CANCELLATION_GRACE_SECONDS,
        'retryBudget': RETRY_BUDGET, 'requestedAccount': PROVIDER.ACCOUNT, 'requestedModel': PROVIDER.MODEL,
        'command': PROVIDER.COMMAND, **identity, 'qualification': qualification,
        'systemPrompt': None, 'promptIntro': INTRO,
        'repetitions': 12, 'contexts': ['village'], 'arms': list(ARMS), 'stages': ['decomposition'],
        'tools': [], 'hooks': [], 'ephemeral': True, 'feedback': 'none',
        'schedule': 'Rotate arm order by repetition mod 3; serial independent requests; each call retries transient provider failures up to retryBudget extra attempts.',
        'denominator': MAX_CALLS, 'denominatorPerContextArm': 12, 'missingCountsAsFailure': True,
        'artifactHandling': 'Preserve exact raw text; parse and evaluate only after generation is finalized.',
        'catalogCommand': [PROVIDER.DEVIN, 'models', 'list', '--format', 'json'],
        'catalogAccountBinding': PROVIDER.ACCOUNT_BINDING, 'requiredCatalogCostTier': 'Free',
        'costReporting': 'not-reported', 'enforcedUsdBudget': None,
        'samplingSeed': None, 'immutableProviderRevision': None,
        'limitations': [
            'Native catalog Free status is checked before each request; XCB has no spending-cap field.',
            'XCB reports no token usage, monetary cost, or immutable provider model revision.',
            'Selected account/model identity is XCB routing evidence, not independently reported model identity.',
            'XCB prefixes the caller prompt with fixed application instructions in one ACP text block; no separate system-role message is sent.',
            'Runner retries each call up to retryBudget extra provider attempts on transient failures only; every attempt envelope is preserved in call attempts and raw/.',
            'Twelve repetitions per arm on one decomposition task do not establish general effectiveness.',
            'A reused published reference decomposition cannot establish usefulness on unseen problem corpora.',
            "The hidden reference is Alexander's 1973 decomposition; the model may reproduce memorized structure.",
        ],
    }


def frozen_paths(root=ROOT):
    root = Path(root)
    paths = set(SCRIPT_PATHS)
    folder = root / BENCH
    check(folder.is_dir() and not folder.is_symlink(), 'Missing or symlinked benchmark directory')
    for path in folder.rglob('*'):
        relative = path.relative_to(folder)
        if relative.parts[0] == 'results' or relative == Path('README.md'):
            continue
        check(not path.is_symlink(), f'Cannot freeze symlink: {path}')
        if path.is_file():
            paths.add(str(path.relative_to(root)))
        else:
            check(path.is_dir(), f'Unsupported frozen dependency: {path}')
    required = set(SCRIPT_PATHS) | set(PUBLIC_PATHS) | set(GUIDANCE_PATHS)
    required |= {f'{BENCH}/{name}' for name in REQUIRED_NAMES}
    check(required <= paths, 'Missing required frozen decomposition dependency')
    for name in paths:
        path = root / name
        check(path.is_file() and not path.is_symlink(), f'Missing or symlinked dependency: {name}')
        for parent in path.parents:
            if parent == root:
                break
            check(not parent.is_symlink(), f'Symlinked dependency ancestor: {name}')
    return sorted(paths)


def task_paths(files):
    return {name for name in files if name in {f'{BENCH}/{leaf}' for leaf in TASK_NAMES}
            or name.startswith(f'{BENCH}/fixtures/')}


def validate_freezes(plan):
    files = plan['files']
    try:
        task = json.loads(files[TASK_FREEZE]['text'])
        guidance = json.loads(files[GUIDANCE_FREEZE]['text'])
    except (KeyError, ValueError, TypeError):
        raise ValueError('Missing or invalid freeze receipt') from None
    check(isinstance(task, dict) and set(task) == {'schema', 'frozenAt', 'files'}
          and task['schema'] == 'pattern-language.decompose-task-freeze.v1', 'Invalid task freeze schema')
    check(isinstance(guidance, dict) and set(guidance) == {'schema', 'frozenAt', 'taskFreezeSha256', 'files'}
          and guidance['schema'] == 'pattern-language.decompose-guidance-freeze.v1', 'Invalid guidance freeze schema')
    check(guidance['taskFreezeSha256'] == files[TASK_FREEZE]['sha256'], 'Guidance references a changed task freeze')
    check(timestamp(task['frozenAt']) <= timestamp(guidance['frozenAt']) <= timestamp(plan['preparedAt']),
          'Task, guidance and preparation chronology differs')
    for receipt, expected in ((task, task_paths(files)), (guidance, set(PUBLIC_PATHS) | set(GUIDANCE_PATHS))):
        check(isinstance(receipt['files'], dict) and set(receipt['files']) == expected, 'Freeze receipt path closure differs')
        for path, digest in receipt['files'].items():
            check(PROVIDER.valid_digest(digest) and files[path]['sha256'] == digest, f'Frozen receipt hash changed: {path}')


def validate_plan(plan):
    check(isinstance(plan, dict) and set(plan) == {'schema', 'preparedAt', 'protocol', 'files', 'jobs'}, 'Invalid plan fields')
    check(plan['schema'] == 'pattern-language.decompose-plan.v1' and same_json(plan['jobs'], schedule()), 'Changed plan schema or schedule')
    protocol = plan['protocol']
    check(isinstance(protocol, dict), 'Missing protocol')
    identity = {key: protocol.get(key) for key in IDENTITY_KEYS}
    check(same_json(protocol, protocol_for(identity, protocol.get('qualification'))), 'Changed protocol, routing, or limits')
    PROVIDER.validate_qualification(protocol['qualification'], identity, timestamp(plan['preparedAt']))
    files = plan['files']
    required = set(SCRIPT_PATHS) | set(PUBLIC_PATHS) | set(GUIDANCE_PATHS)
    required |= {f'{BENCH}/{name}' for name in REQUIRED_NAMES}
    check(isinstance(files, dict) and required <= set(files), 'Missing frozen dependency')
    for path, file in files.items():
        check(isinstance(path, str) and not Path(path).is_absolute() and '..' not in Path(path).parts
              and str(Path(path)) == path and (path in SCRIPT_PATHS or (
                  path.startswith(BENCH + '/') and Path(path).relative_to(BENCH).parts[0] != 'results' and path != BENCH + '/README.md')),
              f'Unexpected frozen path: {path}')
        check(isinstance(file, dict) and set(file) == {'text', 'sha256'} and isinstance(file['text'], str)
              and PROVIDER.valid_digest(file['sha256']) and sha(file['text']) == file['sha256'], f'Invalid frozen file: {path}')
    validate_freezes(plan)


def verify_current_files(plan, root=ROOT):
    check(frozen_paths(root) == sorted(plan['files']), 'Frozen dependency closure differs from current tree')
    for path, frozen in plan['files'].items():
        check(sha((Path(root) / path).read_bytes().decode('utf-8')) == frozen['sha256'], f'Frozen input changed: {path}')


def prompt_for(plan, job):
    paths = [f'{BENCH}/{name}' for name in ('contract.md', 'dataset.md')]
    paths.append(f'{BENCH}/guidance/{job["arm"]}.md')
    return '\n\n'.join([INTRO] + [plan['files'][path]['text'].strip() for path in paths]) + '\n', paths


def prepare(output, root=ROOT, version_reader=identities, capability_reader=capabilities, catalog_reader=catalog):
    output, root = PROVIDER.ORIGINAL.private_output(output, root)
    paths = frozen_paths(root)
    identity = version_reader()
    cap, listing = capability_reader(), catalog_reader()
    admitted = PROVIDER.eligibility(identity, cap, listing)
    if '_credentialSnapshot' in listing:
        check(listing['_credentialSnapshot'] == PROVIDER.credential_identity(), 'Credential changed before preparation')
    files = {}
    for path in paths:
        content = (root / path).read_bytes().decode('utf-8')
        files[path] = {'text': content, 'sha256': sha(content)}
    plan = {'schema': 'pattern-language.decompose-plan.v1', 'preparedAt': now(),
            'protocol': protocol_for(identity, admitted['qualification']), 'files': files, 'jobs': schedule()}
    validate_plan(plan)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    write_json(output / 'plan.json', plan)
    write_json(output / 'preparation-eligibility.json', admitted)
    write_text(output / 'preparation-capabilities.json', cap['raw'])
    write_text(output / 'preparation-catalog.json', listing['raw'])
    return plan


def run_study(output, provider=invoke, version_reader=identities,
              capability_reader=capabilities, catalog_reader=catalog, root=ROOT):
    output, root = PROVIDER.ORIGINAL.private_output(output, root)
    check(output.stat().st_mode & 0o077 == 0, 'Run directory must be private (mode 0700)')
    plan_text = (output / 'plan.json').read_bytes().decode('utf-8')
    plan = json.loads(plan_text)
    validate_plan(plan)
    verify_current_files(plan, root)
    identity = {key: plan['protocol'][key] for key in IDENTITY_KEYS}
    check(version_reader() == identity, 'Executable identity changed after preparation')
    with open(output / 'started.json', 'x') as handle:
        os.chmod(output / 'started.json', 0o600)
        json.dump({'startedAt': now(), 'planSha256': sha(plan_text)}, handle)
    for name in ('raw', 'artifacts'):
        (output / name).mkdir(mode=0o700)
    run = {'schema': 'pattern-language.decompose-generation.v1', 'planSha256': sha(plan_text),
           'status': 'running', 'startedAt': now(), 'calls': [], 'admittedCalls': 0,
           'knownCostUsd': 0, 'costComplete': True, 'costStatus': 'not-reported', 'stopReasons': [],
           **identity, 'denominator': MAX_CALLS, 'evaluationStatus': 'not-run'}
    write_json(output / 'run.json', run)
    request_ids = set()
    for job in plan['jobs']:
        if run['stopReasons']:
            break
        raw_dir = output / 'raw' / job['id']
        raw_dir.mkdir(mode=0o700)
        try:
            check(version_reader() == identity, 'Executable identity changed before admission')
            ready = PROVIDER.read_eligibility(identity, capability_reader, catalog_reader, raw_dir)
            check(ready['qualification'] == plan['protocol']['qualification'], 'Application qualification changed after preparation')
            prompt, paths = prompt_for(plan, job)
            request = PROVIDER.request_for(prompt)
            admitted_at = now()
            PROVIDER.validate_admission_evidence(ready, identity, plan['protocol']['qualification'], timestamp(admitted_at))
        except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
            run['stopReasons'].append('pre-admission-eligibility-failed')
            write_text(raw_dir / 'pre-admission-error.txt', f'{type(error).__name__}: {error}')
            break
        record = {**job, 'admitted': True, 'status': 'admitted-awaiting-response', 'admittedAt': admitted_at,
                  'countAsFailure': True, 'costUsd': None, 'costStatus': 'not-reported',
                  'prompt': prompt, 'promptSha256': sha(prompt), 'promptFiles': paths, 'eligibility': ready,
                  'attempts': []}
        run['calls'].append(record)
        run['admittedCalls'] += 1
        run.update(knownCostUsd=None, costComplete=False)
        write_json(output / 'run.json', run)
        for attempt in range(1, 2 + plan['protocol']['retryBudget']):
            if attempt > 1:
                time.sleep(RETRY_DELAY_SECONDS)
            try:
                raw = provider(PROVIDER.COMMAND[:], request, raw_dir, PROVIDER.OUTER_TIMEOUT_SECONDS)
            except Exception as error:
                raw = {'exitCode': None, 'timeout': False, 'elapsedSeconds': 0,
                       'stdout': '', 'stderr': f'{type(error).__name__}: {error}', 'custodyUncertain': True}
            suffix = '' if attempt == 1 else f'-{attempt}'
            write_text(raw_dir / f'stdout{suffix}.txt', raw['stdout'])
            write_text(raw_dir / f'stderr{suffix}.txt', raw['stderr'])
            # An intentionally non-code/non-design stage validates only the provider
            # envelope. No artifact JSON is parsed during generation.
            result, stops = PROVIDER.decode_response(raw, 'decomposition')
            request_id = result.get('providerEnvelope', {}).get('requestId')
            if request_id in request_ids:
                result = {key: raw.get(key) for key in ('exitCode', 'timeout', 'elapsedSeconds')}
                result.update(status='failed-generation', countAsFailure=True, costUsd=None,
                              costStatus='not-reported', failureReason='duplicate-application-request-id')
                stops = ['duplicate-application-request-id']
            elif request_id is not None:
                request_ids.add(request_id)
            record['attempts'].append({'attempt': attempt, 'status': result.get('status'),
                                       'failureCode': result.get('applicationFailureCode'),
                                       'elapsedSeconds': result.get('elapsedSeconds'), 'requestId': request_id})
            if (result.get('status') == 'generated-not-reviewed'
                    or result.get('applicationFailureCode') not in TRANSIENT_FAILURE_CODES):
                break
        record.update(result)
        record['finishedAt'] = now()
        run['stopReasons'] = sorted(set(run['stopReasons'] + stops))
        if 'resultText' in record:
            record['resultSha256'] = sha(record['resultText'])
            relative = f'artifacts/{job["id"]}.txt'
            record['artifactCandidate'] = relative
            write_text(output / relative, record['resultText'])
        write_json(output / 'run.json', run)
    recorded = {call['id'] for call in run['calls']}
    for job in plan['jobs']:
        if job['id'] not in recorded:
            run['calls'].append({**job, 'admitted': False, 'status': 'not-admitted-study-stopped',
                                 'countAsFailure': True, 'costUsd': 0, 'costStatus': 'not-incurred'})
    run['status'] = 'partial-reconciliation-required' if run['stopReasons'] else 'generation-complete-awaiting-evaluation'
    run['finishedAt'] = now()
    validate_run(plan, run, plan_text)
    write_json(output / 'run.json', run)
    return run


def validate_run(plan, run, plan_text=None):
    """Pure provenance validation; never parse or execute model artifact text."""
    validate_plan(plan)
    check(isinstance(run, dict), 'Invalid run')
    required = {'schema', 'planSha256', 'status', 'startedAt', 'finishedAt', 'calls', 'admittedCalls',
                'knownCostUsd', 'costComplete', 'costStatus', 'stopReasons', 'denominator', 'evaluationStatus', *IDENTITY_KEYS}
    check(set(run) == required and run['schema'] == 'pattern-language.decompose-generation.v1', 'Invalid run fields/schema')
    check(PROVIDER.valid_digest(run['planSha256']), 'Invalid plan digest')
    if plan_text is not None:
        check(isinstance(plan_text, str) and json.loads(plan_text) == plan and sha(plan_text) == run['planSha256'], 'Run differs from exact plan bytes')
    check(run['status'] in ('generation-complete-awaiting-evaluation', 'partial-reconciliation-required'), 'Run must be finalized before evaluation')
    check(type(run['denominator']) is int and run['denominator'] == MAX_CALLS and run['evaluationStatus'] == 'not-run', 'Changed denominator/evaluation boundary')
    identity = {key: plan['protocol'][key] for key in IDENTITY_KEYS}
    check(all(run[key] == identity[key] for key in IDENTITY_KEYS), 'Run executable identity differs from plan')
    prepared, started, finished = map(timestamp, (plan['preparedAt'], run['startedAt'], run['finishedAt']))
    check(prepared <= started <= finished, 'Invalid preparation/run chronology')
    reasons = run['stopReasons']
    check(isinstance(reasons, list) and all(isinstance(reason, str) and reason in STOP_REASONS for reason in reasons)
          and reasons == sorted(set(reasons)) and (run['status'] == 'partial-reconciliation-required') == bool(reasons), 'Invalid stop evidence/status')
    check(isinstance(run['calls'], list) and len(run['calls']) == MAX_CALLS, 'Run must include all 36 planned slots')
    previous_finished, stopped, admitted, request_ids = started, False, 0, set()
    base_fields = {'id', 'context', 'arm', 'repetition', 'stage', 'admitted', 'status', 'countAsFailure', 'costUsd', 'costStatus'}
    admission_fields = {'admittedAt', 'prompt', 'promptSha256', 'promptFiles', 'eligibility', 'finishedAt',
                        'exitCode', 'timeout', 'elapsedSeconds'}
    response_fields = {'resultText', 'resultSha256', 'artifactCandidate', 'providerEnvelope', 'provider'}
    failure_fields = {'failureReason', 'applicationFailureCode', 'custodyUncertain', 'pid'}
    for job, call in zip(plan['jobs'], run['calls']):
        check(isinstance(call, dict) and base_fields <= set(call)
              and set(call) <= base_fields | admission_fields | response_fields | failure_fields | {'attempts'}, 'Invalid call fields')
        check(all(call.get(key) == value and type(call.get(key)) is type(value) for key, value in job.items()), 'Changed job metadata/order')
        check(type(call['admitted']) is bool and type(call['countAsFailure']) is bool, 'Invalid admission/failure boolean')
        if not call['admitted']:
            check(set(call) == base_fields and call['status'] == 'not-admitted-study-stopped'
                  and call['countAsFailure'] is True and type(call['costUsd']) is int and call['costUsd'] == 0
                  and call['costStatus'] == 'not-incurred' and reasons, 'Invalid unadmitted slot')
            stopped = True
            continue
        admitted += 1
        check(not stopped and admission_fields <= set(call), 'Admission continued after stop or lacks provenance')
        check(call['status'] in ('generated-not-reviewed', 'failed-generation')
              and call['countAsFailure'] == (call['status'] == 'failed-generation')
              and call['costUsd'] is None and call['costStatus'] == 'not-reported', 'Invalid admission status/cost')
        admitted_ms, finished_ms = timestamp(call['admittedAt']), timestamp(call['finishedAt'])
        check(previous_finished <= admitted_ms <= finished_ms <= finished, 'Invalid serial call chronology')
        PROVIDER.validate_admission_evidence(call['eligibility'], identity, plan['protocol']['qualification'], admitted_ms)
        check(same_json(call['eligibility']['accountBinding'], PROVIDER.ACCOUNT_BINDING), 'Changed account-binding receipt types')
        check(timestamp(call['eligibility']['checkedAt']) >= previous_finished, 'Metadata evidence predates prior call')
        previous_finished = finished_ms
        prompt, paths = prompt_for(plan, job)
        check(call['prompt'] == prompt and call['promptFiles'] == paths and call['promptSha256'] == sha(prompt), 'Prompt differs from frozen public inputs')
        PROVIDER.request_for(prompt)
        check(type(call['timeout']) is bool and (call['exitCode'] is None or type(call['exitCode']) is int)
              and type(call['elapsedSeconds']) in (int, float) and math.isfinite(call['elapsedSeconds'])
              and call['elapsedSeconds'] >= 0, 'Invalid process receipt')
        attempts = call.get('attempts')
        check(isinstance(attempts, list) and 1 <= len(attempts) <= 1 + plan['protocol']['retryBudget'], 'Invalid call attempts')
        for index, attempt in enumerate(attempts, 1):
            check(set(attempt) == {'attempt', 'status', 'failureCode', 'elapsedSeconds', 'requestId'}
                  and attempt['attempt'] == index
                  and attempt['status'] in ('generated-not-reviewed', 'failed-generation')
                  and (attempt['failureCode'] is None or attempt['failureCode'] in {
                      'invalid_request', 'unavailable', 'busy', 'deadline', 'cancelled', 'provider_error',
                      'output_limit', 'custody_unproven'})
                  and type(attempt['elapsedSeconds']) in (int, float)
                  and math.isfinite(attempt['elapsedSeconds']) and attempt['elapsedSeconds'] >= 0
                  and (attempt['requestId'] is None or type(attempt['requestId']) is str and attempt['requestId']), 'Invalid call attempt')
        for attempt in attempts[:-1]:
            check(attempt['status'] == 'failed-generation' and attempt['failureCode'] in TRANSIENT_FAILURE_CODES,
                  'Retried call attempt lacks a transient failure')
            if attempt['requestId'] is not None:
                check(attempt['requestId'] not in request_ids, 'Duplicate attempt request id')
                request_ids.add(attempt['requestId'])
        if 'resultText' in call:
            check(response_fields <= set(call) and isinstance(call['resultText'], str)
                  and len(call['resultText'].encode('utf-8')) <= PROVIDER.MAX_OUTPUT_BYTES
                  and call['resultSha256'] == sha(call['resultText'])
                  and call['artifactCandidate'] == f'artifacts/{job["id"]}.txt', 'Invalid exact response provenance')
            check(call['provider'] == {'account': PROVIDER.ACCOUNT, 'model': PROVIDER.MODEL, 'reportedModelRevision': None, 'usage': None}, 'Invalid provider identity/telemetry')
            envelope = call['providerEnvelope']
            check(isinstance(envelope, dict) and set(envelope) == {'version', 'status', 'requestId', 'account', 'model', 'outcome'}
                  and type(envelope['version']) is int and envelope['version'] == 1 and envelope['status'] == 'completed'
                  and isinstance(envelope['requestId'], str) and envelope['requestId'] and envelope['requestId'] not in request_ids
                  and envelope['account'] == PROVIDER.ACCOUNT and envelope['model'] == PROVIDER.MODEL
                  and envelope['outcome'] == {'terminal': 'completed', 'joined': True, 'effects': 'none'}
                  and envelope['outcome']['joined'] is True and call['exitCode'] == 0 and call['timeout'] is False
                  and not (set(call) & {'applicationFailureCode', 'custodyUncertain', 'pid'}), 'Invalid provider completion envelope')
            request_ids.add(envelope['requestId'])
            if call['resultText'].strip():
                check(call['status'] == 'generated-not-reviewed' and 'failureReason' not in call, 'Nonempty completion mislabeled')
            else:
                check(call['status'] == 'failed-generation' and call.get('failureReason') == 'empty-result', 'Empty completion mislabeled')
        else:
            check(not (set(call) & response_fields) and call['status'] == 'failed-generation'
                  and call.get('failureReason') in STOP_REASONS - {'pre-admission-eligibility-failed'}
                  and call['failureReason'] in reasons, 'Transport failure lacks matching stop evidence')
            if 'applicationFailureCode' in call:
                check(call['failureReason'] == 'application-protocol-or-provider-failure'
                      and call['applicationFailureCode'] in {'invalid_request', 'unavailable', 'busy', 'deadline', 'cancelled', 'provider_error', 'output_limit', 'custody_unproven'}, 'Invalid application failure code')
            if 'custodyUncertain' in call or 'pid' in call:
                check(call['failureReason'] == 'xcb-custody-uncertain' and call.get('custodyUncertain') is True
                      and (call.get('pid') is None or type(call['pid']) is int and call['pid'] > 0), 'Invalid custody evidence')
            stopped = True
    check(type(run['admittedCalls']) is int and run['admittedCalls'] == admitted, 'Admitted call count mismatch')
    check(run['costStatus'] == 'not-reported' and run['costComplete'] is (admitted == 0)
          and (run['knownCostUsd'] is None if admitted else type(run['knownCostUsd']) is int and run['knownCostUsd'] == 0), 'Invalid unknown-cost accounting')
    observed_stops = {call['failureReason'] for call in run['calls'] if call.get('failureReason') in STOP_REASONS}
    if admitted < MAX_CALLS and not observed_stops:
        observed_stops.add('pre-admission-eligibility-failed')
    check(set(reasons) == observed_stops, 'Stop reasons differ from recorded stop boundary')
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('prepare', 'run', 'report', 'validate'):
        command = sub.add_parser(action)
        command.add_argument('output', type=Path)
        if action == 'run':
            command.add_argument('--approve-36-requests-catalog-free-route', action='store_true', required=True)
    args = parser.parse_args()
    try:
        if args.action == 'prepare':
            plan = prepare(args.output)
            print(json.dumps({'status': 'prepared-no-model-calls', 'jobs': len(plan['jobs']), 'output': str(args.output.resolve())}))
        elif args.action == 'run':
            run = run_study(args.output)
            print(json.dumps({key: run[key] for key in ('status', 'admittedCalls', 'knownCostUsd', 'costComplete', 'stopReasons')}))
            return 1 if run['stopReasons'] else 0
        elif args.action == 'validate':
            plan_text = (args.output / 'plan.json').read_text()
            plan = json.loads(plan_text)
            verify_current_files(plan)
            validate_run(plan, json.loads((args.output / 'run.json').read_text()), plan_text)
            print(json.dumps({'status': 'valid-finalized-provenance', 'jobs': MAX_CALLS}))
        else:
            print((args.output / 'run.json').read_text(), end='')
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(2, f'{error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
