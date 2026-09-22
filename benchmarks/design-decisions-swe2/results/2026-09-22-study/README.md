# SWE-2 design-decision results — 2026-09-22

**Every arm reached the ceiling. No pattern advantage was observed.** All 18
design/code pairs passed every frozen outcome: schema validity, model adequacy,
behavior, observed design/code agreement and joint success. This demonstrates a
working inspectable-design evaluation pipeline on these tasks. It does not
establish that pattern guidance improves software, that the treatments are
equivalent, or that the declared design caused the implementation.

All **36** planned requests completed through qualified XCB application inference
using the existing Devin account and exact model `devin/swe-2-high`. The native
account catalog listed this model **Free before every request**. XCB exposes no
billed cost or token usage, so actual spending is **unreported**, not a measured
$0. No Claude requests, paid fallback, replacement attempts or runner retries
were used for this study.

## Frozen outcomes

Every count is out of **three planned pairs**. Joint success requires both
generation requests to succeed and all four separate outcomes to pass.

| Family | Guidance | Schema | Adequate | Behavior | Agreement | Joint |
|---|---|---:|---:|---:|---:|---:|
| Durable jobs | Direct | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Durable jobs | Checklist | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Durable jobs | Pattern | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Pure batch | Direct | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Pure batch | Checklist | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Pure batch | Pattern | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |

The evaluator recorded 342 passing case executions: nine cases for each of nine
job implementations and 29 cases for each of nine batch implementations. Cases
and trace events are not independent experimental repetitions. There were no
pattern/checklist disagreements in the prespecified paired comparisons.

Every design selected FIFO. The other declared choices were fixed by the public
contracts: durable-store ownership, publication after commit and requeue/fencing
for jobs; synchronous execution with no persistence or scheduling for batch.
The batch implementations passed the observable omission checks. This does not
prove absence of every unnecessary internal abstraction.

## What the ceiling means for the original vision

The schema and host observations make design commitments inspectable and catch
targeted faults in the reference/mutant validation. The live candidates also
show that all three procedures can satisfy this interface. The experiment offers
no reason to adopt the pattern prompt over direct instructions or the matched
checklist.

These contracts substantially prescribe the architecture. FIFO/LIFO is the main
free observable choice, and the study has no objective that makes either better.
Consequently, this is stronger evidence about contract modeling and consistency
than about discovering a useful architecture. All arms have a design stage; its
benefit over code-only generation is unmeasured. The changed provider and tasks
also prevent a causal comparison with the earlier Haiku lifecycle results.
Finite simulator checks do not establish production durability, all possible
executions, or correctness beyond the tested public-contract cases.
The jobs suite uses nine hand-authored histories, not exhaustive fault schedules;
atomic commit-before-reply is provided by the host. Batch uses 29 finite cases,
and ambient execution safety relies on source review rather than a security
sandbox. The five outcomes are related, with joint success derived from the
other checks; they are not five independent confirmations of usefulness.

The next useful experiment should make a pattern **construct a design with
meaningful alternatives**. A bounded protocol language could choose log versus
snapshot, immediate versus bounded-batch commit, and scan versus index. Compile
the design into executable code, then check safety and progress under enumerated
fault schedules. Among correct designs, measure host-observed writes, retained
state and response latency. Use contexts where the useful tradeoff changes and
multiple designs remain correct.

Compare context/force conditions and linked construction rules with a flat
procedure using the same facts, operators, compiler, feedback and budgets.
Independently enumerate valid/Pareto designs instead of using one preferred
architecture as the oracle. Freeze fresh tasks and holdouts before guidance.
This is a proposed next experiment, not an implemented system.
Repeating this ceiling task or expanding the prose catalog
would not resolve the missing design freedom.

## Provenance and execution

The plan was frozen privately at **19:23:45 UTC**, before generation at
**19:24:17–19:49:31 UTC**. All 18 design requests finished before any code request.
Each code request received only its own exact, unedited design response with the
public inputs. All generation ended before static review and evaluation. Three
independent source reviews covered every implementation before execution.
Evaluators, reference code and the private Devin transcript were excluded from
generator prompts. The full 50-file SWE closure and the original 44-file Claude
closure remain unchanged; the original Claude plan is still unrun.

The route used XCB 0.4.0 and Devin 3000.11.1. Its installed XCB SHA-256 was
`91bc44e9e68d349b86c44d8ad6ea3d17b9c2780c7af2f99ef9ffa9c8ce0f5298`.
Local qualification required three separate fixed setup challenges: two failed
with completed cleanup before the compatibility repair, and the third passed
after fresh native boundary checks. They are not experimental attempts. XCB
[PR #106](https://github.com/hraness/xcb/pull/106) added bounded diagnostics;
[PR #107](https://github.com/hraness/xcb/pull/107) corrected ACP extension handling
and removed MCP instructions from tool-free prompts. These changes did not
bypass qualification or give the generator tool authority.

The fixed host instructions are a prefix in one ACP text block, not a separate
system-role message. The exact account, executable hashes, qualification digest,
request limits and per-request Free eligibility receipts are in the plan/run.
Provider-internal retries, sampling seeds, immutable model revision and actual
compute are not observed. Equal time/output bounds do not imply equal compute.
Three repetitions per cell cannot establish equivalence or general usefulness.

## Evidence and replay

- [plan.json](plan.json): exact frozen inputs, schedule and provider amendment.
- [run.json](run.json): exact prompts, raw responses, normalized sources and
  sanitized route receipts. Its end-of-generation status is intentionally retained.
- [reviewed.json](reviewed.json): the 18 exact source hashes reviewed before execution.
- [evaluation.json](evaluation.json): all separate outcomes and observations.
- [Prospective provider protocol](../../protocol.md): admission and interpretation
  rules fixed before generation.

The four JSON artifacts are byte-identical to their private originals. Raw
provider metadata, native qualification/custody evidence, credentials and the
private transcript remain local. No diagnostic redaction was needed in this
all-passing evaluation.

```sh
study=benchmarks/design-decisions-swe2/results/2026-09-22-study
node benchmarks/design-decisions-swe2/score.mjs "$study/plan.json" "$study/run.json" \
  "$study/reviewed.json" --replay "$study/evaluation.json"
```

The repository gate replays every recorded outcome without provider calls.
Plan SHA-256: `255099de5f6aa75ad57795ac89c339c747c0ac5966c904c4b493fd6418e22f31`.
