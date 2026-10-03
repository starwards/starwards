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
- **Reserve is set by design:** λ0 0.3 and λ1 0.4. The store to hold rises from 0.25 at no risk to 0.5 at
  full risk (N0 0.25, β 1), and holding it earns R = 0.9 (k = ln 10). Only ε is fitted (0.01).
- **For reference only**, the free reserve fit gives `{k 0.5, N0 1, β 0, λ0 0.2, λ1 0}`.

## Does the reserve credit the reference engineer's held store? No

Store is the energy share plus 0.3 per cell (EVIDENCE, mean over frames):

| scenario    | reference store, R at r=0 | idle          | all-max       | never-jump-start |
| ----------- | ------------------------- | ------------- | ------------- | ---------------- |
| E1-MK2      | 0.263, R 0.43             | 0.326, R 0.94 | 0.324, R 0.94 | 0.438, R 0.96    |
| E1-predator | 0.116, R 0.23             | 0.319, R 0.94 | 0.315, R 0.94 | 0.352, R 0.95    |

The reference engineer spends its energy cell on a jump-start. Idle never does, so the unspent cell
(+0.3) holds idle's store at the full-reserve level. The 0.10–0.24 store seen earlier was the energy share
alone. As defined, R rewards hoarding the cell.

INFERENCE: R should either count only the energy in the store, with the cells as a separate fallback, or
count a cell at less than its energy.

## KPI against outcome

The full table is below ("KPI against outcome"). An ordering is required only where an outcome CI excludes 0. EVIDENCE for reference − idle:

| scenario       | KPI Δ               | kill Δ            | integrity kept Δ   | KPI sign agrees              |
| -------------- | ------------------- | ----------------- | ------------------ | ---------------------------- |
| T1             | 0.092 ✓             | 0.667 ✓           | −0.04 (CI spans 0) | 8/11                         |
| T1-MK2         | −0.015 (CI spans 0) | 0.500 ✓           | −0.04 (CI spans 0) | 9/12                         |
| T0-constrained | −0.036 (CI spans 0) | 0.08 (CI spans 0) | 0                  | – (outcomes do not separate) |
| E1-MK2         | −0.058 ✗            | 0.17 (CI spans 0) | −0.183 ✗           | 9/12                         |
| E1-predator    | −0.120 ✗            | 0                 | −0.213 ✗           | 12/12                        |

Where kills separate the policies (T1, T1-MK2), the KPI agrees on T1 and is null on T1-MK2. On E1 the
outcome that separates is integrity kept, and it favours idle. INFERENCE: integrity kept is a poor
outcome on its own. A ship that fights less keeps more integrity, which is also why all-shutdown "beats"
idle on integrity in E1 and T1-MK2. Combining it with kills as an "either separates" rule gives
contradictory verdicts.

## Full validator output

runs 420; scenarios E1-MK2, E1-predator, T0-constrained, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): `{"bias":-4.803,"coef":[2.323,0.527,1.997,0,0.883]}` over threats, proximity, blastRate, damage, unscanned

weights: `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`; weakest standardised fit-seed contrast -2.661; predictive constraint met

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

| scenario       | reference − idle               | idle − all-shutdown         | reference − all-max            | reference − random             | reference − never-jump-start   | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ------------------------------ | --------------------------- | ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------- | ------------------------------- |
| E1-MK2         | -0.058 [-0.105, -0.008] n=12 ✗ | 0.005 [-0.031, 0.038] n=12  | -0.069 [-0.126, -0.005] n=12 ✗ | -0.061 [-0.101, -0.014] n=12 ✗ | -0.073 [-0.092, -0.053] n=12 ✗ | 0.013 [-0.029, 0.067] n=12      | -0.062 [-0.124, 0.005] n=12     |
| E1-predator    | -0.120 [-0.139, -0.097] n=12 ✗ | 0.049 [0.025, 0.072] n=12 ✓ | -0.129 [-0.142, -0.116] n=12 ✗ | -0.119 [-0.140, -0.099] n=12 ✗ | -0.112 [-0.131, -0.092] n=12 ✗ | -0.014 [-0.026, -0.003] n=12 ✗  | -0.121 [-0.151, -0.092] n=12 ✗  |
| T0-constrained | -0.036 [-0.072, 0.001] n=12    | 0.550 [0.530, 0.569] n=12 ✓ | 0.122 [0.021, 0.235] n=12 ✓    | 0.314 [0.253, 0.383] n=12 ✓    | 0.000 [0.000, 0.000] n=12      | -0.013 [-0.026, -0.003] n=12 ✗  | –                               |
| T1             | 0.092 [0.058, 0.124] n=12 ✓    | 0.166 [0.081, 0.247] n=12 ✓ | 0.260 [0.185, 0.340] n=12 ✓    | 0.242 [0.165, 0.315] n=12 ✓    | 0.012 [-0.001, 0.032] n=12     | -0.006 [-0.042, 0.025] n=12     | 0.221 [0.138, 0.311] n=12 ✓     |
| T1-MK2         | -0.015 [-0.082, 0.060] n=12    | 0.037 [0.000, 0.074] n=12 ✓ | 0.030 [-0.034, 0.099] n=12     | 0.050 [-0.027, 0.138] n=12     | -0.033 [-0.058, -0.011] n=12 ✗ | 0.054 [-0.007, 0.115] n=12      | -0.045 [-0.119, 0.047] n=12     |
| all            | -0.027 [-0.054, 0.000] n=60    | 0.161 [0.108, 0.219] n=60 ✓ | 0.043 [-0.004, 0.093] n=60     | 0.085 [0.035, 0.138] n=60 ✓    | -0.041 [-0.057, -0.027] n=60 ✗ | 0.007 [-0.010, 0.027] n=60      | -0.002 [-0.051, 0.050] n=48     |

reference − idle by risk tercile:

| scenario       | low                            | mid                            | high                           |
| -------------- | ------------------------------ | ------------------------------ | ------------------------------ |
| E1-MK2         | -0.130 [-0.188, -0.082] n=3 ✗  | -0.031 [-0.151, 0.093] n=12    | -0.061 [-0.120, -0.001] n=12 ✗ |
| E1-predator    | -0.165 [-0.179, -0.144] n=12 ✗ | -0.166 [-0.194, -0.131] n=12 ✗ | -0.130 [-0.161, -0.095] n=12 ✗ |
| T0-constrained | –                              | -0.036 [-0.073, 0.001] n=12    | –                              |
| T1             | -0.027 [-0.104, 0.050] n=5     | 0.099 [0.027, 0.180] n=12 ✓    | 0.022 [-0.062, 0.102] n=12     |
| T1-MK2         | -0.127 [-0.203, -0.051] n=2 ✗  | -0.025 [-0.105, 0.061] n=12    | -0.067 [-0.151, 0.033] n=12    |
| all            | -0.125 [-0.156, -0.092] n=22 ✗ | -0.032 [-0.072, 0.010] n=60    | -0.059 [-0.099, -0.019] n=48 ✗ |

### Held-out seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle              | idle − all-shutdown         | reference − all-max           | reference − random            | reference − never-jump-start   | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ----------------------------- | --------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------- | ------------------------------- |
| E1-MK2         | -0.072 [-0.136, 0.019] n=4    | 0.007 [-0.014, 0.039] n=4   | -0.056 [-0.151, 0.071] n=4    | -0.069 [-0.138, 0.017] n=4    | -0.069 [-0.102, -0.025] n=4 ✗  | -0.006 [-0.039, 0.041] n=4      | -0.043 [-0.128, 0.085] n=4      |
| E1-predator    | -0.119 [-0.127, -0.107] n=4 ✗ | 0.070 [0.037, 0.108] n=4 ✓  | -0.127 [-0.141, -0.114] n=4 ✗ | -0.124 [-0.147, -0.100] n=4 ✗ | -0.141 [-0.151, -0.135] n=4 ✗  | -0.011 [-0.028, 0.005] n=4      | -0.107 [-0.134, -0.069] n=4 ✗   |
| T0-constrained | -0.043 [-0.081, 0.024] n=4    | 0.539 [0.508, 0.577] n=4 ✓  | 0.025 [-0.053, 0.158] n=4     | 0.291 [0.174, 0.410] n=4 ✓    | 0.000 [0.000, 0.000] n=4       | -0.019 [-0.040, 0.000] n=4      | –                               |
| T1             | 0.068 [0.047, 0.101] n=4 ✓    | 0.191 [0.036, 0.304] n=4 ✓  | 0.265 [0.122, 0.380] n=4 ✓    | 0.230 [0.095, 0.324] n=4 ✓    | 0.026 [0.000, 0.076] n=4       | -0.011 [-0.097, 0.062] n=4      | 0.226 [0.097, 0.392] n=4 ✓      |
| T1-MK2         | 0.075 [-0.062, 0.196] n=4     | -0.011 [-0.051, 0.031] n=4  | 0.104 [-0.067, 0.240] n=4     | 0.117 [-0.035, 0.295] n=4     | -0.034 [-0.083, 0.000] n=4     | 0.005 [-0.082, 0.135] n=4       | 0.110 [-0.036, 0.215] n=4       |
| all            | -0.018 [-0.063, 0.032] n=20   | 0.159 [0.069, 0.257] n=20 ✓ | 0.042 [-0.036, 0.122] n=20    | 0.089 [0.005, 0.175] n=20 ✓   | -0.044 [-0.072, -0.014] n=20 ✗ | -0.008 [-0.037, 0.024] n=20     | 0.047 [-0.035, 0.135] n=16      |

reference − idle by risk tercile:

| scenario       | low                           | mid                           | high                          |
| -------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| E1-MK2         | –                             | -0.132 [-0.273, -0.003] n=4 ✗ | -0.087 [-0.210, 0.024] n=4    |
| E1-predator    | -0.168 [-0.177, -0.158] n=4 ✗ | -0.179 [-0.209, -0.150] n=4 ✗ | -0.121 [-0.157, -0.085] n=4 ✗ |
| T0-constrained | –                             | -0.044 [-0.082, 0.024] n=4    | –                             |
| T1             | -0.032 [-0.125, 0.061] n=2    | 0.149 [0.046, 0.319] n=4 ✓    | -0.045 [-0.195, 0.049] n=4    |
| T1-MK2         | -0.127 [-0.203, -0.051] n=2 ✗ | 0.046 [-0.078, 0.155] n=4     | 0.067 [-0.105, 0.212] n=4     |
| all            | -0.124 [-0.173, -0.059] n=8 ✗ | -0.032 [-0.101, 0.043] n=20   | -0.046 [-0.111, 0.021] n=16   |

### KPI against outcome

Per pair of runs on one seed: KPI Δ, kill Δ (1/0) and own integrity kept Δ over their common time, 95% bootstrap CIs. An ordering is required only where an outcome CI excludes 0; elsewhere it is informational. Agreement: share of seeds where the KPI Δ has the sign of (kill Δ + integrity kept Δ), among seeds where that is non-zero.

| scenario       | contrast                        | KPI Δ                          | kill Δ                      | integrity kept Δ               | outcome separates          | agreement |
| -------------- | ------------------------------- | ------------------------------ | --------------------------- | ------------------------------ | -------------------------- | --------- |
| E1-MK2         | reference − idle                | -0.058 [-0.105, -0.008] n=12 ✗ | 0.167 [0.000, 0.417] n=12   | -0.183 [-0.253, -0.108] n=12 ✗ | idle better                | 9/12      |
| E1-MK2         | idle − all-shutdown             | 0.005 [-0.031, 0.038] n=12     | 0.000 [0.000, 0.000] n=12   | -0.340 [-0.466, -0.224] n=12 ✗ | all-shutdown better        | 4/12      |
| E1-MK2         | reference − all-max             | -0.069 [-0.126, -0.005] n=12 ✗ | 0.167 [0.000, 0.417] n=12   | -0.234 [-0.297, -0.164] n=12 ✗ | all-max better             | 11/12     |
| E1-MK2         | reference − random              | -0.061 [-0.101, -0.014] n=12 ✗ | 0.167 [0.000, 0.417] n=12   | -0.245 [-0.317, -0.170] n=12 ✗ | random better              | 11/12     |
| E1-MK2         | reference − never-jump-start    | -0.073 [-0.092, -0.053] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.156 [-0.214, -0.098] n=12 ✗ | never-jump-start better    | 10/10     |
| E1-MK2         | reference-repairing − reference | 0.013 [-0.029, 0.067] n=12     | -0.167 [-0.417, 0.000] n=12 | 0.025 [-0.009, 0.065] n=12     | no                         | 6/9       |
| E1-predator    | reference − idle                | -0.120 [-0.139, -0.097] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.213 [-0.259, -0.168] n=12 ✗ | idle better                | 12/12     |
| E1-predator    | idle − all-shutdown             | 0.049 [0.025, 0.072] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | -0.199 [-0.277, -0.141] n=12 ✗ | all-shutdown better        | 2/12      |
| E1-predator    | reference − all-max             | -0.129 [-0.142, -0.116] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.255 [-0.315, -0.199] n=12 ✗ | all-max better             | 12/12     |
| E1-predator    | reference − random              | -0.119 [-0.140, -0.099] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.153 [-0.216, -0.093] n=12 ✗ | random better              | 11/11     |
| E1-predator    | reference − never-jump-start    | -0.112 [-0.131, -0.092] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.052 [-0.085, -0.022] n=12 ✗ | never-jump-start better    | 7/7       |
| E1-predator    | reference-repairing − reference | -0.014 [-0.026, -0.003] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.003 [-0.008, 0.000] n=12    | no                         | 0/1       |
| T0-constrained | reference − idle                | -0.036 [-0.072, 0.001] n=12    | 0.083 [0.000, 0.250] n=12   | 0.000 [0.000, 0.000] n=12      | no                         | 0/2       |
| T0-constrained | idle − all-shutdown             | 0.550 [0.530, 0.569] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | -0.000 [-0.000, 0.000] n=12    | idle better                | 8/8       |
| T0-constrained | reference − all-max             | 0.122 [0.021, 0.235] n=12 ✓    | 0.333 [0.000, 0.667] n=12   | 0.000 [0.000, 0.000] n=12      | no                         | 5/6       |
| T0-constrained | reference − random              | 0.314 [0.253, 0.383] n=12 ✓    | 0.750 [0.500, 1.000] n=12 ✓ | 0.000 [0.000, 0.000] n=12      | reference better           | 9/9       |
| T0-constrained | reference − never-jump-start    | 0.000 [0.000, 0.000] n=12      | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12      | no                         | –         |
| T0-constrained | reference-repairing − reference | -0.013 [-0.026, -0.003] n=12 ✗ | 0.000 [-0.250, 0.250] n=12  | 0.000 [0.000, 0.000] n=12      | no                         | 1/2       |
| T1             | reference − idle                | 0.092 [0.058, 0.124] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | -0.038 [-0.123, 0.049] n=12    | reference better           | 8/11      |
| T1             | idle − all-shutdown             | 0.166 [0.081, 0.247] n=12 ✓    | 0.083 [0.000, 0.250] n=12   | -0.078 [-0.183, 0.029] n=12    | no                         | 9/12      |
| T1             | reference − all-max             | 0.260 [0.185, 0.340] n=12 ✓    | 0.750 [0.500, 0.917] n=12 ✓ | -0.071 [-0.148, 0.016] n=12    | reference better           | 9/12      |
| T1             | reference − random              | 0.242 [0.165, 0.315] n=12 ✓    | 0.667 [0.333, 0.917] n=12 ✓ | -0.006 [-0.081, 0.065] n=12    | reference better           | 9/12      |
| T1             | reference − never-jump-start    | 0.012 [-0.001, 0.032] n=12     | 0.167 [0.000, 0.417] n=12   | -0.004 [-0.027, 0.014] n=12    | no                         | 5/5       |
| T1             | reference-repairing − reference | -0.006 [-0.042, 0.025] n=12    | -0.167 [-0.417, 0.000] n=12 | -0.055 [-0.101, -0.012] n=12 ✗ | reference better           | 6/11      |
| T1-MK2         | reference − idle                | -0.015 [-0.082, 0.060] n=12    | 0.500 [0.250, 0.833] n=12 ✓ | -0.040 [-0.104, 0.030] n=12    | reference better           | 9/12      |
| T1-MK2         | idle − all-shutdown             | 0.037 [0.000, 0.074] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | -0.467 [-0.569, -0.358] n=12 ✗ | all-shutdown better        | 5/12      |
| T1-MK2         | reference − all-max             | 0.030 [-0.034, 0.099] n=12     | 0.417 [0.167, 0.667] n=12 ✓ | -0.202 [-0.327, -0.066] n=12 ✗ | reference better           | 9/12      |
| T1-MK2         | reference − random              | 0.050 [-0.027, 0.138] n=12     | 0.500 [0.250, 0.833] n=12 ✓ | -0.127 [-0.218, -0.039] n=12 ✗ | reference better           | 5/11      |
| T1-MK2         | reference − never-jump-start    | -0.033 [-0.058, -0.011] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | -0.065 [-0.127, -0.010] n=12 ✗ | never-jump-start better    | 4/5       |
| T1-MK2         | reference-repairing − reference | 0.054 [-0.007, 0.115] n=12     | 0.083 [-0.250, 0.417] n=12  | 0.059 [0.020, 0.095] n=12 ✓    | reference-repairing better | 6/12      |
| all            | reference − idle                | -0.027 [-0.054, 0.000] n=60    | 0.283 [0.167, 0.400] n=60 ✓ | -0.095 [-0.130, -0.060] n=60 ✗ | reference better           | 38/49     |
| all            | idle − all-shutdown             | 0.161 [0.108, 0.219] n=60 ✓    | 0.150 [0.067, 0.250] n=60 ✓ | -0.217 [-0.276, -0.154] n=60 ✗ | idle better                | 28/56     |
| all            | reference − all-max             | 0.043 [-0.004, 0.093] n=60     | 0.333 [0.200, 0.467] n=60 ✓ | -0.152 [-0.195, -0.107] n=60 ✗ | reference better           | 46/54     |
| all            | reference − random              | 0.085 [0.035, 0.138] n=60 ✓    | 0.417 [0.283, 0.550] n=60 ✓ | -0.106 [-0.144, -0.069] n=60 ✗ | reference better           | 45/55     |
| all            | reference − never-jump-start    | -0.041 [-0.057, -0.027] n=60 ✗ | 0.033 [0.000, 0.083] n=60   | -0.055 [-0.079, -0.033] n=60 ✗ | never-jump-start better    | 26/27     |
| all            | reference-repairing − reference | 0.007 [-0.010, 0.027] n=60     | -0.050 [-0.150, 0.050] n=60 | 0.005 [-0.012, 0.023] n=60     | no                         | 19/35     |

### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)

| held out       | weights                                                                                 | reference − idle               | idle − all-shutdown         | reference − all-max (high risk) |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------ | --------------------------- | ------------------------------- |
| E1-MK2         | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.057 [-0.105, -0.008] n=12 ✗ | 0.007 [-0.030, 0.040] n=12  | -0.065 [-0.126, 0.000] n=12     |
| E1-predator    | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.121 [-0.140, -0.098] n=12 ✗ | 0.048 [0.024, 0.071] n=12 ✓ | -0.123 [-0.151, -0.094] n=12 ✗  |
| T0-constrained | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.027 [-0.061, 0.008] n=12    | 0.527 [0.495, 0.557] n=12 ✓ | 0.020 [-0.021, 0.082] n=10      |
| T1             | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.093 [0.059, 0.126] n=12 ✓    | 0.177 [0.090, 0.259] n=12 ✓ | 0.227 [0.144, 0.318] n=12 ✓     |
| T1-MK2         | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.014 [-0.081, 0.061] n=12    | 0.040 [0.003, 0.078] n=12 ✓ | -0.045 [-0.120, 0.047] n=12     |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h).

| set            | h   | mean r | low    | mid   | high   |
| -------------- | --- | ------ | ------ | ----- | ------ |
| fit seeds      | 60  | -0.035 | -0.109 | 0.118 | -0.114 |
| fit seeds      | 120 | 0.034  | 0.033  | 0.177 | -0.107 |
| held-out seeds | 60  | 0.064  | -0.017 | 0.204 | 0.005  |
| held-out seeds | 120 | 0.126  | -0.030 | 0.285 | 0.122  |
