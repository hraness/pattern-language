# Prospective village-decomposition study

## Question

Does a context-sensitive, linked construction procedure help select useful
subsystem decompositions where the objective is not publicly computable? This
follows the [completed construction comparison](../executable-constructions/results/2026-09-23-study/README.md),
which showed a ceiling on an enumerable ten-design space: every arm selected
the objective optimum essentially always. Decomposition removes the shortcut:
the reference partition is hidden evidence and no closed-form optimum exists
to read off the prompt.

## Design

One task: partition the 141 village misfits into 8 to 16 named subsystems,
subject to the [contract](contract.md) bounds and exact coverage. The supplied
[dataset](dataset.md) carries the misfit texts and the complete unsigned link
table (1,434 pairs) — the same public evidence available to the original
analysis. The hidden reference decomposition stays out of the prompt.

- Arms: `direct`, `checklist`, `pattern` — identical facts, different guidance.
- Repetitions: 12 per arm, 36 requests total, serial single-shot requests.
- Rotation: arm order rotates across repetitions (`direct/checklist/pattern`,
  `checklist/pattern/direct`, `pattern/direct/checklist` cycling).
- Each request is independent: no tools, no memory, no feedback.

## Scoring

Every admitted response is preserved as inert text. After the generation run
is finalized, the frozen scorer parses each artifact and reports:

- valid: schema, bounds, and exact coverage pass,
- mechanical: at least 20 of the 144 foundry `sampleLinks` keep both endpoints
  inside one group (the habitat's own bounded invariant),
- agreement: adjusted Rand index, Rand index, pair precision, recall and F1
  against Alexander's published 12-subset decomposition, and the same
  agreement against the four majors with subsets mapped up.

Missing, failed or invalid responses count as failures at every denominator.
A higher arm mean on adjusted Rand is the comparison claim; no claim is made
about absolute quality, real-world village planning, or software
decomposition generally.

## Provider discipline

Identical to the completed construction study: prepared plans freeze the full
dependency closure; each admission re-verifies executable identity, account,
qualification and the native Free catalog tier; requests run serially through
qualified XCB `devin/swe-2-high` application inference; no retries,
continuation, resumption, replacement or paid fallback; provider cost is
unreported when the route exposes none.
