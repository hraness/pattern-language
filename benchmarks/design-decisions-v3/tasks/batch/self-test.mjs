import assert from 'node:assert/strict';
import { cases } from './cases.mjs';
import * as reference from './reference.mjs';
import { assessDesign } from './design-check.mjs';

// A separately constructed legal policy proves the oracle admits both choices.
const lifo = {
  planBatch(input, capabilities) {
    if (!input || !Array.isArray(input.jobs)) return reference.planBatch(input, capabilities);
    const result = reference.planBatch({ ...input, jobs: [...input.jobs].reverse() }, capabilities);
    result.remaining.sort((a, b) => input.jobs.findIndex(item => item.id === a.id) - input.jobs.findIndex(item => item.id === b.id));
    result.decisions.scanOrder = 'lifo';
    return result;
  },
};

for (const [name, module] of [['fifo', reference], ['lifo', lifo]]) {
  for (const test of cases) {
    const result = await test.run(module);
    assert.ok(result.observations.length > 0, `${test.id} emits host observations`);
    for (const observation of result.observations) assert.deepEqual(observation.effects, []);
    if (result.decisions?.scanOrder) assert.equal(result.decisions.scanOrder, name);
  }
}

const targets = {
  storage: 'empty',
  schedule: 'empty',
  asynchronous: 'empty',
  capacity: 'exact_capacity',
  'same-batch-dependency': 'no_same_batch_dependency',
  'stop-oversized': 'skip_oversized_continue',
  'reverse-remaining': 'remaining_original_order',
  'alias-after': 'fresh_detached_results',
  'false-choice': 'scan_choice',
  'skip-validation': 'validate_unselected_jobs',
  'mutate-invalid': 'invalid_units',
  'empty-choice': 'stable_choice_across_calls',
};
const killed = [];
for (const [mutant, target] of Object.entries(targets)) {
  const module = await import(`./mutants/${mutant}.mjs`);
  const test = cases.find(item => item.id === target);
  assert.ok(test, `Known regression target ${target}`);
  await assert.rejects(() => test.run(module), undefined, `${mutant} must fail ${target}`);
  killed.push(`${mutant}:${target}`);
}

const design = {
  states: ['ready', 'returned', 'rejected'],
  transitions: [{ event: 'return', from: 'ready', to: 'returned' }, { event: 'throw', from: 'ready', to: 'rejected' }],
  effects: [],
  decisions: { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' },
};
assert.deepEqual(assessDesign(design), { adequate: true, errors: [] });
assert.equal(assessDesign({ ...design, decisions: { ...design.decisions, scanOrder: 'lifo' } }).adequate, true);
assert.equal(assessDesign({ ...design, transitions: [] }).adequate, false);
assert.equal(assessDesign({ ...design, transitions: [...design.transitions, { event: 'return', from: 'returned', to: 'ready' }] }).adequate, false);
assert.equal(assessDesign({ ...design, effects: ['storage-read'] }).adequate, false);
assert.equal(assessDesign({ ...design, decisions: { ...design.decisions, persistence: 'durable' } }).adequate, false);
assert.equal(assessDesign({ ...design, states: ['ready'] }).adequate, false);

console.log(JSON.stringify({ family: 'batch', reference: `${cases.length}/${cases.length}`, alternative: `${cases.length}/${cases.length}`, mutantsKilled: killed, designAdequacyChecks: 7 }));
