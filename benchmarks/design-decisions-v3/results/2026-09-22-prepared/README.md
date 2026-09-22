# Prepared design-decision study

Status: frozen preparation only; no v3 model requests have run.

The [exact plan](plan.json) archives 44 input files and all 36 planned
requests: two task families × three arms × three repetitions × design/code.
The configured limits are $0.50 per call and $18 total, requiring a fresh
authorization. The completed 54-call v2 approval does not cover this study.

All task and guidance freezes, the recorded pre-generation evaluator repairs,
source code, tests, protocol, prompt inputs, CLI versions and invocation settings
are embedded. The runner validates the exact current input closure before any
call. There is no resume or automatic retry.

Independent review approved the task/evaluator boundaries, shared artifact
monitor, runner and scorer. Reference and fault-probe results qualify the
measurement tool, not the experimental treatment. See the [benchmark README](../../README.md)
and [prospective protocol](../../protocol.md) for interpretation limits.

Plan SHA-256: `3070394134b2dd9a3bc63ccb54d5346c820217accc3386ca02593f04a79cef64`.
