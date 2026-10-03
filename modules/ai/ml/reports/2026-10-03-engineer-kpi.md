# Engineer KPI, phase 1 validation, 2026-10-03

KPI definition: `src/scoring/engineer-kpi.ts`. Validator: `npm run score:engineer` (`--free-reserve` also fits
the reserve weights). Runs: 420 headless, all in `training-archive/2026-10-03/engineer-kpi/`: 5 scenarios ×
seeds 1–12 × 7 engineer policies, with helms and weapons on reference. Jev spend $0.

- T1, T1-MK2 and T0-constrained were recorded at `d3cbe0e4`.
- E1-MK2 and E1-predator are energy-bound: the GVTS reactor runs at 50% output and starts at 30–60%
  energy with one cell, against an attacking dragonfly-MK2 or predator. In a smoke run the reference
  engineer's mean store was 0.10–0.24 and idle's 0.04.

## Design

- **Demand** comes from the other seats' requests: smart-pilot commands, a TARGET mode, afterburner
  presses, weapons' fire decisions (1) or a held lock (0.5), and tube commands.
- **Supply** is `min(1, power / NORMAL) × hacked`. Lift the cap and refit once #2305 lands.
- **Integrity** looks 60 s ahead.
- **Pairing:** two runs of a seed are compared over their common time.
- **Risk** is a logistic with non-negative coefficients, fitted to P(own integrity loss ≥ 0.02 in 30 s).
- **Reserve weights are set by design:** λ0 0.3, λ1 0.4 and β 3. β = 3 is what 2 of the 3 earlier
  leave-one-scenario-out fits chose.

## Result (fixed reserve, all 5 scenarios)

| ordering                        | E1-MK2             | E1-predator        | T0-constrained      | T1      | T1-MK2              | pooled             |
| ------------------------------- | ------------------ | ------------------ | ------------------- | ------- | ------------------- | ------------------ |
| reference > idle                | 0.012 (CI spans 0) | −0.015 ✗           | −0.040 ✗            | 0.075 ✓ | 0.010 (CI spans 0)  | 0.008 (CI spans 0) |
| idle > all-shutdown             | 0.068 ✓            | 0.058 ✓            | 0.591 ✓             | 0.193 ✓ | 0.041 ✓             | 0.190 ✓            |
| reference > all-max (high risk) | 0.013 (CI spans 0) | 0.001 (CI spans 0) | no high-risk frames | 0.178 ✓ | −0.021 (CI spans 0) | 0.043 ✓            |

The 120 s predictive constraint is met: mean within-tercile r is 0.06 on the fit seeds and 0.13 held out.
The 60 s r is about 0.

## Reserve-weight stability on the energy-bound scenarios

With `--free-reserve` on E1-MK2 and E1-predator, both leave-one-scenario-out fits choose λ0 = λ1 = β = 0.
With that choice, reference > idle holds on each held-out scenario: 0.040 [0.006, 0.077] and
0.021 [0.003, 0.037]. The fit is stable, but at zero reserve, and those weights fail the predictive
constraint.

INFERENCE: the reserve term as written does not credit the reference engineer for keeping energy in hand.
It shrinks K for every policy when risk is high, and idle runs more systems at NORMAL power.

## Risk curve

Coefficients are non-negative: bias −4.803; threats 2.323, proximity 0.527, blastRate 1.997, damage 0,
unscanned 0.883. The damage coefficient pins at 0. T0-constrained has no high-risk frames; E1-predator
has 64% of its frames in the low tercile.

## Recording extensions

- `defect` events `{system, cause}` (cause hit/overheat/warp) from `DamageManager.onDefect`.
- `energy` events `{demand, granted}` per frame from `EnergyManager.lastFlow` (`ShipManagerPc` ships only).
- `energyStarved` and `thruster.active` are gameFields; `radar.supply` is not.

## Full validator output

runs 420; scenarios E1-MK2, E1-predator, T0-constrained, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): `{"bias":-4.803,"coef":[2.323,0.527,1.997,0,0.883]}` over threats, proximity, blastRate, damage, unscanned

weights: `{"k":0.5,"n0":1,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`; weakest standardised fit-seed contrast -1.054; predictive constraint met

risk tercile cuts: 0.124, 0.360. Frame share per tercile:

| scenario       | low  | mid  | high |
| -------------- | ---- | ---- | ---- |
| E1-MK2         | 0.21 | 0.32 | 0.46 |
| E1-predator    | 0.64 | 0.10 | 0.26 |
| T0-constrained | 0.31 | 0.69 | 0.00 |
| T1             | 0.17 | 0.39 | 0.44 |
| T1-MK2         | 0.29 | 0.29 | 0.42 |

### All seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle               | idle − all-shutdown         | reference − all-max            | reference − random          | reference − never-jump-start   | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ------------------------------ | --------------------------- | ------------------------------ | --------------------------- | ------------------------------ | ------------------------------- | ------------------------------- |
| E1-MK2         | 0.012 [-0.010, 0.035] n=12     | 0.068 [0.044, 0.094] n=12 ✓ | -0.003 [-0.035, 0.027] n=12    | 0.018 [0.000, 0.040] n=12 ✓ | -0.002 [-0.007, 0.004] n=12    | 0.010 [-0.012, 0.037] n=12      | 0.013 [-0.014, 0.037] n=12      |
| E1-predator    | -0.015 [-0.025, -0.004] n=12 ✗ | 0.058 [0.047, 0.067] n=12 ✓ | -0.019 [-0.027, -0.011] n=12 ✗ | -0.007 [-0.017, 0.001] n=12 | -0.008 [-0.014, -0.000] n=12 ✗ | -0.009 [-0.017, -0.002] n=12 ✗  | 0.001 [-0.016, 0.018] n=12      |
| T0-constrained | -0.040 [-0.072, -0.008] n=12 ✗ | 0.591 [0.572, 0.609] n=12 ✓ | 0.084 [-0.013, 0.194] n=12     | 0.282 [0.222, 0.347] n=12 ✓ | 0.000 [0.000, 0.000] n=12      | -0.012 [-0.022, -0.003] n=12 ✗  | –                               |
| T1             | 0.075 [0.040, 0.109] n=12 ✓    | 0.193 [0.117, 0.268] n=12 ✓ | 0.212 [0.150, 0.280] n=12 ✓    | 0.224 [0.160, 0.292] n=12 ✓ | 0.019 [0.006, 0.035] n=12 ✓    | -0.010 [-0.035, 0.013] n=12     | 0.178 [0.108, 0.259] n=12 ✓     |
| T1-MK2         | 0.010 [-0.028, 0.055] n=12     | 0.041 [0.013, 0.070] n=12 ✓ | 0.028 [-0.014, 0.079] n=12     | 0.067 [0.010, 0.131] n=12 ✓ | -0.004 [-0.011, 0.001] n=12    | 0.029 [-0.004, 0.062] n=12      | -0.021 [-0.087, 0.049] n=12     |
| all            | 0.008 [-0.008, 0.026] n=60     | 0.190 [0.136, 0.248] n=60 ✓ | 0.060 [0.027, 0.097] n=60 ✓    | 0.117 [0.081, 0.155] n=60 ✓ | 0.001 [-0.003, 0.006] n=60     | 0.001 [-0.009, 0.013] n=60      | 0.043 [0.010, 0.078] n=48 ✓     |

reference − idle by risk tercile:

| scenario       | low                            | mid                            | high                        |
| -------------- | ------------------------------ | ------------------------------ | --------------------------- |
| E1-MK2         | -0.021 [-0.038, -0.003] n=3 ✗  | 0.037 [-0.035, 0.119] n=12     | 0.011 [-0.014, 0.038] n=12  |
| E1-predator    | -0.028 [-0.037, -0.018] n=12 ✗ | -0.041 [-0.060, -0.022] n=12 ✗ | -0.011 [-0.028, 0.005] n=12 |
| T0-constrained | –                              | -0.040 [-0.071, -0.009] n=12 ✗ | –                           |
| T1             | 0.032 [-0.052, 0.108] n=5      | 0.097 [0.034, 0.169] n=12 ✓    | 0.023 [-0.036, 0.081] n=12  |
| T1-MK2         | -0.033 [-0.073, 0.007] n=2     | 0.026 [-0.025, 0.076] n=12     | -0.030 [-0.079, 0.023] n=12 |
| all            | -0.014 [-0.034, 0.010] n=22    | 0.016 [-0.012, 0.044] n=60     | -0.002 [-0.024, 0.020] n=48 |

### Held-out seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle              | idle − all-shutdown         | reference − all-max           | reference − random          | reference − never-jump-start  | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ----------------------------- | --------------------------- | ----------------------------- | --------------------------- | ----------------------------- | ------------------------------- | ------------------------------- |
| E1-MK2         | 0.001 [-0.032, 0.021] n=4     | 0.070 [0.026, 0.125] n=4 ✓  | 0.011 [-0.018, 0.042] n=4     | 0.006 [-0.024, 0.036] n=4   | 0.002 [-0.009, 0.015] n=4     | 0.005 [-0.013, 0.035] n=4       | 0.027 [0.010, 0.059] n=4 ✓      |
| E1-predator    | -0.011 [-0.019, -0.001] n=4 ✗ | 0.065 [0.055, 0.077] n=4 ✓  | -0.012 [-0.022, -0.001] n=4 ✗ | -0.006 [-0.019, 0.005] n=4  | -0.015 [-0.022, -0.007] n=4 ✗ | -0.008 [-0.023, 0.005] n=4      | 0.012 [-0.003, 0.037] n=4       |
| T0-constrained | -0.050 [-0.080, 0.002] n=4    | 0.568 [0.542, 0.604] n=4 ✓  | -0.017 [-0.084, 0.101] n=4    | 0.245 [0.124, 0.377] n=4 ✓  | 0.000 [0.000, 0.000] n=4      | -0.018 [-0.036, 0.000] n=4      | –                               |
| T1             | 0.035 [-0.003, 0.067] n=4     | 0.195 [0.078, 0.318] n=4 ✓  | 0.211 [0.123, 0.298] n=4 ✓    | 0.218 [0.101, 0.306] n=4 ✓  | 0.026 [0.000, 0.060] n=4      | -0.012 [-0.075, 0.052] n=4      | 0.191 [0.079, 0.332] n=4 ✓      |
| T1-MK2         | 0.060 [-0.012, 0.124] n=4     | -0.001 [-0.006, 0.003] n=4  | 0.103 [0.003, 0.192] n=4 ✓    | 0.122 [0.030, 0.232] n=4 ✓  | -0.006 [-0.024, 0.005] n=4    | 0.001 [-0.051, 0.080] n=4       | 0.100 [0.022, 0.155] n=4 ✓      |
| all            | 0.007 [-0.016, 0.032] n=20    | 0.179 [0.093, 0.279] n=20 ✓ | 0.059 [0.012, 0.113] n=20 ✓   | 0.117 [0.062, 0.178] n=20 ✓ | 0.001 [-0.007, 0.012] n=20    | -0.006 [-0.026, 0.015] n=20     | 0.083 [0.038, 0.138] n=16 ✓     |

reference − idle by risk tercile:

| scenario       | low                           | mid                           | high                        |
| -------------- | ----------------------------- | ----------------------------- | --------------------------- |
| E1-MK2         | –                             | -0.028 [-0.134, 0.062] n=4    | -0.007 [-0.061, 0.042] n=4  |
| E1-predator    | -0.026 [-0.030, -0.020] n=4 ✗ | -0.040 [-0.057, -0.021] n=4 ✗ | -0.002 [-0.027, 0.023] n=4  |
| T0-constrained | –                             | -0.050 [-0.079, 0.003] n=4    | –                           |
| T1             | -0.016 [-0.094, 0.061] n=2    | 0.139 [0.028, 0.291] n=4 ✓    | -0.034 [-0.138, 0.031] n=4  |
| T1-MK2         | -0.033 [-0.073, 0.007] n=2    | 0.075 [0.026, 0.127] n=4 ✓    | 0.041 [-0.057, 0.125] n=4   |
| all            | -0.025 [-0.055, 0.007] n=8    | 0.019 [-0.025, 0.074] n=20    | -0.001 [-0.034, 0.033] n=16 |

### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)

| held out       | weights                                                                   | reference − idle               | idle − all-shutdown         | reference − all-max (high risk) |
| -------------- | ------------------------------------------------------------------------- | ------------------------------ | --------------------------- | ------------------------------- |
| E1-MK2         | `{"k":0.5,"n0":1,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`    | 0.012 [-0.010, 0.035] n=12     | 0.068 [0.044, 0.093] n=12 ✓ | 0.010 [-0.017, 0.033] n=12      |
| E1-predator    | `{"k":0.5,"n0":0.25,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.052 [-0.064, -0.037] n=12 ✗ | 0.016 [-0.006, 0.036] n=12  | -0.018 [-0.037, 0.001] n=12     |
| T0-constrained | `{"k":0.5,"n0":1,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`    | -0.036 [-0.065, -0.007] n=12 ✗ | 0.533 [0.516, 0.548] n=12 ✓ | -0.014 [-0.049, 0.035] n=10     |
| T1             | `{"k":0.5,"n0":1,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`    | 0.079 [0.043, 0.115] n=12 ✓    | 0.201 [0.123, 0.279] n=12 ✓ | 0.187 [0.114, 0.271] n=12 ✓     |
| T1-MK2         | `{"k":0.5,"n0":1,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`    | 0.010 [-0.028, 0.055] n=12     | 0.041 [0.013, 0.070] n=12 ✓ | -0.022 [-0.089, 0.048] n=12     |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h).

| set            | h   | mean r | low    | mid   | high   |
| -------------- | --- | ------ | ------ | ----- | ------ |
| fit seeds      | 60  | -0.011 | -0.090 | 0.150 | -0.094 |
| fit seeds      | 120 | 0.061  | 0.060  | 0.199 | -0.077 |
| held-out seeds | 60  | 0.065  | -0.015 | 0.188 | 0.021  |
| held-out seeds | 120 | 0.128  | -0.025 | 0.258 | 0.150  |
