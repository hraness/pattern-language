import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, plannedJobs, scoreStudy, validateStudy, verifyReplay } from './score.mjs';
import { parseArtifact } from './artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'benchmarks/design-decisions-v3/';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const clone = value => structuredClone(value);
const scratch = mkdtempSync(join(tmpdir(), 'design-score-test-'));
try {
  // Use actual offline preparation to prove Python/JavaScript agreement about
  // exact schedules, prompt constants, protocol fields and frozen closure.
  const prepared = spawnSync('python3', ['-c', `
import importlib.util,json,pathlib,sys
runner_path=pathlib.Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('test_design_score_runner',runner_path)
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.prepare(pathlib.Path(sys.argv[2]),version_reader=lambda:{'claude':'offline-fixture','node':'offline-fixture'})
`, resolve(root, 'scripts/run-design-study.py'), join(scratch, 'study')], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  const plan = JSON.parse(readFileSync(join(scratch, 'study', 'plan.json')));
  assert.deepEqual(plan.jobs, plannedJobs());
  const decisions = { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' };
  const adequate = {
    schema: 'pattern-language.design.v1', family: 'batch', states: ['ready', 'returned', 'rejected'],
    transitions: [{ event: 'return', from: 'ready', to: 'returned' }, { event: 'throw', from: 'ready', to: 'rejected' }],
    effects: [], decisions,
    rationale: Object.keys(decisions).map(decision => ({ decision, reason: 'Offline fixture commitment.' })),
  };
  const designs = {
    'batch-direct-r1': ' \n```json\n{this is malformed JSON}\n``` \n',
    'batch-checklist-r1': JSON.stringify(adequate),
    'batch-pattern-r1': JSON.stringify(adequate),
    'batch-pattern-r2': JSON.stringify({ ...adequate, effects: ['schedule'] }),
    'batch-pattern-r3': JSON.stringify(adequate),
  };
  const calls = [];
  const review = { schema: 'pattern-language.design-review.v1', sources: [] };
  function promptFor(job, prior) {
    const paths = [`${prefix}artifact.md`, `${prefix}facts.md`, `${prefix}guidance/${job.arm}.md`,
      `${prefix}tasks/${job.family}/task.md`, `${prefix}tasks/${job.family}/model.json`];
    const sections = [plan.protocol.promptIntros[job.stage], ...paths.map(path => plan.files[path].text.trim())];
    if (job.stage === 'code') sections.push(plan.protocol.priorDesignLabel + prior.designText);
    return { prompt: `${sections.join('\n\n')}\n`, promptFiles: paths };
  }
  for (const [index, job] of plan.jobs.entries()) {
    const key = job.id.replace(/-(design|code)$/, '');
    const prior = calls.find(call => call.id === `${key}-design`);
    if (job.stage === 'code' && !prior.designText.trim()) {
      calls.push({ ...job, admitted: false, status: 'skipped-no-design-text', countAsFailure: true, costUsd: 0 });
      continue;
    }
    const call = { ...job, admitted: true, status: 'failed-generation', countAsFailure: true, costUsd: 0.01,
      admittedAt: new Date(1_800_000_000_000 + Math.floor(index / 3) * 1000).toISOString(),
      finishedAt: new Date(1_800_000_000_500 + Math.floor(index / 3) * 1000).toISOString(),
      ...promptFor(job, prior), priorDesignSha256: job.stage === 'code' ? prior.designSha256 : null,
      exitCode: 0, timeout: false,
      provider: { model: 'claude-haiku-4-5', canonicalModel: 'claude-haiku-4-5', provider: 'firstParty', turns: 1, usage: { inputTokens: 1, outputTokens: 1 } },
      providerEnvelope: { type: 'result', subtype: 'success', is_error: false },
    };
    call.promptSha256 = digest(call.prompt);
    if (job.stage === 'design') {
      call.resultText = designs[key] ?? '';
      call.designText = call.resultText;
      call.designSha256 = digest(call.designText);
      if (call.designText) { call.status = 'generated-not-reviewed'; call.countAsFailure = false; }
    } else if (key !== 'batch-checklist-r1') {
      call.resultText = `\n\`\`\`javascript\n// ${key}\nexport const offlineFixture = true;\n\`\`\`\n`;
      call.source = `// ${key}\nexport const offlineFixture = true;\n`;
      call.sourceSha256 = digest(call.source);
      call.status = 'generated-not-reviewed'; call.countAsFailure = false;
      review.sources.push({ id: call.id, sha256: call.sourceSha256 });
    } else call.resultText = 'function incomplete(';
    calls.push(call);
  }
  const admitted = calls.filter(call => call.admitted);
  const run = { schema: 'pattern-language.design-generation.v1', planSha256: digest(json(plan)),
    status: 'generation-complete-awaiting-review', calls, stopReasons: [], cliVersions: plan.protocol.cliVersions,
    denominator: 36, pairDenominator: 18, sourceReviewRequired: true, evaluationStatus: 'not-run',
    admittedCalls: admitted.length, knownCostUsd: admitted.length * 0.01, costComplete: true };
  const validate = (p = plan, r = run, v = review) => validateStudy(json(p), json(r), json(v));
  validate();

  // Match the frozen Python decoder exactly across its Unicode whitespace
  // boundary: Python keeps BOM but strips NEL; JS trim does the opposite.
  for (const marker of ['\uFEFF', '\u0085']) {
    const changed = clone(run), changedReview = clone(review);
    const call = changed.calls.find(call => call.source);
    call.resultText = marker + call.source + marker;
    if (marker === '\uFEFF') call.source = `${marker}${call.source}${marker}\n`;
    call.sourceSha256 = digest(call.source);
    changedReview.sources.find(row => row.id === call.id).sha256 = call.sourceSha256;
    validate(plan, changed, changedReview);
  }
  {
    const changed = clone(run);
    const design = changed.calls.find(call => call.id === 'batch-direct-r1-design');
    const code = changed.calls.find(call => call.id === 'batch-direct-r1-code');
    design.resultText = design.designText = '\uFEFF';
    design.designSha256 = digest(design.designText);
    Object.assign(code, promptFor(code, design), { priorDesignSha256: design.designSha256 });
    code.promptSha256 = digest(code.prompt);
    validate(plan, changed);
  }
  {
    const changed = clone(run);
    const design = changed.calls.find(call => call.id === 'jobs-direct-r1-design');
    design.resultText = design.designText = '\u0085';
    design.designSha256 = digest(design.designText);
    validate(plan, changed);
  }

  // Provenance defects must reject the whole run before any candidate execution.
  assert.throws(() => validateStudy(Buffer.from(JSON.stringify(plan)), json(run), json(review)), /exact plan bytes/);
  {
    const changed = clone(plan);
    delete changed.files[`${prefix}tasks/batch/mutants/capacity.mjs`];
    assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /closure/);
  }
  {
    const changed = clone(plan);
    changed.files[`${prefix}facts.md`].text += 'changed';
    let changedRun = { ...run, planSha256: digest(json(changed)) };
    assert.throws(() => validate(changed, changedRun), /Embedded file hash/);
    changed.files[`${prefix}facts.md`].sha256 = digest(changed.files[`${prefix}facts.md`].text);
    changedRun = { ...run, planSha256: digest(json(changed)) };
    assert.throws(() => validate(changed, changedRun), /Local frozen file changed/);
  }
  {
    const changed = clone(plan);
    [changed.jobs[0], changed.jobs[1]] = [changed.jobs[1], changed.jobs[0]];
    assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /36-job schedule/);
  }
  {
    const changed = clone(plan); changed.protocol.command.push('--dangerous-tool');
    assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /protocol/);
  }
  assert.throws(() => validate(plan, { ...run, status: 'running' }), /finalized/);
  assert.throws(() => validate(plan, { ...run, calls: calls.slice(1) }), /every planned job/);
  {
    const changed = clone(run); changed.calls[1] = clone(changed.calls[0]);
    assert.throws(() => validate(plan, changed), /metadata\/order/);
  }
  for (const mutate of [
    call => { call.prompt += 'evaluator leak'; call.promptSha256 = digest(call.prompt); },
    call => { call.promptFiles.reverse(); },
    call => { call.priorDesignSha256 = '0'.repeat(64); },
    call => { call.source += 'changed'; },
    call => { call.source += 'changed'; call.sourceSha256 = digest(call.source); },
  ]) {
    const changed = clone(run), call = changed.calls.find(call => call.source);
    mutate(call);
    assert.throws(() => validate(plan, changed), /Prompt|raw design|Source/);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.designText);
    call.designText = call.designText.trim(); call.designSha256 = digest(call.designText);
    assert.throws(() => validate(plan, changed), /exact raw result/);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.source);
    const prior = changed.calls.find(row => row.id === call.id.replace(/-code$/, '-design'));
    call.prompt = call.prompt.replace(prior.designText, prior.designText.trim());
    call.promptSha256 = digest(call.prompt);
    assert.throws(() => validate(plan, changed), /exact raw design/);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.source);
    call.admittedAt = '2020-01-01T00:00:00Z';
    assert.throws(() => validate(plan, changed), /barrier/);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.source);
    call.provider.model = 'other-model';
    assert.throws(() => validate(plan, changed), /provider identity/);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.id === 'batch-checklist-r1-code');
    Object.keys(call).forEach(key => { if (!['id', 'family', 'arm', 'repetition', 'stage'].includes(key)) delete call[key]; });
    Object.assign(call, { admitted: false, status: 'skipped-no-design-text', countAsFailure: true, costUsd: 0 });
    assert.throws(() => validate(plan, changed), /skipped despite available/);
  }
  assert.throws(() => validate(plan, run, { ...review, sources: [...review.sources, review.sources[0]] }), /duplicate reviewed/);
  {
    const changed = clone(review); changed.sources[0].sha256 = '0'.repeat(64);
    assert.throws(() => validate(plan, run, changed), /Review source hash/);
  }

  let executions = 0;
  const fakeEvaluator = async (sourcePath, designPath, family) => {
    executions++;
    const source = readFileSync(sourcePath, 'utf8'), design = readFileSync(designPath, 'utf8');
    if (source.includes('batch-direct-r1')) assert.equal(design, designs['batch-direct-r1'], 'Exact malformed design reaches evaluator');
    const parsed = parseArtifact(design, family);
    const { assessDesign } = await import(`./tasks/${family}/design-check.mjs`);
    const adequacy = parsed.valid ? assessDesign(parsed.artifact) : { adequate: false, errors: ['Invalid design'] };
    const { cases } = await import(`./tasks/${family}/cases.mjs`);
    const failed = source.includes('batch-pattern-r3');
    return { sourceSha256: digest(source), designSha256: digest(design), schemaValid: parsed.valid,
      schemaErrors: parsed.errors, modelAdequate: adequacy.adequate, adequacyErrors: adequacy.errors,
      results: cases.map(test => ({ id: test.id, group: test.group, behaviorPassed: !failed,
        agreementPassed: parsed.valid ? !failed : null, observationCount: parsed.valid ? 1 : 0,
        ...(parsed.valid ? { observedDecisions: { scanOrder: 'fifo' } } : {}) })) };
  };
  // A bad review on the last source must prevent the first source from running.
  await assert.rejects(() => scoreStudy(json(plan), json(run), json({ ...review, sources: review.sources.slice(0, -1) }),
    { evaluate: fakeEvaluator }), /Unreviewed source/);
  assert.equal(executions, 0);
  const result = await scoreStudy(json(plan), json(run), json(review), { evaluate: fakeEvaluator });
  assert.equal(executions, 4);
  assert.equal(result.pairs.length, 18);
  assert.equal(result.costs.plannedCalls, 36);
  assert.equal(result.costs.admittedCalls, 23);
  assert.ok(Math.abs(result.costs.knownUsd - 0.23) < 1e-12);
  for (const family of Object.values(result.families)) for (const arm of Object.values(family.arms)) assert.equal(arm.denominator, 3);
  assert.deepEqual(result.families.batch.arms.direct, { denominator: 3, schemaValid: 0, modelAdequate: 0,
    behaviorAllPass: 1, agreementAllPass: 0, jointAllPass: 0 });
  assert.deepEqual(result.families.batch.arms.checklist, { denominator: 3, schemaValid: 1, modelAdequate: 1,
    behaviorAllPass: 0, agreementAllPass: 0, jointAllPass: 0 });
  assert.deepEqual(result.families.batch.arms.pattern, { denominator: 3, schemaValid: 3, modelAdequate: 2,
    behaviorAllPass: 2, agreementAllPass: 1, jointAllPass: 1 });
  const getPair = id => result.pairs.find(pair => pair.id === id);
  assert.equal(getPair('batch-direct-r1').schemaValid, false);
  assert.equal(getPair('batch-direct-r1').behaviorAllPass, true, 'Invalid design cannot suppress code behavior evaluation');
  assert.equal(getPair('batch-pattern-r2').testedAgreementAllPass, true);
  assert.equal(getPair('batch-pattern-r2').agreementAllPass, false, 'Inadequate models cannot earn primary conformance');
  assert.equal(getPair('batch-checklist-r1').schemaValid, true, 'Missing code retains available design validity');
  assert.equal(getPair('batch-checklist-r1').agreementUnavailableReason, 'missing-code');
  assert.equal(result.families.batch.pairedComparisons.length, 9);
  assert.equal(result.families.batch.pairedDisagreements.length, 4);

  // Truncated/refused design text is still forwarded exactly and independently
  // measured. A failed design request cannot nevertheless earn joint success.
  for (const stopReason of ['max_tokens', 'refusal']) {
    const changed = clone(run);
    const call = changed.calls.find(call => call.id === 'batch-pattern-r1-design');
    call.status = 'failed-generation'; call.countAsFailure = true;
    call.providerEnvelope.stop_reason = stopReason;
    call.failureReason = stopReason === 'refusal' ? 'provider-refusal' : 'provider-output-truncated';
    const scored = await scoreStudy(json(plan), json(changed), json(review), { evaluate: fakeEvaluator });
    const pair = scored.pairs.find(pair => pair.id === 'batch-pattern-r1');
    assert.equal(pair.schemaValid, true);
    assert.equal(pair.behaviorAllPass, true);
    assert.equal(pair.agreementAllPass, true);
    assert.equal(pair.jointAllPass, false);
  }

  verifyReplay(result, clone(result));
  const diagnostic = clone(result);
  diagnostic.runtime.node = 'different-runtime';
  diagnostic.pairs[0].results[0].error = 'Different stack path';
  diagnostic.pairs[0].schemaErrors = ['Different wording'];
  verifyReplay(result, diagnostic);
  for (const mutate of [
    report => { report.pairs[0].results[0].behaviorPassed = !report.pairs[0].results[0].behaviorPassed; },
    report => { report.pairs[0].results[0].agreementPassed = true; },
    report => { report.pairs[0].results[0].observationCount++; },
    report => { report.pairs[0].sourceSha256 = '0'.repeat(64); },
    report => { report.families.batch.arms.direct.denominator = 2; },
    report => { report.costs.admittedCalls++; },
  ]) {
    const changed = clone(result); mutate(changed);
    assert.throws(() => verifyReplay(result, changed), /Replay differs/);
  }
  console.log('Design scorer: full frozen closure, exact raw design forwarding, all-source review boundary, independent outcomes, fixed denominators and replay verified.');
} finally { rmSync(scratch, { recursive: true, force: true }); }
