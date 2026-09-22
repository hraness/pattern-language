import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = 'benchmarks/design-decisions-v3/';
const FAMILIES = ['jobs', 'batch'];
const ARMS = ['direct', 'checklist', 'pattern'];
const STAGES = ['design', 'code'];
const SHA = /^[a-f0-9]{64}$/;
const METRICS = ['schemaValid', 'modelAdequate', 'behaviorAllPass', 'agreementAllPass', 'jointAllPass'];
export const digest = value => createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const tuple = job => [job.family, job.arm, job.repetition, job.stage].join('/');
const pairKey = job => [job.family, job.arm, job.repetition].join('/');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MODEL = 'claude-haiku-4-5';
const SYSTEM = 'Produce only the requested design artifact or JavaScript module from the supplied public requirements. Use no tools or external context.';
const INTROS = {
  design: 'Design a solution to the task below. Use only the supplied prompt. Do not use tools, browse, or inspect repository files. Return only one JSON design artifact conforming to the supplied schema, with no Markdown fences.',
  code: 'Implement the task below using your prior design response, reproduced exactly at the end of this prompt. Use only the supplied prompt. Do not use tools, browse, or inspect repository files. Return only one complete ES module, with no Markdown fences.',
};
const PRIOR_LABEL = 'Your exact prior design response:\n';
// Python str.strip(), used by the frozen provider decoder/prompt constructor,
// differs from JavaScript trim(): NEL/control separators count, BOM does not.
const pythonStrip = text => text.replace(/^[\u0009-\u000D\u001C-\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+|[\u0009-\u000D\u001C-\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$/gu, '');

export function expectedProtocol(cliVersions) {
  return {
    maxCalls: 36, maxUsdPerCall: 0.5, maxTotalUsd: 18, concurrency: 3, timeoutSecondsPerCall: 240, retryBudget: 0,
    requestedModel: MODEL,
    command: ['claude', '-p', '--model', MODEL, '--safe-mode', '--tools', '', '--strict-mcp-config',
      '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
      '--max-budget-usd', '0.50', '--system-prompt', SYSTEM],
    systemPrompt: SYSTEM, promptIntros: INTROS, priorDesignLabel: PRIOR_LABEL,
    cliVersions, repetitions: 3, families: FAMILIES, arms: ARMS, stages: STAGES, tools: [], feedback: 'none',
    schedule: 'Rotate family and arm order by repetition; all design before all code.',
    denominator: 36, pairDenominator: 18, denominatorPerFamilyArmStage: 3,
    pairDenominatorPerFamilyArm: 3, missingOrSkippedCountsAsFailure: true,
    designForwarding: 'Exact resultText, including malformed artifacts; no validation feedback.',
    samplingSeed: null, immutableProviderRevision: null,
    limitations: [
      'CLI budget is configured, not an independent provider-side hard spending guarantee.',
      'No runner retries; opaque CLI transport retries are not independently observable.',
      'Provider alias and reported identity cannot prove an immutable model revision.',
      'Three exploratory repetitions per cell do not establish general effectiveness.',
      'Two families cannot occupy each order position equally across three repetitions.',
    ],
  };
}

// Enumerate the complete local benchmark closure, not just files a supplied
// plan elects to mention. Runtime imports, faults and their self-tests all freeze.
export function frozenPaths(repositoryRoot = ROOT) {
  const paths = [];
  function walk(directory) {
    for (const entry of readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true })) {
      if (entry.name === 'results' || (directory === PREFIX.slice(0, -1) && entry.name === 'README.md')) continue;
      const path = `${directory}/${entry.name}`;
      check(!entry.isSymbolicLink(), `Frozen dependency is a symlink: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Unsupported frozen dependency: ${path}`);
    }
  }
  walk(PREFIX.slice(0, -1));
  for (const path of ['scripts/run-design-study.py', 'scripts/test_design_runner.py', 'scripts/run-lifecycle-study.py']) {
    check(lstatSync(resolve(repositoryRoot, path)).isFile(), `Missing or symlinked runner dependency: ${path}`);
    paths.push(path);
  }
  const required = ['artifact.md', 'artifact.mjs', 'facts.md', 'protocol.md', 'score.mjs', 'test-score.mjs', 'self-test.mjs',
    'evaluate.mjs', 'worker.mjs', 'test-artifact.mjs', 'guidance/freeze.json', 'tasks/freeze.json', 'tasks/review-fixes.json',
    ...ARMS.map(arm => `guidance/${arm}.md`),
    ...FAMILIES.flatMap(family => ['task.md', 'model.json', 'cases.mjs', 'reference.mjs', 'design-check.mjs', 'self-test.mjs']
      .map(name => `tasks/${family}/${name}`))].map(name => PREFIX + name);
  for (const name of required) check(paths.includes(name), `Missing local frozen dependency: ${name}`);
  return paths.sort();
}

export function plannedJobs() {
  const jobs = [];
  for (const stage of STAGES) for (const repetition of [1, 2, 3]) {
    const rotate = values => [...values.slice((repetition - 1) % values.length), ...values.slice(0, (repetition - 1) % values.length)];
    for (const family of rotate(FAMILIES)) for (const arm of rotate(ARMS)) {
      jobs.push({ id: `${family}-${arm}-r${repetition}-${stage}`, family, arm, repetition, stage });
    }
  }
  return jobs;
}

function normalizedSource(text) {
  let source = pythonStrip(text);
  if (source.startsWith('```') && source.endsWith('```') && source.includes('\n')) {
    source = pythonStrip(source.slice(source.indexOf('\n') + 1, -3));
  }
  return `${source}\n`;
}

function validateFreezes(files) {
  const taskPath = `${PREFIX}tasks/freeze.json`;
  const task = JSON.parse(files[taskPath].text);
  const guidance = JSON.parse(files[`${PREFIX}guidance/freeze.json`].text);
  const fixes = JSON.parse(files[`${PREFIX}tasks/review-fixes.json`].text);
  check(task.schema === 'pattern-language.task-freeze.v1' && plain(task.files), 'Invalid task freeze receipt');
  check(guidance.schema === 'pattern-language.guidance-freeze.v1' && plain(guidance.files), 'Invalid guidance freeze receipt');
  const taskMember = name => FAMILIES.some(family => name.startsWith(`${PREFIX}tasks/${family}/`));
  check(fixes.schema === 'pattern-language.pre-generation-review-fixes.v1' && plain(fixes.files)
    && fixes.initialTaskFreezeSha256 === files[taskPath].sha256 && fixes.guidanceUnchanged === true
    && fixes.generationCalls === 0, 'Invalid pre-generation task review repair receipt');
  const effectiveTaskFiles = { ...task.files };
  for (const [name, fix] of Object.entries(fixes.files)) {
    check(taskMember(name) && !/\/(task\.md|model\.json)$/.test(name)
      && fix.initialSha256 === (task.files[name] ?? null) && SHA.test(fix.sha256), `Invalid task review repair: ${name}`);
    effectiveTaskFiles[name] = fix.sha256;
  }
  const taskNames = Object.keys(files).filter(taskMember).sort();
  assert.deepEqual(Object.keys(effectiveTaskFiles).sort(), taskNames, 'Task freeze and review repairs omit a dependency');
  const guidanceNames = ['artifact.md', 'facts.md', ...ARMS.map(arm => `guidance/${arm}.md`)].map(name => PREFIX + name).sort();
  assert.deepEqual(Object.keys(guidance.files).sort(), guidanceNames, 'Guidance freeze omits a prompt dependency');
  for (const receipt of [{ files: effectiveTaskFiles }, guidance]) for (const [name, hash] of Object.entries(receipt.files)) {
    check(hash === files[name]?.sha256, `Freeze receipt hash mismatch: ${name}`);
  }
  check(guidance.taskFreezeSha256 === files[taskPath].sha256, 'Guidance is not bound to the exact task freeze');
  check(Number.isFinite(Date.parse(task.frozenAt)) && Number.isFinite(Date.parse(guidance.frozenAt))
    && Date.parse(task.frozenAt) <= Date.parse(guidance.frozenAt), 'Task freeze must precede final guidance freeze');
  check(Number.isFinite(Date.parse(fixes.recordedAt)) && Date.parse(fixes.recordedAt) >= Date.parse(guidance.frozenAt),
    'Review repair receipt must preserve its post-guidance chronology');
}

export function validateStudy(planBytes, runBytes, reviewBytes, repositoryRoot = ROOT) {
  const plan = JSON.parse(planBytes), run = JSON.parse(runBytes), review = JSON.parse(reviewBytes);
  check(plan.schema === 'pattern-language.design-plan.v1', 'Unsupported plan schema');
  check(run.schema === 'pattern-language.design-generation.v1', 'Unsupported run schema');
  check(review.schema === 'pattern-language.design-review.v1', 'Unsupported review schema');
  check(['generation-complete-awaiting-review', 'partial-reconciliation-required'].includes(run.status),
    'Run must be finalized before evaluation');
  check(run.planSha256 === digest(planBytes), 'Run does not match exact plan bytes');
  check(plain(plan.protocol?.cliVersions) && Object.keys(plan.protocol.cliVersions).sort().join(',') === 'claude,node'
    && Object.values(plan.protocol.cliVersions).every(value => typeof value === 'string' && value.length > 0), 'Missing CLI versions');
  assert.deepEqual(plan.protocol, expectedProtocol(plan.protocol.cliVersions), 'Changed frozen protocol, command or limits');
  check(plain(plan.files), 'Missing frozen files');
  assert.deepEqual(Object.keys(plan.files).sort(), frozenPaths(repositoryRoot), 'Frozen dependency closure differs from current tree');
  for (const [name, file] of Object.entries(plan.files)) {
    const path = resolve(repositoryRoot, name), rel = relative(repositoryRoot, path);
    check(name && !isAbsolute(name) && !rel.startsWith('..') && !isAbsolute(rel) && rel === name, `Invalid frozen path: ${name}`);
    check(typeof file?.text === 'string' && SHA.test(file.sha256), `Invalid frozen file: ${name}`);
    check(digest(file.text) === file.sha256, `Embedded file hash mismatch: ${name}`);
    check(digest(readFileSync(path)) === file.sha256, `Local frozen file changed: ${name}`);
  }
  validateFreezes(plan.files);
  assert.deepEqual(plan.jobs, plannedJobs(), 'Plan must preserve the complete ordered 36-job schedule');
  check(Array.isArray(run.calls) && run.calls.length === 36, 'Run must cover every planned job, including skips');
  check(run.denominator === 36 && run.pairDenominator === 18 && run.sourceReviewRequired === true
    && run.evaluationStatus === 'not-run', 'Changed run denominator or pre-evaluation boundary');
  assert.deepEqual(run.cliVersions, plan.protocol.cliVersions, 'Run CLI versions differ from plan');
  check(Array.isArray(run.stopReasons) && run.stopReasons.every(reason => typeof reason === 'string')
    && ((run.status === 'partial-reconciliation-required') === (run.stopReasons.length > 0)), 'Final status and stop reasons differ');
  const calls = new Map();
  for (let index = 0; index < plan.jobs.length; index++) {
    const job = plan.jobs[index], call = run.calls[index];
    check(call?.id === job.id && tuple(call) === tuple(job), `Call metadata/order differs from planned job: ${job.id}`);
    check(['generated-not-reviewed', 'failed-generation', 'skipped-no-design-text', 'not-admitted-study-stopped'].includes(call.status)
      && typeof call.admitted === 'boolean', `Invalid finalized call status: ${call.id}`);
    check(call.admitted === ['generated-not-reviewed', 'failed-generation'].includes(call.status), `Call status/admission mismatch: ${call.id}`);
    check(call.countAsFailure === (call.status !== 'generated-not-reviewed'), `Call failure accounting mismatch: ${call.id}`);
    check(call.costUsd === null || (Number.isFinite(call.costUsd) && call.costUsd >= 0), `Invalid cost: ${call.id}`);
    if (call.admitted) {
      check(typeof call.prompt === 'string' && digest(call.prompt) === call.promptSha256, `Prompt hash mismatch: ${call.id}`);
      check(Number.isFinite(Date.parse(call.admittedAt)) && Number.isFinite(Date.parse(call.finishedAt))
        && Date.parse(call.admittedAt) <= Date.parse(call.finishedAt), `Invalid call timing: ${call.id}`);
    } else {
      check(call.costUsd === 0 && call.prompt == null && call.promptSha256 == null && call.promptFiles == null
        && call.priorDesignSha256 == null && call.resultText == null, `Unadmitted call contains generated provenance: ${call.id}`);
      if (call.status === 'not-admitted-study-stopped') check(run.stopReasons.length > 0, 'Stopped call requires partial-run stop evidence');
    }
    if (call.resultText != null) check(typeof call.resultText === 'string', `Invalid raw result text: ${call.id}`);
    if (call.stage === 'design') {
      check(call.source == null && call.sourceSha256 == null && call.priorDesignSha256 == null, `Design call contains code provenance: ${call.id}`);
      if (call.resultText != null) {
        check(call.admitted && call.designText === call.resultText && digest(call.designText) === call.designSha256,
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
    if (call.status === 'generated-not-reviewed') {
      check(call.costUsd !== null && call.costUsd <= 0.5 + 1e-9 && call.exitCode === 0 && call.timeout === false,
        `Generated call violates resource/provider success: ${call.id}`);
      check(call.provider?.model === MODEL && call.provider?.canonicalModel === MODEL
        && call.provider?.provider === 'firstParty' && call.provider?.turns === 1, `Unexpected generated provider identity: ${call.id}`);
      check(call.providerEnvelope?.type === 'result' && call.providerEnvelope?.subtype === 'success'
        && !call.providerEnvelope?.is_error, `Unexpected generated provider envelope: ${call.id}`);
      check(!['max_tokens', 'max_output_tokens', 'length', 'model_context_window_exceeded', 'refusal'].includes(
        call.providerEnvelope.stop_reason ?? call.providerEnvelope.stopReason), `Generated call has failure stop reason: ${call.id}`);
    }
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
    const sections = [INTROS[call.stage], ...paths.map(path => pythonStrip(plan.files[path].text))];
    if (call.stage === 'code') {
      check(typeof prior.designText === 'string' && pythonStrip(prior.designText) && prior.designSha256 === call.priorDesignSha256,
        `Code must use its own exact raw design: ${call.id}`);
      sections.push(PRIOR_LABEL + prior.designText);
    }
    assert.deepEqual(call.promptFiles, paths, `Prompt file provenance differs: ${call.id}`);
    check(call.prompt === `${sections.join('\n\n')}\n`, `Prompt differs from frozen instructions and own exact raw design: ${call.id}`);
  }
  // Every complete concurrency window drains before the next is admitted;
  // notably all design responses precede every code request.
  let previousFinished = -Infinity;
  for (let offset = 0; offset < run.calls.length; offset += 3) {
    const window = run.calls.slice(offset, offset + 3).filter(call => call.admitted);
    if (!window.length) continue;
    check(Math.min(...window.map(call => Date.parse(call.admittedAt))) >= previousFinished, 'Generation admission crossed a prior window or design/code barrier');
    previousFinished = Math.max(...window.map(call => Date.parse(call.finishedAt)));
  }
  const admitted = [...calls.values()].filter(call => call.admitted);
  check(run.admittedCalls === admitted.length, 'Admitted call count differs from recorded calls');
  check(Number.isFinite(run.knownCostUsd) && Math.abs(run.knownCostUsd - admitted.reduce((sum, call) => sum + (call.costUsd ?? 0), 0)) < 1e-8,
    'Reported total cost differs from recorded calls');
  check(run.costComplete === admitted.every(call => call.costUsd !== null), 'Cost completeness differs from recorded calls');
  if (!run.stopReasons.length) check(run.costComplete && run.knownCostUsd <= 18 + 1e-9, 'Complete run lacks bounded known costs');
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

export function summarize(pairs) {
  const byPair = new Map(pairs.map(pair => [pairKey(pair), pair]));
  const families = {};
  for (const family of FAMILIES) {
    const arms = {};
    for (const arm of ARMS) {
      const rows = [1, 2, 3].map(repetition => byPair.get(pairKey({ family, arm, repetition })));
      arms[arm] = { denominator: 3, ...Object.fromEntries(METRICS.map(metric =>
        [metric, rows.filter(row => row?.[metric] === true).length])) };
    }
    const pairedComparisons = [];
    for (const repetition of [1, 2, 3]) for (const metric of ['behaviorAllPass', 'agreementAllPass', 'jointAllPass']) {
      const outcome = arm => byPair.get(pairKey({ family, arm, repetition }))?.[metric] === true;
      pairedComparisons.push({ repetition, metric, pattern: outcome('pattern'), checklist: outcome('checklist') });
    }
    families[family] = { arms, pairedComparisons,
      pairedDisagreements: pairedComparisons.filter(row => row.pattern !== row.checklist) };
  }
  return families;
}

export async function scoreStudy(planBytes, runBytes, reviewBytes, options = {}) {
  // Validate the entire closure, every prompt and every present source's review
  // before importing an evaluator or executing even the first candidate.
  const study = validateStudy(planBytes, runBytes, reviewBytes, options.repositoryRoot ?? ROOT);
  const { parseArtifact } = await import('./artifact.mjs');
  const evaluate = options.evaluate ?? (await import('./evaluate.mjs')).evaluate;
  const metadata = new Map();
  const assessors = new Map();
  for (const family of FAMILIES) {
    metadata.set(family, (await import(`./tasks/${family}/cases.mjs`)).cases);
    assessors.set(family, (await import(`./tasks/${family}/design-check.mjs`)).assessDesign);
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
    schema: 'pattern-language.design-study-evaluation.v1', planSha256: study.planSha256,
    runSha256: study.runSha256, reviewSha256: study.reviewSha256, generationStatus: study.run.status,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    costs: { plannedCalls: 36, admittedCalls: admitted.length,
      knownUsd: admitted.reduce((sum, call) => sum + (call.costUsd ?? 0), 0),
      unknownCostCalls: admitted.filter(call => call.costUsd === null).map(call => call.id) },
    pairs, families: summarize(pairs),
    interpretation: 'Exploratory two-task study, three planned pairs per arm and family. Cases and observations are not independent trials; conformance requires a valid and adequate model.',
  };
}

export function verifyReplay(actual, expected) {
  // Runtime version and diagnostic wording are not outcomes. Everything else,
  // including observation counts/decisions, fixed denominators and provenance,
  // remains part of the exact replay contract.
  const stable = report => {
    const copy = structuredClone(report);
    delete copy.runtime;
    delete copy.diagnosticRedaction;
    for (const pair of copy.pairs) {
      delete pair.schemaErrors;
      delete pair.adequacyErrors;
      for (const row of pair.results) { delete row.error; delete row.agreementErrors; }
    }
    return copy;
  };
  assert.deepEqual(stable(actual), stable(expected), 'Replay differs from frozen outcomes, observations, denominators or provenance');
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
