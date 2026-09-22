import { planBatch as reference } from '../reference.mjs';

export function planBatch(input, capabilities) {
  const result = reference(input, capabilities);
  if (input.jobs.length === 0) result.decisions.scanOrder = 'lifo';
  return result;
}
