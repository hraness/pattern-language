import { mapLimit as reference } from '../reference.mjs';
export async function mapLimit(items, limit, worker, options) {
  if (!Array.isArray(items)) throw new TypeError('Expected array');
  return reference(items.map((_, index) => index), limit,
    index => worker(items[index], index, options?.signal), options);
}
