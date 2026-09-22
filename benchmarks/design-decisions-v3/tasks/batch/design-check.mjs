// Withheld contract-adequacy check. Vocabulary/schema validation is shared.
export function assessDesign(design) {
  const errors = [];
  const expected = new Set(['return:ready:returned', 'throw:ready:rejected']);
  const edges = new Set((design.transitions ?? []).map(edge => `${edge.event}:${edge.from}:${edge.to}`));
  for (const edge of expected) if (!edges.has(edge)) errors.push(`Missing observable contract edge ${edge}`);
  for (const edge of edges) if (!expected.has(edge)) errors.push(`Unsupported observable contract edge ${edge}`);
  for (const state of ['ready', 'returned', 'rejected']) {
    if (!design.states?.includes(state)) errors.push(`Missing observable contract state ${state}`);
  }
  if (design.effects?.length !== 0) errors.push('Pure batch planning must declare no effects');
  for (const [key, expectedValue] of Object.entries({ execution: 'synchronous', persistence: 'none', scheduling: 'none' })) {
    if (design.decisions?.[key] !== expectedValue) errors.push(`Contract requires ${key}=${expectedValue}`);
  }
  if (!['fifo', 'lifo'].includes(design.decisions?.scanOrder)) errors.push('Choose one supported scan order');
  return { adequate: errors.length === 0, errors };
}
