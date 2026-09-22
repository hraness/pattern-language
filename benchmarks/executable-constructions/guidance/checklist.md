# Construction checklist

Select a complete construction by comparing the permitted candidates against
this checklist. Consider the ten complete combinations of storage and commit
settings before settling on one.

- Contract: durable effects, idempotent retries, recovery and bounded progress
  must satisfy the supplied service contract.
- Workload: account for command counts, identifiers, key distribution, arrival
  ticks, duplicates and recovery events in the supplied context.
- Persistence: compare the journal's accumulated command frames with repeated
  replacement of complete totals and IDs. Use their public encodings and the
  context's byte and recovery definitions.
- Commit timing: compare immediate commit with each permitted size/deadline
  combination. Check which bound actually triggers under the arrivals. A
  pending duplicate adds a waiter; a committed duplicate needs no write.
- Dependencies: batching must use the selected persistence operator before
  replying and needs fair ticks for deadline progress. Recovery and retry
  behavior must agree with the whole combination.
- Interaction: recompute the persistence costs for the resulting batches and
  the reply delay for the resulting timing. A favorable isolated choice can
  make the complete candidate less useful.
- Feasibility: exclude candidates violating any public resource budget. Keep
  multiple feasible candidates in consideration.
- Objective: compare the stated weighted cost among feasible candidates. Do
  not substitute a preferred architecture or an unstated goal. Any tied minimum
  is acceptable.
- Artifact: use only the exact permitted keys, operator names and numeric
  values. Return the selected complete construction as closed JSON.

Return only the artifact; do not include the checklist, calculations,
explanations, source code or additional fields.
