# Engineer KPI, phase 1 validation, 2026-10-03

KPI definition: `src/scoring/engineer-kpi.ts`. Validator: `npm run score:engineer` (`--free-reserve` also fits
the reserve weights, for reference). Runs: 420 headless, all in `training-archive/2026-10-03/engineer-kpi/`:
5 scenarios × seeds 1–12 × 7 engineer policies, with helms and weapons on reference. Jev spend $0.

- T1, T1-MK2 and T0-constrained were recorded at `d3cbe0e4`.
- E1-MK2 and E1-predator are energy-bound: the GVTS reactor runs at 50% output and starts at 30–60%
  energy with one cell, against an attacking dragonfly-MK2 or predator.

## Design

- **Demand** comes from the other seats' requests: smart-pilot commands, a TARGET mode, afterburner,
  weapons' fire decisions (1) or a held lock (0.5), and tube commands.
- **Supply** is `min(1, power / NORMAL) × hacked`. Lift the cap and refit once #2305 lands.
- **Integrity** looks 60 s ahead.
- **Pairing:** two runs of a seed are compared over their common time.
- **Risk** is a logistic with non-negative coefficients (damage pins at 0).
- **Reserve counts the reactor's energy only**; energy cells are a fallback, not reserve.
- **Reserve is set by design:** λ0 0.3 and λ1 0.4. The store to hold rises from 0.25 at no risk to 0.5 at
  full risk (N0 0.25, β 1), and holding it earns R = 0.9 (k = ln 10). Only ε is fitted (0.01).
- **For reference only**, the free reserve fit gives `{k 0.5, N0 1, β 0, λ0 0.2, λ1 0}`.

## Energy held (store share, cells excluded)

EVIDENCE, mean over frames:

| scenario       | reference | idle | all-max | all-shutdown |
| -------------- | --------- | ---- | ------- | ------------ |
| E1-MK2         | 0.17      | 0.03 | 0.02    | 0.40         |
| E1-predator    | 0.07      | 0.02 | 0.02    | 0.40         |
| T0-constrained | 0.83      | 0.74 | 0.12    | 0.17         |
| T1             | 0.64      | 0.27 | 0.11    | 0.97         |
| T1-MK2         | 0.45      | 0.21 | 0.12    | 0.97         |

The reference engineer holds more energy than idle in every scenario.

## KPI against outcome

- **Gating outcomes:** the kill, and seconds saved to the end of the run.
- **Damage rate** is own integrity lost per second a hostile is within twice its gun range. It is
  reported but does not gate.

| scenario            | contrast            | KPI Δ                                            | outcome                              | agrees          |
| ------------------- | ------------------- | ------------------------------------------------ | ------------------------------------ | --------------- |
| T1                  | reference − idle    | 0.177 ✓                                          | reference better (kills 0.667, 66 s) | yes (8/9 seeds) |
| T1                  | reference − all-max | 0.420 ✓                                          | reference better                     | yes (9/9)       |
| T1-MK2              | reference − idle    | 0.070 ✓                                          | reference better (kills 0.5, 112 s)  | yes (4/6)       |
| T1-MK2              | reference − all-max | 0.144 ✓                                          | reference better                     | yes (6/6)       |
| T0-constrained      | idle − all-shutdown | 0.630 ✓                                          | idle better                          | yes (8/8)       |
| T0-constrained      | reference − random  | 0.403 ✓                                          | reference better                     | yes (9/9)       |
| E1-MK2, E1-predator | all contrasts       | reference ranks above idle, all-max and random ✓ | no separation (almost no kills)      | informational   |

Wherever the outcomes separate two policies, the KPI's ordering agrees in sign. In every such case
except one, its CI also excludes 0. The exception is idle − all-shutdown pooled: KPI 0.053
[−0.023, 0.136] while outcomes say idle is better. That comes from E1 and T1-MK2, where all-shutdown
scores above idle on the KPI and the outcomes do not separate.

## Open design questions

1. **all-shutdown banks a full store** (0.40–0.97), so R rates it above idle where nothing is
   fought. Should the reserve's credit be capped by service, for example R counted only when S ≥ some
   floor, or K = S × (1 − λ + λR)?
2. **Reference-repairing scores at or below the reference engineer** while the outcomes do not separate
   them. Should repairs be credited directly (D looks ahead 60 s; repairs run 45 s or more)?
3. **E1 rungs produce almost no kills.** Should their gating outcome be survival time, or should the
   rungs be made winnable?

## Full validator output

runs 420; scenarios E1-MK2, E1-predator, T0-constrained, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): `{"bias":-4.803,"coef":[2.323,0.527,1.997,0,0.883]}` over threats, proximity, blastRate, damage, unscanned

weights: `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`; weakest standardised fit-seed contrast -3.600; predictive constraint met

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

| scenario       | reference − idle            | idle − all-shutdown            | reference − all-max         | reference − random          | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | --------------------------- | ------------------------------ | --------------------------- | --------------------------- | ---------------------------- | ------------------------------- | ------------------------------- |
| E1-MK2         | 0.127 [0.083, 0.175] n=12 ✓ | -0.174 [-0.200, -0.146] n=12 ✗ | 0.121 [0.069, 0.179] n=12 ✓ | 0.081 [0.053, 0.120] n=12 ✓ | 0.028 [0.018, 0.037] n=12 ✓  | -0.009 [-0.038, 0.020] n=12     | 0.162 [0.108, 0.221] n=12 ✓     |
| E1-predator    | 0.043 [0.029, 0.057] n=12 ✓ | -0.109 [-0.132, -0.088] n=12 ✗ | 0.044 [0.031, 0.057] n=12 ✓ | 0.028 [0.009, 0.046] n=12 ✓ | 0.027 [0.020, 0.035] n=12 ✓  | -0.017 [-0.028, -0.007] n=12 ✗  | 0.107 [0.072, 0.140] n=12 ✓     |
| T0-constrained | -0.018 [-0.051, 0.014] n=12 | 0.630 [0.603, 0.654] n=12 ✓    | 0.190 [0.054, 0.342] n=12 ✓ | 0.403 [0.316, 0.502] n=12 ✓ | 0.000 [0.000, 0.000] n=12    | -0.013 [-0.026, -0.003] n=12 ✗  | –                               |
| T1             | 0.177 [0.135, 0.217] n=12 ✓ | 0.039 [-0.059, 0.135] n=12     | 0.420 [0.341, 0.506] n=12 ✓ | 0.370 [0.285, 0.459] n=12 ✓ | 0.052 [0.019, 0.087] n=12 ✓  | -0.011 [-0.045, 0.020] n=12     | 0.395 [0.285, 0.521] n=12 ✓     |
| T1-MK2         | 0.070 [0.014, 0.129] n=12 ✓ | -0.123 [-0.161, -0.082] n=12 ✗ | 0.144 [0.075, 0.210] n=12 ✓ | 0.128 [0.047, 0.208] n=12 ✓ | 0.026 [0.009, 0.045] n=12 ✓  | 0.048 [-0.009, 0.107] n=12      | 0.068 [-0.036, 0.177] n=12      |
| all            | 0.080 [0.055, 0.105] n=60 ✓ | 0.053 [-0.023, 0.136] n=60     | 0.184 [0.136, 0.237] n=60 ✓ | 0.202 [0.151, 0.253] n=60 ✓ | 0.027 [0.018, 0.036] n=60 ✓  | -0.001 [-0.015, 0.017] n=60     | 0.183 [0.129, 0.237] n=48 ✓     |

reference − idle by risk tercile:

| scenario       | low                         | mid                         | high                        |
| -------------- | --------------------------- | --------------------------- | --------------------------- |
| E1-MK2         | -0.003 [-0.013, 0.009] n=3  | 0.110 [-0.007, 0.244] n=12  | 0.153 [0.104, 0.206] n=12 ✓ |
| E1-predator    | -0.005 [-0.013, 0.003] n=12 | -0.026 [-0.053, 0.001] n=12 | 0.073 [0.041, 0.103] n=12 ✓ |
| T0-constrained | –                           | -0.018 [-0.052, 0.014] n=12 | –                           |
| T1             | 0.121 [-0.011, 0.233] n=5   | 0.189 [0.096, 0.287] n=12 ✓ | 0.076 [-0.028, 0.173] n=12  |
| T1-MK2         | 0.046 [-0.030, 0.122] n=2   | 0.073 [0.010, 0.136] n=12 ✓ | -0.009 [-0.087, 0.077] n=12 |
| all            | 0.028 [-0.005, 0.065] n=22  | 0.065 [0.026, 0.109] n=60 ✓ | 0.073 [0.032, 0.112] n=48 ✓ |

### Held-out seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle            | idle − all-shutdown           | reference − all-max         | reference − random          | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | --------------------------- | ----------------------------- | --------------------------- | --------------------------- | ---------------------------- | ------------------------------- | ------------------------------- |
| E1-MK2         | 0.127 [0.044, 0.234] n=4 ✓  | -0.184 [-0.212, -0.161] n=4 ✗ | 0.143 [0.059, 0.265] n=4 ✓  | 0.065 [0.025, 0.111] n=4 ✓  | 0.025 [0.007, 0.041] n=4 ✓   | -0.012 [-0.050, 0.037] n=4      | 0.188 [0.118, 0.311] n=4 ✓      |
| E1-predator    | 0.048 [0.038, 0.057] n=4 ✓  | -0.091 [-0.122, -0.048] n=4 ✗ | 0.049 [0.039, 0.058] n=4 ✓  | 0.025 [0.004, 0.048] n=4 ✓  | 0.023 [0.016, 0.030] n=4 ✓   | -0.015 [-0.031, -0.000] n=4 ✗   | 0.124 [0.102, 0.155] n=4 ✓      |
| T0-constrained | -0.021 [-0.053, 0.034] n=4  | 0.605 [0.576, 0.634] n=4 ✓    | 0.066 [-0.042, 0.253] n=4   | 0.369 [0.203, 0.532] n=4 ✓  | 0.000 [0.000, 0.000] n=4     | -0.019 [-0.040, 0.000] n=4      | –                               |
| T1             | 0.149 [0.085, 0.197] n=4 ✓  | 0.047 [-0.111, 0.192] n=4     | 0.436 [0.324, 0.544] n=4 ✓  | 0.366 [0.203, 0.494] n=4 ✓  | 0.061 [0.000, 0.122] n=4     | -0.019 [-0.099, 0.060] n=4      | 0.438 [0.285, 0.628] n=4 ✓      |
| T1-MK2         | 0.148 [0.079, 0.196] n=4 ✓  | -0.163 [-0.220, -0.099] n=4 ✗ | 0.230 [0.109, 0.340] n=4 ✓  | 0.190 [0.084, 0.317] n=4 ✓  | 0.034 [0.000, 0.073] n=4     | 0.004 [-0.083, 0.133] n=4       | 0.246 [0.146, 0.310] n=4 ✓      |
| all            | 0.090 [0.053, 0.131] n=20 ✓ | 0.043 [-0.082, 0.180] n=20    | 0.185 [0.110, 0.267] n=20 ✓ | 0.203 [0.130, 0.285] n=20 ✓ | 0.028 [0.012, 0.047] n=20 ✓  | -0.012 [-0.040, 0.021] n=20     | 0.249 [0.176, 0.335] n=16 ✓     |

reference − idle by risk tercile:

| scenario       | low                        | mid                         | high                        |
| -------------- | -------------------------- | --------------------------- | --------------------------- |
| E1-MK2         | –                          | 0.001 [-0.152, 0.139] n=4   | 0.145 [0.037, 0.245] n=4 ✓  |
| E1-predator    | -0.003 [-0.006, 0.003] n=4 | -0.027 [-0.057, 0.008] n=4  | 0.087 [0.034, 0.131] n=4 ✓  |
| T0-constrained | –                          | -0.021 [-0.054, 0.033] n=4  | –                           |
| T1             | 0.055 [-0.122, 0.233] n=2  | 0.258 [0.109, 0.443] n=4 ✓  | -0.004 [-0.209, 0.129] n=4  |
| T1-MK2         | 0.046 [-0.030, 0.122] n=2  | 0.146 [0.106, 0.185] n=4 ✓  | 0.100 [-0.050, 0.212] n=4   |
| all            | 0.024 [-0.038, 0.101] n=8  | 0.071 [0.009, 0.145] n=20 ✓ | 0.082 [0.016, 0.141] n=16 ✓ |

### Energy held (store share without cells)

| scenario       | reference | reference-repairing | idle | never-jump-start | all-max | random | all-shutdown |
| -------------- | --------- | ------------------- | ---- | ---------------- | ------- | ------ | ------------ |
| E1-MK2         | 0.17      | 0.12                | 0.03 | 0.14             | 0.02    | 0.08   | 0.40         |
| E1-predator    | 0.07      | 0.07                | 0.02 | 0.05             | 0.02    | 0.05   | 0.40         |
| T0-constrained | 0.83      | 0.82                | 0.74 | 0.83             | 0.12    | 0.10   | 0.17         |
| T1             | 0.64      | 0.51                | 0.27 | 0.55             | 0.11    | 0.19   | 0.97         |
| T1-MK2         | 0.45      | 0.42                | 0.21 | 0.35             | 0.12    | 0.18   | 0.97         |

### KPI against outcome

Per pair of runs on one seed, positive = first policy better: KPI Δ; kill Δ (1/0); seconds saved to the end of the run (kill or timeout); damage-rate Δ (own integrity lost per second a hostile was within twice its gun range, lower better). 95% bootstrap CIs. Outcomes separate the pair when the kill or seconds-saved CI excludes 0; elsewhere the KPI ordering is informational. Agreement: seeds where the KPI Δ has the sign of the kill Δ, or of seconds saved when kills tie.

| scenario       | contrast                        | KPI Δ                          | kill Δ                      | seconds saved                     | damage-rate Δ                  | outcome separates | agreement |
| -------------- | ------------------------------- | ------------------------------ | --------------------------- | --------------------------------- | ------------------------------ | ----------------- | --------- |
| E1-MK2         | reference − idle                | 0.127 [0.083, 0.175] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -0.001 [-0.001, -0.000] n=12 ✗ | no                | 2/2       |
| E1-MK2         | idle − all-shutdown             | -0.174 [-0.200, -0.146] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.000 [-0.001, 0.001] n=12    | no                | –         |
| E1-MK2         | reference − all-max             | 0.121 [0.069, 0.179] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -0.001 [-0.001, -0.000] n=12 ✗ | no                | 2/2       |
| E1-MK2         | reference − random              | 0.081 [0.053, 0.120] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -0.000 [-0.001, 0.000] n=12    | no                | 2/2       |
| E1-MK2         | reference − never-jump-start    | 0.028 [0.018, 0.037] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.000 [-0.000, 0.000] n=12    | no                | –         |
| E1-MK2         | reference-repairing − reference | -0.009 [-0.038, 0.020] n=12    | -0.167 [-0.417, 0.000] n=12 | -37.896 [-93.150, 0.000] n=12     | 0.000 [-0.000, 0.000] n=12     | no                | 2/2       |
| E1-predator    | reference − idle                | 0.043 [0.029, 0.057] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.002 [0.001, 0.002] n=12 ✓    | no                | –         |
| E1-predator    | idle − all-shutdown             | -0.109 [-0.132, -0.088] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.001 [-0.002, -0.000] n=12 ✗ | no                | –         |
| E1-predator    | reference − all-max             | 0.044 [0.031, 0.057] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.001 [0.000, 0.002] n=12 ✓    | no                | –         |
| E1-predator    | reference − random              | 0.028 [0.009, 0.046] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.001 [0.000, 0.002] n=12 ✓    | no                | –         |
| E1-predator    | reference − never-jump-start    | 0.027 [0.020, 0.035] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.001 [0.001, 0.002] n=12 ✓    | no                | –         |
| E1-predator    | reference-repairing − reference | -0.017 [-0.028, -0.007] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.000 [-0.001, 0.000] n=12    | no                | –         |
| T0-constrained | reference − idle                | -0.018 [-0.051, 0.014] n=12    | 0.083 [0.000, 0.250] n=12   | 1.692 [-27.299, 44.625] n=12      | 0.000 [0.000, 0.000] n=12      | no                | 7/9       |
| T0-constrained | idle − all-shutdown             | 0.630 [0.603, 0.654] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | 155.442 [93.246, 217.444] n=12 ✓  | -0.000 [-0.000, 0.000] n=12    | idle better       | 8/8       |
| T0-constrained | reference − all-max             | 0.190 [0.054, 0.342] n=12 ✓    | 0.333 [0.000, 0.667] n=12   | 44.356 [-51.153, 136.067] n=12    | 0.000 [0.000, 0.000] n=12      | no                | 7/10      |
| T0-constrained | reference − random              | 0.403 [0.316, 0.502] n=12 ✓    | 0.750 [0.500, 1.000] n=12 ✓ | 157.133 [102.472, 207.304] n=12 ✓ | 0.000 [0.000, 0.000] n=12      | reference better  | 9/9       |
| T0-constrained | reference − never-jump-start    | 0.000 [0.000, 0.000] n=12      | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.000 [0.000, 0.000] n=12      | no                | –         |
| T0-constrained | reference-repairing − reference | -0.013 [-0.026, -0.003] n=12 ✗ | 0.000 [-0.250, 0.250] n=12  | -1.031 [-51.907, 51.022] n=12     | 0.000 [0.000, 0.000] n=12      | no                | 3/5       |
| T1             | reference − idle                | 0.177 [0.135, 0.217] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | 65.918 [29.313, 105.154] n=12 ✓   | 0.000 [-0.001, 0.001] n=12     | reference better  | 8/9       |
| T1             | idle − all-shutdown             | 0.039 [-0.059, 0.135] n=12     | 0.083 [0.000, 0.250] n=12   | 19.119 [0.000, 57.358] n=12       | 0.000 [-0.001, 0.001] n=12     | no                | 1/1       |
| T1             | reference − all-max             | 0.420 [0.341, 0.506] n=12 ✓    | 0.750 [0.500, 0.917] n=12 ✓ | 85.038 [43.746, 129.117] n=12 ✓   | 0.000 [-0.000, 0.001] n=12     | reference better  | 9/9       |
| T1             | reference − random              | 0.370 [0.285, 0.459] n=12 ✓    | 0.667 [0.333, 0.917] n=12 ✓ | 62.917 [-13.017, 124.233] n=12    | 0.000 [-0.001, 0.001] n=12     | reference better  | 9/10      |
| T1             | reference − never-jump-start    | 0.052 [0.019, 0.087] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 9.775 [0.000, 28.696] n=12        | 0.000 [-0.000, 0.000] n=12     | no                | 2/2       |
| T1             | reference-repairing − reference | -0.011 [-0.045, 0.020] n=12    | -0.167 [-0.417, 0.000] n=12 | -14.240 [-59.269, 29.753] n=12    | -0.000 [-0.001, -0.000] n=12 ✗ | no                | 6/9       |
| T1-MK2         | reference − idle                | 0.070 [0.014, 0.129] n=12 ✓    | 0.500 [0.250, 0.833] n=12 ✓ | 112.388 [50.975, 179.321] n=12 ✓  | 0.001 [-0.000, 0.002] n=12     | reference better  | 4/6       |
| T1-MK2         | idle − all-shutdown             | -0.123 [-0.161, -0.082] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.002 [-0.003, -0.000] n=12 ✗ | no                | –         |
| T1-MK2         | reference − all-max             | 0.144 [0.075, 0.210] n=12 ✓    | 0.417 [0.167, 0.667] n=12 ✓ | 89.958 [32.624, 156.049] n=12 ✓   | -0.000 [-0.002, 0.001] n=12    | reference better  | 6/6       |
| T1-MK2         | reference − random              | 0.128 [0.047, 0.208] n=12 ✓    | 0.500 [0.250, 0.833] n=12 ✓ | 112.388 [50.975, 179.321] n=12 ✓  | -0.001 [-0.003, 0.000] n=12    | reference better  | 4/6       |
| T1-MK2         | reference − never-jump-start    | 0.026 [0.009, 0.045] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.000 [-0.000, 0.001] n=12     | no                | –         |
| T1-MK2         | reference-repairing − reference | 0.048 [-0.009, 0.107] n=12     | 0.083 [-0.250, 0.417] n=12  | -28.865 [-91.679, 31.024] n=12    | 0.000 [0.000, 0.001] n=12 ✓    | no                | 6/9       |
| all            | reference − idle                | 0.080 [0.055, 0.105] n=60 ✓    | 0.283 [0.167, 0.400] n=60 ✓ | 43.579 [22.038, 66.340] n=60 ✓    | 0.000 [0.000, 0.001] n=60 ✓    | reference better  | 21/26     |
| all            | idle − all-shutdown             | 0.053 [-0.023, 0.136] n=60     | 0.150 [0.067, 0.250] n=60 ✓ | 34.912 [15.535, 57.166] n=60 ✓    | -0.001 [-0.001, -0.000] n=60 ✗ | idle better       | 9/9       |
| all            | reference − all-max             | 0.184 [0.136, 0.237] n=60 ✓    | 0.333 [0.200, 0.467] n=60 ✓ | 51.449 [24.071, 78.032] n=60 ✓    | 0.000 [-0.000, 0.000] n=60     | reference better  | 24/27     |
| all            | reference − random              | 0.202 [0.151, 0.253] n=60 ✓    | 0.417 [0.283, 0.550] n=60 ✓ | 74.067 [48.189, 102.495] n=60 ✓   | -0.000 [-0.000, 0.000] n=60    | reference better  | 24/27     |
| all            | reference − never-jump-start    | 0.027 [0.018, 0.036] n=60 ✓    | 0.033 [0.000, 0.083] n=60   | 1.955 [0.000, 5.739] n=60         | 0.000 [0.000, 0.001] n=60 ✓    | no                | 2/2       |
| all            | reference-repairing − reference | -0.001 [-0.015, 0.017] n=60    | -0.050 [-0.150, 0.050] n=60 | -16.406 [-37.553, 3.549] n=60     | 0.000 [-0.000, 0.000] n=60     | no                | 17/25     |

### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)

| held out       | weights                                                                                 | reference − idle            | idle − all-shutdown            | reference − all-max (high risk) |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------- | ------------------------------ | ------------------------------- |
| E1-MK2         | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.127 [0.083, 0.176] n=12 ✓ | -0.172 [-0.198, -0.145] n=12 ✗ | 0.158 [0.105, 0.216] n=12 ✓     |
| E1-predator    | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.2}`  | 0.040 [0.027, 0.053] n=12 ✓ | -0.134 [-0.151, -0.115] n=12 ✗ | 0.102 [0.069, 0.135] n=12 ✓     |
| T0-constrained | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.05}` | -0.004 [-0.035, 0.024] n=12 | 0.614 [0.580, 0.644] n=12 ✓    | 0.056 [-0.001, 0.143] n=10      |
| T1             | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.175 [0.133, 0.215] n=12 ✓ | 0.056 [-0.042, 0.152] n=12     | 0.396 [0.286, 0.519] n=12 ✓     |
| T1-MK2         | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.070 [0.014, 0.129] n=12 ✓ | -0.118 [-0.157, -0.077] n=12 ✗ | 0.068 [-0.035, 0.177] n=12      |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h).

| set            | h   | mean r | low    | mid   | high   |
| -------------- | --- | ------ | ------ | ----- | ------ |
| fit seeds      | 60  | -0.018 | -0.065 | 0.119 | -0.106 |
| fit seeds      | 120 | 0.060  | 0.106  | 0.177 | -0.103 |
| held-out seeds | 60  | 0.073  | 0.007  | 0.193 | 0.019  |
| held-out seeds | 120 | 0.135  | 0.003  | 0.273 | 0.129  |
