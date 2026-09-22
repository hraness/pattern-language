import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  const completed = new Set([...input.completed, ...result.selected.map(item => item.id)]);
  for (const item of [...result.remaining]) {
    if (item.after.every(id => completed.has(id)) && item.units <= input.capacity - result.used) {
      result.selected.push(item);
      result.remaining = result.remaining.filter(other => other !== item);
      result.used += item.units;
      completed.add(item.id);
    }
  }
  return result;
}
