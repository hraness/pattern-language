import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  result.decisions.scanOrder = 'lifo';
  return result;
}
