import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cases } from './cases.mjs';

const root = dirname(fileURLToPath(import.meta.url));

export function evaluate(candidatePath, stage = 'base', timeoutMs = 2000) {
  if (!['base', 'change'].includes(stage)) throw new Error('Stage must be base or change');
  const candidate = resolve(candidatePath);
  const bytes = readFileSync(candidate);
  const selected = cases.filter(test => test.stage === 'base' || stage === 'change');
  const results = selected.map(test => {
    const child = spawnSync(process.execPath, [resolve(root, 'worker.mjs'), candidate, test.id], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024,
      // Do not inherit NODE_OPTIONS or task credentials. This is still not a sandbox.
      env: { PATH: process.env.PATH ?? '', LANG: 'C', TZ: 'UTC' },
      cwd: root,
    });
    let result;
    if (child.error || child.status !== 0) {
      result = { id: test.id, passed: false, error: child.error?.message ??
        `Process exited ${child.status}; signal ${child.signal}; ${child.stderr.slice(0, 1000)}` };
    } else {
      const line = child.stdout.split('\n').findLast(value => value.startsWith('CODE_DESIGN_RESULT '));
      try {
        result = JSON.parse(line.slice('CODE_DESIGN_RESULT '.length));
        if (result.id !== test.id || typeof result.passed !== 'boolean') throw new Error('Invalid result');
      } catch {
        result = { id: test.id, passed: false, error: 'Missing or invalid child result' };
      }
    }
    return { ...result, stage: test.stage, group: test.group };
  });
  const passed = results.filter(result => result.passed).length;
  return {
    schema: 'code-design-evaluation.v1', stage, candidate,
    entrySha256: createHash('sha256').update(bytes).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    timeoutMs, passed, total: results.length, allPassed: passed === results.length, results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [candidate, ...args] = process.argv.slice(2);
    if (!candidate || ![0, 2].includes(args.length) || (args.length && args[0] !== '--stage')) {
      throw new Error('Usage: node evaluate.mjs CANDIDATE.mjs [--stage base|change]');
    }
    const report = evaluate(candidate, args[1] ?? 'base');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`${report.stage}: ${report.passed}/${report.total} passed\n`);
    process.exitCode = report.allPassed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
