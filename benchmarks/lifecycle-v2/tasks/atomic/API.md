# Atomic transfer task interface

Candidate export: `createLedger(initialAccounts)`.

```js
const ledger = createLedger([{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]);
ledger.snapshot(); // [{ id: 'a', balance: 10 }, { id: 'b', balance: 0 }]
ledger.apply([{ from: 'a', to: 'b', amount: 3 }]);
// [{ id: 'a', balance: 7 }, { id: 'b', balance: 3 }]
```

The change adds `apply(batch, requestId?)`; calls without a key stay compatible.
The reference implements both stages. `cases.mjs` exports `cases`, an array of
`{id, stage, group, run(candidateFn)}` records. Run base cases against both stages
and change cases only after showing `change.md`. A case throws on failure.

All execution is synchronous and in memory. The benchmark assesses observable
validation, copying, commit, and replay behavior, not a preferred architecture.
It cannot establish safety for databases, external effects, crashes, or races.

The empty batch and unkeyed repeated call are deliberately simple contexts:
they need no lifecycle machinery beyond the contract. Reference and mutant
modules are private evaluator fixtures, never generation context. Each mutant
is standalone and changes one plausible behavior; it is not a candidate model
output or evidence that a guidance variant works.
