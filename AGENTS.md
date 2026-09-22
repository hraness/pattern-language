# pattern-language conventions

Manifests are data (`algal.organism.v1`). Runtime: `bunx github:hraness/algal`.

## Adding a pattern

1. `patterns/<kebab-name>.algal.json` — the constructive diagram. The `note`
   field carries the Alexander metadata: `Pattern. Context: ... Forces:
   [+|-] ... Resolution: ...` plus larger/smaller links.
2. `patterns/<name>.args.json` — deterministic args so the pattern runs.
3. `patterns/<name>.responses.json` — only when the pattern has
   agent/decide cells; keyed by cell id (a list value serves per-item
   activations inside `each`).
4. Register it in `catalog/patterns.json` with context, forces, and links.

## Adding a program (method step)

Same shape under `programs/`. If it embeds a sub-manifest by digest
(`each`/`organism`/`repeat` cell), compute the digest with
`algal digest <file>` and wire `--modules programs/` for resolution.

## Gates

- `bash scripts/verify.sh` is the full gate: `check` on every manifest,
  replay of every fixture, village data integrity, and the decompose
  benchmark (agreement ≥ 0.6 vs. Alexander's published partition).
- `bunx github:hraness/algal check <manifest>` must pass before commit.
- Deterministic manifests (no agent/decide cells) must run with `--args`
  alone. Judgment manifests must replay with `--responses`.
- Ensembles use contract `pattern.ensemble.v1`: `{name, context, misfits:
  [{id, text}], links: [{a, b, sign, why}]}`. Links are claims until a
  receipted `correlate` run re-derives them — keep the `why` honest.
- Everything is bounded: declare `budgets`; ensembles over 8 misfits exceed
  `correlate`'s `maxItems` and should be decomposed first.
- `expr` fuel ceiling is 1M per activation — decomposition-scale math on
  the village graph (141 misfits × 1434 links) does not fit; score it
  offline via `scripts/decompose-village.py`, which mirrors the manifest's
  step rule exactly. Keep the two implementations' scoring in sync.
- Digest discipline: editing an embedded manifest changes its digest —
  rewire every parent (`algal digest`, then update `manifest` fields in
  `decompose`, `synthesize`, `correlate`) before committing.
- Foundry configs are strict: `expect` names interface outputs only (put
  extra criteria in `args` or the scorer); configs reject unknown keys
  like `note`; candidates must run without executors if the report is to
  `foundry verify` offline.
- Live runs: `decide` cells route to Jev via `route.provider`; `agent`
  cells go through `--executor-cmd scripts/agent-executor.py` (local
  `claude -p`). Live receipts are execution evidence — they don't replay
  deterministically, so keep scripted fixtures for `verify.sh`.
- Mark proposals as proposals. A manifest that needs a host fn or tool that
  doesn't exist yet is a proposal, not a pattern.
