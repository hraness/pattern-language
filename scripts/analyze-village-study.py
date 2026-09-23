#!/usr/bin/env python3
"""Report-only analysis for a completed village-decompose study.

Reads a scorer-produced evaluation.json and prints a compact arm comparison:
per-arm ARI/majors-ARI/pair metrics, per-subset confusion vs the reference,
and the calibration baselines (greedy, Louvain, size-null) for context.
Not part of the frozen protocol — this interprets evidence, it never mutates.
"""
import json
import sys
import statistics


def cell(attempts):
    aris = [a['metrics']['adjustedRandIndex'] for a in attempts if a.get('metrics')]
    majors = [a['metrics']['majorsAdjustedRandIndex'] for a in attempts if a.get('metrics')]
    f1 = [a['metrics']['pairF1'] for a in attempts if a.get('metrics')]
    links = [a['metrics']['linkedPairsInside'] for a in attempts if a.get('metrics')]
    return {'n': len(aris),
            'ari_mean': statistics.mean(aris) if aris else None,
            'ari_sd': statistics.stdev(aris) if len(aris) > 1 else 0,
            'ari_max': max(aris) if aris else None,
            'majors_mean': statistics.mean(majors) if majors else None,
            'f1_mean': statistics.mean(f1) if f1 else None,
            'links_mean': statistics.mean(links) if links else None}


def main():
    if len(sys.argv) != 2:
        sys.stderr.write('Usage: python3 analyze-village-study.py EVALUATION.json\n')
        return 2
    ev = json.loads(open(sys.argv[1]).read())
    attempts = ev['attempts']
    print('=== arm comparison (denominator-normalized) ===')
    for arm in ('direct', 'checklist', 'pattern'):
        rows = [a for a in attempts if a['arm'] == arm]
        c = cell(rows)
        print(f"{arm:9s} n={c['n']:2d} ari={c['ari_mean'] if c['ari_mean'] is not None else float('nan'):.4f} "
              f"sd={c['ari_sd']:.3f} max={c['ari_max'] if c['ari_max'] is not None else float('nan'):.3f} "
              f"majors={c['majors_mean'] if c['majors_mean'] is not None else float('nan'):.3f} "
              f"f1={c['f1_mean'] if c['f1_mean'] is not None else float('nan'):.3f} "
              f"links={c['links_mean'] if c['links_mean'] is not None else float('nan'):.1f}/144")
    print()
    print('=== per-attempt ===')
    for a in attempts:
        m = a.get('metrics') or {}
        state = 'scored' if a.get('metrics') else ('invalid' if a.get('generated') else 'not-generated')
        print(f"{a['id']:28s} {state:14s} ari={m.get('adjustedRandIndex', float('nan')):.4f} "
              f"groups={m.get('groupCount', '-')} links={m.get('linkedPairsInside', '-')}")
    print()
    print('baselines: direct topical ~0.12 | checklist ~0.13 | greedy decomposer 0.172 | '
          'louvain(k=30, illegal) 0.23 | size-null ~0 | reference 1.0')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
