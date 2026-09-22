#!/usr/bin/env python3
"""Generate one paired, three-arm code pilot without exposing evaluator outputs.

Uses the existing Claude CLI authentication. Six calls maximum, $0.50 per call,
240 seconds each. This is an exploratory smoke comparison, not a powered study.
Does not execute generated code. Review candidates, then invoke evaluate.mjs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / 'benchmarks/code-design'
MODEL = 'claude-haiku-4-5'
SYSTEM = 'You generate correct JavaScript modules from supplied requirements. Return only the requested source code.'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(command, prompt, cwd):
    started = time.monotonic()
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, cwd=cwd, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = proc.communicate(prompt, timeout=240)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            stdout, stderr = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            stdout, stderr = proc.communicate()
    return proc.returncode, stdout, stderr, time.monotonic() - started, timed_out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='new private output directory; must not exist')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    command = ['claude', '-p', '--model', MODEL, '--safe-mode', '--tools', '',
               '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
               '--output-format', 'json', '--max-budget-usd', '0.50', '--system-prompt', SYSTEM]
    inputs = sorted(p for p in BENCH.rglob('*') if p.is_file() and 'results' not in p.parts)
    protocol = {
        'schema': 'pattern-language.code-pilot-generation.v1',
        'status': 'exploratory-single-pair-per-arm',
        'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'requestedModel': MODEL, 'samplingSeed': None,
        'cliVersion': subprocess.check_output(['claude', '--version'], text=True).strip(),
        'command': command, 'maxCalls': 6, 'maxUsdPerCall': 0.50,
        'timeoutSecondsPerCall': 240, 'retryBudget': 0,
        'armOrder': ['direct', 'checklist', 'pattern'],
        'stages': ['base', 'change'], 'tools': [], 'feedback': 'none',
        'denominatorPerStage': 3,
        'missingOrSkippedStageCountsAsFailure': True,
        'deviationsFromSixReplicatePilot': [
            'one replication rather than six',
            'fixed arm order, not balanced across repetitions',
            '240-second rather than 180-second call deadline',
            'USD budget cap; CLI exposes no enforced input/output token caps',
            'sampling seeds and immutable provider revision unavailable; record resolved modelUsage',
        ],
        'inputSha256': {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in inputs},
        'runnerSha256': digest(Path(__file__).read_bytes()),
    }
    (output / 'protocol.json').write_text(json.dumps(protocol, indent=2) + '\n')
    records = []
    # All base artifacts are frozen before any change prompt or evaluator call.
    for stage in protocol['stages']:
        for arm in protocol['armOrder']:
            prior = output / f'{arm}-base.mjs'
            if stage == 'change' and not prior.exists():
                records.append({'arm': arm, 'stage': stage, 'status': 'skipped-no-base-artifact', 'countAsFailure': True})
                continue
            prompt_command = ['node', str(BENCH / 'prompt.mjs'), arm, stage]
            if stage == 'change':
                prompt_command.append(str(prior))
            prompt = subprocess.check_output(prompt_command, text=True)
            (output / f'{arm}-{stage}.prompt.txt').write_text(prompt)
            rc, stdout, stderr, elapsed, timed_out = run(command, prompt, output)
            record = {'arm': arm, 'stage': stage, 'exitCode': rc, 'timeout': timed_out,
                      'elapsedSeconds': round(elapsed, 3), 'promptSha256': digest(prompt.encode()),
                      'status': 'failed'}
            # Local raw CLI response is private; public reports use selected metadata only.
            (output / f'{arm}-{stage}.raw.json').write_text(stdout)
            (output / f'{arm}-{stage}.stderr.txt').write_text(stderr)
            try:
                response = json.loads(stdout)
                record.update({key: response[key] for key in ['total_cost_usd', 'usage', 'modelUsage',
                               'num_turns', 'is_error', 'subtype', 'duration_api_ms'] if key in response})
                source = response.get('result', '').strip()
                if rc != 0 or timed_out or response.get('is_error') or not source:
                    raise ValueError('CLI failed or did not return source')
                if source.startswith('```') and source.endswith('```'):
                    if '\n' not in source:
                        raise ValueError('Malformed fenced source')
                    source = source.split('\n', 1)[1].rsplit('```', 1)[0].strip()
                    record['strippedOuterFence'] = True
                if not source:
                    raise ValueError('Empty source after extraction')
                source += '\n'
                candidate = output / f'{arm}-{stage}.mjs'
                candidate.write_text(source)
                record.update(status='generated-not-evaluated', candidate=candidate.name,
                              candidateSha256=digest(source.encode()))
            except (ValueError, TypeError, AttributeError) as exc:
                record['error'] = str(exc)
            records.append(record)
            (output / 'generation.json').write_text(json.dumps(records, indent=2) + '\n')
            print(f"{arm} {stage}: {record['status']} ({elapsed:.1f}s)", flush=True)
    (output / 'generation.json').write_text(json.dumps(records, indent=2) + '\n')
    print('Generation finished. Review candidates before separate evaluation.', flush=True)


if __name__ == '__main__':
    main()
