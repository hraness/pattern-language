#!/usr/bin/env python3
"""Bounded Vercel AI Gateway application client — subprocess twin of xcb generate.

Reads a request object from stdin ({version, account, model, prompt, timeoutMs,
maxOutputBytes}), posts a single zero-tool completion to the pinned gateway
origin, and prints a result envelope on stdout with the same shape xcb emits
({version, status, requestId, account, model, text, outcome} plus usage on
completion). The API key is read from the file named by AI_GATEWAY_KEY_PATH
(defaults to the repository-local .env convention); it is never echoed to
stdout or stderr. Response text is passed through untouched; the runner treats
it as inert opaque artifact bytes.
"""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

ORIGIN = 'https://ai-gateway.vercel.sh'
FAILURE_CODES = {'invalid_request', 'unavailable', 'busy', 'deadline', 'cancelled', 'provider_error',
                 'output_limit', 'custody_unproven', 'budget_exceeded'}


def read_key(path):
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink():
            raise ValueError('Credential path contains a symlink')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        if before.st_mode & 0o077 or before.st_uid != os.getuid() or not 0 < before.st_size <= 65536:
            raise ValueError('Credential file ownership, mode, or size is invalid')
        content = os.read(descriptor, 65537).decode('utf-8')
    finally:
        os.close(descriptor)
    for line in content.splitlines():
        if line.startswith('AI_GATEWAY_API_KEY='):
            return line.split('=', 1)[1].strip()
    raise ValueError('Credential file lacks AI_GATEWAY_API_KEY')


def fail(code, request_id=None):
    print(json.dumps({'version': 1, 'status': 'failed', 'requestId': request_id or '',
                      'code': code, 'joined': True, 'effects': 'none'}))
    return 0


def main():
    request = json.loads(sys.stdin.read())
    key_path = Path(os.environ.get('AI_GATEWAY_KEY_PATH', '/Users/bg/src/mc-zero/.env'))
    try:
        key = read_key(key_path)
    except (OSError, ValueError) as error:
        return fail('unavailable')
    payload = {'model': request['model'], 'messages': [{'role': 'user', 'content': request['prompt']}],
               'max_tokens': min(request.get('maxOutputBytes', 262144) // 4, 262144)}
    body = json.dumps(payload).encode('utf-8')
    deadline_ms = request.get('timeoutMs', 300000)
    http = urllib.request.Request(f'{ORIGIN}/v1/chat/completions', data=body, method='POST', headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    request_id = ''
    try:
        with urllib.request.urlopen(http, timeout=deadline_ms / 1000 + 30) as response:
            raw = response.read().decode('utf-8')
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')[:2000]
        try:
            request_id = json.loads(detail).get('requestId', '')
        except (ValueError, AttributeError):
            pass
        code = {400: 'invalid_request', 401: 'unavailable', 402: 'budget_exceeded', 403: 'unavailable',
                404: 'unavailable', 408: 'deadline', 409: 'busy', 429: 'busy'}.get(error.code, 'provider_error')
        return fail(code, request_id)
    except (urllib.error.URLError, TimeoutError, OSError):
        return fail('deadline')
    try:
        decoded = json.loads(raw)
        choice = decoded['choices'][0]
        text = choice['message']['content']
        usage = decoded.get('usage') or {}
        request_id = decoded.get('id') or request_id
    except (ValueError, KeyError, IndexError, TypeError):
        return fail('provider_error', request_id)
    if not request_id:
        return fail('provider_error')
    if choice.get('finish_reason') not in (None, 'stop'):
        return fail('output_limit', request_id)
    print(json.dumps({'version': 1, 'status': 'completed', 'requestId': request_id,
                      'account': request['account'], 'model': request['model'], 'text': text,
                      'usage': {'cost': usage.get('cost'), 'totalTokens': usage.get('total_tokens')},
                      'outcome': {'terminal': 'completed', 'joined': True, 'effects': 'none'}}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
