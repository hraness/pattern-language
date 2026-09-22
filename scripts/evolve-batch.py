#!/usr/bin/env python3
"""Batch statistics over the judged-evolution loop.

Runs evolve-jury.py N times (live by default) and aggregates the
distribution the single-run reports can't show: how often judged fit
escapes the mechanical contract, how often the panel contests duels,
whether the contract-side slot keeps the tradition reconciled, and how
often the generator fails outright.

Usage: evolve-batch.py <habitat-dir> [--runs N] [--gens N]
       [--jury FILE] [--live|--responses FILE] [--out FILE]
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(HERE, "evolve-jury.py")

def main():
    habitat = sys.argv[1]
    runs = int(sys.argv[sys.argv.index("--runs") + 1]) if "--runs" in sys.argv else 4
    gens = int(sys.argv[sys.argv.index("--gens") + 1]) if "--gens" in sys.argv else 2
    jury = sys.argv[sys.argv.index("--jury") + 1] if "--jury" in sys.argv else "reconciled-jury.algal.json"
    live = "--live" in sys.argv
    out_name = (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv
                else ("evolve-batch.live.report.json" if live else "evolve-batch.report.json"))
    resp = (sys.argv[sys.argv.index("--responses") + 1]
            if "--responses" in sys.argv else None)

    run_dir = os.path.join(habitat, "batch-runs")
    os.makedirs(run_dir, exist_ok=True)
    records = []
    for i in range(runs):
        cmd = ["python3", DRIVER, habitat, "--gens", str(gens), "--jury", jury]
        cmd += ["--live"] if live else ["--responses", resp]
        t0 = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True)
        report_name = "evolve.live.report.json" if live else "evolve.report.json"
        report_path = os.path.join(habitat, report_name)
        rep = json.load(open(report_path)) if os.path.exists(report_path) else None
        rec = {"run": i, "seconds": round(time.time() - t0, 1),
               "tail": (p.stdout + p.stderr).strip().splitlines()[-1:] or [""]}
        if rep:
            dst = os.path.join(run_dir, f"run-{i}.{report_name}")
            os.replace(report_path, dst)
            rec["report"] = f"batch-runs/run-{i}.{report_name}"
            rec["generations"] = rep["generations"]
            rec["finalChampion"] = rep.get("finalChampion")
            rec["judgedChampion"] = rep.get("judgedChampion")
            rec["escaped"] = rep.get("escaped")
            rec["reconciled"] = rep.get("reconciled")
        else:
            rec["error"] = (p.stdout + p.stderr)[-400:]
        records.append(rec)
        print(f"run {i}: {rec['tail'][0]} ({rec['seconds']}s)")

    gens_total = sum(len(r.get("generations", [])) for r in records)
    escapes = sum(1 for r in records for g in r.get("generations", [])
                  if g.get("escaped") is True)
    divergent = sum(1 for r in records for g in r.get("generations", [])
                    if (g.get("judgedChampion") or {}).get("key")
                    != (g.get("champion") or {}).get("key"))
    contested = sum(g.get("contested", 0) for r in records for g in r.get("generations", []))
    duels = sum(g.get("duels", 0) for r in records for g in r.get("generations", []))
    finals = [r for r in records if r.get("finalChampion")]
    reconciled_finals = sum(1 for r in finals if r.get("reconciled") is True)
    generated_champs = sum(1 for r in finals
                           if not r["finalChampion"]["key"].startswith(
                               tuple(k["manifestKey"].split(":")[-1]
                                     for k in json.load(open(os.path.join(habitat, "foundry.report.json")))["candidates"])))
    agg = {
        "contract": "pattern-language.evolve-batch.v1",
        "habitat": habitat, "jury": jury, "runs": runs, "gens": gens,
        "mode": "live" if live else "scripted",
        "generations": gens_total,
        "judgedEscapes": escapes,
        "divergentChampions": divergent,
        "contestedDuels": contested, "duels": duels,
        "reconciledFinalChampions": f"{reconciled_finals}/{len(finals)}",
        "generatedFinalChampions": generated_champs,
        "seconds": sum(r["seconds"] for r in records),
        "records": records,
    }
    path = os.path.join(habitat, out_name)
    with open(path, "w") as fh:
        json.dump(agg, fh, indent=1)
        fh.write("\n")
    print(f"\nbatch: {gens_total} generations, {escapes} judged escapes, "
          f"{divergent} divergent champions, "
          f"{reconciled_finals}/{len(finals)} reconciled finals, "
          f"{generated_champs} generated final champions")
    print("wrote", path)

if __name__ == "__main__":
    main()
