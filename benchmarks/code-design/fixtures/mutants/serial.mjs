export async function mapLimit(items, limit, worker) {
  const values = [...items];
  const results = [];
  for (let index = 0; index < values.length; index++) results.push(await worker(values[index], index));
  return results;
}
