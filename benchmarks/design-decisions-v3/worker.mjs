import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { families, parseArtifact, compareObservations } from './artifact.mjs';

const [candidate, family, caseId, designPath] = process.argv.slice(2);
const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(String(reason)));
let report = { id: caseId, behaviorPassed: false, agreementPassed: null, observationCount: 0 };
try {
  if (!families.includes(family)) throw new Error('Unknown family');
  const { cases } = await import(`./tasks/${family}/cases.mjs`);
  const test = cases.find(item => item.id === caseId);
  if (!test) throw new Error('Unknown case');
  const module = await import(pathToFileURL(candidate));
  const observed = await test.run(module);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  if (unhandled.length) throw new Error(`Unhandled rejections: ${unhandled.join('; ')}`);
  report.behaviorPassed = true;
  const parsed = parseArtifact(readFileSync(designPath, 'utf8'), family);
  if (parsed.valid) {
    const agreement = compareObservations(parsed.artifact, observed);
    report = { ...report, agreementPassed: agreement.passed, agreementErrors: agreement.errors,
      observationCount: agreement.observationCount, observedDecisions: agreement.observedDecisions };
  }
} catch (error) { report.error = error?.stack ?? String(error); }
process.stdout.write(`\nDESIGN_RESULT ${JSON.stringify(report)}\n`);
