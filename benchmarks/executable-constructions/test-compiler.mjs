import assert from 'node:assert/strict';
import { compile, enumerateDesigns, parseArtifact, validateArtifact } from './compiler.mjs';

let passed = 0;
async function test(name, check) {
  await check();
  passed += 1;
}

class Crash extends Error {}

function fixture(initial = []) {
  let records = [...initial];
  let clock = 0;
  let fault = null;
  const writes = [];
  const replies = [];
  function checkpoint(operation, when) {
    if (fault?.operation === operation && fault.when === when) {
      fault = null;
      throw new Crash();
    }
  }
  const host = {
    now: () => clock,
    readRecords() {
      checkpoint('readRecords', 'before');
      const result = [...records];
      checkpoint('readRecords', 'after');
      return result;
    },
    appendAtomic(record) {
      checkpoint('appendAtomic', 'before');
      records.push(record);
      writes.push({ operation: 'appendAtomic', record });
      checkpoint('appendAtomic', 'after');
    },
    replaceAtomic(record) {
      checkpoint('replaceAtomic', 'before');
      records = [record];
      writes.push({ operation: 'replaceAtomic', record });
      checkpoint('replaceAtomic', 'after');
    },
    reply(callId, value) {
      checkpoint('reply', 'before');
      replies.push({ callId, value, at: clock });
      checkpoint('reply', 'after');
    },
  };
  return {
    host, writes, replies,
    records: () => [...records],
    time: now => { clock = now; },
    crash: (operation, when) => { fault = { operation, when }; },
  };
}

async function load(artifact) {
  return import(`data:text/javascript;base64,${Buffer.from(compile(artifact)).toString('base64')}`);
}

const designs = enumerateDesigns();

await test('ten fresh closed constructions and deterministic source', () => {
  assert.equal(designs.length, 10);
  assert.equal(new Set(designs.map(JSON.stringify)).size, 10);
  assert.equal(new Set(designs.map(compile)).size, 10);
  for (const artifact of designs) {
    const checked = validateArtifact(artifact);
    assert.equal(checked.valid, true);
    assert.deepEqual(checked.artifact, artifact);
    assert.deepEqual(checked.errors, []);
    assert.notEqual(checked.artifact, artifact);
    assert.equal(compile(artifact), compile(JSON.parse(JSON.stringify(artifact))));
    assert.equal(compile(artifact), compile({ commit: artifact.commit, storage: artifact.storage, schema: artifact.schema }));
    assert.deepEqual(parseArtifact(` \n${JSON.stringify(artifact)}\t`).artifact, artifact);
  }
  const fresh = enumerateDesigns();
  fresh[0].storage.op = 'changed';
  assert.equal(enumerateDesigns()[0].storage.op, 'append-journal');
});

await test('strict JSON, duplicate keys and closed fields', () => {
  const good = designs[0];
  const badValues = [
    null, [], 1, true, 'source', {}, { ...good, extra: true },
    { ...good, schema: 'other' },
    { ...good, storage: { op: 'other' } },
    { ...good, storage: { op: 'append-journal', extra: 1 } },
    { ...good, commit: { op: 'each', maxItems: 2 } },
    { ...good, commit: { op: 'bounded-batch', maxItems: '2', maxTicks: 1 } },
    { ...good, commit: { op: 'bounded-batch', maxItems: 3, maxTicks: 1 } },
    { ...good, commit: { op: 'bounded-batch', maxItems: 2, maxTicks: Infinity } },
    { ...good, commit: { op: 'bounded-batch', maxItems: 2, maxTicks: 2 } },
  ];
  for (const value of badValues) {
    const checked = validateArtifact(value);
    assert.equal(checked.valid, false);
    assert.equal(checked.artifact, null);
    assert.ok(checked.errors.length > 0);
    assert.throws(() => compile(value), TypeError);
  }
  const duplicateRoot = JSON.stringify(good).replace('"schema":', '"schema":"ignored","schema":');
  const duplicateEscaped = JSON.stringify(good).replace('"op":"each"', '"op":"each","\\u006fp":"each"');
  for (const raw of [undefined, '', '```json\n{}\n```', '{} trailing', duplicateRoot, duplicateEscaped, '\ufeff{}', ' '.repeat(16_385), '['.repeat(33) + '0' + ']'.repeat(33)]) {
    const checked = parseArtifact(raw);
    assert.equal(checked.valid, false);
    assert.equal(checked.artifact, null);
    assert.ok(checked.errors.length > 0);
  }
  assert.match(parseArtifact(duplicateEscaped).errors[0], /Duplicate/);
  assert.equal(validateArtifact(new Proxy({}, { getPrototypeOf() { throw new Error('bad'); } })).valid, false);
  const symbol = { ...good, [Symbol('extra')]: true };
  assert.equal(validateArtifact(symbol).valid, false);
});

for (const artifact of designs) {
  const { create } = await load(artifact);
  const name = JSON.stringify(artifact);
  const delay = artifact.commit.op === 'each' ? 0 : artifact.commit.maxTicks;
  const operation = artifact.storage.op === 'append-journal' ? 'appendAtomic' : 'replaceAtomic';

  await test(`commit visibility, replay, ordinary special keys: ${name}`, () => {
    const f = fixture();
    let service = create(f.host);
    assert.deepEqual(Object.keys(service), ['submit', 'read', 'tick']);
    assert.equal(service.read('x'), 0);
    const command = { id: '__proto__', key: '__proto__', delta: 7 };
    assert.equal(service.submit('first', command), undefined);
    command.delta = 999; // queued commands must not alias caller-owned objects
    if (delay) {
      assert.equal(service.read('__proto__'), 0);
      assert.equal(f.replies.length, 0);
      f.time(delay - 1);
      service.tick(delay - 1);
      assert.equal(f.writes.length, 0);
      f.time(delay);
      assert.equal(service.tick(delay), undefined);
    }
    assert.equal(service.read('__proto__'), 7);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].operation, operation);
    assert.deepEqual(f.replies, [{ callId: 'first', value: { id: '__proto__', accepted: true }, at: delay }]);
    service = create(f.host);
    assert.equal(service.read('__proto__'), 7);
    service.submit('retry', { id: '__proto__', key: '__proto__', delta: 7 });
    assert.equal(service.read('__proto__'), 7);
    assert.equal(f.writes.length, 1);
    assert.equal(f.replies.at(-1).callId, 'retry');
  });

  await test(`atomic interruption before and after durable commit: ${name}`, () => {
    for (const when of ['before', 'after']) {
      const f = fixture();
      let service = create(f.host);
      f.crash(operation, when);
      const trigger = () => {
        service.submit('original', { id: 'a', key: 'x', delta: 3 });
        f.time(delay);
        service.tick(delay);
      };
      assert.throws(trigger, Crash);
      assert.equal(f.replies.length, 0);
      service = create(f.host);
      assert.equal(service.read('x'), when === 'after' ? 3 : 0);
      service.submit('retry', { id: 'a', key: 'x', delta: 3 });
      f.time(delay * 2);
      service.tick(delay * 2);
      assert.equal(service.read('x'), 3);
      assert.equal(f.writes.length, 1);
      assert.equal(f.replies.length, 1);
      assert.equal(f.replies[0].callId, 'retry');
    }
  });

  await test(`reply interruption preserves durable state: ${name}`, () => {
    for (const when of ['before', 'after']) {
      const f = fixture();
      let service = create(f.host);
      f.crash('reply', when);
      assert.throws(() => {
        service.submit('original', { id: 'a', key: 'x', delta: 3 });
        f.time(delay);
        service.tick(delay);
      }, Crash);
      assert.equal(f.replies.length, when === 'after' ? 1 : 0);
      service = create(f.host);
      assert.equal(service.read('x'), 3);
      service.submit('retry', { id: 'a', key: 'x', delta: 3 });
      assert.equal(f.writes.length, 1);
      assert.equal(f.replies.at(-1).callId, 'retry');
    }
  });

  if (artifact.commit.op === 'bounded-batch') {
    await test(`duplicates preserve size/deadline and capacity flush: ${name}`, () => {
      const f = fixture();
      const service = create(f.host);
      const command = { id: 'a', key: 'x', delta: 1 };
      service.submit('a1', command);
      f.time(1);
      service.submit('a2', command);
      assert.equal(f.writes.length, 0);
      f.time(delay);
      service.tick(delay);
      assert.equal(f.writes.length, 1);
      assert.deepEqual(f.replies.map(reply => reply.callId), ['a1', 'a2']);
      for (let index = 0; index < artifact.commit.maxItems; index += 1) {
        service.submit(`b${index}`, { id: `b${index}`, key: 'y', delta: 2 });
        assert.equal(f.writes.length, index + 1 < artifact.commit.maxItems ? 1 : 2);
      }
      assert.equal(service.read('x'), 1);
      assert.equal(service.read('y'), artifact.commit.maxItems * 2);
      assert.equal(f.replies.length, artifact.commit.maxItems + 2);
      f.time(delay + 10);
      service.tick(delay + 10);
      assert.equal(f.writes.length, 2);
    });
  }
}

await test('storage operators execute different retention/recovery mechanisms', async () => {
  for (const op of ['append-journal', 'replace-snapshot']) {
    const { create } = await load({ schema: 'pattern-language.construct.v1', storage: { op }, commit: { op: 'each' } });
    const f = fixture();
    let service = create(f.host);
    service.submit('a', { id: 'a', key: 'x', delta: 1 });
    service.submit('b', { id: 'b', key: 'x', delta: -2 });
    assert.equal(f.records().length, op === 'append-journal' ? 2 : 1);
    f.crash('readRecords', 'after');
    assert.throws(() => create(f.host), Crash);
    service = create(f.host);
    assert.equal(service.read('x'), -1);
    assert.equal(f.writes.length, 2);
  }
});

console.log(`construction compiler: ${passed} focused checks passed`);
