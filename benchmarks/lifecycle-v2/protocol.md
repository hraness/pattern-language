# Prospective lifecycle study protocol

Status: prospective specification, frozen before any v2 generation. Results belong
in a separate dated evidence bundle; do not edit this protocol in response to them.
The guidance revision used the previous mapper failures. Transfer task authors knew
the research objective and independently wrote retry and atomic contracts. The
guidance author received their API descriptions before freezing guidance but had
not inspected their evaluator/reference details. This is not fully blind selection.
The comparison tests framing/organization with matched technical advice, not an
isolated effect of headings or pattern names.

- Three arms: ordinary direct instructions, matched checklist, pattern sequence.
- Three repetitions per arm per family, with base and change stages: **54
  generation calls**. Every artifact is a separate tool-free request. A change
  request receives its own base source plus the same assigned guidance and
  contracts. No other arm's source, tests, reference or evaluation is supplied.
- All base generation finishes before change generation; all generation ends
  before candidate evaluation. Prior-source availability determines whether a
  change can run, never prior test performance. No repair loop or replacement
  attempt is allowed.
- A fixed schedule rotates family and arm ordering across repetitions. At most
  three calls are in flight. Each window is reserved before dispatch. Order and
  admission times are recorded; concurrent completion order is uncontrolled.
- Model requested: `claude-haiku-4-5` through the existing Claude CLI/account.
  Each request uses safe mode, an explicit system prompt, no tools, no MCP
  servers, no slash commands or persistent session, a 240-second timeout and
  a configured $0.50 cap. Summed configured caps are **$27**. CLI budget flags
  are not an independently verified provider billing guarantee.
- Record actual provider/model identity, CLI version, usage, reported cost,
  exact prompts and exact returned source. A reproducible sampling seed,
  immutable model revision and enforced input/output token caps are unavailable;
  do not claim them. Word counts are 279 direct, 291 checklist and 296 pattern;
  neither words nor tokens are exactly matched.
- Missing, malformed, refused or timed-out generation remains an unsuccessful
  artifact. Missing base code prevents its change call, which remains a failure
  in the planned denominator. The runner performs no retries, resumption or
  outcome-based stopping; internal CLI transport retries are not audited or
  independently controlled. The limit counts CLI generation invocations.
- Unknown cost, unexpected model identity or tools, and authorization/resource
  failures stop further admission. Already admitted calls are collected. A
  partial run is reported as partial and is never presented as a completed
  comparison. Continuing it requires a separately recorded plan and authority.

Preparation archives the protocol, full schedule, exact source texts and hashes
of generation and evaluation inputs before any call. The plan includes the
legacy mapper dependencies, not just its import wrappers. The evaluator is
withheld from generator prompts. Private Devin material is never an input.
The original result text is retained. For a source artifact, outer Markdown
fences may be removed, surrounding whitespace is normalized and a final newline
is added. Syntax checking parses without execution. No semantic repair occurs.
The change prompt receives that recorded source, even when it would fail tests.

## Outcomes and interpretation

For **each family and arm**, report base all-pass, changed all-pass including
base regressions, and both-stage all-pass, each out of three planned attempts.
Also report the paired pattern/checklist disagreements for each repetition.
These pairings are schedule blocks, not shared random seeds. Test cases are
diagnostics, not independent statistical trials. Keep mapper development
results separate from retry and atomic transfer results.

The acceptance criteria are observable behavior, exact failure identity,
resource/admission bounds, preserved state, isolation and cleanup. No points
are awarded for pattern vocabulary, architecture resemblance or the evaluator
author's preferred structure. Adaptation success measures the outcome of a
second generation, not intrinsic maintainability. Cost and source size are
descriptive; there is no subjective style score.
Only code is requested, so these outcomes cannot establish whether the generator
actually followed the proposed sequence or explain its internal reasoning.

Prespecified decisions:

- **Checklist/pattern tie:** no observed pattern-specific advantage; retain the
  simpler usable guidance and investigate the mechanism before expanding a catalog.
- **Mapper-only gain:** useful tuned correction, not fresh transfer evidence.
- **Gain on both transfer families:** promising exploratory evidence, requiring
  prospective tasks and more repetitions before a general utility claim.
- **Universal success:** a ceiling result; choose a new task prospectively,
  without inventing a retrospective score that favors patterns.
- **Loss or extra failures:** retain them and revise the applicability or
  construction rule in a new version. Do not patch frozen artifacts.

Even a positive result here concerns one model and three selected small
JavaScript contracts. The next system-design experiment would need an executable
model, explicit fault assumptions and invariants (for example, bounded queues
and duplicate delivery). Mechanical verification does not establish human
experience, aesthetics or completeness of the chosen requirements.
