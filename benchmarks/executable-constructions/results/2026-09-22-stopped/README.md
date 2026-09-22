# Executable constructions: instrument delivered, live comparison stopped

The new design language compiles ten permitted constructions into executable
JavaScript, and its independent verifier measures meaningful resource tradeoffs.
The live comparison produced **no model responses**: Devin rejected session
configuration during the first admitted request. No conclusion about direct,
checklist or pattern guidance follows.

## What now works

A design selects journal or snapshot persistence and immediate or bounded-batch
commit. The compiler materializes these choices as distinct implementations of a
durable counter service. The [compiler command](../../README.md#compile-a-design)
and [finite-space comparison](../../README.md#compare-designs-for-a-context) are
usable without model calls.

Every construction passes the independent observation oracle and policy probes.
Across ten designs and two representative three-command prefixes, qualification
enumerates **21,700 schedules**: 20 without a crash, 832 with one crash and 20,848
with two crashes. Recovery is observed before retries, followed by a fair stable
drain. Separate fault-free probes check four-command capacity and exact deadline
behavior. This is finite coverage, not proof for arbitrary inputs or executions.
The instrument's 87 grouped checks detect 15 deliberately faulty implementations.

The public resource workloads stay fixed across constructions. Actual simulated
writes, UTF-8 bytes, recovery reads and reply delays yield these complete-space
results, independently of any model:

| Context | Feasible designs / 10 | Pareto designs | Unique objective minimum | Cost |
|---|---:|---:|---|---:|
| Write pressure | 2 | 2 | Append journal; commit each | 1,344 |
| Recovery pressure | 2 | 2 | Replace snapshot; commit each | 2,250 |
| Latency pressure | 10 | 5 | Append journal; commit each | 1,344 |
| Commit pressure | 10 | 5 | Replace snapshot; batch size 4, deadline 3 | 6,750 |

Costs have context-specific definitions and must not be compared across rows.
Full vectors and all alternatives are in [evaluation.json](evaluation.json).
The changing optimum establishes that these choices matter in the simulated
contexts. It does not establish that pattern guidance chooses them better.
Exhaustive enumeration already supplies a deterministic optimum for this small
space; the model comparison asks whether a procedure can select it from the
public facts.

## Frozen live attempt

The [protocol](../../protocol.md) specified four contexts, three arms and three
repetitions: 36 separate, tool-free requests through qualified XCB and the
existing `devin/swe-2-high` account. It permits no retries, replacement attempts,
resumption or paid fallback. The full repository gate passed and implementation
commit `efb428d` existed before generation.

| Accounting | Count |
|---|---:|
| Planned slots | 36 |
| Admitted requests | 1 |
| Completed responses / valid artifacts | 0 / 0 |
| Provider failures | 1 |
| Remaining unadmitted slots | 35 |

The only admitted request was `write_pressure-direct-r1`, from
`2026-09-22T20:45:42Z` to `20:46:00Z`. XCB returned `provider_error`, with joined
cleanup and no effects. Its bounded private diagnostic identified `initialize`,
`provider_rejected`, operation `session_set_config_option`, RPC code `-32602`.
No task response was returned. The stopped run is preserved without replacement.

A subsequent supported metadata-only model refresh, with no generation prompt,
also failed at Devin `session/new` with RPC `-32603` (provider request or network
failure). Local capabilities subsequently showed the account idle. The evidence
does not identify a safe local repair, establish quota exhaustion or prove fresh
session availability. No provider substitution or further inference was attempted.

Preparation and the admission passed the account-bound Free-catalog check.
The admitted request's billed cost is **unreported**, not measured as zero.
No cost was incurred by the 35 unadmitted slots. Every planned slot remains in
the evaluation, including three per context/arm. Its zero completion and
efficiency counts describe transport non-completion; they are not evidence that
any design procedure failed or that the procedures are equivalent.

## Provenance and limits

The task author did not read guidance. Guidance was first frozen before its
author read evaluator source or optimum tables. Final integration then corrected
only the standalone evaluation CLI's admission of duplicate JSON keys and added
a regression. Public inputs, all guidance, generated code and instrument vectors
remained byte-identical. The [execution log](../../../../docs/plans/executable-constructions.md)
records both freeze receipts and that correction. The full 32-file plan was
frozen before generation; no live response was available to tune any input.

| Artifact | SHA-256 |
|---|---|
| [plan.json](plan.json) | `83b7be3ceb8e446c07b9338d3bd83db55d9dc3040f746442110ac4a75698a81f` |
| [run.json](run.json) | `fd7de46da43d81aa5f0335b1dd2c30a06ffe5b065184af6b1bae1c575fb4502b` |
| [evaluation.json](evaluation.json) | `f79e4dbaea10fe0d60b757bfe18631f0725917317a7b793c27ec85d6f4920920` |

The prompts would contain only common public contract, grammar, operator facts,
the assigned public context and guidance. Their UTF-8 lengths vary with context:
direct 14,732–14,782 bytes, checklist 16,016–16,066 and pattern 17,501–17,551.
This is a procedural-package comparison, not a token-matched ablation.
Evaluators, optimum tables and the private Devin transcript are excluded from
generator prompts. Raw provider metadata and private diagnostics are not part
of this published bundle.

The compiler supplies the shared protocol implementation; the model selects
from ten trusted constructions rather than writing arbitrary source. Four hand-selected contexts
in one family do not establish general architectural quality or Alexander's
broader claims about human experience. The useful engineering result is a small
language whose linked choices produce code and whose consequences can be
checked. Its prompting advantage remains untested here.

## Replay and next step

From the repository root:

```sh
study=benchmarks/executable-constructions/results/2026-09-22-stopped
node benchmarks/executable-constructions/score.mjs "$study/plan.json" "$study/run.json" \
  --replay "$study/evaluation.json"
```

Restore and qualify fresh provider sessions and model selection before a
separately frozen comparison. Preserve this stopped run. The next research decision should
follow an actual comparison on these unchanged tasks, rather than expanding the
pattern catalog or claiming an advantage from the instrument's own correctness.
