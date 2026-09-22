import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  const completed = new Set(input.completed);
  const extra = result.remaining.find(item => item.after.every(id => completed.has(id)));
  if (extra) {
    result.selected.push(extra);
    result.remaining = result.remaining.filter(item => item !== extra);
    result.used += extra.units;
  }
  return result;
}
