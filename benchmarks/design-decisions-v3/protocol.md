# Prospective design-decision study protocol

Status: preparation only. Freeze this protocol with the complete study inputs
before generation. No v3 live calls are authorized by the earlier smoke or v2
approvals. The prepared study requires a separate authorization for **36
tool-free requests, with $0.50 configured per-call caps ($18 total)**.

## Question and comparison

Does a context-sensitive construction procedure help a model produce useful,
inspectable design decisions and code that satisfies those decisions and the
public contract? This follows the negative v2 guidance result; it does not alter
that result or repair its frozen candidates.

There are two independently authored task families:

- A bounded durable-job simulator with duplicate submissions, crashes/restarts
  and stale completions. Its public contract defines the storage and effect
  boundary; it does not assume atomic arbitrary external effects.
- A synchronous pure batch planner. It provides a separate context in which
  persistence, background scheduling and callback machinery are unnecessary.

Each family has three arms and three repetitions. Every attempt consists of a
**design request followed by a code request receiving its own exact design
text**: 2 families × 3 arms × 3 repetitions × 2 requests = **36 requests and 18
design/code pairs**. These stages measure design and implementation, not
adaptation or intrinsic maintainability. Repetitions form schedule blocks, not
shared random seeds.

All arms receive the same public contract, technical fact sheet, machine-readable
artifact schema and vocabulary. They have the same design/code opportunities,
configured caps, tool restrictions and feedback policy.

- **Direct:** use the public requirements, facts and schema to design and
  implement the solution.
- **Checklist:** cover the same facts and available choices through a flat
  requirement-coverage procedure.
- **Pattern:** identify applicable contexts and competing forces, choose or omit
  constructions, record their dependencies, and derive the design artifact.

The contrast is a procedural package, not a controlled isolation of headings,
pattern names or an Alexander-specific mechanism. Word counts and actual token
usage can differ; equal configured ceilings do not establish equal compute.
There is no credit for rationale prose, pattern vocabulary or resemblance to a
preferred architecture.

## Freeze and information boundary

Freeze in this order, preserving exact bytes and hashes:

1. Independent task authors finish the public contracts and model vocabulary,
   reference implementations, behavioral evaluators, host observation rules,
   model-adequacy checks and deliberate fault cases. They validate these locally
   and record their task-input freeze before guidance is finalized.
2. The guidance author uses the public contracts, shared schema and technical
   facts to prepare the three arms. The guidance author must not inspect the new
   evaluator or reference implementation before freezing guidance. Task authors
   know the research objective; this is not fully blind or random task selection.
3. Archive the full protocol, exact prompts, schedule, shared inputs, guidance,
   task freezes, runner, scorer and their validation inputs in the prospective
   study plan. Verify every hash before live admission and before evaluation.
4. Obtain the separate bounded live authorization. Finish all design generation,
   then all code generation, before any candidate behavioral or conformance
   evaluation. Static source safety review precedes executing generated code.

Generator prompts never contain evaluators, reference implementations, hidden
cases, scoring feedback, another attempt's artifacts or the private Devin
transcript. Evaluators are withheld, not secret requirements: their assertions
must follow the public contract and schema. Infrastructure review after guidance
freezes does not license modifying that frozen guidance. A correction to a
frozen input requires a new identified plan, never a silent change during a run.

Do not tune tasks, guidance, artifact requirements or scores after observing
candidate outcomes. Reference and deliberate-fault checks establish evaluator
operation and sensitivity; they do not establish the model's expected difficulty
or eliminate floor, ceiling and test-coverage risks.

## Generation and admission

The requested model is `claude-haiku-4-5`, through the existing Claude
CLI/account. Each request uses safe mode, an explicit system prompt, no tools,
no MCP servers, no slash commands, no persistent session and a configured $0.50
cap. The full plan records the timeout, concurrency bound and exact invocation
settings. CLI budget flags are not an independently verified provider billing
guarantee. The total request limit remains 36 even if reported spending is below
$18; unused dollars do not authorize extra attempts.

Record exact prompts and returned text, normalized code, source hashes, CLI
version, requested and reported model/provider identity, usage, reported cost,
admission/completion order and errors. A reproducible sampling seed, immutable
model revision and enforced input/output token caps are unavailable; do not claim
them. Rotate family and arm ordering across the fixed repetition schedule. Bound
concurrency and reserve a complete window before dispatch. Concurrent completion
order remains uncontrolled.

The code request receives the exact available design response, including
malformed JSON or an invalid artifact. Do not repair, reformat or replace that
text, and do not give the model schema-validation feedback. Invalid designs
remain eligible for code generation so behavioral measurement is not restricted
to successful planning. Only absent design text or a safety/provider stop can
prevent the dependent code request; the attempt remains in every applicable
planned denominator. Preserve the original response separately from parsed
artifacts. Code normalization may remove outer Markdown fences, normalize
surrounding whitespace and add a final newline; it must not repair semantics.

Missing, malformed, refused or timed-out output is retained as such. There are
no replacement attempts, retries by the runner, resumption or outcome-based
stopping. Internal CLI transport retries are not independently audited or
controlled; the request limit counts CLI generation invocations. Unknown cost,
unexpected model/provider identity or tools, and authorization/resource failures
stop further admission. Already admitted requests are collected. A partial run
is reported as partial, never as a completed comparison. Continuing requires a
separately recorded plan and authority.

## Outcomes

For each family and arm, retain the fixed denominator of **three planned pairs**
and report these distinct outcomes:

1. **Schema validity:** the design response parses and satisfies the public
   artifact schema.
2. **Model adequacy:** the declaration passes the frozen, contract-consistent
   checks for meaningful commitments, necessary distinctions and prohibited
   transitions. A permissive declaration accepting every event or transition
   must not earn a conformance success merely by including observed behavior.
3. **Behavioral correctness:** generated code passes every frozen public-contract
   check, independently of whether its design artifact is valid.
4. **Observed conformance:** host-observed execution agrees with the adequate
   declared model and its machine-checkable choices on the tested executions.
5. **Joint success:** both requests completed with successful generation status,
   and valid/adequate design, correct behavior and observed conformance all hold
   for the same pair. Refused or truncated design output cannot earn joint
   success even if its retained raw text happens to parse as a valid artifact;
   schema/adequacy and subsequent code behavior are still measured separately.

Primary comparison is joint success per family and arm. Report behavioral
success separately so artifact requirements cannot conceal working code or make
a documentation failure appear to be a runtime defect. With unusable or missing
design, adequacy/conformance are unavailable or unsuccessful as specified by the
scorer, and joint success is unsuccessful; do not drop the pair. Missing code
likewise remains a failure in the behavioral and joint denominators.

Trace observations come from host-controlled operation inputs, storage snapshots,
effects and receipts as applicable, not candidate-supplied trace labels. Test
declarations against required exclusions as well as observed transitions.
Machine-checked choices should express observable commitments or meaningful
omissions. If the contract admits only one choice, agreement establishes a
restatement of that requirement, not evidence of useful alternative selection.
Observational agreement does not prove that code was derived from the artifact,
that the model followed the proposed process, or that its private reasoning
matched the explanation.

Report paired pattern/checklist successes and disagreements within each schedule
block. Cases and trace events are diagnostic observations, not independent
statistical trials. Keep the two families separate; do not pool many trace checks
into a larger apparent sample. Cost, usage, artifact size, code size and observed
omission decisions are descriptive. Do not award subjective design/style scores.

## Prespecified interpretation

- **Pattern/checklist tie:** no observed benefit of this procedure over the
  matched checklist. Three repetitions do not establish equivalence.
- **Better conformance without better behavior:** improved consistency of an
  inspectable artifact is useful evidence about that interface, not evidence of
  better software outcomes.
- **Behavioral improvement with weak conformance:** a behavioral observation,
  without support that the declared decisions explain the improvement.
- **Joint improvement on both families:** promising exploratory evidence for
  this package, requiring fresh prospective tasks and more repetitions before
  general claims or default adoption.
- **Durable-job improvement but pure-task regression or needless effects:** an
  applicability problem, not unqualified transfer success.
- **Universal failure or success:** a floor or ceiling result. Retain it and
  design a future task prospectively; do not invent a retrospective score or
  repair the current artifacts.
- **Coverage gap or evaluator defect:** record it separately from the frozen
  result. Any corrected evaluation must be explicitly versioned and cannot
  replace the original evidence without explanation.

This study concerns one model, two selected JavaScript tasks and three attempts
per condition. Host traces cover finite tested schedules and observations, not
all executions or hidden internal state. A bounded simulator does not establish
production durability, distributed-system safety or arbitrary external-effect
atomicity. Purity checks can detect unnecessary observable machinery but cannot
prove the absence of every unnecessary internal abstraction. Mechanical checks
do not establish human experience, aesthetics or completeness of the chosen
requirements. No result alone validates or falsifies Alexander's broader thesis.
The canonical task states and required transitions substantially constrain the
artifact; ordering is the principal free observable policy choice. This tests
contract modeling and consistency more directly than open architecture discovery.
All arms have a design stage, so this experiment does not estimate that stage's
benefit against code-only generation.
