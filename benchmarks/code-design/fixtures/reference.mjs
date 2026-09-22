export async function mapLimit(items, limit, worker, options = {}) {
  if (!Array.isArray(items) || !Number.isSafeInteger(limit) || limit < 1 || typeof worker !== 'function') {
    throw new TypeError('Expected an array, positive safe integer, and worker');
  }
  if (options === null || typeof options !== 'object' ||
      (options.signal !== undefined && !(options.signal instanceof AbortSignal))) {
    throw new TypeError('Expected options with an optional AbortSignal');
  }
  const signal = options.signal;
  const values = Array.from(items);
  if (signal?.aborted) throw signal.reason;
  if (values.length === 0) return [];

  return new Promise((resolve, reject) => {
    const results = new Array(values.length);
    let next = 0;
    let active = 0;
    let stopped = false;
    let cause;
    let settled = false;

    function stop(reason) {
      if (!stopped) {
        stopped = true;
        cause = reason;
      }
    }

    function finish() {
      if (settled || active !== 0 || (!stopped && next < values.length)) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (stopped) reject(cause);
      else resolve(results);
    }

    function onAbort() {
      stop(signal.reason);
      finish();
    }

    function pump() {
      while (!stopped && next < values.length && active < limit) {
        const index = next++;
        active++;
        let result;
        try {
          result = worker(values[index], index, signal);
        } catch (reason) {
          active--;
          stop(reason);
          break;
        }
        Promise.resolve(result).then(
          value => { results[index] = value; },
          reason => { stop(reason); },
        ).then(() => {
          active--;
          pump();
        });
      }
      finish();
    }

    signal?.addEventListener('abort', onAbort);
    pump();
  });
}
