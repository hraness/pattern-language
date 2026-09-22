# Construction operators and dependencies

All procedures receive these same facts. Neither storage operator is generally
best; objectives and workloads determine the useful tradeoff. The complete
space can be enumerated, compiled and run independently of a model's selection.

## Append journal

Each committed batch is serialized using `JSON.stringify` as one record:

```json
{"v":1,"commands":[{"id":"a","key":"x","delta":1}]}
```

Recovery reads every retained record in order, parses the command arrays and
reconstructs totals and the set of committed IDs. The durable ID set makes
retries idempotent. A commit appends its frame atomically before changing the
live committed state or replying. The journal retains historical command
payloads. It often writes fewer bytes than repeated full snapshots, while
recovery and retained history grow with committed frames and commands.

## Replace snapshot

Each committed batch is applied to copies of the committed totals and ID set.
The resulting complete state is serialized as one record:

```json
{"v":1,"totals":[["x",1]],"ids":["a"]}
```

Totals and IDs use their insertion order. Recovery reads the retained record
and reconstructs those structures. A commit atomically replaces retained
storage before publishing the new live state or replying. A snapshot retains
the accumulated totals and IDs but discards historical command payloads. Each
write serializes the entire current state, so later writes grow. Recovery
visits at most one record. The study does not compact or prune committed IDs.

## Each command

An unseen submission forms a one-command batch and invokes the chosen storage
operator immediately. Its reply follows persistence. A committed duplicate
replies without writing. This construction has zero acknowledgement delay in
logical ticks but does not combine writes. It needs no pending queue or timer.

## Bounded batch

Maintain a pending buffer and one oldest-arrival tick. Link it to either durable
storage operator: a batch cannot acknowledge itself without that persistence
step. New command IDs consume one slot; repeated pending IDs add reply waiters
without consuming slots or extending the deadline. Flush the entire buffer at
`maxItems` or at the oldest command's `maxTicks` deadline, then reply to its
waiters. Fair calls to `tick` are a dependency of deadline progress.

Larger batches can reduce writes, and therefore repeated snapshot bytes or
journal frame overhead. Sparse arrivals can make replies wait for a deadline.
Increasing a size bound may have no effect if a deadline always fires first;
increasing a deadline may have no effect if arrivals always fill the buffer.
Pending memory disappears on crash, requiring client retries; durable IDs
prevent a commit whose reply was lost from being applied twice.

## Scope of construction

These are executable linked operators in a deliberately small family, not a
catalog of prose labels. The compiler emits distinct persistence and commit
implementations. It supplies correctness machinery shared by all procedures;
the model selects a construction rather than writing arbitrary code. A good
selection result therefore concerns resource-aware construction within this
space, not unrestricted code synthesis or general architectural quality.
