export async function mapLimit(items, limit, worker) {
  if (!Array.isArray(items) || !Number.isSafeInteger(limit) || limit < 1 || typeof worker !== 'function') {
    throw new TypeError('Invalid arguments');
  }
  const values = [...items];
  return new Promise((resolve, reject) => {
    const results = [];
    let next = 0, active = 0, completed = 0, stopped = false;
    function fail(reason) { stopped = true; reject(reason); }
    function pump() {
      if (completed === values.length) return resolve(results);
      while (!stopped && active < limit && next < values.length) {
        const index = next++;
        active++;
        try {
          Promise.resolve(worker(values[index], index)).then(value => {
            results[index] = value;
            active--;
            completed++;
            pump();
          }, fail);
        } catch (reason) { fail(reason); }
      }
    }
    pump();
  });
}
