// Executes reviewed frozen code. This process boundary is not a sandbox.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './evaluate.mjs';
import { isDeepStrictEqual } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [path, ...extra] = process.argv.slice(2);
if (!path || extra.length) {
  console.error('Usage: node replay.mjs REVIEWED-RUN.json');
  process.exit(2);
}
const run = JSON.parse(readFileSync(path, 'utf8'));
if (run.schema !== 'pattern-language.code-smoke.v1') throw new Error('Unknown run schema');
if (digest(run.runnerSource) !== run.protocol.runnerSha256) throw new Error('Runner hash mismatch');
for (const file of ['cases.mjs', 'worker.mjs', 'evaluate.mjs']) {
  const name = `benchmarks/code-design/${file}`;
  if (digest(readFileSync(join(root, name))) !== run.protocol.inputSha256[name]) {
    throw new Error(`Evaluator changed since generation: ${name}`);
  }
}
const directory = mkdtempSync(join(tmpdir(), 'pattern-code-replay-'));
const reports = [];
try {
  for (const stage of ['base', 'change']) {
    for (const arm of ['direct', 'checklist', 'pattern']) {
      const name = `${arm}-${stage}`;
      const artifact = run.artifacts[name];
      if (!artifact) {
        reports.push({ arm, stage, allPassed: false, error: 'No generated artifact' });
        continue;
      }
      const generation = run.generation.find(record => record.arm === arm && record.stage === stage);
      if (!generation || generation.candidateSha256 !== artifact.sourceSha256 ||
          generation.promptSha256 !== artifact.promptSha256) throw new Error(`Generation provenance mismatch: ${name}`);
      if (digest(artifact.source) !== artifact.sourceSha256 ||
          digest(artifact.prompt) !== artifact.promptSha256) throw new Error(`Hash mismatch: ${name}`);
      const candidate = join(directory, `${name}.mjs`);
      writeFileSync(candidate, artifact.source);
      const report = { ...evaluate(candidate, stage), arm, candidate: `${name}.mjs` };
      reports.push(report);
      console.error(`${name}: ${report.passed}/${report.total}`);
    }
  }
  for (const report of reports) {
    const name = `${report.arm}-${report.stage}`;
    const expected = run.expectedOutcomes?.[name];
    const actual = report.results
      ? { allPassed: report.allPassed, cases: Object.fromEntries(report.results.map(test => [test.id, test.passed])) }
      : { allPassed: false, missingArtifact: true };
    if (!expected || !isDeepStrictEqual(actual, expected)) {
      throw new Error(`Recorded outcomes did not reproduce: ${name}`);
    }
  }
  console.log(JSON.stringify({ schema: 'pattern-language.code-smoke-replay.v1', reports }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
