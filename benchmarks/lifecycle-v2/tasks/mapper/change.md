# Change: cooperative cancellation

Revise the supplied implementation, retaining every base requirement. Return a
complete self-contained ES module, without Markdown fences or commentary.

Extend the signature to `mapLimit(items, limit, worker, options = {})`, where
`options` must be a non-null object and `options.signal`, when present, must be
a native `AbortSignal`. Reject invalid options with `TypeError` before calling a
worker. Validate all arguments before acting on cancellation. Omitted or
`undefined` signal means cancellation is unavailable.

Pass that same signal as the worker's third argument. On an already aborted
signal, admit nothing and reject with `signal.reason`, including for empty
input. On a later abort, stop admitting work immediately. Existing workers may
cooperate through the signal; wait for every admitted worker to settle before
rejecting. Do not force-settle or abandon a worker. Preserve the exact first
terminal cause: the first observed abort or worker failure wins, even if its
reason is falsy. A later abort must not replace an earlier worker failure, nor
may a later worker failure replace an earlier abort. Aborting during a worker's
synchronous invocation must prevent the next admission.

Successful completion is final; an abort after settlement cannot change it.
Release any abort listener installed by this call when the returned promise
settles, including on success and on failure. Calls are independent even when
they share a signal. No particular scheduling or state representation is
required. Cooperative workers that never settle can keep the call pending;
cancellation does not promise a time bound.
