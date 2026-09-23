# Experiment history: initial ALGAL prototype

Christopher Alexander's *Notes on the Synthesis of Form* (1964), sketched in
[ALGAL](https://github.com/hraness/algal)-form: a pattern language for code
and visual design where every pattern is a runnable constructive diagram —
a manifest, not a paragraph.

This is the September 21–22 exploratory log, revised during the September 22
evidence audit. It documents mechanisms, fixtures, and model preferences.
It does **not** establish an improvement in code design. See the
[current assessment](review-2026-09-22.md) and [project README](../README.md).
Partition agreement below means the unadjusted Rand index; compare it with
chance-corrected scores and baselines before drawing conclusions. The legacy
judged-evolution driver optimizes its purported holdout, and the partition
habitats repeat identical inputs across splits. Its generated candidates also
inherit reference-derived examples. These are demonstrations, not independent
generalization tests.

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

This is a historical reference partition. Similarity is a descriptive measure,
not a test that the resulting design works better.
Raw cross-link count — the naive rule — degenerates into `[138,1,1,1]`:
one giant cluster plus singletons, agreement 0.272. Switching the score
to **average linkage** (cross-links ÷ |a|·|b|, still pure `expr`) gives
`[4,36,46,55]` at k=4 — **0.707 unadjusted Rand agreement** with Alexander's A–D majors —
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

Observed in this example: peripheral modules sometimes cluster together — `source-*`,
`coding-*`/`xcb`, `github`/`github-cli` cluster cleanly. What doesn't:
hub modules (`run.ts` imports ~15 things) absorb their neighbors into an
18-module blob; CNM discovers only 4 communities where the docs name 10.
Import density is a coarser signal than conceptual subsystem boundaries —
a limitation of this import-graph heuristic. Whether judged links improve
code outcomes requires a separate controlled test.

## The first live run

`receipts/correlate-cli-report.live.json` is the first receipted run with
a real executor: 28 Jev `decide` calls judged every pair of the
`cli-report` ensemble (`agentCalls: 28` in the receipt;
`ensembles/cli-report.judged.json` has the per-pair nouls).

The model supplied new judgments and disagreed with the
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

`jury-agreement.report.json` historically labeled one set of picks as human
and reported 8/10 agreement. Human provenance was not established; the files
are now marked `excluded-unverified-human-provenance`. Those numbers provide
no human validation or judge calibration.

`panel-jury.algal.json` compares model rubrics: each duel runs
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

### The partition habitat — fit as a property of a decomposition

`habitat/partition/` is the deepest test: the artifact is a *structure* —
named subsystems over the `cli-report` ensemble's 8 misfits. The genome
literally is a proposed decomposition (`{"groups": [{name, misfits}]}`);
the positive ensemble links become **coupling requirements** (pairs that
must share a group) and the negative links become **separation
requirements** (pairs that must not). The scorer checks seven terms:
exact coverage, >= 2 groups, >= 2 members each, every group named,
every coupling co-located, no separation co-located. It takes `flat`,
`contains`, `map`, `filter` — all inside expr's depth bound.

Five hand-written decompositions: `coupled-pairs` (the 4 link-pairs) and
`merged-trust` (verdict+evidence merged) both satisfy the contract —
two genuinely different valid partitions for the jury to discriminate.
`singletons` dies on min-size, `symptom-cause` (symptoms vs causes —
plausible theme) dies splitting every coupling, `signal-stack` dies on
the separation term alone.

Live judged evolution (`evolve.live.report.json`) explored real
structure, not surface:

| gen | champion | structure |
|---|---|---|
| 0 | merged-trust | 3 groups — jury prefers the merge over 4 pairs |
| 1 | **quality-chain** (generated) | different 3-merge: limits merged with evidence |
| 2 | **atomized-concerns** (generated) | back to 4 pairs — **with sharper force-names** |

The final champion is topologically identical to the hand-written
`coupled-pairs` but renamed (`verdict-discernibility`,
`evidence-integrity`, `format-robustness`, `medium-invariance`) — the
trajectory varied *topology* first, then converged on *naming quality*.
Zero escapes, zero contested duels — both rubrics agreed on every
structural comparison, unlike the 45% contestation on line formats.

Also found and fixed upstream: `algal run`'s `process.stdout.write`
truncates past the 64KiB pipe buffer at exit — jury receipts on
structural artifacts routinely exceed it. `out()` now drains with
`writeSync` (`hraness/algal` `ff62742`); the driver also redirects
stdout to a file regardless of runtime version.

### Partition at scale — judged fit vs. the real architecture

`habitat/partition-src/` scales the same machinery to **48 real source
modules** (the `algal-src` ensemble, 288 undirected import links). The
contract changes shape because the links are unsigned: no pair-level
requirements, instead coverage + group-count bounds (4–12) + min size +
naming + a **cohesion floor** (>= 15 of 288 couplings intra-group — a
floor, not a discriminator: random 5-way splits score 24% intra vs the
oracle's 15%).

What discriminates where the contract can't: **oracle agreement** —
pairwise co-membership vs the actual directory structure, computed as
report annotation. Live run (`evolve.live.report.json`):

| candidate | wins | oracle agreement |
|---|---|---|
| layered-arch (oracle, folded) | 2 | 0.995 |
| greedy-modules (link-density) | 1 | 0.715 |
| shuffled-five (**random**) | 0 | 0.714 |

The random partition passes the mechanical contract and loses in this
model tournament. That is a local ranking observation, not proof of architectural
quality. A generated `oracle-aligned` partition scored 0.997 raw agreement,
but the writer saw a reference-derived champion and oracle-scored standings.
It therefore did not independently reconstruct an unseen answer. The final
`functional-layers` preference describes the jury's choice, not an improvement
over the existing architecture.

Both scaling walls found and fixed this round: expr `filter` rejects
non-boolean `null` (probe failures crashed the jury — unknown mech now
counts as can't-inherit), and the decide cells' `maxContextBytes` had
to grow from 8KiB (line duels) to 48KiB (partition duels) — the
structural habitats' duel manifests carry structural prompts too
("coherent groups, names that capture the shared force" vs "few
groups, predictable membership").

### The village itself — Alexander's own corpus in the loop

`habitat/partition-village/` runs the canonical dataset: all **141
misfits** from *Notes on the Synthesis of Form* Appendix I, 1,434
interaction links, and Alexander's published four-region decomposition
as both candidate and oracle. The scorer scores a declared link
subsample (every 10th link — full-graph cohesion over 1,434 links
exceeds expr fuel), bounds groups 8–16, and requires exact coverage.

Mechanical foundry: `greedy-twelve` (link-density heuristic) is
promoted over Alexander's own partition on sampled cohesion; three
degenerate forms (quarters, prefix buckets, random) all fail.

An earlier run (commit `05735d1`) recorded missing-ID proposals rejected
by the coverage contract and a later `institutional-integrated` jury winner.
The file at HEAD was overwritten by a subsequent repaired run; it must not
be cited as the receipt for that earlier trajectory.

The current stored run (commit `310f6a9`) records:

| generation | observation |
|---|---|
| 0 | `alexander-groups` and `greedy-twelve`: no decisive duel; incumbent remains |
| 1 | `ritual-production` repaired 3 omitted IDs, `settlement-ecology` repaired 2; all three proposals pass mechanical checks; `subsistence-service` becomes champion |
| 2 | only the incumbent remains; zero duels, so this is not a successful defense against new competitors |

This supports bounded coverage repair and contract arbitration. The jury's
preference for an alternative does not show that it improves Alexander's
village design. Both the reference partition and reference-derived feedback
were available during search, and raw pairwise agreement is inflated by pairs
placed in different groups.

Scale walls found at 141 items: writer context (78KB) needed
`maxContextBytes` raised to 256KiB, and writer latency needed
`maxEffectMs` 600s plus `--executor-timeout-ms` plumbing upstream
(`hraness/algal` `f899456`).

### Mechanical completion — the organism repairs its own misfit

The gen-1 escape suggested a better division of labor than "writer
tries harder": the writer's job is *gestalt* (force structure, names),
while exact coverage is *bookkeeping* — and bookkeeping is what expr is
for. Every generated village candidate is now a two-cell organism:

- `raw` — the writer's proposal, quoted verbatim (the proposal is data)
- `fmt` — the habitat's `repairProgram` (declared in `job`, so it's
  part of the habitat contract): per-group dedup, a fast path when
  coverage is already exact, else each missing id placed into the group
  holding most of its `sampleLinks` partners. Bounded: more than 7
  missing ids and the program gives up — the coverage term names the
  misfit rather than hiding it. Output carries `repaired: n` as
  provenance inside the artifact.

Scripted proof: `near-miss` (a coherent partition dropping 7 ids) has
its raw proposal mechanically completed — `mechanical.near-miss.passed
= true` — while `thin-twenty` (20 groups) still dies on the count bound
and cohesion floor. Repair fixes bookkeeping, not bad structure.

The fuel budget told its own story: naive repair blew the 100K expr
cap twice — first a quadratic `seen`-accumulator dedup, then the
fold-accumulator pattern (rebuilding a ~10KB partition per missing id
spends bytes-as-fuel). The shipped version accumulates tiny
`{group -> id}` placements and applies them in one pass: ~93K worst
case at the 7-missing bound, ~300 when coverage is already exact.

## Status after review

The executable orchestration, recorded judgments, fixture replay, mechanical
rejection, and bounded coverage repair are useful engineering results. The
main causal question remains open: does a reusable system of patterns improve
actual code and its adaptation compared with equally resourced alternatives?
See [the review](review-2026-09-22.md) for the evidence corrections and the
[code-design pilot](../benchmarks/code-design/README.md) for the next test.

## Subsequent code and design studies — September 22

The [54-request lifecycle study](../benchmarks/lifecycle-v2/results/2026-09-22-transfer/README.md)
found no transfer or both-stage advantage for the revised pattern guidance.
The next experiment made design commitments explicit and checked them against
host-observed behavior, using durable-job and pure batch tasks.

The [36-request SWE-2 study](../benchmarks/design-decisions-swe2/results/2026-09-22-study/README.md)
completed through qualified XCB application inference. All 18 pairs passed all
five outcomes; every arm scored 3/3 on both tasks. The selected account catalog
listed SWE-2 High as Free before each request; billed cost was not reported.
This ceiling demonstrates the evaluation workflow but gives no observed pattern
advantage. Most design choices were prescribed and every candidate chose FIFO.
The next proposed experiment introduces executable constructions, multiple valid
architectures and mechanically measured resource tradeoffs.

The [executable-construction instrument](../benchmarks/executable-constructions/README.md)
now implements that step. Ten journal/snapshot and commit constructions compile
into JavaScript. Independent bounded fault checks and fixed resource workloads
produce different optimal designs under four public contexts. This is useful
construction and verification machinery, not evidence of a prompting advantage.
Its [first frozen live attempt](../benchmarks/executable-constructions/results/2026-09-22-stopped/README.md)
stopped when Devin rejected session configuration on the first admission: no
responses, one provider failure and 35 unadmitted slots. The full partial run and
fixed denominators are preserved; no retries or replacement attempts were made.

## Completed benchmark comparisons — September 23

The executable-construction instrument completed its frozen 36-request
schedule on the xcb `devin/swe-2-high` route: all 36 requests produced valid,
correct, feasible constructions and 35/36 were objective-optimal, split
evenly across arms (direct 12/12, checklist 12/12, pattern 11/12). A ceiling
result — the space was too enumerable to separate the arms.

The village-decomposition differentiating instrument (141 misfits, Alexander's
published partition as reference, ARI + mechanical invariants) ran through a
new bounded-spend Vercel AI Gateway route after the xcb route could not
complete the schedule (account contention resolved by rerouting to a second
imported account; task-generation latency still straddled the hard 120 s cap).
Four complete gateway runs plus a budget-stopped replicate:

- claude-sonnet-4.6, the scored comparison: 36/36 gen, 28 valid, $2.75 —
  direct 0.089 / checklist 0.089 / pattern 0.070 denom-ARI.
- claude-sonnet-4.6 replicate: 36/36 gen, 26 valid, $2.94 — same null.
- claude-opus-4.8: 36/36 gen but 2/36 valid (hallucinated ids, code-in-JSON).
- openai/gpt-5.2: 36/36 gen but 4/36 valid (coverage failures), $0.40.
- a sonnet replicate stopped at the shared key's $10 platform budget — the
  bounded-spend cap exercising end-to-end.

Combined sonnet evidence (n=24/arm): all arms identical ~0.105 valid-ARI;
the pattern arm produced fewer valid artifacts (15/24) and a weak,
non-significant links-inside trend. The mechanism analysis — the procedure's
link-density objective is misaligned with the reference's functional coherence
and unexecutable in-context — is in
[the September 23 go/no-go review](review-2026-09-23.md).
