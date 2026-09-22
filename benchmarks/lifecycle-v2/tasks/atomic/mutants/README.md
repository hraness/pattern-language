# Deliberate faulty implementations

These standalone fixtures alter one behavior from the reference. They check
whether behavioral cases detect plausible mistakes; they do not measure model
quality or pattern effectiveness.

| Module | Fault | Detecting case(s) |
| --- | --- | --- |
| `eager-commit.mjs` | Mutates live balances while validating the batch | `atomic-rollback-funding`, `atomic-overflow-rollback`, `atomic-input-preservation` |
| `key-without-payload.mjs` | Replays every use of a known key regardless of payload | `atomic-id-conflict`, `atomic-id-copy-boundaries` |
| `raw-record-equality.mjs` | Includes ignored fields and property order in payload equality | `atomic-payload-semantic-equality` |
| `receipt-alias.mjs` | Retains and returns caller-visible aliases to saved results | `atomic-id-copy-boundaries` |
| `replay-current-state.mjs` | Returns current state instead of the original saved result | `atomic-replay-original-result`, `atomic-keyed-empty-result` |

All reference and mutant code stays outside candidate generation context.
