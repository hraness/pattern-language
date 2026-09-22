import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const fields = record => ({ id: record.id, input: record.input, status: record.status, token: record.token, result: record.result });
const view = store => ({ capacity: store.capacity, concurrency: store.concurrency, nextToken: store.nextToken, jobs: store.jobs.map(fields) });
const status = (store, id) => store.jobs.find(job => job.id === id)?.status ?? 'absent';

function json(value, label) {
  assert.notEqual(value, undefined, `${label} is data`);
  assert.deepEqual(clone(value), value, `${label} must contain only JSON data`);
}

function shape(store, config) {
  json(store, 'store');
  assert.equal(store.capacity, config.capacity);
  assert.equal(store.concurrency, config.concurrency);
  assert.ok(Number.isSafeInteger(store.nextToken) && store.nextToken > 0);
  assert.ok(Array.isArray(store.jobs));
  const ids = new Set(), tokens = new Set();
  for (const job of store.jobs) {
    assert.ok(typeof job.id === 'string' && job.id.length > 0);
    assert.equal(typeof job.input, 'string');
    assert.ok(!ids.has(job.id), 'one durable record per accepted id');
    ids.add(job.id);
    assert.ok(['queued', 'active', 'done'].includes(job.status));
    if (job.status === 'queued') {
      assert.equal(job.token, null);
      assert.equal(job.result, null);
    } else {
      assert.ok(Number.isSafeInteger(job.token) && job.token > 0 && job.token < store.nextToken);
      assert.ok(!tokens.has(job.token), 'committed dispatch tokens are unique');
      tokens.add(job.token);
      if (job.status === 'active') assert.equal(job.result, null);
      else assert.equal(typeof job.result, 'string');
    }
  }
  assert.ok(store.jobs.filter(job => job.status !== 'done').length <= config.capacity, 'admission bound');
  assert.ok(store.jobs.filter(job => job.status === 'active').length <= config.concurrency, 'active bound');
}

// The host observes public records and actual replies; it never reads candidate logs.
function host(module, config = { capacity: 3, concurrency: 2 }) {
  assert.equal(typeof module.createStore, 'function');
  assert.equal(typeof module.step, 'function');
  let current = module.createStore(freeze(clone(config)));
  shape(current, config);
  assert.deepEqual(view(current), { ...config, nextToken: 1, jobs: [] });
  current = clone(current);
  const observations = [];
  const orders = new Set();

  function send(command, commit = true) {
    const before = clone(current);
    const input = freeze(clone(current));
    const supplied = freeze(clone(command));
    const output = module.step(input, supplied);
    json(output, 'step output');
    assert.deepEqual(input, before, 'input durable state must not be mutated');
    assert.deepEqual(supplied, command, 'input command must not be mutated');
    assert.ok(output && typeof output === 'object' && !Array.isArray(output));
    assert.ok(output.store && output.reply);
    // A pre-commit crash exposes neither computed state nor computed reply.
    if (!commit) return;

    const after = output.store, reply = output.reply;
    shape(after, config);
    const expected = view(before);
    const job = expected.jobs.find(record => record.id === command.id);
    let expectedReply;
    let unchanged = false;
    if (command.type === 'submit') {
      if (job) {
        unchanged = true;
        if (job.input !== command.input) expectedReply = { type: 'conflict', id: command.id };
        else {
          expectedReply = { type: 'duplicate', id: command.id, status: job.status };
          if (job.status === 'done') expectedReply.receipt = { token: job.token, result: job.result };
        }
      } else if (expected.jobs.filter(record => record.status !== 'done').length === config.capacity) {
        unchanged = true;
        expectedReply = { type: 'full', id: command.id };
      } else {
        expected.jobs.push({ id: command.id, input: command.input, status: 'queued', token: null, result: null });
        expectedReply = { type: 'accepted', id: command.id };
      }
    } else if (command.type === 'claim') {
      const queued = expected.jobs.filter(record => record.status === 'queued');
      if (!queued.length || expected.jobs.filter(record => record.status === 'active').length === config.concurrency) {
        unchanged = true;
        expectedReply = { type: 'idle' };
      } else {
        const selected = queued.find(record => record.id === reply.id);
        assert.ok(selected, 'claim dispatches a queued job');
        assert.ok(selected === queued[0] || selected === queued.at(-1), 'fixed FIFO or LIFO dispatch');
        if (queued.length > 1) orders.add(selected === queued[0] ? 'fifo' : 'lifo');
        assert.ok(orders.size <= 1, 'dispatch policy is stable');
        selected.status = 'active';
        selected.token = expected.nextToken++;
        expectedReply = { type: 'dispatch', id: selected.id, input: selected.input, token: selected.token };
      }
    } else if (command.type === 'complete') {
      if (!job || job.status === 'queued' || job.token !== command.token) {
        unchanged = true;
        expectedReply = { type: 'ignored', id: command.id };
      } else {
        if (job.status === 'done') unchanged = true;
        else { job.status = 'done'; job.result = command.result; }
        expectedReply = { type: 'receipt', id: job.id, token: job.token, result: job.result };
      }
    } else {
      for (const record of expected.jobs) if (record.status === 'active') {
        record.status = 'queued'; record.token = null;
      }
      expectedReply = { type: 'restarted' };
      unchanged = !before.jobs.some(record => record.status === 'active');
    }
    assert.deepEqual(reply, expectedReply, `${command.type} reply`);
    assert.deepEqual(view(after), expected, `${command.type} durable transition`);
    if (unchanged) assert.deepEqual(after, before, `${command.type} is an actual no-op`);

    const effects = [];
    if (!isDeepStrictEqual(before, after)) effects.push('durable_write');
    if (reply.type === 'dispatch') effects.push('dispatch');
    if (reply.type === 'receipt' || reply.receipt) effects.push('receipt_publish');
    const ids = command.type === 'restart' ? before.jobs.map(record => record.id)
      : [command.type === 'claim' ? (reply.type === 'dispatch' ? reply.id : undefined) : command.id];
    if (!ids.length) ids.push(undefined);
    for (const id of ids) observations.push({ event: command.type, from: status(before, id), to: status(after, id), effects: [...effects] });
    current = clone(after);
    return clone(reply);
  }
  return {
    send,
    discard: command => send(command, false),
    get store() { return clone(current); },
    outcome() {
      return { observations, decisions: {
        ...(orders.size ? { dispatch_order: [...orders][0] } : {}),
        storage_owner: 'durable_store', publication_boundary: 'after_commit', recovery: 'requeue_and_fence',
      } };
    },
  };
}

const submit = (h, id, input = `input:${id}`) => h.send({ type: 'submit', id, input });
const claim = h => h.send({ type: 'claim' });
const finish = (h, dispatch, result = `result:${dispatch.id}`) => h.send({ type: 'complete', id: dispatch.id, token: dispatch.token, result });
const restart = h => h.send({ type: 'restart' });
function drain(h) {
  // At most capacity jobs remain; no arrivals/crashes and every dispatch completes.
  let steps = 0;
  while (h.store.jobs.some(job => job.status !== 'done')) {
    const running = h.store.jobs.filter(job => job.status === 'active');
    for (const job of running) finish(h, job);
    const dispatch = claim(h);
    if (dispatch.type === 'dispatch') finish(h, dispatch);
    assert.ok(++steps <= h.store.capacity + 1, 'finite fair continuation makes progress');
  }
  assert.equal(claim(h).type, 'idle');
}

export const cases = [
  { id: 'jobs.empty_and_unknown', group: 'countercontext', run(module) {
    const h = host(module);
    claim(h); restart(h); restart(h);
    h.send({ type: 'complete', id: 'missing', token: 7, result: '' });
    assert.equal(h.store.jobs.length, 0);
    return h.outcome();
  } },
  { id: 'jobs.duplicate_conflict_and_receipt', group: 'identity', run(module) {
    const h = host(module, { capacity: 1, concurrency: 1 });
    submit(h, '__proto__', ''); submit(h, '__proto__', ''); submit(h, '__proto__', 'conflict');
    submit(h, 'other');
    h.send({ type: 'complete', id: '__proto__', token: 1, result: 'premature' });
    const dispatch = claim(h);
    submit(h, '__proto__', ''); submit(h, '__proto__', 'conflict'); claim(h);
    finish(h, dispatch, '');
    finish(h, dispatch, 'must not replace committed result');
    submit(h, '__proto__', ''); submit(h, '__proto__', 'conflict');
    restart(h); submit(h, 'other'); drain(h);
    assert.equal(h.store.jobs[0].result, '');
    return h.outcome();
  } },
  { id: 'jobs.capacity_and_dispatch_order', group: 'bounds', run(module) {
    const h = host(module, { capacity: 4, concurrency: 2 });
    for (const id of ['a', 'b', 'c', 'd']) submit(h, id);
    submit(h, 'overflow');
    const first = claim(h), second = claim(h);
    claim(h); submit(h, 'overflow');
    finish(h, second); submit(h, 'e');
    const third = claim(h); claim(h); finish(h, first); finish(h, third);
    drain(h);
    assert.equal(h.store.jobs.length, 5);
    return h.outcome();
  } },
  { id: 'jobs.precommit_loss', group: 'atomicity', run(module) {
    const h = host(module);
    h.discard({ type: 'submit', id: 'never-accepted', input: '' });
    claim(h);
    submit(h, 'a');
    h.discard({ type: 'claim' });
    const dispatch = claim(h);
    assert.equal(dispatch.token, 1, 'discarded dispatch was never published');
    h.discard({ type: 'complete', id: 'a', token: dispatch.token, result: 'lost' });
    restart(h);
    finish(h, dispatch, 'stale');
    const next = claim(h);
    assert.equal(next.token, 2);
    finish(h, next, 'durable');
    assert.deepEqual(h.store.jobs.map(job => job.id), ['a']);
    return h.outcome();
  } },
  { id: 'jobs.postcommit_reply_loss', group: 'atomicity', run(module) {
    const h = host(module);
    // The harness commits these replies; the simulated caller discards delivery.
    submit(h, 'a'); restart(h); submit(h, 'a');
    const lostDispatch = claim(h);
    restart(h); finish(h, lostDispatch, 'obsolete');
    const current = claim(h);
    finish(h, current, 'committed');
    restart(h);
    finish(h, current, 'retry changed result');
    const duplicate = submit(h, 'a');
    assert.deepEqual(duplicate.receipt, { token: current.token, result: 'committed' });
    return h.outcome();
  } },
  { id: 'jobs.repeated_recovery_and_stale_results', group: 'recovery', run(module) {
    const h = host(module);
    submit(h, 'a'); submit(h, 'b'); submit(h, 'c');
    const old = [claim(h), claim(h)];
    restart(h); restart(h);
    for (const dispatch of old) finish(h, dispatch, 'stale while queued');
    const newer = [claim(h), claim(h)];
    for (const dispatch of old) finish(h, dispatch, 'stale while active');
    finish(h, newer[1], 'winner');
    restart(h);
    for (const dispatch of [...old, newer[0]]) finish(h, dispatch, 'stale after second recovery');
    drain(h);
    for (const dispatch of old) finish(h, dispatch, 'stale after completion');
    assert.equal(h.store.jobs.find(job => job.id === newer[1].id).result, 'winner');
    return h.outcome();
  } },
  { id: 'jobs.fair_finite_continuation', group: 'progress', run(module) {
    const h = host(module, { capacity: 20, concurrency: 3 });
    for (let index = 0; index < 20; index++) submit(h, `j${index}`);
    for (let cycle = 0; cycle < 4; cycle++) {
      const dispatched = [claim(h), claim(h), claim(h)];
      finish(h, dispatched[cycle % 3]);
      restart(h);
      for (const dispatch of dispatched) finish(h, dispatch, 'late');
    }
    drain(h);
    assert.equal(h.store.jobs.filter(job => job.status === 'done').length, 20);
    for (let index = 0; index < 20; index++) submit(h, `j${index}`);
    return h.outcome();
  } },
  { id: 'jobs.independent_stores', group: 'isolation', run(module) {
    const left = host(module, { capacity: 2, concurrency: 1 });
    const right = host(module, { capacity: 1, concurrency: 1 });
    submit(left, 'same', 'left'); submit(right, 'same', 'right');
    const a = claim(left), b = claim(right);
    restart(left); finish(right, b, 'right result'); finish(left, a, 'stale');
    drain(left);
    assert.equal(right.store.jobs[0].result, 'right result');
    assert.equal(left.store.jobs[0].input, 'left');
    const x = left.outcome(), y = right.outcome();
    return { observations: [...x.observations, ...y.observations], decisions: x.decisions };
  } },
  { id: 'jobs.policy_stable_across_stores', group: 'design_choice', run(module) {
    const left = host(module, { capacity: 3, concurrency: 1 });
    const right = host(module, { capacity: 4, concurrency: 2 });
    for (const h of [left, right]) for (const id of ['x', 'y', 'z']) submit(h, id);
    finish(left, claim(left)); finish(right, claim(right));
    restart(left); restart(right);
    drain(left); drain(right);
    const x = left.outcome(), y = right.outcome();
    assert.equal(x.decisions.dispatch_order, y.decisions.dispatch_order, 'one fixed policy across independent stores');
    return { observations: [...x.observations, ...y.observations], decisions: x.decisions };
  } },
];

export default cases;
