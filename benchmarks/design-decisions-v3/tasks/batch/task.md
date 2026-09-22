# Pure dependency batch planning

Implement `export function planBatch(input, capabilities)` in a self-contained ES
module. This is a synchronous calculation over caller-owned data. It neither
executes jobs nor changes which jobs have completed.

`input` is a non-null, non-array object with:

- `capacity`: an integer from 0 through 1,000,000.
- `completed`: an array of distinct, nonempty strings identifying already
  completed jobs.
- `jobs`: an array of at most 32 non-null, non-array objects, each with `id`
  (a nonempty string), `units` (an integer from 1 through 1,000,000), and `after`
  (an array of distinct, nonempty predecessor ID strings).

Job IDs are distinct and none occurs in `completed`. Every predecessor ID must
name a job in `jobs` or an ID in `completed`; a job cannot name itself as a
predecessor. Cycles between different pending jobs are valid and remain blocked.
Additional properties on input and jobs are ignored. Strings are compared
exactly, without trimming or coercion. Missing fields, malformed types,
duplicates, out-of-range integers, and invalid predecessor references cause a
synchronous `TypeError`. Validate the whole input, even jobs that would not fit
or be selected. No particular error message is required. Inputs contain ordinary
data properties; accessors, Proxies, and concurrently modified inputs are outside
the contract.

Choose one traversal policy for the implementation: `fifo` visits jobs in input
order and `lifo` visits jobs in reverse input order. The choice must remain the
same across calls. During that single traversal, select a job if **all of its
predecessors occur in the original `completed` array** and its units fit the
remaining capacity. A selected job does not satisfy a predecessor in this same
batch. Skip a job that is blocked or too large and continue the traversal. This
is an ordered greedy batch, not a search for a globally optimal packing.

Return an ordinary object with exactly these fields:

```js
{
  selected: [{ id, units, after: [...] }],
  remaining: [{ id, units, after: [...] }],
  used: 0,
  decisions: {
    scanOrder: "fifo", // or "lifo", matching actual behavior
    execution: "synchronous",
    persistence: "none",
    scheduling: "none"
  }
}
```

`selected` follows the chosen traversal order. `remaining` contains every
unselected job in its original input order, including blocked or oversized jobs.
`used` is the sum of selected units. Output job objects contain exactly `id`,
`units`, and `after`; additional input properties are not copied. The returned
arrays, job objects, `after` arrays, and decisions object are fresh on every call
and do not alias input data or results from another call. Do not mutate input,
including on error. Empty inputs and zero capacity are valid.

`capabilities` is always provided as an object with callable `storage.read`,
`storage.write`, and `schedule` members. They represent optional machinery
available in the environment. Do not invoke any of them, even when rejecting
input. Do not return a Promise/thenable or perform any background work. Use no
imports, dynamic imports, network, filesystem, process APIs, timers, ambient
storage, or global mutation. All state needed for a call comes from that call's
input; no durable state or job execution is part of this API.

The public observation vocabulary is in `model.json`. `return` and `throw` are
host observations, and capability invocations are observed effects. Both FIFO
and LIFO are accepted alternatives; the declared design and returned decisions
must match the observed choice. The evaluator checks purity at the supplied
capability boundary and checks synchronous results. Static source review covers
the excluded ambient APIs; this is not a general JavaScript security sandbox.
