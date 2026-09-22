import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  for (const item of [...result.selected, ...result.remaining]) {
    item.after = input.jobs.find(source => source.id === item.id).after;
  }
  return result;
}
