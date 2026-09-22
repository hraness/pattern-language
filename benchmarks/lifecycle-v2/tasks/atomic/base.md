# In-memory atomic transfer batch

Implement a standalone ES module exporting `createLedger(initialAccounts)`.

`initialAccounts` is an array of `{id, balance}` records. IDs are unique strings
(including empty strings and names such as `__proto__`). Balances are nonnegative
safe integers. Reject invalid input by throwing an `Error`. Copy the initial
records; later caller mutations must not affect the ledger.
Each created ledger owns independent state; operations on one ledger must not
change another ledger.

Return an object with these synchronous methods:

- `snapshot()` returns an array of `{id, balance}` records in initial account
  order, detached from internal state.
- `apply(batch)` accepts an array of `{from, to, amount}` transfers and returns
  the resulting snapshot. Source and destination must name existing accounts;
  amount must be a positive safe integer. Transfers execute in array order, so
  a later transfer may spend money received earlier in the batch. No intermediate
  balance may be negative or exceed `Number.MAX_SAFE_INTEGER`. A self-transfer
  requires sufficient funds and leaves its balance unchanged. An empty batch is
  valid. Ignore extra record fields.

If any transfer is invalid or cannot be funded, throw an `Error` and preserve
the complete state from before this `apply` call. Successful batches conserve
funds exactly. Never modify supplied arrays or records, and do not retain
aliases to caller inputs or returned records.

This is a synchronous, in-memory operation on ordinary arrays and data records.
No persistence, I/O, concurrent calls, hostile getters/proxies, or real-world
transaction guarantee is required. Do not add an asynchronous scheduler or locks.

Return only JavaScript, with no imports or third-party dependencies.
