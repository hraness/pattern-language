export async function retry(operation, options) {
  if (typeof operation !== 'function' || options === null || typeof options !== 'object' ||
      !Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1 ||
      typeof options.shouldRetry !== 'function' || typeof options.wait !== 'function' ||
      (options.signal !== undefined && !(options.signal instanceof AbortSignal))) {
    throw new TypeError('Expected an operation, bounded attempts, policy, wait, and optional AbortSignal');
  }
  const { maxAttempts, shouldRetry, wait, signal } = options;
  if (signal?.aborted) throw signal.reason;
  let stopped = false;
  let cause;
  const stop = reason => {
    if (!stopped) {
      stopped = true;
      cause = reason;
    }
  };
  const onAbort = () => stop(signal.reason);
  signal?.addEventListener('abort', onAbort);
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let failed = false;
      let failure;
      let value;
      try {
        value = operation(attempt, signal);
      } catch (reason) {
        failed = true;
        failure = reason;
      }
      if (!failed) {
        try { value = await value; }
        catch (reason) { failed = true; failure = reason; }
      }
      if (stopped) throw cause;
      if (!failed) return value;
      if (attempt === maxAttempts) {
        stop(failure);
        throw cause;
      }
      let decision;
      try { decision = shouldRetry(failure, attempt); }
      catch (reason) { stop(reason); }
      if (typeof decision !== 'boolean') {
        Promise.resolve(decision).catch(() => {});
        stop(new TypeError('Retry policy must return a boolean'));
      }
      if (stopped) throw cause;
      if (!decision) {
        stop(failure);
        throw cause;
      }
      let waiting;
      try { waiting = wait(attempt, signal); }
      catch (reason) { stop(reason); }
      if (!stopped) {
        try { await waiting; }
        catch (reason) { stop(reason); }
      } else {
        // A wait can abort synchronously and still return work that must drain.
        try { await waiting; } catch {}
      }
      if (stopped) throw cause;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
