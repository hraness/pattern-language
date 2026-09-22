# Durable jobs in a deterministic host

Implement an ES module exporting synchronous `createStore({ capacity, concurrency })`
and `step(store, command)`. Produce a design artifact separately using the supplied
schema and vocabulary. A host invokes one command at a time. No network, filesystem,
timers, randomness, workers, imports, global state, or module-level mutable state is
needed or permitted. The host controls crashes, command order, and worker results.

The objective is to preserve accepted jobs, fence obsolete workers, bound admission,
and publish durable completion receipts despite duplicate requests and restarts.
Workers only calculate string results in this simulation. This contract makes **no
claim of exactly-once execution or atomicity with arbitrary external side effects**.

## Durable boundary and public state

`createStore` returns this JSON-serializable shape:

```js
{
  capacity, concurrency, nextToken: 1,
  jobs: []
}
```

Capacity and concurrency are integers with `1 <= concurrency <= capacity <= 20`.
Every accepted id has exactly one durable record, in original acceptance order:

```js
{ id, input, status: 'queued', token: null, result: null }
```

`id` is a nonempty string, `input` and completion `result` are strings. Queued jobs
have null token and result; active jobs have a positive safe-integer token and null
result; done jobs retain the winning token and string result. Records are never
deleted. Completed records do not consume admission capacity. `nextToken` is a
positive safe integer, initially 1, incremented by exactly one for each dispatch;
the host never drives it beyond safe-integer range. Extra JSON-serializable fields
on the store or records are allowed. Required fields cannot be replaced or omitted.

`step` returns `{ store, reply }`. It must not mutate its input store or command,
including nested records. References may be shared if never mutated. The host
atomically commits the complete returned store **before** exposing its reply. A
crash before commit discards both. A crash after commit may lose delivery of a
reply, but retains the store. There are no partial record writes at this boundary.
On restart the host supplies only JSON-round-tripped durable state; the module
must need no remembered process state. Each call must finish synchronously and
return ordinary JSON data. Inputs are valid commands and reachable valid stores;
malformed-input validation and historical record compaction are out of scope.

## Commands and exact replies

**`{ type: 'submit', id, input }`**

- A new id is accepted if fewer than `capacity` records are queued or active.
  Append its queued record and return `{ type: 'accepted', id }`.
- If admission is full, change nothing and return `{ type: 'full', id }`.
- An existing id with a different input returns `{ type: 'conflict', id }`, with
  no change, even if capacity is full or the job is done.
- An existing id with the same input returns
  `{ type: 'duplicate', id, status }`, with no change. For a done job also include
  `receipt: { token, result }` containing its original completion receipt.
- Duplicate/conflict detection precedes admission. Replaying a completed id must
  never execute that job again or replace its input or receipt.

**`{ type: 'claim' }`**

- If there are `concurrency` active jobs, or no queued jobs, return
  `{ type: 'idle' }` without change.
- Otherwise choose a queued job, mark it active with `token = nextToken`, increment
  `nextToken`, and return `{ type: 'dispatch', id, input, token }`.
- Choose either FIFO (earliest accepted queued record) or LIFO (latest accepted
  queued record) as your fixed policy for every store and invocation. Declare this
  as `decisions.dispatch_order` (`'fifo'` or `'lifo'`). Do not change the ordering
  of the public jobs array. There is no requirement to prevent starvation under
  an infinite arrival stream; progress is required under the finite continuation
  described below.

**`{ type: 'complete', id, token, result }`**

- An active job with exactly this token becomes done. In the same returned store,
  retain token and result, and return `{ type: 'receipt', id, token, result }`.
- Repeating a completion for an already done job with its winning token returns
  the original receipt, even if the repeated command supplies a different result.
  It must not change any state.
- An unknown id, queued job, or mismatched token returns `{ type: 'ignored', id }`
  without change. Stale results must not win after recovery and redispatch.

**`{ type: 'restart' }`**

- Requeue every active job by resetting status to queued and token to null.
  Preserve all ids, inputs, completed receipts, acceptance order, and `nextToken`.
  Return `{ type: 'restarted' }`. Repeating restart is harmless.
- Recovery does not dispatch work. A later claim issues a fresh, never previously
  committed token. Previously dispatched work may still send obsolete completion
  commands; fencing makes these harmless.

## Observable design and progress

The supplied vocabulary models **one job** at a time. The evaluator obtains
transitions from the public durable records and effects from actual state changes
and returned dispatches/receipts; candidate-generated trace logs are not used.

- States: `absent`, `queued`, `active`, `done`.
- Events: `submit`, `claim`, `complete`, `restart`.
- Effects: `durable_write` for a changed durable store, `dispatch` for a published
  dispatch reply, `receipt_publish` for a published receipt or a duplicate-submit
  reply containing a receipt. Extra diagnostics are not effects.
- A no-op command may produce a self-transition. A claim with no chosen job is
  observed as `claim: absent -> absent`. An empty restart is likewise
  `restart: absent -> absent`. A nonempty restart is observed once per existing
  record (including unchanged queued/done records). All other commands are
  observed on the addressed or dispatched id; absence is an observable state.
- The only design choice with alternative allowed observable values is
  `dispatch_order`. The remaining contract requirements are invariants, not free
  choices. You may choose internal helpers and extra durable metadata freely.
- Declare the boundary invariants as `storage_owner: 'durable_store'`,
  `publication_boundary: 'after_commit'`, and `recovery: 'requeue_and_fence'`.
  These constants document responsibility; they do not count as evidence that
  the implementation actually respects the boundaries.
- Your design must describe every transition required by the command rules,
  including no-ops, and must not allow other transitions. For example, completion
  cannot take a queued job directly to done, and recovery cannot erase a job.
  The host checks this contract adequacy separately from behavioral correctness
  and the narrower question of whether executed traces fit your declarations.

Given finitely many accepted jobs, no further crashes or submissions, repeated
claims, and eventual completion of every current dispatch, all accepted jobs must
become done. Both policies satisfy this finite fairness condition. The evaluator
also checks independent stores, duplicate request delivery, loss of replies,
pre-commit loss, repeated recovery, stale completions, admission/concurrency limits,
and preservation of already committed receipts. Finite checks are evidence for
these bounded scenarios, not a proof for every possible command history.
