export const families = Object.freeze({ mapper: 'mapLimit', retry: 'retry', atomic: 'createLedger' });

export async function loadCases(family) {
  if (!Object.hasOwn(families, family)) throw new Error(`Unknown family: ${family}`);
  const { cases } = await import(`./tasks/${family}/cases.mjs`);
  return cases;
}
