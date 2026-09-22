"""Partition comparison with strict coverage and a size-preserving null model.

Rand agreement counts both co-membership and separation, so it can look high
when most pairs belong to different groups. ARI corrects for the agreement
expected when memberships are permuted with both group-size profiles fixed.
Neither metric measures whether an architecture is useful in operation.
"""

from collections import Counter
from math import comb, sqrt
import random


def validate_partition(parts, universe=None):
    """Return disjoint groups of nonempty string IDs, covering universe exactly."""
    if isinstance(parts, dict):
        parts = list(parts.values())
    if not isinstance(parts, (list, tuple)) or not parts:
        raise ValueError("a partition must contain at least one group")
    groups, seen = [], set()
    for group in parts:
        if not isinstance(group, (list, tuple, set, frozenset)) or not group:
            raise ValueError("every partition group must be a nonempty collection")
        members = []
        for item in group:
            if not isinstance(item, str) or not item:
                raise ValueError("partition IDs must be nonempty strings")
            if item in seen:
                raise ValueError(f"duplicate partition ID: {item}")
            seen.add(item)
            members.append(item)
        groups.append(frozenset(members))
    if universe is not None:
        expected = set(universe)
        if seen != expected:
            raise ValueError(f"partition universe mismatch: missing={sorted(expected - seen)}, "
                             f"unexpected={sorted(seen - expected)}")
    return groups


def _metrics(groups, oracle):
    a = {item: i for i, group in enumerate(groups) for item in group}
    b = {item: i for i, group in enumerate(oracle) for item in group}
    total = comb(len(a), 2)
    together_a = sum(comb(len(group), 2) for group in groups)
    together_b = sum(comb(len(group), 2) for group in oracle)
    true_positive = sum(comb(n, 2) for n in Counter((a[x], b[x]) for x in a).values())
    false_positive = together_a - true_positive
    false_negative = together_b - true_positive
    true_negative = total - true_positive - false_positive - false_negative
    expected = together_a * together_b / total if total else 0.0
    denominator = (together_a + together_b) / 2 - expected
    # The zero-denominator cases have identical all-one/all-singleton relations.
    adjusted = (true_positive - expected) / denominator if denominator else 1.0
    return {
        "rand_index": (true_positive + true_negative) / total if total else 1.0,
        "adjusted_rand_index": adjusted,
        "pair_precision": true_positive / together_a if together_a else None,
        "pair_recall": true_positive / together_b if together_b else None,
        "pair_f1": 2 * true_positive / (together_a + together_b)
                   if together_a + together_b else 1.0,
        "pair_counts": {"both_together": true_positive,
                        "candidate_only_together": false_positive,
                        "oracle_only_together": false_negative,
                        "both_separate": true_negative},
    }


def partition_metrics(parts, oracle_parts, universe=None):
    """Compare two valid partitions over exactly the same explicit universe."""
    oracle = validate_partition(oracle_parts, universe)
    expected = set().union(*oracle)
    groups = validate_partition(parts, expected)
    return _metrics(groups, oracle)


def pairwise_agreement(parts, oracle_parts):
    """Compatibility API: the legacy, unadjusted Rand index, now validated."""
    return partition_metrics(parts, oracle_parts)["rand_index"]


def _percentile(values, fraction):
    values = sorted(values)
    index = (len(values) - 1) * fraction
    lower = int(index)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (index - lower)


def permutation_baseline(parts, oracle_parts, *, universe=None, samples=256, seed=0):
    """Shuffle candidate membership, preserving group sizes and the fixed oracle.

    The upper-tail probability uses the (exceedances + 1)/(samples + 1)
    Monte Carlo correction. It is descriptive evidence for this one partition
    comparison, not a measure of generalization or design quality.
    """
    if not isinstance(samples, int) or isinstance(samples, bool) or samples < 1:
        raise ValueError("baseline samples must be a positive integer")
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ValueError("baseline seed must be an integer")
    oracle = validate_partition(oracle_parts, universe)
    expected = set().union(*oracle)
    groups = validate_partition(parts, expected)
    observed = _metrics(groups, oracle)
    # Sorting sizes and IDs makes the baseline invariant to group/element order.
    sizes = sorted(map(len, groups))
    rng = random.Random(seed)
    values = []
    for _ in range(samples):
        shuffled = sorted(expected)
        rng.shuffle(shuffled)
        offset, permuted = 0, []
        for size in sizes:
            permuted.append(shuffled[offset:offset + size])
            offset += size
        values.append(_metrics(permuted, oracle))
    aris = [v["adjusted_rand_index"] for v in values]
    mean = sum(aris) / samples
    pairs = comb(len(expected), 2)
    candidate_together = sum(comb(size, 2) for size in sizes)
    oracle_together = sum(comb(len(group), 2) for group in oracle)
    expected_rand = (1 - (candidate_together + oracle_together) / pairs
                     + 2 * candidate_together * oracle_together / (pairs * pairs)) if pairs else 1.0
    return {
        "method": "uniform membership permutation preserving candidate group sizes; oracle fixed",
        "samples": samples,
        "seed": seed,
        "expected_rand_index": expected_rand,
        "mean_rand_index": sum(v["rand_index"] for v in values) / samples,
        "mean_adjusted_rand_index": mean,
        "stddev_adjusted_rand_index": sqrt(sum((x - mean) ** 2 for x in aris) / samples),
        "p95_adjusted_rand_index": _percentile(aris, 0.95),
        "max_adjusted_rand_index": max(aris),
        "upper_tail_probability": (1 + sum(x >= observed["adjusted_rand_index"] - 1e-12
                                            for x in aris)) / (samples + 1),
    }
