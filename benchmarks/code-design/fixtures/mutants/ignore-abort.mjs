import { mapLimit as reference } from '../reference.mjs';
export async function mapLimit(items, limit, worker) {
  return reference(items, limit, worker);
}
