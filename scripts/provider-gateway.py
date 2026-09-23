#!/usr/bin/env python3
"""Vercel AI Gateway application provider — bounded-spend route for frozen studies.

Implements the same provider surface the study runners consume, backed by one
pinned HTTPS origin instead of xcb. The credential is a local .env key read
through the same owned-file discipline; it is never serialized into plans,
runs, or envelopes. Per-request spend comes from the gateway's usage.cost and
is enforced against USD_BUDGET in the run loop (stop reason usd-budget-exceeded).
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('provider_base', Path(__file__).with_name('run-design-swe2.py'))
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
ORIGINAL = BASE.ORIGINAL
sha, now = BASE.sha, BASE.now
write_text, write_json = BASE.write_text, BASE.write_json
valid_digest, invoke = BASE.valid_digest, BASE.invoke
private_output = BASE.ORIGINAL.private_output

PROVIDER_NAME = 'vercel-ai-gateway'
ORIGIN = 'https://ai-gateway.vercel.sh'
GATEWAY_CLIENT = str(ROOT / 'scripts' / 'gateway-client.py')
ACCOUNT = 'vercel-ai-gateway/local-key'
ACCOUNT_TOKEN_PATH = Path('/Users/bg/src/mc-zero/.env')
CREDENTIAL_PATH = ACCOUNT_TOKEN_PATH
ACCOUNT_BINDING = {'method': 'local-env-credential-presence', 'matched': True}
MODEL = 'anthropic/claude-sonnet-4.6'
MODEL_UID = 'anthropic/claude-sonnet-4.6'
COMMAND = [shutil.which('python3') or '/usr/bin/python3', GATEWAY_CLIENT]
CATALOG_COMMAND = ['GET', f'{ORIGIN}/v1/models']
EXTRA_FROZEN_PATHS = ('scripts/gateway-client.py', 'scripts/test_village_gateway.py')
MAX_CALLS = 36
TIMEOUT_MS = 300000
MAX_INPUT_BYTES = 1048576
MAX_OUTPUT_BYTES = 262144
OUTER_TIMEOUT_SECONDS = 360
CANCELLATION_GRACE_SECONDS = 30
QUALIFICATION_TTL_MS = 21600000
REPORTS_COST = True
USD_BUDGET = 10.00
COST_TIER = 'Paid'
ENVELOPE_KEYS = {'version', 'status', 'requestId', 'account', 'model', 'outcome', 'usage'}
OUTCOME = {'terminal': 'completed', 'joined': True, 'effects': 'none'}


def _python():
    path = shutil.which('python3')
    if not path:
        raise ValueError('Missing pinned executable')
    return path


def identities():
    path = _python()
    return {
        'cliVersions': {'python3': subprocess.check_output([path, '--version'], text=True, timeout=15).strip()},
        'executablePaths': {'python3': path},
        'executableHashes': {'python3': hashlib.sha256(Path(path).read_bytes()).hexdigest()},
    }


def validate_identity(identity):
    if not isinstance(identity, dict) or set(identity) != {'cliVersions', 'executablePaths', 'executableHashes'}:
        raise ValueError('Invalid executable identity record')
    for name in ('cliVersions', 'executablePaths', 'executableHashes'):
        if not isinstance(identity[name], dict) or set(identity[name]) != {'python3'}:
            raise ValueError('Missing executable identity')
    if not isinstance(identity['cliVersions']['python3'], str) or not identity['cliVersions']['python3']:
        raise ValueError('Missing CLI version')
    if not Path(identity['executablePaths']['python3']).is_absolute():
        raise ValueError('Executable paths must be absolute')
    if not valid_digest(identity['executableHashes']['python3']):
        raise ValueError('Missing executable hash')


def _read_key(path=ACCOUNT_TOKEN_PATH):
    """Owned-file key read; returns key material only, never a serializable record."""
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink():
            raise ValueError('Credential path contains a symlink')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or before.st_mode & 0o077 or not 0 < before.st_size <= 65536):
            raise ValueError('Credential file ownership, mode, or size is invalid')
        content = os.read(descriptor, 65537)
        after = os.fstat(descriptor)
        current = os.stat(path, follow_symlinks=False)
        def identity(value):
            return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns,
                    value.st_mode, value.st_uid)
        if identity(before) != identity(after) or identity(before) != identity(current):
            raise ValueError('Credential changed while being inspected')
    finally:
        os.close(descriptor)
    for line in content.decode('utf-8').splitlines():
        if line.startswith('AI_GATEWAY_API_KEY='):
            key = line.split('=', 1)[1].strip()
            if key.startswith('vck_'):
                return key, identity(before)
    raise ValueError('Credential file lacks a vck_ gateway key')


def credential_identity(environment=None):
    """Bound to the local .env credential file's identity; never returns key material."""
    environment = os.environ if environment is None else environment
    if environment.get('HOME') != '/Users/bg' or any(
            key == 'AI_GATEWAY_KEY_PATH' for key in environment):
        raise ValueError('Credential or configuration environment overrides are not allowed')
    _key, file_identity = _read_key()
    return (file_identity,)


def _request(path, key, timeout=20):
    http = urllib.request.Request(f'{ORIGIN}{path}', headers={'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(http, timeout=timeout) as response:
        return response.read().decode('utf-8')


STATE_DIR = Path('/Users/bg/.local/share/pattern-language/village-gateway')
QUALIFICATION_MARGIN_MS = 1800000


def capabilities():
    """Live probe: the gateway answers /v1/models and the account key is valid.

    The qualification is a stored receipt minted when the route is live-verified
    and reused while unexpired — the plan binds it, so it must stay byte-stable
    within a run (mirrors xcb's stored grant)."""
    key, _identity = _read_key()
    raw = _request('/v1/models', key)
    data = json.loads(raw)
    present = any(model.get('id') == MODEL for model in data.get('data', []))
    record = {'version': 1, 'supported': True, 'zeroTools': True, 'zeroHooks': True, 'ephemeral': True,
              'limits': {'maxInputBytes': MAX_INPUT_BYTES, 'maxOutputBytes': MAX_OUTPUT_BYTES,
                         'minTimeoutMs': 1000, 'maxTimeoutMs': TIMEOUT_MS},
              'accounts': [{'id': ACCOUNT, 'provider': PROVIDER_NAME, 'label': 'local gateway key',
                            'enabled': True, 'busy': False, 'connected': True, 'runtimeAdmitted': True,
                            'available': present, 'reason': None if present else 'model_unlisted',
                            'qualification': qualification_for(raw), 'models': [
                                {'key': MODEL, 'observedAtMs': int(time.time() * 1000)}] if present else []}]}
    return {'raw': json.dumps(record), 'data': record}


def _runtime_digest():
    """Provider-module digest — the qualified route's code identity."""
    return sha(Path(__file__).read_bytes().decode('utf-8'))


def qualification_for(models_raw=None):
    """Mint-or-reuse the stored qualification receipt; stable within its TTL.

    runtimeDigest binds the provider module's own bytes — the route's code
    identity. Replays validate it against the plan's frozen file text, not the
    live file, so past runs stay verifiable after later provider edits."""
    if models_raw is None:
        key, _identity = _read_key()
        models_raw = _request('/v1/models', key)
    path = STATE_DIR / 'qualification.json'
    now_ms = int(time.time() * 1000)
    try:
        stored = json.loads(path.read_bytes().decode('utf-8'))
        if (isinstance(stored, dict)
                and stored.get('runtimeVersion') == 'vercel-ai-gateway'
                and stored.get('runtimeDigest') == _runtime_digest()
                and type(stored.get('expiresAt')) is int
                and stored['expiresAt'] - now_ms > QUALIFICATION_MARGIN_MS
                and valid_digest(stored.get('evidenceDigest'))):
            return stored
    except (OSError, ValueError):
        pass
    receipt = {'runtimeVersion': 'vercel-ai-gateway', 'runtimeDigest': _runtime_digest(),
               'evidenceDigest': sha(models_raw), 'expiresAt': now_ms + QUALIFICATION_TTL_MS}
    try:
        STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        write_json(path, receipt)
        os.chmod(path, 0o600)
    except OSError:
        pass
    return receipt


def catalog():
    before = credential_identity()
    key, _identity = _read_key()
    raw = _request('/v1/models', key)
    if before != credential_identity():
        raise ValueError('Credential identity changed during native metadata request')
    return {'raw': raw, 'data': json.loads(raw), 'accountBinding': ACCOUNT_BINDING.copy(),
            '_credentialSnapshot': before}


def validate_qualification(value, identity, current_ms=None):
    current_ms = time.time() * 1000 if current_ms is None else current_ms
    if (not isinstance(value, dict) or set(value) != {'runtimeVersion', 'runtimeDigest', 'evidenceDigest', 'expiresAt'}
            or value.get('runtimeVersion') != 'vercel-ai-gateway'
            or not valid_digest(value.get('runtimeDigest'))
            or not valid_digest(value.get('evidenceDigest'))
            or not isinstance(value.get('expiresAt'), int) or isinstance(value['expiresAt'], bool)
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
    if (not isinstance(cap, dict) or type(cap.get('version')) is not int or cap.get('version') != 1
            or cap.get('supported') is not True
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
    if (account.get('provider') != PROVIDER_NAME or account.get('available') is not True
            or any(account.get(key) is not True for key in ('enabled', 'connected', 'runtimeAdmitted'))
            or account.get('busy') is not False or account.get('reason') is not None):
        raise ValueError('Exact application account is unavailable')
    qualification = account.get('qualification')
    validate_qualification(qualification, identity, current_ms)
    if qualification.get('runtimeDigest') != _runtime_digest():
        raise ValueError('Qualified route differs from the current provider module')
    models = [row for row in account.get('models', []) if row.get('key') == MODEL]
    if len(models) != 1:
        raise ValueError('Exact model not covered by application qualification')
    observed = models[0].get('observedAtMs')
    if (not isinstance(observed, int) or isinstance(observed, bool)
            or observed > current_ms or current_ms - observed >= 86400000):
        raise ValueError('Qualified model catalog is stale')
    selected = [row for row in listing.get('data', []) if row.get('id') == MODEL_UID]
    if len(selected) != 1 or selected[0].get('pricing') is None:
        raise ValueError('Exact gateway model missing or unpriced in catalog')
    if catalog_record.get('accountBinding') != ACCOUNT_BINDING:
        raise ValueError('Catalog lacks exact credential binding')
    return {'checkedAt': now(), 'capabilitiesSha256': sha(capability_record['raw']),
            'catalogSha256': sha(catalog_record['raw']), 'account': ACCOUNT, 'model': MODEL,
            'catalogModelUid': MODEL_UID, 'catalogCostTier': COST_TIER,
            'qualification': qualification, 'modelObservedAtMs': observed, 'accountBinding': ACCOUNT_BINDING.copy()}


def validate_admission_evidence(value, identity, qualification, admitted_ms):
    """Validate public receipt structure without pretending hashes reveal raw metadata."""
    from datetime import datetime, timezone
    fields = {'checkedAt', 'capabilitiesSha256', 'catalogSha256', 'account', 'model', 'catalogModelUid',
              'catalogCostTier', 'qualification', 'modelObservedAtMs', 'accountBinding'}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError('Invalid admission evidence fields')
    try:
        checked_ms = datetime.strptime(value['checkedAt'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() * 1000
    except (ValueError, TypeError):
        raise ValueError('Invalid metadata check timestamp') from None
    if (value['account'] != ACCOUNT or value['model'] != MODEL or value['catalogModelUid'] != MODEL_UID
            or value['catalogCostTier'] != COST_TIER or value['accountBinding'] != ACCOUNT_BINDING
            or not valid_digest(value['capabilitiesSha256']) or not valid_digest(value['catalogSha256'])
            or value['qualification'] != qualification or not 0 <= admitted_ms - checked_ms <= 30000
            or not isinstance(value['modelObservedAtMs'], int) or isinstance(value['modelObservedAtMs'], bool)
            or not -999 <= checked_ms - value['modelObservedAtMs'] < 86400000):
        raise ValueError('Invalid or stale admission evidence')
    validate_qualification(qualification, identity, admitted_ms)


def read_eligibility(identity, capability_reader, catalog_reader, directory=None):
    cap, listing = capability_reader(), catalog_reader()
    if directory is not None:
        write_text(directory / 'capabilities.json', cap['raw'])
        write_text(directory / 'catalog.json', listing['raw'])
    ready = eligibility(identity, cap, listing)
    if '_credentialSnapshot' in listing and listing['_credentialSnapshot'] != credential_identity():
        raise ValueError('Credential identity changed before application admission')
    return ready


def request_for(prompt):
    request = {'version': 1, 'account': ACCOUNT, 'model': MODEL, 'prompt': prompt,
               'timeoutMs': TIMEOUT_MS, 'maxOutputBytes': MAX_OUTPUT_BYTES}
    encoded = json.dumps(request, ensure_ascii=False)
    if not prompt or '\x00' in prompt or len(encoded.encode('utf-8')) > MAX_INPUT_BYTES:
        raise ValueError('Prompt violates application input bounds')
    return request


def decode_response(raw, stage, checker=None):
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
    success_keys = ENVELOPE_KEYS | {'text'}
    valid = (isinstance(response, dict) and set(response) == success_keys
             and type(response.get('version')) is int and response.get('version') == 1
             and response.get('status') == 'completed' and isinstance(response.get('requestId'), str)
             and bool(response['requestId']) and response.get('account') == ACCOUNT
             and response.get('model') == MODEL and response.get('outcome') == OUTCOME
             and response['outcome']['joined'] is True
             and isinstance(response.get('text'), str)
             and len(response['text'].encode('utf-8')) <= MAX_OUTPUT_BYTES
             and isinstance(response.get('usage'), dict)
             and raw.get('exitCode') == 0 and raw.get('timeout') is False)
    if not valid:
        record['failureReason'] = 'application-protocol-or-provider-failure'
        failure_codes = {'invalid_request', 'unavailable', 'busy', 'deadline', 'cancelled', 'provider_error',
                         'output_limit', 'custody_unproven', 'budget_exceeded'}
        if (isinstance(response, dict) and response.get('status') == 'failed'
                and isinstance(response.get('code'), str) and response['code'] in failure_codes):
            record['applicationFailureCode'] = response['code']
            if response['code'] == 'budget_exceeded':
                record['failureReason'] = 'usd-budget-exceeded'
                return record, ['usd-budget-exceeded']
        return record, ['application-protocol-or-provider-failure']
    record['providerEnvelope'] = {key: response[key] for key in ENVELOPE_KEYS}
    usage = response.get('usage') or {}
    cost = usage.get('cost')
    record['provider'] = {'account': ACCOUNT, 'model': MODEL, 'reportedModelRevision': None, 'usage': usage}
    if isinstance(cost, (int, float)) and not isinstance(cost, bool):
        record['costUsd'], record['costStatus'] = float(cost), 'reported'
    record['resultText'] = response['text']
    if not record['resultText'].strip():
        record['failureReason'] = 'empty-result'
        return record, []
    record.update(status='generated-not-reviewed', countAsFailure=False)
    return record, []
