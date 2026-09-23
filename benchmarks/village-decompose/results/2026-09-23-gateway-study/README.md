# Village-decomposition: complete 36-request comparison — 2026-09-23 (Vercel AI Gateway / claude-sonnet-4.6)

**The frozen comparison completed and answered its question: no arm
differentiates.** All 36 requests returned responses; 28 produced valid
artifacts covering the 141-misfit universe exactly once. Scored against
Alexander's published 12-subset decomposition, the three arms land in the same
band (denominator-level mean adjusted Rand ≈ 0.07–0.09; ≈ 0.105 among valid
artifacts). The pattern arm was numerically the *lowest* — its guidance did not
recover more reference structure and produced more invalid artifacts.

This is the first of several gateway runs — see `../README.md` for the
combined multi-model analysis (sonnet replicate, opus-4.8 and gpt-5.2
cross-checks, and the mechanism finding).

The live study ran through the **Vercel AI Gateway** route
(`provider-gateway.py` + `gateway-client.py`) on `anthropic/claude-sonnet-4.6` —
the xcb `devin/swe-2-high` route could not complete the schedule (see *Evidence
trail*). The route is bounded-spend: every request's `usage.cost` is recorded
and the run enforces a hard `enforcedUsdBudget` stop.

## Accounting

| Count | Value |
|---|---:|
| Planned slots | 36 |
| Admitted requests | 36 |
| Completed responses | 36 |
| Provider attempts (incl. retries) | 36 |
| Valid artifacts | 28 |
| Coverage-complete | 28 |
| Mechanical (≥20/144 sample links inside) | 27 |
| Reported spend | **$2.75** (36 requests; run-level knownCostUsd) |
| Enforced budget | $10.00 (not reached) |
| Median request time | ~24 s (range 11–88 s) |

Each request was admitted serially with the eligibility check (executable
identity, account, qualification receipt, live `/v1/models` catalog state)
re-verified before admission; `run.json` records every envelope and the exact
preserved response text; `evaluation.json` records the scored outcome per
attempt.

## Outcomes by arm

`denomARI` averages adjusted Rand over all 12 planned slots (invalid counts as
failure); `validARI` averages over scored artifacts only; `links` is mean
sample-links kept inside one group.

| Arm | valid/12 | denomARI | validARI | links (of 144) |
|---|---:|---:|---:|---:|
| direct | 10 | 0.089 | 0.107 | 23.9 |
| checklist | 10 | 0.089 | 0.107 | 24.6 |
| pattern | 8 | 0.070 | 0.105 | 26.4 |

Among *valid* artifacts the arms are statistically indistinguishable
(~0.105–0.107 — the topical-clustering band seen on swe-2 exploratory
partials). Two pattern-arm observations stand out: it kept the most sample
links inside one group (26.4 mean — the coupling-first guidance did push
attention to the link table) yet agreed with the reference no better; and it
produced the most invalid artifacts (4 coverage failures), which is what drags
its denominator-level mean down.

The eight invalid artifacts are honest model failures — partitions whose
member lists did not cover the universe exactly once (or had an undersized
group). No artifact was dropped for being off-argument; they failed mechanical
contract checks.

## What this establishes — and what it does not

- The differentiating instrument now has a complete scored run: on
  claude-sonnet-4.6 the linked-construction guidance produced **no measurable
  benefit** over direct or checklist decomposition, and modestly hurt artifact
  reliability.
- It does **not** show the pattern procedure hurts in general — the
  denominator gap is a validity effect (4/12 vs 2/12 invalid), and n=12 per
  arm bounds any claim to this model, task, and guidance text.
- Combined with the exploratory swe-2 partials (direct/checklist ~0.10–0.13,
  the one completed pattern artifact 0.109 — never a full run), two different
  models now show the same null.
- The reference is Alexander's 1973 published decomposition; nothing here
  rules out the model partially reproducing memorized structure, and a single
  village task does not test decomposition generally.

## Evidence trail

The completed run's `plan.json` embeds the full frozen dependency closure
(task, dataset, oracle, sample-links, guidance, runner, provider module,
gateway client, scorer). The plan froze the working tree at
`2026-09-23T17:35Z`; after this run the instrument gained the
`budget_exceeded` failure mapping, the qualification→frozen-file binding, and
protocol documentation, so the current tree's bytes differ from the frozen
closure for `protocol.md`, `run-village-study.py`, `provider-gateway.py`,
`gateway-client.py`, `test_village_gateway.py` — the frozen texts inside
`plan.json` remain the authoritative record.

To replay byte-for-byte: extract the plan's embedded frozen texts into a
scratch tree and score against it —

```
python3 - <<'PY'
import json; from pathlib import Path
p = json.load(open('plan.json'))
for name, f in p['files'].items():
    path = Path('/tmp/village-replay')/name
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(f['text'])
PY
VILLAGE_PROVIDER_FILE=provider-gateway.py python3 scripts/score-village-study.py \
  plan.json run.json --replay evaluation.json --root /tmp/village-replay
```

**xcb route status:** the swe-2 route produced 19 exploratory responses over
~9 h of retries (17 direct + 2 checklist, ARI ~0.10–0.13 — same band) but never
completed the schedule: account contention (fixed by rerouting to a second
imported account, PR #13) plus generation latency straddling the route's hard
120 s cap (~48% per-request success → a 36-shot run is statistically out of
reach). Bounded retries (PR #14) and the gateway route resolved the delivery
problem. A stopped replicate of this study (`../2026-09-23-gateway-stopped`)
reached 11 admissions / 10 responses before the shared gateway key's $10.00
platform budget exhausted — the provider-level 402 stops the run as
`usd-budget-exceeded`, which is the bounded-spend control working.
