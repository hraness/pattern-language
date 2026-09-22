import { readFileSync } from 'node:fs';

export const families = ['jobs', 'batch'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => plain(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const unique = values => new Set(values).size === values.length;
export const transitionKey = row => JSON.stringify([row.event, row.from, row.to]);

export function vocabulary(family) {
  if (!families.includes(family)) throw new Error(`Unknown family: ${family}`);
  return JSON.parse(readFileSync(new URL(`./tasks/${family}/model.json`, import.meta.url)));
}

// No semantic repairs: only an optional outer Markdown fence and surrounding
// whitespace are removed. The runner retains and forwards the exact raw text.
export function parseArtifact(text, family) {
  const errors = [];
  let artifact;
  try {
    let normalized = String(text).trim();
    if (normalized.startsWith('```') && normalized.endsWith('```') && normalized.includes('\n')) {
      normalized = normalized.slice(normalized.indexOf('\n') + 1, -3).trim();
    }
    artifact = JSON.parse(normalized);
  } catch { return { valid: false, artifact: null, errors: ['Design is not a JSON object'] }; }
  const model = vocabulary(family);
  if (!keysAre(artifact, ['schema', 'family', 'states', 'transitions', 'effects', 'decisions', 'rationale'])) {
    return { valid: false, artifact, errors: ['Design has missing or unexpected fields'] };
  }
  if (artifact.schema !== 'pattern-language.design.v1' || artifact.family !== family) errors.push('Wrong design schema or family');
  for (const key of ['states', 'effects']) {
    if (!Array.isArray(artifact[key]) || !unique(artifact[key]) ||
        !artifact[key].every(value => model[key].includes(value))) errors.push(`Invalid ${key}`);
  }
  if (!artifact.states?.length) errors.push('At least one state is required');
  if (!Array.isArray(artifact.transitions) || artifact.transitions.length === 0 ||
      !artifact.transitions.every(row => keysAre(row, ['event', 'from', 'to']) &&
        model.events.includes(row.event) && Array.isArray(artifact.states) &&
        artifact.states.includes(row.from) && artifact.states.includes(row.to)) ||
      !unique(artifact.transitions.map(transitionKey))) errors.push('Invalid or duplicate transitions');
  if (!keysAre(artifact.decisions, Object.keys(model.choices)) ||
      !Object.entries(model.choices).every(([key, values]) => values.includes(artifact.decisions?.[key]))) {
    errors.push('Invalid design decisions');
  }
  if (!Array.isArray(artifact.rationale) || artifact.rationale.length !== Object.keys(model.choices).length ||
      !artifact.rationale.every(row => keysAre(row, ['decision', 'reason']) && Object.hasOwn(model.choices, row.decision) &&
        typeof row.reason === 'string' && row.reason.trim().length > 0 && row.reason.length <= 2000) ||
      !unique(artifact.rationale.map(row => row?.decision))) errors.push('Give one short rationale per decision');
  return { valid: errors.length === 0, artifact, errors };
}

export function compareObservations(artifact, observed) {
  if (!plain(observed) || !Array.isArray(observed.observations) || observed.observations.length === 0) {
    throw new Error('Evaluator produced no host observations');
  }
  const transitions = new Set(artifact.transitions.map(transitionKey));
  const errors = [];
  for (const row of observed.observations) {
    if (!plain(row) || !Array.isArray(row.effects) ||
        !['event', 'from', 'to'].every(key => typeof row[key] === 'string')) throw new Error('Malformed host observation');
    if (!transitions.has(transitionKey(row))) errors.push(`Undeclared transition ${transitionKey(row)}`);
    for (const effect of row.effects) if (!artifact.effects.includes(effect)) errors.push(`Undeclared effect ${effect}`);
  }
  if (observed.decisions !== undefined && !plain(observed.decisions)) throw new Error('Malformed observed decisions');
  for (const [key, value] of Object.entries(observed.decisions ?? {})) {
    if (!Object.hasOwn(artifact.decisions, key) || artifact.decisions[key] !== value) errors.push(`Observed ${key}=${value} contradicts design`);
  }
  return { passed: errors.length === 0, errors: [...new Set(errors)], observationCount: observed.observations.length,
    observedDecisions: observed.decisions ?? {} };
}
