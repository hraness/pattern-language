# Retrying an I/O operation

Implement a self-contained ES module exporting `async function retry(operation,
options)` using only JavaScript and Node built-ins. Return executable code,
without Markdown fences or commentary.

`operation` is a function. `options` is a non-null object containing a positive
safe integer `maxAttempts`, a function `shouldRetry`, and a function `wait`.
Invalid arguments reject with `TypeError` before any hook is called. Do not
modify the supplied options. Each invocation has independent state.

Call `operation(attempt)` with attempt numbers starting at 1. It may return a
plain value, promise, or thenable, or throw synchronously. Return its first
successful value, including `undefined` or `null`. A rejection or throw may have
any value, including `undefined`, `null`, `false`, or an object.

After an operation failure:

1. If this was attempt `maxAttempts`, reject with that exact failure value;
   neither policy nor wait runs.
2. Otherwise call `shouldRetry(failure, attempt)` exactly once. This synchronous
   policy must return a boolean. `false` rejects with the operation's exact
   failure. A thrown value terminates the call with that value. A non-boolean
   return terminates with `TypeError`; observe a returned thenable's rejection
   so invalid async policies cannot cause an unhandled rejection.
3. If policy returned `true`, call `wait(attempt)` exactly once. This injected
   scheduling hook may return an ordinary value, promise, or thenable, or throw.
   Await its completion before admitting the next attempt. If it fails, reject
   with its exact failure value and do not retry that failure.

Never overlap operation calls, start an operation before the previous wait
settles, or call a hook after terminal failure. In particular, successful calls
and calls with `maxAttempts: 1` need no policy or scheduling work. Observe all
rejections arising from hooks. A hook's synchronous throw is observed before
the caller's next statement; promise/thenable settlement uses normal JavaScript
microtask observation.

The adapter owns no timers: use only the supplied `wait` to schedule retries.
Do not depend on outside services, wall-clock delays, or third-party packages.
Behavior and subsequent changeability will be evaluated; no internal naming or
architecture is prescribed.
