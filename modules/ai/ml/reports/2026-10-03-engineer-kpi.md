# Engineer KPI validation, 2026-10-03

KPI definition: `src/scoring/engineer-kpi.ts`. Validator: `npm run score:engineer` (`--free-reserve` also fits
the reserve weights, for reference). Runs: 420 headless, all in `training-archive/2026-10-03/engineer-kpi-2306/`,
recorded at `fe2d23bd` on master `21ba4281` (#2306: energy draw ∝ (power / NORMAL)², per unit of output
at x = 2): 5 scenarios × seeds 1–12 × 7 engineer policies, with helms and weapons on reference. Jev spend $0.

- E1-MK2 and E1-predator are energy-bound: the GVTS reactor runs at 50% output and starts at 30–60%
  energy with one cell, against an attacking dragonfly-MK2 or predator.
- `training-archive/2026-10-03/engineer-kpi/` holds the same matrix recorded before #2306 (flat draw);
  its numbers are not comparable with these and are not used for engineer labels.

## Design

- **Demand** comes from the other seats' requests: smart-pilot commands, a TARGET mode, afterburner,
  weapons' fire decisions (1) or a held lock (0.5), and tube commands.
- **Supply** is `power / NORMAL × hacked`, uncapped. Each system **needs** `1 + a·(MAX/NORMAL − 1)`:
  NORMAL power when nothing is asked, MAX when fully asked; the reactor's standing demand needs NORMAL
  only (it is not a seat's request for overdrive). Service credits supply up to the need,
  `S = Σa·min(e, n) / Σa·n`. Overdrive costs (power / NORMAL)² in energy, so it pays through the reserve.
- **Integrity** looks 60 s ahead.
- **Pairing:** two runs of a seed are compared over their common time.
- **Risk** is a logistic with non-negative coefficients (damage pins at 0).
- **Reserve counts the reactor's energy only**; energy cells are a fallback, not reserve.
- **Reserve is set by design:** λ0 0.3 and λ1 0.4. The store to hold rises from 0.25 at no risk to 0.5 at
  full risk (N0 0.25, β 1), and holding it earns R = 0.9 (k = ln 10). Only ε is fitted (0.01).
- **Repairs are not credited separately.**
- **Gates:** kills and seconds saved; E1 rungs (almost no kills) on damage per exposure second only.
  idle > all-shutdown is required only where outcomes separate them.

## Energy held (store share, cells excluded)

EVIDENCE, mean over frames:

| scenario       | reference | idle | all-max | all-shutdown |
| -------------- | --------- | ---- | ------- | ------------ |
| E1-MK2         | 0.31      | 0.03 | 0.01    | 0.43         |
| E1-predator    | 0.12      | 0.02 | 0.01    | 0.43         |
| T0-constrained | 0.84      | 0.74 | 0.01    | 0.19         |
| T1             | 0.69      | 0.27 | 0.05    | 1.00         |
| T1-MK2         | 0.56      | 0.21 | 0.05    | 1.00         |

All-max now drains the store in every scenario (0.01–0.05), which it did not before #2306 (0.02–0.12).

## KPI against outcome

EVIDENCE, paired over seeds 1–12, 95% bootstrap CI:

| scenario       | contrast            | KPI Δ                     | gated outcome                           | agrees |
| -------------- | ------------------- | ------------------------- | --------------------------------------- | ------ |
| T0-constrained | reference − all-max | 0.336 [0.296, 0.368] ✓    | reference better (kills +0.917, 197 s)  | 11/11  |
| T0-constrained | idle − all-shutdown | 0.349 [0.325, 0.371] ✓    | idle better (kills +0.667)              | 8/8    |
| T1             | reference − all-max | 0.331 [0.288, 0.381] ✓    | reference better (kills +0.833, 86 s)   | 10/10  |
| T1             | reference − idle    | 0.156 [0.113, 0.203] ✓    | reference better (kills +0.750)         | 9/10   |
| T1             | idle − all-shutdown | −0.070 [−0.141, −0.001] ✗ | not separated                           | 1/1    |
| T1-MK2         | reference − all-max | 0.190 [0.130, 0.254] ✓    | reference better (kills +0.667, 143 s)  | 8/8    |
| T1-MK2         | reference − idle    | 0.069 [0.024, 0.113] ✓    | reference better (kills +0.667)         | 6/8    |
| T1-MK2         | idle − all-shutdown | −0.171 [−0.204, −0.139] ✗ | not separated (damage rate favours all-shutdown) | –  |
| E1-MK2         | reference − all-max | 0.178 [0.115, 0.243] ✓    | **all-max better** (damage rate −0.001) | 5/12   |
| E1-MK2         | idle − all-shutdown | −0.218 [−0.241, −0.192] ✗ | not separated                           | 9/12   |
| E1-predator    | reference − all-max | 0.015 [−0.016, 0.041]     | reference better (damage rate +0.002)   | 10/12  |
| E1-predator    | reference − idle    | 0.051 [0.036, 0.066] ✓    | reference better (damage rate +0.003)   | 12/12  |
| E1-predator    | idle − all-shutdown | −0.138 [−0.162, −0.116] ✗ | all-shutdown better (damage rate)       | 9/12   |
| all            | reference − all-max | 0.210 [0.171, 0.248] ✓    | reference better (kills +0.567, 101 s)  | 34/34  |
| all            | idle − all-shutdown | −0.050 [−0.102, 0.006]    | idle better (kills +0.150)              | 9/9    |

- **Reference > all-max** separates on outcomes in T0-constrained, T1, T1-MK2 and pooled, and the KPI
  agrees on every decided seed. Before #2306, T0-constrained did not separate on outcomes (kills +0.333,
  CI from 0). The KPI never ranks all-max above reference in any scenario.
- **E1-MK2:** damage rate favours all-max while reference kills more (+0.417 [0.167, 0.667]). The KPI
  sides with the kills. The same disagreement held before #2306.
- **E1-predator:** outcomes favour reference, but the KPI CI spans 0 (before #2306: 0.044 ✓). INFERENCE:
  the need curve credits all-max's overdrive while its reserve is already near zero for both.
- **idle vs all-shutdown on T1, T1-MK2 and E1:** outcomes never favour idle there; where they separate
  (E1-predator, T1-MK2 damage rate) they favour all-shutdown, as the KPI does. The reserve term is not
  changed. Where outcomes favour idle (T0-constrained, pooled kills) the KPI agrees or ties.
- **Reactor need:** with the reactor's standing demand needing MAX power, a NORMAL reactor earned half
  its service and an all-max reactor full. Needing NORMAL moves reference − all-max from 0.204 to 0.210
  pooled and idle − all-shutdown from −0.061 ✗ to −0.050 (CI spans 0).
- **Predictive validity** (within-risk-tercile r of K with the outcome, fit seeds, h 120 s) was −0.026,
  below the constraint. Split by rung: on E1 it was −0.22 (fit) and −0.24 (held-out), because the
  outcome's "own integrity lost" term rewards not fighting there, the flaw that took survival off the E1
  gate. The predictive check now uses the gate's outcome on E1 rungs (damage per exposure second):
  fit 0.001 (met, barely), held-out 0.191. The low-risk tercile stays negative on fit seeds (−0.246)
  and positive on held-out (0.083); INFERENCE: seed noise in calm frames, unresolved.
## Round 6 (before #2306): repairs and survival gating

- **No demand:** K = D·R when Σa < 0.1. The rule is kept but cannot trigger while the reactor is
  always demanded.
- **E1 rungs** are gated on damage per second of exposure; survival is reported only.
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

## Full validator output

runs 420; scenarios E1-MK2, E1-predator, T0-constrained, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): `{"bias":-5.277,"coef":[2.286,0.738,1.901,0,1.334]}` over threats, proximity, blastRate, damage, unscanned

weights: `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}`; weakest standardised fit-seed contrast -4.394; predictive constraint met

risk tercile cuts: 0.074, 0.356. Frame share per tercile:

| scenario | low | mid | high |
| --- | --- | --- | --- |
| E1-MK2 | 0.22 | 0.30 | 0.48 |
| E1-predator | 0.59 | 0.11 | 0.30 |
| T0-constrained | 0.38 | 0.62 | 0.00 |
| T1 | 0.16 | 0.42 | 0.42 |
| T1-MK2 | 0.30 | 0.31 | 0.40 |

### All seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario | reference − idle | idle − all-shutdown | reference − all-max | reference − random | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1-MK2 | 0.193 [0.147, 0.238] n=12 ✓ | -0.218 [-0.241, -0.192] n=12 ✗ | 0.178 [0.115, 0.243] n=12 ✓ | 0.114 [0.056, 0.171] n=12 ✓ | 0.015 [0.007, 0.025] n=12 ✓ | 0.005 [-0.015, 0.025] n=12 | 0.247 [0.187, 0.312] n=11 ✓ |
| E1-predator | 0.051 [0.036, 0.066] n=12 ✓ | -0.138 [-0.162, -0.116] n=12 ✗ | 0.015 [-0.016, 0.041] n=12 | 0.020 [0.001, 0.039] n=12 ✓ | 0.007 [0.001, 0.013] n=12 ✓ | 0.004 [-0.005, 0.012] n=12 | 0.106 [0.073, 0.137] n=12 ✓ |
| T0-constrained | 0.028 [0.009, 0.043] n=12 ✓ | 0.349 [0.325, 0.371] n=12 ✓ | 0.336 [0.296, 0.368] n=12 ✓ | 0.261 [0.218, 0.315] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | -0.002 [-0.006, -0.000] n=12 ✗ | – |
| T1 | 0.156 [0.113, 0.203] n=12 ✓ | -0.070 [-0.141, -0.001] n=12 ✗ | 0.331 [0.288, 0.381] n=12 ✓ | 0.295 [0.243, 0.349] n=12 ✓ | 0.028 [0.011, 0.048] n=12 ✓ | 0.022 [-0.008, 0.052] n=12 | 0.357 [0.296, 0.414] n=12 ✓ |
| T1-MK2 | 0.069 [0.024, 0.113] n=12 ✓ | -0.171 [-0.204, -0.139] n=12 ✗ | 0.190 [0.130, 0.254] n=12 ✓ | 0.121 [0.040, 0.189] n=12 ✓ | 0.019 [0.005, 0.034] n=12 ✓ | 0.044 [-0.007, 0.096] n=12 | 0.213 [0.136, 0.296] n=12 ✓ |
| all | 0.099 [0.078, 0.123] n=60 ✓ | -0.050 [-0.102, 0.006] n=60 | 0.210 [0.171, 0.248] n=60 ✓ | 0.162 [0.126, 0.197] n=60 ✓ | 0.014 [0.008, 0.020] n=60 ✓ | 0.015 [0.001, 0.029] n=60 ✓ | 0.230 [0.192, 0.269] n=47 ✓ |

reference − idle by risk tercile:

| scenario | low | mid | high |
| --- | --- | --- | --- |
| E1-MK2 | -0.023 [-0.023, -0.023] n=1 ✗ | 0.030 [-0.016, 0.077] n=12 | 0.247 [0.194, 0.298] n=12 ✓ |
| E1-predator | -0.012 [-0.019, -0.003] n=12 ✗ | -0.030 [-0.055, -0.001] n=12 ✗ | 0.087 [0.056, 0.120] n=12 ✓ |
| T0-constrained | – | 0.028 [0.009, 0.043] n=12 ✓ | – |
| T1 | 0.145 [0.043, 0.247] n=5 ✓ | 0.151 [0.101, 0.197] n=12 ✓ | 0.101 [0.039, 0.168] n=12 ✓ |
| T1-MK2 | 0.025 [-0.003, 0.069] n=4 | 0.061 [0.023, 0.103] n=12 ✓ | 0.034 [-0.019, 0.092] n=12 |
| all | 0.030 [-0.003, 0.072] n=22 | 0.048 [0.026, 0.071] n=60 ✓ | 0.117 [0.083, 0.152] n=48 ✓ |

### Held-out seeds

Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario | reference − idle | idle − all-shutdown | reference − all-max | reference − random | reference − never-jump-start | reference-repairing − reference | reference − all-max (high risk) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1-MK2 | 0.175 [0.095, 0.271] n=4 ✓ | -0.229 [-0.246, -0.219] n=4 ✗ | 0.160 [0.022, 0.325] n=4 ✓ | 0.090 [0.000, 0.179] n=4 ✓ | 0.015 [-0.000, 0.031] n=4 | -0.006 [-0.039, 0.019] n=4 | 0.226 [0.132, 0.363] n=4 ✓ |
| E1-predator | 0.054 [0.041, 0.065] n=4 ✓ | -0.118 [-0.149, -0.076] n=4 ✗ | 0.031 [0.017, 0.042] n=4 ✓ | 0.016 [0.012, 0.019] n=4 ✓ | 0.008 [-0.006, 0.016] n=4 | 0.006 [-0.006, 0.015] n=4 | 0.125 [0.095, 0.147] n=4 ✓ |
| T0-constrained | 0.035 [0.024, 0.055] n=4 ✓ | 0.332 [0.310, 0.353] n=4 ✓ | 0.341 [0.314, 0.367] n=4 ✓ | 0.230 [0.173, 0.312] n=4 ✓ | 0.000 [0.000, 0.000] n=4 | -0.002 [-0.004, 0.000] n=4 | – |
| T1 | 0.112 [0.039, 0.181] n=4 ✓ | -0.064 [-0.200, 0.028] n=4 | 0.360 [0.257, 0.463] n=4 ✓ | 0.302 [0.194, 0.407] n=4 ✓ | 0.021 [0.000, 0.041] n=4 | -0.008 [-0.062, 0.046] n=4 | 0.323 [0.173, 0.444] n=4 ✓ |
| T1-MK2 | 0.120 [0.086, 0.154] n=4 ✓ | -0.202 [-0.256, -0.144] n=4 ✗ | 0.219 [0.090, 0.349] n=4 ✓ | 0.131 [0.069, 0.222] n=4 ✓ | 0.015 [0.000, 0.040] n=4 | 0.029 [-0.048, 0.119] n=4 | 0.271 [0.113, 0.429] n=4 ✓ |
| all | 0.099 [0.070, 0.135] n=20 ✓ | -0.057 [-0.144, 0.042] n=20 | 0.222 [0.153, 0.294] n=20 ✓ | 0.154 [0.100, 0.213] n=20 ✓ | 0.012 [0.004, 0.020] n=20 ✓ | 0.004 [-0.018, 0.026] n=20 | 0.236 [0.168, 0.308] n=16 ✓ |

reference − idle by risk tercile:

| scenario | low | mid | high |
| --- | --- | --- | --- |
| E1-MK2 | -0.023 [-0.023, -0.023] n=1 ✗ | -0.012 [-0.081, 0.031] n=4 | 0.214 [0.149, 0.304] n=4 ✓ |
| E1-predator | -0.021 [-0.027, -0.011] n=4 ✗ | -0.040 [-0.068, -0.011] n=4 ✗ | 0.089 [0.062, 0.117] n=4 ✓ |
| T0-constrained | – | 0.035 [0.024, 0.055] n=4 ✓ | – |
| T1 | 0.033 [-0.026, 0.092] n=2 | 0.126 [0.058, 0.182] n=4 ✓ | 0.056 [-0.022, 0.140] n=4 |
| T1-MK2 | 0.004 [-0.004, 0.012] n=2 | 0.069 [0.019, 0.117] n=4 ✓ | 0.103 [0.011, 0.169] n=4 ✓ |
| all | -0.003 [-0.022, 0.023] n=9 | 0.036 [0.004, 0.070] n=20 ✓ | 0.116 [0.072, 0.161] n=16 ✓ |

### Energy held (store share without cells)

| scenario | reference | reference-repairing | idle | never-jump-start | all-max | random | all-shutdown |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1-MK2 | 0.31 | 0.26 | 0.03 | 0.29 | 0.01 | 0.06 | 0.43 |
| E1-predator | 0.12 | 0.11 | 0.02 | 0.10 | 0.01 | 0.05 | 0.43 |
| T0-constrained | 0.84 | 0.87 | 0.74 | 0.84 | 0.01 | 0.07 | 0.19 |
| T1 | 0.69 | 0.57 | 0.27 | 0.55 | 0.05 | 0.14 | 1.00 |
| T1-MK2 | 0.56 | 0.55 | 0.21 | 0.40 | 0.05 | 0.15 | 1.00 |

### KPI against outcome

Per pair of runs on one seed, positive = first policy better: KPI Δ; kill Δ (1/0); seconds saved to the end of the run (kill or timeout); damage-rate Δ (own integrity lost per second a hostile was within twice its gun range, lower better). 95% bootstrap CIs. Outcomes separate the pair when the kill or seconds-saved CI excludes 0 (E1 rungs, which almost never end in a kill: damage rate; survival — seconds until own integrity < 0.5 — is reported only); elsewhere the KPI ordering is informational. Agreement: seeds where the KPI Δ has the sign of the kill Δ, or of seconds saved when kills tie.

| scenario | contrast | KPI Δ | kill Δ | seconds saved | survival Δ (s) | damage-rate Δ | gated on | outcome separates | agreement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1-MK2 | reference − idle | 0.193 [0.147, 0.238] n=12 ✓ | 0.417 [0.167, 0.667] n=12 ✓ | 77.061 [20.283, 138.774] n=12 ✓ | -47.869 [-105.082, 3.499] n=12 | -0.001 [-0.001, 0.000] n=12 | damage rate | no | 3/11 |
| E1-MK2 | idle − all-shutdown | -0.218 [-0.241, -0.192] n=12 ✗ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -123.167 [-184.750, -55.167] n=12 ✗ | -0.000 [-0.001, 0.001] n=12 | damage rate | no | 9/12 |
| E1-MK2 | reference − all-max | 0.178 [0.115, 0.243] n=12 ✓ | 0.417 [0.167, 0.667] n=12 ✓ | 77.061 [20.283, 138.774] n=12 ✓ | -67.192 [-119.596, -20.438] n=12 ✗ | -0.001 [-0.001, -0.000] n=12 ✗ | damage rate | all-max better | 5/12 |
| E1-MK2 | reference − random | 0.114 [0.056, 0.171] n=12 ✓ | 0.417 [0.167, 0.667] n=12 ✓ | 77.061 [20.283, 138.774] n=12 ✓ | -79.099 [-145.431, -13.632] n=12 ✗ | -0.000 [-0.001, 0.001] n=12 | damage rate | no | 6/12 |
| E1-MK2 | reference − never-jump-start | 0.015 [0.007, 0.025] n=12 ✓ | 0.083 [0.000, 0.250] n=12 | 1.462 [0.000, 4.387] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 ✓ | damage rate | reference better | 4/6 |
| E1-MK2 | reference-repairing − reference | 0.005 [-0.015, 0.025] n=12 | -0.167 [-0.417, 0.000] n=12 | -32.507 [-75.503, -3.317] n=12 ✗ | 2.417 [-5.833, 14.000] n=12 | 0.000 [-0.000, 0.000] n=12 | damage rate | no | 4/10 |
| E1-predator | reference − idle | 0.051 [0.036, 0.066] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -30.333 [-77.500, -4.250] n=12 ✗ | 0.003 [0.002, 0.004] n=12 ✓ | damage rate | reference better | 12/12 |
| E1-predator | idle − all-shutdown | -0.138 [-0.162, -0.116] n=12 ✗ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -177.083 [-246.333, -106.417] n=12 ✗ | -0.001 [-0.002, -0.000] n=12 ✗ | damage rate | all-shutdown better | 9/12 |
| E1-predator | reference − all-max | 0.015 [-0.016, 0.041] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -77.583 [-147.917, -12.583] n=12 ✗ | 0.002 [0.002, 0.003] n=12 ✓ | damage rate | reference better | 10/12 |
| E1-predator | reference − random | 0.020 [0.001, 0.039] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -78.583 [-145.000, -18.500] n=12 ✗ | 0.002 [0.001, 0.002] n=12 ✓ | damage rate | reference better | 10/12 |
| E1-predator | reference − never-jump-start | 0.007 [0.001, 0.013] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | 0.001 [0.000, 0.002] n=12 ✓ | damage rate | reference better | 7/12 |
| E1-predator | reference-repairing − reference | 0.004 [-0.005, 0.012] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -0.000 [-3.250, 3.167] n=12 | -0.000 [-0.001, 0.000] n=12 | damage rate | no | 5/12 |
| T0-constrained | reference − idle | 0.028 [0.009, 0.043] n=12 ✓ | 0.250 [0.000, 0.500] n=12 | 41.794 [-15.425, 104.790] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | kill, seconds saved | no | 7/11 |
| T0-constrained | idle − all-shutdown | 0.349 [0.325, 0.371] n=12 ✓ | 0.667 [0.417, 0.917] n=12 ✓ | 155.442 [93.246, 217.444] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | -0.000 [-0.000, 0.000] n=12 | kill, seconds saved | idle better | 8/8 |
| T0-constrained | reference − all-max | 0.336 [0.296, 0.368] n=12 ✓ | 0.917 [0.750, 1.000] n=12 ✓ | 197.236 [155.453, 225.215] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | kill, seconds saved | reference better | 11/11 |
| T0-constrained | reference − random | 0.261 [0.218, 0.315] n=12 ✓ | 0.917 [0.750, 1.000] n=12 ✓ | 197.236 [155.453, 225.215] n=12 ✓ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | kill, seconds saved | reference better | 11/11 |
| T0-constrained | reference − never-jump-start | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | kill, seconds saved | no | – |
| T0-constrained | reference-repairing − reference | -0.002 [-0.006, -0.000] n=12 ✗ | -0.167 [-0.417, 0.000] n=12 | -36.883 [-90.308, 1.810] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | kill, seconds saved | no | 4/5 |
| T1 | reference − idle | 0.156 [0.113, 0.203] n=12 ✓ | 0.750 [0.500, 1.000] n=12 ✓ | 66.881 [36.232, 101.857] n=12 ✓ | -13.621 [-56.771, 31.444] n=12 | 0.000 [-0.000, 0.001] n=12 | kill, seconds saved | reference better | 9/10 |
| T1 | idle − all-shutdown | -0.070 [-0.141, -0.001] n=12 ✗ | 0.083 [0.000, 0.250] n=12 | 19.119 [0.000, 57.358] n=12 | -34.131 [-95.917, 15.369] n=12 | 0.000 [-0.001, 0.001] n=12 | kill, seconds saved | no | 1/1 |
| T1 | reference − all-max | 0.331 [0.288, 0.381] n=12 ✓ | 0.833 [0.583, 1.000] n=12 ✓ | 86.000 [49.174, 124.847] n=12 ✓ | -23.901 [-69.875, 33.000] n=12 | 0.001 [0.000, 0.001] n=12 ✓ | kill, seconds saved | reference better | 10/10 |
| T1 | reference − random | 0.295 [0.243, 0.349] n=12 ✓ | 0.833 [0.583, 1.000] n=12 ✓ | 86.000 [49.174, 124.847] n=12 ✓ | 1.239 [-44.503, 48.847] n=12 | 0.000 [0.000, 0.001] n=12 ✓ | kill, seconds saved | reference better | 10/10 |
| T1 | reference − never-jump-start | 0.028 [0.011, 0.048] n=12 ✓ | 0.333 [0.083, 0.583] n=12 ✓ | 28.000 [5.489, 53.862] n=12 ✓ | -1.833 [-5.500, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 ✓ | kill, seconds saved | reference better | 4/4 |
| T1 | reference-repairing − reference | 0.022 [-0.008, 0.052] n=12 | -0.500 [-0.750, -0.250] n=12 ✗ | -35.119 [-78.781, 10.967] n=12 | -8.621 [-22.121, 3.546] n=12 | -0.000 [-0.001, -0.000] n=12 ✗ | kill, seconds saved | reference better | 5/10 |
| T1-MK2 | reference − idle | 0.069 [0.024, 0.113] n=12 ✓ | 0.667 [0.417, 0.917] n=12 ✓ | 142.586 [82.404, 203.476] n=12 ✓ | 5.378 [-4.693, 15.224] n=12 | 0.001 [0.000, 0.002] n=12 ✓ | kill, seconds saved | reference better | 6/8 |
| T1-MK2 | idle − all-shutdown | -0.171 [-0.204, -0.139] n=12 ✗ | 0.000 [0.000, 0.000] n=12 | 0.000 [0.000, 0.000] n=12 | -233.167 [-250.250, -214.833] n=12 ✗ | -0.002 [-0.003, -0.000] n=12 ✗ | kill, seconds saved | no | – |
| T1-MK2 | reference − all-max | 0.190 [0.130, 0.254] n=12 ✓ | 0.667 [0.417, 0.917] n=12 ✓ | 142.586 [82.404, 203.476] n=12 ✓ | -76.354 [-136.988, -23.757] n=12 ✗ | -0.001 [-0.002, 0.001] n=12 | kill, seconds saved | reference better | 8/8 |
| T1-MK2 | reference − random | 0.121 [0.040, 0.189] n=12 ✓ | 0.667 [0.417, 0.917] n=12 ✓ | 142.586 [82.404, 203.476] n=12 ✓ | -23.438 [-64.225, 2.661] n=12 | -0.001 [-0.002, 0.000] n=12 | kill, seconds saved | reference better | 7/8 |
| T1-MK2 | reference − never-jump-start | 0.019 [0.005, 0.034] n=12 ✓ | 0.083 [0.000, 0.250] n=12 | 14.444 [0.000, 43.333] n=12 | 0.000 [0.000, 0.000] n=12 | 0.000 [-0.000, 0.001] n=12 | kill, seconds saved | no | 1/1 |
| T1-MK2 | reference-repairing − reference | 0.044 [-0.007, 0.096] n=12 | 0.000 [-0.333, 0.333] n=12 | -27.039 [-105.374, 44.850] n=12 | -1.417 [-8.833, 3.667] n=12 | 0.000 [-0.000, 0.001] n=12 | kill, seconds saved | no | 4/10 |
| all | reference − idle | 0.099 [0.078, 0.123] n=60 ✓ | 0.417 [0.300, 0.550] n=60 ✓ | 65.664 [41.913, 91.016] n=60 ✓ | -17.289 [-36.394, -0.812] n=60 ✗ | 0.001 [0.000, 0.001] n=60 ✓ | kill, seconds saved | reference better | 27/34 |
| all | idle − all-shutdown | -0.050 [-0.102, 0.006] n=60 | 0.150 [0.067, 0.250] n=60 ✓ | 34.912 [15.286, 57.738] n=60 ✓ | -113.509 [-145.833, -80.643] n=60 ✗ | -0.001 [-0.001, -0.000] n=60 ✗ | kill, seconds saved | idle better | 9/9 |
| all | reference − all-max | 0.210 [0.171, 0.248] n=60 ✓ | 0.567 [0.433, 0.683] n=60 ✓ | 100.577 [74.339, 126.870] n=60 ✓ | -49.006 [-72.311, -25.359] n=60 ✗ | 0.000 [-0.000, 0.001] n=60 | kill, seconds saved | reference better | 34/34 |
| all | reference − random | 0.162 [0.126, 0.197] n=60 ✓ | 0.567 [0.433, 0.683] n=60 ✓ | 100.577 [74.339, 126.870] n=60 ✓ | -35.976 [-62.019, -12.303] n=60 ✗ | 0.000 [-0.000, 0.001] n=60 | kill, seconds saved | reference better | 33/34 |
| all | reference − never-jump-start | 0.014 [0.008, 0.020] n=60 ✓ | 0.100 [0.033, 0.183] n=60 ✓ | 8.781 [1.845, 17.744] n=60 ✓ | -0.367 [-1.100, 0.000] n=60 | 0.000 [0.000, 0.001] n=60 ✓ | kill, seconds saved | reference better | 6/6 |
| all | reference-repairing − reference | 0.015 [0.001, 0.029] n=60 ✓ | -0.167 [-0.283, -0.050] n=60 ✗ | -26.310 [-47.775, -4.546] n=60 ✗ | -1.524 [-5.265, 2.243] n=60 | -0.000 [-0.000, 0.000] n=60 | kill, seconds saved | reference better | 15/30 |

### Repairs: reference-repairing − reference where there is damage to fix

Seeds whose reference run took a defect; KPI Δ and demanded damage backlog Δ (Σa·sev, lower is better) over their common time.

| scenario | seeds with damage | KPI Δ | backlog Δ |
| --- | --- | --- | --- |
| E1-MK2 | 12 | 0.005 [-0.015, 0.025] n=12 | -0.634 [-0.961, -0.321] n=12 ✗ |
| E1-predator | 12 | 0.004 [-0.005, 0.012] n=12 | -0.534 [-0.802, -0.239] n=12 ✗ |
| T0-constrained | 5 | -0.006 [-0.012, -0.002] n=5 ✗ | -0.005 [-0.012, -0.000] n=5 ✗ |
| T1 | 12 | 0.022 [-0.008, 0.052] n=12 | -0.751 [-1.234, -0.241] n=12 ✗ |
| T1-MK2 | 12 | 0.044 [-0.007, 0.096] n=12 | -0.187 [-0.725, 0.394] n=12 |
| all | 53 | 0.017 [0.002, 0.034] n=53 ✓ | -0.477 [-0.674, -0.273] n=53 ✗ |

### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)

| held out | weights | reference − idle | idle − all-shutdown | reference − all-max (high risk) |
| --- | --- | --- | --- | --- |
| E1-MK2 | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.191 [0.145, 0.235] n=12 ✓ | -0.213 [-0.236, -0.187] n=12 ✗ | 0.244 [0.183, 0.308] n=11 ✓ |
| E1-predator | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.051 [0.036, 0.067] n=12 ✓ | -0.140 [-0.163, -0.118] n=12 ✗ | 0.103 [0.072, 0.131] n=12 ✓ |
| T0-constrained | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.039 [0.021, 0.054] n=12 ✓ | 0.352 [0.323, 0.379] n=12 ✓ | 0.150 [0.076, 0.217] n=10 ✓ |
| T1 | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.152 [0.109, 0.198] n=12 ✓ | -0.056 [-0.127, 0.010] n=12 | 0.352 [0.292, 0.410] n=12 ✓ |
| T1-MK2 | `{"k":2.302585092994046,"n0":0.25,"beta":1,"lambda0":0.3,"lambda1":0.4,"epsilon":0.01}` | 0.068 [0.024, 0.112] n=12 ✓ | -0.166 [-0.198, -0.134] n=12 ✗ | 0.208 [0.131, 0.290] n=12 ✓ |

### Predictive validity

Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h; on E1 rungs, minus own integrity lost per exposure second).

| set | h | mean r | low | mid | high |
| --- | --- | --- | --- | --- | --- |
| fit seeds | 60 | -0.021 | -0.178 | 0.168 | -0.052 |
| fit seeds | 120 | 0.001 | -0.246 | 0.242 | 0.006 |
| held-out seeds | 60 | 0.142 | 0.086 | 0.359 | -0.018 |
| held-out seeds | 120 | 0.191 | 0.083 | 0.444 | 0.046 |
