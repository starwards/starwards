# Adversary rung AW

Crew `captain-reference` fixed; only the raider varies. Seeds 1-3, timeout 1500 s.

## Crew outcome by NPC profile

| profile | runs | passes | pass rate | 95% CI | median s | mean run value | mean waves survived |
|---|---|---|---|---|---|---|---|
| today | 3 | 1 | 33% | 6%-79% | 1500 | -0.115 | 2.33 |
| intercept | 3 | 2 | 67% | 21%-94% | 1344 | 0.025 | 2.67 |
| standoff | 3 | 2 | 67% | 21%-94% | 1344 | 0.025 | 2.67 |
| shadow | 3 | 1 | 33% | 6%-79% | 1500 | 0.015 | 2.33 |
| noweave | 3 | 1 | 33% | 6%-79% | 1500 | 0.064 | 2.33 |

## Raider fingerprints (pooled over runs)

Range is to the engaged target, in km; the table shows the share of raider-time in each bin.

| profile | raiders | raider-s | 0-0.5 | 0.5-1 | 1-2 | 2-3 | 3-5 | 5-8 | 8-15 | 15-50 | 50+ | mean speed m/s | fire duty | switches/min | hits | on broken plates |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| today | 51 | 24505 | 0% | 1% | 7% | 16% | 22% | 3% | 5% | 15% | 32% | 384 | 28% | 0.13 | 16131 | 99% |
| intercept | 44 | 18973 | 0% | 1% | 6% | 5% | 25% | 2% | 4% | 17% | 39% | 395 | 29% | 0.13 | 13831 | 98% |
| standoff | 44 | 18973 | 0% | 1% | 6% | 5% | 25% | 2% | 4% | 17% | 39% | 395 | 29% | 0.13 | 13831 | 98% |
| shadow | 51 | 22529 | 0% | 1% | 17% | 20% | 4% | 2% | 4% | 15% | 36% | 411 | 24% | 0.11 | 13182 | 99% |
| noweave | 51 | 23886 | 0% | 0% | 6% | 16% | 21% | 3% | 6% | 15% | 32% | 376 | 26% | 0.16 | 12792 | 99% |

## Range separation (total variation, 0 identical to 1 disjoint; below 0.1 the profiles are not told apart by range)

| | today | intercept | standoff | shadow | noweave |
|---|---|---|---|---|---|
| today | . | 0.13 | 0.13 | 0.19 | 0.02 |
| intercept | 0.13 | . | 0.00 | 0.26 | 0.14 |
| standoff | 0.13 | 0.00 | . | 0.26 | 0.14 |
| shadow | 0.19 | 0.26 | 0.26 | . | 0.20 |
| noweave | 0.02 | 0.14 | 0.14 | 0.20 | . |
