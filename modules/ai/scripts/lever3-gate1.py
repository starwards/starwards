#!/usr/bin/env python3
"""Lever-3 gate 1: can fork-state features predict the rollout-best captain action?

  python lever3-gate1.py <sweep.jsonl> <features.jsonl>

features.jsonl comes from scripts/lever3-features.ts (one line per seed/t). Stdlib only (no numpy needed).
Label per state = action kind with highest rollout pass-rate; ties prefer hold_here. Per-action pass-rate
models (logistic regression, k-NN) are fit on the other seeds; policy = argmax predicted pass-rate.
Gate 1 passes at agreement >= always-hold_here agreement + 12 pts.
"""
import json, math, sys
from collections import defaultdict

DEFAULT = 'hold_here'
K = 5


def load(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def best(rates):
    top = max(rates.values())
    return DEFAULT if rates.get(DEFAULT) == top else sorted(a for a, r in rates.items() if r == top)[0]


def logreg(X, y, w, l2=1.0, iters=400, lr=0.5):
    d = len(X[0]); b = [0.0] * (d + 1)
    sw = sum(w) or 1.0
    for _ in range(iters):
        g = [0.0] * (d + 1)
        for x, t, wi in zip(X, y, w):
            z = b[d] + sum(bi * xi for bi, xi in zip(b, x))
            e = (1 / (1 + math.exp(-max(-30, min(30, z)))) - t) * wi
            for j in range(d): g[j] += e * x[j]
            g[d] += e
        for j in range(d): b[j] -= lr * (g[j] / sw + l2 * b[j] / sw)
        b[d] -= lr * g[d] / sw
    return lambda x: 1 / (1 + math.exp(-max(-30, min(30, b[d] + sum(bi * xi for bi, xi in zip(b, x)))))), b


def main():
    rows, feats = load(sys.argv[1]), {(f['seed'], f['t']): f for f in load(sys.argv[2])}
    kind = lambda a: a.split('@')[0]
    roll = defaultdict(lambda: defaultdict(list))
    for r in rows: roll[(r['seed'], r['t'])][kind(r['alternative'])].append(1.0 if r['pass'] else 0.0)
    names = sorted({k for f in feats.values() for k in f} - {'seed'})
    for f in feats.values():  # a station gone from the dradis has no enemyTo: column: no enemy near it
        for n in names: f.setdefault(n, 20000.0)
    states = [s for s in roll if s in feats and DEFAULT in roll[s] and len(roll[s]) > 1]
    missing = [s for s in roll if s not in feats]
    actions = sorted({a for s in states for a in roll[s]})
    rate = {s: {a: sum(v) / len(v) for a, v in roll[s].items()} for s in states}
    seeds = sorted({s[0] for s in states})
    print(f'rows={len(rows)} states_with_rollouts={len(roll)} usable={len(states)} seeds={len(seeds)} '
          f'no_features={len(missing)} actions={actions}')
    if len(seeds) < 2: return print('need >=2 seeds for leave-one-seed-out')

    label = {s: best(rate[s]) for s in states}
    spread = {s: max(rate[s].values()) - rate[s][DEFAULT] for s in states}
    print(f'decisive (best-hold > 0.25): {sum(v > 0.25 for v in spread.values())}/{len(states)}')
    by_t = defaultdict(lambda: defaultdict(int))
    for s in states: by_t[s[1]][label[s]] += 1
    for t in sorted(by_t): print(f'  t={t}: ' + ' '.join(f'{a}={n}' for a, n in sorted(by_t[t].items())))
    for a in actions:
        rs = [rate[s][a] for s in states if a in rate[s]]
        print(f'  mean pass {a}: {sum(rs) / len(rs):.3f} (n={len(rs)})')

    def stdz(train):
        mu = [sum(feats[s][n] for s in train) / len(train) for n in names]
        sd = [math.sqrt(sum((feats[s][n] - m) ** 2 for s in train) / len(train)) or 1.0 for n, m in zip(names, mu)]
        return lambda s: [(feats[s][n] - m) / d for n, m, d in zip(names, mu, sd)]

    res = defaultdict(lambda: [0, 0.0, 0]); coefs = defaultdict(lambda: [0.0] * len(names))
    for held in seeds:
        train = [s for s in states if s[0] != held]; test = [s for s in states if s[0] == held]
        z = stdz(train)
        models = {}
        for a in actions:
            tr = [s for s in train if a in rate[s]]
            if not tr: continue
            f, b = logreg([z(s) for s in tr], [rate[s][a] for s in tr], [len(roll[s][a]) for s in tr])
            for j in range(len(names)): coefs[a][j] += b[j] / len(seeds)
            def knn(x, tr=tr, a=a):
                near = sorted(tr, key=lambda s: sum((u - v) ** 2 for u, v in zip(z(s), x)))[:K]
                return sum(rate[s][a] for s in near) / len(near)
            models[a] = {'logreg': f, 'knn': knn}
        for s in test:
            x = z(s); avail = [a for a in actions if a in rate[s] and a in models]
            for m in ('logreg', 'knn'):
                pred = {a: models[a][m](x) for a in avail}
                top = max(pred.values())
                pick = DEFAULT if pred.get(DEFAULT) == top else max(pred, key=pred.get)
                res[m][0] += pick == label[s]; res[m][1] += rate[s][pick]; res[m][2] += 1
            res['hold'][0] += label[s] == DEFAULT; res['hold'][1] += rate[s][DEFAULT]; res['hold'][2] += 1
            res['oracle'][0] += 1; res['oracle'][1] += rate[s][label[s]]; res['oracle'][2] += 1

    base = 100 * res['hold'][0] / res['hold'][2]
    print('leave-one-seed-out:')
    for m in ('hold', 'logreg', 'knn', 'oracle'):
        hit, pr, n = res[m]
        print(f'  {m:7s} agree={100 * hit / n:5.1f}% ({100 * hit / n - base:+.1f} pts)  pass={pr / n:.3f}')
    best_m = max(('logreg', 'knn'), key=lambda m: res[m][0])
    gap = 100 * res[best_m][0] / res[best_m][2] - base
    print(f'GATE 1: {"PASS" if gap >= 12 else "FAIL"} ({best_m} {gap:+.1f} pts vs needed +12)')
    print('top logreg features (mean |std coef| across actions):')
    imp = sorted(((sum(abs(coefs[a][j]) for a in coefs) / len(coefs), n) for j, n in enumerate(names)), reverse=True)
    for v, n in imp[:6]: print(f'  {n}: {v:.3f}')


if __name__ == '__main__':
    main()
