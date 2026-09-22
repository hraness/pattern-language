# Change: optional idempotency keys

Preserve the base API and behavior. Extend `apply(batch, requestId)` with an
optional string request ID. An omitted or `undefined` ID retains the original
behavior. Any other non-string ID must throw an `Error` without changing state.
Every string, including `""` and `"__proto__"`, is a valid request ID.

For each successful keyed call, remember a detached copy of its ordered transfer
tuples (`from`, `to`, `amount`) and its result. A subsequent call with the same ID
and equal ordered tuples must return a fresh copy of that original result,
without reapplying the transfers, even after intervening operations. Ignore
extra fields and property order when comparing transfer records. A previously
successful payload remains replayable even if current balances could no longer
fund it. A changed tuple or changed transfer order with the same ID must throw
an `Error` and leave state unchanged. Malformed payloads still throw.

An unsuccessful call never reserves its request ID. Mutating the original
batch, a snapshot, or an earlier return value must not alter remembered payloads
or results. This map only lasts for the lifetime of this in-memory ledger; it is
not durable or distributed idempotency.
Idempotency records belong to each individual ledger: reusing a request ID on
another ledger must not replay or conflict with the first ledger's records.
