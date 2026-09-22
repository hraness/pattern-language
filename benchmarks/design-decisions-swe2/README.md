# Design decisions with SWE-2

The user selected the existing Devin account's free SWE-2 route instead of a
new paid Claude study. This sibling study preserves the
[prepared tasks and method](../design-decisions-v3/README.md) and records the
[provider amendment](protocol.md) separately. The original frozen Claude plan
is unchanged and unrun.

The adapter requires qualified XCB application generation, exact SWE-2 High,
fresh account-bound Free eligibility, no tools and serial requests. XCB does
not report billed cost; missing cost telemetry is recorded honestly. No paid
fallback or automatic retry is permitted.

Status: adapter implemented and tested offline; provider qualification pending.
The initial live qualification returned `provider_error` with completed cleanup;
XCB kept generation disabled. No benchmark requests have run.

Offline checks (no provider calls):

```sh
python3 scripts/test_design_swe2_runner.py
node benchmarks/design-decisions-swe2/test-score.mjs
```

After the exact installed XCB binary/account/model has passed supported native
application qualification, prepare a new private directory outside the checkout:

```sh
python3 scripts/run-design-swe2.py prepare /absolute/private/study-directory
python3 scripts/run-design-swe2.py run /absolute/private/study-directory \
  --approve-36-requests-catalog-free-route
```

The run command's explicit flag records the authorized free route; it does not
enable paid use or bypass XCB qualification. Preparation queries metadata only.
The runner refuses reuse of a started directory. It never executes candidates.
After generation and exact-source static review, score locally:

```sh
node benchmarks/design-decisions-swe2/score.mjs PLAN.json RUN.json REVIEWED.json \
  --out EVALUATION.json
```

The review receipt uses the original `pattern-language.design-review.v1` schema
and lists every present code artifact's `id` and `sha256`. Evaluation validates
the full plan, provider receipts, prompts and review before executing any code.
Use `--replay EVALUATION.json` to compare all recorded outcomes and observations.
