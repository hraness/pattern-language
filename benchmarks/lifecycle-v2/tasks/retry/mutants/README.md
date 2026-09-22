# Deliberate retry regressions

These self-contained modules are defective copies of `../reference.mjs` for
testing the evaluator. They are not competing designs or model-generated code.

| Mutant | Changed behavior | Focused case that must fail |
| --- | --- | --- |
| `falsy-failure.mjs` | Treats a falsy rejection as success | `base.one_attempt_countercontext` |
| `skip-wait.mjs` | Starts the next attempt before backoff finishes | `base.serial_attempt_and_wait` |
| `overwrite-terminal.mjs` | Allows a later cause to replace an earlier one | `change.terminal_before_abort` |
| `ignore-cancellation.mjs` | Ignores the validated signal | `change.preaborted` |
| `listener-leak.mjs` | Leaves the invocation's abort listener installed | `change.cleanup_all_paths` |
