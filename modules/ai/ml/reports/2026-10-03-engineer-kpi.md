# Engineer KPI, phase 1 validation, 2026-10-03

KPI definition: `src/scoring/engineer-kpi.ts`. Validator: `npm run score:engineer`. Runs: 252 headless
(T1, T1-MK2, T0-constrained × seeds 1–12 × 7 engineer policies; helms and weapons reference), archived in
`training-archive/2026-10-03/engineer-kpi/` (recorded at `d3cbe0e4`; same runs scored here). Jev spend $0.

## Design

- Demand comes from the other seats' requests: the smart pilot's commanded rotation and maneuvering, a
  TARGET mode, afterburner presses, weapons' fire decisions (1) or a held lock (0.5), and tube commands.
  It never comes from what the ship achieved, so a shut-down ship still registers what it was asked for.
- Supply is `min(1, power / NORMAL) × hacked`: no reward for power above NORMAL while energy draw is
  flat in power. Lift the cap and refit once #2305 lands.
- Integrity looks 60 s ahead (mean D over [t, t+60]), so overheat damage counts against the frames that
  caused it.
- Paired runs are compared over their common time: from the start to the earlier of the two ends.
- Risk is a logistic fitted on the fit seeds to P(own integrity loss ≥ 0.02 in the next 30 s).

## Result

| ordering                                         | pooled                    | T0-constrained                | T1                     | T1-MK2                 |
| ------------------------------------------------ | ------------------------- | ----------------------------- | ---------------------- | ---------------------- |
| reference > idle                                 | 0.018 [−0.024, 0.061]     | **−0.098 [−0.147, −0.043] ✗** | 0.122 [0.079, 0.162] ✓ | 0.031 [−0.028, 0.093]  |
| idle > all-shutdown                              | 0.531 [0.429, 0.631] ✓    | 0.906 ✓                       | 0.434 ✓                | 0.254 ✓                |
| reference > all-max (high risk)                  | 0.119 [0.038, 0.214] ✓    | n=3 seeds only                | 0.300 ✓                | −0.018 [−0.115, 0.090] |
| K predicts 120 s outcome (mean within-tercile r) | fit 0.19, held-out 0.25 ✓ |                               |                        |                        |

INFERENCE on the T0-constrained failure: that scenario starts with 10–30% energy. The reference
engineer drops the thrusters to LOW below 75% store, which halves supply to a helm that is requesting
thrust. Idle leaves the thrusters at NORMAL. Kills are 9/12 against 8/12, so the outcomes barely differ.
The score charges throttling as unmet demand, and the weights set λ to 0, so the reserve never pays it
back.

## Risk curve and weights (fitted, provisional)

- Risk: `bias −4.164`; coefficients threats 2.179, proximity −0.129, blastRate 3.142, damage −2.694,
  unscanned 1.336. The negative damage coefficient is not physical (INFERENCE: collinearity with blasts, or
  damaged ships in calm tails).
- Frame share per risk tercile (cuts 0.108 / 0.334): T0-constrained 0.26/0.69/0.05, T1 0.26/0.27/0.47,
  T1-MK2 0.44/0.15/0.42. T0-constrained barely reaches the high tercile.
- Weights: `{k 0.5, n0 0.25, β 0, λ0 0, λ1 0, ε 0.01}`. λ = 0 means the reserve term R is unused.
  Leave-one-scenario-out fits keep k = 0.5 and ε = 0.01 but select λ0 = 0.3, λ1 = 0.4 and β of 0 or 3,
  so the reserve weights are unstable. The held-out T1-MK2 fit separates nothing.

## Recording extensions

- `defect` events `{system, cause}` (cause hit/overheat/warp) from `DamageManager.onDefect`.
- `energy` events `{demand, granted}` per frame from `EnergyManager.lastFlow` (`ShipManagerPc` ships only).
- `energyStarved` and `thruster.active` are gameFields; `radar.supply` is not (its effect shows through `energyStarved`).

## Full validator output

runs 252; scenarios T0-constrained, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): `{"bias":-4.164,"coef":[2.179,-0.129,3.142,-2.694,1.336]}` over threats, proximity, blastRate, damage, unscanned

weights: `{"k":0.5,"n0":0.25,"beta":0,"lambda0":0,"lambda1":0,"epsilon":0.01}`; weakest standardised fit-seed contrast -1.077; predictive constraint met

risk tercile cuts: 0.108, 0.334. Frame share per tercile:

| scenario       | low  | mid  | high |
| -------------- | ---- | ---- | ---- |
| T0-constrained | 0.26 | 0.69 | 0.05 |
| T1             | 0.26 | 0.27 | 0.47 |
| T1-MK2         | 0.44 | 0.15 | 0.42 |

### All seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle               | idle − all-shutdown         | reference − all-max         | reference − random          | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ------------------------------ | --------------------------- | --------------------------- | --------------------------- | ---------------------------- | ------------------------------- | ------------------------------- |
| T0-constrained | -0.098 [-0.147, -0.043] n=12 ✗ | 0.906 [0.899, 0.912] n=12 ✓ | 0.074 [-0.055, 0.219] n=12  | 0.350 [0.275, 0.438] n=12 ✓ | 0.000 [0.000, 0.000] n=12    | -0.016 [-0.029, -0.005] n=12 ✗  | -0.055 [-0.125, 0.036] n=3      |
| T1             | 0.122 [0.079, 0.162] n=12 ✓    | 0.434 [0.330, 0.540] n=12 ✓ | 0.356 [0.279, 0.439] n=12 ✓ | 0.360 [0.280, 0.439] n=12 ✓ | 0.041 [0.016, 0.071] n=12 ✓  | -0.009 [-0.044, 0.022] n=12     | 0.300 [0.199, 0.415] n=12 ✓     |
| T1-MK2         | 0.031 [-0.028, 0.093] n=12     | 0.254 [0.220, 0.294] n=12 ✓ | 0.093 [0.031, 0.155] n=12 ✓ | 0.141 [0.061, 0.229] n=12 ✓ | 0.014 [0.005, 0.023] n=12 ✓  | 0.046 [-0.007, 0.101] n=12      | -0.018 [-0.115, 0.090] n=12     |
| all            | 0.018 [-0.024, 0.061] n=36     | 0.531 [0.429, 0.631] n=36 ✓ | 0.174 [0.105, 0.248] n=36 ✓ | 0.284 [0.226, 0.342] n=36 ✓ | 0.018 [0.008, 0.031] n=36 ✓  | 0.007 [-0.016, 0.031] n=36      | 0.119 [0.038, 0.214] n=27 ✓     |

reference − idle by risk tercile:

| scenario       | low                        | mid                            | high                          |
| -------------- | -------------------------- | ------------------------------ | ----------------------------- |
| T0-constrained | –                          | -0.097 [-0.148, -0.041] n=12 ✗ | -0.167 [-0.201, -0.148] n=3 ✗ |
| T1             | 0.052 [-0.046, 0.140] n=7  | 0.162 [0.053, 0.278] n=12 ✓    | 0.044 [-0.029, 0.118] n=12    |
| T1-MK2         | 0.010 [-0.017, 0.039] n=7  | 0.024 [-0.078, 0.115] n=12     | -0.050 [-0.134, 0.047] n=12   |
| all            | 0.031 [-0.017, 0.079] n=14 | 0.030 [-0.032, 0.097] n=36     | -0.021 [-0.076, 0.042] n=27   |

### Held-out seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario       | reference − idle              | idle − all-shutdown         | reference − all-max         | reference − random          | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| -------------- | ----------------------------- | --------------------------- | --------------------------- | --------------------------- | ---------------------------- | ------------------------------- | ------------------------------- |
| T0-constrained | -0.116 [-0.173, -0.010] n=4 ✗ | 0.902 [0.885, 0.916] n=4 ✓  | -0.058 [-0.144, 0.089] n=4  | 0.317 [0.170, 0.475] n=4 ✓  | 0.000 [0.000, 0.000] n=4     | -0.023 [-0.047, 0.000] n=4      | –                               |
| T1             | 0.090 [0.050, 0.131] n=4 ✓    | 0.427 [0.266, 0.583] n=4 ✓  | 0.366 [0.247, 0.478] n=4 ✓  | 0.348 [0.199, 0.462] n=4 ✓  | 0.051 [0.000, 0.104] n=4     | -0.019 [-0.110, 0.054] n=4      | 0.307 [0.153, 0.524] n=4 ✓      |
| T1-MK2         | 0.119 [0.034, 0.191] n=4 ✓    | 0.219 [0.194, 0.249] n=4 ✓  | 0.177 [0.056, 0.289] n=4 ✓  | 0.216 [0.077, 0.372] n=4 ✓  | 0.015 [0.000, 0.035] n=4     | 0.006 [-0.076, 0.132] n=4       | 0.186 [0.076, 0.252] n=4 ✓      |
| all            | 0.031 [-0.047, 0.105] n=12    | 0.516 [0.345, 0.685] n=12 ✓ | 0.162 [0.042, 0.283] n=12 ✓ | 0.293 [0.203, 0.379] n=12 ✓ | 0.022 [0.002, 0.049] n=12 ✓  | -0.012 [-0.054, 0.039] n=12     | 0.247 [0.149, 0.377] n=8 ✓      |

reference − idle by risk tercile:

| scenario       | low                        | mid                           | high                       |
| -------------- | -------------------------- | ----------------------------- | -------------------------- |
| T0-constrained | –                          | -0.117 [-0.174, -0.011] n=4 ✗ | –                          |
| T1             | -0.087 [-0.188, 0.015] n=2 | 0.281 [0.018, 0.536] n=4 ✓    | -0.041 [-0.142, 0.018] n=4 |
| T1-MK2         | 0.023 [-0.013, 0.059] n=2  | 0.025 [-0.218, 0.181] n=4     | 0.070 [-0.082, 0.208] n=4  |
| all            | -0.032 [-0.137, 0.041] n=4 | 0.063 [-0.078, 0.221] n=12    | 0.015 [-0.071, 0.106] n=8  |

### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)

| held out       | weights                                                                   | reference − idle            | idle − all-shutdown         | reference − all-max (high risk) |
| -------------- | ------------------------------------------------------------------------- | --------------------------- | --------------------------- | ------------------------------- |
| T0-constrained | `{"k":0.5,"n0":1,"beta":0,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`    | 0.003 [-0.019, 0.023] n=12  | 0.453 [0.418, 0.488] n=12 ✓ | 0.138 [0.047, 0.240] n=12 ✓     |
| T1             | `{"k":0.5,"n0":0.25,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.096 [0.055, 0.135] n=12 ✓ | 0.161 [0.068, 0.246] n=12 ✓ | 0.245 [0.158, 0.341] n=12 ✓     |
| T1-MK2         | `{"k":0.5,"n0":0.25,"beta":3,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | -0.001 [-0.055, 0.063] n=12 | -0.023 [-0.056, 0.012] n=12 | -0.029 [-0.103, 0.058] n=12     |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h).

| set            | h   | mean r | low   | mid   | high   |
| -------------- | --- | ------ | ----- | ----- | ------ |
| fit seeds      | 60  | 0.114  | 0.194 | 0.240 | -0.093 |
| fit seeds      | 120 | 0.190  | 0.281 | 0.291 | -0.002 |
| held-out seeds | 60  | 0.171  | 0.236 | 0.284 | -0.009 |
| held-out seeds | 120 | 0.245  | 0.266 | 0.345 | 0.124  |
