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

### Generational search — tradition under a shifted context

`foundry-search.config.json` runs `algal foundry search`: the four gen-1
variants seed as incumbents, the scorer gains a new force (executor
provenance must appear), and the generator receives each prior
generation's promoted digest + per-candidate scores via `feedbackInput`.

Live result (`foundry-search.live.report.json`, 79 receipts verified
offline):

- **gen 0** — `minimal-spaces`, the gen-1 champion, goes extinct (0/2:
  no executor field). `executor-colon-id` already carries the adaptation;
  claude's feedback-informed variants `minimal-dash`, `compact-pipe`,
  `bracketed-executor` all pass. `minimal-dash` (`FIT - t-101 - jev`)
  promoted.
- **gen 1** — every mutation tried appending `detail` and overflowed the
  72-char bound on long evidence (val 0/2). The incumbent `minimal-dash`
  survived; selection held against the detail-leak.
- **final** — `minimal-dash` promoted, holdout 2/2.

That's the unselfconscious loop end-to-end: environment shift → incumbent
extinction → latent diversity + guided variation → new champion →
mutants rejected by the evidence. The scripted path
(`generator-search.responses.json`, `foundry-search.report.json`) gates
the same mechanics deterministically.

*Note:* verifying search reports needs `search-verify` from algal
≥ `43c9dcf` — the released verifier dropped the scorer when re-checking
per-generation pass claims (fixed upstream, regression test added).

### Judged fitness — where mechanical and taste diverge

`habitat/commit-subject/` is a second habitat on a real artifact: commit
subjects for four real commits from this repo's history. Four candidate
formats (`verb-what`, `scope-colon`, `why-tail`, `stat-suffix`), a
mechanical scorer (single line, 8–72 chars, no trailing period, first
word capitalized), and — the new piece — a **jury**: `duel.algal.json`
wraps one pairwise `decide` (routed to Jev); `jury.algal.json` runs the
round-robin, tallies wins, crowns the champion.

Result on the holdout change (`receipts/jury-commit-subject.live.json`):

| candidate | mechanical | judged duels won |
|---|---|---|
| verb-what | **promoted** (tiebreak) | 2 |
| why-tail | passed all cases | **3 — Jev's champion** |
| scope-colon | failed (lowercase scope leads) | 1 |
| stat-suffix | passed all cases | 0 |

The two fitness criteria **disagree**: mechanical selection promoted
`verb-what`; judged selection prefers `why-tail`
(`Wire live claude+jev executors — prove the pipeline end-to-end` — the
subject carrying the why). The mechanical gate proved its worth too —
`scope-colon` died on a real misfit (sentence-case) the author hadn't
scored. The honest architecture is two-tier: expr scorers enforce
misfits that are *checkable*; judged tournaments rank on misfits that
are *felt*. The jury fixture replays deterministically in `verify.sh`.

### Judged evolution — generation aimed at taste

`scripts/evolve-jury.py` closes the loop: the jury is the selector, the
generator (`generator.algal.json`, descriptor grammar over the
change/hint vocabulary) is the variation, the champion defends its slot
each generation. Two independent live runs:

- **run A** — `why-tail` won gen 0 (hand-written incumbent); generated
  `why-lead` (`prove the pipeline end-to-end: Wire …`) went 3-0 in
  gen 1 and defended gen 2.
- **run B** — same start; generated `why-colon` dethroned `why-tail`
  outright (0 wins), then `why-dash` took gen 2 at 3-0.

Twice, a generated variant unseated the hand-written champion within one
generation, and every winning lineage is why-carrying — the jury's taste
is consistent even though the model's variants differ. The honest
tension: several judged champions would **fail** the mechanical gate
(lowercase first word). Judged selection championed what convention
rejects — exactly the kind of disagreement a two-tier fitness surface is
for; whether the convention or the jury is right is a question for the
ensemble, not the runtime. Scripted path
(`evolve.responses.json`) replays the loop mechanics in `verify.sh`.

### Do the judges agree? Three answers, no human required

`jury-agreement.report.json`: one informal human sample on the same
10-duel bracket — 8/10 per-duel agreement with Jev and the same champion
(`why-lead` 4-0). Divergences were interpretable: the human weighed stat
evidence and casing where Jev was indifferent.

`panel-jury.algal.json` removes the need for that human: each duel runs
**two decide cells with different rubrics** — advocate (leads-with-act,
conveys why) vs skeptic (scans fastest in a list of fifty, conventional
case). Wins count only on agreement; contested duels are reported, not
hidden.

Live result (`panel-jury.live.json` + `.report.json`):

- **6/10 duels contested** — the misfits genuinely conflict, and the
  panel makes the conflict visible instead of letting one rubric decide
  silently.
- **`why-lead` still champions**: the only form both rubrics accept —
  it conveys why *and* scans compactly. Both judges picked it over
  `why-tail` and `why-dash` outright.
- The contested list is exactly the ensemble question: which force
  dominates where rubrics split. That's a design decision, surfaced as
  data — the runtime reports it rather than resolving it covertly.

### The operational surface — this repo's own gate output

`habitat/run-summary/` is the third habitat and the first on a surface
the repo actually produces: one-line run summaries over real records
`{tool, target, verdict, metric}` harvested from this gate's own outputs
(`foundry verdict-line promoted`, `decompose village agreement 0.840`,
`jury commit-subject champion`, `search status-line promoted`,
`decompose algal-src agreement 0.760`, `evolve commit-subject champion`).

Four hand-written formats (`verdict-first`, `bracket-status`,
`tool-lead`, `metric-first`) — and this time the mechanical scorer
clears *everyone*: all four satisfy length/tool/target/single-line
constraints, so the foundry promotes `tool-lead` on tiebreak while the
panel jury does the discriminating:

- **panel result** — `metric-first` champion (2 agreed wins); all 3
  contested duels are `verdict-first` pairings: the advocate prefers
  verdict-leading, the skeptic never accepts it. Same systematic
  force-conflict shape as commit-subject, on operational data.
- **judged evolution, live** — gen 0: `metric-first` holds; gen 1:
  generated `verdict-lead` (`PROMOTED | status-line g1-bracket holdout
  2/2`) dethrones it; gen 2: `verdict-lead` defends. Notably the winning
  generated format **dropped the `tool` field** — judged fitness again
  diverged from the mechanical contract, this time on a real surface.
- The `panel-duel`/`panel-jury` organisms are now domain-neutral (the
  prompt judges "one-line outputs for the record", the brief carries
  domain context) — identical digest serves both habitats.

Scripted path (`jury.responses.json`, `evolve.responses.json`) replays
both the tournament and a one-generation dethroning in `verify.sh`.

### The reconciliation tier — arbitration inside the receipt

Two tiers now coexist with an explicit policy. `reconciled-jury.algal.json`
runs the panel tournament **and** the contract arbitration in one run:
the scorer's `and`-conjuncts (split by `evolve-jury.py`, same
`let`-bindings) flow in as `mech` data, and the tally crowns two
champions — the judged pick and the reconciled pick (argmax wins among
contract-passing). The policy is one line of driver code and one record
field: **the incumbent slot belongs to the contract** — a judged escape
is recorded as `escaped: true`, but only a compliant form inherits.

Evidence both ways:

- **Scripted gate** — `verdict-lead` wins the tournament 4-0 but fails
  `scontains tool` → `escaped: true`, `arrow-format` (3 wins, compliant)
  keeps the tradition. The arbitration is pinned deterministically in
  `verify.sh`.
- **Live, 3 gens** — the named-misfit feedback plus arbitration kept the
  *entire population* inside the contract every generation: no escapes,
  and judged fit still produced a novel dethroning (`metric-lead`:
  `g1-bracket holdout 2/2 status-line search [PROMOTED]` — verdict
  bracketed at the end).
- **Prior run, feedback only, no arbitration** — a violator
  (`verdict-piped`, tool dropped) escaped at gen 3. That's the honest
  comparison: naming misfits helps the writer repair, but only the
  contract-side champion slot stops escape from *inheriting*.

Alexander's version: tradition retains what fits — fit includes the
contract forces, not just the felt ones. The jury proposes; the contract
disposes; the report shows both.

### Escape statistics — the distribution, not the anecdote

`scripts/evolve-batch.py` runs the loop N times and aggregates what a
single run can't show. Live batch: **4 runs × 3 generations** on
run-summary (`evolve-batch.live.report.json`, `batch-runs/`):

| measure | value |
|---|---|
| generations | 12 |
| contested duels | **29/64 (45%)** — the rubrics genuinely diverge |
| judged escapes | **3/12 (25%)** — all in gen 2, all verdict-family forms dropping `tool` |
| divergent champions | 3 — same events; contract kept the incumbent each time |
| reconciled finals | **4/4** |
| generated final champions | **4/4** |

The escape pattern is stable enough to name: the panel keeps preferring
verdict-leading compact forms (`PROMOTED → metric (tool)`,
`PROMOTED | metric: tool`), and those forms keep dropping a required
field. That *is* a force-conflict made quantitative — verdict-visibility
vs. field-completeness — and the arbitration policy is what stops it
from inheriting. Meanwhile generation beats hand-writing 4/4 finals:
every run ended with a variant the hand-written set didn't contain.

### The structural habitat — fit with internal dependencies

`habitat/commit-message/` is the first artifact that isn't a line: a
commit message `{subject, body}` — two fields with a real internal
dependency. The scorer is cross-field: the body must carry the `why`
(`scontains body hint.why`), plus per-field constraints (subject caps,
body non-empty, bounded). Four hand-written forms:

| candidate | form | result |
|---|---|---|
| act-why | `Verb what` / `why — stats` | **promoted** — only survivor |
| why-first | `why — Verb what` / `why — stats` | dies on subject caps |
| bare | `Verb what` / `""` | dies on empty body |
| stat-echo | `Verb what (stats)` / `stats + areas` | dies on **cross-field** term — body lacks why |

The panel on holdout: `act-why` champions with **5/6 duels contested** —
and the pattern exposes a *rubric misfit*: the skeptic (scan-fast)
prefers `bare` — an empty body is maximally terse. The rubric's
degenerate attractor is only visible because the panel reports
contested duels; the contract's body-nonempty term exists precisely
because a commit message without a body is a real misfit.

Judged evolution live (`evolve.live.report.json`): generated
`verb-what-why` (`Wire live claude+jev executors` / `prove the pipeline
end-to-end`) dethroned the incumbent 3-0 and defended — the judges kept
the why but **dropped the stats noise**: the structural winner is leaner
than anything hand-written. Two generated violators were named
(`scope-line` lowercase subject, `impact-brief` body without why) —
mech catches them, judged fit still prefers the compliant champion.
The whole three-tier architecture transferred to structured artifacts
without modification: same jury manifests, same probe, same driver.

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
