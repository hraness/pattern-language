# pattern-language

Christopher Alexander's *Notes on the Synthesis of Form* (1964), sketched in
[ALGAL](https://github.com/hraness/algal)-form: a pattern language for code
and visual design where every pattern is a runnable constructive diagram —
a manifest, not a paragraph.

Alexander's claim, from the 1971 preface: *a pattern is an abstract pattern
of relationships which resolves a small system of interacting and
conflicting forces, and is independent of all other forces and all other
possible diagrams.* An algal manifest is that, literally:
`interface.inputs` is the force-system made data, cells+edges are the
resolution, `interface.outputs` is the form-fragment. See
[docs/concepts.md](docs/concepts.md) for the full mapping — including where
it deliberately doesn't stretch.

## Layout

```
patterns/    the diagrams — one *.algal.json per pattern, runnable today
programs/    the method — enumerate → correlate → decompose → diagram → realize
             (plus synthesize: the whole pipeline as one digest-wired organism)
ensembles/   seed problem sets: misfit variables + claimed links, as data —
             including village.ensemble.json, Alexander's Appendix I worked
             example (141 misfits, his published interaction table) with its
             decomposition oracle
catalog/     patterns.json — the language index with larger/smaller links
docs/        the concept map
scripts/     extract-village.py (rebuilds the Appendix I data from the OCR),
             verify.sh (the repo gate)
```

## Run it

Everything below is deterministic — the manifests either need no model at
all or replay scripted responses.

```sh
# static admission (no run)
bunx github:hraness/algal check patterns/bounded-slice.algal.json

# the patterns — pure structure, zero model calls
bunx github:hraness/algal run patterns/bounded-slice.algal.json \
  --args patterns/bounded-slice.args.json

bunx github:hraness/algal run patterns/declared-failure-path.algal.json \
  --args patterns/declared-failure-path.misfit.args.json   # watch a misfit become data

# judgment patterns replay their recorded decisions
bunx github:hraness/algal run patterns/context-view.algal.json \
  --args patterns/context-view.args.json \
  --responses patterns/context-view.responses.json

# the method: ensemble -> signed interaction graph, one decide per pair
bunx github:hraness/algal run programs/correlate.algal.json \
  --args programs/correlate.args.json \
  --responses programs/correlate.responses.json \
  --modules programs/

# a subsystem becomes a spawned, running diagram
bunx github:hraness/algal run programs/diagram.algal.json \
  --args programs/diagram.args.json \
  --responses programs/diagram.responses.json

# decomposition as a bounded repeat of pure-expr merge rounds
bunx github:hraness/algal run programs/decompose.algal.json \
  --args programs/decompose.args.json --modules programs/

# the whole book's method as one organism — enumerates, correlates,
# decomposes, spawns a diagram per subsystem, fuses the form
bunx github:hraness/algal run programs/synthesize.algal.json \
  --args programs/synthesize.args.json \
  --responses programs/synthesize.responses.json --modules programs/

# everything at once
bash scripts/verify.sh
```

Live runs replace `--responses` with a real executor
(`--gateway-model provider/model`, `--jev` for decide cells). Nothing in the
manifests changes — executors are host-supplied.

## The patterns

| pattern | resolves | contains / completes |
| --- | --- | --- |
| `bounded-slice` | evidence vs. window vs. honest truncation | completes `provenance-line` |
| `provenance-line` | trust vs. attention vs. silent clipping | contains `bounded-slice` |
| `declared-failure-path` | misfit as routed data, not silent death | completes `piecemeal-tradition` |
| `context-view` | judgment sees its subsystem and nothing else | completes `piecemeal-tradition` |
| `piecemeal-tradition` | improvement without in-place mutation | the champion slot; contains the two above |
| `verdict-first` | verdict vs. attention vs. pipe-survival | completes `provenance-line` |

## The Appendix I benchmark

`ensembles/village.ensemble.json` carries Alexander's own worked example
from *Notes*, Appendix I: 141 Indian-village misfit variables and the
unsigned interaction table he published (1434 normalized links after
OCR cleanup — the 52 residual asymmetries are recorded, not silently
fixed). `ensembles/village.decomposition.json` is his published answer:
four major groups (A–D) over twelve minor groups covering all 141
variables. Rebuild both with `python3 scripts/extract-village.py`.

This is the repo's oracle: any `decompose` variant can be scored against
Alexander's own partition, and the first measurement already paid off.
Raw cross-link count — the naive rule — degenerates into `[138,1,1,1]`:
one giant cluster plus singletons, agreement 0.272. Switching the score
to **average linkage** (cross-links ÷ |a|·|b|, still pure `expr`) gives
`[4,36,46,55]` at k=4 — **0.707 agreement** with Alexander's A–D majors —
and **0.840** at k=12 against his twelve subsets:

```sh
python3 scripts/decompose-village.py 4 avg   # oracle comparison
python3 scripts/decompose-village.py 12 raw  # watch it degenerate
```

The greedy step is receipted in-manifest at small scale; at 141 nodes it
exceeds the 1M `expr` fuel ceiling and runs offline — which is exactly
what Alexander did: his partition came from HIDECS, an IBM program.
**Not** a HIDECS reproduction, but a measured approximation.

## The transfer test

`ensembles/algal-src.ensemble.json` asks the harder question: does the
method find real structure in a real codebase? Misfits are the 48
non-test modules of `algal/src/` (each one's design obligation, from the
repo's AGENTS.md tour); links are import edges — "changing one's contract
can misfit the other." The oracle is AGENTS.md's own subsystem grouping.

```sh
python3 scripts/extract-algal-src.py                     # rebuild the ensemble
python3 scripts/decompose-village.py 10 avg \
  ensembles/algal-src.ensemble.json ensembles/algal-src.decomposition.json
```

Result, honestly mixed (agreement vs. the documented grouping):

| algorithm | village k=4 | village k=12 | algal-src k=10 |
| --- | --- | --- | --- |
| raw cross-links | 0.272 (degenerate) | 0.214 (degenerate) | — |
| average linkage | 0.707 | **0.840** | **0.760** |
| CNM modularity | **0.791** (3 clusters) | — (discovers k) | 0.737 (4 clusters) |

What transfers: peripheral modularity is real and found — `source-*`,
`coding-*`/`xcb`, `github`/`github-cli` cluster cleanly. What doesn't:
hub modules (`run.ts` imports ~15 things) absorb their neighbors into an
18-module blob; CNM discovers only 4 communities where the docs name 10.
Import density is a coarser signal than conceptual subsystem boundaries —
which is exactly Alexander's point that the *quality of the link
judgments* bounds the quality of the decomposition. Mechanical links are
cheap and honest; judged links are what `correlate` is for.

## The first live run

`receipts/correlate-cli-report.live.json` is the first receipted run with
a real executor: 28 Jev `decide` calls judged every pair of the
`cli-report` ensemble (`agentCalls: 28` in the receipt;
`ensembles/cli-report.judged.json` has the per-pair nouls).

The judgment is genuinely independent — and it disagreed with the
ensemble's claimed links: 1 confirmed, 5 rejected, 4 new links found.
Jev judged only 5/28 pairs interacting (mean noul 0.40), clustering
around clipped evidence hiding failure signals (`m5–m8`, `m7–m8`) — a
defensible reading the hand-claimed graph missed. This is the point made
concrete: link claims become typed, contestable, receipted data.

`receipts/synthesize.live.json` goes further — the whole method live:
`--executor-cmd scripts/agent-executor.py` (a local `claude -p` adapter)
serving `agent` cells, `--jev` serving `decide` cells via explicit
`route.provider`. Claude enumerated 8 real misfits, Jev judged 28 pairs
into 6 links, `decompose` split off `m8` (structural markers — judged
orthogonal to the TTY/progress cluster), claude emitted two child
manifests that were admitted, spawned, and **ran**, and `realize` fused
the form. 31 agent calls, one 74KB receipt.

Two honest observations from going live:

- The bounds earned their keep twice: a 12-misfit enumeration exceeded
  `each`'s `maxItems` (bounded ensembles are a contract, not a habit), and
  the first child manifests failed admission on an unknown `version` key
  — captured as misfit records rather than crashing the run.
- Live diagram prose is weaker than the scripted fixture ("Remediation
  pathway established through systematic analysis" vs. a crisp const).
  Judgment ≠ taste: the pipeline composes and receipts; the quality of
  what flows through it is the model's problem — and now measurable.

## The habitat

`habitat/status-line/` is piecemeal evolution mechanized: four
status-line pattern variants compete under `algal.foundry.config.v1` on
six labeled cases (train / validation / holdout) with the fit criterion
as an `expr` scorer — verdict leads, ≤72 chars, id present, no ANSI.

```sh
cd habitat/status-line
bunx github:hraness/algal foundry foundry.config.json --out foundry.report.json
bunx github:hraness/algal foundry verify foundry.report.json   # replays all 18 receipts
```

Result: `verdict-line` (header = token + id + executor only) promoted with
2/2 train, 2/2 validation, **2/2 holdout** — all 18 run receipts verify
offline. The instructive failure is in the first run's history:
`greedy-line` passed every *train* case (short details fit under 72) and
won promotion before the verdict-line fix, then failed both holdout
cases — selection promoted a misfit because the evidence didn't cover
it. Train/validation/holdout splits exist precisely for this.

Alexander's mapping is literal here: candidates are the diagrams, cases
are the misfits made testable, the scorer is the fit criterion, promotion
is tradition selecting what runs — and the report is a content-addressed
fossil record of the whole trial.

### Bounded generation

`generator.algal.json` adds variation: an agent emits format *descriptors*
— `lit` / `field` / `verdict` parts — and a pure-expr assembler stamps
them into guaranteed-valid manifests. Variation happens inside a grammar;
population admission can't fail on syntax, so only the scorer judges
semantics. (First attempt let the model emit whole manifests — it invented
a `version` key and broke expr syntax. The grammar exists because
unbounded generation fails admission, which is Alexander's point about
pattern languages: the language constrains what variants are expressible.)

```sh
# deterministic gate path — recorded descriptor responses
bunx github:hraness/algal foundry foundry-gen.config.json \
  --responses generator.responses.json --out foundry-gen.report.json

# live — a local model writes the population
bunx github:hraness/algal foundry foundry-gen.config.json \
  --executor-cmd "../../scripts/agent-executor.py" --out foundry-gen.live.report.json
```

Live result (`foundry-gen.live.report.json`, 19 receipts verified
offline): claude generated `minimal-spaces`, `executor-colon-id`,
`detail-emphasis`, `pipe-delimited` — none hand-written. `minimal-spaces`
(`FIT t-101 fit`) promoted on work-units tiebreak over `pipe-delimited`;
`detail-emphasis` correctly failed validation on long evidence.

## Status

Working skeleton with a real end-to-end run: `synthesize` enumerates an
ensemble, receipts six per-pair interaction judgments, decomposes to
subsystems, spawns a runnable diagram per subsystem, and fuses the form —
all inside one receipted organism.

What is proven:

- Alexander's vocabulary is *executable*, not just analogous: ensembles,
  interaction graphs, decomposition, diagrams, and fusion are all data +
  runnable manifests under one receipt.
- Interaction claims can be typed, per-pair `decide` calls with recorded
  confidence — inspectable data, not intuition slush.
- The method composes: each stage is a content-addressed organism cell;
  `synthesize` wires five digests into a DAG.
- The measurement loop *discriminates*: the oracle benchmark caught a real
  criterion bug (raw count degenerates; average linkage doesn't), and the
  transfer test quantifies how much structure mechanical links recover in
  a real codebase (0.76) and where they fail (hubs).

What is not proven:

- Live runs need local credentials (`algal auth jev`, a `claude`/`codex`
  CLI for `agent` cells via `--executor-cmd`) — CI replays receipts, it
  doesn't regenerate them. Executor output is nondeterministic by design;
  the receipt is execution evidence, not a replayable oracle.
- Greedy `decompose` ≠ Alexander's HIDECS partition. 0.84 agreement on
  *his* graph is encouraging, not conclusive; on algal-src the same rule
  blurs hub-centered subsystems.
- The model's *taste* is the weakest link: live diagram fragments are
  plausible but generic. Whether the method produces better artifacts
  than unaided prompting is still unmeasured — that's what the foundry
  loop (propose variants, score on labeled cases, promote champions)
  exists to test.

> "No one will become a better designer by blindly following this method...
> if you try to understand the idea that you can create abstract patterns by
> studying the implication of limited systems of forces, and can create new
> forms by free combination of these patterns... you will reach the central
> idea which this book is all about." — C.A., 1971
