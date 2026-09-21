# Notes on the Synthesis of Form → ALGAL

How Christopher Alexander's 1964 vocabulary lands on the algal contract.

| Alexander | algal |
| --- | --- |
| ensemble of misfit variables | an organism's declared inputs + typed output contracts: a finite, bounded universe of requirements |
| interaction graph between misfits | the edge graph; guards are the signed links |
| decomposition into subsystems | `organism`/`each`/`repeat` cells embedding sub-manifests by digest — a tree of programs, acyclic by construction |
| constructive diagram / pattern | **a manifest** — data that is simultaneously a picture of the problem structure and the executable resolution |
| fusion of diagrams into a whole | `many` ports collecting every diagram's outputs; `join`/`expr` assembly |
| piecemeal, cumulative evolution | `spawn` + `each` over labeled cases + scorer → champion slot (the foundry/habitat loop) |
| tradition, myth, taboo | the fn/tool registries, budgets, capability classes — constraints the organism cannot widen |
| fit demonstrated, not asserted | receipts + `algal verify` — replayable evidence, not a trusted transcript |
| the fossil record of trial and error | the content-addressed run history |

## The deep correspondence

Alexander's pattern is *both the pattern of the problem and the pattern of the
solution*. An algal manifest is exactly that: `interface.inputs` is the
force-system made data; cells and edges are the resolution;
`interface.outputs` is the form-fragment. The manifest **is** the
constructive diagram.

Two more correspondences worth naming:

- **`view` is enforced subsystem isolation.** Alexander demands that a diagram
  resolve only its own force-system; outside forces must not leak in.
  `view.inputs`/`view.cells` mechanize the demand — the judgment sees exactly
  the decomposed slice, and admission rejects everything else. The
  decomposition *is* the context policy.
- **`on:"fail"` is misfit propagation.** "Failure is fatal unless the
  structure declares otherwise" is Alexander's requirement that unresolved
  forces stay inside their subsystem. A misfit with no declared path kills
  the form; a `many` port collecting guarded failure records makes
  "fit = empty misfit list" a computed value.

## Where the map is honest about friction

- **Ensemble completeness is the hard epistemic core.** Alexander admits the
  misfit set is never provably complete. algal cannot fix that — it makes the
  incompleteness inspectable, diffable, versioned data instead of private
  intuition.
- **Interaction judgments are judgments.** "Do these misfits interact?" is
  irreducibly a `decide` cell. The gain: interaction claims become typed,
  receipted decisions rather than intuition slush.
- **HIDECS won't fit in `expr`.** The expression language is bounded-pure;
  real graph partition is host `fn` territory or offline tooling.
  Historically accurate — Alexander's math was offline too, and he later
  called it unnecessary.
- **DAG beats tree.** Alexander's decomposition yields a strict tree, and he
  spent "A City is Not a Tree" (1965) regretting that the world is a
  semilattice. algal embedding is a DAG with content-addressed sharing —
  one digest under two parents is an overlapping subsystem.

## The warning built in

> "I reject the whole idea of design methods as a subject of study... people
> who have treated this book as if it were a book about 'design method' have
> almost always missed the point of the diagrams."
> — preface to the paperback edition, 1971

The programs/ directory is the method; the patterns/ directory is the point.
If the programs ever become a ritual performed for their own sake, the
language has failed the way Alexander feared.
