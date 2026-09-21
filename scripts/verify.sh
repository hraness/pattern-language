#!/usr/bin/env bash
# Repo gate: every manifest must admit, and every fixture must replay to
# outcome=complete. Deterministic manifests run on args alone; judgment
# manifests replay their recorded responses.
set -u
cd "$(dirname "$0")/.."
ALGAL="bunx github:hraness/algal"
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

[ "$fail" = "0" ] && echo "ALL GREEN" || { echo "FAILURES"; exit 1; }
