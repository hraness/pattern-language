import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCases } from './families.mjs';

const root = dirname(fileURLToPath(import.meta.url));

// Run only reviewed sources. Process isolation bounds hangs, not malicious code.
export async function evaluate(candidatePath, family, stage = 'base', timeoutMs = 2000) {
  if (!['base', 'change'].includes(stage)) throw new Error('Stage must be base or change');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error('Timeout must be a positive integer at most 2147483647 milliseconds');
  }
  const cases = await loadCases(family);
  const candidate = resolve(candidatePath);
  const source = readFileSync(candidate);
  const results = cases.filter(test => test.stage === 'base' || stage === 'change').map(test => {
    const child = spawnSync(process.execPath, [resolve(root, 'worker.mjs'), candidate, family, test.id], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024,
      env: { PATH: process.env.PATH ?? '', LANG: 'C', TZ: 'UTC' }, cwd: root,
    });
    let result;
    if (child.error || child.status !== 0) {
      result = { id: test.id, passed: false, error: child.error?.message ??
        `Process exited ${child.status}; signal ${child.signal}; ${child.stderr.slice(0, 1000)}` };
    } else {
      const line = child.stdout.split('\n').findLast(value => value.startsWith('LIFECYCLE_RESULT '));
      try {
        result = JSON.parse(line.slice('LIFECYCLE_RESULT '.length));
        if (result.id !== test.id || typeof result.passed !== 'boolean') throw new Error('Invalid result');
      } catch {
        result = { id: test.id, passed: false, error: 'Missing or invalid child result' };
      }
    }
    return { ...result, stage: test.stage, group: test.group };
  });
  if (!source.equals(readFileSync(candidate))) {
    throw new Error('Candidate source changed during evaluation; freeze it before scoring');
  }
  const passed = results.filter(result => result.passed).length;
  return { schema: 'lifecycle-evaluation.v2', family, stage,
    entrySha256: createHash('sha256').update(source).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    timeoutMs, passed, total: results.length, allPassed: passed === results.length, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [candidate, family, stage = 'base', ...extra] = process.argv.slice(2);
    if (!candidate || !family || extra.length) throw new Error('Usage: node evaluate.mjs SOURCE.mjs mapper|retry|atomic [base|change]');
    const report = await evaluate(candidate, family, stage);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.allPassed ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
