# Retry transfer benchmark

Named export: `retry`. The evaluator passes this function to each case's `run`.
`base.md` is the initial public implementation request. `change.md` is disclosed
only after the initial artifact is frozen; change scoring also reruns base cases.
The `cases.mjs` array contains 20 independent behavioral cases. The `stage`
field is `base` or `change`; `group` identifies contract, behavior, perturbation,
countercontext, or lifecycle coverage. No case inspects implementation structure.

The domain is a bounded retry adapter with injected scheduling. Failures may be
transient, unlike the mapper's uniformly terminal worker failures. Retry policy
and a backoff hook form separate boundaries where cancellation can halt future
effects. The countercontexts are immediate success and a single admitted attempt.

Tests use deferred promises and event-loop turns, never elapsed time as a success
condition. The shared evaluator supplies a timeout and unhandled-rejection
observation. `reference.mjs` implements both stages. `mutants/` contains narrowly
incorrect alternatives used to demonstrate that specific regressions are detected.

The tests and reference establish benchmark consistency, not evidence that any
guidance improves generated code. Hook conformance, native AbortSignal behavior,
and the lack of external side effects bound the simulated I/O environment.
