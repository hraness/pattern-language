# Artifact outcomes

Each row is one generated module. Pass counts describe frozen checks, not independent trials.

| Artifact | Checks passed | Failed case IDs | Reported USD |
|---|---:|---|---:|
| `mapper-direct-r1-base` | 12/12 | — | 0.061362 |
| `mapper-checklist-r1-base` | 12/12 | — | 0.055554 |
| `mapper-pattern-r1-base` | 12/12 | — | 0.062562 |
| `retry-direct-r1-base` | 9/10 | `base.policy_failure` | 0.064029 |
| `retry-checklist-r1-base` | 9/10 | `base.policy_failure` | 0.066916 |
| `retry-pattern-r1-base` | 9/10 | `base.policy_failure` | 0.052629 |
| `atomic-direct-r1-base` | 12/12 | — | 0.061008 |
| `atomic-checklist-r1-base` | 12/12 | — | 0.040090 |
| `atomic-pattern-r1-base` | 12/12 | — | 0.054903 |
| `retry-checklist-r2-base` | 10/10 | — | 0.040451 |
| `retry-pattern-r2-base` | 9/10 | `base.policy_failure` | 0.072309 |
| `retry-direct-r2-base` | 9/10 | `base.policy_failure` | 0.068769 |
| `atomic-checklist-r2-base` | 12/12 | — | 0.054965 |
| `atomic-pattern-r2-base` | 12/12 | — | 0.047118 |
| `atomic-direct-r2-base` | 12/12 | — | 0.054058 |
| `mapper-checklist-r2-base` | 9/12 | `base.capacity_order`, `base.scale_31_1`, `base.scale_513_7` | 0.063194 |
| `mapper-pattern-r2-base` | 12/12 | — | 0.047097 |
| `mapper-direct-r2-base` | 12/12 | — | 0.084827 |
| `atomic-pattern-r3-base` | 12/12 | — | 0.057093 |
| `atomic-direct-r3-base` | 12/12 | — | 0.064968 |
| `atomic-checklist-r3-base` | 12/12 | — | 0.057410 |
| `mapper-pattern-r3-base` | 11/12 | `base.falsy_reasons` | 0.074077 |
| `mapper-direct-r3-base` | 12/12 | — | 0.098052 |
| `mapper-checklist-r3-base` | 8/12 | `base.capacity_order`, `base.falsy_reasons`, `base.scale_31_1`, `base.scale_513_7` | 0.053174 |
| `retry-pattern-r3-base` | 9/10 | `base.policy_failure` | 0.037259 |
| `retry-direct-r3-base` | 9/10 | `base.policy_failure` | 0.069069 |
| `retry-checklist-r3-base` | 10/10 | — | 0.052106 |
| `mapper-direct-r1-change` | 20/20 | — | 0.074557 |
| `mapper-checklist-r1-change` | 20/20 | — | 0.072541 |
| `mapper-pattern-r1-change` | 19/20 | `change.abort_then_sync_throw` | 0.060176 |
| `retry-direct-r1-change` | 17/20 | `base.policy_failure`, `change.synchronous_abort_operation`, `change.shared_signal_independence` | 0.081681 |
| `retry-checklist-r1-change` | 18/20 | `base.policy_failure`, `change.abort_inside_policy` | 0.067191 |
| `retry-pattern-r1-change` | 17/20 | `base.policy_failure`, `change.synchronous_abort_operation`, `change.shared_signal_independence` | 0.063738 |
| `atomic-direct-r1-change` | 20/20 | — | 0.075828 |
| `atomic-checklist-r1-change` | 20/20 | — | 0.062200 |
| `atomic-pattern-r1-change` | 19/20 | `atomic-self-transfer` | 0.058916 |
| `retry-checklist-r2-change` | 19/20 | `change.signal_validation` | 0.078218 |
| `retry-pattern-r2-change` | 19/20 | `base.policy_failure` | 0.074631 |
| `retry-direct-r2-change` | 17/20 | `base.policy_failure`, `change.synchronous_abort_operation`, `change.shared_signal_independence` | 0.066247 |
| `atomic-checklist-r2-change` | 20/20 | — | 0.050788 |
| `atomic-pattern-r2-change` | 20/20 | — | 0.070123 |
| `atomic-direct-r2-change` | 20/20 | — | 0.068442 |
| `mapper-checklist-r2-change` | 17/20 | `base.capacity_order`, `base.scale_31_1`, `base.scale_513_7` | 0.080645 |
| `mapper-pattern-r2-change` | 19/20 | `change.abort_then_sync_throw` | 0.057007 |
| `mapper-direct-r2-change` | 20/20 | — | 0.065218 |
| `atomic-pattern-r3-change` | 20/20 | — | 0.047237 |
| `atomic-direct-r3-change` | 20/20 | — | 0.080615 |
| `atomic-checklist-r3-change` | 20/20 | — | 0.058552 |
| `mapper-pattern-r3-change` | 18/20 | `base.falsy_reasons`, `change.abort_then_sync_throw` | 0.062303 |
| `mapper-direct-r3-change` | 20/20 | — | 0.071223 |
| `mapper-checklist-r3-change` | 16/20 | `base.capacity_order`, `base.falsy_reasons`, `base.scale_31_1`, `base.scale_513_7` | 0.074282 |
| `retry-pattern-r3-change` | 18/20 | `base.policy_failure`, `change.signal_validation` | 0.073223 |
| `retry-direct-r3-change` | 18/20 | `base.policy_failure`, `change.signal_validation` | 0.071170 |
| `retry-checklist-r3-change` | 15/20 | `change.signal_validation`, `change.abort_wait_drains`, `change.synchronous_abort_operation`, `change.abort_inside_policy`, `change.shared_signal_independence` | 0.067635 |
