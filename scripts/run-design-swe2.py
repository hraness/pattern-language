#!/usr/bin/env python3
"""Run the separately frozen SWE-2 design study through XCB's application API.

Preparation reads metadata only. Generation requires the explicit free-route
authorization flag. No retries, continuation, fallback, or candidate execution.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import time
import tomllib

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('frozen_design_runner', Path(__file__).with_name('run-design-study.py'))
ORIGINAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORIGINAL)
sha, now = ORIGINAL.sha, ORIGINAL.now
write_text, write_json = ORIGINAL.write_text, ORIGINAL.write_json
schedule, prompt_for, syntax_check = ORIGINAL.schedule, ORIGINAL.prompt_for, ORIGINAL.syntax_check
INTROS, PRIOR_LABEL = ORIGINAL.INTROS, ORIGINAL.PRIOR_LABEL
ARMS, FAMILIES, STAGES = ORIGINAL.ARMS, ORIGINAL.FAMILIES, ORIGINAL.STAGES

BENCH = 'benchmarks/design-decisions-swe2'
PARENT_PATH = 'benchmarks/design-decisions-v3/results/2026-09-22-prepared/plan.json'
PARENT_SHA256 = '3070394134b2dd9a3bc63ccb54d5346c820217accc3386ca02593f04a79cef64'
ACCOUNT = 'a_9ddef4bdeded45468148d4c6502f27c2'
MODEL = 'devin/swe-2-high'
MODEL_UID = 'swe-2-high'
XCB = '/Users/bg/.local/bin/xcb'
DEVIN = '/Users/bg/.local/bin/devin'
CREDENTIAL_PATH = Path('/Users/bg/.local/share/devin/credentials.toml')
ACCOUNT_TOKEN_PATH = Path('/Users/bg/.local/share/xcb/accounts') / ACCOUNT / 'windsurf-token'
ACCOUNT_BINDING = {'method': 'local-imported-credential-equality', 'matched': True}
COMMAND = [XCB, '--json', 'generate']
SCRIPT_PATHS = ('scripts/run-design-swe2.py', 'scripts/test_design_swe2_runner.py')
MAX_CALLS = 36
TIMEOUT_MS = 120000
MAX_INPUT_BYTES = 1048576
MAX_OUTPUT_BYTES = 262144
OUTER_TIMEOUT_SECONDS = 180
CANCELLATION_GRACE_SECONDS = 60
HEX = set('0123456789abcdef')


def valid_digest(value):
    return isinstance(value, str) and len(value) == 64 and set(value) <= HEX


def identities():
    paths = {'xcb': XCB, 'devin': DEVIN, 'node': shutil.which('node')}
    if any(not path for path in paths.values()):
        raise ValueError('Missing pinned executable')
    return {
        'cliVersions': {name: subprocess.check_output([path, '--version'], text=True, timeout=15).strip()
                        for name, path in paths.items()},
        'executablePaths': paths,
        'executableHashes': {name: hashlib.sha256(Path(path).read_bytes()).hexdigest()
                             for name, path in paths.items()},
    }


def metadata(command):
    result = subprocess.run(command, text=True, capture_output=True, timeout=30)
    if result.returncode != 0:
        raise ValueError('Metadata command failed; no generation admitted')
    return {'raw': result.stdout, 'data': json.loads(result.stdout)}


def capabilities():
    return metadata(COMMAND + ['--capabilities'])


def credential_identity(native_path=CREDENTIAL_PATH, account_path=ACCOUNT_TOKEN_PATH, environment=None):
    """Compare existing imported credentials in memory; never return serializable evidence."""
    environment = os.environ if environment is None else environment
    if environment.get('HOME') != '/Users/bg' or any(
            key == 'XCB_STATE' or key.startswith(('WINDSURF_', 'DEVIN_', 'XDG_')) for key in environment):
        raise ValueError('Credential or configuration environment overrides are not allowed')

    def read_owned(path, private):
        for ancestor in [path, *path.parents]:
            if ancestor.is_symlink():
                raise ValueError('Credential path contains a symlink')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            before = os.fstat(descriptor)
            if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                    or before.st_mode & (0o077 if private else 0o022) or not 0 < before.st_size <= 8192):
                raise ValueError('Credential file ownership, mode, or size is invalid')
            content = os.read(descriptor, 8193)
            after = os.fstat(descriptor)
            current = os.stat(path, follow_symlinks=False)
            def identity(value):
                return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_mode, value.st_uid)
            if identity(before) != identity(after) or identity(before) != identity(current):
                raise ValueError('Credential changed while being inspected')
            return content, identity(before)
        finally:
            os.close(descriptor)

    native, native_identity = read_owned(Path(native_path), False)
    token, token_identity = read_owned(Path(account_path), True)
    try:
        fields = tomllib.loads(native.decode('utf-8'))
        imported = token.decode('utf-8').strip()
    except (ValueError, UnicodeError):
        raise ValueError('Credential encoding is invalid') from None
    if (set(fields) != {'windsurf_api_key', 'api_server_url', 'devin_webapp_host', 'devin_api_url'}
            or fields['api_server_url'] != 'https://server.codeium.com'
            or fields['devin_webapp_host'] not in ('app.devin.ai', 'https://app.devin.ai')
            or fields['devin_api_url'] != 'https://api.devin.ai'
            or not isinstance(fields['windsurf_api_key'], str) or not imported
            or fields['windsurf_api_key'] != imported):
        raise ValueError('Native metadata credential does not match the selected application account')
    return (native_identity, token_identity, imported)


def catalog():
    before = credential_identity()
    result = metadata([DEVIN, 'models', 'list', '--format', 'json'])
    if before != credential_identity():
        raise ValueError('Credential identity changed during native metadata request')
    result['accountBinding'] = ACCOUNT_BINDING.copy()
    result['_credentialSnapshot'] = before
    return result


def validate_identity(identity):
    if not isinstance(identity, dict) or set(identity) != {'cliVersions', 'executablePaths', 'executableHashes'}:
        raise ValueError('Invalid executable identity record')
    for name in ('cliVersions', 'executablePaths', 'executableHashes'):
        if not isinstance(identity[name], dict) or set(identity[name]) != {'xcb', 'devin', 'node'}:
            raise ValueError('Missing executable identity')
    if any(not isinstance(v, str) or not v for v in identity['cliVersions'].values()):
        raise ValueError('Missing CLI version')
    if identity['executablePaths']['xcb'] != XCB or identity['executablePaths']['devin'] != DEVIN:
        raise ValueError('Changed application or catalog executable')
    if any(not Path(path).is_absolute() for path in identity['executablePaths'].values()):
        raise ValueError('Executable paths must be absolute')
    if any(not valid_digest(value) for value in identity['executableHashes'].values()):
        raise ValueError('Missing executable hash')


def validate_qualification(value, identity, current_ms=None):
    current_ms = time.time() * 1000 if current_ms is None else current_ms
    if (not isinstance(value, dict) or set(value) != {'runtimeVersion', 'runtimeDigest', 'evidenceDigest', 'expiresAt'}
            or not isinstance(value.get('runtimeVersion'), str)
            or 'xcb ' + value['runtimeVersion'] != identity['cliVersions']['xcb']
            or value['runtimeDigest'] != identity['executableHashes']['xcb']
            or not valid_digest(value['evidenceDigest'])
            or not isinstance(value['expiresAt'], int) or isinstance(value['expiresAt'], bool)
            or value['expiresAt'] <= current_ms):
        raise ValueError('Missing, expired, or mismatched application qualification')


def eligibility(identity, capability_record, catalog_record, current_ms=None):
    """Validate fresh read-only evidence before preparation and every admission."""
    validate_identity(identity)
    current_ms = time.time() * 1000 if current_ms is None else current_ms
    cap, listing = capability_record['data'], catalog_record['data']
    for record in (capability_record, catalog_record):
        if not isinstance(record.get('raw'), str) or json.loads(record['raw']) != record['data']:
            raise ValueError('Metadata raw bytes do not match decoded evidence')
    if (not isinstance(cap, dict) or type(cap.get('version')) is not int or cap.get('version') != 1 or cap.get('supported') is not True
            or any(cap.get(key) is not True for key in ('zeroTools', 'zeroHooks', 'ephemeral'))):
        raise ValueError('Qualified tool-free application generation unavailable')
    limits = cap.get('limits', {})
    if limits != {'maxInputBytes': MAX_INPUT_BYTES, 'maxOutputBytes': MAX_OUTPUT_BYTES,
                  'minTimeoutMs': 1000, 'maxTimeoutMs': TIMEOUT_MS}:
        raise ValueError('Changed application limits')
    accounts = [row for row in cap.get('accounts', []) if row.get('id') == ACCOUNT]
    if len(accounts) != 1:
        raise ValueError('Exact application account missing or ambiguous')
    account = accounts[0]
    if (account.get('provider') != 'devin' or account.get('available') is not True
            or any(account.get(key) is not True for key in ('enabled', 'connected', 'runtimeAdmitted'))
            or account.get('busy') is not False or account.get('reason') is not None):
        raise ValueError('Exact application account is unavailable')
    qualification = account.get('qualification')
    validate_qualification(qualification, identity, current_ms)
    models = [row for row in account.get('models', []) if row.get('key') == MODEL]
    if len(models) != 1:
        raise ValueError('Exact model not covered by application qualification')
    observed = models[0].get('observedAtMs')
    if (not isinstance(observed, int) or isinstance(observed, bool)
            or observed > current_ms or current_ms - observed >= 86400000):
        raise ValueError('Qualified model catalog is stale')
    def model_rows(value):
        if isinstance(value, dict):
            if 'model_uid' in value:
                yield value
            for child in value.values():
                yield from model_rows(child)
        elif isinstance(value, list):
            for child in value:
                yield from model_rows(child)
    selected = [row for row in model_rows(listing) if row.get('model_uid') == MODEL_UID]
    if len(selected) != 1 or selected[0].get('cost_tier') != 'Free':
        raise ValueError('Exact native model no longer has catalog Free status')
    if catalog_record.get('accountBinding') != ACCOUNT_BINDING:
        raise ValueError('Native catalog lacks exact imported-account binding')
    return {'checkedAt': now(), 'capabilitiesSha256': sha(capability_record['raw']),
            'catalogSha256': sha(catalog_record['raw']), 'account': ACCOUNT, 'model': MODEL,
            'catalogModelUid': MODEL_UID, 'catalogCostTier': 'Free',
            'qualification': qualification, 'modelObservedAtMs': observed, 'accountBinding': ACCOUNT_BINDING.copy()}


def validate_admission_evidence(value, identity, qualification, admitted_ms):
    """Validate public receipt structure without pretending hashes reveal raw metadata."""
    fields = {'checkedAt', 'capabilitiesSha256', 'catalogSha256', 'account', 'model', 'catalogModelUid',
              'catalogCostTier', 'qualification', 'modelObservedAtMs', 'accountBinding'}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError('Invalid admission evidence fields')
    try:
        checked_ms = datetime.strptime(value['checkedAt'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() * 1000
    except (ValueError, TypeError):
        raise ValueError('Invalid metadata check timestamp') from None
    if (value['account'] != ACCOUNT or value['model'] != MODEL or value['catalogModelUid'] != MODEL_UID
            or value['catalogCostTier'] != 'Free' or value['accountBinding'] != ACCOUNT_BINDING
            or not valid_digest(value['capabilitiesSha256']) or not valid_digest(value['catalogSha256'])
            or value['qualification'] != qualification or not 0 <= admitted_ms - checked_ms <= 30000
            or not isinstance(value['modelObservedAtMs'], int) or isinstance(value['modelObservedAtMs'], bool)
            or not -999 <= checked_ms - value['modelObservedAtMs'] < 86400000):
        raise ValueError('Invalid or stale admission evidence')
    validate_qualification(qualification, identity, admitted_ms)


def protocol_for(identity, qualification):
    validate_identity(identity)
    return {
        'maxCalls': MAX_CALLS, 'concurrency': 1, 'timeoutMs': TIMEOUT_MS,
        'maxInputBytes': MAX_INPUT_BYTES, 'maxOutputBytes': MAX_OUTPUT_BYTES,
        'outerTimeoutSeconds': OUTER_TIMEOUT_SECONDS, 'cancellationGraceSeconds': CANCELLATION_GRACE_SECONDS,
        'retryBudget': 0, 'requestedAccount': ACCOUNT, 'requestedModel': MODEL, 'command': COMMAND,
        **identity, 'qualification': qualification, 'systemPrompt': None,
        'promptIntros': INTROS, 'priorDesignLabel': PRIOR_LABEL,
        'repetitions': 3, 'families': list(FAMILIES), 'arms': list(ARMS), 'stages': list(STAGES),
        'tools': [], 'hooks': [], 'ephemeral': True, 'feedback': 'none',
        'schedule': 'Original 36-job order, serial admission; all design before all code.',
        'denominator': 36, 'pairDenominator': 18, 'denominatorPerFamilyArmStage': 3,
        'pairDenominatorPerFamilyArm': 3, 'missingOrSkippedCountsAsFailure': True,
        'designForwarding': 'Exact resultText, including malformed artifacts; no validation feedback.',
        'catalogCommand': [DEVIN, 'models', 'list', '--format', 'json'],
        'catalogAccountBinding': ACCOUNT_BINDING,
        'requiredCatalogCostTier': 'Free', 'costReporting': 'not-reported', 'enforcedUsdBudget': None,
        'samplingSeed': None, 'immutableProviderRevision': None,
        'limitations': [
            'Native catalog Free status is checked before each request; XCB has no spending-cap field.',
            'XCB reports no token usage, monetary cost, or immutable provider model revision.',
            'Selected account/model identity is XCB routing evidence, not independently reported model identity.',
            'XCB supplies its application system context; the original Claude system message is not sent separately.',
            'Serial admission and the provider differ from the unrun Claude plan.',
            'No runner retries; provider-internal inference or transport retries are not observable.',
            'Three exploratory repetitions per cell do not establish general effectiveness.',
        ],
    }


def parent_plan(root):
    path = root / PARENT_PATH
    if path.is_symlink() or sha(path.read_bytes().decode('utf-8')) != PARENT_SHA256:
        raise ValueError('Original prepared plan differs from its immutable hash')
    plan = json.loads(path.read_text())
    ORIGINAL.validate_plan(plan)
    ORIGINAL.verify_current_files(plan, root)
    return plan


def frozen_paths(root):
    parent = parent_plan(root)
    paths = set(parent['files']) | {PARENT_PATH} | set(SCRIPT_PATHS)
    folder = root / BENCH
    for path in folder.rglob('*'):
        relative = path.relative_to(folder)
        if 'results' in relative.parts or relative == Path('README.md'):
            continue
        if path.is_symlink():
            raise ValueError(f'Cannot freeze symlink: {path}')
        if path.is_file():
            paths.add(str(path.relative_to(root)))
    for path in [*SCRIPT_PATHS, *(f'{BENCH}/{name}' for name in ('protocol.md', 'score.mjs', 'test-score.mjs'))]:
        if path not in paths or (root / path).is_symlink() or not (root / path).is_file():
            raise ValueError(f'Missing or symlinked adapter dependency: {path}')
    return sorted(paths)


def validate_plan(plan):
    if (plan.get('schema') != 'pattern-language.design-swe2-plan.v1' or plan.get('jobs') != schedule()
            or plan.get('parentPlan') != {'path': PARENT_PATH, 'sha256': PARENT_SHA256}):
        raise ValueError('Changed plan schema, parent, or 36-job schedule')
    protocol = plan.get('protocol', {})
    identity = {key: protocol.get(key) for key in ('cliVersions', 'executablePaths', 'executableHashes')}
    if protocol != protocol_for(identity, protocol.get('qualification')):
        raise ValueError('Changed protocol, routing, command, or limits')
    try:
        prepared_ms = datetime.strptime(plan['preparedAt'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() * 1000
    except (ValueError, KeyError, TypeError):
        raise ValueError('Invalid preparation timestamp') from None
    validate_qualification(protocol['qualification'], identity, prepared_ms)
    files = plan.get('files')
    if not isinstance(files, dict) or PARENT_PATH not in files:
        raise ValueError('Missing immutable parent plan')
    parent = files[PARENT_PATH]
    if parent.get('sha256') != PARENT_SHA256 or sha(parent.get('text', '')) != PARENT_SHA256:
        raise ValueError('Changed embedded parent plan')
    original = json.loads(parent['text'])
    ORIGINAL.validate_plan(original)
    if any(files.get(path) != value for path, value in original['files'].items()):
        raise ValueError('Changed or missing original frozen input')
    required = set(original['files']) | {PARENT_PATH} | set(SCRIPT_PATHS)
    required |= {f'{BENCH}/{name}' for name in ('protocol.md', 'score.mjs', 'test-score.mjs')}
    if not required <= set(files):
        raise ValueError('Missing frozen adapter dependency')
    for path, file in files.items():
        permitted = path in required or (path.startswith(BENCH + '/') and 'results' not in Path(path).parts
                                         and path != BENCH + '/README.md')
        if (not permitted or Path(path).is_absolute() or '..' in Path(path).parts
                or not isinstance(file, dict) or not isinstance(file.get('text'), str)
                or sha(file['text']) != file.get('sha256')):
            raise ValueError(f'Invalid frozen file: {path}')


def verify_current_files(plan, root):
    if frozen_paths(root) != sorted(plan['files']):
        raise ValueError('Frozen input closure differs from current tree')
    for path, frozen in plan['files'].items():
        if (root / path).is_symlink() or sha((root / path).read_bytes().decode('utf-8')) != frozen['sha256']:
            raise ValueError(f'Frozen input changed: {path}')


def read_eligibility(identity, capability_reader, catalog_reader, directory=None):
    cap, listing = capability_reader(), catalog_reader()
    if directory is not None:
        write_text(directory / 'capabilities.json', cap['raw'])
        write_text(directory / 'catalog.json', listing['raw'])
    ready = eligibility(identity, cap, listing)
    if '_credentialSnapshot' in listing and listing['_credentialSnapshot'] != credential_identity():
        raise ValueError('Credential identity changed before application admission')
    return ready


def prepare(output, root=ROOT, version_reader=identities, capability_reader=capabilities, catalog_reader=catalog):
    output, root = ORIGINAL.private_output(output, root)
    paths = frozen_paths(root)
    identity = version_reader()
    cap, listing = capability_reader(), catalog_reader()
    admitted = eligibility(identity, cap, listing)
    files = {}
    for path in paths:
        content = (root / path).read_bytes().decode('utf-8')
        files[path] = {'text': content, 'sha256': sha(content)}
    plan = {'schema': 'pattern-language.design-swe2-plan.v1', 'preparedAt': now(),
            'parentPlan': {'path': PARENT_PATH, 'sha256': PARENT_SHA256},
            'protocol': protocol_for(identity, admitted['qualification']), 'files': files, 'jobs': schedule()}
    validate_plan(plan)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    write_json(output / 'plan.json', plan)
    write_json(output / 'preparation-eligibility.json', admitted)
    write_text(output / 'preparation-capabilities.json', cap['raw'])
    write_text(output / 'preparation-catalog.json', listing['raw'])
    return plan


def request_for(prompt):
    request = {'version': 1, 'account': ACCOUNT, 'model': MODEL, 'prompt': prompt,
               'timeoutMs': TIMEOUT_MS, 'maxOutputBytes': MAX_OUTPUT_BYTES}
    encoded = json.dumps(request, ensure_ascii=False)
    if not prompt or '\x00' in prompt or len(encoded.encode('utf-8')) > MAX_INPUT_BYTES:
        raise ValueError('Prompt violates application input bounds')
    return request


def invoke(command, request, cwd, timeout=OUTER_TIMEOUT_SECONDS):
    """Cancel only the XCB root; never kill its custody-owning process group."""
    started = time.monotonic()
    joining, launching, cancel_received = False, True, False
    def cancel_requested(signum, frame):
        nonlocal cancel_received
        cancel_received = True
        if launching:
            return
        if not joining:
            raise KeyboardInterrupt
    previous = {signum: signal.signal(signum, cancel_requested) for signum in (signal.SIGINT, signal.SIGTERM)}
    timed_out, uncertain, cancelled, collection_error = False, False, False, False
    process = None
    try:
        try:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, cwd=cwd)
            custody = {'pid': process.pid, 'startedAt': now(), 'state': 'running'}
            launching = False
            if cancel_received:
                raise KeyboardInterrupt
            write_json(cwd / 'process.json', custody)
            stdout, stderr = process.communicate(json.dumps(request, ensure_ascii=False), timeout=timeout)
            joining = True
        except (Exception, KeyboardInterrupt) as reason:
            if process is None:
                raise
            timed_out = isinstance(reason, subprocess.TimeoutExpired)
            cancelled = isinstance(reason, KeyboardInterrupt)
            collection_error = not timed_out and not cancelled
            joining = True
            try:
                process.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                stdout, stderr = process.communicate(timeout=CANCELLATION_GRACE_SECONDS)
            except subprocess.TimeoutExpired as error:
                uncertain = True
                def decoded(value):
                    return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else value or ''
                stdout, stderr = decoded(error.output), decoded(error.stderr)
            except Exception:
                uncertain = True
                stdout, stderr = '', ''
        custody.update(state='uncertain' if uncertain else 'root-exited', finishedAt=now(),
                       exitCode=process.returncode, cancellationRequested=timed_out or cancelled or collection_error)
        joining = True
        try:
            write_json(cwd / 'process.json', custody)
        except OSError:
            collection_error = True
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    return {'exitCode': process.returncode, 'stdout': stdout, 'stderr': stderr,
            'timeout': timed_out, 'cancelled': cancelled or cancel_received, 'custodyUncertain': uncertain, 'pid': process.pid,
            'collectionError': collection_error,
            'elapsedSeconds': round(time.monotonic() - started, 3)}


def decode_response(raw, stage, checker=syntax_check):
    record = {key: raw.get(key) for key in ('exitCode', 'timeout', 'elapsedSeconds')}
    record.update(status='failed-generation', countAsFailure=True, costUsd=None, costStatus='not-reported')
    if raw.get('cancelled') and not raw.get('custodyUncertain'):
        record['failureReason'] = 'runner-cancelled'
        return record, ['runner-cancelled']
    if raw.get('custodyUncertain'):
        record.update(failureReason='xcb-custody-uncertain', custodyUncertain=True, pid=raw.get('pid'))
        return record, ['xcb-custody-uncertain']
    if raw.get('collectionError'):
        record['failureReason'] = 'local-collection-failed'
        return record, ['local-collection-failed']
    try:
        response = json.loads(raw['stdout'])
    except (ValueError, TypeError):
        record['failureReason'] = 'invalid-application-json'
        return record, ['invalid-application-json']
    success_keys = {'version', 'status', 'requestId', 'account', 'model', 'text', 'outcome'}
    valid = (isinstance(response, dict) and set(response) == success_keys and type(response.get('version')) is int and response.get('version') == 1
             and response.get('status') == 'completed' and isinstance(response.get('requestId'), str)
             and bool(response['requestId']) and response.get('account') == ACCOUNT and response.get('model') == MODEL
             and response.get('outcome') == {'terminal': 'completed', 'joined': True, 'effects': 'none'}
             and response['outcome']['joined'] is True
             and isinstance(response.get('text'), str) and len(response['text'].encode('utf-8')) <= MAX_OUTPUT_BYTES
             and raw.get('exitCode') == 0 and raw.get('timeout') is False)
    if not valid:
        record['failureReason'] = 'application-protocol-or-provider-failure'
        failure_codes = {'invalid_request', 'unavailable', 'busy', 'deadline', 'cancelled', 'provider_error', 'output_limit', 'custody_unproven'}
        if (isinstance(response, dict) and response.get('status') == 'failed'
                and isinstance(response.get('code'), str) and response['code'] in failure_codes):
            record['applicationFailureCode'] = response['code']
        return record, ['application-protocol-or-provider-failure']
    record['providerEnvelope'] = {key: response[key] for key in success_keys - {'text'}}
    record['provider'] = {'account': ACCOUNT, 'model': MODEL, 'reportedModelRevision': None, 'usage': None}
    text = response['text']
    record['resultText'] = text
    if stage == 'design':
        record.update(designText=text, designSha256=sha(text))
    if not text.strip():
        record['failureReason'] = 'empty-result'
        return record, []
    if stage == 'code':
        source = text.strip()
        if source.startswith('```') and source.endswith('```') and '\n' in source:
            source = source.split('\n', 1)[1].rsplit('```', 1)[0].strip()
            record['strippedOuterFence'] = True
        source += '\n'
        try:
            valid_source = checker(source)
        except (OSError, subprocess.SubprocessError):
            record['failureReason'] = 'local-syntax-check-unavailable'
            return record, ['local-syntax-check-unavailable']
        if not valid_source:
            record['failureReason'] = 'result-not-parseable-module'
            return record, []
        record.update(source=source, sourceSha256=sha(source))
    record.update(status='generated-not-reviewed', countAsFailure=False)
    return record, []


def run_study(output, provider=invoke, checker=syntax_check, version_reader=identities,
              capability_reader=capabilities, catalog_reader=catalog, root=ROOT):
    output, root = ORIGINAL.private_output(output, root)
    if output.stat().st_mode & 0o077:
        raise ValueError('Run directory must be private (mode 0700)')
    plan_text = (output / 'plan.json').read_bytes().decode('utf-8')
    plan = json.loads(plan_text)
    validate_plan(plan)
    verify_current_files(plan, root)
    expected_identity = {key: plan['protocol'][key] for key in ('cliVersions', 'executablePaths', 'executableHashes')}
    if version_reader() != expected_identity:
        raise ValueError('Executable versions, paths, or hashes changed after preparation')
    with open(output / 'started.json', 'x') as handle:
        os.chmod(output / 'started.json', 0o600)
        json.dump({'startedAt': now(), 'planSha256': sha(plan_text)}, handle)
    for name in ('raw', 'designs', 'candidates'):
        (output / name).mkdir(mode=0o700)
    run = {'schema': 'pattern-language.design-swe2-generation.v1', 'planSha256': sha(plan_text),
           'status': 'running', 'startedAt': now(), 'calls': [], 'admittedCalls': 0,
           'knownCostUsd': 0, 'costComplete': True, 'costStatus': 'not-reported', 'stopReasons': [],
           **expected_identity, 'denominator': 36, 'pairDenominator': 18,
           'sourceReviewRequired': True, 'evaluationStatus': 'not-run'}
    write_json(output / 'run.json', run)
    completed, request_ids = {}, set()
    for job in plan['jobs']:
        if run['stopReasons']:
            break
        prior = completed.get(job['id'].removesuffix('-code') + '-design')
        prior_text = prior.get('designText') if prior else None
        if job['stage'] == 'code' and (not isinstance(prior_text, str) or not prior_text.strip()):
            record = {**job, 'admitted': False, 'status': 'skipped-no-design-text', 'countAsFailure': True,
                      'costUsd': 0, 'costStatus': 'not-incurred'}
            run['calls'].append(record)
            completed[job['id']] = record
            write_json(output / 'run.json', run)
            continue
        raw_dir = output / 'raw' / job['id']
        raw_dir.mkdir(mode=0o700)
        try:
            if version_reader() != expected_identity:
                raise ValueError('Executable identity changed before admission')
            ready = read_eligibility(expected_identity, capability_reader, catalog_reader, raw_dir)
            if ready['qualification'] != plan['protocol']['qualification']:
                raise ValueError('Application qualification changed after preparation')
            prompt, paths = prompt_for(plan, job, prior_text if job['stage'] == 'code' else None)
            request = request_for(prompt)
            admitted_at = now()
            admitted_ms = datetime.strptime(admitted_at, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() * 1000
            validate_admission_evidence(ready, expected_identity, plan['protocol']['qualification'], admitted_ms)
        except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
            run['stopReasons'].append('pre-admission-eligibility-failed')
            write_text(raw_dir / 'pre-admission-error.txt', f'{type(error).__name__}: {error}')
            break
        record = {**job, 'admitted': True, 'status': 'admitted-awaiting-response', 'admittedAt': admitted_at,
                  'countAsFailure': True, 'costUsd': None, 'costStatus': 'not-reported',
                  'prompt': prompt, 'promptSha256': sha(prompt), 'promptFiles': paths,
                  'priorDesignSha256': prior['designSha256'] if job['stage'] == 'code' else None,
                  'eligibility': ready}
        run['calls'].append(record)
        run['admittedCalls'] += 1
        run['costComplete'] = False
        write_json(output / 'run.json', run)
        try:
            raw = provider(COMMAND[:], request, raw_dir, OUTER_TIMEOUT_SECONDS)
        except Exception as error:
            raw = {'exitCode': None, 'timeout': False, 'elapsedSeconds': 0,
                   'stdout': '', 'stderr': f'{type(error).__name__}: {error}', 'custodyUncertain': True}
        write_text(raw_dir / 'stdout.txt', raw['stdout'])
        write_text(raw_dir / 'stderr.txt', raw['stderr'])
        result, stops = decode_response(raw, job['stage'], checker)
        request_id = result.get('providerEnvelope', {}).get('requestId')
        if request_id in request_ids:
            # Preserve the exact duplicate response privately, without exporting
            # it as another successful provider request or forwarding its text.
            result = {key: raw.get(key) for key in ('exitCode', 'timeout', 'elapsedSeconds')}
            result.update(status='failed-generation', countAsFailure=True, costUsd=None,
                          costStatus='not-reported', failureReason='duplicate-application-request-id')
            stops = sorted(set(stops + ['duplicate-application-request-id']))
        elif request_id is not None:
            request_ids.add(request_id)
        record.update(result)
        record['finishedAt'] = now()
        completed[job['id']] = record
        run['stopReasons'] = sorted(set(run['stopReasons'] + stops))
        for field, folder, extension in (('designText', 'designs', 'txt'), ('source', 'candidates', 'mjs')):
            if field in record:
                relative = f'{folder}/{job["id"]}.{extension}'
                record['designCandidate' if field == 'designText' else 'candidate'] = relative
                write_text(output / relative, record[field])
        write_json(output / 'run.json', run)
    recorded = {call['id'] for call in run['calls']}
    for job in plan['jobs']:
        if job['id'] not in recorded:
            run['calls'].append({**job, 'admitted': False, 'status': 'not-admitted-study-stopped',
                                 'countAsFailure': True, 'costUsd': 0, 'costStatus': 'not-incurred'})
    order = {job['id']: index for index, job in enumerate(plan['jobs'])}
    run['calls'].sort(key=lambda call: order[call['id']])
    run['status'] = 'partial-reconciliation-required' if run['stopReasons'] else 'generation-complete-awaiting-review'
    run['finishedAt'] = now()
    write_json(output / 'run.json', run)
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('prepare', 'run', 'report'):
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
        else:
            print((args.output / 'run.json').read_text(), end='')
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(2, f'{error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
