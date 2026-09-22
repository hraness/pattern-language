import { pathToFileURL } from 'node:url';
import { families, loadCases } from './families.mjs';

const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(String(reason)));
const [candidate, family, caseId] = process.argv.slice(2);
let report;
try {
  const cases = await loadCases(family);
  const module = await import(pathToFileURL(candidate).href);
  const implementation = module[families[family]];
  if (typeof implementation !== 'function') throw new Error(`Export a named ${families[family]} function`);
  const test = cases.find(item => item.id === caseId);
  if (!test) throw new Error(`Unknown case: ${caseId}`);
  await test.run(implementation);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  if (unhandled.length) throw new Error(`Unhandled rejections: ${unhandled.join('; ')}`);
  report = { id: caseId, passed: true };
} catch (error) {
  report = { id: caseId, passed: false, error: error?.stack ?? String(error) };
}
process.stdout.write(`\nLIFECYCLE_RESULT ${JSON.stringify(report)}\n`);
