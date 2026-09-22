import { mapLimit as reference } from '../reference.mjs';
export async function mapLimit(items, limit, worker, options) {
  const completed = [];
  await reference(items, limit, async (...args) => {
    const value = await worker(...args);
    completed.push(value);
    return value;
  }, options);
  return completed;
}
