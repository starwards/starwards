"""Cumulative mining of one rung for one code commit: writes <dir>/LATEST.md from
<dir>/branches-<commit>.jsonl (branch rows of every rolling cycle) and <dir>/sweep-<commit>.jsonl
(run rows of the reference crews), and appends one line to <dir>/history.md.

    python3 mining.py <archive>/mining/<rung> <commit> <rung>

Pairing as in modules/ai/src/branching/mine.ts: a branch against the recorded run it left
(branch - recorded run value); a crew against the first crew of the sweep on the same seed.
Run by docker/training/rolling.sh after every cycle; the full per-feature report of the same rows is
`npm run branch -- mine --corpus <dir>/branches-<commit>.jsonl`.
"""
import datetime
import json
import math
import os
import sys

TOP = 12


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def t95(df):
    table = {1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23,
             12: 2.18, 15: 2.13, 20: 2.09, 25: 2.06, 30: 2.04, 40: 2.02, 60: 2.00, 120: 1.98}
    for k in sorted(table):
        if df <= k:
            return table[k]
    return 1.96


def sign_p(wins, losses):
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def paired(diffs):
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1)) if n > 1 else 0.0
    half = t95(n - 1) * sd / math.sqrt(n) if n > 1 else float('inf')
    wins = sum(d > 0 for d in diffs)
    losses = sum(d < 0 for d in diffs)
    return {'n': n, 'mean': mean, 'lo': mean - half, 'hi': mean + half, 'wins': wins, 'losses': losses,
            'p': sign_p(wins, losses)}


def verdict(s):
    if s['lo'] > 0 or (s['p'] < 0.05 and s['wins'] > s['losses']):
        return 'BEATS'
    if s['hi'] < 0 or (s['p'] < 0.05 and s['losses'] > s['wins']):
        return 'loses'
    return 'noise'


def fmt(s):
    return f"{s['mean']:+.3f} [{s['lo']:+.3f}, {s['hi']:+.3f}] | {s['wins']}/{s['losses']} | {s['p']:.3f}"


def seed_list(seeds, limit=10):
    seeds = sorted(set(seeds))
    text = ', '.join(str(s) for s in seeds[:limit])
    return text + (f' (+{len(seeds) - limit})' if len(seeds) > limit else '')


def branch_section(rows):
    valid = [r for r in rows if r.get('prefixMatches') and r['delta'].get('value') is not None]
    diverged = sum(1 for r in rows if not r.get('prefixMatches'))
    groups = {}
    for r in valid:
        groups.setdefault((r['level'], r['alternative']), []).append(r)
    stats = []
    for (level, alt), lst in groups.items():
        if len(lst) < 3:
            continue
        s = paired([r['outcome']['value'] - r['baseline']['value'] for r in lst])
        s.update(level=level, alt=alt, kind=lst[0]['kind'],
                 up=[r['seed'] for r in lst if r['delta']['kills'] > 0],
                 down=[r['seed'] for r in lst if r['delta']['kills'] < 0],
                 seeds=len({r['seed'] for r in lst}))
        stats.append(s)
    stats.sort(key=lambda s: (verdict(s) != 'BEATS', -s['mean']))
    beats = [s for s in stats if verdict(s) == 'BEATS']
    out = [f"{len(rows)} branches over {len({r['seed'] for r in rows})} seeds, {diverged} diverged (excluded).", '',
           f"**{len(beats)} alternative(s) beat the reference beyond noise.**", '',
           '| verdict | level | alternative | branches (seeds) | Δ run value [95% CI] | wins/losses | sign p | kill gained on seeds | kill lost on seeds |',
           '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for s in stats[:TOP]:
        out.append(f"| {verdict(s)} | {s['level']} | `{s['alt']}` | {s['n']} ({s['seeds']}) | {fmt(s)} | "
                   f"{seed_list(s['up'])} | {seed_list(s['down'])} |")
    return out, len(beats), len(rows), diverged


def sweep_section(rows):
    if not rows:
        return [], 0
    crews = []
    for r in rows:
        if r['crew'] not in crews:
            crews.append(r['crew'])
    ref = os.environ.get('REFERENCE_CREW') or crews[0]
    if ref not in crews:
        ref = crews[0]
    value = lambda r: (r.get('score') or {}).get('value')
    by = {}
    for r in rows:
        by.setdefault(r['crew'], {})[r['seed']] = r
    out = [f"{len({r['seed'] for r in rows})} seeds; each crew against `{ref}` on the same seed.", '',
           '| crew | runs | kill rate | Δ run value vs reference [95% CI] | wins/losses | sign p | verdict |',
           '| --- | --- | --- | --- | --- | --- | --- |']
    beats = 0
    for crew in crews:
        mine = by[crew]
        kill = sum(1 for r in mine.values() if r.get('killed')) / len(mine)
        if crew == ref:
            out.append(f"| `{crew}` | {len(mine)} | {kill:.2f} | reference | | | |")
            continue
        diffs = [value(mine[s]) - value(by[ref][s]) for s in mine
                 if s in by[ref] and value(mine[s]) is not None and value(by[ref][s]) is not None]
        if len(diffs) < 2:
            out.append(f"| `{crew}` | {len(mine)} | {kill:.2f} | too few pairs | | | |")
            continue
        s = paired(diffs)
        beats += verdict(s) == 'BEATS'
        out.append(f"| `{crew}` | {len(mine)} | {kill:.2f} | {fmt(s)} | {verdict(s)} |")
    return out, beats


def main():
    folder, commit, rung = sys.argv[1], sys.argv[2], sys.argv[3]
    branches = read_jsonl(os.path.join(folder, f'branches-{commit}.jsonl'))
    sweep = read_jsonl(os.path.join(folder, f'sweep-{commit}.jsonl'))
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    lines = [f'# {rung}: cumulative mining, code {commit}', '',
             f'Updated {now} by the rolling lanes (deploy/k3s/training, docs/integration/ai-training-k3s.md). '
             'Reference crews only, fresh seeds every cycle. A BEATS row is evidence for a new reference rule; '
             'replay a seed with `branch fork` before writing one.', '']
    nb = nbr = ndiv = ns = 0
    if branches:
        sec, nb, nbr, ndiv = branch_section(branches)
        lines += ['## Branches: alternatives against the reference captain', '',
                  'Paired per branch: branch − recorded run value. Top rows; full per-state report: '
                  f'`npm run branch -- mine --corpus mining/{rung}/branches-{commit}.jsonl`.', ''] + sec + ['']
    if sweep:
        sec, ns = sweep_section(sweep)
        lines += ['## Crew sweep: reference variants on held-out seeds', ''] + sec + ['']
    with open(os.path.join(folder, 'LATEST.md'), 'w') as f:
        f.write('\n'.join(lines))
    with open(os.path.join(folder, 'history.md'), 'a') as f:
        f.write(f'- {now} {commit}: {nbr} branches ({ndiv} diverged), {nb} beating; '
                f'{len(sweep)} sweep runs, {ns} crew(s) beating\n')


if __name__ == '__main__':
    main()
