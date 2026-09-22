import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest, frozenPaths as parentFrozenPaths, plannedJobs, summarize, verifyReplay } from '../design-decisions-v3/score.mjs';
export { digest, plannedJobs, summarize, verifyReplay };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = 'benchmarks/design-decisions-v3/';
const SWE_PREFIX = 'benchmarks/design-decisions-swe2/';
const PARENT_PLAN = 'benchmarks/design-decisions-v3/results/2026-09-22-prepared/plan.json';
const PARENT_SHA = '3070394134b2dd9a3bc63ccb54d5346c820217accc3386ca02593f04a79cef64';
const FAMILIES = ['jobs', 'batch'];
const SHA = /^[a-f0-9]{64}$/;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const tuple = job => [job.family, job.arm, job.repetition, job.stage].join('/');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Python str.strip() is the frozen normalization, including NEL but retaining BOM.
const pythonStrip = text => text.replace(/^[\u0009-\u000D\u001C-\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+|[\u0009-\u000D\u001C-\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$/gu, '');
function normalizedSource(text) {
  let source = pythonStrip(text);
  if (source.startsWith('```') && source.endsWith('```') && source.includes('\n')) {
    source = pythonStrip(source.slice(source.indexOf('\n') + 1, -3));
  }
  return `${source}\n`;
}

// This is an artifact-integrity check, not a cryptographic attestation of the
// provider. Receipts retain exactly what the local runner observed.
export function frozenPaths(repositoryRoot = ROOT) {
  const parentBytes = readFileSync(resolve(repositoryRoot, PARENT_PLAN));
  check(digest(parentBytes) === PARENT_SHA, 'Changed original prepared parent plan');
  const parent = JSON.parse(parentBytes);
  assert.deepEqual(parentFrozenPaths(repositoryRoot), Object.keys(parent.files).sort(), 'Original parent closure changed');
  const paths = [...Object.keys(parent.files), PARENT_PLAN,
    'scripts/run-design-swe2.py', 'scripts/test_design_swe2_runner.py'];
  function walk(directory) {
    for (const entry of readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true })) {
      if (entry.name === 'results' || (directory === SWE_PREFIX.slice(0, -1) && entry.name === 'README.md')) continue;
      const path = `${directory}/${entry.name}`;
      check(!entry.isSymbolicLink(), `Frozen dependency is a symlink: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Unsupported frozen dependency: ${path}`);
    }
  }
  walk(SWE_PREFIX.slice(0, -1));
  for (const path of paths) check(lstatSync(resolve(repositoryRoot, path)).isFile(), `Missing or symlinked frozen dependency: ${path}`);
  return [...new Set(paths)].sort();
}

export function validateStudy(planBytes, runBytes, reviewBytes, repositoryRoot = ROOT) {
  const plan = JSON.parse(planBytes), run = JSON.parse(runBytes), review = JSON.parse(reviewBytes);
  check(plan.schema === 'pattern-language.design-swe2-plan.v1', 'Unsupported plan schema');
  check(run.schema === 'pattern-language.design-swe2-generation.v1', 'Unsupported run schema');
  check(review.schema === 'pattern-language.design-review.v1', 'Unsupported review schema');
  check(['generation-complete-awaiting-review', 'partial-reconciliation-required'].includes(run.status),
    'Run must be finalized before evaluation');
  check(run.planSha256 === digest(planBytes), 'Run does not match exact plan bytes');
  check(plain(plan.files), 'Missing frozen files');
  assert.deepEqual(Object.keys(plan.files).sort(), frozenPaths(repositoryRoot), 'Frozen dependency closure differs from current tree');
  for (const [name, file] of Object.entries(plan.files)) {
    const path = resolve(repositoryRoot, name), rel = relative(repositoryRoot, path);
    check(name && !isAbsolute(name) && !rel.startsWith('..') && !isAbsolute(rel) && rel === name, `Invalid frozen path: ${name}`);
    check(typeof file?.text === 'string' && SHA.test(file.sha256), `Invalid frozen file: ${name}`);
    check(digest(file.text) === file.sha256, `Embedded file hash mismatch: ${name}`);
    check(digest(readFileSync(path)) === file.sha256, `Local frozen file changed: ${name}`);
  }
  // The verified local runner is the canonical protocol definition. This pure
  // validation imports no candidate, probes no executable and contacts no service.
  const validationScratch = mkdtempSync(join(tmpdir(), 'swe2-protocol-check-'));
  chmodSync(validationScratch, 0o700);
  let validation;
  try {
    const planPath = join(validationScratch, 'plan.json');
    writeFileSync(planPath, planBytes, { mode: 0o600, flag: 'wx' });
    validation = spawnSync('python3', ['-c', `
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('swe2_score_protocol',sys.argv[1])
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
plan=json.loads(pathlib.Path(sys.argv[3]).read_text())
runner.validate_plan(plan)
runner.verify_current_files(plan,pathlib.Path(sys.argv[2]))
`, resolve(repositoryRoot, 'scripts/run-design-swe2.py'), repositoryRoot, planPath],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  } finally { rmSync(validationScratch, { recursive: true, force: true }); }
  check(validation.status === 0, `Frozen protocol validation failed: ${validation.error?.message ?? validation.stderr}`);
  const protocol = plan.protocol;
  const prepared = Date.parse(plan.preparedAt), started = Date.parse(run.startedAt), finished = Date.parse(run.finishedAt);
  check(Number.isFinite(prepared) && Number.isFinite(started) && Number.isFinite(finished)
    && prepared <= started && started <= finished, 'Invalid plan/run chronology');
  const qualification = protocol.qualification;
  check(plain(qualification) && Object.keys(qualification).sort().join(',') === 'evidenceDigest,expiresAt,runtimeDigest,runtimeVersion'
    && `xcb ${qualification.runtimeVersion}` === protocol.cliVersions.xcb
    && qualification.runtimeDigest === protocol.executableHashes.xcb && SHA.test(qualification.evidenceDigest)
    && Number.isSafeInteger(qualification.expiresAt) && qualification.expiresAt > prepared,
  'Invalid frozen application qualification');
  assert.deepEqual(plan.jobs, plannedJobs(), 'Plan must preserve the complete ordered 36-job schedule');
  check(Array.isArray(run.calls) && run.calls.length === 36, 'Run must cover every planned job, including skips');
  check(run.denominator === 36 && run.pairDenominator === 18 && run.sourceReviewRequired === true
    && run.evaluationStatus === 'not-run', 'Changed run denominator or pre-evaluation boundary');
  for (const field of ['cliVersions', 'executablePaths', 'executableHashes']) {
    assert.deepEqual(run[field], protocol[field], `Run executable ${field} differs from plan`);
  }
  check(Array.isArray(run.stopReasons) && run.stopReasons.every(reason => typeof reason === 'string' && reason)
    && ((run.status === 'partial-reconciliation-required') === (run.stopReasons.length > 0)), 'Final status and stop reasons differ');
  const calls = new Map(), requestIds = new Set();
  let previousFinished = started, stopped = false;
  for (let index = 0; index < plan.jobs.length; index++) {
    const job = plan.jobs[index], call = run.calls[index];
    check(call?.id === job.id && tuple(call) === tuple(job), `Call metadata/order differs from planned job: ${job.id}`);
    check(['generated-not-reviewed', 'failed-generation', 'skipped-no-design-text', 'not-admitted-study-stopped'].includes(call.status)
      && typeof call.admitted === 'boolean', `Invalid finalized call status: ${call.id}`);
    check(call.admitted === ['generated-not-reviewed', 'failed-generation'].includes(call.status), `Call status/admission mismatch: ${call.id}`);
    check(call.countAsFailure === (call.status !== 'generated-not-reviewed'), `Call failure accounting mismatch: ${call.id}`);
    if (call.admitted) {
      check(!stopped, `Generation continued after admission stopped: ${call.id}`);
      check(call.costUsd === null && call.costStatus === 'not-reported', `Unexpected cost telemetry: ${call.id}`);
      check(typeof call.prompt === 'string' && digest(call.prompt) === call.promptSha256, `Prompt hash mismatch: ${call.id}`);
      const admittedAt = Date.parse(call.admittedAt), finishedAt = Date.parse(call.finishedAt);
      check(Number.isFinite(admittedAt) && Number.isFinite(finishedAt) && admittedAt <= finishedAt && finishedAt <= finished,
        `Invalid call timing: ${call.id}`);
      check(admittedAt >= previousFinished, 'Generation admission crossed a prior call or design/code barrier');
      const eligible = call.eligibility;
      check(plain(eligible) && Object.keys(eligible).sort().join(',') === 'account,accountBinding,capabilitiesSha256,catalogCostTier,catalogModelUid,catalogSha256,checkedAt,model,modelObservedAtMs,qualification'
        && eligible.account === protocol.requestedAccount && eligible.model === protocol.requestedModel
        && eligible.catalogModelUid === 'swe-2-high' && eligible.catalogCostTier === 'Free'
        && SHA.test(eligible.capabilitiesSha256) && SHA.test(eligible.catalogSha256), `Invalid Free catalog or route evidence: ${call.id}`);
      assert.deepEqual(eligible.qualification, qualification, `Changed application qualification: ${call.id}`);
      assert.deepEqual(eligible.accountBinding, { method: 'local-imported-credential-equality', matched: true }, `Unbound catalog account: ${call.id}`);
      const checkedAt = Date.parse(eligible.checkedAt);
      check(Number.isFinite(checkedAt) && checkedAt >= previousFinished && checkedAt <= admittedAt && admittedAt - checkedAt <= 30000
        && qualification.expiresAt > admittedAt && Number.isSafeInteger(eligible.modelObservedAtMs)
        && checkedAt - eligible.modelObservedAtMs >= -999 && checkedAt - eligible.modelObservedAtMs < 86400000,
      `Stale or post-admission qualification/catalog evidence: ${call.id}`);
      previousFinished = finishedAt;
    } else {
      check(call.costUsd === 0 && call.costStatus === 'not-incurred' && call.prompt == null && call.promptSha256 == null
        && call.promptFiles == null && call.priorDesignSha256 == null && call.resultText == null
        && call.provider == null && call.providerEnvelope == null && call.eligibility == null,
      `Unadmitted call contains generated provenance: ${call.id}`);
      if (call.status === 'not-admitted-study-stopped') {
        check(run.stopReasons.length > 0, 'Stopped call requires partial-run stop evidence');
        stopped = true;
      } else check(!stopped, 'A skipped job follows the study stop boundary');
    }
    if (call.resultText != null) {
      check(call.admitted && typeof call.resultText === 'string'
        && Buffer.byteLength(call.resultText) <= protocol.maxOutputBytes, `Invalid raw result text: ${call.id}`);
      assert.deepEqual(call.provider, { account: protocol.requestedAccount, model: protocol.requestedModel,
        reportedModelRevision: null, usage: null }, `Unexpected provider identity or telemetry: ${call.id}`);
      const envelope = call.providerEnvelope;
      check(plain(envelope) && Object.keys(envelope).sort().join(',') === 'account,model,outcome,requestId,status,version'
        && envelope.version === 1 && envelope.status === 'completed' && typeof envelope.requestId === 'string'
        && envelope.requestId.length > 0 && !requestIds.has(envelope.requestId)
        && envelope.account === protocol.requestedAccount && envelope.model === protocol.requestedModel
        && call.exitCode === 0 && call.timeout === false && call.custodyUncertain !== true,
      `Unexpected generated provider envelope: ${call.id}`);
      assert.deepEqual(envelope.outcome, { terminal: 'completed', joined: true, effects: 'none' }, `Unsettled or effectful provider outcome: ${call.id}`);
      requestIds.add(envelope.requestId);
      if (call.status === 'failed-generation') {
        if (!pythonStrip(call.resultText)) check(call.failureReason === 'empty-result', `Empty response has changed failure reason: ${call.id}`);
        else {
          check(call.stage === 'code' && ['result-not-parseable-module', 'local-syntax-check-unavailable'].includes(call.failureReason),
            `Completed provider response has inconsistent failure status: ${call.id}`);
          if (call.failureReason === 'local-syntax-check-unavailable') {
            check(run.stopReasons.includes(call.failureReason), `Syntax check failure lacks stop evidence: ${call.id}`);
            stopped = true;
          }
        }
      }
    } else {
      check(call.provider == null && call.providerEnvelope == null, `Provider response has no raw result: ${call.id}`);
      if (call.admitted) {
        check(call.status === 'failed-generation' && typeof call.failureReason === 'string'
          && run.stopReasons.length > 0, `Transport failure lacks stop evidence: ${call.id}`);
        stopped = true;
      }
    }
    if (call.stage === 'design') {
      check(call.source == null && call.sourceSha256 == null && call.priorDesignSha256 == null, `Design call contains code provenance: ${call.id}`);
      if (call.resultText != null) {
        check(call.designText === call.resultText && digest(call.designText) === call.designSha256,
          `Design must preserve exact raw result text: ${call.id}`);
      } else check(call.designText == null && call.designSha256 == null, `Design hash/text has no raw response: ${call.id}`);
      if (call.status === 'generated-not-reviewed') check(typeof call.designText === 'string' && pythonStrip(call.designText), `Generated design text is absent: ${call.id}`);
    } else {
      check(call.designText == null && call.designSha256 == null, `Code call contains design output: ${call.id}`);
      if (call.source != null) {
        check(call.status === 'generated-not-reviewed' && typeof call.source === 'string' && digest(call.source) === call.sourceSha256,
          `Source hash/status mismatch: ${call.id}`);
        check(typeof call.resultText === 'string' && pythonStrip(call.resultText)
          && call.source === normalizedSource(call.resultText), `Source differs from permitted raw-text normalization: ${call.id}`);
      } else check(call.sourceSha256 == null && call.status !== 'generated-not-reviewed', `Generated source missing: ${call.id}`);
    }
    if (call.status === 'generated-not-reviewed') check(call.failureReason == null && call.resultText != null, `Generated call has failure provenance: ${call.id}`);
    calls.set(call.id, call);
  }
  const byTuple = new Map([...calls.values()].map(call => [tuple(call), call]));
  for (const call of calls.values()) {
    const prior = byTuple.get(tuple({ ...call, stage: 'design' }));
    if (call.status === 'skipped-no-design-text') {
      check(call.stage === 'code' && (typeof prior.designText !== 'string' || !pythonStrip(prior.designText)),
        `Code was skipped despite available raw design text: ${call.id}`);
    }
    if (!call.admitted) continue;
    const paths = [`${PREFIX}artifact.md`, `${PREFIX}facts.md`, `${PREFIX}guidance/${call.arm}.md`,
      `${PREFIX}tasks/${call.family}/task.md`, `${PREFIX}tasks/${call.family}/model.json`];
    const sections = [protocol.promptIntros[call.stage], ...paths.map(path => pythonStrip(plan.files[path].text))];
    if (call.stage === 'code') {
      check(typeof prior.designText === 'string' && pythonStrip(prior.designText) && prior.designSha256 === call.priorDesignSha256,
        `Code must use its own exact raw design: ${call.id}`);
      sections.push(protocol.priorDesignLabel + prior.designText);
    }
    assert.deepEqual(call.promptFiles, paths, `Prompt file provenance differs: ${call.id}`);
    check(call.prompt === `${sections.join('\n\n')}\n`, `Prompt differs from frozen instructions and own exact raw design: ${call.id}`);
  }
  const admitted = [...calls.values()].filter(call => call.admitted);
  check(run.admittedCalls === admitted.length, 'Admitted call count differs from recorded calls');
  check(run.knownCostUsd === 0 && run.costStatus === 'not-reported' && run.costComplete === (admitted.length === 0),
    'Reported cost telemetry differs from unsupported provider reporting');
  check(Array.isArray(review.sources), 'Review must list reviewed sources');
  const reviewed = new Set();
  for (const source of review.sources) {
    const call = calls.get(source.id);
    check(call?.stage === 'code' && typeof call.source === 'string' && !reviewed.has(source.id), `Unknown or duplicate reviewed source: ${source.id}`);
    check(source.sha256 === call.sourceSha256, `Review source hash mismatch: ${source.id}`);
    reviewed.add(source.id);
  }
  for (const call of calls.values()) if (call.source != null) check(reviewed.has(call.id), `Unreviewed source: ${call.id}`);
  return { plan, run, calls, planSha256: digest(planBytes), runSha256: digest(runBytes), reviewSha256: digest(reviewBytes) };
}

export async function scoreStudy(planBytes, runBytes, reviewBytes, options = {}) {
  // Validate the entire closure, every prompt and every present source's review
  // before importing an evaluator or executing even the first candidate.
  const study = validateStudy(planBytes, runBytes, reviewBytes, options.repositoryRoot ?? ROOT);
  const { parseArtifact } = await import('../design-decisions-v3/artifact.mjs');
  const evaluate = options.evaluate ?? (await import('../design-decisions-v3/evaluate.mjs')).evaluate;
  const metadata = new Map();
  const assessors = new Map();
  for (const family of FAMILIES) {
    metadata.set(family, (await import(`../design-decisions-v3/tasks/${family}/cases.mjs`)).cases);
    assessors.set(family, (await import(`../design-decisions-v3/tasks/${family}/design-check.mjs`)).assessDesign);
  }
  const byTuple = new Map([...study.calls.values()].map(call => [tuple(call), call]));
  const scratch = mkdtempSync(join(tmpdir(), 'design-reviewed-'));
  chmodSync(scratch, 0o700);
  const pairs = [];
  try {
    for (const job of study.plan.jobs.filter(job => job.stage === 'design')) {
      const designCall = byTuple.get(tuple(job));
      const codeCall = byTuple.get(tuple({ ...job, stage: 'code' }));
      const designText = designCall.designText ?? '';
      const parsed = parseArtifact(designText, job.family);
      const adequacy = parsed.valid ? assessors.get(job.family)(parsed.artifact)
        : { adequate: false, errors: ['Invalid or missing design schema'] };
      const selected = metadata.get(job.family);
      let evaluation;
      if (codeCall.source == null) {
        evaluation = {
          schemaValid: parsed.valid, schemaErrors: parsed.errors,
          modelAdequate: adequacy.adequate, adequacyErrors: adequacy.errors,
          total: selected.length,
          results: selected.map(test => ({ id: test.id, group: test.group,
            behaviorPassed: false, agreementPassed: null, observationCount: 0,
            error: `No generated source (${codeCall.status})` })),
        };
      } else {
        const sourcePath = join(scratch, `${codeCall.id}.mjs`);
        const designPath = join(scratch, `${designCall.id}.txt`);
        writeFileSync(sourcePath, codeCall.source, { mode: 0o600, flag: 'wx' });
        writeFileSync(designPath, designText, { mode: 0o600, flag: 'wx' });
        evaluation = await evaluate(sourcePath, designPath, job.family);
        check(evaluation.sourceSha256 === codeCall.sourceSha256 && evaluation.designSha256 === digest(designText),
          `Evaluator artifact provenance mismatch: ${codeCall.id}`);
        check(evaluation.schemaValid === parsed.valid && evaluation.modelAdequate === adequacy.adequate,
          `Evaluator design assessment mismatch: ${codeCall.id}`);
      }
      check(evaluation.results?.length === selected.length && evaluation.results.every((row, index) =>
        row.id === selected[index].id && row.group === selected[index].group && typeof row.behaviorPassed === 'boolean'
        && [true, false, null].includes(row.agreementPassed) && Number.isSafeInteger(row.observationCount)
        && row.observationCount >= 0), `Evaluator case mismatch: ${codeCall.id}`);
      const behaviorAllPass = codeCall.source != null && evaluation.results.every(row => row.behaviorPassed);
      const testedAgreementAllPass = codeCall.source != null && evaluation.results.every(row => row.agreementPassed === true);
      const agreementAllPass = parsed.valid && adequacy.adequate && testedAgreementAllPass;
      pairs.push({ id: `${job.family}-${job.arm}-r${job.repetition}`, family: job.family, arm: job.arm, repetition: job.repetition,
        designCallId: designCall.id, codeCallId: codeCall.id,
        designGenerationStatus: designCall.status, codeGenerationStatus: codeCall.status,
        designSha256: designCall.designSha256 ?? null, sourceSha256: codeCall.sourceSha256 ?? null,
        designPromptSha256: designCall.promptSha256 ?? null, codePromptSha256: codeCall.promptSha256 ?? null,
        designBytes: designCall.designText == null ? null : Buffer.byteLength(designText),
        sourceBytes: codeCall.source == null ? null : Buffer.byteLength(codeCall.source),
        sourceLines: codeCall.source == null ? null : codeCall.source.split('\n').length - Number(codeCall.source.endsWith('\n')),
        schemaValid: parsed.valid, schemaErrors: evaluation.schemaErrors,
        modelAdequate: adequacy.adequate, adequacyErrors: evaluation.adequacyErrors,
        behaviorAllPass, testedAgreementAllPass, agreementAllPass,
        agreementUnavailableReason: codeCall.source == null ? 'missing-code'
          : !parsed.valid ? 'invalid-or-missing-design' : !adequacy.adequate ? 'inadequate-design' : null,
        jointAllPass: designCall.status === 'generated-not-reviewed' && codeCall.status === 'generated-not-reviewed'
          && parsed.valid && adequacy.adequate && behaviorAllPass && agreementAllPass === true,
        total: selected.length, behaviorPassed: evaluation.results.filter(row => row.behaviorPassed).length,
        agreementPassed: evaluation.results.filter(row => row.agreementPassed === true).length,
        agreementUnobserved: evaluation.results.filter(row => row.agreementPassed === null).length,
        results: evaluation.results,
      });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const admitted = [...study.calls.values()].filter(call => call.admitted);
  return {
    schema: 'pattern-language.design-swe2-study-evaluation.v1', planSha256: study.planSha256,
    runSha256: study.runSha256, reviewSha256: study.reviewSha256, generationStatus: study.run.status,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    costs: { plannedCalls: 36, admittedCalls: admitted.length,
      knownUsd: null, telemetry: 'not-reported', eligibility: 'account-catalog-free',
      unknownCostCalls: admitted.filter(call => call.costUsd === null).map(call => call.id) },
    pairs, families: summarize(pairs),
    interpretation: 'Exploratory two-task SWE-2 study, three planned pairs per arm and family. Free is the observed account catalog tier, not reported billing. Cases and observations are not independent trials; conformance requires a valid and adequate model. Provider changes preclude a causal comparison with prior Claude results.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const usage = 'Usage: node score.mjs PLAN.json RUN.json REVIEWED.json [--out EVALUATION.json] [--replay EXPECTED.json]';
    if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
      console.log(`${usage}\n\nReview schema: {schema:"pattern-language.design-review.v1",sources:[{id,sha256}]}\nAll present code requires its exact static-review hash before any execution. No provider calls.\nReplay ignores diagnostic error wording and runtime versions.`);
      process.exit(0);
    }
    const [plan, run, review, ...options] = process.argv.slice(2);
    check(plan && run && review && options.length % 2 === 0, usage);
    let output, replay;
    for (let index = 0; index < options.length; index += 2) {
      if (options[index] === '--out' && !output) output = options[index + 1];
      else if (options[index] === '--replay' && !replay) replay = options[index + 1];
      else throw new Error(`Unknown or duplicate option: ${options[index]}`);
    }
    const result = await scoreStudy(readFileSync(plan), readFileSync(run), readFileSync(review));
    if (replay) verifyReplay(result, JSON.parse(readFileSync(replay)));
    const rendered = `${JSON.stringify(result, null, 2)}\n`;
    if (output) writeFileSync(output, rendered, { mode: 0o600, flag: 'wx' });
    else process.stdout.write(rendered);
    process.stderr.write(replay ? 'Replay matches every recorded outcome.\n' : 'Scored all 18 planned design/code pairs; failures remain in denominators.\n');
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
