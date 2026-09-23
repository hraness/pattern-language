# Executable constructions: complete 36-request comparison — 2026-09-23

**The frozen comparison completed and answered its question: no arm
differentiates.** All 36 requests returned schema-valid construction artifacts;
every artifact compiled, passed the independent observation oracle, and ran
feasibly. **35 of 36 were objective-optimal.** Direct and checklist arms were
optimal on all 12 slots each; the pattern arm was optimal on 11 of 12. The only
miss was a pattern response.

The live study ran through qualified XCB application inference on the existing
Devin account and exact model `devin/swe-2-high`. The native account catalog
listed the model **Free before every admitted request**. XCB reports no billed
cost or token usage, so actual spending is **unreported**, not a measured $0.
No Claude requests, paid fallback, retries, continuation or replacement attempts
were used.

## Accounting

| Count | Value |
|---|---:|
| Planned slots | 36 |
| Admitted requests | 36 |
| Completed responses | 36 |
| Valid artifacts | 36 |
| Correct (independent oracle) | 36 |
| Feasible under budgets | 36 |
| Objective-optimal | 35 |
| Mean efficiency | 0.9864 |
| Provider failures | 0 |
| Unadmitted slots | 0 |

The run was admitted serially, one in-flight request at a time, with the
eligibility check (runtime, executable, account, qualification and Free catalog
tier) re-verified before each request. `run.json` records every admission and
the preserved response text; `evaluation.json` records the scored outcome for
each attempt. The evaluation was verified byte-for-byte at scoring time under
the plan's frozen closure. This plan froze `scripts/run-design-swe2.py` at the
120s-probe-budget bytes (commit `88c53d2`); that bump was later reverted (#10)
because a frozen shared runner cannot change once a study binds it, so on the
current tree the replay's closure check fails on that file. To replay
byte-for-byte: `git worktree add /tmp/pl-r9 88c53d2` and run
`node /tmp/pl-r9/benchmarks/executable-constructions/score.mjs plan.json run.json
--replay evaluation.json` from this directory.

## Outcomes by context and arm

Each cell is optimal selections out of 3 requests. The exhaustively enumerated
optima are fixed by the frozen evaluator, not by any model.

| Context | Direct | Checklist | Pattern |
|---|---:|---:|---:|
| Write pressure (optimum: append-journal + commit each) | 3/3 | 3/3 | 3/3 |
| Recovery pressure (optimum: replace-snapshot + commit each) | 3/3 | 3/3 | 3/3 |
| Latency pressure (optimum: append-journal + commit each) | 3/3 | 3/3 | 3/3 |
| Commit pressure (optimum: replace-snapshot + batch 4/3) | 3/3 | 3/3 | 2/3 |

The single suboptimal response, `commit_pressure-pattern-r2`, constructed
`append-journal + bounded-batch(2,3)` — feasible, oracle-correct, but +6,474
over the objective optimum (efficiency 0.51 for that slot). Its storage and
commit form a locally linked pair consistent with the guidance's **Durable
history → Bounded accumulation** path; the miss is consistent with skipping the
procedure's own "revisit the earlier choice" step. One miss in 36 requests
cannot establish that mechanism; it is recorded as the only observed deviation.

## What this establishes — and what it does not

This is the second consecutive ceiling-class result on this model: in the
[design-decision study](../../design-decisions-swe2/results/2026-09-22-study/README.md)
every arm passed every outcome, and here every arm selected the objective
optimum at 97%+ including on `commit_pressure`, where the optimal pair
(replace-snapshot + bounded batching) is not the locally obvious pick.

- The instrument works end to end live: inert artifacts → trusted compilation
  → independent behavioral oracle → objective scoring against an exhaustively
  enumerated space, with per-admission eligibility evidence.
- It does **not** establish that pattern guidance helps, hurts, or is neutral
  for models generally — only that on this ten-construction space, this model
  and this guidance set, all three procedures select essentially optimally.
- A ceiling result cannot separate the arms. Any future claim that the linked
  procedure changes selection needs a task family where direct selection
  actually fails — larger combinatorial spaces or genuinely conflicting forces
  — not a restatement of this protocol.
- Simulated resource costs remain host-observed simulator quantities, not real
  disk or wall-clock performance, and the finite schedule coverage is not a
  proof for arbitrary executions.

## Evidence trail

Seven earlier separately frozen attempts are preserved privately under
`~/Documents/Codex/2026-09-22/executable-constructions-study-r*` (r1 was the
[stopped run](../2026-09-22-stopped/README.md); r2–r8 stopped on transient
provider failures or probe timeouts with 31 responses total — partial runs, not
the comparison). This r9 plan froze at `2026-09-23T04:44:26Z` against the
post-#9 tree and ran 04:44–05:28 UTC without a stop. Repository fixes that
unblocked the route during attempts: #8 (village expr-bounds) and #9 (metadata
probe timeout 30s→120s).
