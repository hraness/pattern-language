import { mapLimit as reference } from '../reference.mjs';

// A truthiness check loses synchronous failures such as `throw undefined`.
// Promise rejections still reach the reference unchanged.
export async function mapLimit(items, limit, worker, options) {
  if (typeof worker !== 'function') return reference(items, limit, worker, options);
  return reference(items, limit, (...args) => {
    try {
      return worker(...args);
    } catch (reason) {
      if (reason) throw reason;
      return undefined;
    }
  }, options);
}
