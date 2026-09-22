# Code design pilot

This benchmark produces and executes JavaScript. It asks whether an
Alexander-inspired arrangement of responsibilities helps a generator implement a
bounded concurrent mapper and then accommodate cancellation. Its oracle is
observable behavior, not an LLM jury, prose similarity, variable names, or
resemblance to the reference implementation.

The project-authored [pattern card](pattern.md) states context, opposing forces,
relationships, consequences, countercontext, and a compositional sequence. It is
a design hypothesis. It does not establish that Alexander's methods improve code.
The full card is documentation; the experiment uses the shorter frozen arm.

## Run locally

Requires Node 22 or newer; no packages or services are needed. From the repository
root:

```sh
node benchmarks/code-design/self-test.mjs
node benchmarks/code-design/evaluate.mjs benchmarks/code-design/fixtures/reference.mjs --stage base
node benchmarks/code-design/evaluate.mjs benchmarks/code-design/fixtures/reference.mjs --stage change
node benchmarks/code-design/prompt.mjs pattern base > /tmp/pattern-base-prompt.txt
node benchmarks/code-design/prompt.mjs pattern change /path/to/prior.mjs > /tmp/pattern-change-prompt.txt
```

`evaluate.mjs CANDIDATE.mjs --stage base|change` accepts a candidate; it never
generates one. It writes a JSON report to stdout, a concise count to stderr, and
exits 0 for all-pass, 1 for behavior failure, or 2 for invocation failure. Reports
include stage, individual cases, entry-source SHA-256, runtime, and timeout. The
entry hash does not cover imported dependencies; experimental candidates must
be self-contained. Trusted demonstration mutants may import the reference.

Each case imports the candidate into a fresh subprocess with a two-second
deadline. Deferred promises determine completion order; correctness assertions do
not depend on elapsed time. Process output is bounded. Unhandled rejections,
unfinished top-level awaits, crashes, and timeouts fail evaluation. This is an
accidental-hang boundary, **not a security sandbox**: a candidate still executes
with the local user's OS privileges. Use trusted/reviewed code or an appropriate
external sandbox for untrusted code.

## What is measured

[Base task](tasks/base.md): snapshot input, preserve order, fill but never exceed
capacity, invoke each admitted worker once, stop new work at the first observed
failure, drain outstanding work, and preserve the original error value.

[Change task](tasks/change.md): add a cooperative `AbortSignal`, reuse the base
behavior, stop admission on cancellation, preserve whichever terminal cause was
observed first, drain workers, and release listeners. It is held out from the
**base generation prompt**, not secret from repository readers. The generator
must have tools disabled and receive only its prompt. This public task is not a
private held-out corpus or evidence of generalization beyond the task.

There are 12 base cases and eight change cases. Perturbations cover out-of-order
completion, capacity 1 and capacity larger than the input, 513 items, input
mutation after invocation, synchronous throws, hostile thenables, falsy errors,
reentrant cancellation, both failure/abort orders, and concurrent calls. The
change evaluation reruns all base cases to detect regressions. The primary score
is all-pass for a stage; raw case counts are diagnostic, not independent samples.
These checks cover the declared cases, not a proof of all JavaScript behavior.

The handwritten reference passes all 20 cases. Seven intentionally defective
implementations demonstrate that the evaluator rejects unbounded admission,
serial execution, completion-order output, premature failure, ignored cancellation,
reading input too late, and swallowing synchronous falsy throws. The ignored-cancellation mutant passes all base
cases. `self-test.mjs` checks those claims. These are harness checks, **not model
results and not evidence favoring the pattern arm**.

## Frozen comparison protocol

[preregistration.json](preregistration.json) defines a six-replicate paired
exploratory pilot. Freeze file hashes before generation. Choose one exact model
revision and common reasoning/sampling settings, then record them in a run
manifest. All arms receive the identical task and a 154-word instruction arm:

1. **Direct:** implement the contract using the generator's own organization.
2. **Checklist:** the same operational requirements and recommended coordination
   relationships, presented as implementation checks.
3. **Pattern:** relationships organized as context, opposing forces, resolution,
   sequence, consequences, and countercontext.

Checklist and pattern both recommend stable addresses, a shared admission
boundary, slot ownership, separate terminal-cause and drain accounting, and
reuse for a future terminal cause. Thus any improvement over direct instructions
alone cannot establish a pattern-specific effect; the checklist comparison is
essential. Wording still differs and the pattern adds contextual framing. This
pilot cannot separate every effect of wording from organization.

Each call has the same 4,096 input-token cap, 4,096 output-token cap, 180-second
deadline, and provider settings. Equal word counts are not a claim of identical
tokenization: record actual input/output usage. If a rendered change prompt
exceeds the provider's input cap, retain it as a budget failure; do not silently
grant one arm more context. The two calls per arm have the same combined budget.
Disable tools and repository access. Run independent sessions for each call.
Use the balanced arm orders in the protocol and paired seeds when supported;
record when seeds or immutable provider revisions are unavailable.

Generate one base candidate per arm, then one changed candidate from that arm's
own source plus the change task. Do not show test results before the change.
Always run the change, including when the base failed, to avoid survivor bias.
No repair loops or best-of selection. Retain the raw provider response and any
extraction log; invalid, incomplete, refused, and timed-out outputs count as
failures. Evaluate after both stages are generated. Keep code, exact prompts,
prompt/output hashes, settings, provider identity, usage, latency, and JSON
evaluation reports for every attempt. Provider transport errors are recorded,
not quietly replaced with favorable retries.

Report paired base success, change success with retained base behavior, all
discordant arm pairs, and costs. An initial one-replicate smoke run can validate
plumbing but must be labeled separately from this six-replicate pilot. Neither
such a smoke run nor this small single-task pilot supports a broad causal claim.
Do not tune the frozen tests or prompts in response to these scores and report
the rerun as untouched evidence.

If all arms saturate, increase the task difficulty or add independently designed
tasks under a new protocol. If the pattern fails to outperform the checklist,
retain the operational checklist and revise the pattern hypothesis. Candidate
future tasks include cache eviction with cleanup, dependency scheduling, and
incremental graph recomputation. Each needs its own behavioral oracle and
concealed change before any system-design transfer claim is justified.

## Bounded live smoke runner

`python3 scripts/run-code-pilot.py /absolute/path/to/new-private-directory`
generates up to six artifacts using the existing Claude CLI account. It is an
explicit live operation: at most six calls with a $0.50 CLI budget cap each,
no tools, no evaluator feedback, and no generated-code execution. Review the
candidates before separately running the evaluator. Raw provider responses stay
in the private output directory; publish only reviewed artifacts and metadata.

This smoke runner records its deviations from the larger protocol: one
replication, fixed arm order, a 240-second deadline, and cost caps rather than
provider-enforced token caps. The requested model is `claude-haiku-4-5`; record
the provider's returned model identity, since an immutable revision and sampling
seeds may be unavailable. Missing or skipped stages count as failures with three
attempts per stage, not a reduced success denominator. A failed base evaluation
does not suppress its change attempt; only a missing base artifact does.

## Recorded smoke run

[2026-09-22 evidence](results/2026-09-22-haiku-smoke/run.json) preserves exact
prompts and source strings (including whitespace), generation records, and the
original runner. Keeping source in JSON preserves bytes without silently
reformatting model outputs. [Evaluation](results/2026-09-22-haiku-smoke/evaluation.json)
records 10/12 then 18/20 for direct, and 11/12 then 20/20 for both checklist
and pattern. Cost reported by the six calls: $0.379231. This single comparison
found no pattern-specific advantage.

To execute these **reviewed** artifacts and verify that every recorded success
and failure reproduces with the frozen evaluator:

```sh
node benchmarks/code-design/replay.mjs \
  benchmarks/code-design/results/2026-09-22-haiku-smoke/run.json
```

Replay checks runner, evaluator, source and prompt hashes, reconciles generation
records, and fails on any changed per-case outcome. Success means reproduction,
not that all generated candidates are correct. The run JSON is trusted input;
hash consistency does not make arbitrary code safe. The aggregate gate also
replays this fixed evidence. No model call or provider authentication is needed.
