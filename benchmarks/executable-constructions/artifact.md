# Closed construction artifact

Return exactly one JSON object, without Markdown fences or surrounding prose:

```json
{"schema":"pattern-language.construct.v1","storage":{"op":"append-journal"},"commit":{"op":"bounded-batch","maxItems":2,"maxTicks":1}}
```

The top-level keys are exactly `schema`, `storage`, and `commit`.

- `schema` is exactly `pattern-language.construct.v1`.
- `storage` has exactly one key, `op`, whose value is `append-journal` or
  `replace-snapshot`.
- Immediate commit is exactly `{"op":"each"}`.
- Bounded commit has exactly `op`, `maxItems`, and `maxTicks`, with `op` equal to
  `bounded-batch`, `maxItems` equal to the number 2 or 4, and `maxTicks` equal to
  the number 1 or 3.

No extra fields, duplicate JSON object keys, rationale text, executable source,
numeric strings, nonfinite numbers, or alternate spellings are accepted. JSON
whitespace before and after the object is allowed. Object key order does not
affect meaning or emitted source. There are ten distinct constructions: two
storage operators multiplied by immediate commit or four bounded commits.
Responses are bounded to 16,384 JavaScript string code units; deeper than 32
nested JSON containers is invalid. Every admissible artifact is much smaller.

The public compiler exports:

```js
parseArtifact(raw);          // { valid, artifact, errors }; never throws
validateArtifact(value);     // { valid, artifact, errors }; never throws
enumerateDesigns();          // canonical array of ten fresh valid artifacts
compile(artifact);          // deterministic ES-module source; invalid => throws
```

For invalid input, `artifact` is `null` and `errors` is a nonempty string array.
For valid input, `artifact` is a fresh canonical object and `errors` is empty.
`parseArtifact` accepts only a string containing strict JSON. `validateArtifact`
accepts ordinary JSON-shaped data. Compilation uses only validated closed
choices and bounded integers, never model-supplied JavaScript. The emitted
module exports `create(host)` as specified in [contract.md](contract.md).
