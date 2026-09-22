import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BENCH = 'benchmarks/executable-constructions';
const CONTEXTS = ['write_pressure', 'recovery_pressure', 'latency_pressure', 'commit_pressure'];
const ARMS = ['direct', 'checklist', 'pattern'];
const SCRIPTS = ['scripts/run-construction-study.py', 'scripts/test_construction_runner.py',
  'scripts/run-design-swe2.py', 'scripts/run-design-study.py', 'scripts/run-lifecycle-study.py',
  'scripts/compile-construction.mjs'];
const SHA = /^[a-f0-9]{64}$/;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const digest = value => createHash('sha256').update(value).digest('hex');

export function frozenPaths(repositoryRoot = ROOT) {
  const paths = [...SCRIPTS];
  const root = resolve(repositoryRoot);
  check(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'Invalid repository root');
  function walk(directory) {
    check(lstatSync(resolve(root, directory)).isDirectory() && !lstatSync(resolve(root, directory)).isSymbolicLink(),
      `Missing or symlinked frozen directory: ${directory}`);
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      if (directory === BENCH && ['README.md', 'results'].includes(entry.name)) continue;
      const name = `${directory}/${entry.name}`;
      check(!entry.isSymbolicLink(), `Frozen dependency is a symlink: ${name}`);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) paths.push(name);
      else throw new Error(`Unsupported frozen dependency: ${name}`);
    }
  }
  walk(BENCH);
  for (const name of paths) {
    const file = resolve(root, name);
    check(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), `Missing or symlinked frozen file: ${name}`);
    for (let parent = dirname(file); parent !== root; parent = dirname(parent)) {
      check(!lstatSync(parent).isSymbolicLink(), `Symlinked frozen ancestor: ${name}`);
    }
  }
  return [...new Set(paths)].sort();
}

export function validateStudy(planBytes, runBytes, repositoryRoot = ROOT) {
  const planText = Buffer.isBuffer(planBytes) ? planBytes.toString('utf8') : planBytes;
  const runText = Buffer.isBuffer(runBytes) ? runBytes.toString('utf8') : runBytes;
  const plan = JSON.parse(planText), run = JSON.parse(runText);
  check(plan.schema === 'pattern-language.construction-plan.v1' && plain(plan.files), 'Invalid construction plan');
  check(run.schema === 'pattern-language.construction-generation.v1', 'Invalid construction run');
  check(run.planSha256 === digest(planBytes), 'Run does not match exact plan bytes');
  const root = resolve(repositoryRoot);
  assert.deepEqual(Object.keys(plan.files).sort(), frozenPaths(root), 'Frozen dependency closure differs from current tree');
  // Verify the local validator and its complete import closure before importing
  // it in Python. Candidate text is only hashed and compared during this phase.
  for (const [name, file] of Object.entries(plan.files)) {
    const full = resolve(root, name), rel = relative(root, full);
    check(name && !isAbsolute(name) && !rel.startsWith('..') && !isAbsolute(rel) && rel === name,
      `Invalid frozen path: ${name}`);
    check(plain(file) && Object.keys(file).sort().join(',') === 'sha256,text'
      && typeof file.text === 'string' && SHA.test(file.sha256), `Invalid frozen file: ${name}`);
    check(digest(file.text) === file.sha256 && digest(readFileSync(full)) === file.sha256,
      `Frozen file hash differs: ${name}`);
  }
  const scratch = mkdtempSync(join(tmpdir(), 'construction-provenance-'));
  chmodSync(scratch, 0o700);
  let validation;
  try {
    const planPath = join(scratch, 'plan.json'), runPath = join(scratch, 'run.json');
    writeFileSync(planPath, planText, { mode: 0o600, flag: 'wx' });
    writeFileSync(runPath, runText, { mode: 0o600, flag: 'wx' });
    validation = spawnSync('python3', ['-c', `
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('construction_score_protocol',sys.argv[1])
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
plan_text=pathlib.Path(sys.argv[3]).read_text()
plan=json.loads(plan_text)
runner.validate_plan(plan)
runner.verify_current_files(plan,pathlib.Path(sys.argv[2]))
runner.validate_run(plan,json.loads(pathlib.Path(sys.argv[4]).read_text()),plan_text)
`, resolve(root, SCRIPTS[0]), root, planPath, runPath],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  check(validation.status === 0, `Frozen construction provenance failed: ${validation.error?.message ?? validation.stderr}`);
  return { plan, run, planSha256: digest(planBytes), runSha256: digest(runBytes) };
}

function checkedSpace(space, context) {
  check(plain(space) && space.context === context && Array.isArray(space.designs) && space.designs.length === 10,
    `Incomplete declared construction space: ${context}`);
  check(Number.isFinite(space.optimum) && space.optimum > 0
    && Number.isInteger(space.feasibleCount) && space.feasibleCount > 1
    && Number.isInteger(space.paretoCount) && space.paretoCount > 0, `Invalid feasible space summary: ${context}`);
  const designs = new Map();
  for (const row of space.designs) {
    check(plain(row) && row.valid === true && plain(row.artifact) && typeof row.correct === 'boolean'
      && typeof row.feasible === 'boolean' && typeof row.optimal === 'boolean' && SHA.test(row.sourceSha256),
    `Invalid measured construction: ${context}`);
    const key = JSON.stringify(row.artifact);
    check(!designs.has(key), `Duplicate declared construction: ${context}`);
    check(plain(row.metrics) && Object.values(row.metrics).every(value => Number.isFinite(value) && value >= 0),
      `Invalid measured resource vector: ${context}`);
    check(Number.isFinite(row.objective) && row.objective > 0, `Invalid positive objective: ${context}`);
    if (row.feasible) {
      check(row.correct && Number.isFinite(row.regret) && row.regret >= 0
        && Number.isFinite(row.relativeRegret) && row.relativeRegret >= 0
        && Number.isFinite(row.efficiency) && row.efficiency > 0 && row.efficiency <= 1
        && typeof row.dominated === 'boolean', `Invalid feasible comparison: ${context}`);
    } else {
      check(!row.optimal && row.efficiency === 0 && row.regret === null && row.relativeRegret === null
        && row.dominated === null, `Infeasible construction acquired success credit: ${context}`);
    }
    check(row.optimal === (row.feasible && row.objective === space.optimum), `Objective-optimal label differs: ${context}`);
    if (row.feasible) {
      check(row.regret === row.objective - space.optimum
        && row.relativeRegret === row.regret / space.optimum
        && row.efficiency === space.optimum / row.objective, `Objective comparison arithmetic differs: ${context}`);
    }
    designs.set(key, row);
  }
  check(Math.min(...space.designs.filter(row => row.feasible).map(row => row.objective)) === space.optimum,
    `Objective optimum differs from measured feasible set: ${context}`);
  check(space.designs.filter(row => row.feasible).length === space.feasibleCount
    && space.designs.filter(row => row.feasible && !row.dominated).length === space.paretoCount,
  `Declared feasible/Pareto counts differ: ${context}`);
  check(space.designs.some(row => row.optimal && row.feasible), `Space contains no admitted optimum: ${context}`);
  return designs;
}

function measuredFields(row) {
  return {
    artifact: row.artifact, sourceSha256: row.sourceSha256, correct: row.correct, feasible: row.feasible,
    objectiveOptimal: row.optimal, metrics: row.metrics, objective: row.objective, regret: row.regret,
    relativeRegret: row.relativeRegret, efficiency: row.feasible ? row.efficiency : 0, dominated: row.dominated,
    budgetFailures: row.budgetFailures ?? [], qualification: row.qualification ?? null, workloads: row.workloads ?? [],
  };
}

export function summarize(attempts) {
  function cell(rows, planned) {
    check(rows.length === planned, 'Summary must preserve every planned attempt');
    return {
      planned, generationCompleted: rows.filter(row => row.generated).length,
      artifactValid: rows.filter(row => row.artifactValid).length,
      correct: rows.filter(row => row.correct).length, feasible: rows.filter(row => row.feasible).length,
      objectiveOptimal: rows.filter(row => row.objectiveOptimal).length,
      efficiencySum: rows.reduce((sum, row) => sum + row.efficiency, 0),
      meanEfficiency: rows.reduce((sum, row) => sum + row.efficiency, 0) / planned,
    };
  }
  return {
    planned: 36,
    byContextArm: Object.fromEntries(CONTEXTS.map(context => [context, Object.fromEntries(ARMS.map(arm => [arm,
      cell(attempts.filter(row => row.context === context && row.arm === arm), 3)]))])),
    byArm: Object.fromEntries(ARMS.map(arm => [arm, cell(attempts.filter(row => row.arm === arm), 12)])),
    total: cell(attempts, 36),
  };
}

export async function scoreStudy(planBytes, runBytes, options = {}) {
  // No parser, compiler, evaluator, or construction-space code is imported until
  // every frozen input, slot, prompt, admission, and provider receipt is valid.
  const repositoryRoot = resolve(options.repositoryRoot ?? ROOT);
  const study = validateStudy(planBytes, runBytes, repositoryRoot);
  const moduleUrl = name => pathToFileURL(resolve(repositoryRoot, BENCH, name)).href;
  const compiler = options.compiler ?? await import(moduleUrl('compiler.mjs'));
  const loadContext = options.loadContext ?? (await import(moduleUrl('evaluate.mjs'))).loadContext;
  const enumerateSpace = options.enumerateSpace ?? (await import(moduleUrl('space.mjs'))).enumerateSpace;
  const contexts = {}, lookup = new Map();
  for (const context of CONTEXTS) {
    const space = await enumerateSpace(loadContext(context));
    lookup.set(context, checkedSpace(space, context));
    contexts[context] = { optimum: space.optimum, feasibleCount: space.feasibleCount, paretoCount: space.paretoCount,
      designs: space.designs.map(measuredFields) };
  }
  const attempts = [];
  for (const call of study.run.calls) {
    const attempt = {
      id: call.id, context: call.context, arm: call.arm, repetition: call.repetition, stage: call.stage,
      admitted: call.admitted, generationStatus: call.status, generated: call.status === 'generated-not-reviewed',
      resultSha256: call.resultSha256 ?? null, failureReason: call.failureReason ?? (call.admitted ? null : call.status),
      artifactValid: false, artifactErrors: [], artifact: null, sourceSha256: null, correct: false, feasible: false,
      objectiveOptimal: false, metrics: null, objective: null, regret: null, relativeRegret: null,
      efficiency: 0, dominated: null, budgetFailures: [], qualification: null, workloads: [],
    };
    if (attempt.generated) {
      const parsed = compiler.parseArtifact(call.resultText);
      check(plain(parsed) && typeof parsed.valid === 'boolean' && Array.isArray(parsed.errors), 'Invalid trusted parser result');
      if (!parsed.valid) {
        attempt.artifactErrors = parsed.errors;
        attempt.failureReason = 'invalid-construction-artifact';
      } else {
        const row = lookup.get(call.context).get(JSON.stringify(parsed.artifact));
        check(row, `Admitted artifact missing from exhaustive construction space: ${call.id}`);
        check(digest(compiler.compile(parsed.artifact)) === row.sourceSha256,
          `Candidate compiler output differs from measured construction: ${call.id}`);
        Object.assign(attempt, measuredFields(row), { artifactValid: true });
      }
    }
    attempts.push(attempt);
  }
  return {
    schema: 'pattern-language.construction-evaluation.v1', planSha256: study.planSha256, runSha256: study.runSha256,
    generationStatus: study.run.status, denominator: 36, denominatorPerContextArm: 3,
    admittedCalls: study.run.admittedCalls, stopReasons: study.run.stopReasons,
    cost: { knownUsd: study.run.knownCostUsd, complete: study.run.costComplete, status: study.run.costStatus },
    contexts, attempts, summary: summarize(attempts),
  };
}

export async function verifyReplay(planBytes, runBytes, evaluationBytes, options = {}) {
  const actual = await scoreStudy(planBytes, runBytes, options);
  assert.deepEqual(actual, JSON.parse(evaluationBytes), 'Frozen construction evaluation does not replay');
  return actual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    check(args.length === 4 && ['--out', '--replay'].includes(args[2]),
      'Usage: node score.mjs PLAN.json RUN.json (--out|--replay) EVALUATION.json');
    const plan = readFileSync(resolve(args[0])), run = readFileSync(resolve(args[1]));
    const result = args[2] === '--replay'
      ? await verifyReplay(plan, run, readFileSync(resolve(args[3]))) : await scoreStudy(plan, run);
    if (args[2] === '--out') {
      writeFileSync(resolve(args[3]), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }
    process.stdout.write(`${JSON.stringify({ status: args[2] === '--replay' ? 'replayed' : 'scored',
      denominator: result.denominator, summary: result.summary.total })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
