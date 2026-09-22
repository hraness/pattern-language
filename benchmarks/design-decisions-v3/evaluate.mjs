import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { families, parseArtifact } from './artifact.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Reviewed sources only. The process boundary limits hangs; it is not a security sandbox.
export async function evaluate(candidatePath, designPath, family, timeoutMs = 2500) {
  if (!families.includes(family)) throw new Error('Unknown family');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new Error('Invalid timeout');
  const candidate = resolve(candidatePath), design = resolve(designPath);
  const sourceBytes = readFileSync(candidate), designBytes = readFileSync(design);
  const parsed = parseArtifact(designBytes.toString('utf8'), family);
  const { assessDesign } = await import(`./tasks/${family}/design-check.mjs`);
  const adequacy = parsed.valid ? assessDesign(parsed.artifact) : { adequate: false, errors: ['Invalid design schema'] };
  const { cases } = await import(`./tasks/${family}/cases.mjs`);
  const results = cases.map(test => {
    const child = spawnSync(process.execPath, [resolve(root, 'worker.mjs'), candidate, family, test.id, design], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024,
      env: { PATH: process.env.PATH ?? '', LANG: 'C', TZ: 'UTC' }, cwd: root,
    });
    let result = { id: test.id, behaviorPassed: false, agreementPassed: null, observationCount: 0 };
    if (child.error || child.status !== 0) result.error = child.error?.message ?? `Process exited ${child.status}; signal ${child.signal}`;
    else {
      try {
        const line = child.stdout.split('\n').findLast(line => line.startsWith('DESIGN_RESULT '));
        result = JSON.parse(line.slice('DESIGN_RESULT '.length));
        if (result.id !== test.id || typeof result.behaviorPassed !== 'boolean' ||
            ![null, true, false].includes(result.agreementPassed) || !Number.isSafeInteger(result.observationCount) ||
            result.observationCount < 0) throw new Error('Invalid worker result');
      } catch { result = { id: test.id, behaviorPassed: false, agreementPassed: null, observationCount: 0, error: 'Invalid worker result' }; }
    }
    return { ...result, group: test.group };
  });
  if (!sourceBytes.equals(readFileSync(candidate)) || !designBytes.equals(readFileSync(design))) throw new Error('Artifact changed during evaluation');
  const behaviorAllPass = results.every(row => row.behaviorPassed);
  const testedAgreementAllPass = results.every(row => row.agreementPassed === true);
  const agreementAllPass = parsed.valid && adequacy.adequate && testedAgreementAllPass;
  return { schema: 'pattern-language.design-evaluation.v1', family, sourceSha256: sha(sourceBytes), designSha256: sha(designBytes),
    schemaValid: parsed.valid, schemaErrors: parsed.errors, modelAdequate: adequacy.adequate, adequacyErrors: adequacy.errors,
    behaviorAllPass, testedAgreementAllPass, agreementAllPass, jointAllPass: behaviorAllPass && agreementAllPass,
    total: results.length, behaviorPassed: results.filter(row => row.behaviorPassed).length,
    agreementPassed: results.filter(row => row.agreementPassed === true).length,
    agreementUnobserved: results.filter(row => row.agreementPassed === null).length, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [candidate, design, family, ...extra] = process.argv.slice(2);
    if (!candidate || !design || !family || extra.length) throw new Error('Usage: node evaluate.mjs REVIEWED_SOURCE.mjs DESIGN.txt jobs|batch');
    const result = await evaluate(candidate, design, family);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.jointAllPass ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
