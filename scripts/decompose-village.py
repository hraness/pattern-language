#!/usr/bin/env python3
"""Appendix I benchmark: agglomerative merging with the same scoring criterion
as programs/decompose-step.algal.json, evaluated offline because 141 nodes x
1434 links exceeds algal's 1M per-activation fuel ceiling. This implementation
appends a merged cluster; the manifest prepends it. First-max tie resolution
can therefore differ. Cross-implementation partition parity is not proven.

This is historically faithful: Alexander's decomposition was computed by
HIDECS, an IBM program — the partition was always offline tooling. What the
manifest proves is that the step rule is expressible and receipted at small
scale; what this script measures is how close that rule comes to Alexander's
published answer at real scale.

Historical raw Rand findings (separation-heavy and not chance-corrected):
  raw     cross-link count         -> degenerates to [138,1,1,1]
  avg     cross-links / |a|*|b|    -> 0.707 agreement at k=4 (vs A-D majors)
                                     0.840 agreement at k=12 (vs 12 subsets)

The report also includes adjusted Rand, pair precision/recall, and a seeded
size-preserving permutation baseline. These compare partitions; they do not
establish code-generation usefulness.

Usage: python3 scripts/decompose-village.py [k] [raw|avg|cnm] [--json]
"""
import argparse, json, os

from partition_metrics import (pairwise_agreement, partition_metrics,
                               permutation_baseline, validate_partition)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(ens_path=None, oracle_path=None):
    ens = json.load(open(ens_path or os.path.join(ROOT, "ensembles/village.ensemble.json")))
    oracle = json.load(open(oracle_path or os.path.join(ROOT, "ensembles/village.decomposition.json"))) if (oracle_path or ens_path is None) else None
    ids = [m["id"] for m in ens["misfits"]]
    validate_partition([ids])
    if oracle is not None:
        # Validate before any major-group union can hide repeated membership.
        validate_partition(oracle["subsets"], universe=ids)
    adj = {m: set() for m in ids}
    for l in ens["links"]:
        adj[l["a"]].add(l["b"]); adj[l["b"]].add(l["a"])
    return ids, adj, (oracle or {}).get("subsets")

def cross_links(a, b, adj):
    return sum(len(adj[x] & b) for x in a)

def greedy(ids, adj, k, norm):
    if norm == "cnm":
        return cnm(ids, adj)
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

def cnm(ids, adj):
    """Greedy modularity maximization (Clauset-Newman-Moore): merge the pair
    whose union most increases Q = sum_c [ e_c/m - (K_c/2m)^2 ]. Stops when no
    merge improves Q — k is discovered, not given. Unlike avg-linkage this
    penalizes merging into high-degree hubs."""
    two_m = float(sum(len(v) for v in adj.values()))
    deg = {i: len(adj[i]) for i in ids}
    clusters = [frozenset([m]) for m in ids]
    rounds = 0
    while True:
        best, best_s = None, 0.0
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                e_ab = cross_links(clusters[i], clusters[j], adj)
                ka = sum(deg[x] for x in clusters[i])
                kb = sum(deg[x] for x in clusters[j])
                s = e_ab / two_m - (ka * kb) / (two_m * two_m)
                if s > best_s:
                    best, best_s = (i, j), s
        if best is None:
            break
        i, j = best
        clusters = [c for x, c in enumerate(clusters) if x not in best] + [clusters[i] | clusters[j]]
        rounds += 1
    return clusters, rounds

def best_match_report(mine, oracle_sets):
    oracle = [set(v) for v in oracle_sets.values()] if isinstance(oracle_sets, dict) else [set(v) for v in oracle_sets]
    for i, c in enumerate(sorted(mine, key=len, reverse=True)):
        j = max(range(len(oracle)), key=lambda t: len(set(c) & oracle[t]))
        ov = oracle[j]
        print(f"  cluster {i} (n={len(c)}): best-matches oracle group with "
              f"{len(set(c) & ov)}/{len(ov)} of its members")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("k", type=int, nargs="?", default=4)
    parser.add_argument("norm", choices=("raw", "avg", "cnm"), nargs="?", default="avg")
    parser.add_argument("ensemble", nargs="?")
    parser.add_argument("oracle", nargs="?")
    parser.add_argument("--json", action="store_true", help="emit one machine-readable report")
    parser.add_argument("--baseline-samples", type=int, default=256)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    k, norm, ens_path, oracle_path = args.k, args.norm, args.ensemble, args.oracle
    try:
        ids, adj, oracle_sets = load(ens_path, oracle_path)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= k <= len(ids):
        parser.error("k must be between 1 and the number of items")
    if args.baseline_samples < 1:
        parser.error("--baseline-samples must be positive")
    label = os.path.basename(ens_path) if ens_path else "village graph"
    mine, rounds = greedy(ids, adj, k, norm)
    oracle_label = "oracle partition"
    if oracle_sets is not None and ens_path is None and k == 4:
        oracle_sets = {g: set().union(*(oracle_sets[s] for s in oracle_sets if s.startswith(g)))
                       for g in "ABCD"}
        oracle_label = "Alexander's A-D partition"
    report = {"contract": "pattern-language.partition-benchmark.v1", "dataset": label,
              "items": len(ids), "links": sum(len(v) for v in adj.values()) // 2,
              "requested_groups": k, "method": norm, "merge_rounds": rounds,
              "group_sizes": sorted(map(len, mine)),
              "partition": [sorted(group) for group in mine]}
    if oracle_sets is not None:
        try:
            report["metrics"] = partition_metrics(mine, oracle_sets, universe=ids)
            report["baseline"] = permutation_baseline(mine, oracle_sets, universe=ids,
                                                        samples=args.baseline_samples, seed=args.seed)
        except ValueError as exc:
            parser.error(str(exc))
        report["oracle"] = oracle_label
        report["oracle_group_sizes"] = sorted(map(len, oracle_sets.values()))
    if args.json:
        print(json.dumps(report, sort_keys=True))
        return
    print(f"{label}: {report['items']} misfits, {report['links']} links, k={k}, norm={norm}")
    print(f"greedy decompose: {rounds} merge rounds -> {report['group_sizes']}")
    if oracle_sets is None:
        for i, c in enumerate(sorted(mine, key=len, reverse=True)):
            print(f"  cluster {i} (n={len(c)}): {sorted(c)}")
        return
    metrics, baseline = report["metrics"], report["baseline"]
    print(f"legacy pairwise agreement (unadjusted Rand) vs {oracle_label}: "
          f"{metrics['rand_index']:.3f}")
    print(f"adjusted Rand index: {metrics['adjusted_rand_index']:.4f}; "
          f"size-preserving null mean={baseline['mean_adjusted_rand_index']:.4f}, "
          f"p95={baseline['p95_adjusted_rand_index']:.4f}, "
          f"upper-tail probability={baseline['upper_tail_probability']:.4f} "
          f"({baseline['samples']} permutations, seed={baseline['seed']})")
    best_match_report(mine, oracle_sets)

if __name__ == "__main__":
    main()
