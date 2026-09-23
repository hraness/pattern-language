#!/usr/bin/env python3
"""Score a finalized frozen village-decomposition study; no provider calls.

Reads the exact plan/run bytes, re-verifies the frozen provenance through the
runner module, parses each preserved response as an inert partition artifact,
and measures pairwise agreement against the frozen hidden reference. --out
writes a fresh evaluation; --replay verifies a recorded evaluation bit-for-bit
against a re-scored run.
"""
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('village_runner', Path(__file__).with_name('run-village-study.py'))
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)
MSPEC = importlib.util.spec_from_file_location('village_metrics', Path(__file__).with_name('partition_metrics.py'))
METRICS = importlib.util.module_from_spec(MSPEC)
MSPEC.loader.exec_module(METRICS)

BENCH = RUNNER.BENCH
SCHEMA = 'pattern-language.decompose-evaluation.v1'
ARTIFACT_SCHEMA = 'pattern-language.decompose.v1'
MECHANICAL_LINK_MINIMUM = 20


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sha(value):
    return RUNNER.sha(value)


def parse_artifact(text):
    """Inert JSON artifact parse; returns (artifact, errors) without executing."""
    try:
        value = json.loads(text.strip())
    except (ValueError, TypeError):
        return None, ['not strict JSON']
    errors = []
    if not isinstance(value, dict):
        return None, ['top level must be an object']
    if set(value) != {'schema', 'groups'}:
        errors.append('top-level keys must be exactly schema and groups')
    if value.get('schema') != ARTIFACT_SCHEMA:
        errors.append('schema must be pattern-language.decompose.v1')
    groups = value.get('groups')
    if not isinstance(groups, list):
        return value, errors + ['groups must be a list']
    if not 8 <= len(groups) <= 16:
        errors.append('groups count outside 8-16')
    for index, group in enumerate(groups):
        if not isinstance(group, dict) or set(group) != {'name', 'misfits'}:
            errors.append(f'group {index} must have exactly name and misfits')
            continue
        if not isinstance(group['name'], str) or not group['name'].strip():
            errors.append(f'group {index} has an empty name')
        members = group['misfits']
        if not isinstance(members, list) or not members:
            errors.append(f'group {index} has an empty member list')
        elif not all(isinstance(member, str) for member in members):
            errors.append(f'group {index} has a non-string member')
        elif len(set(members)) != len(members):
            errors.append(f'group {index} has a duplicate member')
        elif len(members) < 2:
            errors.append(f'group {index} has fewer than 2 members')
    return value, errors


def evaluate_artifact(artifact, oracle_subsets, oracle_majors, universe, sample_pairs):
    groups = [set(group['misfits']) for group in artifact['groups']]
    flat = [member for group in artifact['groups'] for member in group['misfits']]
    check(set(flat) == universe and len(flat) == len(set(flat)), 'Coverage already checked by caller')
    try:
        flat_metrics = METRICS.partition_metrics(groups, oracle_subsets, universe)
        major_metrics = METRICS.partition_metrics(groups, oracle_majors, universe)
    except ValueError as error:
        raise ValueError(f'partition metrics failed: {error}') from None
    member_of = {member: index for index, group in enumerate(groups) for member in group}
    linked_inside = sum(1 for a, b in sample_pairs if member_of.get(a) is not None and member_of[a] == member_of.get(b))
    return {
        'adjustedRandIndex': flat_metrics['adjusted_rand_index'],
        'randIndex': flat_metrics['rand_index'],
        'pairPrecision': flat_metrics['pair_precision'],
        'pairRecall': flat_metrics['pair_recall'],
        'pairF1': flat_metrics['pair_f1'],
        'majorsAdjustedRandIndex': major_metrics['adjusted_rand_index'],
        'majorsRandIndex': major_metrics['rand_index'],
        'groupCount': len(groups),
        'linkedPairsInside': linked_inside,
        'linkIntegrity': linked_inside >= MECHANICAL_LINK_MINIMUM,
    }


def score_study(plan_text, run_text, root=ROOT):
    plan = json.loads(plan_text)
    run = json.loads(run_text)
    RUNNER.validate_plan(plan)
    RUNNER.verify_current_files(plan, root)
    RUNNER.validate_run(plan, run, plan_text)
    oracle = json.loads(plan['files'][f'{BENCH}/oracle.json']['text'])
    sample = json.loads(plan['files'][f'{BENCH}/sample-links.json']['text'])
    check(oracle.get('contract') == 'pattern.ensemble.v1' or 'subsets' in oracle, 'Frozen oracle differs from decomposition schema')
    subsets = oracle['subsets']
    tree = oracle.get('tree', {})
    # Build majors partition: subset -> its top-level letter via the tree.
    major_of = {}
    for parent, children in tree.items():
        if parent == 'M':
            continue
        for child in children:
            major_of[child] = parent
    major_groups = {}
    for name, members in subsets.items():
        major_groups.setdefault(major_of.get(name, name), []).extend(members)
    oracle_subsets = list(subsets.values())
    oracle_majors = list(major_groups.values())
    universe = set(member for group in subsets.values() for member in group)
    check(len(universe) == 141, 'Oracle universe must cover 141 misfits')
    sample_pairs = [(link['a'], link['b']) for link in sample['links']] if isinstance(sample.get('links'), list) else []
    check(len(sample_pairs) == 144, 'Frozen sample-links must hold 144 pairs')

    attempts = []
    for call in run['calls']:
        attempt = {'id': call['id'], 'context': call['context'], 'arm': call['arm'],
                   'repetition': call['repetition'], 'generated': call['status'] == 'generated-not-reviewed',
                   'providerAttempts': len(call.get('attempts') or []),
                   'artifactValid': False, 'coverageComplete': False, 'mechanical': False,
                   'errors': [], 'artifact': None, 'metrics': None}
        if call['status'] == 'generated-not-reviewed':
            artifact, errors = parse_artifact(call['resultText'])
            attempt['errors'] = errors
            if artifact is not None:
                attempt['artifact'] = artifact
            if not errors:
                flat = [member for group in artifact['groups'] for member in group['misfits']]
                if set(flat) == universe and len(flat) == len(set(flat)) == 141:
                    attempt['coverageComplete'] = True
                    attempt['artifactValid'] = True
                    attempt['metrics'] = evaluate_artifact(artifact, oracle_subsets, oracle_majors, universe, sample_pairs)
                    attempt['mechanical'] = attempt['metrics']['linkIntegrity']
                else:
                    attempt['errors'] = ['partition does not cover the 141-misfit universe exactly once']
        attempts.append(attempt)

    def cell(rows, planned):
        check(len(rows) == planned, 'Summary must preserve every planned attempt')
        scored = [row['metrics']['adjustedRandIndex'] for row in rows if row['metrics']]
        majors = [row['metrics']['majorsAdjustedRandIndex'] for row in rows if row['metrics']]
        return {
            'planned': planned,
            'generationCompleted': sum(1 for row in rows if row['generated']),
            'artifactValid': sum(1 for row in rows if row['artifactValid']),
            'coverageComplete': sum(1 for row in rows if row['coverageComplete']),
            'mechanical': sum(1 for row in rows if row['mechanical']),
            'meanAdjustedRandIndex': (sum(scored) / planned),
            'meanMajorsAdjustedRandIndex': (sum(majors) / planned),
            'scoredCount': len(scored),
        }
    totals = cell(attempts, 36)
    totals.pop('planned')
    summary = {'planned': 36, 'byArm': {arm: cell([row for row in attempts if row['arm'] == arm], 12)
                                      for arm in RUNNER.ARMS}, **totals}
    return {
        'schema': SCHEMA,
        'planSha256': sha(plan_text), 'runSha256': sha(run_text),
        'denominator': 36,
        'summary': summary,
        'attempts': attempts,
        'reference': {'contract': 'pattern.decomposition.v1', 'source': 'Alexander 1973 App.1',
                      'subsetCount': len(subsets), 'majorCount': len(oracle_majors)},
    }


def main():
    if len(sys.argv) != 5 or sys.argv[3] not in ('--out', '--replay'):
        sys.stderr.write('Usage: python3 score-village-study.py PLAN.json RUN.json (--out|--replay) EVALUATION.json\n')
        return 2
    plan_text = Path(sys.argv[1]).read_text()
    run_text = Path(sys.argv[2]).read_text()
    try:
        result = score_study(plan_text, run_text)
    except (ValueError, OSError, KeyError, TypeError) as error:
        sys.stderr.write(f'{error}\n')
        return 2
    if sys.argv[3] == '--out':
        Path(sys.argv[4]).write_text(json.dumps(result, indent=1) + '\n')
        sys.stdout.write(json.dumps({'status': 'scored', 'denominator': 36, 'summary': result['summary']}) + '\n')
        return 0
    recorded = json.loads(Path(sys.argv[4]).read_text())
    if json.dumps(recorded, sort_keys=True) != json.dumps(result, sort_keys=True):
        sys.stderr.write('Replay differs\n')
        return 2
    sys.stdout.write(json.dumps({'status': 'replayed', 'denominator': 36, 'summary': result['summary']}) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
