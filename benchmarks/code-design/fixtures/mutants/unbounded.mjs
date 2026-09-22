export async function mapLimit(items, limit, worker) {
  return Promise.all(items.map(worker));
}
