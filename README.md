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
programs/    the method — enumerate → correlate → diagram → realize
ensembles/   seed problem sets: misfit variables + claimed links, as data
catalog/     patterns.json — the language index with larger/smaller links
docs/        the concept map
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

## Status

Seed skeleton. The ensemble `links` are claimed judgments — running
`correlate` against an ensemble with a live decision executor is how a link
earns its receipt. Decomposition (HIDECS-style graph partition) is a
deliberate gap: it wants a host `fn` or offline tooling, which Alexander
himself later called unnecessary — the diagrams are the point.

> "No one will become a better designer by blindly following this method...
> if you try to understand the idea that you can create abstract patterns by
> studying the implication of limited systems of forces, and can create new
> forms by free combination of these patterns... you will reach the central
> idea which this book is all about." — C.A., 1971
