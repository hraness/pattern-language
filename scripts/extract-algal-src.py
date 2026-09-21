#!/usr/bin/env python3
"""Transfer test: derive an ensemble from a real codebase — algal's own src/.

Each non-test module is a misfit variable: the module's design obligation,
taken from the AGENTS.md tour where stated. A link {a,b} exists when either
file imports the other — i.e., changing one's contract can misfit the other.
Unsigned, like Appendix I: decomposition uses linkage, not sign.

The oracle (ensembles/algal-src.decomposition.json) groups modules by the
logical subsystems AGENTS.md documents. Provenance is recorded in the file.
"""
import json, os, re, sys

ALGAL = "/Users/bg/.bun/install/cache/@GH@hraness-algal-132e2d2@@@1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IMPORT_RE = re.compile(r'from\s+["\']\./([a-z0-9-]+)["\']')

# Design obligations, one per module — Alexander's "requirement" per element.
OBLIGATION = {
    "contract": "the manifest schema must admit only well-formed organisms",
    "graph": "the cell graph must stay acyclic and port-typed",
    "digest": "every value must have a canonical content address",
    "errors": "failures must be typed, never thrown bare",
    "values": "canonical values must round-trip byte-identical",
    "registry": "host functions resolve by name, never by manifest code",
    "run": "the scheduler must replay deterministically under budgets",
    "effects": "effects cross the seam declared, typed, and logged",
    "tools": "external tools run only through typed calls",
    "capabilities": "capability handles cannot be minted by manifests",
    "store": "committed values must be durable and content-addressed",
    "transport": "bytes move between stores without interpretation",
    "bundle": "manifests pack and unpack losslessly",
    "verify": "a receipt must replay bit-for-bit or fail loudly",
    "expr": "expr programs interpret under fuel — bounded by construction",
    "gateway": "model calls resolve through the gateway executor only",
    "jev": "decide cells execute through the typed-decision provider",
    "decisions": "decisions are typed nouls/choices, not free text",
    "credentials": "credential custody stays outside manifests and receipts",
    "embeddings": "embedding vectors derive from stored content",
    "semantic": "recall queries resolve against the derived index",
    "mailbox": "the durable mailbox bounds messages and ids",
    "process": "named processes supervise under replayable journaling",
    "process-journal": "process events append; nothing rewrites history",
    "process-evidence": "process evidence is positive derivation from facts",
    "foundry": "candidate organisms evaluate on labeled cases",
    "foundry-verify": "foundry receipts verify like any run",
    "search": "organism search stays within declared budgets",
    "search-verify": "search receipts verify like any run",
    "bench": "benchmarks compare variants on the same cases",
    "bench-verify": "bench receipts verify like any run",
    "repair": "repair applies bounded fixes to admitted manifests",
    "cli": "the CLI surface exposes runtime commands, nothing hidden",
    "index": "the public surface exports the contract, not internals",
    "diagram": "manifests render to inspectable diagrams",
    "io": "host I/O stays behind declared effects",
    "host-events": "host events are typed and bounded",
    "host-state": "host state persists only through declared slots",
    "tool-context": "tool invocations carry their bounded context",
    "source": "source manifests track their origin",
    "source-diagnostics": "source problems surface as diagnostics",
    "source-errors": "source errors are typed like runtime errors",
    "source-project": "source collections resolve as a project",
    "source-trace": "source traces link back to origin",
    "coding-jobs": "coding jobs execute as bounded delegated work",
    "coding-operations": "coding operations are typed job steps",
    "github": "GitHub access goes through typed calls",
    "github-cli": "gh CLI wraps as a typed tool",
    "shepherd": "delegated runs supervise without hidden state",
    "xcb": "subscription custody settles through xcb",
    "audit": "audit trails are append-only and checkable",
}

def main():
    src = os.path.join(ALGAL, "src")
    files = sorted(f[:-3] for f in os.listdir(src)
                   if f.endswith(".ts") and ".test." not in f)
    links = set()
    for f in files:
        text = open(os.path.join(src, f + ".ts")).read()
        for dep in IMPORT_RE.findall(text):
            if dep in files and dep != f:
                links.add(tuple(sorted((f, dep))))
    ens = {
        "contract": "pattern.ensemble.v1",
        "name": "algal-src",
        "context": "the algal runtime's own src/ — a real codebase as the "
                   "problem: 48 modules, each with a design obligation; links "
                   "are import edges (changing one's contract can misfit the "
                   "other). Transfer test for decompose: do mechanically "
                   "derived links recover the subsystems AGENTS.md documents?",
        "source": {
            "repo": "hraness/algal",
            "snapshot": ALGAL,
            "method": "import edges parsed from src/*.ts (non-test); "
                      "obligations written from the AGENTS.md module tour",
        },
        "misfits": [{"id": f, "text": OBLIGATION.get(f, f"the {f} module must meet its contract")}
                    for f in files],
        "links": [{"a": a, "b": b, "sign": "u",
                   "why": "import edge"} for a, b in sorted(links)],
    }
    out = os.path.join(ROOT, "ensembles/algal-src.ensemble.json")
    json.dump(ens, open(out, "w"), indent=2)
    print(f"wrote {out}: {len(files)} modules, {len(links)} import links")

if __name__ == "__main__":
    main()
