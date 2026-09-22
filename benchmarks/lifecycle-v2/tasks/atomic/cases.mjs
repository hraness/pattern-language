import assert from 'node:assert/strict';

const initial = () => [{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }, { id: 'c', balance: 0 }];
const move = (from = 'a', to = 'b', amount = 3) => ({ from, to, amount });
const state = (a, b, c = 0) => [{ id: 'a', balance: a }, { id: 'b', balance: b }, { id: 'c', balance: c }];
const throws = operation => assert.throws(operation, Error);
const same = (ledger, expected) => assert.deepEqual(ledger.snapshot(), expected);

export const cases = [
  {
    id: 'atomic-simple-empty', stage: 'base', group: 'countercontext',
    run(createLedger) {
      const ledger = createLedger([]);
      assert.deepEqual(ledger.snapshot(), []);
      assert.deepEqual(ledger.apply([]), []);
    },
  },
  {
    id: 'atomic-ordered-conservation', stage: 'base', group: 'behavior',
    run(createLedger) {
      const ledger = createLedger(initial());
      assert.deepEqual(ledger.apply([move('a', 'b', 8), move('b', 'c', 5)]), state(2, 3, 5));
      same(ledger, state(2, 3, 5));
    },
  },
  {
    id: 'atomic-rollback-funding', stage: 'base', group: 'failure',
    run(createLedger) {
      const ledger = createLedger(initial());
      throws(() => ledger.apply([move(), move('b', 'c', 4)]));
      same(ledger, initial());
      assert.deepEqual(ledger.apply([move()]), state(7, 3));
    },
  },
  {
    id: 'atomic-rollback-late-malformed', stage: 'base', group: 'failure',
    run(createLedger) {
      const ledger = createLedger(initial());
      for (const bad of [null, move('b', 'missing', 1), move('a', 'b', 0),
        move('a', 'b', -1), move('a', 'b', 0.5), move('a', 'b', Infinity),
        move('a', 'b', '1'), move('a', 'b', Number.MAX_SAFE_INTEGER + 1)]) {
        throws(() => ledger.apply([move(), bad]));
        same(ledger, initial());
      }
      throws(() => ledger.apply(null));
      same(ledger, initial());
    },
  },
  {
    id: 'atomic-initial-validation', stage: 'base', group: 'validation',
    run(createLedger) {
      for (const bad of [null, {}, [null], [{ id: 1, balance: 0 }],
        [{ id: 'a', balance: -1 }], [{ id: 'a', balance: NaN }],
        [{ id: 'a', balance: 1.5 }], [{ id: 'a', balance: '1' }],
        [{ id: 'a', balance: Number.MAX_SAFE_INTEGER + 1 }],
        [{ id: 'a', balance: 1 }, { id: 'a', balance: 2 }]]) throws(() => createLedger(bad));
    },
  },
  {
    id: 'atomic-self-transfer', stage: 'base', group: 'boundary',
    run(createLedger) {
      const accounts = [{ id: 'a', balance: Number.MAX_SAFE_INTEGER }];
      const ledger = createLedger(accounts);
      assert.deepEqual(ledger.apply([move('a', 'a', Number.MAX_SAFE_INTEGER)]), accounts);
      const small = createLedger(initial());
      throws(() => small.apply([move('a', 'a', 11)]));
      same(small, initial());
    },
  },
  {
    id: 'atomic-overflow-rollback', stage: 'base', group: 'boundary',
    run(createLedger) {
      const accounts = [{ id: 'a', balance: 2 }, { id: 'b', balance: Number.MAX_SAFE_INTEGER }, { id: 'c', balance: 0 }];
      const ledger = createLedger(accounts);
      throws(() => ledger.apply([move('a', 'c', 1), move('a', 'b', 1)]));
      same(ledger, accounts);
    },
  },
  {
    id: 'atomic-arbitrary-account-ids', stage: 'base', group: 'boundary',
    run(createLedger) {
      const ledger = createLedger([{ id: '__proto__', balance: 8 }, { id: 'constructor', balance: 0 }, { id: '', balance: 0 }]);
      assert.deepEqual(ledger.apply([move('__proto__', 'constructor', 5), move('constructor', '', 2)]),
        [{ id: '__proto__', balance: 3 }, { id: 'constructor', balance: 3 }, { id: '', balance: 2 }]);
      throws(() => ledger.apply([move('toString', '', 1)]));
    },
  },
  {
    id: 'atomic-copy-boundaries', stage: 'base', group: 'isolation',
    run(createLedger) {
      const source = initial();
      const ledger = createLedger(source);
      source[0].balance = 900;
      source.push({ id: 'surprise', balance: 1 });
      const first = ledger.snapshot();
      first[0].id = 'changed';
      first[1].balance = 900;
      first.length = 1;
      same(ledger, initial());
      const batch = [move()];
      const result = ledger.apply(batch);
      batch[0].amount = 99;
      result[0].balance = 900;
      result.reverse();
      same(ledger, state(7, 3));
    },
  },
  {
    id: 'atomic-input-preservation', stage: 'base', group: 'isolation',
    run(createLedger) {
      const source = Object.freeze(initial().map(Object.freeze));
      const ledger = createLedger(source);
      const batch = Object.freeze([Object.freeze(move())]);
      assert.deepEqual(ledger.apply(batch), state(7, 3));
      assert.deepEqual(source, initial());
      assert.deepEqual(batch, [move()]);
      const failed = Object.freeze([Object.freeze(move()), Object.freeze(move('b', 'c', 20))]);
      throws(() => ledger.apply(failed));
      same(ledger, state(7, 3));
      assert.deepEqual(failed, [move(), move('b', 'c', 20)]);
    },
  },
  {
    id: 'atomic-unkeyed-repeat', stage: 'base', group: 'countercontext',
    run(createLedger) {
      const ledger = createLedger(initial());
      ledger.apply([move()]);
      assert.deepEqual(ledger.apply([move()]), state(4, 6));
    },
  },
  {
    id: 'atomic-independent-ledgers', stage: 'base', group: 'isolation',
    run(createLedger) {
      const left = createLedger(initial());
      const right = createLedger([{ id: 'a', balance: 20 }, { id: 'b', balance: 1 }, { id: 'c', balance: 2 }]);
      assert.deepEqual(left.apply([move()]), state(7, 3));
      same(right, state(20, 1, 2));
      assert.deepEqual(right.apply([move('a', 'c', 4)]), state(16, 1, 6));
      same(left, state(7, 3));
      throws(() => right.apply([move('a', 'b', 17)]));
      same(left, state(7, 3));
      same(right, state(16, 1, 6));
    },
  },
  {
    id: 'atomic-id-replay', stage: 'change', group: 'replay',
    run(createLedger) {
      const ledger = createLedger(initial());
      ledger.apply([move('a', 'b', 10)], 'once');
      assert.deepEqual(ledger.apply([move('a', 'b', 10)], 'once'), state(0, 10));
      same(ledger, state(0, 10));
      const independent = createLedger(initial());
      assert.deepEqual(independent.apply([move('a', 'c', 2)], 'once'), state(8, 0, 2));
      assert.deepEqual(independent.apply([move('a', 'c', 2)], 'once'), state(8, 0, 2));
      same(ledger, state(0, 10));
    },
  },
  {
    id: 'atomic-replay-original-result', stage: 'change', group: 'replay',
    run(createLedger) {
      const ledger = createLedger(initial());
      ledger.apply([move()], 'first');
      ledger.apply([move('b', 'c', 2)], 'next');
      assert.deepEqual(ledger.apply([move()], 'first'), state(7, 3));
      same(ledger, state(7, 1, 2));
    },
  },
  {
    id: 'atomic-id-conflict', stage: 'change', group: 'failure',
    run(createLedger) {
      const ledger = createLedger(initial());
      const batch = [move('a', 'b', 2), move('a', 'c', 1)];
      ledger.apply(batch, 'key');
      for (const conflict of [[move('a', 'b', 3), batch[1]],
        [move('b', 'a', 2), batch[1]], [move('a', 'c', 2), batch[1]],
        [batch[1], batch[0]], [batch[0]], [null]]) {
        throws(() => ledger.apply(conflict, 'key'));
        same(ledger, state(7, 2, 1));
      }
    },
  },
  {
    id: 'atomic-failure-does-not-reserve', stage: 'change', group: 'recovery',
    run(createLedger) {
      const ledger = createLedger(initial());
      throws(() => ledger.apply([null], 'retry'));
      throws(() => ledger.apply([move('a', 'b', 11)], 'retry'));
      assert.deepEqual(ledger.apply([move()], 'retry'), state(7, 3));
      same(ledger, state(7, 3));
    },
  },
  {
    id: 'atomic-id-copy-boundaries', stage: 'change', group: 'isolation',
    run(createLedger) {
      const ledger = createLedger(initial());
      const batch = [move()];
      const first = ledger.apply(batch, 'key');
      batch[0].amount = 4;
      first[0].balance = 999;
      const second = ledger.apply([move()], 'key');
      assert.deepEqual(second, state(7, 3));
      second[1].balance = 888;
      assert.deepEqual(ledger.apply([move()], 'key'), state(7, 3));
      throws(() => ledger.apply(batch, 'key'));
      same(ledger, state(7, 3));
    },
  },
  {
    id: 'atomic-payload-semantic-equality', stage: 'change', group: 'replay',
    run(createLedger) {
      const ledger = createLedger(initial());
      ledger.apply([{ ...move(), note: 'original' }], 'key');
      assert.deepEqual(ledger.apply([{ amount: 3, to: 'b', from: 'a', note: 'changed' }], 'key'), state(7, 3));
      same(ledger, state(7, 3));
    },
  },
  {
    id: 'atomic-id-validation-and-names', stage: 'change', group: 'boundary',
    run(createLedger) {
      const ledger = createLedger(initial());
      for (const id of [null, 0, false, {}, Symbol('key')]) {
        throws(() => ledger.apply([move()], id));
        same(ledger, initial());
      }
      for (const id of ['', '__proto__', 'constructor']) {
        const original = ledger.apply([move('a', 'b', 1)], id);
        assert.deepEqual(ledger.apply([move('a', 'b', 1)], id), original);
      }
      same(ledger, state(7, 3));
    },
  },
  {
    id: 'atomic-keyed-empty-result', stage: 'change', group: 'countercontext',
    run(createLedger) {
      const ledger = createLedger(initial());
      assert.deepEqual(ledger.apply([], 'empty'), initial());
      ledger.apply([move()], undefined);
      assert.deepEqual(ledger.apply([], 'empty'), initial());
      same(ledger, state(7, 3));
    },
  },
];
