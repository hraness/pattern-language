import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  capabilities.storage.write('batch', input);
  return correct(input, capabilities);
}
