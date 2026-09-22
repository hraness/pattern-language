# Change: cancellation across attempt and backoff

Revise the supplied implementation, retaining every base requirement. Return
a complete self-contained ES module without Markdown fences or commentary.

Support `options.signal`, which may be omitted or `undefined`, or must otherwise
be a native `AbortSignal`. Validate all arguments before handling cancellation.
Pass the same signal as the second argument of `operation(attempt, signal)` and
`wait(attempt, signal)`; keep the policy signature unchanged.

An already aborted signal rejects with its exact `reason` without calling any
hook. A later abort immediately prevents new hook invocations. If an operation
or wait has already begun, wait for it to settle before rejecting with the abort
reason. Observe a later rejection from that hook, but do not invoke the retry
policy for it or admit another attempt. Cancellation does not force-settle or
abandon an active hook; a hook that never settles can keep the result pending.

The first observed *terminal cause* wins. An abort is terminal immediately.
An operation failure becomes terminal when its attempt limit is exhausted or
its policy returns false; a retryable operation failure alone is not terminal.
A policy throw, invalid policy return, or wait failure is terminal when
observed. A synchronous throw is observed synchronously. For example, an abort
inside a policy call precedes that policy's later return or throw, so the abort
wins and no wait may start. Preserve exact terminal values, including falsy
values, against subsequent aborts or hook failures.

Remove every abort listener owned by this invocation when its returned promise
settles, on success, failure, or cancellation. Do not remove listeners belonging
to other calls. Successful completion is final, so later aborts have no effect.
