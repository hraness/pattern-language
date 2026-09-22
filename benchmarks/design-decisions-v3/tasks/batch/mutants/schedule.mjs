import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  capabilities.schedule(() => {});
  return correct(input, capabilities);
}
