import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  result.remaining.reverse();
  return result;
}
