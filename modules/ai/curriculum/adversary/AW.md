# Adversary rung AW

Crew `captain-reference` fixed; only the raider varies. Seeds 1-3, timeout 1500 s.

## Crew outcome by NPC profile

| profile | runs | passes | pass rate | 95% CI | median s | mean run value | mean waves survived |
|---|---|---|---|---|---|---|---|
| today | 3 | 2 | 67% | 21%-94% | 1344 | 0.014 | 2.67 |
| intercept | 3 | 0 | 0% | 0%-56% | 1500 | -0.099 | 2.00 |
| shadow | 3 | 3 | 100% | 44%-100% | 1271 | 0.103 | 3.00 |
| noweave | 3 | 3 | 100% | 44%-100% | 1235 | 0.224 | 3.00 |

## Raider fingerprints (pooled over runs)

Range is to the engaged target, in km; the table shows the share of raider-time in each bin.

| profile | raiders | raider-s | 0-0.5 | 0.5-1 | 1-2 | 2-3 | 3-5 | 5-8 | 8-15 | 15-50 | 50+ | mean speed m/s | fire duty | switches/min | hits | on broken plates |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| today | 44 | 18423 | 0% | 1% | 7% | 6% | 23% | 1% | 3% | 18% | 41% | 392 | 27% | 0.09 | 12239 | 99% |
| intercept | 58 | 25672 | 0% | 6% | 14% | 4% | 21% | 2% | 4% | 17% | 32% | 396 | 24% | 0.12 | 13236 | 89% |
| shadow | 37 | 16168 | 0% | 0% | 9% | 23% | 2% | 2% | 3% | 17% | 44% | 396 | 30% | 0.09 | 15166 | 99% |
| noweave | 37 | 15588 | 0% | 1% | 2% | 6% | 24% | 3% | 3% | 17% | 45% | 357 | 30% | 0.12 | 12682 | 99% |

## Range separation (total variation, 0 identical to 1 disjoint; below 0.1 the profiles are not told apart by range)

| | today | intercept | shadow | noweave |
|---|---|---|---|---|
| today | . | 0.14 | 0.23 | 0.06 |
| intercept | 0.14 | . | 0.31 | 0.18 |
| shadow | 0.23 | 0.31 | . | 0.24 |
| noweave | 0.06 | 0.18 | 0.24 | . |
