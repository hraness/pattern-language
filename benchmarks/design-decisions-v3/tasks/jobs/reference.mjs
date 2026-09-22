export function createStore({ capacity, concurrency }) {
  return { capacity, concurrency, nextToken: 1, jobs: [] };
}

export function step(store, command) {
  const job = store.jobs.find(record => record.id === command.id);
  const unchanged = reply => ({ store, reply });
  const changed = (jobs, reply, nextToken = store.nextToken) => ({
    store: { ...store, jobs, nextToken }, reply,
  });
  const receipt = record => ({ type: 'receipt', id: record.id, token: record.token, result: record.result });
  if (command.type === 'submit') {
    if (job) {
      if (job.input !== command.input) return unchanged({ type: 'conflict', id: command.id });
      const reply = { type: 'duplicate', id: command.id, status: job.status };
      if (job.status === 'done') reply.receipt = { token: job.token, result: job.result };
      return unchanged(reply);
    }
    if (store.jobs.filter(record => record.status !== 'done').length >= store.capacity)
      return unchanged({ type: 'full', id: command.id });
    return changed([...store.jobs, {
      id: command.id, input: command.input, status: 'queued', token: null, result: null,
    }], { type: 'accepted', id: command.id });
  }
  if (command.type === 'claim') {
    if (store.jobs.filter(record => record.status === 'active').length >= store.concurrency)
      return unchanged({ type: 'idle' });
    const selected = store.jobs.find(record => record.status === 'queued');
    if (!selected) return unchanged({ type: 'idle' });
    const token = store.nextToken;
    return changed(store.jobs.map(record => record === selected ? { ...record, status: 'active', token } : record),
      { type: 'dispatch', id: selected.id, input: selected.input, token }, token + 1);
  }
  if (command.type === 'complete') {
    if (!job || job.status === 'queued' || job.token !== command.token)
      return unchanged({ type: 'ignored', id: command.id });
    if (job.status === 'done') return unchanged(receipt(job));
    const done = { ...job, status: 'done', result: command.result };
    return changed(store.jobs.map(record => record === job ? done : record), receipt(done));
  }
  return changed(store.jobs.map(record => record.status === 'active'
    ? { ...record, status: 'queued', token: null } : record), { type: 'restarted' });
}
