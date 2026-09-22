# Executable construction experiment

## Overview

Implement and run the next experiment proposed in the
[SWE-2 ceiling report](../../benchmarks/design-decisions-swe2/results/2026-09-22-study/README.md).
Models select a closed construction artifact. A trusted deterministic compiler
turns its persistence and commit operators into executable JavaScript. An
independent host measures behavior and resource use against all admissible
constructions. Four contexts make the value of choices change.

## Constraints

- Preserve all earlier frozen inputs and evidence. New files live under
  `benchmarks/executable-constructions/` and new runner/test scripts.
- One durable counter-service family; ten constructions from journal/snapshot
  persistence and immediate/bounded-batch commit. Indexing is deferred.
- Four public contexts, three arms (`direct`, `checklist`, `pattern`), three
  repetitions: 36 single-shot construction requests. No model pilots, code
  generation stage, retries, repairs, evaluation feedback or paid fallback.
- Use the existing qualified XCB/SWE-2 High route. Recheck exact identity,
  account binding and Free catalog before each admission. Actual billing is
  unreported. The user's continuation authorizes this bounded free-route study.
- Task/evaluator author does not read guidance. Guidance author uses public
  contract/operator/context files, never evaluator, oracle, optimum tables or
  hidden trace instances until task and guidance freezes are recorded.
- Share one branch with disjoint file ownership. Root owns integration, common
  documentation, final gates and delivery; workers own focused tests.
- Required delivery: independent review, `bash scripts/verify.sh` on an isolated
  exact-tree snapshot, checked PR, exact-head merge and post-merge checks.
- Managed repository baseline is current. No host scheduler is installed; do
  not install or reconfigure global tooling for this task.

## Phases

| Phase | Deliverable | Depends on | Parallel with |
|---|---|---|---|
| 1 | Public contract and deterministic compiler | None | 3 foundation |
| 2 | Independent host, fault oracle, contexts and finite-space evidence | 1 contract | 3 |
| 3 | Frozen-study runner and provenance validation | Public file contract | 1, 2 |
| 4 | Matched construction guidance, scoring and reviewed freeze | 1, 2, 3 | None |
| 5 | Bounded live study, interpretation and delivered replay | 4 | Independent reviews |

## Phase 1: Public contract and compiler

- **Status:** Done
- **Depends on:** none.
- **Objective:** Closed inert artifacts compile into distinct executable
  persistence and commit operators without executing model-authored source.
- **Scope:** `benchmarks/executable-constructions/contract.md`, `artifact.md`,
  `operators.md`, `compiler.mjs`, `test-compiler.mjs`.
- **Out of scope:** Context objectives, oracle/evaluator, guidance, provider calls,
  previous experiments, repository-wide gate.
- **Approach:** Strict schema `pattern-language.construct.v1`; append-journal or
  replace-snapshot; commit each or bounded-batch with maxItems 2/4 and maxTicks
  1/3. Generated module exports `create(host)` returning submit/read/tick.
  Use actual host storage/reply operations; no ambient effects. Public contract
  is authoritative for exact APIs and fault/continuation semantics.
- **Acceptance criteria:** All ten artifacts compile; unknown fields and values
  reject; deterministic bytes; no arbitrary source interpolation; different
  operators change emitted implementation; pending duplicates, durable replay
  and deadline flush have focused behavioral checks.
- **Validation:** `node benchmarks/executable-constructions/test-compiler.mjs`.

## Phase 2: Independent verification and contexts

- **Status:** Done
- **Depends on:** Phase 1 public contract.
- **Objective:** Establish independently checked safety, bounded progress and
  observable resource tradeoffs for the complete ten-design space.
- **Scope:** `benchmarks/executable-constructions/{host,oracle,evaluate,space,self-test}.mjs`,
  `contexts/`, `fixtures/`, `task-freeze.json`.
- **Out of scope:** Compiler source edits, guidance reads, provider calls.
- **Approach:** Host controls durable UTF-8 records, crashes, clock and replies.
  Oracle derives allowed committed effects from invocation/reply/read history,
  independently of compiler helpers and storage encoding. Check a stated finite
  crash space plus a bounded fair drain. Measure physical simulated operations;
  do not assign costs by architecture label. Four public evaluation contexts and
  two development-only contexts; no model pilots. Freeze exact evidence before
  guidance finalization.
- **Acceptance criteria:** Correctness and resource selection remain separate;
  targeted faulty operators fail; fault bounds/coverage are explicit; budgets
  and objectives are public; every evaluation context has multiple feasible
  choices and reversal pairs change the optimum. Tied optima are admitted.
- **Validation:** `node benchmarks/executable-constructions/self-test.mjs`;
  finite-space report generated and independently reviewed.

## Phase 3: Single-shot study runner

- **Status:** Done
- **Depends on:** Stable public file paths and four context identifiers.
- **Objective:** Collect 36 exact inert responses with reproducible provenance.
- **Scope:** `scripts/run-construction-study.py`,
  `scripts/test_construction_runner.py`.
- **Out of scope:** Edits to old frozen provider helpers, artifact evaluation,
  compiler/context/guidance changes, live calls.
- **Approach:** Reuse unchanged provider admission/custody helpers from the
  frozen SWE runner; define new plan/run schemas and pure validators. Freeze
  transitive helper bytes and all new benchmark files except README/results.
  Preserve raw responses, including malformed JSON, until generation ends.
- **Acceptance criteria:** Fixed 36-slot schedule and denominators; complete
  input/hash/identity/qualification/prompt validation; account-bound Free gate;
  serial requests; exact closed envelopes; safe cancellation; no resumption,
  duplicates or fallback; partial outcomes remain reportable.
- **Validation:** `python3 scripts/test_construction_runner.py`.

## Phase 4: Guidance, scoring and freeze

- **Status:** Done
- **Depends on:** Phases 1–3.
- **Objective:** Freeze a fair, reviewable construction-selection comparison.
- **Scope:** New benchmark `guidance/`, `protocol.md`, `score.mjs`,
  `test-score.mjs`, `README.md`, prepared evidence; root gate integration.
- **Approach:** All arms receive identical operator facts, dependencies,
  objectives and grammar. Pattern procedure builds a partial design through
  context/force selection and linked constructions; checklist selects a whole
  candidate using flat requirement coverage. Score actual compiled behavior,
  feasibility, objective-optimality, regret and dominance. No prose points.
- **Acceptance criteria:** Independent methodology/provenance review; complete
  task-before-guidance-before-generation chronology; no preferred-architecture
  oracle; outcomes retain every planned attempt; earlier studies replay unchanged.
- **Validation:** Focused scorer tests and repository full gate before live use.

## Phase 5: Live evidence and delivery

- **Status:** Done — stopped run preserved; live comparison blocked at provider
- **Depends on:** Phase 4.
- **Objective:** Complete the bounded study and publish reproducible results and
  appropriately limited conclusions.
- **Scope:** New benchmark results/README, root documentation, replay gate.
- **Approach:** Freeze and hash the exact plan before generation. Collect all
  responses before candidate compilation/evaluation. Validate inert artifacts,
  compile mechanically, score once, retain all failures and cost uncertainty.
  Independently review outcomes/privacy and deliver through checked PRs.
- **Acceptance criteria:** All admitted requests accounted for; no evaluator or
  private transcript sent; outcomes and resource vectors replay; source/frozen
  evidence stays unchanged; report ceiling/floor and single-family limitations.
- **Validation:** Exact bundle replay; independent review; full repository gate;
  PR and exact-merge checks; final clean task-owned delivery state recorded.

## Implementation log

- 2026-09-22: Started from clean main `625f4f1`. Inspected the prior ceiling,
  provider admission helpers and repository policy. Managed baseline is current;
  no scheduler is installed. Independent design/method reviews recommend ten
  executable constructions, four contexts and 36 single-shot free-route requests.
- Compiler worker: 41 focused checks pass across the ten constructions.
- Runner worker and independent reviewer: 17 offline tests pass. The reviewer
  found and the owner repaired acceptance of numeric `1` as boolean account
  binding evidence; the exact forgery now rejects. Existing frozen helpers were
  preserved. No provider requests have run.
- Task author and independent reviewer: 86 instrument checks pass and all 15
  deliberately faulty implementations are detected. Review repaired duplicate
  reply timing, exact batch triggers and a fault-window coverage gap before the
  task freeze. Resource workloads and context objectives were preserved.
- Root reviewed scorer provenance, fixed denominators, source-hash binding and
  replay; its 18 synthetic checks pass. Transport worker reviewed the guidance
  from public inputs only and found no extra technical facts or capabilities.
- CLI review: eight checks pass, including live execution, recovery/idempotency,
  invalid-input rejection and refusal to overwrite an existing output file.
- Guidance was frozen at `2026-09-22T20:35:18Z` before the guidance author read
  evaluator source or optimum tables. Initial task receipt:
  `cdc42fe5a63a359eeaaa6fdac52a89a084d3a98a0c6129e879d997812885fecc`;
  initial guidance receipt:
  `92b937e2a2752d600736cd07841d45e83a29a9a65360a3bd6093dfb3a9c59489`.
- Final integration found that the standalone evaluate CLI used ordinary JSON
  decoding while the study scorer and compiler rejected duplicate keys. The
  reviewer corrected CLI admission and added a regression before generation.
  Instrument evidence, generated source, public inputs, objectives and all three
  guidance files remained byte-identical. Instrument checks now total 87.
  Receipts were refreshed at `2026-09-22T20:41:31Z`: task
  `78f1f6c13d8a83dbb09f7d51d8488c0020ab88277b087d75f3317d1710a76707`,
  guidance `165da90de40f41fa912907d1b98d38095f128684b0264cd9f3e066b2ffc4b4e9`.
- A synthetic-only end-to-end run exercised all ten real constructions across
  36 fake responses and passed exact API and CLI replay. It is orchestration
  validation, not live study evidence. No provider processes were launched.
- Full repository gate passed on exact tree
  `668eb1d6e203432bbdeb970bdefb5472886a6d7d` in an isolated source snapshot,
  using ALGAL `f899456e497656eb292d97d7c0aef5e06f1437dc`. The implementation
  was committed as `efb428d` before generation. The 32-file study plan was
  prepared at `2026-09-22T20:42:31Z`, SHA-256
  `83b7be3ceb8e446c07b9338d3bd83db55d9dc3040f746442110ac4a75698a81f`.
- The first live admission failed during Devin session configuration with
  `provider_error`; joined cleanup and no effects were confirmed. No prompt
  reached `session/prompt`, no response was returned and the remaining 35 slots
  were not admitted. The frozen protocol stopped without retry or replacement.
- Independent partial-run scoring and replay preserved all 36 slots, unknown
  admitted cost and three planned attempts per context/arm. Independent report
  review verified the resource table, fault counts and the absence of comparative
  design evidence. Source and all 32 frozen files remain unchanged.
- Supported metadata-only refresh also failed at Devin `session/new` (RPC
  `-32603`); it sent no generation prompt. A subsequent local capability read
  showed the account idle. No unsupported fallback, blind retry or XCB source
  change was made. Further comparison requires restored provider availability
  and a separate frozen run; this failure is retained rather than replaced.
- Independent publication audit matched every public JSON byte to the private
  audited bundle and found no credentials, private transcript or raw provider
  metadata. Only task-owned implementation, evidence and documentation are
  included in delivery.
