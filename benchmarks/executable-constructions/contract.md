# Durable counter construction contract

This is a bounded, synchronous simulator contract, not a claim about production
durability or physical storage performance. Models return inert construction
artifacts; a fixed trusted compiler supplies executable JavaScript.

## Service API

The generated ES module exports `create(host)`. Calling it recovers retained
storage and returns exactly these synchronous operations:

```js
service.submit(callId, { id, key, delta }); // returns undefined
service.read(key);                        // returns committed integer total
service.tick(now);                        // returns undefined
```

The host has a nonnegative integer logical clock. `tick(now)` receives the same
value returned by `host.now()`. Time never decreases. Calls are sequential and
not reentrant; storage and reply operations take no logical time. The harness
advances the clock and calls `tick` at each integer while draining work. A
previously unseen key has total zero.

Call IDs, command IDs and keys are nonempty strings. Every submission has a
fresh call ID. Command IDs permanently bind one payload: every retry repeats
the same key and delta. Deltas and all accumulated totals are safe integers.
Conflicting retries, malformed inputs and numeric overflow are outside this
study's input domain. Strings such as `__proto__` are ordinary IDs and keys.

Each distinct command adds its delta to its key exactly once. A reply is emitted
only through `host.reply(callId, { id, accepted: true })`, after that command is
durable. Every live submission, including a duplicate, receives its own reply.
Pending duplicate submissions share one pending command. A committed duplicate
requires no further storage write. `read` exposes only committed effects.
Committing an unacknowledged command is allowed; losing an acknowledged command
or an effect already observed by `read` is prohibited.

Commands commute. There is no global first-seen ordering requirement: an
unacknowledged command can disappear from memory on a crash and be retried after
a later command. Within one live instance, new pending commands are batched in
admission order. Replies can be lost when a crash destroys the instance, and
outstanding calls to that instance are abandoned. Clients use fresh call IDs
when retrying after recovery. Already delivered replies remain observable.

## Host API and atomicity

The host owns a retained ordered array of UTF-8 record strings, initially empty:

```js
host.now();                   // current logical integer tick
host.readRecords();           // copied array of all retained record strings
host.appendAtomic(record);    // append one record string
host.replaceAtomic(record);   // replace the array with exactly this one record
host.reply(callId, value);     // deliver one externally observable reply
```

Only these host operations connect a generated service to its environment. No
filesystem, network, clock, timer, process, randomness, imports or background
work is available or needed. Host calls are synchronous. A crash may interrupt
a public operation, including recovery; it destroys all service memory. The
driver discards that instance and calls `create` again against retained storage.
An atomic write interrupted before its effect leaves the old records; one
interrupted after its effect leaves the complete new records. Torn writes,
storage corruption, external effects and migration between constructions are
outside scope. Host failures other than injected crashes are outside scope.

Fault enumeration may interrupt before or after writes/replies and at public
call boundaries. Recovery can also be interrupted. The evaluator must report
its exact finite fault bound and included boundaries. Recovery reads both keys
before retries in fault cases so retries cannot conceal acknowledged data loss.

## Commit choices and progress

`each` commits a previously unseen command during its submission. A
`bounded-batch` buffers distinct commands, committing the entire buffer either
when it reaches `maxItems` or when `tick(now)` observes that the oldest pending
command has waited at least `maxTicks`. Duplicate pending commands do not count
toward size and do not reset the deadline. A committed duplicate replies during
its submission. Deadlines start at the first pending command's submission tick.

After the final crash, clients retry every command they require, then provide
fair integer ticks. With no further crashes, every such live call must receive
a reply within the construction's `maxTicks` (zero for `each`) after the oldest
pending command arrives. Five consecutive fair drain ticks suffice for every
admissible construction. Infinite crashes and absent retries/ticks imply no
progress guarantee.

## Observable costs

Count actual host write calls, UTF-8 bytes passed to those calls, retained record
bytes, recovery records/bytes visited, and response latency in logical ticks.
Recovery metrics include an empty read as zero records/bytes. An empty store
and its initial recovery are valid. Counts come from executed operations and
actual retained strings, not from artifact names or candidate-authored labels.
The host may separately report the number of `readRecords` calls. These are
simulator units, not physical disk calls, elapsed latency, or measured RAM.
