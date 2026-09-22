#!/usr/bin/env bash
# Repo gate: every manifest must admit, and every fixture must replay to
# outcome=complete. Deterministic manifests run on args alone; judgment
# manifests replay their recorded responses.
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -a ALGAL <<< "${ALGAL_CMD:-bunx github:hraness/algal}"
# Local algal checkout for search-verify — the bunx pin predates the
# scorer-propagation fix (hraness/algal 43c9dcf).
ALGAL_LOCAL="${ALGAL_LOCAL:-$HOME/src/algal/cli.ts}"
STORE="${ALGAL_STORE:-/tmp/pl-verify-store}"
fail=0

check() {
  out=$("${ALGAL[@]}" check "$1" --modules programs/ 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  if [ "$ok" = "True" ]; then echo "check  OK  $1"; else echo "check  FAIL $1"; printf '%s\n' "$out"; fail=1; fi
}

run() { # manifest args [responses]
  out=$("${ALGAL[@]}" run "$1" --args "$2" ${3:+--responses "$3"} --modules programs/ --dir "$STORE" 2>&1 | tail -1)
  oc=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("outcome"))' 2>/dev/null)
  if [ "$oc" = "complete" ]; then echo "run    OK  $1"; else echo "run    FAIL $1"; printf '%s\n' "$out" | head -20; fail=1; fi
}

for f in patterns/*.algal.json programs/*.algal.json; do check "$f"; done

run patterns/bounded-slice.algal.json patterns/bounded-slice.args.json
run patterns/provenance-line.algal.json patterns/provenance-line.args.json
run patterns/verdict-first.algal.json patterns/verdict-first.args.json
run patterns/declared-failure-path.algal.json patterns/declared-failure-path.fit.args.json
run patterns/declared-failure-path.algal.json patterns/declared-failure-path.misfit.args.json
run patterns/context-view.algal.json patterns/context-view.args.json patterns/context-view.responses.json
run patterns/piecemeal-tradition.algal.json patterns/piecemeal-tradition.args.json
run programs/enumerate.algal.json programs/enumerate.args.json programs/enumerate.responses.json
run programs/correlate.algal.json programs/correlate.args.json programs/correlate.responses.json
run programs/decompose.algal.json programs/decompose.args.json
run programs/diagram.algal.json programs/diagram.args.json programs/diagram.responses.json
run programs/realize.algal.json programs/realize.args.json
run programs/synthesize.algal.json programs/synthesize.args.json programs/synthesize.responses.json

python3 - <<'PY'
import json
e = json.load(open("ensembles/village.ensemble.json"))
d = json.load(open("ensembles/village.decomposition.json"))
ids = {m["id"] for m in e["misfits"]}
dec = {x for v in d["subsets"].values() for x in v}
assert len(ids) == 141 and ids == dec, "village ensemble/oracle mismatch"
print("data   OK  village ensemble + oracle (141 misfits, 1434 links)")
PY

# Metric validity and the existing historical regression floor, plus a
# chance-corrected comparison. This is a fixed-fixture regression check,
# not a fresh significance test or evidence of code-design effectiveness.
python3 scripts/test_partition_metrics.py
out=$(python3 scripts/decompose-village.py 12 avg --json --baseline-samples 200 --seed 0)
printf '%s\n' "$out" | python3 -c '
import json,sys
r=json.load(sys.stdin); m=r["metrics"]; b=r["baseline"]
assert m["rand_index"] >= 0.6, "historical partition regression"
assert m["adjusted_rand_index"] > b["p95_adjusted_rand_index"], "ARI does not exceed size-preserving null"
print("bench  OK  village ARI=%.4f > null p95=%.4f (legacy Rand=%.4f)" %
      (m["adjusted_rand_index"], b["p95_adjusted_rand_index"], m["rand_index"]))'

# Transfer test (report-only): mechanical import links on a real codebase.
if [ -f ensembles/algal-src.ensemble.json ]; then
  python3 scripts/decompose-village.py 10 avg \
    ensembles/algal-src.ensemble.json ensembles/algal-src.decomposition.json | head -4
fi

# Habitat gate: the foundry must promote verdict-line and verify offline.
out=$(cd habitat/status-line && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("promoted",""))' 2>/dev/null)
want=$("${ALGAL[@]}" digest habitat/status-line/verdict-line.algal.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["digest"])')
if [ "$prom" = "$want" ]; then echo "foundry OK  verdict-line promoted"; else echo "foundry FAIL promoted=$prom"; fail=1; fi
vout=$(cd habitat/status-line && "${ALGAL[@]}" foundry verify foundry.report.json --dir "$STORE" 2>&1 | tail -1)
vok=$(printf '%s' "$vout" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
[ "$vok" = "True" ] && echo "foundry OK  report verifies offline" || { echo "foundry FAIL verify"; fail=1; }

# Generated-population path: writer replays recorded descriptors; the
# assembler + evaluation are deterministic, so this gates fully offline.
out=$(cd habitat/status-line && "${ALGAL[@]}" foundry foundry-gen.config.json \
  --responses generator.responses.json --dir "$STORE" --out foundry-gen.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:gen-verdict-line" ] && echo "foundry OK  generated verdict-line promoted" \
  || { echo "foundry FAIL gen promoted=$prom"; fail=1; }

# Generational search: two scripted generations over gen-1 seeds under the
# shifted scorer (executor provenance required). Verifies with the local
# algal checkout's search-verify (upstream fix 43c9dcf).
out=$(cd habitat/status-line && bun "$ALGAL_LOCAL" foundry search foundry-search.config.json \
  --responses generator-search.responses.json --dir "$STORE" --out foundry-search.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["result"]["candidates"] if c["manifestDigest"]==r["result"]["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:g1-bracket" ] && echo "search  OK  gen-1 bracket promoted after feedback" \
  || { echo "search  FAIL promoted=$prom"; fail=1; }
vout=$(cd habitat/status-line && bun "$ALGAL_LOCAL" foundry search-verify foundry-search.report.json --dir "$STORE" 2>&1 | tail -1)
vok=$(printf '%s' "$vout" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
[ "$vok" = "True" ] && echo "search  OK  report verifies offline" || { echo "search  FAIL verify"; fail=1; }

# Commit-subject habitat: mechanical foundry + judged jury (replayed).
for f in habitat/commit-subject/*.algal.json; do
  out=$("${ALGAL[@]}" check "$f" --modules habitat/commit-subject 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
out=$(cd habitat/commit-subject && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:verb-what" ] && echo "foundry OK  verb-what promoted (mechanical)" \
  || { echo "foundry FAIL cs promoted=$prom"; fail=1; }
out=$(cd habitat/commit-subject && "${ALGAL[@]}" run jury.algal.json --args jury.args.json --modules . \
  --responses jury.responses.json --dir "$STORE" 2>&1 | tail -1)
champ=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["cells"]["tally"]["outputs"]["out"]["champion"]["key"])' 2>/dev/null)
[ "$champ" = "why-tail" ] && echo "jury   OK  why-tail champion (judged)" \
  || { echo "jury   FAIL champion=$champ"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/commit-subject --generations 1 \
  --responses habitat/commit-subject/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "verb-what" ] && echo "evolve OK  judged evolution loop replays" \
  || { echo "evolve FAIL champion=$champ"; fail=1; }

# Run-summary habitat: real gate-output records. Mechanical foundry clears
# all formats; the panel jury discriminates; judged evolution replays.
for f in habitat/run-summary/*.algal.json; do
  out=$("${ALGAL[@]}" check "$f" --modules habitat/run-summary 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
out=$(cd habitat/run-summary && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:tool-lead" ] && echo "foundry OK  tool-lead promoted (mechanical)" \
  || { echo "foundry FAIL rs promoted=$prom"; fail=1; }
out=$(cd habitat/run-summary && "${ALGAL[@]}" run panel-jury.algal.json --args panel.args.json --modules . \
  --responses jury.responses.json --dir "$STORE" 2>&1 | tail -1)
champ=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["cells"]["tally"]["outputs"]["out"]["champion"]["key"])' 2>/dev/null)
[ "$champ" = "metric-first" ] && echo "jury   OK  metric-first champion (panel-judged)" \
  || { echo "jury   FAIL champion=$champ"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/run-summary --gens 1 \
  --jury reconciled-jury.algal.json --responses habitat/run-summary/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "arrow-format" ] && echo "evolve OK  contract keeps arrow-format; judged escape recorded" \
  || { echo "evolve FAIL champion=$champ"; fail=1; }
python3 - <<'PY' && echo "mech   OK  judged escape + named misfit recorded" || { echo "mech   FAIL arbitration record wrong"; fail=1; }
import json
r = json.load(open("habitat/run-summary/evolve.report.json"))
g = r["generations"][-1]
m = g["mechanical"][r["judgedChampion"]["key"]]
assert r["judgedChampion"]["key"] == "verdict-lead" and r["escaped"] is True
assert m["passed"] is False and any("tool" in json.dumps(t) for t in m["failed"]), m
assert r["finalChampion"]["key"] == "arrow-format" and r["reconciled"] is True
PY

# Commit-message habitat: structured artifact (subject + body) with a
# cross-field contract — the body must carry the why.
for f in habitat/commit-message/*.algal.json; do
  out=$("${ALGAL[@]}" check "$f" --modules habitat/commit-message 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
out=$(cd habitat/commit-message && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:act-why" ] && echo "foundry OK  act-why promoted (mechanical)" \
  || { echo "foundry FAIL cm promoted=$prom"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/commit-message --gens 1 \
  --jury reconciled-jury.algal.json --responses habitat/commit-message/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "verb-what-why" ] && echo "evolve OK  generated verb-what-why dethrones incumbent" \
  || { echo "evolve FAIL champion=$champ"; fail=1; }
python3 - <<'PY' && echo "mech   OK  structural violators named" || { echo "mech   FAIL structural mech wrong"; fail=1; }
import json
r = json.load(open("habitat/commit-message/evolve.report.json"))
g = r["generations"][-1]
assert g["mechanical"]["scope-line"]["passed"] is False
assert g["mechanical"]["impact-brief"]["passed"] is False
assert g["mechanical"]["verb-what-why"]["passed"] is True
assert r["finalChampion"]["key"] == "verb-what-why" and r["reconciled"] is True
PY

# Partition habitat: decomposition artifacts — named groups over a misfit
# set with coupling (co-location) and separation requirements.
for f in habitat/partition/*.algal.json; do
  out=$("${ALGAL[@]}" check "$f" --modules habitat/partition 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
out=$(cd habitat/partition && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; r=json.load(sys.stdin); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:coupled-pairs" ] && echo "foundry OK  coupled-pairs promoted (mechanical)" \
  || { echo "foundry FAIL partition promoted=$prom"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/partition --gens 1 \
  --jury reconciled-jury.algal.json --responses habitat/partition/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "force-pairs" ] && echo "evolve OK  generated force-pairs dethrones incumbent" \
  || { echo "evolve FAIL partition champion=$champ"; fail=1; }
python3 - <<'PY' && echo "mech   OK  structural partition violators named" || { echo "mech   FAIL partition mech wrong"; fail=1; }
import json
r = json.load(open("habitat/partition/evolve.report.json"))
g = r["generations"][-1]
assert g["mechanical"]["visual-groups"]["passed"] is False
assert g["mechanical"]["big-little"]["passed"] is False
assert g["mechanical"]["force-pairs"]["passed"] is True
assert r["finalChampion"]["key"] == "force-pairs" and r["reconciled"] is True
PY

# Partition-src habitat: decomposition at scale — 48 real source modules,
# a cohesion-floor contract, and oracle agreement vs the real directory
# structure as an external anchor.
for f in habitat/partition-src/*.algal.json; do
  out=$(cd habitat/partition-src && "${ALGAL[@]}" check "$(basename "$f")" --modules . 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
(cd habitat/partition-src && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json >/dev/null 2>&1)
prom=$(python3 -c 'import json; r=json.load(open("habitat/partition-src/foundry.report.json")); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:layered-arch" ] && echo "foundry OK  layered-arch promoted (mechanical)" \
  || { echo "foundry FAIL partition-src promoted=$prom"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/partition-src --gens 1 \
  --jury reconciled-jury.algal.json --responses habitat/partition-src/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "clean-layers" ] && echo "evolve OK  generated clean-layers dethrones incumbent" \
  || { echo "evolve FAIL partition-src champion=$champ"; fail=1; }
python3 - <<'PY' && echo "mech   OK  scale violators named + oracle agreement recorded" || { echo "mech   FAIL partition-src mech wrong"; fail=1; }
import json
r = json.load(open("habitat/partition-src/evolve.report.json"))
g = r["generations"][-1]
assert g["mechanical"]["mega-merge"]["passed"] is False
assert g["mechanical"]["lone-wolf"]["passed"] is False
assert g["mechanical"]["clean-layers"]["passed"] is True
st = {s["key"]: s for s in g["standings"]}
assert st["clean-layers"]["oracleAgreement"] > st["round-robin"]["oracleAgreement"]
assert r["finalChampion"]["key"] == "clean-layers" and r["reconciled"] is True
PY

# Partition-village habitat: Alexander's own corpus — 141 misfits, his
# published four-region decomposition as oracle + candidate, generated
# alternatives scored on a declared link subsample inside expr fuel bounds.
for f in habitat/partition-village/*.algal.json; do
  out=$(cd habitat/partition-village && "${ALGAL[@]}" check "$(basename "$f")" --modules . 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  [ "$ok" = "True" ] && echo "check  OK  $f" || { echo "check  FAIL $f"; printf '%s\n' "$out"; fail=1; }
done
(cd habitat/partition-village && "${ALGAL[@]}" foundry foundry.config.json --dir "$STORE" --out foundry.report.json >/dev/null 2>&1)
prom=$(python3 -c 'import json; r=json.load(open("habitat/partition-village/foundry.report.json")); print([c["manifestKey"] for c in r["candidates"] if c["manifestDigest"]==r["promoted"]][0])' 2>/dev/null)
[ "$prom" = "organism:greedy-twelve" ] && echo "foundry OK  greedy-twelve promoted over Alexander partition (mechanical)" \
  || { echo "foundry FAIL partition-village promoted=$prom"; fail=1; }
out=$(python3 scripts/evolve-jury.py habitat/partition-village --gens 2 \
  --jury reconciled-jury.algal.json --responses habitat/partition-village/evolve.responses.json 2>&1 | tail -1)
champ=$(printf '%s' "$out" | sed -n 's/final champion: \([^ ]*\).*/\1/p')
[ "$champ" = "theme-twelve" ] && echo "evolve OK  generated theme-twelve dethrones Alexander partition" \
  || { echo "evolve FAIL partition-village champion=$champ"; fail=1; }
python3 - <<'PY' && echo "mech   OK  village violator named + coverage repaired + oracle recorded" || { echo "mech   FAIL partition-village mech wrong"; fail=1; }
import json
r = json.load(open("habitat/partition-village/evolve.report.json"))
g = r["generations"][1]
# near-miss dropped 7 ids in its raw proposal; the fmt repair program
# placed them by link-density, so the repaired output passes coverage —
# that IS the mechanical-completion proof.
assert g["mechanical"]["near-miss"]["passed"] is True
assert g["mechanical"]["thin-twenty"]["passed"] is False
assert g["mechanical"]["theme-twelve"]["passed"] is True
st = {s["key"]: s for s in g["standings"]}
assert st["theme-twelve"]["oracleAgreement"] == 1.0
assert st["theme-twelve"]["oracleAgreement"] > st["thin-twenty"]["oracleAgreement"]
assert r["finalChampion"]["key"] == "theme-twelve" and r["reconciled"] is True
PY

# Real-code evaluator must accept the reference and reject targeted mutants.
node benchmarks/code-design/self-test.mjs
# Frozen negative outcomes are evidence too: verify per-case reproduction.
node benchmarks/code-design/replay.mjs \
  benchmarks/code-design/results/2026-09-22-haiku-smoke/run.json >/dev/null

# Independent lifecycle transfer contracts, generation controls, and scoring.
node benchmarks/lifecycle-v2/self-test.mjs
python3 scripts/test_lifecycle_runner.py
node benchmarks/lifecycle-v2/test-score.mjs

# Reproduce every recorded live-study outcome, including failed candidates.
study=benchmarks/lifecycle-v2/results/2026-09-22-transfer
node benchmarks/lifecycle-v2/score.mjs "$study/plan.json" "$study/run.json" \
  "$study/reviewed.json" --replay "$study/evaluation.json" >/dev/null

# Inspectable design models: offline reference/fault probes and study provenance.
node benchmarks/design-decisions-v3/tasks/jobs/self-test.mjs
node benchmarks/design-decisions-v3/tasks/batch/self-test.mjs
node benchmarks/design-decisions-v3/test-artifact.mjs
node benchmarks/design-decisions-v3/self-test.mjs
python3 scripts/test_design_runner.py
node benchmarks/design-decisions-v3/test-score.mjs

# Same frozen design tasks through the separately qualified SWE-2 provider.
python3 scripts/test_design_swe2_runner.py
node benchmarks/design-decisions-swe2/test-score.mjs

# Preserve the completed Free-catalog SWE-2 study, including negative outcomes.
study=benchmarks/design-decisions-swe2/results/2026-09-22-study
node benchmarks/design-decisions-swe2/score.mjs "$study/plan.json" "$study/run.json" \
  "$study/reviewed.json" --replay "$study/evaluation.json" >/dev/null

# Closed executable constructions, independent fault/cost oracle and provenance.
node benchmarks/executable-constructions/test-compiler.mjs
node benchmarks/executable-constructions/self-test.mjs
python3 scripts/test_construction_runner.py
node benchmarks/executable-constructions/test-score.mjs

[ "$fail" = "0" ] && echo "ALL GREEN" || { echo "FAILURES"; exit 1; }
