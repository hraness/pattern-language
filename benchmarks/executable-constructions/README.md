# Executable constructions

This experiment follows the [SWE-2 ceiling](../design-decisions-swe2/results/2026-09-22-study/README.md)
by giving designs meaningful, executable alternatives. A closed JSON artifact
selects journal or snapshot persistence and immediate or bounded-batch commits.
The compiler produces a synchronous JavaScript module. An independent host and
observation oracle check behavior and measure simulated resource use.

Status: the frozen 36-request comparison [completed](results/2026-09-23-study/README.md)
with all responses scored: every arm selected essentially optimally (35/36
objective-optimal overall) — a ceiling result, no procedure advantage. The
[first frozen live attempt](results/2026-09-22-stopped/README.md) stopped at
Devin session configuration: one failed admission, no responses and 35 unadmitted
slots.

## Compile a design

Save a construction as `design.json`, for example:

```json
{"schema":"pattern-language.construct.v1","storage":{"op":"append-journal"},"commit":{"op":"each"}}
```

```sh
node scripts/compile-construction.mjs design.json --out counter.mjs
```

The output path must not already exist. Omitting `--out` writes module source to
stdout. Input is strict inert JSON: unknown fields, duplicate keys, code and
unsupported values are rejected. Output depends only on the validated choices
and frozen compiler, not on another model call.

The generated module exports `create(host)`. Supply the storage, logical clock
and reply operations described in [contract.md](contract.md); the returned
service supports `submit`, `read` and `tick`. This is an executable protocol
component against that host interface, not a production storage adapter. The
host's atomic-write promise remains part of the contract.

## Compare designs for a context

```sh
# Measure all ten constructions, including every tied feasible optimum.
node benchmarks/executable-constructions/space.mjs write_pressure

# Evaluate one saved design against a public context.
node benchmarks/executable-constructions/evaluate.mjs design.json recovery_pressure
```

The space report includes actual resource vectors, budget failures, Pareto
membership and objective regret. Comparing the four public contexts shows how
changing priorities changes which executable design is useful. This finite
search is also a deterministic baseline: a model is not needed to discover the
optimum of these ten choices.

## What is measured

There are ten constructions and four public contexts. Context objectives can
prefer different tradeoffs among write calls/bytes, retained durable bytes,
recovery reads and acknowledgement delay. Counts come from actual simulated
operations, not architecture labels. Each context is checked against the entire
finite construction space, accepting all tied optima.

The independent correctness oracle reads public invocation/reply/read history,
not compiler internals or serialized storage. The verification report states its
finite fault bound and fair recovery tail. Deliberate faults check sensitivity.
Resource workloads remain identical across constructions; crash-site counts do
not weight resource costs.

All guidance arms receive the same operators, dependencies, compiler, facts,
grammar and objectives. The model selects executable constructions; it does not
write arbitrary implementation code. This tests a small procedural package and
construction language, not open architecture synthesis or Alexander's broader
claims about human experience.

## Offline checks and study

```sh
node benchmarks/executable-constructions/test-compiler.mjs
node benchmarks/executable-constructions/self-test.mjs
python3 scripts/test_construction_runner.py
node benchmarks/executable-constructions/test-score.mjs
```

Study preparation freezes public inputs and the complete verification closure.
It performs metadata checks only. The runner requires exact unexpired XCB
qualification, account binding and fresh Free catalog eligibility; it permits
no paid fallback or retries. Billed cost remains unreported.

```sh
python3 scripts/run-construction-study.py prepare /absolute/private/study-directory
python3 scripts/run-construction-study.py run /absolute/private/study-directory \
  --approve-36-requests-catalog-free-route
```

Only public task/operator/context material and the assigned guidance are sent.
All 36 raw responses are collected before parsing or evaluation. Evaluators,
optimal design tables, private provider metadata and the private Devin transcript
remain outside generation prompts. Earlier frozen studies remain unchanged.

After generation is finalized:

```sh
node benchmarks/executable-constructions/score.mjs /absolute/private/study-directory/plan.json \
  /absolute/private/study-directory/run.json --out /absolute/private/study-directory/evaluation.json
# Use --replay instead of --out to verify an existing evaluation exactly.
```
