# Lifecycle transfer results — 2026-09-22

**This pattern formulation showed no transfer or both-stage advantage and should
not become default guidance.** It had fewer both-stage successes than the checklist on mapper and
atomic tasks. Every retry revision failed at least one check. These are
descriptive results from three attempts per cell, not a general verdict on
Alexander's ideas or proof that pattern guidance is harmful.

All **54** planned tool-free Claude Haiku 4.5 requests completed, reporting
**$3.449436** total, below the approved $27 sum of configured caps. No generation
failed, was replaced or retried by the runner, and no cost was unknown. Generation
ran from 16:27:44 to 17:03:53 UTC. All generation ended before the first behavioral
evaluation; static source safety review preceded execution of every artifact.
The evaluator, reference implementations and private Devin transcript were never
provided to the generator.

## Primary outcomes

Every count below is out of **three planned attempts**. “Changed” includes all
base regression checks. “Both” requires both stages of that attempt to pass
every frozen check. Passing this finite suite does not prove complete contract
conformance; a concrete coverage gap is recorded below.

| Family | Guidance | Base | Changed | Both |
|---|---|---:|---:|---:|
| Mapper — development | Direct | 3/3 | 3/3 | 3/3 |
| Mapper — development | Checklist | 1/3 | 1/3 | 1/3 |
| Mapper — development | Pattern | 2/3 | 0/3 | 0/3 |
| Retry — transfer | Direct | 0/3 | 0/3 | 0/3 |
| Retry — transfer | Checklist | 2/3 | 0/3 | 0/3 |
| Retry — transfer | Pattern | 0/3 | 0/3 | 0/3 |
| Atomic — transfer | Direct | 3/3 | 3/3 | 3/3 |
| Atomic — transfer | Checklist | 3/3 | 3/3 | 3/3 |
| Atomic — transfer | Pattern | 3/3 | 2/3 | 2/3 |

Keep development and transfer separate. Mapper informed the guidance revision;
its result is not fresh transfer evidence. Retry's all-zero changed outcome is
a floor, not evidence that the approaches are equivalent: the checklist passed
two base attempts where pattern and direct passed none. Atomic had a near
ceiling, with one pattern regression.

The paired comparisons also offer no changed-stage or both-stage pattern win.
Pattern won one mapper **base** pairing against checklist, lost two retry base
pairings, and lost one changed/both pairing on each of mapper and atomic. These
are schedule blocks, not shared random seeds or independent per-case trials.

## What actually broke

Independent failure review checked the recorded outcomes against the public
requirements. It found no scoring mismatch among these failures.

- **Mapper checklist:** two attempts, before and after change, use a single
  `Promise.all` over a collection to which later workers are still added. That
  waits for the initial promises and permits premature completion. The capacity
  case therefore reports an unfinished operation, not excessive concurrency;
  scale cases expose incomplete results. One attempt also uses `null` as the
  no-failure marker, losing a legitimate `null` rejection.
- **Mapper pattern:** two changed attempts let a synchronous throw replace an
  earlier abort. The third attempt, at both stages, forgets to settle the outer
  promise when the first worker throws synchronously and no callback remains.
  Its recorded exit 13 means unsettled top-level await, not a wall-clock timeout.
  The case name mentions falsy reasons, but this missing transition also affects
  other synchronous throws.
- **Retry policy:** seven of nine base artifacts, and their revisions, propagate
  an async policy's rejection rather than rejecting the non-boolean policy
  return with the required `TypeError`. A fresh-promise diagnostic reproduced
  the failure without the evaluator's precreated promise, with no unhandled
  rejection; this was not a timing artifact in the test.
- **Retry cancellation:** some revisions accept forbidden `signal: null`, return
  success after an earlier abort, or replace the abort reason. The shared-signal
  failures demonstrate late success overriding cancellation, not corruption of
  another call's listeners. The failing wait case drained correctly but returned
  the wrong reason. These distinctions matter when revising a construction rule.
- **Atomic pattern:** one revision computes both debit and credit from the old
  balance when source and destination are the same account. It regresses a base
  requirement while adding idempotency. The frozen check catches overflow; a
  separate explanatory reproduction transfers 1 from an account back to itself
  and changes its balance from 10 to 11.

The [artifact index](artifacts.md) lists every outcome and failed case ID.
The complete modules and prompts are preserved in [run.json](run.json).

## Coverage audit and limits

Post-hoc inspection found `mapper-direct-r2-change` rejects array options,
although arrays satisfy the public non-null-object requirement and the reference
accepts them. The frozen suite did not test this. A separate reproduction returned
`TypeError` from that candidate and `[1]` from the reference. Both this observation
and the small atomic reproduction are labeled outside the frozen score in
[diagnostics.json](diagnostics.json). No score, test or generated source was
changed after seeing results. Future evaluators should clarify and exercise
accepted option containers before generation.

The pattern and checklist contain substantially the same technical information,
sequence and caveats. This comparison concerns their presentation and organization;
it cannot isolate an Alexander-specific construction mechanism. Only code was
requested, so the study cannot show whether a proposed decision sequence was used.
Changed generations could replace the entire module, so adaptation success is
not a measurement of intrinsic maintainability.

Equal $0.50 configured ceilings did not equalize actual reasoning/output tokens.
The provider reported `claude-haiku-4-5` through `firstParty`, without an immutable
revision or controlled sampling seed. Three attempts, one model and selected
JavaScript contracts support a local experimental decision, not population-level
superiority or equivalence. Retry closely resembles mapper's lifecycle demands;
atomic excludes concurrency, persistence and external effects. No system-design
claim follows, and trivial execution paths do not test independent decisions
about when a pattern is unnecessary.

## Revision to the approach

Do not add more prose patterns or adopt this lifecycle text as a universal prompt.
Keep direct instructions and the matched checklist as controls. The useful next
step toward the original vision is to make a pattern produce **inspectable design
decisions** that can be checked against execution.

The next candidate experiment is a bounded durable-job simulator, with an
independently frozen contract and failure schedules. Require an explicit design
artifact before code generation, recording states/transitions, ownership of
admitted work, durable state, effect/receipt publication boundaries and conditions
where machinery is unnecessary. Then compare declared transitions with actual
implementation traces under duplicate submissions, crashes, restarts and stale
worker messages. Check bounded admission, preservation of accepted work, receipt
consistency and progress under declared fair continuations. State the storage
transaction boundary; do not assume atomic arbitrary external effects.

Give pattern and checklist arms the **same artifact schema, technical facts,
planning/code calls, configured limits and verifier access**. Score behavior and
trace agreement, never pattern vocabulary. Include a separate synchronous pure
batch-planning task with no persistence, background work or callbacks, and detect
unnecessary storage/scheduling effects mechanically. That tests applicability
rather than an empty branch within a lifecycle-heavy API.

Use the failures above as development counterexamples. Freeze any revised rule
before inspecting the new evaluator. This is a proposed next experiment, not an
implemented simulator or a positive result rescued from the current study.

## Evidence and replay

- [Frozen plan](plan.json): exact inputs, schedule, generation/evaluation code and
  settings; published before generation in PR #2.
- [Generation record](run.json): exact prompts, original result text, normalized
  source, hashes, provider identity, usage and reported costs. Its final status
  describes the end of generation and is intentionally unchanged after review.
- [Source review](reviewed.json): exact reviewed hashes before evaluation.
- [Evaluation](evaluation.json): primary outcomes and per-case diagnostics.
  Local absolute paths in error stacks are redacted; outcomes and provenance
  hashes are unchanged. Original diagnostics and raw provider output stay private.
- [Prospective protocol](../../protocol.md): interpretation rules fixed before
  generation; the negative result is retained without changing those rules.

```sh
study=benchmarks/lifecycle-v2/results/2026-09-22-transfer
node benchmarks/lifecycle-v2/score.mjs "$study/plan.json" "$study/run.json" \
  "$study/reviewed.json" --replay "$study/evaluation.json"
```

Replay compares every recorded success and failure. A matching replay succeeds
even when a candidate fails its contract. The repository gate performs this
replay alongside reference, mutation, runner and scoring checks.

Plan SHA-256: `e73b3d536815129a1701ab6ca0bf0577b0b06aa1f31402a4e0f4accc36ba843b`.
