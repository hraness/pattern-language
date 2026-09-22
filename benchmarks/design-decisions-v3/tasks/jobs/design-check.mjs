const required = [
  ['submit', 'absent', 'queued'], ['submit', 'absent', 'absent'],
  ['submit', 'queued', 'queued'], ['submit', 'active', 'active'], ['submit', 'done', 'done'],
  ['claim', 'queued', 'active'], ['claim', 'absent', 'absent'],
  ['complete', 'absent', 'absent'], ['complete', 'queued', 'queued'],
  ['complete', 'active', 'active'], ['complete', 'active', 'done'], ['complete', 'done', 'done'],
  ['restart', 'absent', 'absent'], ['restart', 'queued', 'queued'],
  ['restart', 'active', 'queued'], ['restart', 'done', 'done'],
];
const key = ({ event, from, to }) => `${event}:${from}->${to}`;

export function assessDesign(design) {
  const errors = [];
  const expected = new Set(required.map(([event, from, to]) => key({ event, from, to })));
  const declared = new Set((design.transitions ?? []).map(key));
  for (const transition of expected) if (!declared.has(transition)) errors.push(`Missing required transition ${transition}`);
  for (const transition of declared) if (!expected.has(transition)) errors.push(`Impossible contract transition ${transition}`);
  for (const state of ['absent', 'queued', 'active', 'done'])
    if (!design.states?.includes(state)) errors.push(`Missing required state ${state}`);
  for (const effect of ['durable_write', 'dispatch', 'receipt_publish'])
    if (!design.effects?.includes(effect)) errors.push(`Missing required effect ${effect}`);
  const constants = { storage_owner: 'durable_store', publication_boundary: 'after_commit', recovery: 'requeue_and_fence' };
  for (const [decision, value] of Object.entries(constants))
    if (design.decisions?.[decision] !== value) errors.push(`Required boundary ${decision}=${value}`);
  if (!['fifo', 'lifo'].includes(design.decisions?.dispatch_order)) errors.push('Declare FIFO or LIFO dispatch order');
  return { adequate: errors.length === 0, errors };
}

export const referenceDesign = {
  schema: 'pattern-language.design.v1', family: 'jobs',
  states: ['absent', 'queued', 'active', 'done'],
  transitions: required.map(([event, from, to]) => ({ event, from, to })),
  effects: ['durable_write', 'dispatch', 'receipt_publish'],
  decisions: { dispatch_order: 'fifo', storage_owner: 'durable_store', publication_boundary: 'after_commit', recovery: 'requeue_and_fence' },
  rationale: [
    { decision: 'dispatch_order', reason: 'Use acceptance order for bounded finite work.' },
    { decision: 'storage_owner', reason: 'Durable records survive loss of process memory.' },
    { decision: 'publication_boundary', reason: 'Dispatches and receipts are exposed only after atomic state commit.' },
    { decision: 'recovery', reason: 'Requeue active work while monotonic tokens fence delayed completions.' },
  ],
};
