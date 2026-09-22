import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, plannedJobs, scoreStudy, validateStudy, verifyReplay } from './score.mjs';
import { parseArtifact } from '../design-decisions-v3/artifact.mjs';
import { referenceDesign } from '../design-decisions-v3/tasks/jobs/design-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'benchmarks/design-decisions-v3/';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const clone = value => structuredClone(value);
const scratch = mkdtempSync(join(tmpdir(), 'design-swe2-score-test-'));
try {
  // Actual preparation with injected local metadata proves agreement with the
  // canonical Python protocol. This fixture never probes a CLI or credential.
  const prepared = spawnSync('python3', ['-c', `
import importlib.util,json,pathlib,sys,time
spec=importlib.util.spec_from_file_location('test_swe2_score_runner',sys.argv[1])
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
identity={'cliVersions':{'xcb':'xcb offline-fixture','devin':'offline-fixture','node':'offline-fixture'},
 'executablePaths':{'xcb':r.XCB,'devin':r.DEVIN,'node':'/offline/node'},
 'executableHashes':{'xcb':'1'*64,'devin':'2'*64,'node':'3'*64}}
ms=int(time.time()*1000)
q={'runtimeVersion':'offline-fixture','runtimeDigest':'1'*64,'evidenceDigest':'4'*64,'expiresAt':ms+86400000}
cap={'version':1,'supported':True,'zeroTools':True,'zeroHooks':True,'ephemeral':True,
 'limits':{'maxInputBytes':1048576,'maxOutputBytes':262144,'minTimeoutMs':1000,'maxTimeoutMs':120000},
 'accounts':[{'id':r.ACCOUNT,'provider':'devin','available':True,'enabled':True,'busy':False,'connected':True,
 'runtimeAdmitted':True,'reason':None,'qualification':q,'models':[{'key':r.MODEL,'observedAtMs':ms-1000}]}]}
listing={'models':[{'model_uid':'swe-2-high','cost_tier':'Free'}]}
record=lambda obj:{'data':obj,'raw':json.dumps(obj)}
r.prepare(pathlib.Path(sys.argv[2]),version_reader=lambda:identity,capability_reader=lambda:record(cap),
 catalog_reader=lambda:{**record(listing),'accountBinding':r.ACCOUNT_BINDING.copy()})
counter=0
def provider(command,request,cwd,timeout):
 global counter
 counter+=1
 text='{}' if counter<=18 else 'export const offlineFixture=true;'
 response={'version':1,'status':'completed','requestId':f'offline-python-{counter}',
  'account':r.ACCOUNT,'model':r.MODEL,'text':text,'outcome':{'terminal':'completed','joined':True,'effects':'none'}}
 return {'stdout':json.dumps(response),'stderr':'','exitCode':0,'timeout':False,'elapsedSeconds':0}
r.run_study(pathlib.Path(sys.argv[2]),provider=provider,checker=lambda source:True,
 version_reader=lambda:identity,capability_reader=lambda:record(cap),
 catalog_reader=lambda:{**record(listing),'accountBinding':r.ACCOUNT_BINDING.copy()})
`, resolve(root, 'scripts/run-design-swe2.py'), join(scratch, 'study')], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  const plan = JSON.parse(readFileSync(join(scratch, 'study', 'plan.json')));
  assert.deepEqual(plan.jobs, plannedJobs());
  const base = Math.max(Date.now(), Date.parse(plan.preparedAt)) + 1000;
  const decisions = { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' };
  const adequate = { schema: 'pattern-language.design.v1', family: 'batch', states: ['ready', 'returned', 'rejected'],
    transitions: [{ event: 'return', from: 'ready', to: 'returned' }, { event: 'throw', from: 'ready', to: 'rejected' }],
    effects: [], decisions, rationale: Object.keys(decisions).map(decision => ({ decision, reason: 'Offline commitment.' })) };
  const special = {
    'batch-direct-r1': ' \n```json\n{this is malformed JSON}\n``` \n',
    'batch-checklist-r1': '',
    'batch-pattern-r2': JSON.stringify({ ...adequate, effects: ['schedule'] }),
  };
  const calls = [], review = { schema: 'pattern-language.design-review.v1', sources: [] };
  function promptFor(job, prior) {
    const paths = [`${prefix}artifact.md`, `${prefix}facts.md`, `${prefix}guidance/${job.arm}.md`,
      `${prefix}tasks/${job.family}/task.md`, `${prefix}tasks/${job.family}/model.json`];
    const sections = [plan.protocol.promptIntros[job.stage], ...paths.map(path => plan.files[path].text.trim())];
    if (job.stage === 'code') sections.push(plan.protocol.priorDesignLabel + prior.designText);
    return { prompt: `${sections.join('\n\n')}\n`, promptFiles: paths };
  }
  for (const [index, job] of plan.jobs.entries()) {
    const key = job.id.replace(/-(design|code)$/, ''), prior = calls.find(call => call.id === `${key}-design`);
    if (job.stage === 'code' && !prior.designText.trim()) {
      calls.push({ ...job, admitted: false, status: 'skipped-no-design-text', countAsFailure: true,
        costUsd: 0, costStatus: 'not-incurred' });
      continue;
    }
    const call = { ...job, admitted: true, status: 'generated-not-reviewed', countAsFailure: false,
      costUsd: null, costStatus: 'not-reported', admittedAt: new Date(base + index * 1000).toISOString(),
      finishedAt: new Date(base + index * 1000 + 500).toISOString(),
      ...promptFor(job, prior), priorDesignSha256: job.stage === 'code' ? prior.designSha256 : null,
      exitCode: 0, timeout: false,
      eligibility: { checkedAt: new Date(base + index * 1000).toISOString(), capabilitiesSha256: '5'.repeat(64),
        catalogSha256: '6'.repeat(64), account: plan.protocol.requestedAccount, model: plan.protocol.requestedModel,
        catalogModelUid: 'swe-2-high', catalogCostTier: 'Free', qualification: plan.protocol.qualification,
        modelObservedAtMs: base - 1000, accountBinding: { method: 'local-imported-credential-equality', matched: true } },
      provider: { account: plan.protocol.requestedAccount, model: plan.protocol.requestedModel, reportedModelRevision: null, usage: null },
      providerEnvelope: { version: 1, status: 'completed', requestId: `offline-${index}`,
        account: plan.protocol.requestedAccount, model: plan.protocol.requestedModel,
        outcome: { terminal: 'completed', joined: true, effects: 'none' } },
    };
    call.promptSha256 = digest(call.prompt);
    if (job.stage === 'design') {
      call.resultText = special[key] ?? JSON.stringify(job.family === 'jobs' ? referenceDesign : adequate);
      call.designText = call.resultText; call.designSha256 = digest(call.designText);
      if (!call.designText) {
        call.status = 'failed-generation'; call.countAsFailure = true; call.failureReason = 'empty-result';
      }
    } else if (key === 'batch-direct-r3') {
      call.resultText = 'function incomplete('; call.status = 'failed-generation'; call.countAsFailure = true;
      call.failureReason = 'result-not-parseable-module';
    } else {
      call.resultText = `\n\`\`\`javascript\n// ${key}\nexport const offlineFixture = true;\n\`\`\`\n`;
      call.source = `// ${key}\nexport const offlineFixture = true;\n`; call.sourceSha256 = digest(call.source);
      review.sources.push({ id: call.id, sha256: call.sourceSha256 });
    }
    calls.push(call);
  }
  const admitted = calls.filter(call => call.admitted);
  const run = { schema: 'pattern-language.design-swe2-generation.v1', planSha256: digest(json(plan)),
    status: 'generation-complete-awaiting-review', calls, stopReasons: [],
    ...Object.fromEntries(['cliVersions', 'executablePaths', 'executableHashes'].map(key => [key, plan.protocol[key]])),
    startedAt: new Date(base - 1).toISOString(), finishedAt: new Date(base + 36000).toISOString(),
    denominator: 36, pairDenominator: 18, sourceReviewRequired: true, evaluationStatus: 'not-run',
    admittedCalls: admitted.length, knownCostUsd: 0, costComplete: false, costStatus: 'not-reported' };
  const validate = (p = plan, r = run, v = review) => validateStudy(json(p), json(r), json(v));
  validate();

  assert.throws(() => validateStudy(Buffer.from(JSON.stringify(plan)), json(run), json(review)), /exact plan bytes/);
  for (const mutate of [
    p => { delete p.files[`${prefix}tasks/batch/mutants/capacity.mjs`]; },
    p => { p.files[`${prefix}facts.md`].text += 'changed'; },
    p => { p.files[`${prefix}facts.md`].text += 'changed'; p.files[`${prefix}facts.md`].sha256 = digest(p.files[`${prefix}facts.md`].text); },
    p => { [p.jobs[0], p.jobs[1]] = [p.jobs[1], p.jobs[0]]; },
    p => { p.protocol.command.push('--tools'); },
    p => { p.protocol.qualification.runtimeDigest = '0'.repeat(64); },
    p => { p.parentPlan.sha256 = '0'.repeat(64); },
  ]) {
    const changed = clone(plan); mutate(changed);
    assert.throws(() => validate(changed, { ...run, planSha256: digest(json(changed)) }), /closure|hash|frozen|protocol/i);
  }
  assert.throws(() => validate(plan, { ...run, status: 'running' }), /finalized/);
  assert.throws(() => validate(plan, { ...run, calls: calls.slice(1) }), /every planned job/);
  assert.throws(() => validate(plan, run, { ...review, sources: [...review.sources, review.sources[0]] }), /duplicate reviewed/);
  for (const mutate of [
    call => { call.prompt += 'evaluator leak'; call.promptSha256 = digest(call.prompt); },
    call => { call.promptFiles.reverse(); },
    call => { call.priorDesignSha256 = '0'.repeat(64); },
    call => { call.source += 'changed'; },
    call => { call.source += 'changed'; call.sourceSha256 = digest(call.source); },
    call => { call.provider.model = 'claude-haiku-4-5'; },
    call => { call.provider.usage = { inputTokens: 1 }; },
    call => { call.provider.reportedModelRevision = 'invented'; },
    call => { call.providerEnvelope.model = 'devin/swe-2-max'; },
    call => { call.providerEnvelope.outcome.joined = false; },
    call => { call.providerEnvelope.outcome.effects = 'unknown'; },
    call => { call.providerEnvelope.requestId = calls[0].providerEnvelope.requestId; },
    call => { call.costUsd = 0; },
    call => { call.costStatus = 'free'; },
    call => { call.eligibility.catalogCostTier = 'Premium'; },
    call => { call.eligibility.catalogModelUid = 'swe-2-fusion'; },
    call => { call.eligibility.accountBinding.matched = false; },
    call => { call.eligibility.qualification.expiresAt = 1; },
    call => { call.eligibility.qualification.evidenceDigest = '0'.repeat(64); },
    call => { call.eligibility.checkedAt = run.finishedAt; },
    call => { call.eligibility.modelObservedAtMs = base - 86400000; },
    call => { call.admittedAt = run.startedAt; },
  ]) {
    const changed = clone(run); mutate(changed.calls.find(call => call.source));
    assert.throws(() => validate(plan, changed), /Prompt|raw design|Source|provider|telemetry|catalog|qualification|barrier|account/i);
  }
  {
    const changed = clone(run), design = changed.calls.find(call => call.id === 'batch-direct-r1-design');
    design.designText = design.designText.trim(); design.designSha256 = digest(design.designText);
    assert.throws(() => validate(plan, changed), /exact raw result/);
  }
  for (const marker of ['\uFEFF', '\u0085']) {
    const changed = clone(run), changedReview = clone(review), call = changed.calls.find(call => call.source);
    call.resultText = marker + call.source + marker;
    if (marker === '\uFEFF') call.source = `${marker}${call.source}${marker}\n`;
    call.sourceSha256 = digest(call.source);
    changedReview.sources.find(row => row.id === call.id).sha256 = call.sourceSha256;
    validate(plan, changed, changedReview);
  }
  {
    const changed = clone(run), call = changed.calls.find(call => call.source);
    const design = changed.calls.find(row => row.id === call.id.replace(/-code$/, '-design'));
    design.designText = design.resultText = '\uFEFF'; design.designSha256 = digest(design.designText);
    Object.assign(call, promptFor(call, design), { priorDesignSha256: design.designSha256 });
    call.promptSha256 = digest(call.prompt); validate(plan, changed);
  }

  let executions = 0;
  const fakeEvaluator = async (sourcePath, designPath, family) => {
    executions++;
    const source = readFileSync(sourcePath, 'utf8'), design = readFileSync(designPath, 'utf8');
    if (source.includes('batch-direct-r1')) assert.equal(design, special['batch-direct-r1']);
    const parsed = parseArtifact(design, family);
    const { assessDesign } = await import(`../design-decisions-v3/tasks/${family}/design-check.mjs`);
    const adequacy = parsed.valid ? assessDesign(parsed.artifact) : { adequate: false, errors: ['Invalid design'] };
    const { cases } = await import(`../design-decisions-v3/tasks/${family}/cases.mjs`);
    const failed = source.includes('batch-pattern-r3');
    return { sourceSha256: digest(source), designSha256: digest(design), schemaValid: parsed.valid,
      schemaErrors: parsed.errors, modelAdequate: adequacy.adequate, adequacyErrors: adequacy.errors,
      results: cases.map(test => ({ id: test.id, group: test.group, behaviorPassed: !failed,
        agreementPassed: parsed.valid ? !failed : null, observationCount: parsed.valid ? 1 : 0,
        ...(parsed.valid ? { observedDecisions: { scanOrder: 'fifo' } } : {}) })) };
  };
  await assert.rejects(() => scoreStudy(json(plan), json(run), json({ ...review, sources: review.sources.slice(0, -1) }),
    { evaluate: fakeEvaluator }), /Unreviewed source/);
  assert.equal(executions, 0, 'All-source review validation must precede every candidate evaluation');
  const scored = await scoreStudy(json(plan), json(run), json(review), { evaluate: fakeEvaluator });
  assert.equal(executions, 16); assert.equal(scored.pairs.length, 18);
  assert.equal(scored.costs.plannedCalls, 36); assert.equal(scored.costs.admittedCalls, 35);
  assert.equal(scored.costs.knownUsd, null); assert.equal(scored.costs.unknownCostCalls.length, 35);
  for (const family of Object.values(scored.families)) for (const arm of Object.values(family.arms)) assert.equal(arm.denominator, 3);
  const pair = id => scored.pairs.find(row => row.id === id);
  assert.equal(pair('batch-direct-r1').schemaValid, false);
  assert.equal(pair('batch-direct-r1').behaviorAllPass, true);
  assert.equal(pair('batch-direct-r1').jointAllPass, false);
  assert.equal(pair('batch-pattern-r2').testedAgreementAllPass, true);
  assert.equal(pair('batch-pattern-r2').agreementAllPass, false);
  assert.equal(pair('batch-checklist-r1').agreementUnavailableReason, 'missing-code');
  assert.equal(pair('jobs-pattern-r1').jointAllPass, true);
  {
    const partial = clone(run), first = partial.calls[0];
    for (const key of ['resultText', 'designText', 'designSha256', 'provider', 'providerEnvelope']) delete first[key];
    Object.assign(first, { status: 'failed-generation', countAsFailure: true,
      failureReason: 'xcb-custody-uncertain', custodyUncertain: true, exitCode: null });
    partial.calls = [first, ...plan.jobs.slice(1).map(job => ({ ...job, admitted: false,
      status: 'not-admitted-study-stopped', countAsFailure: true, costUsd: 0, costStatus: 'not-incurred' }))];
    partial.admittedCalls = 1; partial.status = 'partial-reconciliation-required'; partial.stopReasons = ['xcb-custody-uncertain'];
    const before = executions;
    const failed = await scoreStudy(json(plan), json(partial), json({ schema: review.schema, sources: [] }), { evaluate: fakeEvaluator });
    assert.equal(executions, before); assert.equal(failed.pairs.length, 18); assert.equal(failed.costs.unknownCostCalls.length, 1);
    assert.ok(failed.pairs.every(row => row.jointAllPass === false));
    const bad = clone(partial); bad.calls[1] = clone(run.calls[1]); bad.admittedCalls++;
    assert.throws(() => validate(plan, bad, { schema: review.schema, sources: [] }), /continued after admission stopped/);
  }
  {
    const partial = clone(run), duplicate = partial.calls[1];
    for (const key of ['resultText', 'designText', 'designSha256', 'provider', 'providerEnvelope']) delete duplicate[key];
    Object.assign(duplicate, { status: 'failed-generation', countAsFailure: true,
      failureReason: 'duplicate-application-request-id' });
    partial.calls = [partial.calls[0], duplicate, ...plan.jobs.slice(2).map(job => ({ ...job, admitted: false,
      status: 'not-admitted-study-stopped', countAsFailure: true, costUsd: 0, costStatus: 'not-incurred' }))];
    partial.admittedCalls = 2; partial.status = 'partial-reconciliation-required';
    partial.stopReasons = ['duplicate-application-request-id'];
    const before = executions;
    const failed = await scoreStudy(json(plan), json(partial), json({ schema: review.schema, sources: [] }), { evaluate: fakeEvaluator });
    assert.equal(executions, before); assert.equal(failed.pairs.length, 18); assert.equal(failed.costs.unknownCostCalls.length, 2);
    assert.equal(failed.pairs.find(row => row.designCallId === partial.calls[0].id).schemaValid, true);
    assert.equal(failed.pairs.find(row => row.designCallId === duplicate.id).schemaValid, false);
    assert.ok(failed.pairs.every(row => row.jointAllPass === false));
    for (const family of Object.values(failed.families)) for (const arm of Object.values(family.arms)) assert.equal(arm.denominator, 3);
  }
  const pythonPlan = readFileSync(join(scratch, 'study', 'plan.json'));
  const pythonRunBytes = readFileSync(join(scratch, 'study', 'run.json'));
  const pythonRun = JSON.parse(pythonRunBytes);
  const pythonReview = { schema: 'pattern-language.design-review.v1', sources: pythonRun.calls.filter(call => call.source != null)
    .map(call => ({ id: call.id, sha256: call.sourceSha256 })) };
  const pythonScored = await scoreStudy(pythonPlan, pythonRunBytes, json(pythonReview), { evaluate: fakeEvaluator });
  assert.equal(pythonScored.costs.admittedCalls, 36, 'Actual mocked runner receipts must score without translation');
  assert.equal(pythonScored.costs.unknownCostCalls.length, 36);
  verifyReplay(scored, clone(scored));
  const diagnostic = clone(scored); diagnostic.runtime.node = 'different'; diagnostic.pairs[0].schemaErrors = ['diagnostic'];
  verifyReplay(scored, diagnostic);
  for (const mutate of [
    result => { result.pairs[0].results[0].behaviorPassed = false; },
    result => { result.pairs[0].results[0].observationCount++; },
    result => { result.families.batch.arms.direct.denominator = 2; },
    result => { result.costs.knownUsd = 0; },
  ]) {
    const changed = clone(scored); mutate(changed); assert.throws(() => verifyReplay(scored, changed), /Replay differs/);
  }
  console.log('SWE-2 scorer: unchanged parent closure, truthful provider/Free eligibility, serial barrier, exact raw design, complete review, separate outcomes and replay verified offline.');
} finally { rmSync(scratch, { recursive: true, force: true }); }
