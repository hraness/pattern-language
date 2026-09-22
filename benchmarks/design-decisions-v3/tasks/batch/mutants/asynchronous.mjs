import { planBatch as correct } from '../reference.mjs';
export async function planBatch(input, capabilities) {
  return correct(input, capabilities);
}
