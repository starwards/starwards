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

## Round 6: repairs and survival gating

- **No demand:** K = D·R when Σa < 0.1. The rule is kept but cannot trigger while the reactor is
  always demanded.
- **E1 rungs** are gated on survival (seconds until own integrity < 0.5) and on damage per second of
  exposure.
- **The repairs table** compares reference-repairing with the reference engineer on seeds where the
  reference run took a defect.

Repairs do clear damage. EVIDENCE: demanded backlog Δ (Σa·sev) is −0.70 [−1.43, −0.05] on T1 and
−0.42 [−0.57, −0.27] on E1-MK2. The KPI does not show it: KPI Δ −0.011 on T1 and −0.009 on E1-MK2,
both with CIs spanning 0.

**Tried and reverted: an absolute-backlog D**, `D = exp(−Σ(a+ε)·sev / 2)`, so that clearing a defect
counts the same whatever is demanded. It still did not separate repairing from reference (T1 +0.054,
CI spans 0). It also reversed idle > all-shutdown: −0.163 ✗ on T1 and pooled −0.067 ✗, where outcomes
say idle is better. An all-shutdown ship never fires, never overheats and takes fewer defects, so an
absolute backlog rewards not fighting. D stays the demand-weighted share.

**E1 survival gating disagrees with the KPI.** All-shutdown "survives" longer than idle, and idle longer
than reference on E1-MK2, because a ship that does not fight is shot less. The KPI ranks reference >
idle > all-shutdown there (all ✓), against that gate.

## `engineer_kpi30` in the full dataset

`training-archive/datasets/snapshots-2026-10-03-ekpi.csv` is built from every day in the archive
(`npm run score:dataset`, 74 min). The table gives label stats per scenario: rows, rows with a label
(the rest are censored), mean, sd, p10 and p90.

| scenario        | rows  | labelled | mean  | sd    | p10   | p90   |
| --------------- | ----- | -------- | ----- | ----- | ----- | ----- |
| T1              | 68743 | 59533    | 0.394 | 0.291 | 0.059 | 0.837 |
| T0              | 56783 | 41878    | 0.958 | 0.036 | 0.918 | 1.000 |
| T1-MK2          | 39909 | 34779    | 0.279 | 0.225 | 0.049 | 0.628 |
| W-multi         | 33966 | 29502    | 0.609 | 0.349 | 0.083 | 0.998 |
| T1-lite         | 32883 | 22705    | 0.592 | 0.315 | 0.082 | 1.000 |
| E1-predator     | 25284 | 22680    | 0.120 | 0.098 | 0.051 | 0.255 |
| W-outranged     | 25284 | 22680    | 0.985 | 0.033 | 0.921 | 1.000 |
| E1-MK2          | 24368 | 21768    | 0.194 | 0.185 | 0.048 | 0.467 |
| T0-constrained  | 20142 | 16877    | 0.617 | 0.336 | 0.212 | 1.000 |
| T0-wide         | 19357 | 15368    | 0.985 | 0.030 | 0.922 | 1.000 |
| helms-tag       | 14107 | 9137     | 0.984 | 0.042 | 0.927 | 1.000 |
| weapons-range   | 8597  | 3984     | 0.951 | 0.029 | 0.922 | 1.000 |
| helms-hold      | 6275  | 3030     | 0.993 | 0.021 | 0.951 | 1.000 |
| signals-scan    | 5824  | 3840     | 0.998 | 0.002 | 0.994 | 1.000 |
| helms-intercept | 4566  | 1883     | 0.988 | 0.044 | 1.000 | 1.000 |
| weapons-acquire | 3494  | 1170     | 0.961 | 0.027 | 0.928 | 1.000 |
| T1-noweave      | 1410  | 1163     | 0.471 | 0.323 | 0.055 | 0.875 |

The label carries variance only in the fight rungs: T1, T1-MK2, T1-lite, T0-constrained, W-multi and
the E1 rungs. The benchmark and T0 rungs sit at 0.95–1.0 and teach little.

## Design decisions

Decided by the owner (2026-10-03):

1. **Repairs are not credited separately.** Repairs clear about 0.5–0.7 of a system's backlog out of a
   demand sum of about 14, so D moves about 0.04 and the KPI Δ of reference-repairing over reference is
   inside noise (T1 −0.011, E1-MK2 −0.009). In 5-minute fights that small effect is accepted as real:
   repairs matter little there. No repair term, no renormalised D.
2. **E1 rungs gate on damage per exposure second only.** Survival time rewards not fighting (all-shutdown
   outlasts idle, idle outlasts reference on E1-MK2), so it does not gate.
3. **idle > all-shutdown is required only where outcomes separate them**: T0-constrained and pooled, where
   it holds. On E1 and T1-MK2, where nothing is fought, all-shutdown banking a full store and outscoring
   idle stays accepted (no demand met, K = D·R).

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

Per pair of runs on one seed, positive = first policy better: KPI Δ; kill Δ (1/0); seconds saved to the end of the run (kill or timeout); damage-rate Δ (own integrity lost per second a hostile was within twice its gun range, lower better). 95% bootstrap CIs. Outcomes separate the pair when the kill or seconds-saved CI excludes 0 (E1 rungs, which almost never end in a kill: survival — seconds until own integrity < 0.5 — or damage rate); elsewhere the KPI ordering is informational. Agreement: seeds where the KPI Δ has the sign of the kill Δ, or of seconds saved when kills tie.

| scenario       | contrast                        | KPI Δ                          | kill Δ                      | seconds saved                     | survival Δ (s)                       | damage-rate Δ                  | gated on              | outcome separates   | agreement |
| -------------- | ------------------------------- | ------------------------------ | --------------------------- | --------------------------------- | ------------------------------------ | ------------------------------ | --------------------- | ------------------- | --------- |
| E1-MK2         | reference − idle                | 0.127 [0.083, 0.175] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -69.808 [-129.417, -14.392] n=12 ✗   | -0.001 [-0.001, -0.000] n=12 ✗ | survival, damage rate | idle better         | 4/12      |
| E1-MK2         | idle − all-shutdown             | -0.174 [-0.200, -0.146] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -123.167 [-184.750, -55.167] n=12 ✗  | -0.000 [-0.001, 0.001] n=12    | survival, damage rate | all-shutdown better | 10/12     |
| E1-MK2         | reference − all-max             | 0.121 [0.069, 0.179] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -113.475 [-168.583, -58.392] n=12 ✗  | -0.001 [-0.001, -0.000] n=12 ✗ | survival, damage rate | all-max better      | 2/12      |
| E1-MK2         | reference − random              | 0.081 [0.053, 0.120] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 37.896 [0.000, 93.150] n=12       | -111.929 [-169.288, -54.325] n=12 ✗  | -0.000 [-0.001, 0.000] n=12    | survival, damage rate | random better       | 3/12      |
| E1-MK2         | reference − never-jump-start    | 0.028 [0.018, 0.037] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -19.000 [-57.583, 0.583] n=12        | -0.000 [-0.000, 0.000] n=12    | survival, damage rate | no                  | 3/10      |
| E1-MK2         | reference-repairing − reference | -0.009 [-0.038, 0.020] n=12    | -0.167 [-0.417, 0.000] n=12 | -37.896 [-93.150, 0.000] n=12     | 24.333 [-0.917, 64.583] n=12         | 0.000 [-0.000, 0.000] n=12     | survival, damage rate | no                  | 6/12      |
| E1-predator    | reference − idle                | 0.043 [0.029, 0.057] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -30.083 [-77.417, -4.250] n=12 ✗     | 0.002 [0.001, 0.002] n=12 ✓    | survival, damage rate | reference better    | 1/12      |
| E1-predator    | idle − all-shutdown             | -0.109 [-0.132, -0.088] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -177.083 [-246.333, -106.417] n=12 ✗ | -0.001 [-0.002, -0.000] n=12 ✗ | survival, damage rate | all-shutdown better | 10/12     |
| E1-predator    | reference − all-max             | 0.044 [0.031, 0.057] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -74.333 [-143.833, -6.500] n=12 ✗    | 0.001 [0.000, 0.002] n=12 ✓    | survival, damage rate | reference better    | 4/12      |
| E1-predator    | reference − random              | 0.028 [0.009, 0.046] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -38.250 [-84.917, -10.167] n=12 ✗    | 0.001 [0.000, 0.002] n=12 ✓    | survival, damage rate | reference better    | 4/12      |
| E1-predator    | reference − never-jump-start    | 0.027 [0.020, 0.035] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.000 [0.000, 0.000] n=12            | 0.001 [0.001, 0.002] n=12 ✓    | survival, damage rate | reference better    | 11/12     |
| E1-predator    | reference-repairing − reference | -0.017 [-0.028, -0.007] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -0.250 [-2.583, 2.500] n=12          | -0.000 [-0.001, 0.000] n=12    | survival, damage rate | no                  | 3/12      |
| T0-constrained | reference − idle                | -0.018 [-0.051, 0.014] n=12    | 0.083 [0.000, 0.250] n=12   | 1.692 [-27.299, 44.625] n=12      | 0.000 [0.000, 0.000] n=12            | 0.000 [0.000, 0.000] n=12      | kill, seconds saved   | no                  | 7/9       |
| T0-constrained | idle − all-shutdown             | 0.630 [0.603, 0.654] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | 155.442 [93.246, 217.444] n=12 ✓  | 0.000 [0.000, 0.000] n=12            | -0.000 [-0.000, 0.000] n=12    | kill, seconds saved   | idle better         | 8/8       |
| T0-constrained | reference − all-max             | 0.190 [0.054, 0.342] n=12 ✓    | 0.333 [0.000, 0.667] n=12   | 44.356 [-51.153, 136.067] n=12    | 0.000 [0.000, 0.000] n=12            | 0.000 [0.000, 0.000] n=12      | kill, seconds saved   | no                  | 7/10      |
| T0-constrained | reference − random              | 0.403 [0.316, 0.502] n=12 ✓    | 0.750 [0.500, 1.000] n=12 ✓ | 157.133 [102.472, 207.304] n=12 ✓ | 0.000 [0.000, 0.000] n=12            | 0.000 [0.000, 0.000] n=12      | kill, seconds saved   | reference better    | 9/9       |
| T0-constrained | reference − never-jump-start    | 0.000 [0.000, 0.000] n=12      | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | 0.000 [0.000, 0.000] n=12            | 0.000 [0.000, 0.000] n=12      | kill, seconds saved   | no                  | –         |
| T0-constrained | reference-repairing − reference | -0.013 [-0.026, -0.003] n=12 ✗ | 0.000 [-0.250, 0.250] n=12  | -1.031 [-51.907, 51.022] n=12     | 0.000 [0.000, 0.000] n=12            | 0.000 [0.000, 0.000] n=12      | kill, seconds saved   | no                  | 3/5       |
| T1             | reference − idle                | 0.177 [0.135, 0.217] n=12 ✓    | 0.667 [0.417, 0.917] n=12 ✓ | 65.918 [29.313, 105.154] n=12 ✓   | -29.222 [-69.726, 4.479] n=12        | 0.000 [-0.001, 0.001] n=12     | kill, seconds saved   | reference better    | 8/9       |
| T1             | idle − all-shutdown             | 0.039 [-0.059, 0.135] n=12     | 0.083 [0.000, 0.250] n=12   | 19.119 [0.000, 57.358] n=12       | -34.131 [-95.917, 15.369] n=12       | 0.000 [-0.001, 0.001] n=12     | kill, seconds saved   | no                  | 1/1       |
| T1             | reference − all-max             | 0.420 [0.341, 0.506] n=12 ✓    | 0.750 [0.500, 0.917] n=12 ✓ | 85.038 [43.746, 129.117] n=12 ✓   | -60.353 [-110.604, -15.526] n=12 ✗   | 0.000 [-0.000, 0.001] n=12     | kill, seconds saved   | reference better    | 9/9       |
| T1             | reference − random              | 0.370 [0.285, 0.459] n=12 ✓    | 0.667 [0.333, 0.917] n=12 ✓ | 62.917 [-13.017, 124.233] n=12    | -17.764 [-54.597, 4.653] n=12        | 0.000 [-0.001, 0.001] n=12     | kill, seconds saved   | reference better    | 9/10      |
| T1             | reference − never-jump-start    | 0.052 [0.019, 0.087] n=12 ✓    | 0.167 [0.000, 0.417] n=12   | 9.775 [0.000, 28.696] n=12        | 0.000 [0.000, 0.000] n=12            | 0.000 [-0.000, 0.000] n=12     | kill, seconds saved   | no                  | 2/2       |
| T1             | reference-repairing − reference | -0.011 [-0.045, 0.020] n=12    | -0.167 [-0.417, 0.000] n=12 | -14.240 [-59.269, 29.753] n=12    | -0.476 [-9.536, 11.083] n=12         | -0.000 [-0.001, -0.000] n=12 ✗ | kill, seconds saved   | no                  | 6/9       |
| T1-MK2         | reference − idle                | 0.070 [0.014, 0.129] n=12 ✓    | 0.500 [0.250, 0.833] n=12 ✓ | 112.388 [50.975, 179.321] n=12 ✓  | 4.711 [-5.289, 14.167] n=12          | 0.001 [-0.000, 0.002] n=12     | kill, seconds saved   | reference better    | 4/6       |
| T1-MK2         | idle − all-shutdown             | -0.123 [-0.161, -0.082] n=12 ✗ | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -233.167 [-250.250, -214.833] n=12 ✗ | -0.002 [-0.003, -0.000] n=12 ✗ | kill, seconds saved   | no                  | –         |
| T1-MK2         | reference − all-max             | 0.144 [0.075, 0.210] n=12 ✓    | 0.417 [0.167, 0.667] n=12 ✓ | 89.958 [32.624, 156.049] n=12 ✓   | -51.926 [-111.829, 2.404] n=12       | -0.000 [-0.002, 0.001] n=12    | kill, seconds saved   | reference better    | 6/6       |
| T1-MK2         | reference − random              | 0.128 [0.047, 0.208] n=12 ✓    | 0.500 [0.250, 0.833] n=12 ✓ | 112.388 [50.975, 179.321] n=12 ✓  | -15.971 [-59.763, 14.442] n=12       | -0.001 [-0.003, 0.000] n=12    | kill, seconds saved   | reference better    | 4/6       |
| T1-MK2         | reference − never-jump-start    | 0.026 [0.009, 0.045] n=12 ✓    | 0.000 [0.000, 0.000] n=12   | 0.000 [0.000, 0.000] n=12         | -1.417 [-4.250, 0.000] n=12          | 0.000 [-0.000, 0.001] n=12     | kill, seconds saved   | no                  | –         |
| T1-MK2         | reference-repairing − reference | 0.048 [-0.009, 0.107] n=12     | 0.083 [-0.250, 0.417] n=12  | -28.865 [-91.679, 31.024] n=12    | -1.417 [-7.417, 3.167] n=12          | 0.000 [0.000, 0.001] n=12 ✓    | kill, seconds saved   | no                  | 6/9       |
| all            | reference − idle                | 0.080 [0.055, 0.105] n=60 ✓    | 0.283 [0.167, 0.400] n=60 ✓ | 43.579 [22.038, 66.340] n=60 ✓    | -24.881 [-44.535, -8.298] n=60 ✗     | 0.000 [0.000, 0.001] n=60 ✓    | kill, seconds saved   | reference better    | 21/26     |
| all            | idle − all-shutdown             | 0.053 [-0.023, 0.136] n=60     | 0.150 [0.067, 0.250] n=60 ✓ | 34.912 [15.535, 57.166] n=60 ✓    | -113.509 [-145.209, -81.862] n=60 ✗  | -0.001 [-0.001, -0.000] n=60 ✗ | kill, seconds saved   | idle better         | 9/9       |
| all            | reference − all-max             | 0.184 [0.136, 0.237] n=60 ✓    | 0.333 [0.200, 0.467] n=60 ✓ | 51.449 [24.071, 78.032] n=60 ✓    | -60.018 [-84.153, -35.274] n=60 ✗    | 0.000 [-0.000, 0.000] n=60     | kill, seconds saved   | reference better    | 24/27     |
| all            | reference − random              | 0.202 [0.151, 0.253] n=60 ✓    | 0.417 [0.283, 0.550] n=60 ✓ | 74.067 [48.189, 102.495] n=60 ✓   | -36.783 [-57.639, -17.934] n=60 ✗    | -0.000 [-0.000, 0.000] n=60    | kill, seconds saved   | reference better    | 24/27     |
| all            | reference − never-jump-start    | 0.027 [0.018, 0.036] n=60 ✓    | 0.033 [0.000, 0.083] n=60   | 1.955 [0.000, 5.739] n=60         | -4.083 [-12.083, 0.083] n=60         | 0.000 [0.000, 0.001] n=60 ✓    | kill, seconds saved   | no                  | 2/2       |
| all            | reference-repairing − reference | -0.001 [-0.015, 0.017] n=60    | -0.050 [-0.150, 0.050] n=60 | -16.406 [-37.553, 3.549] n=60     | 4.438 [-1.583, 13.867] n=60          | 0.000 [-0.000, 0.000] n=60     | kill, seconds saved   | no                  | 17/25     |

### Repairs: reference-repairing − reference where there is damage to fix

Seeds whose reference run took a defect; KPI Δ and demanded damage backlog Δ (Σa·sev, lower is better) over their common time.

| scenario       | seeds with damage | KPI Δ                          | backlog Δ                      |
| -------------- | ----------------- | ------------------------------ | ------------------------------ |
| E1-MK2         | 12                | -0.009 [-0.038, 0.020] n=12    | -0.420 [-0.574, -0.271] n=12 ✗ |
| E1-predator    | 12                | -0.017 [-0.028, -0.007] n=12 ✗ | 0.081 [-0.116, 0.285] n=12     |
| T0-constrained | 5                 | -0.032 [-0.051, -0.013] n=5 ✗  | 0.176 [-0.002, 0.386] n=5      |
| T1             | 12                | -0.011 [-0.045, 0.020] n=12    | -0.701 [-1.434, -0.050] n=12 ✗ |
| T1-MK2         | 12                | 0.048 [-0.009, 0.107] n=12     | 0.050 [-0.448, 0.588] n=12     |
| all            | 53                | -0.001 [-0.018, 0.018] n=53    | -0.208 [-0.438, 0.011] n=53    |

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
