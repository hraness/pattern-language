import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, scoreStudy, validateStudy, verifyReplay } from './score.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'benchmarks/lifecycle-v2/';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const clone = value => structuredClone(value);
const families = ['mapper', 'retry', 'atomic'], arms = ['direct', 'checklist', 'pattern'];
const files = {};
function freeze(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    if (entry.name === 'results' || entry.name === 'README.md') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) freeze(path);
    else if (entry.isFile()) {
      const text = readFileSync(resolve(root, path), 'utf8');
      files[path] = { sha256: digest(text), text };
    }
  }
}
freeze('benchmarks/lifecycle-v2');
const legacy = 'benchmarks/code-design/cases.mjs';
files[legacy] = { text: readFileSync(resolve(root, legacy), 'utf8') };
files[legacy].sha256 = digest(files[legacy].text);
const jobs = [];
for (const stage of ['base', 'change']) {
  for (const repetition of [1, 2, 3]) {
    const rotate = list => [...list.slice(repetition - 1), ...list.slice(0, repetition - 1)];
    for (const family of rotate(families)) for (const arm of rotate(arms)) {
      jobs.push({ id: `${family}-${arm}-r${repetition}-${stage}`, family, arm, repetition, stage });
    }
  }
}
const plan = { schema: 'pattern-language.lifecycle-plan.v1',
  protocol: { promptIntro: 'Offline scorer fixture. Return one module.' }, files, jobs };
const run = { schema: 'pattern-language.lifecycle-generation.v1', planSha256: digest(json(plan)),
  status: 'partial-reconciliation-required', calls: jobs.map(job => ({ ...job, admitted: false,
    status: 'not-admitted-study-stopped', costUsd: 0 })) };
const review = { schema: 'pattern-language.lifecycle-review.v1', sources: [] };
const get = id => run.calls.find(call => call.id === id);
function addSource(id, source) {
  const call = get(id);
  const paths = [`${prefix}guidance/${call.arm}.md`, `${prefix}tasks/${call.family}/base.md`];
  const sections = [plan.protocol.promptIntro, ...paths.map(path => files[path].text.trim())];
  let priorSourceSha256 = null;
  if (call.stage === 'change') {
    const prior = get(id.replace(/-change$/, '-base'));
    paths.push(`${prefix}tasks/${call.family}/change.md`);
    sections.push(files[paths.at(-1)].text.trim(), `Prior implementation:\n${prior.source}`);
    priorSourceSha256 = prior.sourceSha256;
  }
  const prompt = `${sections.join('\n\n')}\n`;
  Object.assign(call, { status: 'generated-not-reviewed', admitted: true, costUsd: 0.01,
    source, sourceSha256: digest(source), prompt, promptSha256: digest(prompt), promptFiles: paths, priorSourceSha256 });
  review.sources.push({ id, sha256: digest(source) });
}
const reference = readFileSync(resolve(root, `${prefix}tasks/atomic/reference.mjs`), 'utf8');
addSource('atomic-checklist-r1-base', `${reference}\n// Checklist fixture.\n`);
addSource('atomic-pattern-r1-base', `${reference}\n// Pattern fixture.\n`);
addSource('atomic-pattern-r1-change', reference);
addSource('atomic-direct-r1-base', 'export function createLedger() { throw new Error("Deliberate fixture failure"); }\n');
const validate = (p = plan, r = run, v = review) => validateStudy(json(p), json(r), json(v));
validate();

// Every provenance defect blocks the entire study before candidate execution.
assert.throws(() => validateStudy(Buffer.from(JSON.stringify(plan)), json(run), json(review)), /exact plan bytes/);
{
  const changed = clone(plan);
  changed.files[`${prefix}guidance/pattern.md`].text += 'changed';
  const changedRun = { ...run, planSha256: digest(json(changed)) };
  assert.throws(() => validate(changed, changedRun), /Embedded file hash/);
  changed.files[`${prefix}guidance/pattern.md`].sha256 = digest(changed.files[`${prefix}guidance/pattern.md`].text);
  changedRun.planSha256 = digest(json(changed));
  assert.throws(() => validate(changed, changedRun), /Local frozen file changed/);
}
{
  const changed = clone(plan);
  delete changed.files[legacy];
  assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /Missing frozen dependency/);
}
{
  const changed = clone(plan);
  changed.jobs[1] = clone(changed.jobs[0]);
  assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /Duplicate planned job/);
}
assert.throws(() => validate(plan, { ...run, status: 'running' }), /finalized/);
assert.throws(() => validate(plan, { ...run, calls: run.calls.slice(1) }), /every planned job/);
{
  const changed = clone(run);
  changed.calls[1] = clone(changed.calls[0]);
  assert.throws(() => validate(plan, changed), /duplicate call/);
  changed.calls[1].id = 'unknown';
  assert.throws(() => validate(plan, changed), /Unknown/);
}
{
  const changed = clone(run);
  const call = changed.calls.find(item => item.source);
  call.source += 'tampered';
  assert.throws(() => validate(plan, changed), /Source hash/);
}
{
  const changed = clone(run);
  const call = changed.calls.find(item => item.prompt);
  call.prompt += '\nLeaked evaluator feedback.';
  call.promptSha256 = digest(call.prompt);
  assert.throws(() => validate(plan, changed), /Prompt differs/);
}
{
  const changed = clone(run);
  const call = changed.calls.find(item => item.id === 'atomic-pattern-r1-change');
  const wrongPrior = get('atomic-checklist-r1-base');
  call.priorSourceSha256 = wrongPrior.sourceSha256;
  call.prompt = call.prompt.replace(get('atomic-pattern-r1-base').source, wrongPrior.source);
  call.promptSha256 = digest(call.prompt);
  assert.throws(() => validate(plan, changed), /own base source/);
}
{
  const changed = clone(run);
  changed.calls.find(item => item.prompt).promptFiles.reverse();
  assert.throws(() => validate(plan, changed), /Prompt file provenance/);
}
assert.throws(() => validate(plan, run, { ...review, sources: review.sources.slice(1) }), /Unreviewed source/);
assert.throws(() => validate(plan, run, { ...review, sources: [...review.sources, review.sources[0]] }), /duplicate reviewed/);
{
  const changed = clone(review);
  changed.sources[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(plan, run, changed), /Review source hash/);
}

const result = await scoreStudy(json(plan), json(run), json(review));
assert.equal(result.artifacts.length, 54);
assert.equal(result.costs.admittedCalls, 4);
assert.equal(result.costs.knownUsd, 0.04);
assert.equal(result.families.mapper.role, 'development');
assert.equal(result.families.retry.role, 'transfer');
assert.deepEqual(result.families.atomic.arms.pattern,
  { denominator: 3, baseAllPass: 1, changeAllPass: 1, bothAllPass: 1 });
assert.deepEqual(result.families.atomic.arms.checklist,
  { denominator: 3, baseAllPass: 1, changeAllPass: 0, bothAllPass: 0 });
assert.deepEqual(result.families.atomic.arms.direct,
  { denominator: 3, baseAllPass: 0, changeAllPass: 0, bothAllPass: 0 });
assert.deepEqual(result.families.atomic.pairedDisagreements, [
  { repetition: 1, stage: 'change', pattern: true, checklist: false },
  { repetition: 1, stage: 'both', pattern: true, checklist: false },
]);
const missing = result.artifacts.find(artifact => artifact.id === 'atomic-checklist-r1-change');
assert.equal(missing.allPassed, false);
assert.ok(missing.results.length > 0 && missing.results.every(test => !test.passed));
assert.ok(result.artifacts.find(artifact => artifact.id === 'atomic-pattern-r1-base').sourceBytes > 0);

// A fresh evaluation must reproduce all case outcomes; error strings and runtime
// annotations are diagnostic and can legitimately differ across machines.
const replay = await scoreStudy(json(plan), json(run), json(review));
verifyReplay(replay, result);
const unstable = clone(result);
unstable.runtime.node = 'other-runtime';
unstable.artifacts[0].results[0].error = 'Different stack trace';
verifyReplay(replay, unstable);
const changed = clone(result);
changed.artifacts[0].results[0].passed = !changed.artifacts[0].results[0].passed;
assert.throws(() => verifyReplay(replay, changed), /Replay differs/);
changed.artifacts[0].results[0].id = 'other-case';
assert.throws(() => verifyReplay(replay, changed), /Replay differs/);
console.log('Lifecycle scorer: provenance, review boundary, fixed denominators, paired outcomes, and replay verified.');
