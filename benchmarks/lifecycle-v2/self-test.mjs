import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { families, loadCases } from './families.mjs';
import { evaluate } from './evaluate.mjs';

const local = path => fileURLToPath(new URL(path, import.meta.url));
const freeze = JSON.parse(readFileSync(local('./guidance/freeze.json')));
for (const [name, frozen] of Object.entries(freeze.files)) {
  const source = readFileSync(local(`./guidance/${name}`), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), frozen.sha256);
  assert.equal(source.trim().split(/\s+/).length, frozen.words);
}
for (const family of Object.keys(families)) {
  const cases = await loadCases(family);
  assert.ok(cases.length > 0 && cases.length <= 20);
  assert.equal(new Set(cases.map(test => test.id)).size, cases.length);
  assert.ok(cases.every(test => typeof test.id === 'string' && test.id.length > 0 &&
    ['base', 'change'].includes(test.stage) && typeof test.group === 'string' &&
    test.group.length > 0 && typeof test.run === 'function'));
  assert.ok(['base', 'change'].every(stage => cases.some(test => test.stage === stage)));
  const report = await evaluate(local(`./tasks/${family}/reference.mjs`), family, 'change');
  assert.equal(report.allPassed, true, JSON.stringify(report.results.filter(item => !item.passed)));
  console.log(`${family} reference: ${report.passed}/${report.total}`);
}
const mutants = {
  retry: {
    'falsy-failure': 'base.one_attempt_countercontext',
    'skip-wait': 'base.serial_attempt_and_wait',
    'overwrite-terminal': 'change.terminal_before_abort',
    'ignore-cancellation': 'change.preaborted',
    'listener-leak': 'change.cleanup_all_paths',
  },
  atomic: {
    'eager-commit': 'atomic-rollback-funding',
    'key-without-payload': 'atomic-id-conflict',
    'raw-record-equality': 'atomic-payload-semantic-equality',
    'receipt-alias': 'atomic-id-copy-boundaries',
    'replay-current-state': 'atomic-replay-original-result',
  },
};
for (const [family, entries] of Object.entries(mutants)) {
  for (const [name, target] of Object.entries(entries)) {
    const report = await evaluate(local(`./tasks/${family}/mutants/${name}.mjs`), family, 'change');
    assert.equal(report.results.find(item => item.id === target)?.passed, false, `${family}/${name} survived ${target}`);
    console.log(`${family}/${name}: killed by ${target}`);
  }
}
// Legacy mapper mutants remain covered by the existing code-design gate.
const scratch = mkdtempSync(join(tmpdir(), 'lifecycle-harness-'));
try {
  const wrong = join(scratch, 'wrong.mjs');
  writeFileSync(wrong, 'export const wrong = 1;');
  for (const timeout of [0, -1, 1.5, NaN, Infinity, '100', 2_147_483_648]) {
    await assert.rejects(() => evaluate(wrong, 'atomic', 'base', timeout), /Timeout must be/);
  }
  const report = await evaluate(wrong, 'atomic');
  assert.equal(report.passed, 0);
  assert.ok(report.results.every(test => test.error.includes('createLedger')));
  const hang = join(scratch, 'hang.mjs');
  writeFileSync(hang, 'while (true) {}');
  const timed = await evaluate(hang, 'atomic', 'base', 100);
  assert.equal(timed.passed, 0);
  assert.ok(timed.results.every(test => test.error.includes('ETIMEDOUT')));
  const changing = join(scratch, 'changing.mjs');
  writeFileSync(changing, `import { appendFileSync } from 'node:fs';
appendFileSync(new URL(import.meta.url), '// changed during evaluation\\n');
export function createLedger() { throw new Error('invalid candidate'); }
`);
  await assert.rejects(() => evaluate(changing, 'atomic'), /source changed during evaluation/);
} finally { rmSync(scratch, { recursive: true, force: true }); }
console.log('Lifecycle harness and frozen guidance: OK');
