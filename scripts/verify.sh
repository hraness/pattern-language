#!/usr/bin/env bash
# Repo gate: every manifest must admit, and every fixture must replay to
# outcome=complete. Deterministic manifests run on args alone; judgment
# manifests replay their recorded responses.
set -u
cd "$(dirname "$0")/.."
ALGAL="bunx github:hraness/algal"
# Local algal checkout for search-verify — the bunx pin predates the
# scorer-propagation fix (hraness/algal 43c9dcf).
ALGAL_LOCAL="${ALGAL_LOCAL:-$HOME/src/algal/cli.ts}"
STORE="${ALGAL_STORE:-/tmp/pl-verify-store}"
fail=0

check() {
  out=$($ALGAL check "$1" --modules programs/ 2>&1 | tail -1)
  ok=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
  if [ "$ok" = "True" ]; then echo "check  OK  $1"; else echo "check  FAIL $1"; printf '%s\n' "$out"; fail=1; fi
}

run() { # manifest args [responses]
  out=$($ALGAL run "$1" --args "$2" ${3:+--responses "$3"} --modules programs/ --dir "$STORE" 2>&1 | tail -1)
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

# Appendix I benchmark: greedy average-linkage must stay non-degenerate
# and within range of Alexander's published partition (agreement >= 0.6).
out=$(python3 scripts/decompose-village.py 12 avg)
printf '%s\n' "$out" | head -3
agree=$(printf '%s\n' "$out" | python3 -c 'import sys,re; m=re.search(r"agreement[^:]*: (\d+\.\d+)", sys.stdin.read()); print(m.group(1))')
python3 -c "import sys; sys.exit(0 if float('$agree') >= 0.6 else 1)" \
  && echo "bench  OK  village decompose agreement=$agree" \
  || { echo "bench  FAIL village decompose agreement=$agree"; fail=1; }

# Transfer test (report-only): mechanical import links on a real codebase.
if [ -f ensembles/algal-src.ensemble.json ]; then
  python3 scripts/decompose-village.py 10 avg \
    ensembles/algal-src.ensemble.json ensembles/algal-src.decomposition.json | head -3
fi

# Habitat gate: the foundry must promote verdict-line and verify offline.
out=$(cd habitat/status-line && $ALGAL foundry foundry.config.json --dir "$STORE" --out foundry.report.json 2>&1 | tail -1)
prom=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("promoted",""))' 2>/dev/null)
want=$(python3 -c 'import json,subprocess; print(json.loads(subprocess.run(["bunx","github:hraness/algal","digest","habitat/status-line/verdict-line.algal.json"],capture_output=True,text=True).stdout)["digest"])')
if [ "$prom" = "$want" ]; then echo "foundry OK  verdict-line promoted"; else echo "foundry FAIL promoted=$prom"; fail=1; fi
vout=$(cd habitat/status-line && $ALGAL foundry verify foundry.report.json --dir "$STORE" 2>&1 | tail -1)
vok=$(printf '%s' "$vout" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null)
[ "$vok" = "True" ] && echo "foundry OK  report verifies offline" || { echo "foundry FAIL verify"; fail=1; }

# Generated-population path: writer replays recorded descriptors; the
# assembler + evaluation are deterministic, so this gates fully offline.
out=$(cd habitat/status-line && $ALGAL foundry foundry-gen.config.json \
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

[ "$fail" = "0" ] && echo "ALL GREEN" || { echo "FAILURES"; exit 1; }
