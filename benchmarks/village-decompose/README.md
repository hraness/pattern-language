# Village decomposition

A live comparison of direct, checklist and linked pattern procedures on the
canonical decomposition task: partition the 141 village misfits into named
subsystems, scored by pairwise agreement with Alexander's published
decomposition (hidden from the model).

This follows the [completed executable-constructions study](../executable-constructions/results/2026-09-23-study/README.md),
which ceilinged on an enumerable ten-design space. Decomposition removes the
closed-form shortcut — no procedure can compute the answer, so guidance can
only help by structuring attention over the supplied misfit texts and the
1,434-pair link table.

## Protocol

See [protocol.md](protocol.md): 36 serial tool-free requests (12 per arm,
order rotated), frozen plan, per-admission Free-tier eligibility, preserved
raw responses, offline scoring after generation finalizes.

## Files

- [contract.md](contract.md) — the partition task contract and output schema.
- [dataset.md](dataset.md) — prompt data: the 141 misfit texts and full
  unsigned link table (generated from `ensembles/village.ensemble.json`;
  verified by the gate).
- [oracle.json](oracle.json) — the hidden reference: Alexander's 1973
  App. 1 decomposition (12 subsets under majors A–D). Frozen for scoring;
  never sent to the model.
- [sample-links.json](sample-links.json) — the habitat's 144-pair bounded
  coupling sample; the scorer's mechanical check counts co-located pairs.
- [guidance/](guidance/) — the three arm procedures.

## Scoring

```sh
python3 scripts/score-village-study.py PLAN.json RUN.json --out EVALUATION.json
python3 scripts/score-village-study.py PLAN.json RUN.json --replay EVALUATION.json
```

The scorer re-verifies the frozen provenance, parses each preserved response
as inert JSON, checks schema/bounds/exact coverage, counts sample-links kept
inside groups (≥20/144 mechanical invariant), and reports adjusted Rand,
Rand and pairwise precision/recall/F1 against the hidden reference — at the
12-subset level and mapped up to the four majors.
