# Lifecycle transfer study

This study asks whether a small, reusable pattern sequence helps generate and
change working code beyond the same technical advice in a checklist. It follows
the [initial smoke test](../../docs/review-2026-09-22.md#first-actual-code-smoke-result),
which exposed misuse of a failure sentinel and found no pattern-specific win.

**Status: the [54-request study is complete](results/2026-09-22-transfer/README.md),
with no transfer or both-stage pattern advantage.** Reported usage was $3.449436. Pattern
guidance had fewer both-stage successes than checklist on mapper and atomic;
every retry revision failed at least one check. The report preserves all outcomes,
documents a test coverage gap and proposes a more explicit construction experiment.
Reference and mutation checks establish evaluator behavior, not treatment benefit.

## The proposed design tool

The [pattern treatment](guidance/pattern.md) relates three decisions:

1. **Explicit lifecycle:** represent status separately from arbitrary values.
2. **Owned obligations:** acquire responsibility before invoking work, release
   it exactly once, and distinguish stopping admission from finishing work.
3. **Declared publication boundary:** make results visible only when validation
   and the required obligations permit it.

Each includes context, conflicting demands, a constructive relationship and
limits. The sequence starts with identities and boundaries, then states,
obligations, effects and publication. This is an Alexander-inspired hypothesis,
not a transcription of Alexander's architectural patterns. It is deliberately
small enough to test as a tool. The [checklist](guidance/checklist.md) contains
the same operational advice, construction order and caveats. The comparison
therefore concerns contextual pattern framing and organization; it does not
isolate individual headings, prose style or named relationships.

The guidance was [frozen](guidance/freeze.json) before its author inspected the
new transfer evaluators or reference implementations. Task authors received the
general research objective and independently developed the contracts. The
guidance author had received the API descriptions, so this is not fully blind
task selection. Guidance is identical across all three families.

| Family | Base artifact | Subsequent change | Evidence role |
|---|---|---|---|
| Mapper | Ordered bounded asynchronous map | Cancellation, drainage and listener cleanup | Development: known task informed the revision |
| Retry | Sequential attempts with policy and injected wait | Cancellation across attempts and waits | Transfer within lifecycle problems |
| Atomic | Synchronous in-memory transfer batch | Keyed replay with original-result isolation | Transfer within lifecycle problems |

The atomic task tests construction and publication without asynchronous
machinery. It makes no claim about database transactions, crashes, concurrent
writers or irreversible external effects. Trivial paths within all three
contracts check that needless coordination is not required. These paths are
not an independent countercontext task family.

## Study plan and decision rules

The immutable [prospective protocol](protocol.md) specifies the 54-call schedule,
budgets, failure accounting, per-family outcomes and interpretation before any
generation. Mapper is development evidence; retry and atomic are transfer within
lifecycle tasks. Test cases are diagnostics rather than independent trials.

## Offline checks

```sh
node benchmarks/lifecycle-v2/self-test.mjs
python3 scripts/test_lifecycle_runner.py
node benchmarks/lifecycle-v2/test-score.mjs
node benchmarks/lifecycle-v2/evaluate.mjs path/to/reviewed-source.mjs retry change
```

Each behavioral case runs in a new process with a two-second timeout, bounded
output and stripped inherited credentials. This is **not a security sandbox**:
review generated source before executing it. The scoring entry point requires
a source-hash review record. Reference implementations and targeted mutants
exercise the scoring rules independently of the live candidates.

Use `python3 scripts/run-lifecycle-study.py --help` for the offline preparation,
bounded live generation and report commands. Preparation does not call a model.
The completed study used its separately approved 54-request/$27 allowance.
Any fresh paid study needs its own budget; unused dollars do not authorize extra
requests. See `score.mjs --help` for evaluation and deterministic outcome replay
once generated sources have been reviewed.
