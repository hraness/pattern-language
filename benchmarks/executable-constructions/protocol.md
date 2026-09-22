# Prospective executable-construction study

## Question

Does a context-sensitive, linked construction procedure help select useful
executable designs under changing resource priorities? This follows the
[previous ceiling result](../design-decisions-swe2/results/2026-09-22-study/README.md)
without changing its inputs or outcomes.

Alexander distinguished a pattern-writing format from a language that generates
coherent wholes in his [OOPSLA address](https://www.patternlanguage.com/archive/ieee.html).
His team's [account of sequences](https://www.patternlanguage.com/patterns/justsostory.html)
also emphasizes the order in which a design develops. This study operationalizes
a small part of those ideas: contextual choice, linked constructions and their
executable consequences. It does not measure human experience, moral value or
Alexander's broader account of living structure.

## Construction space and comparison

One durable counter-service family has ten permitted constructions. Each selects
append-journal or replace-snapshot persistence and immediate commit or a bounded
batch with one of four size/deadline combinations. The compiler emits executable
JavaScript from closed inert JSON. No model-authored JavaScript is executed.
The same parser, compiler, operators, dependency facts and host apply to all arms.

There are four evaluation contexts: `write_pressure`, `recovery_pressure`,
`latency_pressure`, and `commit_pressure`. Two paired contrasts change the useful
tradeoff. The public contexts contain the workload facts, resource definitions,
budgets and objective weights. Before generation, the complete construction
space must contain multiple feasible designs in each context and exhibit the
declared optimum reversals. Every tied optimum is accepted; no architecture name
is an answer key. Development-only contexts validate the instrument without
model pilots.

- **Direct:** satisfy the public contract and objective using the common
  construction language.
- **Checklist:** select a complete construction using flat requirement coverage,
  then materialize it with the same operators and dependency facts.
- **Pattern:** inspect the current partial design's context and competing forces,
  apply a fitting construction, follow its prerequisite/enabling links, and
  reconsider the resulting context before the next construction.

This is a comparison of procedural packages. It does not isolate pattern names,
heading style or a uniquely Alexander-specific mechanism. No arm receives extra
technical facts, compiler features, verifier access, examples, feedback or calls.
Guidance length and organization differ; record prompt lengths rather than
claiming a token-matched comparison. Any advantage would need a later ablation
to separate linked construction from extra procedural scaffolding.
The common artifact records executable choices, not private reasoning. Prose,
pattern vocabulary and claims to have followed a procedure earn no points.

Four contexts × three arms × three repetitions give **36 single-shot requests**.
There is no second code-generation stage. Repetition blocks rotate context and
arm ordering; they are not shared random seeds. The task family, finite operator
space and contexts are deliberately selected, not a representative task sample.

## Independent verification and resource accounting

The trusted compiler changes executable persistence and commit behavior. The
host owns durable records, logical time, crash sites and delivered replies. An
independent observation oracle checks permitted committed effects from public
invocations, replies and reads; it must not import compiler helpers or decode
the compiler's storage representation to decide application correctness.

State the exact finite fault space in the contract/evaluator evidence. A crash
prefix is followed by a declared fair, fault-free retry/drain tail with a fixed
bound. Exhaustive coverage applies only to that stated finite space. Targeted
faulty implementations must demonstrate sensitivity to missing durability,
duplicate effects, broken recovery and failure to make progress.
Separate host-observed conformance probes check exact capacity and deadline
triggers, including four-command capacity and immediate replies to committed
duplicates. These fault-free probes do not extend the exhaustive crash claim
to four-command histories.

Resource measurements come from host-observed writes, UTF-8 bytes, retained
durable records, recovery reads and acknowledgement delay in logical ticks.
They are modeled service costs, not real disk performance or wall-clock latency.
Resource workloads are fixed across constructions and separate from fault
enumeration: a design with more crash sites must not receive extra weight in its
resource score. Each context fixes its aggregation, budgets and positive-cost
objective before generation.

Enumerate every admitted construction through the same host. Independently check
application behavior and measurement accounting; retain each measured vector,
feasible set, Pareto set and objective-optimal set. This validates selection
against the complete declared space, not a preferred reference architecture or
an assertion by the generated artifact. Correctness that follows from the
trusted operators is a property of this restricted language, not evidence that
the model independently wrote a correct protocol.

## Outcomes

Keep **three planned attempts per context and arm**, including missing, invalid,
failed or unadmitted attempts. Report separately:

1. Generation completion and valid executable artifacts.
2. Application safety and bounded progress on the stated verification space.
3. Feasibility: correctness plus every public resource budget.
4. Objective-optimality: a feasible construction attaining the minimum cost,
   including every tie.
5. Resource vectors, cost, regret and dominance for feasible constructions.

Primary comparison is objective-optimal constructions per planned denominator,
shown alongside feasibility and correctness. For feasible constructions,
objective regret is candidate cost minus the best feasible cost. A fixed
efficiency measure is best feasible cost divided by candidate cost; unsuccessful
or infeasible attempts receive zero. Preserve raw costs and counts so a high
average among successful survivors cannot hide failures. The bounded positive
objectives make the ratio defined. Report context pairs and selection changes;
do not treat fault schedules, trace events or resource operations as independent
experimental repetitions.

## Freeze and information boundary

1. Independent task authors finish the public contract, operators, compiler,
   four evaluation contexts, development contexts, host/oracle, finite-space
   accounting and fault-sensitivity checks. Record exact hashes and a task
   freeze. Task authors know the research goal; this is not fully blind research.
2. The guidance author may read public contract/artifact/operator/context files,
   but not evaluator code, optimum tables or withheld trace instances. After the
   task freeze, finalize all three arms and record the public inputs and guidance
   hashes in a separate guidance freeze.
3. Freeze the full study closure, provider settings, exact prompt construction,
   36-job schedule, runner, scorer and tests in a new plan before generation.
4. Finish all generation before parsing or compiling candidate artifacts for
   correctness/resource evaluation. Preserve raw response text and hashes.
5. Validate the entire frozen closure and every provider receipt before parsing
   any artifact. The strict parser admits only the closed grammar. Compilation
   is mechanical; no semantic repair, replacement, feedback or retries.

Only public contract, artifact grammar, operator facts, the assigned public
context and guidance are sent to the model. Evaluators, optimal designs,
reference/fault fixtures, raw provider metadata and the private Devin transcript
stay out of generator prompts. Withheld executions instantiate public contracts;
they are not unseen design tasks or evidence of cross-domain transfer.

No task, objective, compiler, guidance or outcome change may follow observation
of live candidate performance. Retain defects and coverage gaps separately from
the frozen result. Any correction needs explicitly versioned evidence.

## Provider admission

Use the existing qualified XCB application route and exact `devin/swe-2-high`
model. Requests are tool-free, ephemeral and serial. Before each admission verify
the pinned XCB, Devin and Node identities, unexpired exact-runtime/account/model
qualification, idle account and fresh native `swe-2-high` **Free** catalog tier.
Bind the catalog to the imported account by local credential equality without
publishing credentials or their fingerprints. Reuse the existing reviewed
provider/custody helpers without altering previous frozen studies.

The request bounds remain 120 seconds and 262144 output bytes, with the complete
JSON request within 1 MiB. XCB supplies fixed application instructions as a
prefix in one ACP text block, not a separate system-role message. It supplies no
token usage, billed cost, immutable model revision or monetary cap. Record
admitted cost as unknown, never infer a zero invoice from a Free offering. Equal
time/output limits do not establish equal computation.

No paid fallback, model substitution, tools, hooks, plugins, judge, history or
continuation. Provider/protocol failure, identity or eligibility drift, deadline,
output limit or uncertain cleanup stops subsequent admission. Preserve the
partial run with all planned denominators; do not resume or replace attempts.
The outer watchdog and cancellation behavior remain those of the reviewed SWE
runner: 180 seconds, SIGTERM only to the XCB root, then 60 seconds to join. Never
delete custody state, SIGKILL the provider group or weaken qualification.

## Prespecified interpretation

- Better objective selection with equal correctness is local evidence that this
  procedure uses the restricted construction space more effectively.
- Better correctness without better resource selection supports admission or
  constraint handling, not selection of better architectures.
- A tie supplies no observed procedural advantage. Three repetitions do not
  establish equivalence.
- A ceiling validates this instrument and chosen constructions; a floor calls
  for separate diagnosis. Neither licenses changing the frozen score.
- Context-dependent gains or regressions must remain separate; do not average
  away a failed context adaptation.

This remains one service family, ten prebuilt constructions, four hand-selected
contexts and one opaque model route. It is bounded construction selection, not
open architecture synthesis, proof of an internal thought process, or a test of
planning versus code-only generation. Any broader claim needs new domains and
prospectively frozen tasks.
