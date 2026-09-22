#!/usr/bin/env python3
"""Judged-evolution driver: the jury is the selector.

Each generation: the generator organism emits candidate format manifests
(descriptors -> assembler -> valid organisms), the incumbent champion and
the newcomers produce subjects on the arena case, and a Jev jury runs the
round-robin. The champion survives; standings feed the next writer call.

Alexander: unselfconscious tradition — inherited constraint (the grammar),
variation (the writer), selection by judged fit (the jury), inheritance
(the champion defending its slot). Every step is a receipted algal run.

Usage: evolve-jury.py <habitat-dir> [--generations N] [--live|--responses FILE]
"""
import itertools, json, os, subprocess, sys, tempfile

ALGAL = os.environ.get("ALGAL_CMD", "bunx github:hraness/algal").split()
STORE = os.environ.get("ALGAL_STORE", "/tmp/pl-store")
EXECUTOR = os.environ.get("AGENT_EXECUTOR", "scripts/agent-executor.py")

def run_algal(args, cwd=None):
    p = subprocess.run(ALGAL + args, capture_output=True, text=True, cwd=cwd)
    lines = [l for l in (p.stdout + p.stderr).splitlines() if l.strip().startswith("{")]
    if not lines:
        raise SystemExit(f"algal produced no JSON: {p.stdout[-400:]} {p.stderr[-400:]}")
    return json.loads(lines[-1]), p

def write_manifest(store_dir, manifest):
    """Persist a generated manifest beside the habitat so digests resolve."""
    import hashlib
    blob = json.dumps(manifest, indent=1).encode()
    path = os.path.join(store_dir, "gen-candidates")
    os.makedirs(path, exist_ok=True)
    f = os.path.join(path, manifest["key"].split(":")[-1] + ".algal.json")
    with open(f, "w") as fh:
        fh.write(blob.decode() + "\n")
    return f

def subject_of(manifest_path, args_file, cwd):
    r, _ = run_algal(["run", manifest_path, "--args", args_file, "--dir", STORE], cwd)
    if r.get("outcome") != "complete":
        return None
    return r["cells"]["fmt"]["outputs"]["out"]

def jury(habitat, subjects, brief, extra_args, cwd, jury_file='jury.algal.json'):
    pairs = [{"brief": brief, "a": a, "b": b}
             for a, b in itertools.combinations(subjects, 2)]
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump({"src": {"subjects": subjects, "pairs": pairs}}, fh)
        args_path = fh.name
    r, _ = run_algal(["run", jury_file, "--args", args_path,
                      "--modules", ".", "--dir", STORE] + extra_args, cwd)
    if r.get("outcome") != "complete":
        raise SystemExit(f"jury failed: {json.dumps(r)[:500]}")
    return r["cells"]["tally"]["outputs"]["out"], r

def main():
    habitat = sys.argv[1]
    generations = int(sys.argv[sys.argv.index("--generations") + 1]) if "--generations" in sys.argv else 2
    generations = int(sys.argv[sys.argv.index("--gens") + 1]) if "--gens" in sys.argv else generations
    jury_file = sys.argv[sys.argv.index("--jury") + 1] if "--jury" in sys.argv else "jury.algal.json"
    resp = None
    if "--responses" in sys.argv:
        resp = os.path.abspath(sys.argv[sys.argv.index("--responses") + 1])
    live = "--live" in sys.argv or resp is None
    # writer + judge answers both come from the same responses fixture
    gen_extra = ["--executor-cmd", os.path.join("..", "..", EXECUTOR)] if live else ["--responses", resp]
    jury_extra = ["--jev"] if live else ["--responses", resp]

    cfg = json.load(open(os.path.join(habitat, "foundry.config.json")))
    arena = [c for c in cfg["cases"] if c["split"] == "holdout"][0]
    src_args = arena["args"].get("src", arena["args"])
    if "job" in src_args:
        brief = {"hint": src_args["job"]["hint"], "change": src_args["job"]["change"],
                 "task": "pick the better commit subject for this change"}
    else:
        brief = {"record": src_args,
                 "task": "pick the better one-line summary for a verification report"}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump({"src": src_args}, fh)
        case_args = fh.name

    # generation 0 population: the hand-written candidates, mechanical survivors only
    report = json.load(open(os.path.join(habitat, "foundry.report.json")))
    survivors = []
    for c in report["candidates"]:
        if c["train"]["passed"] == c["train"]["total"] and c["validation"]["passed"] == c["validation"]["total"]:
            survivors.append(c["manifestKey"].split(":")[-1])
    subjects = []
    for key in survivors:
        subj = subject_of(f"{key}.algal.json", case_args, habitat)
        if subj is not None:
            subjects.append({"key": key, "subject": subj})
    prior = None
    history = []
    champion = None
    for gen in range(generations + 1):
        result, receipt = jury(habitat, subjects, brief, jury_extra, habitat, jury_file)
        champion = result["champion"]
        history.append({"generation": gen, "standings": result["standings"],
                        "champion": champion, "receiptDigest": receipt.get("digest")})
        print(f"gen {gen}: champion={champion['key']} "
              + " ".join(f"{s['key']}:{s['wins']}" for s in result["standings"]))
        if gen == generations:
            break
        # generate: writer sees standings + champion
        prior = {"generation": gen, "champion": champion, "standings": result["standings"],
                 "note": "champion defends its slot; mutate toward judged fit"}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"src": {"task": "one-line summary formats for a change report",
                               "prior": prior}}, fh)
            gen_args = fh.name
        g, _ = run_algal(["run", "generator.algal.json", "--args", gen_args,
                          "--dir", STORE] + gen_extra, habitat)
        if g.get("outcome") != "complete":
            print(f"gen {gen}: generator failed, incumbent carries on")
            continue
        cands = g["cells"]["build"]["outputs"]["out"]
        seen = {s["key"] for s in subjects}
        champ_key = champion["key"]
        subjects = [s for s in subjects if s["key"] == champ_key]  # elite survival
        for m in cands[:8]:
            key = m.get("key", "").split(":")[-1]
            if not key or key in seen:
                continue
            path = write_manifest(habitat, m)
            subj = subject_of(os.path.basename(path), case_args,
                              os.path.join(habitat, "gen-candidates"))
            if subj is not None:
                subjects.append({"key": key, "subject": subj})
                seen.add(key)
        subjects = subjects[:8]

    out = {"contract": "pattern-language.evolve.v1", "habitat": habitat,
           "mode": "live" if live else "scripted",
           "arena": arena["id"], "generations": history,
           "finalChampion": champion}
    name = "evolve.live.report.json" if live else "evolve.report.json"
    with open(os.path.join(habitat, name), "w") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"final champion: {champion['key']} ({champion['wins']} duels)")

if __name__ == "__main__":
    main()
