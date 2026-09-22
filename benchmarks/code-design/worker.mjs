import { pathToFileURL } from 'node:url';
import { cases, turn } from './cases.mjs';

// A process boundary and timeout bound accidental hangs; this is NOT a sandbox.
const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(String(reason)));
const [candidate, caseId] = process.argv.slice(2);
let report;
try {
  const { mapLimit } = await import(pathToFileURL(candidate).href);
  if (typeof mapLimit !== 'function') throw new Error('Export a named mapLimit function');
  const test = cases.find(item => item.id === caseId);
  if (!test) throw new Error(`Unknown case: ${caseId}`);
  await test.run(mapLimit);
  await turn();
  await turn();
  if (unhandled.length) throw new Error(`Unhandled rejections: ${unhandled.join('; ')}`);
  report = { id: caseId, passed: true };
} catch (error) {
  report = { id: caseId, passed: false, error: error?.stack ?? String(error) };
}
process.stdout.write(`\nCODE_DESIGN_RESULT ${JSON.stringify(report)}\n`);
