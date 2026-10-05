# pattern-language

Pattern Language tests whether Christopher Alexander's pattern-language method
helps AI coding agents design better code. In the completed construction and
decomposition comparisons, the tested pattern guidance showed no advantage
over a direct procedure or a design checklist. On the decomposition task, it
produced fewer valid artifacts. The [September 23 go/no-go review](docs/review-2026-09-23.md)
explains why.

The thesis is that code, like architecture, contains interacting relationships:
local decisions affect the whole, and a useful pattern resolves a recurring
conflict in a particular context. A pattern must guide construction and
adaptation, not merely name a preferred structure.

**Status:** ALGAL orchestration prototypes and reproducible code-design
studies. The [September 22 review](docs/review-2026-09-22.md) explains the
earlier experiments and their corrections, and the
[experiment history](docs/experiment-history.md) keeps the full record.

## Start with code

[The code-design pilot](benchmarks/code-design/README.md) uses an ordered,
bounded asynchronous mapper and a subsequent cancellation requirement. It
compares direct prompting, a design checklist, and an Alexander-inspired
pattern sequence under the same behavioral contract. Checks measure ordering,
capacity, failure handling, and cancellation without asking a model or human
to choose the prettiest implementation.

The first six-call [smoke comparison](docs/review-2026-09-22.md#first-actual-code-smoke-result)
found that checklist and pattern guidance tied: both revised implementations
passed 20/20 checks, versus 18/20 for direct prompting. None passed every base
check. One attempt per arm cannot establish a pattern-specific advantage.

The reference implementation and deliberately broken implementations validate
the evaluator. They are not experimental evidence that pattern guidance wins.
The pilot protocol separates generation from evaluation and records failures,
cost, and the limits of its evidence.

The completed [54-request lifecycle study](benchmarks/lifecycle-v2/results/2026-09-22-transfer/README.md)
found no transfer or both-stage advantage for the revised pattern treatment. Attempts passing every
frozen check at both stages were direct/checklist/pattern **3/1/0** on mapper,
**0/0/0** on retry, and **3/3/2** on atomic updates (each out of three). Reported
usage was $3.449436. Failure review confirmed real bugs and also found an untested
valid input in a passing direct artifact; passing this suite is not a proof of
complete correctness. The report recommends testing explicit, trace-checkable
design decisions before expanding a prose pattern catalog.

The [design-decision experiment](benchmarks/design-decisions-v3/README.md)
tests that next step: a machine-readable design precedes code, and host-observed
transitions, effects and choices are checked against it. It includes a durable-job
simulator and a pure batch planner where storage and scheduling must be omitted.
Behavior, model adequacy and code/design agreement are scored separately. The
original Claude plan remains prepared and unrun. The user selected a separate
[SWE-2 provider study](benchmarks/design-decisions-swe2/README.md) using the
existing account's free model offering, with the same 36-request experiment.
The [completed study](benchmarks/design-decisions-swe2/results/2026-09-22-study/README.md)
reached a ceiling: all 18 design/code pairs passed schema, adequacy, behavior and
agreement checks. Every arm scored **3/3 on both families**, so no pattern
advantage was observed. Every request passed the Free-catalog check; billed cost
is unreported.

The [executable-construction experiment](benchmarks/executable-constructions/README.md)
provides ten actual implementations from journal/snapshot storage and immediate
or bounded-batch commit. A closed JSON design compiles into reusable JavaScript;
an independent host checks crash recovery and measures writes, retained bytes,
recovery work and acknowledgement delay. Four contexts change the objective or
budgets. In the [completed 36-request study](benchmarks/executable-constructions/results/2026-09-23-study/README.md),
all artifacts passed the behavior and resource checks. Direct and checklist
guidance each selected an optimal construction in 12 of 12 attempts; pattern
guidance did so in 11 of 12. These near-ceiling results did not establish a
pattern-guidance advantage.

The [village-decomposition study](benchmarks/village-decompose/results/README.md)
tested grouping 141 requirements into subsystems. Across two Sonnet runs,
direct, checklist, and pattern guidance produced 19, 20, and 15 valid artifacts,
respectively, out of 24 attempts per arm. Agreement with the reference grouping
was similar among valid artifacts; pattern guidance produced fewer valid ones.
The Opus and GPT-5.2 runs produced too few valid artifacts for a useful
comparison of guidance.

## What to keep from the prototype

ALGAL provides bounded execution, typed interfaces, content-addressed manifests,
and receipts. Those are useful tools for making design experiments inspectable.
They do not make the design rationale true or the evaluator independent.

| Component | Established capability | Remaining question |
|---|---|---|
| `patterns/` | Small runnable examples of bounds, provenance, failure paths and context views | Do they improve new code tasks? |
| `programs/` | Enumeration, correlation, clustering and synthesis orchestration | Current `diagram` emits constant prose; `realize` joins it. Code construction is not demonstrated by this pipeline. |
| `habitat/` | Generation, model tournaments, mechanical rejection and bounded repair | Legacy evolution reuses its holdout and exposes reference-derived feedback. No independent quality claim follows. |
| `ensembles/` | Historical village and source-import graphs with reference groupings | Similarity to a grouping is not design effectiveness. |
| `benchmarks/code-design/` | Actual code contract, adaptation task and six-request smoke evidence | One attempt per arm cannot establish treatment effectiveness. |
| `benchmarks/lifecycle-v2/` | Frozen 54-request multi-task study, reviewed sources and reproducible outcomes | No transfer or both-stage pattern advantage was observed. Can explicit, trace-checkable design decisions help? |
| `benchmarks/design-decisions-v3/` | Executable design artifacts, host traces, two task families, references and fault probes | Contracts largely prescribe the architecture; the original Claude plan remains unrun. |
| `benchmarks/design-decisions-swe2/` | Completed 36-request qualified XCB/SWE-2 study using the same frozen tasks | All 18 pairs passed; no observed pattern advantage within largely prescribed architectures. |
| `benchmarks/executable-constructions/` | Closed design language, deterministic JavaScript compiler and independent fault/resource evaluation across ten constructions | Completed 36-request study selected 35 optimal constructions; no pattern-guidance advantage was established. |
| `benchmarks/village-decompose/` | Frozen requirement-grouping task with repeated comparisons and recorded model responses | Pattern guidance produced fewer valid artifacts and no better reference agreement among valid artifacts. |

See [the concept map](docs/concepts.md) for the distinctions between a force
graph, a pattern language, and an implementation's dataflow graph.

## Run the evidence checks

Start with Python 3.11 or later for the partition checks below. They read the
committed village fixtures and need no model credentials or ALGAL installation.
The JSON report includes the partition, agreement metrics, and a shuffled
baseline; it measures agreement with the reference grouping, not code quality.

The full aggregate also requires Node.js and Bun. It downloads the ALGAL revision
pinned in `scripts/verify.sh` through `bunx`; no local ALGAL checkout is required.
Use the optional local-runtime commands below only to test an explicit checkout.

```sh
python3 scripts/test_partition_metrics.py
python3 scripts/decompose-village.py 12 avg --json
# The code pilot README lists evaluator, prompt and self-test commands.

# Full repository gate; default ALGAL resolution uses bunx.
bash scripts/verify.sh

# To use an explicit local runtime for both aggregate paths:
ALGAL_CMD="bun /absolute/path/to/algal/cli.ts" \
ALGAL_LOCAL=/absolute/path/to/algal/cli.ts bash scripts/verify.sh
```

The aggregate replays legacy fixtures and rewrites derived habitat reports;
run it in a disposable source snapshot when preserving historical reports.
Live generation is separate and is never needed to replay these fixtures.

### New live jury runs

Current decision manifests route to Cloudflare Clef. Use a released ALGAL
build that supports `--clef` through `ALGAL_CMD`; the frozen offline pin
predates that adapter. Supply `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_AUTH_TOKEN`) privately in the environment.
See [Cloudflare's Clef reference](https://developers.cloudflare.com/workers-ai/models/clef/)
for the model and authentication requirements. The jury is text-only:
images are unsupported and are not automatically sent.

Starting `scripts/evolve-jury.py` requires either `--responses FILE` for an
offline replay, or `--live --out NEW_REPORT_PATH` for an authorized paid run.
Live runs default to `--decision-provider clef`. An explicit
`--decision-provider jev` loads the original jury modules byte-for-byte from
Git commit `9318983b5e76a8ec142b0171d093255183ede08d` and requires
`TYPESAFE_API_KEY` in the environment. That commit also preserves the original
programs, embedded digests, and runner for historical source reproduction;
keep it available in the local clone. Live candidate files are written beside
the new report, not over the historical candidates. A timeout or incomplete
live result stops the run without retrying; check the provider outcome before
starting another attempt.

The original Jev receipts, live evolution results, and experiment history
keep their original attribution. New Clef runs are separate experiments;
they do not change the conclusions or provider of those results.

Partition reports include raw Rand agreement, adjusted Rand index (ARI), and
deterministic size-preserving shuffled baselines. The older raw agreement
threshold alone was misleading: even singleton partitions score highly.
Passing these checks establishes evaluator and prototype behavior, not the
usefulness of Alexander's ideas.

## Direction

The completed studies do not support expanding the tested pattern guidance.
A different formulation needs a new comparison on code with observable
behavior and change requests before transfer to simulated system problems such as
bounded queues, retries and duplicate delivery. Other promising domains are
query planning, compiler transformations and constrained layout, where a
machine can check meaningful outcomes. Human experience and aesthetic quality
remain outside what these mechanical checks can establish.

The aim follows Alexander's emphasis on testing a language by what it can
generate as a whole; our code and machine-verifiable scope is a deliberately
narrow operational interpretation. See his [OOPSLA address](https://www.patternlanguage.com/archive/ieee.html).
