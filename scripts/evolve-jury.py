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
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_algal(args, cwd=None):
    # stdout goes to a file, not a pipe: process.stdout.write to a pipe is
    # async and drops data beyond the 64KiB pipe buffer at exit — jury
    # receipts on structural artifacts exceed that routinely.
    with tempfile.NamedTemporaryFile("r", suffix=".out", delete=False) as oh:
        out_path = oh.name
    with open(out_path, "w") as oh:
        p = subprocess.run(ALGAL + args, stdout=oh, stderr=subprocess.PIPE,
                           text=True, cwd=cwd)
    stdout = open(out_path).read()
    lines = [l for l in (stdout + p.stderr).splitlines() if l.strip().startswith("{")]
    if not lines:
        raise SystemExit(f"algal produced no JSON: {stdout[-400:]} {p.stderr[-400:]}")
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

def render(subj, job=None):
    """Structured artifacts render to text for the jury — a commit message
    IS subject + blank line + body; a partition IS its named groups."""
    if isinstance(subj, dict) and "groups" in subj:
        texts = {m["id"]: m["text"] for m in (job or {}).get("misfits", [])}
        lines = []
        for g in subj["groups"]:
            lines.append(f"== {g.get('name', '?')}")
            for mid in g.get("misfits", []):
                lines.append(f"  {mid} {texts.get(mid, '')}".rstrip())
        return "\n".join(lines)
    if isinstance(subj, dict) and "subject" in subj:
        body = subj.get("body") or ""
        return subj["subject"] + ("\n\n" + body if body else "")
    return subj

def subject_of(manifest_path, args_file, cwd):
    r, _ = run_algal(["run", manifest_path, "--args", args_file, "--dir", STORE], cwd)
    if r.get("outcome") != "complete":
        return None
    out = r["cells"]["fmt"]["outputs"]["out"]
    job = {}
    try:
        job = json.load(open(args_file)).get("src", {}).get("job", {})
    except Exception:
        pass
    return {"subject": render(out, job), "raw": out}

def jury(habitat, subjects, brief, extra_args, cwd, jury_file='jury.algal.json',
         mech=None):
    # pairs/standings carry only the judged face: key + rendered subject
    jsubs = [{"key": s["key"], "subject": s["subject"]} for s in subjects]
    pairs = [{"brief": brief, "a": a, "b": b}
             for a, b in itertools.combinations(jsubs, 2)]
    args = {"subjects": jsubs, "pairs": pairs}
    if mech is not None:
        # null ("probe couldn't evaluate") is not a boolean — expr filter
        # rejects it. Unknown counts as not-contract-passing for
        # arbitration; the driver's own mech record keeps the null.
        args["mech"] = [{"key": k, "passed": bool(v["passed"])}
                        for k, v in mech.items()]
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump({"src": args}, fh)
        args_path = fh.name
    r, _ = run_algal(["run", jury_file, "--args", args_path,
                      "--modules", ".", "--dir", STORE] + extra_args, cwd)
    if r.get("outcome") != "complete":
        raise SystemExit(f"jury failed: {json.dumps(r)[:500]}")
    return r["cells"]["tally"]["outputs"]["out"], r

def term_probe_program(prog):
    """Split the scorer's and-conjuncts into a probe program returning a
    list of booleans, keeping the scorer's let-bindings intact so terms
    see the same env."""
    lets, node = [], prog
    while isinstance(node, list) and node[:1] == ["let"] and len(node) == 4:
        lets.append((node[1], node[2]))
        node = node[3]
    terms = node[1:] if isinstance(node, list) and node[:1] == ["and"] else [node]
    inner = ["list"] + terms
    for name, init in reversed(lets):
        inner = ["let", name, init, inner]
    return terms, inner

def oracle_agreement(subjects, oracle_sets):
    """Pairwise co-membership agreement vs an oracle decomposition —
    an external anchor beside judged/mechanical fit. Analytics, not
    contract: computed in the driver, not inside expr."""
    osets = [set(v) for v in (oracle_sets.values() if isinstance(oracle_sets, dict)
                              else oracle_sets)]
    out = {}
    for s in subjects:
        groups = (s.get("raw") or {}).get("groups") or []
        gsets = [set(g.get("misfits", [])) for g in groups]
        ids = sorted({m for g in gsets for m in g} |
                     {m for o in osets for m in o})
        pairs = list(itertools.combinations(ids, 2))
        if not pairs:
            continue
        agree = sum(1 for a, b in pairs
                    if any(a in g and b in g for g in gsets)
                    == any(a in o and b in o for o in osets))
        out[s["key"]] = round(agree / len(pairs), 3)
    return out

def mechanical(subjects, scorer_prog, src_args, cwd):
    """Run the habitat's scorer term-by-term on each subject: the named
    misfits, not just a pass flag. Pure expr — deterministic, no executor."""
    terms, prog = term_probe_program(scorer_prog)
    probe = {"contract": "algal.organism.v1", "key": "organism:scorer-probe",
             "name": "Scorer probe", "budgets": {"maxSteps": 16, "maxAgentCalls": 0, "maxWork": 200000},
             "interface": {
               "inputs": {"args": {"cell": "src", "port": "args"},
                          "outputs": {"cell": "src", "port": "outputs"}},
               "outputs": {"results": {"cell": "probe", "port": "out"}}},
             "cells": [
               {"id": "src", "kind": "input",
                "outputs": {"args": "json", "outputs": "json"}},
               {"id": "probe", "kind": "expr",
                "inputs": {"args": "json", "outputs": "json"},
                "expr": {"contract": "algal.expr.v1", "program": prog},
                "output": {"kind": "json", "schema": {"type": "array"}}}],
             "edges": [
               {"from": {"cell": "src", "port": "args"}, "to": {"cell": "probe", "port": "args"}},
               {"from": {"cell": "src", "port": "outputs"}, "to": {"cell": "probe", "port": "outputs"}}]}
    with tempfile.NamedTemporaryFile("w", suffix=".algal.json", delete=False) as fh:
        json.dump(probe, fh)
        probe_path = fh.name
    mech = {}
    for s in subjects:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"src": {"args": src_args,
                               "outputs": {"line": s["subject"],
                                           "subject": s["subject"],
                                           "message": s.get("raw", s["subject"])}}}, fh)
            pa = fh.name
        r, _ = run_algal(["run", probe_path, "--args", pa, "--dir", STORE], cwd)
        if r.get("outcome") != "complete":
            mech[s["key"]] = {"passed": None, "failed": []}
            continue
        bools = r["cells"]["probe"]["outputs"]["out"]
        mech[s["key"]] = {"passed": all(bools),
                          "failed": [terms[i] for i, b in enumerate(bools) if not b]}
    return mech

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
    gen_extra = (["--executor-cmd", os.path.join("..", "..", EXECUTOR),
                  "--executor-timeout-ms", "600000"] if live
                 else ["--responses", resp])
    jury_extra = ["--jev"] if live else ["--responses", resp]

    cfg = json.load(open(os.path.join(habitat, "foundry.config.json")))
    arena = [c for c in cfg["cases"] if c["split"] == "holdout"][0]
    src_args = arena["args"].get("src", arena["args"])
    links = None
    if "job" in src_args and "misfits" in src_args["job"]:
        job = src_args["job"]
        # The full coupling list exceeds the expr list bound, so it lives in
        # the ensemble contract rather than the case args; only the agent-cell
        # writer and this driver's Python ever read it.
        links = job.get("links")
        if links is None:
            ens = os.path.join(ROOT, "ensembles",
                               os.path.basename(habitat).removeprefix("partition-")
                               + ".ensemble.json")
            if os.path.exists(ens):
                links = json.load(open(ens)).get("links")
        # renders already carry every misfit's text — the brief stays
        # compact: couplings as "a+b" pairs, not the full catalog. The
        # duel item is bound inside an expr cell, so only the bounded
        # sample fits the runtime's list limit.
        brief = {"task": "pick the better decomposition of these "
                         "requirements into named subsystems"}
        couplings = job.get("sampleLinks") or links
        if couplings:
            brief["couplings"] = [f"{l['a']}+{l['b']}" for l in couplings]
        for k in ("requires", "separates"):
            if job.get(k):
                brief[k] = job[k]
    elif "job" in src_args:
        what = ("commit message (subject + body)" if "commit-message" in habitat
                else "commit subject")
        brief = {"hint": src_args["job"]["hint"], "change": src_args["job"]["change"],
                 "task": f"pick the better {what} for this change"}
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
            subjects.append({"key": key, "subject": subj["subject"], "raw": subj["raw"]})
    prior = None
    history = []
    champion = None
    reconciled = jury_file == "reconciled-jury.algal.json"
    for gen in range(generations + 1):
        mech = (mechanical(subjects, cfg["scorer"]["program"], src_args, habitat)
                if reconciled else None)
        result, receipt = jury(habitat, subjects, brief, jury_extra, habitat,
                               jury_file, mech=mech)
        judged = result["champion"]
        # the incumbent slot belongs to the contract: judged escape is
        # recorded, but only a contract-passing form inherits
        rchamp = result.get("reconciledChampion") or {}
        champion = rchamp if rchamp.get("key") else judged
        oracle_sets = (src_args.get("job") or {}).get("oracle")
        if oracle_sets:
            agr = oracle_agreement(subjects, oracle_sets)
            for s in result["standings"]:
                if s["key"] in agr:
                    s["oracleAgreement"] = agr[s["key"]]
        history.append({"generation": gen, "standings": result["standings"],
                        "judgedChampion": judged,
                        "reconciledChampion": rchamp or None,
                        "escaped": result.get("escaped"),
                        "contested": len(result.get("contested", [])),
                        "duels": len(result.get("duels", [])),
                        "champion": champion, "mechanical": mech,
                        "receiptDigest": receipt.get("digest")})
        tag = " (escaped)" if result.get("escaped") else ""
        print(f"gen {gen}: judged={judged['key']} champion={champion['key']}{tag} "
              + " ".join(f"{s['key']}:{s['wins']}" for s in result["standings"]))
        if gen == generations:
            break
        # generate: writer sees standings + champion + named mechanical misfits
        prior = {"generation": gen, "champion": champion,
                 "judgedChampion": judged,
                 "standings": result["standings"],
                 "mechanical": {k: v for k, v in (mech or {}).items() if v["passed"] is False},
                 "note": "champion defends its slot; mutate toward judged fit; "
                         "mechanical lists constraint terms each violator failed — "
                         "repair the misfit while keeping the winning shape"}
        is_partition = "misfits" in (src_args.get("job") or {})
        task = ("decompositions of a requirement set into named "
                "subsystems (each misfit in exactly one group; group "
                "names should capture the shared force)" if is_partition
                else "commit message formats (subject + body) for a "
                     "change report" if "commit-message" in habitat
                else "one-line summary formats for a change report")
        # the writer must not see the oracle — it's an external anchor,
        # not input: strip it so generated partitions can't copy the answer
        writer_job = {k: v for k, v in (src_args.get("job") or {}).items()
                      if k != "oracle"}
        if links is not None:
            writer_job["links"] = links
        gen_src = {"task": task, "prior": prior, "job": writer_job or None}
        repair = (src_args.get("job") or {}).get("repairProgram")
        if repair is not None:
            gen_src["repair-program"] = repair
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"src": gen_src}, fh)
            gen_args = fh.name
        g, gp = run_algal(["run", "generator.algal.json", "--args", gen_args,
                          "--dir", STORE] + gen_extra, habitat)
        if g.get("outcome") != "complete":
            print(f"gen {gen}: generator failed, incumbent carries on")
            if os.environ.get("EVOLVE_DEBUG"):
                json.dump(g, open("/tmp/gen-fail.json", "w"), indent=1)
                print("  debug receipt -> /tmp/gen-fail.json")
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
                subjects.append({"key": key, "subject": subj["subject"], "raw": subj["raw"]})
                seen.add(key)
        subjects = subjects[:8]

    final = history[-1] if history else {}
    out = {"contract": "pattern-language.evolve.v1", "habitat": habitat,
           "mode": "live" if live else "scripted",
           "arena": arena["id"], "generations": history,
           "finalChampion": champion,
           "judgedChampion": final.get("judgedChampion"),
           "escaped": final.get("escaped"),
           "reconciled": (final.get("mechanical") or {}).get(champion["key"], {}).get("passed")}
    name = "evolve.live.report.json" if live else "evolve.report.json"
    with open(os.path.join(habitat, name), "w") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"final champion: {champion['key']} ({champion['wins']} duels) "
          f"reconciled={out['reconciled']}")

if __name__ == "__main__":
    main()
