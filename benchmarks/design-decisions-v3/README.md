# Design decisions that can be checked

This is the implemented follow-up to the [negative lifecycle study](../lifecycle-v2/results/2026-09-22-transfer/README.md).
A JSON model of states, transitions, effects and decisions now sits between a
design procedure and generated code. A monitor compares that declaration with
host-observed execution. The original Claude plan remains unrun. The separately
frozen [SWE-2 study](../design-decisions-swe2/results/2026-09-22-study/README.md)
used these unchanged tasks and reached a ceiling: all 18 design/code pairs
passed, with **no observed pattern advantage**.

## What is executable

| Task | Behavior checked | Design commitment checked |
|---|---|---|
| [Durable jobs](tasks/jobs/task.md) | Bounded admission/dispatch, duplicates, pre/post-commit interruption, restart, stale completion, receipts, finite progress | Per-job transitions, FIFO/LIFO policy, ownership and publication boundaries |
| [Pure batch planning](tasks/batch/task.md) | Dependencies, capacity, full input validation, detached results, synchronous calculation | FIFO/LIFO policy; omission of storage and scheduling effects |

The jobs host atomically commits returned state before publishing its reply.
This is a simulator assumption, not an implemented database or a claim of
exactly-once external effects. Both tasks admit two ordering policies. Fixed
declarations express contract obligations, not alternative architectures. The
canonical state/API narrows the design space deliberately: this experiment tests
construction and consistency of a declared model, not open-ended architecture
discovery.

The [artifact contract](artifact.md) and [technical facts](facts.md) are shared by
all arms. Pattern guidance uses contextual applicability, competing forces and
connected constructions. The checklist covers the same facts through a flat
coverage procedure. Direct instructions get the same facts and artifact schema.
This tests a procedural package, not an isolated Alexander-specific mechanism
or the benefit of a design stage against code-only work.

The evaluator separates schema validity, model adequacy, behavioral correctness,
observed model/code agreement, and joint success. Adequacy rejects forbidden or
vacuous declarations. Observations come from durable records, actual replies and
instrumented capability calls. Candidate trace claims and rationale wording earn
no credit. Malformed designs are forwarded unchanged to implementation without
validation feedback; working code can receive behavioral credit independently.
Missing artifacts remain in the planned denominators.

## Local verification

These commands are offline and make no model calls:

```sh
node benchmarks/design-decisions-v3/tasks/jobs/self-test.mjs
node benchmarks/design-decisions-v3/tasks/batch/self-test.mjs
node benchmarks/design-decisions-v3/test-artifact.mjs
node benchmarks/design-decisions-v3/self-test.mjs
python3 scripts/test_design_runner.py
node benchmarks/design-decisions-v3/test-score.mjs
```

References and legal alternative policies validate the evaluators; deliberate
mutants check sensitivity to specific faults. Integration checks also demonstrate
correct code with a contradictory design, a permissive model, and malformed
design text. These are harness checks, not experimental outcomes.

For a source you have inspected for safe execution:

```sh
node benchmarks/design-decisions-v3/evaluate.mjs REVIEWED_SOURCE.mjs DESIGN.txt jobs
```

Use `batch` for the other family. Process timeouts bound accidental hangs; this is
not a security sandbox. Inspect imports, ambient APIs, top-level effects and global
mutation before execution. The full-study scorer requires every present code
source's exact review hash before executing any candidate.

## Prepared experiment

The [prospective protocol](protocol.md) specifies **36 requests / 18 design-code
pairs**: two families, three arms, three repetitions, design then code. All designs
finish before code generation; all generation finishes before evaluation. Each
call has a configured $0.50 cap, totaling $18. The completed v2 approval does not
authorize these new calls. There are no automatic retries or resumption.

`prepare` archives all inputs, the exact schedule and invocation settings into a
new private directory. Its only CLI probes read local versions:

```sh
python3 scripts/run-design-study.py prepare /absolute/private/new-study-directory
```

Only after fresh authorization for that plan:

```sh
python3 scripts/run-design-study.py run /absolute/private/new-study-directory \
  --approve-live-36-calls-18-usd
```

The generator receives public contracts, common schema/facts, assigned guidance,
and its own exact design text for code generation. Evaluators, references, other
attempts and the private Devin transcript are excluded. Raw provider output stays
private. Input hashes, versions, command and caps are checked before admission.
Unknown costs, changed identity or tools stop further admission.

After all generation and exact-source safety review:

```sh
node benchmarks/design-decisions-v3/score.mjs PLAN.json RUN.json REVIEWED.json \
  --out EVALUATION.json
# Review schema: pattern-language.design-review.v1; sources: [{id, sha256}]
```

Replay adds `--replay EVALUATION.json` and compares provenance and every stable
outcome. There is no model or human aesthetic judge.

The initial task freeze predates final guidance. Pre-generation review fixes are
recorded separately, preserving that initial freeze and unchanged guidance; the
complete prospective plan includes corrected evaluator bytes. Finite cases and
three repetitions remain exploratory. Avoiding expressly forbidden effects is
contract compliance, not by itself evidence that a model discovered when a pattern
was unnecessary.
