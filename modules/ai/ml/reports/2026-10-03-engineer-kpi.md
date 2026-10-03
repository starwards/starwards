# Engineer KPI, phase 1 validation, 2026-10-03

KPI definition: `src/scoring/engineer-kpi.ts`. Validator: `npm run score:engineer`. Runs: 252 headless
(T1, T1-MK2, T0-constrained × seeds 1–12 × 7 engineer policies; helms and weapons reference), archived in
`training-archive/2026-10-03/engineer-kpi/` at code `d3cbe0e4`. Jev spend $0.

## Verdict

The KPI is **not yet valid**. Required orderings:

| ordering                                        | result                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| reference > idle                                | holds pooled (Δ 0.052 [0.016, 0.091]); per scenario holds T0-constrained, T1; T1-MK2 CI spans 0                   |
| idle > all-shutdown                             | holds pooled and T0-constrained; T1 null; **fails T1-MK2** (Δ −0.043 [−0.077, −0.006])                            |
| all-max < reference at high risk                | **fails**: all-max has the highest pooled mean K; T1-MK2 high tercile reference − all-max −0.119 [−0.194, −0.039] |
| K predicts 60–120 s outcome within risk tercile | **fails**: mean within-tercile r −0.19 / −0.17 (fit seeds), −0.09 / −0.01 (held-out)                              |

Kills agree with the intended ordering (reference 24/36, idle 9/36, all-max 6/36, all-shutdown 0/36), so the
policies separate; the score does not.

## Diagnosed causes (inference, from the tables and formula)

1. Service rewards power directly: `e = power × hacked`, so all-max scores S≈1 against the reference's ≈0.5.
   Over-powering costs only through R and D, and the energy cost per unit output is flat in power (#2305),
   so all-max rarely drains. Needs either S against a power target (NORMAL = full service) or #2305.
2. Demand is read from realised activity. A shut-down ship cannot fire or (with dead thrusters) usefully
   steer, so its demand falls below the 0.1 floor and K becomes D·R with a full store — all-shutdown
   scores high exactly where it fails (T1-MK2).
3. Run-level comparison mixes durations: winning runs end at the kill (often under 100 s), losing runs run
   300 s. Frame-weighted means and the negative outcome correlation are both confounded by this (losing
   policies sit long in calm, high-K frames).
4. Risk logistic is hand-set and saturates: tercile cuts 0.50 / 0.93; T0-constrained has no high-risk frames.

## Fitted weights (provisional)

Grid fit (k, N0, β, λ0, λ1, ε) maximising the weakest standardised required contrast on seeds 1–8; no grid
point met the predictive constraint, so the fallback best is used:
`{"k":0.5,"n0":0.5,"beta":0,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` (weakest contrast −0.39).
Leave-one-scenario-out fits are unstable (β 0 vs 3, ε 0.01 vs 0.2). Refit after #2305 lands and after
fixing causes 1–3.

## Recording extensions

- `defect` events `{system, cause}` (cause hit/overheat/warp) from `DamageManager.onDefect`.
- `energy` events `{demand, granted}` per frame from `EnergyManager.lastFlow` (player ships with `ShipManagerPc`).
- `energyStarved` and `thruster.active` are gameFields; `radar.supply` is not (its effect shows through `energyStarved`).

## Full validator output

runs 252; scenarios T0-constrained, T1, T1-MK2; seeds 1,2,3,4,5,6,7,8,9,10,11,12
fit seeds 1,2,3,4,5,6,7,8; held-out seeds 9,10,11,12

fitted weights: `{"k":0.5,"n0":0.5,"beta":0,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` (weakest standardised train contrast -0.389; predictive constraint NOT met)

risk tercile cuts (all frames): 0.500, 0.925

### Mean run K by policy (all seeds)

| scenario       | reference | reference-repairing | idle  | never-jump-start | all-max | random | all-shutdown |
| -------------- | --------- | ------------------- | ----- | ---------------- | ------- | ------ | ------------ |
| T0-constrained | 0.558     | 0.554               | 0.539 | 0.558            | 0.633   | 0.425  | 0.217        |
| T1             | 0.450     | 0.420               | 0.367 | 0.451            | 0.405   | 0.359  | 0.360        |
| T1-MK2         | 0.350     | 0.321               | 0.295 | 0.371            | 0.419   | 0.287  | 0.338        |
| all            | 0.452     | 0.432               | 0.400 | 0.460            | 0.485   | 0.357  | 0.305        |

### Kills by policy

| scenario       | reference | reference-repairing | idle | never-jump-start | all-max | random | all-shutdown |
| -------------- | --------- | ------------------- | ---- | ---------------- | ------- | ------ | ------------ |
| T0-constrained | 9/12      | 9/12                | 8/12 | 9/12             | 5/12    | 0/12   | 0/12         |
| T1             | 9/12      | 7/12                | 1/12 | 7/12             | 0/12    | 1/12   | 0/12         |
| T1-MK2         | 6/12      | 7/12                | 0/12 | 6/12             | 1/12    | 0/12   | 0/12         |

### All seeds

Paired Δ mean run K, 95% bootstrap CI over (scenario, seed) pairs. ✓ CI above 0, ✗ below.

| scenario       | reference − idle            | idle − all-shutdown            | reference − all-shutdown    | reference − all-max            | reference − random          | reference − never-jump-start   | reference-repairing − reference |
| -------------- | --------------------------- | ------------------------------ | --------------------------- | ------------------------------ | --------------------------- | ------------------------------ | ------------------------------- |
| T0-constrained | 0.019 [0.006, 0.033] n=12 ✓ | 0.322 [0.309, 0.334] n=12 ✓    | 0.341 [0.323, 0.359] n=12 ✓ | -0.075 [-0.116, -0.034] n=12 ✗ | 0.133 [0.115, 0.154] n=12 ✓ | 0.000 [0.000, 0.000] n=12      | -0.004 [-0.014, 0.007] n=12     |
| T1             | 0.083 [0.038, 0.131] n=12 ✓ | 0.007 [-0.048, 0.071] n=12     | 0.090 [0.014, 0.170] n=12 ✓ | 0.045 [-0.030, 0.116] n=12     | 0.091 [-0.020, 0.185] n=12  | -0.000 [-0.020, 0.015] n=12    | -0.030 [-0.078, 0.021] n=12     |
| T1-MK2         | 0.055 [-0.043, 0.161] n=12  | -0.043 [-0.077, -0.006] n=12 ✗ | 0.012 [-0.090, 0.123] n=12  | -0.069 [-0.159, 0.037] n=12    | 0.063 [-0.023, 0.156] n=12  | -0.021 [-0.035, -0.008] n=12 ✗ | -0.029 [-0.116, 0.057] n=12     |
| all            | 0.052 [0.016, 0.091] n=36 ✓ | 0.095 [0.034, 0.155] n=36 ✓    | 0.147 [0.082, 0.214] n=36 ✓ | -0.033 [-0.078, 0.013] n=36    | 0.096 [0.045, 0.141] n=36 ✓ | -0.007 [-0.016, 0.001] n=36    | -0.021 [-0.055, 0.010] n=36     |

By risk tercile (frames of each run within the tercile):

| scenario       | tercile | reference − idle               | reference − all-max            | idle − all-shutdown            |
| -------------- | ------- | ------------------------------ | ------------------------------ | ------------------------------ |
| T0-constrained | low     | -0.022 [-0.037, -0.007] n=10 ✗ | -0.166 [-0.209, -0.124] n=10 ✗ | 0.320 [0.302, 0.340] n=10 ✓    |
| T0-constrained | mid     | 0.021 [0.007, 0.036] n=12 ✓    | -0.064 [-0.107, -0.020] n=12 ✗ | 0.240 [0.224, 0.259] n=10 ✓    |
| T0-constrained | high    | – [–, –] n=0                   | – [–, –] n=0                   | – [–, –] n=0                   |
| T1             | low     | -0.039 [-0.064, -0.020] n=6 ✗  | -0.012 [-0.138, 0.110] n=6     | 0.225 [0.179, 0.293] n=6 ✓     |
| T1             | mid     | 0.089 [0.024, 0.160] n=12 ✓    | -0.007 [-0.097, 0.082] n=12    | -0.033 [-0.099, 0.041] n=12    |
| T1             | high    | 0.029 [-0.039, 0.102] n=12     | 0.038 [-0.047, 0.120] n=12     | 0.017 [-0.059, 0.095] n=12     |
| T1-MK2         | low     | -0.000 [-0.086, 0.109] n=7     | 0.118 [-0.066, 0.246] n=7      | 0.142 [0.025, 0.259] n=10 ✓    |
| T1-MK2         | mid     | 0.106 [-0.030, 0.251] n=12     | -0.061 [-0.186, 0.077] n=12    | -0.118 [-0.169, -0.063] n=12 ✗ |
| T1-MK2         | high    | -0.003 [-0.103, 0.108] n=12    | -0.119 [-0.194, -0.039] n=12 ✗ | -0.101 [-0.158, -0.040] n=12 ✗ |
| all            | low     | -0.020 [-0.045, 0.013] n=23    | -0.039 [-0.122, 0.045] n=23    | 0.229 [0.168, 0.280] n=26 ✓    |
| all            | mid     | 0.072 [0.022, 0.126] n=36 ✓    | -0.044 [-0.096, 0.015] n=36    | 0.017 [-0.044, 0.073] n=34     |
| all            | high    | 0.013 [-0.053, 0.080] n=24     | -0.041 [-0.105, 0.029] n=24    | -0.042 [-0.095, 0.015] n=24    |

### Held-out seeds

Paired Δ mean run K, 95% bootstrap CI over (scenario, seed) pairs. ✓ CI above 0, ✗ below.

| scenario       | reference − idle            | idle − all-shutdown           | reference − all-shutdown    | reference − all-max           | reference − random          | reference − never-jump-start | reference-repairing − reference |
| -------------- | --------------------------- | ----------------------------- | --------------------------- | ----------------------------- | --------------------------- | ---------------------------- | ------------------------------- |
| T0-constrained | 0.022 [0.006, 0.031] n=4 ✓  | 0.315 [0.291, 0.335] n=4 ✓    | 0.337 [0.299, 0.364] n=4 ✓  | -0.133 [-0.154, -0.099] n=4 ✗ | 0.110 [0.098, 0.118] n=4 ✓  | 0.000 [0.000, 0.000] n=4     | -0.004 [-0.014, 0.003] n=4      |
| T1             | 0.091 [0.032, 0.151] n=4 ✓  | 0.027 [-0.065, 0.117] n=4     | 0.118 [0.030, 0.248] n=4 ✓  | 0.047 [-0.074, 0.168] n=4     | 0.119 [0.008, 0.230] n=4 ✓  | 0.018 [0.000, 0.036] n=4     | -0.009 [-0.122, 0.129] n=4      |
| T1-MK2         | 0.108 [-0.087, 0.303] n=4   | -0.059 [-0.100, -0.017] n=4 ✗ | 0.049 [-0.187, 0.286] n=4   | 0.015 [-0.226, 0.201] n=4     | 0.094 [-0.077, 0.266] n=4   | -0.024 [-0.056, 0.000] n=4   | 0.018 [-0.080, 0.167] n=4       |
| all            | 0.074 [0.004, 0.146] n=12 ✓ | 0.094 [-0.002, 0.193] n=12    | 0.168 [0.047, 0.271] n=12 ✓ | -0.024 [-0.113, 0.066] n=12   | 0.108 [0.035, 0.173] n=12 ✓ | -0.002 [-0.019, 0.012] n=12  | 0.002 [-0.052, 0.065] n=12      |

By risk tercile (frames of each run within the tercile):

| scenario       | tercile | reference − idle              | reference − all-max           | idle − all-shutdown           |
| -------------- | ------- | ----------------------------- | ----------------------------- | ----------------------------- |
| T0-constrained | low     | -0.015 [-0.037, 0.019] n=3    | -0.202 [-0.264, -0.145] n=3 ✗ | 0.312 [0.289, 0.331] n=3 ✓    |
| T0-constrained | mid     | 0.024 [0.010, 0.034] n=4 ✓    | -0.125 [-0.150, -0.085] n=4 ✗ | 0.229 [0.209, 0.250] n=4 ✓    |
| T0-constrained | high    | – [–, –] n=0                  | – [–, –] n=0                  | – [–, –] n=0                  |
| T1             | low     | -0.048 [-0.093, -0.004] n=2 ✗ | 0.002 [-0.112, 0.115] n=2     | 0.286 [0.185, 0.388] n=2 ✓    |
| T1             | mid     | 0.139 [0.051, 0.227] n=4 ✓    | 0.010 [-0.126, 0.145] n=4     | -0.032 [-0.105, 0.039] n=4    |
| T1             | high    | 0.031 [-0.091, 0.167] n=4     | 0.072 [-0.054, 0.198] n=4     | -0.002 [-0.062, 0.097] n=4    |
| T1-MK2         | low     | -0.073 [-0.170, -0.022] n=3 ✗ | 0.041 [-0.396, 0.290] n=3     | 0.139 [-0.088, 0.354] n=4     |
| T1-MK2         | mid     | 0.046 [-0.142, 0.244] n=4     | -0.016 [-0.281, 0.222] n=4    | -0.135 [-0.220, 0.004] n=4    |
| T1-MK2         | high    | 0.104 [-0.101, 0.300] n=4     | -0.055 [-0.191, 0.043] n=4    | -0.170 [-0.205, -0.144] n=4 ✗ |
| all            | low     | -0.045 [-0.088, -0.012] n=8 ✗ | -0.060 [-0.220, 0.106] n=8    | 0.229 [0.098, 0.333] n=9 ✓    |
| all            | mid     | 0.070 [-0.011, 0.152] n=12    | -0.044 [-0.140, 0.051] n=12   | 0.021 [-0.079, 0.114] n=12    |
| all            | high    | 0.067 [-0.049, 0.194] n=8     | 0.008 [-0.088, 0.109] n=8     | -0.086 [-0.151, -0.008] n=8 ✗ |

### Held-out scenario (fit on the other scenarios, all seeds)

| held out       | weights                                                                  | reference − idle            | idle − all-shutdown            | reference − all-max (high risk) |
| -------------- | ------------------------------------------------------------------------ | --------------------------- | ------------------------------ | ------------------------------- |
| T0-constrained | `{"k":0.5,"n0":0.5,"beta":0,"lambda0":0.3,"lambda1":0.4,"epsilon":0.2}`  | 0.011 [-0.001, 0.022] n=12  | 0.330 [0.314, 0.346] n=12 ✓    | – [–, –] n=0                    |
| T1             | `{"k":0.5,"n0":0.5,"beta":0,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.083 [0.038, 0.131] n=12 ✓ | 0.007 [-0.048, 0.071] n=12     | 0.038 [-0.047, 0.120] n=12      |
| T1-MK2         | `{"k":1,"n0":0.25,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.2}`   | 0.047 [-0.057, 0.160] n=12  | -0.066 [-0.098, -0.032] n=12 ✗ | -0.122 [-0.194, -0.042] n=12 ✗  |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the target dies by t+h, minus own integrity lost by t+h).

| set            | h   | mean r | low    | mid    | high   |
| -------------- | --- | ------ | ------ | ------ | ------ |
| fit seeds      | 60  | -0.190 | -0.459 | 0.000  | -0.109 |
| fit seeds      | 120 | -0.165 | -0.307 | -0.033 | -0.156 |
| held-out seeds | 60  | -0.086 | -0.260 | 0.064  | -0.063 |
| held-out seeds | 120 | -0.011 | -0.056 | 0.038  | -0.015 |
