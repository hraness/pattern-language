import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const observe = promise => {
  const state = { settled: false };
  state.done = Promise.resolve(promise).then(
    value => Object.assign(state, { settled: true, ok: true, value }),
    reason => Object.assign(state, { settled: true, ok: false, reason }),
  );
  return state;
};
const rejection = async (promise, expected) => {
  const outcome = await observe(promise).done;
  assert.equal(outcome.ok, false, 'must reject');
  assert.equal(outcome.reason, expected, 'must preserve reason identity');
};
const cases = [];
const test = (id, stage, group, run) => cases.push({ id, stage, group, run });

test('base.validation', 'base', 'contract', async map => {
  let calls = 0;
  const worker = () => calls++;
  for (const limit of [0, -1, 1.5, Infinity, NaN, '2', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => map([], limit, worker), TypeError);
  }
  for (const items of [null, undefined, {}, 'abc']) {
    await assert.rejects(() => map(items, 1, worker), TypeError);
  }
  for (const workerValue of [null, undefined, 7, {}]) {
    await assert.rejects(() => map([], 1, workerValue), TypeError);
  }
  assert.equal(calls, 0);
});

test('base.empty', 'base', 'contract', async map => {
  assert.deepEqual(await map([], 3, () => assert.fail('empty input invoked a worker')), []);
});

test('base.capacity_order', 'base', 'behavior', async map => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  let active = 0, peak = 0;
  const outcome = observe(map([0, 1, 2, 3, 4], 2, (value, index) => {
    assert.equal(value, index);
    started.push(index);
    peak = Math.max(peak, ++active);
    return gates[index].promise.finally(() => { active--; });
  }));
  await turn();
  assert.deepEqual(started, [0, 1], 'fill available capacity');
  gates[1].resolve('b');
  await turn();
  assert.deepEqual(started, [0, 1, 2], 'reuse a released slot');
  gates[2].resolve('c');
  await turn();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[0].resolve('a');
  await turn();
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  gates[4].resolve('e');
  await turn();
  assert.equal(outcome.settled, false, 'unfinished work keeps the result pending');
  gates[3].resolve('d');
  await outcome.done;
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.deepEqual(outcome.value, ['a', 'b', 'c', 'd', 'e']);
});

test('base.snapshot', 'base', 'perturbation', async map => {
  const items = ['first', 'original', 'last'];
  const gate = deferred();
  const seen = [];
  const result = map(items, 1, (value, index) => {
    seen.push(value);
    return index === 0 ? gate.promise : value;
  });
  items[1] = 'changed';
  items.push('added');
  gate.resolve('first');
  assert.deepEqual(await result, ['first', 'original', 'last']);
  assert.deepEqual(seen, ['first', 'original', 'last']);
  assert.deepEqual(items, ['first', 'changed', 'last', 'added']);
});

test('base.values_thenables', 'base', 'perturbation', async map => {
  const input = Object.freeze([0, 1, 2, 3]);
  const output = await map(input, 3, (value, index) => {
    assert.equal(value, index);
    if (index === 0) return undefined;
    if (index === 1) return null;
    if (index === 2) return { then(resolve) { resolve('first'); resolve('ignored'); } };
    return Promise.resolve(false);
  });
  assert.deepEqual(output, [undefined, null, 'first', false]);
});

test('base.failure_drains', 'base', 'behavior', async map => {
  const gates = Array.from({ length: 6 }, deferred);
  const started = [];
  const first = { failure: 'first' }, second = { failure: 'second' };
  const outcome = observe(map([0, 1, 2, 3, 4, 5], 3, (_, index) => {
    started.push(index);
    return gates[index].promise;
  }));
  await turn();
  assert.deepEqual(started, [0, 1, 2]);
  gates[1].reject(first);
  await turn();
  assert.deepEqual(started, [0, 1, 2]);
  assert.equal(outcome.settled, false, 'failure must drain admitted work');
  gates[0].resolve('done');
  await turn();
  assert.equal(outcome.settled, false);
  gates[2].reject(second);
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, first);
  assert.deepEqual(started, [0, 1, 2]);
});

test('base.synchronous_throw', 'base', 'perturbation', async map => {
  const first = deferred();
  const cause = new Error('synchronous');
  const started = [];
  const outcome = observe(map([0, 1, 2, 3], 3, (_, index) => {
    started.push(index);
    if (index === 1) throw cause;
    return first.promise;
  }));
  await turn();
  assert.deepEqual(started, [0, 1], 'synchronous failure stops initial admissions');
  assert.equal(outcome.settled, false);
  first.resolve('done');
  await outcome.done;
  assert.equal(outcome.reason, cause);
});

test('base.falsy_reasons', 'base', 'perturbation', async map => {
  for (const failureMode of ['promise', 'throw']) {
    for (const reason of [undefined, null, false, 0, '']) {
      const started = [];
      await rejection(map([0, 1], 1, (_, index) => {
        started.push(index);
        if (failureMode === 'throw') throw reason;
        return Promise.reject(reason);
      }), reason);
      assert.deepEqual(started, [0]);
    }
  }
});

test('base.then_getter_failure', 'base', 'perturbation', async map => {
  const reason = new Error('then getter');
  await rejection(map([0], 1, () => ({ get then() { throw reason; } })), reason);
});

for (const [count, limit] of [[31, 1], [31, 50], [513, 7]]) {
  test(`base.scale_${count}_${limit}`, 'base', 'perturbation', async map => {
    const items = Array.from({ length: count }, (_, index) => index);
    const visits = new Array(count).fill(0);
    let active = 0, peak = 0;
    const result = await map(items, limit, async (value, index) => {
      visits[index]++;
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      return value * 2;
    });
    assert.deepEqual(result, items.map(value => value * 2));
    assert.deepEqual(visits, new Array(count).fill(1));
    assert.equal(active, 0);
    assert.ok(peak <= limit, `peak ${peak} exceeds ${limit}`);
    assert.equal(peak, Math.min(count, limit), 'use available capacity');
  });
}

test('change.options_validation', 'change', 'contract', async map => {
  let calls = 0;
  for (const options of [null, 1, 'x', { signal: {} }, { signal: null }]) {
    await assert.rejects(() => map([], 1, () => calls++, options), TypeError);
  }
  const controller = new AbortController();
  controller.abort(new Error('aborted'));
  await assert.rejects(() => map([], 0, () => calls++, { signal: controller.signal }), TypeError);
  assert.equal(calls, 0);
});

test('change.preaborted', 'change', 'behavior', async map => {
  for (const reason of [new Error('stop'), null, false, 0, '']) {
    const controller = new AbortController();
    controller.abort(reason);
    for (const items of [[], [0, 1]]) {
      await rejection(map(items, 2, () => assert.fail('aborted worker started'), {
        signal: controller.signal,
      }), reason);
    }
  }
  const controller = new AbortController();
  controller.abort();
  await rejection(map([1], 1, () => assert.fail(), { signal: controller.signal }), controller.signal.reason);
});

test('change.abort_drains', 'change', 'behavior', async map => {
  const controller = new AbortController();
  const gates = Array.from({ length: 4 }, deferred);
  const started = [];
  const cause = { abort: true };
  const outcome = observe(map([0, 1, 2, 3], 2, (_, index, signal) => {
    assert.equal(signal, controller.signal, 'pass the same signal to workers');
    started.push(index);
    return gates[index].promise;
  }, { signal: controller.signal }));
  await turn();
  assert.deepEqual(started, [0, 1]);
  controller.abort(cause);
  await turn();
  assert.equal(outcome.settled, false, 'abort must drain work');
  gates[0].resolve('done');
  await turn();
  assert.equal(outcome.settled, false);
  assert.deepEqual(started, [0, 1]);
  gates[1].reject(new Error('secondary failure'));
  await outcome.done;
  assert.equal(outcome.reason, cause);
  assert.deepEqual(started, [0, 1]);
});

test('change.failure_before_abort', 'change', 'perturbation', async map => {
  const controller = new AbortController();
  const gates = [deferred(), deferred()];
  const failure = { failure: true };
  const outcome = observe(map([0, 1, 2], 2, (_, index) => gates[index].promise, {
    signal: controller.signal,
  }));
  gates[0].reject(failure);
  await turn();
  controller.abort(new Error('later abort'));
  gates[1].resolve('done');
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, failure);
});

test('change.reentrant_abort', 'change', 'perturbation', async map => {
  const controller = new AbortController();
  const reason = { reentrant: true };
  const gate = deferred();
  const started = [];
  const outcome = observe(map([0, 1, 2], 3, (_, index) => {
    started.push(index);
    controller.abort(reason);
    return gate.promise;
  }, { signal: controller.signal }));
  await turn();
  assert.deepEqual(started, [0]);
  assert.equal(outcome.settled, false);
  gate.resolve('done');
  await outcome.done;
  assert.equal(outcome.reason, reason);
});

test('change.abort_then_sync_throw', 'change', 'perturbation', async map => {
  const controller = new AbortController();
  const reason = { first: true };
  await rejection(map([0, 1], 2, () => {
    controller.abort(reason);
    throw new Error('second');
  }, { signal: controller.signal }), reason);
});

test('change.listener_cleanup', 'change', 'resource', async map => {
  for (const mode of ['success', 'failure', 'abort']) {
    const controller = new AbortController();
    const gate = deferred();
    const before = getEventListeners(controller.signal, 'abort').length;
    const outcome = observe(map([0], 1, () => gate.promise, { signal: controller.signal }));
    if (mode === 'abort') controller.abort('cancel');
    if (mode === 'failure') gate.reject('failure');
    else gate.resolve('done');
    await outcome.done;
    assert.equal(getEventListeners(controller.signal, 'abort').length, before, `${mode} leaked a listener`);
  }
});

test('change.independent_calls', 'change', 'perturbation', async map => {
  const controller = new AbortController();
  const gate = deferred();
  const reason = { stop: true };
  const slow = observe(map([1, 2], 1, () => gate.promise, { signal: controller.signal }));
  const fast = await map([3], 1, value => value * 2, { signal: controller.signal });
  assert.deepEqual(fast, [6]);
  controller.abort(reason);
  gate.resolve('late');
  await slow.done;
  assert.equal(slow.reason, reason);
  assert.deepEqual(fast, [6]);
});

export { cases, turn };
