# Subsystem decomposition contract

You are given a bounded requirements decomposition task. It is a fixed scoring
contract, not a claim about a real village or a real software system. Models
return an inert partition artifact; a fixed offline scorer checks coverage and
compares the partition against a hidden reference decomposition.

## Task

Partition all 141 village misfits into named subsystems. Each misfit is a
requirement that a village development organization must satisfy. A subsystem
is a cohesive named group of misfits whose concerns belong together.

The supplied link table lists pairs of misfits asserted to belong together.
The table is evidence about structure, not a command: links are unsigned,
symmetric and unweighted, and the reference decomposition was produced by a
human expert interpreting this same evidence.

## Output artifact

Return exactly one JSON object, without Markdown fences or surrounding prose:

```json
{"schema":"pattern-language.decompose.v1","groups":[{"name":"Cattle and dairy","misfits":["m7","m53"]}]}
```

The top-level keys are exactly `schema` and `groups`.

- `schema` is exactly `pattern-language.decompose.v1`.
- `groups` is a list of 8 to 16 group objects, each with exactly `name` and
  `misfits`.
- `name` is a nonempty string naming the shared concern.
- `misfits` is a nonempty list of distinct misfit IDs.
- Every misfit ID `m1` through `m141` appears in exactly one group. Unknown,
  duplicate or omitted IDs are invalid. Every group has at least 2 members.

No extra fields, duplicate JSON object keys, rationale text, executable source,
or alternate spellings are accepted. JSON whitespace before and after the
object is allowed. Object key order does not affect meaning.

## Bounds

The scorer checks the artifact for exact coverage and the bounds above, then
measures pairwise agreement with a hidden expert reference decomposition and
checks how many supplied links keep both endpoints inside one group. The
artifact is data; it is never executed.
