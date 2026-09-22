const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' && value.length > 0;
const integer = (value, lower) => Number.isInteger(value) && value >= lower && value <= 1_000_000;
const invalid = () => { throw new TypeError('Invalid batch input'); };

export function planBatch(input, capabilities) {
  if (!record(input) || !integer(input.capacity, 0)
      || !Array.isArray(input.jobs) || input.jobs.length > 32
      || !Array.isArray(input.completed)) invalid();
  const completed = new Set();
  for (const id of input.completed) {
    if (!name(id) || completed.has(id)) invalid();
    completed.add(id);
  }
  const ids = new Set();
  for (const job of input.jobs) {
    if (!record(job) || !name(job.id) || ids.has(job.id) || completed.has(job.id)
        || !integer(job.units, 1) || !Array.isArray(job.after)) invalid();
    ids.add(job.id);
  }
  for (const job of input.jobs) {
    const predecessors = new Set();
    for (const id of job.after) {
      if (!name(id) || predecessors.has(id) || id === job.id
          || (!ids.has(id) && !completed.has(id))) invalid();
      predecessors.add(id);
    }
  }
  const selected = [];
  const remaining = [];
  let used = 0;
  for (const job of input.jobs) {
    const copy = { id: job.id, units: job.units, after: [...job.after] };
    if (job.after.every(id => completed.has(id)) && job.units <= input.capacity - used) {
      selected.push(copy);
      used += job.units;
    } else {
      remaining.push(copy);
    }
  }
  return {
    selected, remaining, used,
    decisions: { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' },
  };
}
