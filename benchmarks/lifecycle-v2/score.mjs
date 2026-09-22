import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = 'benchmarks/lifecycle-v2/';
const FAMILIES = ['mapper', 'retry', 'atomic'];
const ARMS = ['direct', 'checklist', 'pattern'];
const STAGES = ['base', 'change'];
const STATUSES = ['generated-not-reviewed', 'failed-generation', 'skipped-no-base-source',
  'not-admitted-study-stopped', 'admitted-awaiting-response'];
const SHA = /^[a-f0-9]{64}$/;
export const digest = value => createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const tuple = job => [job.family, job.arm, job.repetition, job.stage].join('/');

// Explicit runtime closure: dynamic family imports and the legacy mapper cases
// must remain governed even if a malformed plan omits them from its inventory.
const requiredFiles = [
  'score.mjs', 'evaluate.mjs', 'worker.mjs', 'families.mjs', 'protocol.md', 'guidance/freeze.json',
  ...ARMS.map(arm => `guidance/${arm}.md`),
  ...FAMILIES.flatMap(family => ['base.md', 'change.md', 'cases.mjs'].map(name => `tasks/${family}/${name}`)),
].map(name => PREFIX + name).concat('benchmarks/code-design/cases.mjs');

export function validateStudy(planBytes, runBytes, reviewBytes, repositoryRoot = ROOT) {
  const plan = JSON.parse(planBytes);
  const run = JSON.parse(runBytes);
  const review = JSON.parse(reviewBytes);
  check(plan.schema === 'pattern-language.lifecycle-plan.v1', 'Unsupported plan schema');
  check(run.schema === 'pattern-language.lifecycle-generation.v1', 'Unsupported run schema');
  check(['generation-complete-awaiting-review', 'partial-reconciliation-required'].includes(run.status),
    'Run must be finalized before evaluation');
  check(review.schema === 'pattern-language.lifecycle-review.v1', 'Unsupported review schema');
  check(run.planSha256 === digest(planBytes), 'Run does not match exact plan bytes');
  check(plan.protocol && typeof plan.protocol === 'object', 'Missing frozen protocol');
  check(typeof plan.protocol.promptIntro === 'string' && plan.protocol.promptIntro.trim(), 'Missing frozen prompt introduction');
  check(plan.files && typeof plan.files === 'object' && !Array.isArray(plan.files), 'Missing frozen files');
  for (const required of requiredFiles) check(Object.hasOwn(plan.files, required), `Missing frozen dependency: ${required}`);
  for (const [name, file] of Object.entries(plan.files)) {
    const path = resolve(repositoryRoot, name);
    const rel = relative(repositoryRoot, path);
    check(name && !isAbsolute(name) && !rel.startsWith('..') && !isAbsolute(rel) && rel === name,
      `Invalid frozen path: ${name}`);
    check(typeof file?.text === 'string' && SHA.test(file.sha256), `Invalid frozen file: ${name}`);
    check(digest(file.text) === file.sha256, `Embedded file hash mismatch: ${name}`);
    check(digest(readFileSync(path)) === file.sha256, `Local frozen file changed: ${name}`);
  }
  check(Array.isArray(plan.jobs) && plan.jobs.length === 54, 'Plan must contain all 54 jobs');
  const jobs = new Map(), tuples = new Set();
  for (const job of plan.jobs) {
    check(typeof job.id === 'string' && /^[A-Za-z0-9_-]+$/.test(job.id), 'Invalid job ID');
    check(FAMILIES.includes(job.family) && ARMS.includes(job.arm) && STAGES.includes(job.stage) &&
      [1, 2, 3].includes(job.repetition), `Invalid job: ${job.id}`);
    check(!jobs.has(job.id) && !tuples.has(tuple(job)), `Duplicate planned job: ${job.id}`);
    jobs.set(job.id, job);
    tuples.add(tuple(job));
  }
  check(Array.isArray(run.calls) && run.calls.length === jobs.size, 'Run must cover every planned job, including skips');
  const calls = new Map();
  for (const call of run.calls) {
    const job = jobs.get(call.id);
    check(job && !calls.has(call.id), `Unknown or duplicate call: ${call.id}`);
    check(tuple(call) === tuple(job), `Call metadata differs from job: ${call.id}`);
    check(STATUSES.includes(call.status) && typeof call.admitted === 'boolean', `Invalid call status: ${call.id}`);
    check(call.admitted === ['generated-not-reviewed', 'failed-generation', 'admitted-awaiting-response'].includes(call.status),
      `Call status/admission mismatch: ${call.id}`);
    check(call.costUsd === null || (Number.isFinite(call.costUsd) && call.costUsd >= 0), `Invalid cost: ${call.id}`);
    if (call.prompt != null) {
      check(call.admitted && typeof call.prompt === 'string' && digest(call.prompt) === call.promptSha256, `Prompt hash mismatch: ${call.id}`);
    } else {
      check(!call.admitted && call.promptSha256 == null, `Missing admitted prompt: ${call.id}`);
    }
    if (call.source != null) {
      check(call.status === 'generated-not-reviewed' && typeof call.source === 'string' && call.source.trim() &&
        digest(call.source) === call.sourceSha256, `Source hash mismatch: ${call.id}`);
    } else check(call.sourceSha256 == null, `Source hash has no source: ${call.id}`);
    calls.set(call.id, call);
  }
  const byTuple = new Map([...calls.values()].map(call => [tuple(call), call]));
  for (const call of calls.values()) {
    if (!call.admitted) continue;
    const paths = [`${PREFIX}guidance/${call.arm}.md`, `${PREFIX}tasks/${call.family}/base.md`];
    const sections = [plan.protocol.promptIntro, ...paths.map(path => plan.files[path].text.trim())];
    if (call.stage === 'change') {
      const prior = byTuple.get(tuple({ ...call, stage: 'base' }));
      check(typeof prior?.source === 'string' && prior.sourceSha256 === call.priorSourceSha256,
        `Change must use its own base source: ${call.id}`);
      const path = `${PREFIX}tasks/${call.family}/change.md`;
      paths.push(path);
      sections.push(plan.files[path].text.trim(), `Prior implementation:\n${prior.source}`);
    } else check(call.priorSourceSha256 == null, `Base cannot include prior source: ${call.id}`);
    assert.deepEqual(call.promptFiles, paths, `Prompt file provenance differs: ${call.id}`);
    check(call.prompt === `${sections.join('\n\n')}\n`, `Prompt differs from frozen instructions and own prior source: ${call.id}`);
  }
  check(Array.isArray(review.sources), 'Review must list reviewed sources');
  const reviewed = new Map();
  for (const source of review.sources) {
    const call = calls.get(source.id);
    check(call && typeof call.source === 'string' && !reviewed.has(source.id), `Unknown or duplicate reviewed source: ${source.id}`);
    check(source.sha256 === call.sourceSha256, `Review source hash mismatch: ${source.id}`);
    reviewed.set(source.id, source.sha256);
  }
  for (const call of calls.values()) {
    if (call.source != null) check(reviewed.has(call.id), `Unreviewed source: ${call.id}`);
  }
  return { plan, run, calls, planSha256: digest(planBytes), runSha256: digest(runBytes), reviewSha256: digest(reviewBytes) };
}

export function summarize(artifacts) {
  const byTuple = new Map(artifacts.map(artifact => [tuple(artifact), artifact]));
  const families = {};
  for (const family of FAMILIES) {
    const arms = {};
    for (const arm of ARMS) {
      const base = [1, 2, 3].map(repetition => byTuple.get(tuple({ family, arm, repetition, stage: 'base' }))?.allPassed === true);
      const change = [1, 2, 3].map(repetition => byTuple.get(tuple({ family, arm, repetition, stage: 'change' }))?.allPassed === true);
      arms[arm] = { denominator: 3, baseAllPass: base.filter(Boolean).length,
        changeAllPass: change.filter(Boolean).length, bothAllPass: base.filter((pass, index) => pass && change[index]).length };
    }
    const pairedDisagreements = [];
    for (const repetition of [1, 2, 3]) {
      for (const stage of [...STAGES, 'both']) {
        const outcome = arm => (stage === 'both' ? STAGES : [stage]).every(oneStage =>
          byTuple.get(tuple({ family, arm, repetition, stage: oneStage }))?.allPassed === true);
        const pattern = outcome('pattern'), checklist = outcome('checklist');
        if (pattern !== checklist) pairedDisagreements.push({ repetition, stage, pattern, checklist });
      }
    }
    families[family] = { role: family === 'mapper' ? 'development' : 'transfer', arms, pairedDisagreements };
  }
  return families;
}

export async function scoreStudy(planBytes, runBytes, reviewBytes) {
  // All provenance and all reviews are checked before importing the evaluator or
  // executing any candidate, so an invalid last record cannot allow earlier code.
  const study = validateStudy(planBytes, runBytes, reviewBytes);
  const { evaluate } = await import('./evaluate.mjs');
  const { loadCases } = await import('./families.mjs');
  const metadata = new Map();
  for (const family of FAMILIES) metadata.set(family, await loadCases(family));
  const scratch = mkdtempSync(join(tmpdir(), 'lifecycle-reviewed-'));
  chmodSync(scratch, 0o700);
  const artifacts = [];
  try {
    for (const job of study.plan.jobs) {
      const call = study.calls.get(job.id);
      const selected = metadata.get(job.family).filter(test => test.stage === 'base' || job.stage === 'change');
      let evaluation;
      if (call.source == null) {
        evaluation = { passed: 0, total: selected.length, allPassed: false,
          results: selected.map(test => ({ id: test.id, stage: test.stage, group: test.group, passed: false,
            error: `No generated artifact (${call.status})` })) };
      } else {
        const path = join(scratch, `${job.id}.mjs`);
        writeFileSync(path, call.source, { mode: 0o600, flag: 'wx' });
        evaluation = await evaluate(path, job.family, job.stage);
        check(evaluation.entrySha256 === call.sourceSha256, `Evaluator source mismatch: ${job.id}`);
        check(evaluation.results.length === selected.length && evaluation.results.every((test, index) =>
          test.id === selected[index].id && typeof test.passed === 'boolean'), `Evaluator case mismatch: ${job.id}`);
      }
      artifacts.push({ ...job, generationStatus: call.status, sourceSha256: call.sourceSha256 ?? null,
        promptSha256: call.promptSha256 ?? null,
        sourceBytes: call.source == null ? null : Buffer.byteLength(call.source),
        sourceLines: call.source == null ? null : call.source.split('\n').length - Number(call.source.endsWith('\n')),
        ...evaluation });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const admitted = [...study.calls.values()].filter(call => call.admitted);
  return {
    schema: 'pattern-language.lifecycle-evaluation.v1', planSha256: study.planSha256,
    runSha256: study.runSha256, reviewSha256: study.reviewSha256, generationStatus: study.run.status,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    costs: { admittedCalls: admitted.length,
      knownUsd: admitted.reduce((sum, call) => sum + (call.costUsd ?? 0), 0),
      unknownCostCalls: admitted.filter(call => call.costUsd === null).map(call => call.id) },
    artifacts, families: summarize(artifacts),
    interpretation: 'Descriptive pilot; mapper is development, retry and atomic are transfer within lifecycle tasks. Cases are not independent trials.',
  };
}

export function verifyReplay(actual, expected) {
  const stable = report => ({
    schema: report.schema, planSha256: report.planSha256, runSha256: report.runSha256,
    reviewSha256: report.reviewSha256, generationStatus: report.generationStatus,
    artifacts: report.artifacts.map(artifact => ({
      id: artifact.id, family: artifact.family, arm: artifact.arm, repetition: artifact.repetition, stage: artifact.stage,
      generationStatus: artifact.generationStatus, sourceSha256: artifact.sourceSha256,
      promptSha256: artifact.promptSha256, passed: artifact.passed, total: artifact.total, allPassed: artifact.allPassed,
      sourceBytes: artifact.sourceBytes, sourceLines: artifact.sourceLines,
      results: artifact.results.map(test => ({ id: test.id, stage: test.stage, group: test.group, passed: test.passed })),
    })), families: report.families, costs: report.costs,
  });
  assert.deepEqual(stable(actual), stable(expected), 'Replay differs from frozen per-case outcomes or provenance');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const usage = 'Usage: node score.mjs PLAN.json RUN.json REVIEWED.json [--out EVALUATION.json] [--replay EXPECTED.json]';
    if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
      console.log(`${usage}\n\nReview schema: {schema:"pattern-language.lifecycle-review.v1",sources:[{id,sha256}]}\nAll present sources require an exact review hash. No provider calls are made.\nReplay ignores error wording and compares every case outcome and frozen provenance.`);
      process.exit(0);
    }
    const [plan, run, review, ...options] = process.argv.slice(2);
    let output, replay;
    check(plan && run && review && options.length % 2 === 0,
      usage);
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
    process.stderr.write(replay ? 'Replay matches every recorded outcome.\n' : 'Scored all 54 planned artifacts; failures remain in denominators.\n');
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
