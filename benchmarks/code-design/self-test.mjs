import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate } from './evaluate.mjs';

const candidate = name => fileURLToPath(new URL(`./fixtures/${name}.mjs`, import.meta.url));
for (const arm of ['direct', 'checklist', 'pattern']) {
  const words = readFileSync(new URL(`./prompts/${arm}.md`, import.meta.url), 'utf8').trim().split(/\s+/).length;
  assert.equal(words, 154, `${arm} instruction budget changed`);
}
const reference = evaluate(candidate('reference'), 'change');
assert.equal(reference.allPassed, true, JSON.stringify(reference.results.filter(item => !item.passed), null, 2));
console.log(`Reference: ${reference.passed}/${reference.total} behavioral cases passed`);

const targets = [
  ['unbounded', 'base', 'base.capacity_order'],
  ['serial', 'base', 'base.capacity_order'],
  ['completion-order', 'base', 'base.capacity_order'],
  ['fail-fast', 'base', 'base.failure_drains'],
  ['ignore-abort', 'change', 'change.preaborted'],
  ['late-snapshot', 'base', 'base.snapshot'],
  ['falsy-sync-throw', 'base', 'base.falsy_reasons'],
];
for (const [name, stage, target] of targets) {
  const report = evaluate(candidate(`mutants/${name}`), stage);
  assert.equal(report.results.find(item => item.id === target)?.passed, false, `${name} survived ${target}`);
  if (name === 'ignore-abort') {
    assert.ok(report.results.filter(item => item.stage === 'base').every(item => item.passed),
      'ignore-abort should preserve base behavior');
  }
  console.log(`Mutant ${name}: rejected by ${target} (${report.passed}/${report.total} cases passed)`);
}
