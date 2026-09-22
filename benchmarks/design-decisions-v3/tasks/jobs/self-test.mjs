import assert from 'node:assert/strict';
import * as reference from './reference.mjs';
import { cases } from './cases.mjs';
import { mutants, lifo } from './mutants.mjs';
import { assessDesign, referenceDesign } from './design-check.mjs';
import { readFileSync } from 'node:fs';

const vocabulary = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));
const transitions = new Set(referenceDesign.transitions.map(x => `${x.event}:${x.from}->${x.to}`));
const seen = new Set();
assert.equal(assessDesign(referenceDesign).adequate, true);
assert.equal(assessDesign({ ...referenceDesign, transitions: referenceDesign.transitions.slice(1) }).adequate, false);
assert.equal(assessDesign({ ...referenceDesign, transitions: [
  ...referenceDesign.transitions, { event: 'complete', from: 'queued', to: 'done' },
] }).adequate, false);
const cartesian = vocabulary.events.flatMap(event => vocabulary.states.flatMap(from =>
  vocabulary.states.map(to => ({ event, from, to }))));
assert.equal(assessDesign({ ...referenceDesign, transitions: cartesian }).adequate, false);
assert.equal(assessDesign({ ...referenceDesign, decisions: { ...referenceDesign.decisions, publication_boundary: 'before_commit' } }).adequate, false);

for (const [name, module] of [['fifo', reference], ['lifo', lifo]]) {
  for (const test of cases) {
    const result = test.run(module);
    assert.ok(result.observations.length);
    for (const observation of result.observations) {
      const key = `${observation.event}:${observation.from}->${observation.to}`;
      assert.ok(transitions.has(key), `contract trace: ${key}`);
      seen.add(key);
      for (const effect of observation.effects) assert.ok(vocabulary.effects.includes(effect));
    }
    if (result.decisions.dispatch_order) assert.equal(result.decisions.dispatch_order, name);
  }
}
assert.deepEqual([...seen].sort(), [...transitions].sort(), 'reference scenarios exercise every declared transition');
for (const mutant of mutants) {
  const test = cases.find(item => item.id === mutant.killedBy);
  assert.ok(test, `causal case exists for ${mutant.id}`);
  assert.throws(() => test.run(mutant.module), { name: 'AssertionError' }, `${mutant.id} must fail ${mutant.killedBy}`);
}
console.log(`Jobs: ${cases.length} cases pass FIFO and LIFO; ${mutants.length} causal mutants killed; contract adequacy and complete transition coverage verified.`);
