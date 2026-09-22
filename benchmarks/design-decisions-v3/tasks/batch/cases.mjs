import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const job = (id, units = 1, after = []) => ({ id, units, after });
const batch = (jobs, capacity = 10, completed = []) => ({ jobs, capacity, completed });
const clone = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const baseDecisions = { execution: 'synchronous', persistence: 'none', scheduling: 'none' };

async function invoke(module, input) {
  assert.equal(typeof module.planBatch, 'function', 'Export planBatch');
  const effects = [];
  const capabilities = {
    storage: {
      read() { effects.push('storage-read'); return undefined; },
      write() { effects.push('storage-write'); },
    },
    schedule() { effects.push('schedule'); },
  };
  let value;
  let error;
  let threw = false;
  try { value = module.planBatch(input, capabilities); }
  catch (caught) { threw = true; error = caught; }
  // Inspect the direct result without assimilating it. Also observe queued
  // promise microtasks; excluded ambient effects still require static review.
  const thenable = !threw && value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof value.then === 'function';
  if (thenable && typeof value.catch === 'function') value.catch(() => {});
  await Promise.resolve();
  await Promise.resolve();
  const observation = { event: threw ? 'throw' : 'return', from: 'ready', to: threw ? 'rejected' : 'returned', effects };
  assert.deepEqual(effects, [], 'No capability invocation is needed or allowed');
  assert.equal(thenable, false, 'Return synchronously, without a thenable');
  return { value, error, threw, observation };
}

function expected(input, selectedIds) {
  const selected = selectedIds.map(id => input.jobs.find(item => item.id === id));
  const picked = new Set(selectedIds);
  const clean = item => ({ id: item.id, units: item.units, after: [...item.after] });
  return {
    selected: selected.map(clean),
    remaining: input.jobs.filter(item => !picked.has(item.id)).map(clean),
    used: selected.reduce((sum, item) => sum + item.units, 0),
  };
}

async function valid(module, input, fifo, lifo, { frozen = true } = {}) {
  const snapshot = clone(input);
  if (frozen) freeze(input);
  const call = await invoke(module, input);
  assert.equal(call.threw, false, `Valid input must return, got ${String(call.error)}`);
  assert.deepEqual(input, snapshot, 'Caller data is unchanged');
  const value = call.value;
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Return a result object');
  assert.deepEqual(Object.keys(value).sort(), ['decisions', 'remaining', 'selected', 'used']);
  assert.deepEqual(Object.keys(value.decisions ?? {}).sort(), ['execution', 'persistence', 'scanOrder', 'scheduling']);
  assert.ok(['fifo', 'lifo'].includes(value.decisions.scanOrder), 'Report a supported scan order');
  assert.deepEqual(value.decisions, { scanOrder: value.decisions.scanOrder, ...baseDecisions });
  const actual = { selected: value.selected, remaining: value.remaining, used: value.used };
  const expectedFifo = expected(snapshot, fifo);
  const expectedLifo = expected(snapshot, lifo);
  // Fixture outputs are enumerated separately for both legal policies. Infer
  // the observed policy from actual selection/order on discriminating cases.
  const encode = item => JSON.stringify(item);
  const matchesFifo = isDeepStrictEqual(actual, expectedFifo);
  const matchesLifo = isDeepStrictEqual(actual, expectedLifo);
  assert.ok(matchesFifo || matchesLifo, `Invalid batch output: ${encode(actual)}`);
  assert.deepEqual(actual, value.decisions.scanOrder === 'fifo' ? expectedFifo : expectedLifo,
    'Returned scan order agrees with actual selection and ordering');
  assert.notEqual(value.selected, input.jobs);
  assert.notEqual(value.remaining, input.jobs);
  const outputJobs = [...value.selected, ...value.remaining];
  for (const out of outputJobs) {
    const source = input.jobs.find(item => item.id === out.id);
    assert.notEqual(out, source, 'Return detached job objects');
    assert.notEqual(out.after, source.after, 'Return detached predecessor arrays');
    assert.deepEqual(Object.keys(out).sort(), ['after', 'id', 'units']);
  }
  const decisions = { ...baseDecisions };
  if (matchesFifo !== matchesLifo) decisions.scanOrder = matchesFifo ? 'fifo' : 'lifo';
  return { observations: [call.observation], decisions, value };
}

const scenario = (id, group, input, fifo, lifo) => ({
  id, group,
  async run(module) {
    const { observations, decisions } = await valid(module, clone(input), fifo, lifo);
    return { observations, decisions };
  },
});

async function invalid(module, input, { frozen = false } = {}) {
  const snapshot = clone(input);
  if (frozen) freeze(input);
  const call = await invoke(module, input);
  assert.equal(call.threw, true, 'Invalid input must throw synchronously');
  assert.ok(call.error instanceof TypeError, 'Validation failures are TypeError');
  assert.deepEqual(input, snapshot, 'Invalid input is unchanged');
  return call.observation;
}

const invalidCase = (id, inputs) => ({
  id, group: 'validation',
  async run(module) {
    const observations = [];
    // Mutable input exposes mutation on an error path. Frozen-only inputs can
    // turn an attempted write into the very TypeError expected by the test.
    for (const input of inputs) {
      observations.push(await invalid(module, clone(input)));
      observations.push(await invalid(module, clone(input), { frozen: true }));
    }
    return { observations };
  },
});

export const cases = [
  scenario('empty', 'boundary', batch([], 0), [], []),
  scenario('zero_capacity', 'boundary', batch([job('a'), job('b')], 0), [], []),
  scenario('scan_choice', 'ordering', batch([job('a'), job('b'), job('c')], 2), ['a', 'b'], ['c', 'b']),
  scenario('all_fit_order', 'ordering', batch([job('a'), job('b'), job('c')], 3), ['a', 'b', 'c'], ['c', 'b', 'a']),
  scenario('skip_oversized_continue', 'capacity', batch([job('a', 5), job('b'), job('c', 2)], 3), ['b', 'c'], ['c', 'b']),
  scenario('greedy_not_optimal_packing', 'capacity', batch([job('a', 3), job('b', 2), job('c', 2)], 4), ['a'], ['c', 'b']),
  scenario('exact_capacity', 'capacity', batch([job('a', 2), job('b', 2), job('c')], 4), ['a', 'b'], ['c', 'b']),
  scenario('remaining_original_order', 'ordering', batch([job('a', 4), job('b'), job('c', 4), job('d')], 2), ['b', 'd'], ['d', 'b']),
  scenario('no_same_batch_dependency', 'dependencies', batch([job('a'), job('b', 1, ['a'])], 2), ['a'], ['a']),
  scenario('skip_blocked_continue', 'dependencies', batch([job('a', 1, ['b']), job('b'), job('c')], 2), ['b', 'c'], ['c', 'b']),
  scenario('all_predecessors_required', 'dependencies', batch([job('a', 1, ['done', 'b']), job('b')], 2, ['done']), ['b'], ['b']),
  scenario('completed_dependencies', 'dependencies', batch([job('a', 2, ['done', 'other']), job('b', 2, ['done'])], 4, ['done', 'other']), ['a', 'b'], ['b', 'a']),
  scenario('cycles_remain_blocked', 'dependencies', batch([job('a', 1, ['b']), job('b', 1, ['a']), job('c')], 3), ['c'], ['c']),
  scenario('special_ids_are_data', 'identifiers', batch([job('constructor', 1, ['__proto__']), job('toString')], 2, ['__proto__']), ['constructor', 'toString'], ['toString', 'constructor']),
  scenario('strings_not_trimmed', 'identifiers', batch([job(' a ', 1, [' done ']), job('a')], 2, [' done ']), [' a ', 'a'], ['a', ' a ']),
  scenario('maximum_units', 'boundary', batch([job('a', 999999), job('b', 1), job('c', 1000000)], 1000000), ['a', 'b'], ['c']),
  scenario('unknown_properties_ignored', 'copy', { ...batch([{ ...job('a'), metadata: { keep: false } }, job('b')], 2), ignored: true }, ['a', 'b'], ['b', 'a']),
  scenario('thirty_two_jobs', 'boundary', batch(Array.from({ length: 32 }, (_, i) => job(`j${i}`)), 16), Array.from({ length: 16 }, (_, i) => `j${i}`), Array.from({ length: 16 }, (_, i) => `j${31 - i}`)),
  {
    id: 'fresh_detached_results', group: 'copy',
    async run(module) {
      const input = batch([job('a', 1, ['done']), job('b', 2)], 1, ['done']);
      const first = await valid(module, input, ['a'], ['a'], { frozen: false });
      const second = await valid(module, input, ['a'], ['a'], { frozen: false });
      assert.notEqual(first.value, second.value);
      assert.notEqual(first.value.decisions, second.value.decisions);
      for (const key of ['selected', 'remaining']) {
        assert.notEqual(first.value[key], second.value[key]);
        assert.notEqual(first.value[key][0], second.value[key][0]);
        assert.notEqual(first.value[key][0].after, second.value[key][0].after);
      }
      const secondBefore = clone(second.value);
      first.value.selected[0].after.push('changed');
      first.value.selected[0].units = 999;
      first.value.remaining[0].after.push('changed');
      first.value.decisions.persistence = 'changed';
      assert.deepEqual(second.value, secondBefore, 'Results do not alias each other');
      assert.deepEqual(input, batch([job('a', 1, ['done']), job('b', 2)], 1, ['done']));
      return { observations: [...first.observations, ...second.observations], decisions: baseDecisions };
    },
  },
  {
    id: 'stable_choice_across_calls', group: 'ordering',
    async run(module) {
      const a = await valid(module, batch([job('a'), job('b'), job('c')], 2), ['a', 'b'], ['c', 'b']);
      const b = await valid(module, batch([job('x', 3), job('y', 2), job('z', 2)], 4), ['x'], ['z', 'y']);
      const c = await valid(module, batch([job('a'), job('b'), job('c')], 2), ['a', 'b'], ['c', 'b']);
      const empty = await valid(module, batch([], 0), [], []);
      const zero = await valid(module, batch([job('a'), job('b')], 0), [], []);
      assert.equal(a.decisions.scanOrder, b.decisions.scanOrder);
      assert.equal(a.decisions.scanOrder, c.decisions.scanOrder);
      // Empty and zero-capacity outputs cannot reveal traversal order. Their
      // returned declaration must still agree with the policy observed above.
      assert.equal(empty.value.decisions.scanOrder, a.decisions.scanOrder);
      assert.equal(zero.value.decisions.scanOrder, a.decisions.scanOrder);
      return { observations: [...a.observations, ...b.observations, ...c.observations,
        ...empty.observations, ...zero.observations], decisions: a.decisions };
    },
  },
  invalidCase('invalid_envelope', [null, undefined, [], 1, 'input', {}, { jobs: [], completed: [] }, { capacity: 0, jobs: [] }, { capacity: 0, completed: [] }]),
  invalidCase('invalid_capacity', [-1, 1.5, 1000001, Infinity, NaN, '2', null, true].map(capacity => batch([], capacity))),
  invalidCase('invalid_arrays', [{ jobs: {}, completed: [], capacity: 1 }, { jobs: [], completed: {}, capacity: 1 }, batch(Array.from({ length: 33 }, (_, i) => job(`j${i}`))), batch([, job('b')])]),
  invalidCase('invalid_completed', [['done', 'done'], [''], [1], [null], [, 'done']].map(completed => batch([], 1, completed))),
  invalidCase('invalid_jobs', [null, [], {}, job(''), job(1), { id: 'a', after: [] }, { id: 'a', units: 1 }, { ...job('a'), after: {} }].map(item => batch([item]))),
  invalidCase('invalid_units', [0, -1, 1.5, 1000001, Infinity, NaN, '1', null, true].map(units => batch([job('a', units)]))),
  invalidCase('duplicate_job_identity', [batch([job('a'), job('a')]), batch([job('a')], 1, ['a'])]),
  invalidCase('invalid_predecessors', [['unknown'], ['a'], ['done', 'done'], [''], [1], [null], [, 'done']].map(after => batch([job('a', 1, after)], 1, ['done']))),
  invalidCase('validate_unselected_jobs', [batch([job('a'), job('b', 1000001)], 1), batch([job('a', 1, ['unknown'])], 0), batch([job('a'), job('a', 10)], 0)]),
];
