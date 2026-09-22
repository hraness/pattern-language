import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './evaluate.mjs';
import { parseArtifact } from './artifact.mjs';
import { referenceDesign as jobs } from './tasks/jobs/design-check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const taskFreezePath = new URL('./tasks/freeze.json', import.meta.url);
const taskFreeze = JSON.parse(readFileSync(taskFreezePath));
const guidanceFreeze = JSON.parse(readFileSync(new URL('./guidance/freeze.json', import.meta.url)));
assert.equal(guidanceFreeze.taskFreezeSha256, sha(readFileSync(taskFreezePath)));
const reviewFixes = JSON.parse(readFileSync(new URL('./tasks/review-fixes.json', import.meta.url)));
assert.equal(reviewFixes.initialTaskFreezeSha256, sha(readFileSync(taskFreezePath)));
const currentTaskFiles = { ...taskFreeze.files };
for (const [name, fix] of Object.entries(reviewFixes.files)) {
  assert.equal(fix.initialSha256, taskFreeze.files[name] ?? null, `Repair provenance: ${name}`);
  currentTaskFiles[name] = fix.sha256;
}
for (const record of [{ files: currentTaskFiles }, guidanceFreeze]) for (const [name, digest] of Object.entries(record.files)) {
  assert.equal(sha(readFileSync(join(root, name))), digest, `Frozen input unchanged: ${name}`);
}

const batch = {
  schema: 'pattern-language.design.v1', family: 'batch', states: ['ready', 'returned', 'rejected'],
  transitions: [{ event: 'return', from: 'ready', to: 'returned' }, { event: 'throw', from: 'ready', to: 'rejected' }],
  effects: [], decisions: { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' },
  rationale: ['scanOrder', 'execution', 'persistence', 'scheduling'].map(decision => ({ decision, reason: 'Public contract commitment.' })),
};
const scratch = mkdtempSync(join(tmpdir(), 'design-harness-'));
try {
  for (const [family, design] of [['jobs', jobs], ['batch', batch]]) {
    const path = join(scratch, `${family}.json`);
    writeFileSync(path, JSON.stringify(design), { mode: 0o600 });
    assert.equal(parseArtifact(JSON.stringify(design), family).valid, true);
    const source = fileURLToPath(new URL(`./tasks/${family}/reference.mjs`, import.meta.url));
    const result = await evaluate(source, path, family);
    assert.equal(result.jointAllPass, true, JSON.stringify(result.results.filter(row => !row.behaviorPassed || !row.agreementPassed)));
    console.log(`${family}: ${result.total} behavior and design-agreement cases pass`);
  }
  // A wrong but permitted declared choice must fail agreement while working
  // implementation behavior remains successful. Vocabulary alone cannot pass it.
  const path = join(scratch, 'mismatch.json');
  writeFileSync(path, JSON.stringify({ ...jobs, decisions: { ...jobs.decisions, dispatch_order: 'lifo' } }));
  const source = fileURLToPath(new URL('./tasks/jobs/reference.mjs', import.meta.url));
  let result = await evaluate(source, path, 'jobs');
  assert.equal(result.schemaValid, true); assert.equal(result.modelAdequate, true);
  assert.equal(result.behaviorAllPass, true); assert.equal(result.agreementAllPass, false);
  assert.ok(result.results.some(row => row.agreementPassed === false));

  // A permissive graph may fit every executed transition, but fails adequacy.
  writeFileSync(path, JSON.stringify({ ...jobs, transitions: [...jobs.transitions, { event: 'complete', from: 'queued', to: 'done' }] }));
  result = await evaluate(source, path, 'jobs');
  assert.equal(result.schemaValid, true); assert.equal(result.modelAdequate, false);
  assert.equal(result.testedAgreementAllPass, true); assert.equal(result.behaviorAllPass, true);
  assert.equal(result.agreementAllPass, false); assert.equal(result.jointAllPass, false);

  // Malformed plans do not hide otherwise-correct code. Nothing repairs the plan.
  writeFileSync(path, 'This is not JSON.\n');
  result = await evaluate(source, path, 'jobs');
  assert.equal(result.schemaValid, false); assert.equal(result.behaviorAllPass, true);
  assert.equal(result.jointAllPass, false); assert.equal(result.agreementUnobserved, result.total);

  // Import failures remain behavioral failures, independently of the design.
  const broken = join(scratch, 'broken.mjs');
  writeFileSync(broken, 'throw new Error("deliberate import failure");\n');
  result = await evaluate(broken, path, 'jobs');
  assert.equal(result.behaviorPassed, 0); assert.equal(result.jointAllPass, false);
  writeFileSync(broken, 'while (true) {}\n');
  result = await evaluate(broken, path, 'jobs', 100);
  assert.equal(result.behaviorPassed, 0);
  assert.ok(result.results.every(row => row.error?.includes('ETIMEDOUT')), 'Every hanging child is bounded by its timeout');
} finally { rmSync(scratch, { recursive: true, force: true }); }
console.log('Frozen inputs, honest outcome separation and process evaluator: OK');
