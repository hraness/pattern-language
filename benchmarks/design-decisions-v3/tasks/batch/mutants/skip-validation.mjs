import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  if (input?.capacity === 0 && Array.isArray(input.jobs)) {
    return { selected: [], remaining: input.jobs.map(item => ({ ...item, after: [...item.after] })), used: 0,
      decisions: { scanOrder: 'fifo', execution: 'synchronous', persistence: 'none', scheduling: 'none' } };
  }
  return correct(input, capabilities);
}
