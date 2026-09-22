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
const rejectsWith = async (promise, reason) => {
  const result = await observe(promise).done;
  assert.equal(result.ok, false, 'must reject');
  assert.equal(result.reason, reason, 'must preserve failure identity');
};
const options = overrides => ({ maxAttempts: 3, shouldRetry: () => true, wait: () => {}, ...overrides });
export const cases = [];
const test = (id, stage, group, run) => cases.push({ id, stage, group, run });

test('base.validation', 'base', 'contract', async retry => {
  let called = 0;
  const hook = () => called++;
  for (const config of [undefined, null, 1, {}, options({ maxAttempts: 0 }),
    options({ maxAttempts: 1.5 }), options({ maxAttempts: Infinity }),
    options({ maxAttempts: Number.MAX_SAFE_INTEGER + 1 }), options({ maxAttempts: '3' }),
    options({ shouldRetry: null }), options({ wait: null })]) {
    await assert.rejects(() => retry(hook, config), TypeError);
  }
  for (const operation of [null, undefined, 1, {}]) {
    await assert.rejects(() => retry(operation, options({ shouldRetry: hook, wait: hook })), TypeError);
  }
  assert.equal(called, 0);
});

test('base.success_countercontext', 'base', 'countercontext', async retry => {
  const unused = () => assert.fail('successful operation requires no retry machinery');
  for (const value of [null, undefined, false, 0, 'ok']) {
    let called = 0;
    const config = Object.freeze(options({ shouldRetry: unused, wait: unused }));
    assert.equal(await retry(attempt => { called++; assert.equal(attempt, 1); return value; }, config), value);
    assert.equal(called, 1);
  }
});

test('base.one_attempt_countercontext', 'base', 'countercontext', async retry => {
  const unused = () => assert.fail('no policy or wait after final attempt');
  for (const reason of [undefined, null, false, 0, { failure: true }]) {
    let called = 0;
    await rejectsWith(retry(attempt => { called++; assert.equal(attempt, 1); throw reason; },
      options({ maxAttempts: 1, shouldRetry: unused, wait: unused })), reason);
    assert.equal(called, 1);
  }
});

test('base.thenable_assimilation', 'base', 'perturbation', async retry => {
  const transient = {};
  const log = [];
  const result = await retry(attempt => {
    log.push(`operation:${attempt}`);
    return attempt === 1 ? { then(resolve, reject) { reject(transient); resolve('ignored'); } }
      : { then(resolve) { resolve('done'); resolve('ignored'); } };
  }, options({
    shouldRetry: (reason, attempt) => { assert.equal(reason, transient); assert.equal(attempt, 1); return true; },
    wait: attempt => ({ then(resolve) { log.push(`wait:${attempt}`); resolve(); } }),
  }));
  assert.equal(result, 'done');
  assert.deepEqual(log, ['operation:1', 'wait:1', 'operation:2']);
});

test('base.serial_attempt_and_wait', 'base', 'behavior', async retry => {
  const first = deferred(), waiting = deferred(), second = deferred();
  const log = [];
  const reason = {};
  const result = observe(retry(attempt => {
    log.push(`operation:${attempt}`);
    return attempt === 1 ? first.promise : second.promise;
  }, options({
    shouldRetry: (error, attempt) => { assert.equal(error, reason); log.push(`policy:${attempt}`); return true; },
    wait: attempt => { log.push(`wait:${attempt}`); return waiting.promise; },
  })));
  await turn();
  assert.deepEqual(log, ['operation:1']);
  first.reject(reason);
  await turn();
  assert.deepEqual(log, ['operation:1', 'policy:1', 'wait:1']);
  assert.equal(result.settled, false);
  waiting.resolve();
  await turn();
  assert.deepEqual(log, ['operation:1', 'policy:1', 'wait:1', 'operation:2']);
  assert.equal(result.settled, false);
  second.resolve('ok');
  await result.done;
  assert.equal(result.value, 'ok');
});

test('base.bound_and_last_reason', 'base', 'behavior', async retry => {
  const reasons = [null, undefined, { final: true }];
  const log = [];
  await rejectsWith(retry(attempt => { log.push(`operation:${attempt}`); return Promise.reject(reasons[attempt - 1]); },
    options({
      shouldRetry: (reason, attempt) => { assert.equal(reason, reasons[attempt - 1]); log.push(`policy:${attempt}`); return true; },
      wait: attempt => { log.push(`wait:${attempt}`); },
    })), reasons[2]);
  assert.deepEqual(log, ['operation:1', 'policy:1', 'wait:1', 'operation:2', 'policy:2', 'wait:2', 'operation:3']);
});

test('base.policy_stop', 'base', 'behavior', async retry => {
  for (const reason of [undefined, null, false, 0, { permanent: true }]) {
    let attempts = 0, policies = 0;
    await rejectsWith(retry(() => { attempts++; throw reason; }, options({
      shouldRetry: (error, attempt) => { policies++; assert.equal(error, reason); assert.equal(attempt, 1); return false; },
      wait: () => assert.fail('policy denied retry'),
    })), reason);
    assert.equal(attempts, 1);
    assert.equal(policies, 1);
  }
});

test('base.policy_failure', 'base', 'perturbation', async retry => {
  const reason = {};
  const config = options({ shouldRetry: () => { throw reason; }, wait: () => assert.fail('policy failed') });
  await rejectsWith(retry(() => { throw null; }, config), reason);
  for (const invalid of ['yes', undefined, Promise.reject(new Error('invalid async policy'))]) {
    await assert.rejects(() => retry(() => { throw 0; }, options({
      shouldRetry: () => invalid, wait: () => assert.fail('invalid policy'),
    })), TypeError);
  }
});

test('base.wait_failure', 'base', 'perturbation', async retry => {
  for (const asyncFailure of [false, true]) {
    let attempts = 0;
    const reason = asyncFailure ? undefined : null;
    await rejectsWith(retry(() => { attempts++; throw new Error('transient'); }, options({
      wait: () => { if (asyncFailure) return Promise.reject(reason); throw reason; },
    })), reason);
    assert.equal(attempts, 1);
  }
});

test('base.independent_calls', 'base', 'behavior', async retry => {
  const gate = deferred();
  const left = observe(retry(attempt => attempt === 1 ? Promise.reject(null) : 'left', options({ wait: () => gate.promise })));
  const right = retry(() => 'right', options());
  assert.equal(await right, 'right');
  assert.equal(left.settled, false);
  gate.resolve();
  await left.done;
  assert.equal(left.value, 'left');
});

test('change.signal_validation', 'change', 'contract', async retry => {
  let called = 0;
  for (const signal of [null, {}, false, 'signal']) {
    await assert.rejects(() => retry(() => called++, options({ signal })), TypeError);
  }
  const controller = new AbortController();
  controller.abort('cancelled');
  await assert.rejects(() => retry(() => called++, options({ maxAttempts: 0, signal: controller.signal })), TypeError);
  assert.equal(called, 0);
});

test('change.preaborted', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  controller.abort(null);
  const unused = () => assert.fail('preaborted call must not invoke a hook');
  await rejectsWith(retry(unused, options({ signal: controller.signal, shouldRetry: unused, wait: unused })), null);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('change.abort_active_operation_drains', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  const gate = deferred();
  const reason = {};
  let calls = 0;
  const outcome = observe(retry((attempt, signal) => {
    calls++;
    assert.equal(attempt, 1);
    assert.equal(signal, controller.signal);
    return gate.promise;
  }, options({ signal: controller.signal, shouldRetry: () => assert.fail('no policy after abort') })));
  await turn();
  controller.abort(reason);
  await turn();
  assert.equal(outcome.settled, false, 'active operation must drain');
  gate.reject(new Error('late operation failure'));
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, reason);
  assert.equal(calls, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('change.abort_wait_drains', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  const gate = deferred();
  let calls = 0, waits = 0;
  const outcome = observe(retry(() => { calls++; throw 'transient'; }, options({
    signal: controller.signal,
    wait: (attempt, signal) => { waits++; assert.equal(attempt, 1); assert.equal(signal, controller.signal); return gate.promise; },
  })));
  await turn();
  assert.equal(waits, 1);
  controller.abort(null);
  await turn();
  assert.equal(outcome.settled, false, 'active wait must drain');
  gate.reject('late wait failure');
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, null);
  assert.equal(calls, 1);
});

test('change.synchronous_abort_operation', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  const gate = deferred();
  const outcome = observe(retry(() => { controller.abort(0); return gate.promise; }, options({
    signal: controller.signal, shouldRetry: () => assert.fail('no policy after synchronous abort'),
  })));
  await turn();
  assert.equal(outcome.settled, false);
  gate.resolve('discarded');
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 0);
});

test('change.synchronous_abort_wait', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  const gate = deferred();
  const outcome = observe(retry(() => { throw 'transient'; }, options({
    signal: controller.signal, wait: () => { controller.abort(false); return gate.promise; },
  })));
  await turn();
  assert.equal(outcome.settled, false);
  gate.reject('late');
  await outcome.done;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, false);
});

test('change.abort_inside_policy', 'change', 'lifecycle', async retry => {
  for (const throwAfter of [false, true]) {
    const controller = new AbortController();
    await rejectsWith(retry(() => { throw 'transient'; }, options({
      signal: controller.signal,
      shouldRetry: () => { controller.abort(null); if (throwAfter) throw 'later'; return true; },
      wait: () => assert.fail('policy aborted before wait'),
    })), null);
  }
});

test('change.terminal_before_abort', 'change', 'lifecycle', async retry => {
  for (const boundary of ['operation', 'policy', 'wait']) {
    const controller = new AbortController();
    const reason = null;
    const outcome = retry(() => { throw reason; }, options({
      signal: controller.signal,
      maxAttempts: boundary === 'operation' ? 1 : 3,
      shouldRetry: () => { if (boundary === 'policy') throw reason; return true; },
      wait: () => { throw reason; },
    }));
    controller.abort('later abort');
    await rejectsWith(outcome, reason);
  }
});

test('change.cleanup_all_paths', 'change', 'lifecycle', async retry => {
  for (const boundary of ['success', 'operation', 'policy', 'wait']) {
    const controller = new AbortController();
    const sentinel = () => {};
    controller.signal.addEventListener('abort', sentinel);
    const outcome = await observe(retry(() => {
      if (boundary !== 'success') throw 'failure';
      return 'success';
    }, options({
      signal: controller.signal, maxAttempts: boundary === 'operation' ? 1 : 3,
      shouldRetry: () => { if (boundary === 'policy') throw 'policy'; return true; },
      wait: () => { throw 'wait'; },
    }))).done;
    assert.deepEqual(getEventListeners(controller.signal, 'abort'), [sentinel]);
    controller.abort('after settlement');
    assert.equal(outcome.ok, boundary === 'success');
    controller.signal.removeEventListener('abort', sentinel);
  }
});

test('change.shared_signal_independence', 'change', 'lifecycle', async retry => {
  const controller = new AbortController();
  const gate = deferred();
  const pending = observe(retry(() => gate.promise, options({ signal: controller.signal })));
  assert.equal(await retry(() => 'fast', options({ signal: controller.signal })), 'fast');
  controller.abort('shared cancellation');
  await turn();
  assert.equal(pending.settled, false);
  gate.resolve('late');
  await pending.done;
  assert.equal(pending.reason, 'shared cancellation');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

export default cases;
