# Alexander-inspired design in ALGAL

The hypothesis is that reusable, context-sensitive resolutions of conflicting
forces can help generate code that works and remains easier to change. ALGAL
provides an execution and evidence substrate for testing that hypothesis.
Representing a design process as runnable manifests does not establish that
its outputs resolve the design problem, or outperform ordinary code generation.

Alexander's [1996 OOPSLA address](https://www.patternlanguage.com/archive/ieee.html)
distinguishes a useful pattern-writing format from a language that generates
coherent wholes. His team's account of
[generative sequences](https://www.patternlanguage.com/patterns/justsostory.html)
emphasizes ordered decisions that adapt a design to its particular context.
Those are useful directions for this experiment; the machinery in *Notes on
the Synthesis of Form* is one starting point, not the whole thesis.

## Concepts and their current representations

| Design concept | Current representation | Limit of the correspondence |
| --- | --- | --- |
| Context and forces | Ensemble context, misfit descriptions, pattern notes, and test contracts | Input ports carry values; they do not express every requirement or tradeoff. |
| Interactions among forces | Ensemble `links`, supplied or judged by `correlate` | These are claims about requirements. Manifest edges instead route execution data; guards select execution paths. |
| Subsystem decomposition | Cluster assignments from `decompose`; nested manifests for execution | A partition is a proposed organization. Nesting does not prove that forces are independent. |
| Constructive pattern | A contextual resolution described in the catalog and instantiated by a manifest | A reusable relationship can have several implementations. Executability alone does not make an artifact a useful pattern. |
| Composition into a whole | Embedded organisms and output assembly | Successful assembly does not establish that interactions between parts are resolved. |
| Piecemeal improvement | Candidate generation, evaluation, feedback, and promotion | Selection improves the chosen score; improvement in the underlying design requires independent evidence. |
| Evidence | Receipts, replay, declared scorers, and reports | Execution evidence establishes what ran. Design utility depends on what was tested and what was omitted. |

Keep three structures distinct: the graph of requirements and their
interactions, the network of patterns that help satisfy them, and the
implementation's dataflow graph. Their relationships need to be recorded and
tested, rather than inferred from similar terminology.

`view` restricts the declared context supplied to a judgment. It does not prove
that omitted information is irrelevant, or that the model has no prior
knowledge of it. Likewise, `on:"fail"` provides an execution path for a failure;
it does not detect every design misfit. Sharing an embedded manifest by digest
provides reuse in a DAG, without proving that the design models overlapping
requirements adequately.

## What the current synthesis demonstrates

[`diagram`](../programs/diagram.algal.json) currently asks its designer for one
constant text cell with no inputs. The resulting manifest executes, but its
output is a proposed resolution in prose.
[`realize`](../programs/realize.algal.json) joins those fragments with newlines.
This demonstrates admitted generation, composition, and failure routing. It
does not yet demonstrate the generation of working code from a pattern language.

The existing formatter patterns do execute concrete transformations, and the
habitats exercise selection under explicit contracts. These are useful test
fixtures. Replayed judgments establish that the selection machinery works;
model preferences remain judgments rather than independent correctness tests.

Decomposition uses average linkage rather than Alexander's HIDECS algorithm.
Agreement with his published partition measures resemblance to a historical
reference, not the quality of a new design. Clustering comparisons need
degenerate and constraint-matched baselines and a
[chance-adjusted metric](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.adjusted_rand_score.html).
An existing codebase's documented grouping is also a reference, not a uniquely
correct architecture.

## Evidence needed for the thesis

A candidate pattern should identify its applicability, conflicting forces,
reusable resolution, known limits, and checks that could disprove its usefulness.
An implementation is one instance of that resolution. A generative sequence
should explain which transformation to apply next and preserve previously
established behavior while adapting the whole.

The next experiment should produce real code, compare it with a matched-budget
baseline and a requirements-only control, then apply previously withheld change
requests. Measure functional correctness, regressions, resource bounds, and
the cost of successful adaptation. Keep acceptance tests separate from candidate
selection. [EvalPlus](https://arxiv.org/abs/2305.01210) demonstrates why weak test
suites can overstate code correctness and even change candidate rankings.

Machine checks can evaluate a declared contract without a human judge on each
run. Choosing that contract still expresses design priorities; no passing score
establishes completeness of the requirements or Alexander's broader claims
about human experience.
