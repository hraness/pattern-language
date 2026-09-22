# Ordered bounded work

Implement a single, self-contained ES module exporting
`async function mapLimit(items, limit, worker)` using only JavaScript and Node
built-ins. Return executable code, without Markdown fences or commentary.

`items` must be an Array, `limit` a positive safe integer, and `worker` a function.
Invalid arguments reject with `TypeError` before invoking any worker, including
for empty input. Empty valid input resolves to `[]`.

Snapshot the array's values when called. Invoke `worker(value, index)` exactly
once for each admitted item, admitting items in increasing index order. Start
up to `min(limit, items.length)` workers without waiting for one to finish. When
a worker succeeds, promptly fill its slot if work remains. Never exceed `limit`
unsettled worker calls. Support ordinary return values, promises, thenables, and
synchronous throws. Resolve with results in input order, regardless of completion
order. The inputs and their values must not be modified by the implementation.

On the first observed worker failure, stop admitting items. A synchronous throw
is observed immediately, so it can stop the initial admissions. Already admitted
workers must all settle before the returned promise rejects. Reject with the
exact first failure value, even if it is `undefined`, `null`, or a non-Error
object. Observe secondary failures so they produce no unhandled rejections.
Observation order is JavaScript's normal synchronous/microtask execution order.

The implementation may allocate O(n) result storage. It must not depend on
wall-clock delays, outside services, or third-party packages. Behavior and
subsequent changeability will be evaluated; no particular internal architecture
or naming convention is required.
