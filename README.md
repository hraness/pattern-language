# pattern-language

Can an Alexander-inspired pattern language help an agent produce better code?
This repository tests that question with executable artifacts, explicit
constraints, and behavioral evidence.

The thesis is that code, like architecture, contains interacting relationships:
local decisions affect the whole, and a useful pattern resolves a recurring
conflict in a particular context. A pattern must guide construction and
adaptation, not merely name a preferred structure.

**Status:** working ALGAL orchestration prototypes and a code-design pilot.
An advantage over ordinary prompting or a design checklist is **not proven**.
The [September 22 review](docs/review-2026-09-22.md) explains what the earlier
experiments establish, corrects their evaluation problems, and orders the next
steps. The [experiment history](docs/experiment-history.md) preserves the work.

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

The next [lifecycle transfer study](benchmarks/lifecycle-v2/README.md) freezes a
more precise state/obligation/publication sequence and a matched checklist.
It reuses the mapper as a development task and adds independently specified
retry and atomic-update tasks. Its planned 54-call comparison measures complete
contracts and adaptation, with no test feedback during generation.

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
| `benchmarks/code-design/` | Actual code contract, pattern treatment, adaptation task and behavioral evaluator | A controlled multi-task study is still needed. |

See [the concept map](docs/concepts.md) for the distinctions between a force
graph, a pattern language, and an implementation's dataflow graph.

## Run the evidence checks

Requires Python 3, Node.js, Bun, and ALGAL. The legacy aggregate also needs an
ALGAL checkout with `foundry search-verify` (at least the upstream fixes through
`f899456e497656eb292d97d7c0aef5e06f1437dc`).

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

Partition reports include raw Rand agreement, adjusted Rand index (ARI), and
deterministic size-preserving shuffled baselines. The older raw agreement
threshold alone was misleading: even singleton partitions score highly.
Passing these checks establishes evaluator and prototype behavior, not the
usefulness of Alexander's ideas.

## Direction

First test patterns on small code with observable behavior and change requests.
Then transfer successful relationships to simulated system problems such as
bounded queues, retries and duplicate delivery. Other promising domains are
query planning, compiler transformations and constrained layout, where a
machine can check meaningful outcomes. Human experience and aesthetic quality
remain outside what these mechanical checks can establish.

The aim follows Alexander's emphasis on testing a language by what it can
generate as a whole; our code and machine-verifiable scope is a deliberately
narrow operational interpretation. See his [OOPSLA address](https://www.patternlanguage.com/archive/ieee.html).
