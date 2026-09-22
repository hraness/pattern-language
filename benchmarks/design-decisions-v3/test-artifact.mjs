import assert from 'node:assert/strict';
import { parseArtifact, compareObservations } from './artifact.mjs';

const artifact = {
  schema: 'pattern-language.design.v1', family: 'batch',
  states: ['ready', 'returned', 'rejected'],
  transitions: [{ event: 'return', from: 'ready', to: 'returned' }, { event: 'throw', from: 'ready', to: 'rejected' }],
  effects: [], decisions: { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' },
  rationale: ['scanOrder', 'execution', 'persistence', 'scheduling'].map(decision => ({ decision, reason: 'Contract commitment.' })),
};
const valid = value => parseArtifact(JSON.stringify(value), 'batch').valid;
assert.equal(valid(artifact), true);
assert.equal(parseArtifact(`\u0020\u0060\u0060\u0060json\n${JSON.stringify(artifact)}\n\u0060\u0060\u0060`, 'batch').valid, true);
for (const mutate of [
  value => { value.schema = 'other'; },
  value => { value.family = 'jobs'; },
  value => { value.transitions.push(value.transitions[0]); },
  value => { value.transitions[0].to = '*'; },
  value => { value.states = ['ready']; },
  value => { value.effects = ['network']; },
  value => { value.decisions.scanOrder = 'random'; },
  value => { value.decisions.extra = 'ignored'; },
  value => { value.rationale.pop(); },
  value => { value.surprise = true; },
]) {
  const changed = structuredClone(artifact); mutate(changed); assert.equal(valid(changed), false);
}
for (const value of [null, [], 1, { states: null }, { ...artifact, states: 3 }, { ...artifact, states: {} },
  { ...artifact, transitions: [null] }, { ...artifact, rationale: [null] }]) {
  assert.equal(valid(value), false);
}
const observation = { observations: [{ event: 'return', from: 'ready', to: 'returned', effects: [] }], decisions: { scanOrder: 'fifo' } };
assert.equal(compareObservations(artifact, observation).passed, true);
assert.equal(compareObservations(artifact, { ...observation, decisions: { scanOrder: 'lifo' } }).passed, false);
assert.equal(compareObservations(artifact, { observations: [{ ...observation.observations[0], effects: ['schedule'] }] }).passed, false);
assert.equal(compareObservations(artifact, { observations: [{ ...observation.observations[0], to: 'rejected' }] }).passed, false);
assert.throws(() => compareObservations(artifact, { observations: [] }), /no host observations/);
console.log('Design schema and host-observation agreement: OK');
