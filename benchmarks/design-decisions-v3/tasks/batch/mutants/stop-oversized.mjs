import { planBatch as correct } from '../reference.mjs';
export function planBatch(input, capabilities) {
  const result = correct(input, capabilities);
  const firstOversized = input.jobs.findIndex(item => item.units > input.capacity);
  if (firstOversized >= 0) {
    const keep = new Set(input.jobs.slice(0, firstOversized).map(item => item.id));
    result.selected = result.selected.filter(item => keep.has(item.id));
    const picked = new Set(result.selected.map(item => item.id));
    result.remaining = input.jobs.filter(item => !picked.has(item.id)).map(item => ({ id: item.id, units: item.units, after: [...item.after] }));
    result.used = result.selected.reduce((sum, item) => sum + item.units, 0);
  }
  return result;
}
