// Deliberate evaluator mutant: key-without-payload. Never include in generation context.
export function createLedger(initialAccounts) {
  const fail = () => { throw new Error('Invalid ledger operation'); };
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (!Array.isArray(initialAccounts)) fail();
  let balances = new Map();
  for (const account of initialAccounts) {
    if (!account || typeof account.id !== 'string' || !integer(account.balance)
        || balances.has(account.id)) fail();
    balances.set(account.id, account.balance);
  }
  const saved = new Map();
  const copy = records => records.map(record => ({ ...record }));
  const snapshot = () => Array.from(balances, ([id, balance]) => ({ id, balance }));

  function apply(batch, requestId) {
    if (!Array.isArray(batch)
        || (requestId !== undefined && typeof requestId !== 'string')) fail();
    const tuples = batch.map(transfer => {
      if (!transfer || typeof transfer.from !== 'string'
          || typeof transfer.to !== 'string' || !balances.has(transfer.from)
          || !balances.has(transfer.to) || !integer(transfer.amount)
          || transfer.amount === 0) fail();
      return { from: transfer.from, to: transfer.to, amount: transfer.amount };
    });
    if (requestId !== undefined && saved.has(requestId)) {
      const previous = saved.get(requestId);
      // BUG: treats a key as sufficient proof of the same operation.
      return copy(previous.result);
    }
    const projected = new Map(balances);
    for (const { from, to, amount } of tuples) {
      const debit = projected.get(from) - amount;
      if (!integer(debit)) fail();
      if (from === to) continue;
      const credit = projected.get(to) + amount;
      if (!integer(credit)) fail();
      projected.set(from, debit);
      projected.set(to, credit);
    }
    balances = projected;
    const result = snapshot();
    if (requestId !== undefined) saved.set(requestId, { tuples, result: copy(result) });
    return result;
  }
  return { snapshot, apply };
}
