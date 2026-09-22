import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, scoreStudy, validateStudy, verifyReplay } from './score.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = mkdtempSync(join(tmpdir(), 'construction-score-tests-'));
chmodSync(scratch, 0o700);
const sourceFor = artifact => `export const selected = ${artifact.selection};\n`;
const artifacts = Array.from({ length: 10 }, (_, selection) => ({ selection }));
let checks = 0;

function fixture(name, mode = 'full') {
  const target = join(scratch, name);
  const creation = spawnSync('python3', ['-c', `
import importlib.util,json,pathlib,shutil,sys
repo=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); mode=sys.argv[3]
spec=importlib.util.spec_from_file_location('construction_score_test_fixture',repo/'scripts/test_construction_runner.py')
tests=importlib.util.module_from_spec(spec); spec.loader.exec_module(tests)
case=tests.ConstructionRunnerTests(); case.setUp()
try:
    for name in tests.runner.SCRIPT_PATHS:
        case.put(name,(repo/name).read_text())
    for name in ('score.mjs','test-score.mjs'):
        path=f'{tests.runner.BENCH}/{name}'
        case.put(path,(repo/path).read_text())
    case.freeze(); case.prepare()
    count=0
    def provider(*args):
        global count
        index=count; count+=1
        if mode=='partial' and index==8:
            return tests.response(model='devin/unapproved')
        text=json.dumps({'selection':index%10})
        if mode=='mixed' and index==3: text='globalThis.CONSTRUCTION_EXECUTED = true; throw new Error("never execute")'
        if mode=='mixed' and index==4: text=' \\n'
        return tests.response(text,requestId=f'fake-{count}')
    case.run_fake(provider)
    shutil.copytree(case.root,target/'repository')
    shutil.copytree(case.output,target/'run')
finally:
    case.temporary.cleanup()
`, ROOT, target, mode], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(creation.status, 0, creation.stderr);
  return { root: join(target, 'repository'), plan: readFileSync(join(target, 'run', 'plan.json')),
    run: readFileSync(join(target, 'run', 'run.json')) };
}

function mocks(repositoryRoot) {
  const counters = { parsed: 0, compiled: 0, enumerated: 0 };
  const options = {
    repositoryRoot,
    compiler: {
      parseArtifact(raw) {
        counters.parsed++;
        try {
          const value = JSON.parse(raw);
          if (Object.keys(value).join(',') !== 'selection' || !Number.isInteger(value.selection)
            || value.selection < 0 || value.selection > 9) throw new Error('closed mock artifact');
          return { valid: true, artifact: artifacts[value.selection], errors: [] };
        } catch {
          return { valid: false, artifact: null, errors: ['Invalid closed mock artifact'] };
        }
      },
      compile(artifact) { counters.compiled++; return sourceFor(artifact); },
    },
    loadContext: id => id,
    async enumerateSpace(context) {
      counters.enumerated++;
      return { context, optimum: 10, feasibleCount: 9, paretoCount: 2,
        designs: artifacts.map((artifact, index) => {
          const objective = index < 2 ? 10 : 10 + index, feasible = index !== 9;
          return { valid: true, artifact, sourceSha256: digest(sourceFor(artifact)), correct: true, feasible,
            optimal: index < 2, metrics: { commits: index + 1, writeBytes: objective }, objective,
            regret: feasible ? objective - 10 : null, relativeRegret: feasible ? (objective - 10) / 10 : null,
            efficiency: feasible ? 10 / objective : 0, dominated: feasible ? index > 1 : null,
            budgetFailures: feasible ? [] : ['commits'], qualification: { correct: true, counts: [1, 2, 3] },
            workloads: [{ id: 'synthetic', metrics: { commits: index + 1 } }] };
        }) };
    },
  };
  return { options, counters };
}

async function mustRejectBeforeEvaluation(bundle, mutate, expression) {
  const run = JSON.parse(bundle.run);
  mutate(run);
  const { options, counters } = mocks(bundle.root);
  await assert.rejects(scoreStudy(bundle.plan, JSON.stringify(run), options), expression);
  assert.deepEqual(counters, { parsed: 0, compiled: 0, enumerated: 0 });
  checks++;
}

try {
  const full = fixture('full');
  const { options, counters } = mocks(full.root);
  const scored = await scoreStudy(full.plan, full.run, options);
  assert.equal(scored.schema, 'pattern-language.construction-evaluation.v1');
  assert.deepEqual(counters, { parsed: 36, compiled: 36, enumerated: 4 });
  assert.equal(scored.attempts.length, 36);
  assert.equal(scored.summary.total.planned, 36);
  assert.equal(scored.summary.total.generationCompleted, 36);
  assert.equal(scored.summary.total.artifactValid, 36);
  assert.equal(scored.summary.total.correct, 36);
  assert.equal(scored.summary.total.feasible, 33);
  assert.equal(scored.summary.total.objectiveOptimal, 8);
  assert.equal(scored.cost.knownUsd, null);
  assert.equal(scored.cost.complete, false);
  assert.equal(scored.attempts[1].objectiveOptimal, true, 'Every tied optimum gets credit');
  assert.equal(scored.attempts[9].efficiency, 0, 'Infeasible attempts cannot gain efficiency');
  assert.equal(scored.attempts[9].regret, null);
  assert.equal(scored.attempts[2].sourceSha256, digest(sourceFor(artifacts[2])));
  assert.equal(scored.attempts[2].objective, 12);
  assert.equal(scored.attempts[2].regret, 2);
  assert.equal(scored.attempts[2].relativeRegret, 0.2);
  assert.equal(scored.attempts[2].efficiency, 10 / 12);
  for (const arms of Object.values(scored.summary.byContextArm)) {
    for (const cell of Object.values(arms)) assert.equal(cell.planned, 3);
  }
  for (const arm of Object.values(scored.summary.byArm)) assert.equal(arm.planned, 12);
  const replay = await verifyReplay(full.plan, full.run, JSON.stringify(scored), mocks(full.root).options);
  assert.deepEqual(replay, scored, 'Results exclude wall-clock values');
  const wrongReplay = structuredClone(scored);
  wrongReplay.attempts[0].efficiency = 0;
  await assert.rejects(verifyReplay(full.plan, full.run, JSON.stringify(wrongReplay), mocks(full.root).options), /does not replay/);
  checks++;

  const mixed = fixture('mixed', 'mixed');
  const mixedMocks = mocks(mixed.root);
  const malformed = await scoreStudy(mixed.plan, mixed.run, mixedMocks.options);
  assert.equal(malformed.summary.total.planned, 36);
  assert.equal(malformed.summary.total.generationCompleted, 35);
  assert.equal(malformed.summary.total.artifactValid, 34);
  assert.equal(malformed.attempts[3].failureReason, 'invalid-construction-artifact');
  assert.equal(malformed.attempts[3].efficiency, 0);
  assert.equal(malformed.attempts[4].failureReason, 'empty-result');
  assert.equal(mixedMocks.counters.parsed, 35, 'Failed generation responses are not parsed');
  assert.equal(globalThis.CONSTRUCTION_EXECUTED, undefined, 'Source-like text stayed inert');
  checks++;

  const partial = fixture('partial', 'partial');
  const partialMocks = mocks(partial.root);
  const stopped = await scoreStudy(partial.plan, partial.run, partialMocks.options);
  assert.equal(stopped.generationStatus, 'partial-reconciliation-required');
  assert.equal(stopped.admittedCalls, 9);
  assert.equal(stopped.summary.total.planned, 36);
  assert.equal(stopped.summary.total.generationCompleted, 8);
  assert.equal(stopped.summary.total.artifactValid, 8);
  assert.deepEqual(partialMocks.counters, { parsed: 8, compiled: 8, enumerated: 4 });
  assert.equal(stopped.attempts[8].failureReason, 'application-protocol-or-provider-failure');
  assert.equal(stopped.attempts[9].failureReason, 'not-admitted-study-stopped');
  assert(stopped.attempts.slice(8).every(attempt => attempt.efficiency === 0));
  assert.equal(stopped.summary.total.meanEfficiency,
    stopped.attempts.reduce((sum, attempt) => sum + attempt.efficiency, 0) / 36);
  checks++;

  const mutations = [
    [run => { run.status = 'running'; }, /finalized/],
    [run => { run.calls[0].prompt = 'extra feedback'; }, /Prompt differs/],
    [run => { run.calls[0].resultText = '{"selection":9}'; }, /response provenance/],
    [run => { run.calls[0].eligibility.accountBinding.matched = 1; }, /receipt types/],
    [run => { run.calls[0].eligibility.catalogCostTier = 'Paid'; }, /admission evidence/],
    [run => { run.calls[0].providerEnvelope.outcome.effects = 'tool'; }, /completion envelope/],
    [run => { run.calls[0].providerEnvelope.requestId = run.calls[1].providerEnvelope.requestId; }, /completion envelope/],
    [run => { run.calls.pop(); }, /36 planned slots/],
    [run => { run.calls.reverse(); }, /metadata\/order/],
    [run => { run.knownCostUsd = 0; }, /unknown-cost/],
    [run => { run.evaluationStatus = 'already-scored'; }, /evaluation boundary/],
    [run => { run.planSha256 = '0'.repeat(64); }, /exact plan bytes/],
  ];
  for (const [mutate, expression] of mutations) await mustRejectBeforeEvaluation(full, mutate, expression);

  const tamperedPlan = JSON.parse(full.plan);
  tamperedPlan.protocol.retryBudget = 1;
  const planBytes = JSON.stringify(tamperedPlan), pairedRun = JSON.parse(full.run);
  pairedRun.planSha256 = digest(planBytes);
  await assert.rejects(scoreStudy(planBytes, JSON.stringify(pairedRun), mocks(full.root).options), /Changed protocol/);
  checks++;

  const file = join(full.root, 'scripts', 'run-construction-study.py');
  const original = readFileSync(file);
  writeFileSync(file, 'raise RuntimeError("THIS_UNVERIFIED_VALIDATOR_MUST_NOT_EXECUTE")\n');
  assert.throws(() => validateStudy(full.plan, full.run, full.root), /Frozen file hash differs/);
  writeFileSync(file, original);
  const extra = join(full.root, 'benchmarks', 'executable-constructions', 'new-helper.mjs');
  writeFileSync(extra, 'unfrozen');
  assert.throws(() => validateStudy(full.plan, full.run, full.root), /closure differs/);
  rmSync(extra);
  checks++;

  const badSource = mocks(full.root);
  badSource.options.compiler.compile = () => 'changed trusted compilation bytes';
  await assert.rejects(scoreStudy(full.plan, full.run, badSource.options), /compiler output differs/);
  const badSpace = mocks(full.root);
  const originalEnumeration = badSpace.options.enumerateSpace;
  badSpace.options.enumerateSpace = async context => {
    const space = await originalEnumeration(context);
    space.designs[9].efficiency = 1;
    return space;
  };
  await assert.rejects(scoreStudy(full.plan, full.run, badSpace.options), /Infeasible construction/);
  const badArithmetic = mocks(full.root);
  const enumeration = badArithmetic.options.enumerateSpace;
  badArithmetic.options.enumerateSpace = async context => {
    const space = await enumeration(context);
    space.designs[2].regret = 99;
    return space;
  };
  await assert.rejects(scoreStudy(full.plan, full.run, badArithmetic.options), /comparison arithmetic/);
  checks++;
  process.stdout.write(`Construction scoring: ${checks} focused checks passed (all metadata/provider/evaluator fixtures local and synthetic).\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
