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
- Repetitions: 12 per arm, 36 requests total, serial requests.
- Rotation: arm order rotates across repetitions (`direct/checklist/pattern`,
  `checklist/pattern/direct`, `pattern/direct/checklist` cycling).
- Each request is independent: no tools, no memory, no feedback.
- Each logical call tolerates bounded transparent retries of transient
  provider failures (recorded per-attempt in `call.attempts`); non-transient
  or custody-uncertain failures still stop the schedule.

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

The discipline is identical across routes; the route itself is a frozen
protocol parameter (`providerFile`, `requestedAccount`, `requestedModel`):

- prepared plans freeze the full dependency closure (task, guidance, runner,
  provider module, scorer);
- each admission re-verifies executable identity, account, qualification and
  the catalog state;
- requests run serially, one in flight, with every provider envelope
  preserved;
- no continuation, resumption, replacement or cross-provider fallback.

Two routes exist:

- **`run-design-swe2.py` (xcb application route):** qualified XCB
  `devin/swe-2-high` application inference on the uncontended imported account;
  catalog Free-tier verified per admission; provider cost unreported; bounded
  retries of transient failures only. The xcb `generate` route caps requests at
  120 s — the village task sits at that cap (~50% per-request success measured),
  which is what motivated the retry budget and the gateway route.
- **`provider-gateway.py` (Vercel AI Gateway route):** a bounded-spend HTTPS
  route through one pinned origin; per-request `usage.cost` is recorded and a
  hard `enforcedUsdBudget` stop caps total spend; the credential is a local
  `.env` key read under the same owned-file discipline and never serialized.
