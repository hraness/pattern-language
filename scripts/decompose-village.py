#!/usr/bin/env python3
"""Appendix I benchmark: run the same agglomerative merge rule that
programs/decompose-step.algal.json implements in `expr` — merge the cluster
pair with the highest score, first-max wins ties, repeat to k — but offline,
because 141 nodes x 1434 links exceeds algal's 1M per-activation fuel ceiling.

This is historically faithful: Alexander's decomposition was computed by
HIDECS, an IBM program — the partition was always offline tooling. What the
manifest proves is that the step rule is expressible and receipted at small
scale; what this script measures is how close that rule comes to Alexander's
published answer at real scale.

Findings encoded here: the scoring criterion is load-bearing.
  raw     cross-link count         -> degenerates to [138,1,1,1]
  avg     cross-links / |a|*|b|    -> 0.707 agreement at k=4 (vs A-D majors)
                                     0.840 agreement at k=12 (vs 12 subsets)

Usage: python3 scripts/decompose-village.py [k] [raw|avg]
"""
import json, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load():
    ens = json.load(open(os.path.join(ROOT, "ensembles/village.ensemble.json")))
    oracle = json.load(open(os.path.join(ROOT, "ensembles/village.decomposition.json")))
    ids = [m["id"] for m in ens["misfits"]]
    adj = {m: set() for m in ids}
    for l in ens["links"]:
        adj[l["a"]].add(l["b"]); adj[l["b"]].add(l["a"])
    return ids, adj, oracle["subsets"]

def cross_links(a, b, adj):
    return sum(len(adj[x] & b) for x in a)

def greedy(ids, adj, k, norm):
    clusters = [frozenset([m]) for m in ids]
    rounds = 0
    while len(clusters) > k:
        best, best_s = None, -1.0
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                s = float(cross_links(clusters[i], clusters[j], adj))
                if norm == "avg":
                    s = s / (len(clusters[i]) * len(clusters[j]))
                if s > best_s:
                    best, best_s = (i, j), s
        if best is None:
            break
        i, j = best
        clusters = [c for x, c in enumerate(clusters) if x not in best] + [clusters[i] | clusters[j]]
        rounds += 1
    return clusters, rounds

def pairwise_agreement(a_parts, b_parts):
    if isinstance(a_parts, dict): a_parts = a_parts.values()
    if isinstance(b_parts, dict): b_parts = b_parts.values()
    a = {x: i for i, p in enumerate(a_parts) for x in p}
    b = {x: i for i, p in enumerate(b_parts) for x in p}
    items = sorted(a)
    same = diff = 0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if (a[items[i]] == a[items[j]]) == (b[items[i]] == b[items[j]]):
                same += 1
            else:
                diff += 1
    return same / (same + diff)

def best_match_report(mine, oracle_sets):
    oracle = [set(v) for v in oracle_sets.values()] if isinstance(oracle_sets, dict) else [set(v) for v in oracle_sets]
    for i, c in enumerate(sorted(mine, key=len, reverse=True)):
        j = max(range(len(oracle)), key=lambda t: len(set(c) & oracle[t]))
        ov = oracle[j]
        print(f"  cluster {i} (n={len(c)}): best-matches oracle group with "
              f"{len(set(c) & ov)}/{len(ov)} of its members")

def main():
    k = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    norm = sys.argv[2] if len(sys.argv) > 2 else "avg"
    ids, adj, oracle_sets = load()
    print(f"village graph: {len(ids)} misfits, "
          f"{sum(len(v) for v in adj.values())//2} links, k={k}, norm={norm}")
    mine, rounds = greedy(ids, adj, k, norm)
    print(f"greedy decompose: {rounds} merge rounds -> "
          f"{sorted(len(c) for c in mine)}")
    if k == 4:
        majors = {g: set().union(*(oracle_sets[s] for s in oracle_sets if s.startswith(g)))
                  for g in "ABCD"}
        print(f"pairwise agreement vs Alexander's A-D partition: "
              f"{pairwise_agreement(mine, majors):.3f}")
        best_match_report(mine, majors)
    else:
        print(f"pairwise agreement vs Alexander's 12-subset partition: "
              f"{pairwise_agreement(mine, oracle_sets):.3f}")
        best_match_report(mine, oracle_sets)

if __name__ == "__main__":
    main()
