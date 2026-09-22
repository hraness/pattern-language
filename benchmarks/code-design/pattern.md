# Bounded work court (experimental pattern)

This is an Alexander-inspired, project-authored design hypothesis, not a pattern
quoted from Alexander or a claim that architecture transfers unchanged to code.

**Context.** A caller needs to process a finite ordered collection while workers
have variable duration and share a scarce resource. Work can fail; cancellation
may later become necessary. The caller needs one trustworthy completion signal.

**Opposing forces.** Concurrency reduces idle capacity, but unrestricted
admission exhausts resources. Results belong to stable input positions, but
completion arrives in a different order. Failure should halt new obligations,
but already admitted obligations still need an owner. Fast notification competes
with the caller's need to know cleanup has finished. A simple first version
should remain simple while making room for another cause of termination.

**Relationship and resolution.** Put admission under one shared boundary. Let
each admitted worker own one bounded slot and one stable result address until it
settles. When a slot returns, the boundary either admits the next waiting item or
remains closed. Record the first terminal cause separately from the count of
outstanding obligations. Closing admission changes which work may start; draining
changes when completion may be announced. Resolve only when the waiting work is
exhausted and the court is empty, or reject when a closed court becomes empty.
Cancellation, if added, closes this same boundary and passes a shared cooperative
signal to occupants. Release the boundary's external listener after drainage.

**Consequences.** Ordering and concurrency need not fight each other. Failure and
cancellation can share completion accounting. The owner retains O(n) output
storage and potentially waits forever for a worker that never settles. This
pattern adds coordination state; the implementation still needs careful checks
around synchronous throws, promise assimilation, and reentrant cancellation.

**Countercontext.** Prefer simpler sequential mapping when only one operation may
run. An unbounded producer, backpressure between stages, distributed retries,
transactional rollback, or a hard deadline needs another design. This pattern
does not make arbitrary side effects reversible or forcibly stop JavaScript.

**Compositional sequence.** Establish stable item identity and snapshot inputs;
introduce the bounded admission boundary; attach one obligation to each admitted
item; conserve slots as results arrive; close admission on the first terminal
cause; drain obligations; finally release external subscriptions. A surrounding
resource owner supplies capacity. An individual worker supplies operation-specific
cleanup. Neither responsibility disappears into the mapper.

The pattern's mechanism is this arrangement of responsibilities and relationships,
not these names. A behaviorally equivalent design using loops or recursive pumps
is equally eligible. The pilot tests whether giving this organization to a code
generator helps; handwritten reference success cannot establish that it does.
