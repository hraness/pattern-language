# Village-decomposition results — gateway route (2026-09-23)

Five gateway runs on the frozen 141-misfit task (Vercel AI Gateway,
`provider-gateway.py`), plus the earlier xcb/swe-2 exploratory partials. The
completed sonnet-4.6 study is the scored comparison; the rest are replicates,
cross-model checks, and a budget-stopped run.

## Runs

| Dir | Model | gen | valid | cost | Result |
|---|---|---:|---:|---:|---|
| `2026-09-23-gateway-study` | claude-sonnet-4.6 | 36/36 | 28 | $2.75 | **the comparison** |
| `2026-09-23-gateway-sonnet-b` | claude-sonnet-4.6 | 36/36 | 26 | $2.94 | replicate |
| `2026-09-23-gateway-opus` | claude-opus-4.8 | 36/36 | 2 | $3.02 | contract collapse |
| `2026-09-23-gateway-gpt52` | openai/gpt-5.2 | 36/36 | 4 | $0.40 | contract collapse |
| `2026-09-23-gateway-stopped` | claude-sonnet-4.6 | 10/11 | 6 | $0.66 | halted at $10 key cap |

## The finding

**No arm differentiates, on any model.** On the two sonnet runs (the only model
that produced valid artifacts reliably):

| Arm | valid/48 | valid-ARI | denom-ARI | links-inside |
|---|---:|---:|---:|---:|
| direct | 19 | 0.104 | 0.082 | 24.3 |
| checklist | 20 | 0.108 | 0.090 | 24.6 |
| pattern | 15 | 0.107 | 0.067 | 25.9 |

- Among **valid** artifacts the arms are statistically identical (~0.105) — the
  linked procedure does not produce partitions closer to the reference.
- The pattern arm produced **fewer valid artifacts** (15/24 vs 19-20/24) —
  the harder narration increases contract failures, dragging its
  denominator-level mean down.
- The pattern arm did keep more sample links inside (25.9 vs ~24.4) — a weak,
  non-significant trend (t≈1.6), see below.

opus-4.8 and gpt-5.2 collapse the contract entirely (2/36 and 4/36 valid):
hallucinated misfit IDs, dropped members, even code injected into JSON
(`"m46".replace("46","47")`). Sonnet-4.6 is uniquely reliable at the 141-item
faithful-enumeration contract here — a model property, not an arm effect.

## Why the linked procedure cannot win on this task

Two independent reasons, both now evidenced:

1. **The procedure encodes the wrong objective.** Its mechanism ("place each
   misfit in the group holding the most of its links") optimizes link
   *density*. A pure density maximizer produces a degenerate partition — one
   130-misfit blob plus 11 singletons keeping 1338/1434 links inside.
   Alexander's reference keeps only 437/1434 (30%) inside with balanced
   groups (sizes 7–23): it optimizes *functional coherence*, not density.
   The pattern arm's extra links-inside is drift toward the wrong criterion —
   away from the reference, not toward it.

2. **The mechanism is unexecutable in-context.** Placing 141 misfits by
   link-majority requires ~10⁴ pairwise checks; the model narrates the
   procedure but computes a topical approximation. The arms all land in the
   ~0.10 band because topical/functional clustering is what the evidence
   supports — and it is also what the reference is. There is no headroom for
   the procedure to exploit (pure link algorithms cap at ~0.17–0.23 ARI and
   produce illegal or degenerate shapes).

The deeper observation: the procedure adds nothing because the models already
do the relevant thing by default. Semantic grouping by functional coherence is
the model's native move; wrapping it in a linked-construction ceremony adds
narration cost (more invalid artifacts) without new information.

## Bottom line for the project

Across two completed studies (construction ceiling, village null) and three
models, pattern-language guidance has not produced a measurable advantage
anywhere it was tested. On this instrument the specific linked procedure is
mis-specified *and* unexecutable-in-context — the honest reading is that the
procedure as a prompt-time design aid does not help, not that decomposition
is impossible.

See `2026-09-23-gateway-study/README.md` for the completed run's accounting
and replay procedure. All runs replay against their own embedded frozen texts
(`--root` on an extracted tree); the scorer's instrument files have since
drifted on the live tree.
