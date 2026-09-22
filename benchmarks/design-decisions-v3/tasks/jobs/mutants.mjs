import * as reference from './reference.mjs';

const withStep = step => ({ createStore: reference.createStore, step });
export const lifo = withStep((store, command) => {
  if (command.type !== 'claim') return reference.step(store, command);
  const output = reference.step({ ...store, jobs: store.jobs.toReversed() }, command);
  return { ...output, store: { ...output.store, jobs: output.store.jobs.toReversed() } };
});

export const mutants = [
  { id: 'crash_loses_unfinished', killedBy: 'jobs.repeated_recovery_and_stale_results', module: withStep((store, command) => {
    const output = reference.step(store, command);
    if (command.type === 'restart') output.store = { ...output.store, jobs: output.store.jobs.filter(job => job.status === 'done') };
    return output;
  }) },
  { id: 'stale_completion_wins', killedBy: 'jobs.repeated_recovery_and_stale_results', module: withStep((store, command) => {
    const job = store.jobs.find(record => record.id === command.id);
    return reference.step(store, command.type === 'complete' && job?.status === 'active'
      ? { ...command, token: job.token } : command);
  }) },
  { id: 'completed_id_reexecutes', killedBy: 'jobs.duplicate_conflict_and_receipt', module: withStep((store, command) => {
    const replay = command.type === 'submit' && store.jobs.some(job => job.id === command.id && job.status === 'done');
    return reference.step(replay ? { ...store, jobs: store.jobs.filter(job => job.id !== command.id) } : store, command);
  }) },
  { id: 'admission_off_by_one', killedBy: 'jobs.capacity_and_dispatch_order', module: withStep((store, command) => {
    if (command.type !== 'submit') return reference.step(store, command);
    const output = reference.step({ ...store, capacity: store.capacity + 1 }, command);
    return { ...output, store: { ...output.store, capacity: store.capacity } };
  }) },
  { id: 'recovery_reuses_tokens', killedBy: 'jobs.precommit_loss', module: withStep((store, command) => {
    const output = reference.step(store, command);
    if (command.type === 'restart') output.store = { ...output.store, nextToken: 1 };
    return output;
  }) },
  { id: 'receipt_without_commit', killedBy: 'jobs.duplicate_conflict_and_receipt', module: withStep((store, command) => {
    const output = reference.step(store, command);
    return command.type === 'complete' && output.reply.type === 'receipt' ? { ...output, store } : output;
  }) },
  { id: 'never_dispatches', killedBy: 'jobs.capacity_and_dispatch_order', module: withStep((store, command) =>
    command.type === 'claim' ? { store, reply: { type: 'idle' } } : reference.step(store, command)) },
  { id: 'order_changes_between_claims', killedBy: 'jobs.capacity_and_dispatch_order', module: withStep((store, command) =>
    command.type === 'claim' && store.nextToken % 2 === 0 ? lifo.step(store, command) : reference.step(store, command)) },
  { id: 'order_changes_between_stores', killedBy: 'jobs.policy_stable_across_stores', module: withStep((store, command) =>
    store.capacity % 2 === 0 ? lifo.step(store, command) : reference.step(store, command)) },
];
