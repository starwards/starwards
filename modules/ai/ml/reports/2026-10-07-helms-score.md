# Helms score, 2026-10-07

Score: `modules/ai/src/scoring/helms-kpi.ts`. Validator: `npm --prefix modules/ai run score:helms`. Head: `helms_score30` of `modules/ai/src/scoring/models/v4.json`. Criteria draft: `2026-10-05-helms-criteria-draft.md`. Method copied from `2026-10-05-engineer-v2.md`. Jev spend $0 (every run is local; $22.2 of the $30 cap was spent before this work).

## Result

**Partly validated. Better than the old helms head on most of the evidence, not on all of it, and not better than the existing tactical opportunity.** The numbers are EVIDENCE; INFERENCE is marked.

- **Ranking validity** (Spearman r of the score gap with the graded-outcome gap over all 21 policy pairs, pairs under 0.02 dropped; the engineer-v2 check): fresh seeds 13-20, all scenarios, 0.75 [0.72, 0.78] for the rule score and 0.75 [0.72, 0.78] for the v4 head, against 0.57 [0.46, 0.64] for the v3 `helms10` head (v1 0.66 [0.58, 0.72]). Design held-out seeds 9-12: 0.73 [0.65, 0.80] against 0.56 [0.48, 0.60]. On fresh seeds it is clearly better than v3 on T1 and W-multi and level on T0, T1-MK2 and T1-lite, but **loses on the held-out scenario T1-predator (0.28 [-0.05, 0.54] against 0.73 [0.61, 0.84])** and on T1-MK2 design held-out seeds (0.71 against 0.88, 4 seeds).
- **Close-in falsification test:** passes pooled and on T1, fails on T1-predator for the head. Where close-in loses to the reference on survival and on the graded outcome (fresh, all scenarios pooled: survival 25.9 s [14.1, 40.5], graded 0.167 [0.045, 0.293]), the rule score ranks the reference above close-in by 0.127 [0.081, 0.175] and the head by 0.084 [0.046, 0.125]. On T1, where close-in loses clearly, 0.388 [0.293, 0.467] and 0.338 [0.272, 0.404], while v3 `helms10` does not separate them (0.190 [-0.063, 0.443]). Caveats: (1) the draft predicted that `helms10` repeats the position-only trap; pooled it does not (0.127 [0.068, 0.188]), it only fails to separate on T1. (2) On T1-predator, where the condition also holds on the fresh seeds, the head ranks close-in above the reference (-0.047 [-0.083, -0.010]) and the rule score does not separate them (-0.038 [-0.080, 0.007]). (3) On T1-lite close-in beats the reference in the game (graded -0.29 [-0.44, -0.13] over 20 seeds) and the score still ranks the reference higher: one required ordering inverted.
- **Not better than what exists:** the tactical opportunity head (the helms share of the tactical score, a firing-solution share) ranks as well or better than the new score (0.80 [0.78, 0.81] pooled) on every scenario but T1-predator. It is not a helms-owned score (it ignores survival and standoff), so it is a yardstick, not a replacement.
- **Terms with no evidence:** `collision`, `waypoint` and `warp` never carried demand in the recorded runs (collision demand on 1% of frames and no collision damage; no waypoints; warp shut down by the reference engineer). They are unit-tested (`helms-kpi.spec.ts`) and unvalidated against the game.
- **Head `helms_score30` (v4):** seed-holdout test mse 0.0107 (r2 0.890), persistence gain 0.553. It does not transfer to an unseen scenario: leave-one-scenario-out it loses to persistence on T0, T1, T1-predator and W-multi (`2026-10-08-v4-training.md`). Every other head is inherited bit-identical from v3: **0 regressions against v1, v2 and v3** at the 0.002 logloss / 0.0005 mse floor on >= 5 runs; one pre-existing insufficient-evidence row (T1-noweave damage30 against v1, 2 runs).

## Design (from the designer's answers)

Terms `position`, `evasion`, `collision`, `waypoint`, `warp`, each with a demand and a score, composed as `Σ w·d·s / Σ w·d`; no demand means no score. Structure rules: limited to the helms seat; a thrust shortfall from power is the engineer's and is out; a standoff is not judged: the position term rates where the ship parks by the gun band alone (the designer withdrew the Q2 rule on 2026-10-08, see below); evasion is damage avoided under fire, the shells that would have hit at the velocity they were fired in and did not (Q3); warp level only (Q4); unintended collisions only, no docking (Q6); the weapons-locked hostile, else the nearest (Q7); ground truth allowed (Q8); a crew with a Tactical station is scored by the tactical score as one seat (`seatScores`, Q9); waypoints are demand, verbal orders are not (Q10). H5 (closing rate, redundant with the distance in `position`), H6 (lateral speed), H10 and H11 of the draft were dropped.

Composition overall → tactical → station is unchanged: `tactical.score = opportunity × conversion` from `weapons-kpi.ts`; `stations.helms` is the new head.

## Data and protocol

| set                                                     | runs | seeds                                                             | use                                                                                           |
| ------------------------------------------------------- | ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `training-archive/2026-10-07/helms-score/`              | 504  | 1-12; T0 T1 T1-lite T1-MK2 W-multi T1-predator x 7 helms policies | design: fit seeds 1-8, held-out 9-12; **T1-predator never fitted**                            |
| `training-archive/2026-10-07/helms-score-fresh/`        | 336  | 13-20, same six scenarios                                         | **confirmation**: recorded after the design was frozen; kept out of the dataset (`--exclude`) |
| `training-archive/datasets/snapshots-2026-10-07-v4.csv` | 3906 | days 02, 03 and the design runs                                   | head training: seed holdout per scenario (top 20% of seeds), leave-one-scenario-out refit     |

Both sets at code commit `9f79cc38` (`commits.json`). Policies (helms seat; weapons and engineer are the reference): reference, idle, close-in (never stands off), no-weave, far-off (parks 6 km), charge (full thrust, afterburner held), helms-random. Fitted on fit seeds 1-8 of the five non-held scenarios: the evasion weight and the demand scale (rounds at half demand), among 16 pairs; pooled ranking validity is flat across the grid (0.759 at the optimum, 0.712 at the worst corner). Chosen weight 1, scale 30. The geometry (band 500-3000 m, decay 3000 m) is by design. After the standoff rule was withdrawn, band edge 3000/4000/5000/8000 m and decay 3000/6000/12000 m were tried on fit seeds of the five non-held scenarios and 3000/3000 stayed best (0.77 against 0.73-0.76). A variant that counts any firing solution as aimed did not help (0.75 against 0.76) and was dropped. The seed split and the scenario split never share a run; the calibration map is fitted on seeds 1-12 and checked on 13-20.

## Ranking validity per scenario, before and after

Spearman r [95% CI over seeds] / share of pairs ordered the same way. Before: `helms10` v1, v2, v3 (v2 and v3 are the same head). After: the rule score and the v4 head. Fresh seeds 13-20, which nothing saw:

| set         | scenario               | rule score                | position only            | evasion only              | helms10 v1               | helms10 v2               | helms10 v3               | v4 head                    | tactical opportunity      |
| ----------- | ---------------------- | ------------------------- | ------------------------ | ------------------------- | ------------------------ | ------------------------ | ------------------------ | -------------------------- | ------------------------- |
| fresh 13-20 | T0                     | 0.85 [0.74, 0.93] / 0.87  | 0.84 [0.74, 0.91] / 0.86 | –                         | 0.90 [0.86, 0.94] / 0.83 | 0.83 [0.78, 0.88] / 0.73 | 0.83 [0.78, 0.88] / 0.73 | 0.84 [0.73, 0.92] / 0.87   | 0.87 [0.84, 0.91] / 0.91  |
| fresh 13-20 | T1                     | 0.91 [0.90, 0.93] / 0.87  | 0.88 [0.83, 0.92] / 0.85 | 0.81 [0.71, 0.88] / 0.79  | 0.65 [0.45, 0.83] / 0.74 | 0.52 [0.30, 0.74] / 0.68 | 0.52 [0.30, 0.74] / 0.68 | 0.90 [0.88, 0.92] / 0.84   | 0.92 [0.90, 0.94] / 0.89  |
| fresh 13-20 | T1-MK2                 | 0.84 [0.77, 0.89] / 0.80  | 0.84 [0.78, 0.90] / 0.82 | 0.46 [0.25, 0.63] / 0.61  | 0.78 [0.65, 0.87] / 0.83 | 0.77 [0.65, 0.85] / 0.81 | 0.77 [0.65, 0.85] / 0.81 | 0.82 [0.76, 0.86] / 0.74   | 0.83 [0.78, 0.88] / 0.80  |
| fresh 13-20 | T1-lite                | 0.53 [0.41, 0.64] / 0.70  | 0.53 [0.39, 0.66] / 0.70 | 0.32 [-0.01, 0.51] / 0.49 | 0.49 [0.35, 0.65] / 0.71 | 0.46 [0.31, 0.64] / 0.69 | 0.46 [0.31, 0.64] / 0.69 | 0.55 [0.40, 0.68] / 0.72   | 0.61 [0.49, 0.72] / 0.77  |
| fresh 13-20 | T1-predator (held out) | 0.28 [-0.05, 0.54] / 0.58 | 0.52 [0.28, 0.71] / 0.72 | 0.24 [-0.02, 0.49] / 0.58 | 0.73 [0.63, 0.83] / 0.80 | 0.73 [0.61, 0.84] / 0.84 | 0.73 [0.61, 0.84] / 0.84 | -0.02 [-0.38, 0.33] / 0.46 | 0.14 [-0.20, 0.48] / 0.58 |
| fresh 13-20 | W-multi                | 0.62 [0.48, 0.73] / 0.74  | 0.53 [0.33, 0.67] / 0.69 | 0.72 [0.57, 0.83] / 0.73  | 0.45 [0.25, 0.60] / 0.63 | 0.38 [0.14, 0.53] / 0.60 | 0.38 [0.14, 0.53] / 0.60 | 0.67 [0.53, 0.76] / 0.76   | 0.73 [0.59, 0.82] / 0.77  |
| fresh 13-20 | all                    | 0.75 [0.72, 0.78] / 0.76  | 0.74 [0.69, 0.77] / 0.77 | 0.54 [0.44, 0.63] / 0.64  | 0.66 [0.58, 0.72] / 0.75 | 0.57 [0.46, 0.64] / 0.72 | 0.57 [0.46, 0.64] / 0.72 | 0.75 [0.72, 0.78] / 0.73   | 0.80 [0.78, 0.81] / 0.78  |

Design held-out seeds 9-12 (the v4 head trained on seeds up to 10 of these runs, so its column is not out of sample):

| set            | scenario               | rule score                | position only            | evasion only              | helms10 v1               | helms10 v2               | helms10 v3               | v4 head | tactical opportunity     |
| -------------- | ---------------------- | ------------------------- | ------------------------ | ------------------------- | ------------------------ | ------------------------ | ------------------------ | ------- | ------------------------ |
| held-out seeds | T0                     | 0.82 [0.60, 0.92] / 0.87  | 0.80 [0.60, 0.92] / 0.87 | –                         | 0.91 [0.88, 0.97] / 0.87 | 0.80 [0.76, 0.81] / 0.69 | 0.80 [0.76, 0.81] / 0.69 | –       | 0.89 [0.85, 0.94] / 0.97 |
| held-out seeds | T1                     | 0.83 [0.66, 0.95] / 0.83  | 0.81 [0.64, 0.90] / 0.82 | 0.75 [0.59, 0.89] / 0.76  | 0.60 [0.49, 0.70] / 0.71 | 0.47 [0.29, 0.64] / 0.71 | 0.47 [0.29, 0.64] / 0.71 | –       | 0.87 [0.79, 0.91] / 0.84 |
| held-out seeds | T1-MK2                 | 0.71 [0.29, 0.83] / 0.71  | 0.73 [0.37, 0.84] / 0.76 | 0.45 [0.09, 0.60] / 0.62  | 0.91 [0.83, 0.94] / 0.93 | 0.88 [0.81, 0.94] / 0.94 | 0.88 [0.81, 0.94] / 0.94 | –       | 0.87 [0.81, 0.89] / 0.80 |
| held-out seeds | T1-lite                | 0.69 [0.65, 0.75] / 0.78  | 0.59 [0.49, 0.67] / 0.69 | 0.51 [0.41, 0.71] / 0.64  | 0.51 [0.35, 0.67] / 0.69 | 0.49 [0.29, 0.66] / 0.66 | 0.49 [0.29, 0.66] / 0.66 | –       | 0.74 [0.63, 0.81] / 0.73 |
| held-out seeds | T1-predator (held out) | 0.31 [-0.20, 0.66] / 0.61 | 0.48 [0.07, 0.75] / 0.72 | 0.06 [-0.57, 0.28] / 0.45 | 0.73 [0.59, 0.90] / 0.84 | 0.72 [0.60, 0.88] / 0.84 | 0.72 [0.60, 0.88] / 0.84 | –       | 0.46 [0.19, 0.79] / 0.75 |
| held-out seeds | W-multi                | 0.54 [0.48, 0.59] / 0.67  | 0.43 [0.31, 0.52] / 0.65 | 0.75 [0.67, 0.84] / 0.76  | 0.44 [0.29, 0.53] / 0.62 | 0.29 [0.18, 0.37] / 0.59 | 0.29 [0.18, 0.37] / 0.59 | –       | 0.61 [0.51, 0.68] / 0.75 |
| held-out seeds | all                    | 0.73 [0.65, 0.80] / 0.74  | 0.70 [0.61, 0.77] / 0.75 | 0.55 [0.47, 0.59] / 0.64  | 0.66 [0.62, 0.70] / 0.77 | 0.56 [0.48, 0.60] / 0.74 | 0.56 [0.48, 0.60] / 0.74 | –       | 0.81 [0.76, 0.85] / 0.81 |

## Close-in falsification

Fresh seeds. The condition holds where the reference beats close-in on survival (seconds until integrity < 0.5) and on the graded outcome with both CIs above 0.

| set            | scenario    | close-in loses on survival          | close-in loses on outcome       | score      | reference - close-in          | verdict                                                |
| -------------- | ----------- | ----------------------------------- | ------------------------------- | ---------- | ----------------------------- | ------------------------------------------------------ |
| held-out seeds | T1          | 117.375 [92.717, 146.858] n=8 ✓ yes | 0.739 [0.420, 0.968] n=8 ✓ yes  | helms      | 0.388 [0.293, 0.467] n=8 ✓    | **condition holds**: close-in not above reference      |
| held-out seeds | T1          | 117.375 [92.717, 146.858] n=8 ✓ yes | 0.739 [0.420, 0.968] n=8 ✓ yes  | helms10-v3 | 0.190 [-0.063, 0.443] n=8     | **condition holds**: no separation                     |
| held-out seeds | T1          | 117.375 [92.717, 146.858] n=8 ✓ yes | 0.739 [0.420, 0.968] n=8 ✓ yes  | helms-head | 0.338 [0.272, 0.404] n=8 ✓    | **condition holds**: close-in not above reference      |
| held-out seeds | T1-predator | 8.875 [4.000, 14.250] n=8 ✓ yes     | 0.039 [0.010, 0.064] n=8 ✓ yes  | helms      | -0.038 [-0.080, 0.007] n=8    | **condition holds**: no separation                     |
| held-out seeds | T1-predator | 8.875 [4.000, 14.250] n=8 ✓ yes     | 0.039 [0.010, 0.064] n=8 ✓ yes  | helms10-v3 | -0.047 [-0.078, -0.013] n=8 ✗ | **condition holds**: FAIL: close-in outranks reference |
| held-out seeds | T1-predator | 8.875 [4.000, 14.250] n=8 ✓ yes     | 0.039 [0.010, 0.064] n=8 ✓ yes  | helms-head | -0.047 [-0.083, -0.010] n=8 ✗ | **condition holds**: FAIL: close-in outranks reference |
| held-out seeds | all         | 25.909 [14.091, 40.476] n=48 ✓ yes  | 0.167 [0.045, 0.293] n=48 ✓ yes | helms      | 0.127 [0.081, 0.175] n=48 ✓   | **condition holds**: close-in not above reference      |
| held-out seeds | all         | 25.909 [14.091, 40.476] n=48 ✓ yes  | 0.167 [0.045, 0.293] n=48 ✓ yes | helms10-v3 | 0.127 [0.068, 0.188] n=48 ✓   | **condition holds**: close-in not above reference      |
| held-out seeds | all         | 25.909 [14.091, 40.476] n=48 ✓ yes  | 0.167 [0.045, 0.293] n=48 ✓ yes | helms-head | 0.084 [0.046, 0.125] n=48 ✓   | **condition holds**: close-in not above reference      |

## Policy contrasts (fresh seeds)

Positive is better for the first policy on every column. Required where the graded outcome separates the pair. T1 and all scenarios pooled; every scenario is in `validation-fresh-head.md` in the archive.

| set            | scenario | contrast             | rule Δ                         | helms10 v3 Δ                   | graded Δ                       | integrity lost Δ               | survival Δ (s)                   | kill Δ                         | verdict (rule) | verdict (v3)         |
| -------------- | -------- | -------------------- | ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------ | -------------------------------- | ------------------------------ | -------------- | -------------------- |
| held-out seeds | T1       | reference − idle     | 0.566 [0.471, 0.664] n=8 ✓     | 0.319 [0.120, 0.531] n=8 ✓     | 1.156 [1.046, 1.274] n=8 ✓     | 0.328 [0.235, 0.419] n=8 ✓     | 104.288 [78.404, 131.263] n=8 ✓  | 0.875 [0.625, 1.000] n=8 ✓     | required ✓     | required ✓           |
| held-out seeds | T1       | reference − random   | 0.326 [0.240, 0.410] n=8 ✓     | 0.170 [-0.014, 0.350] n=8      | 0.691 [0.539, 0.822] n=8 ✓     | 0.248 [0.122, 0.340] n=8 ✓     | 80.538 [46.906, 116.915] n=8 ✓   | 0.875 [0.625, 1.000] n=8 ✓     | required ✓     | required ~ (spans 0) |
| held-out seeds | T1       | reference − charge   | 0.270 [0.210, 0.335] n=8 ✓     | -0.023 [-0.251, 0.223] n=8     | 0.542 [0.294, 0.784] n=8 ✓     | 0.243 [0.143, 0.332] n=8 ✓     | 80.533 [52.248, 111.642] n=8 ✓   | 0.625 [0.250, 1.000] n=8 ✓     | required ✓     | required ~ (spans 0) |
| held-out seeds | T1       | reference − close-in | 0.388 [0.293, 0.467] n=8 ✓     | 0.190 [-0.063, 0.443] n=8      | 0.739 [0.420, 0.968] n=8 ✓     | 0.366 [0.298, 0.435] n=8 ✓     | 117.375 [92.717, 146.858] n=8 ✓  | 0.750 [0.375, 1.000] n=8 ✓     | required ✓     | required ~ (spans 0) |
| held-out seeds | T1       | reference − no-weave | 0.003 [-0.079, 0.101] n=8      | -0.111 [-0.362, 0.124] n=8     | -0.068 [-0.302, 0.154] n=8     | 0.016 [-0.074, 0.125] n=8      | 15.025 [-26.450, 60.525] n=8     | 0.125 [0.000, 0.375] n=8       | outcome ties   | outcome ties         |
| held-out seeds | T1       | reference − far-off  | -0.010 [-0.060, 0.038] n=8     | 0.077 [-0.068, 0.227] n=8      | -0.053 [-0.326, 0.217] n=8     | -0.110 [-0.243, 0.020] n=8     | -35.683 [-82.000, 3.794] n=8     | 0.375 [0.125, 0.750] n=8 ✓     | outcome ties   | outcome ties         |
| held-out seeds | T1       | idle − random        | -0.168 [-0.217, -0.113] n=8 ✗  | -0.101 [-0.161, -0.035] n=8 ✗  | -0.452 [-0.563, -0.347] n=8 ✗  | -0.062 [-0.130, 0.000] n=8     | -23.750 [-42.375, -6.125] n=8 ✗  | 0.000 [0.000, 0.000] n=8       | required ✓     | required ✓           |
| held-out seeds | all      | reference − idle     | 0.494 [0.414, 0.571] n=48 ✓    | 0.339 [0.270, 0.416] n=48 ✓    | 0.697 [0.579, 0.812] n=48 ✓    | 0.017 [-0.053, 0.084] n=48     | 15.582 [-4.286, 33.286] n=48     | 0.729 [0.604, 0.854] n=48 ✓    | required ✓     | required ✓           |
| held-out seeds | all      | reference − random   | 0.322 [0.258, 0.385] n=48 ✓    | 0.260 [0.198, 0.322] n=48 ✓    | 0.525 [0.427, 0.621] n=48 ✓    | 0.112 [0.052, 0.173] n=48 ✓    | 11.122 [-3.652, 24.992] n=48     | 0.625 [0.479, 0.750] n=48 ✓    | required ✓     | required ✓           |
| held-out seeds | all      | reference − charge   | 0.179 [0.145, 0.212] n=48 ✓    | 0.025 [-0.028, 0.079] n=48     | 0.158 [0.037, 0.271] n=48 ✓    | -0.016 [-0.066, 0.034] n=48    | 3.152 [-10.303, 17.128] n=48     | 0.188 [0.063, 0.313] n=48 ✓    | required ✓     | required ~ (spans 0) |
| held-out seeds | all      | reference − close-in | 0.127 [0.081, 0.175] n=48 ✓    | 0.127 [0.068, 0.188] n=48 ✓    | 0.167 [0.045, 0.293] n=48 ✓    | 0.104 [0.049, 0.164] n=48 ✓    | 25.909 [14.091, 40.476] n=48 ✓   | 0.208 [0.063, 0.354] n=48 ✓    | required ✓     | required ✓           |
| held-out seeds | all      | reference − no-weave | 0.005 [-0.015, 0.027] n=48     | -0.001 [-0.051, 0.042] n=48    | 0.054 [-0.023, 0.122] n=48     | 0.027 [-0.001, 0.059] n=48     | 3.677 [-3.000, 11.720] n=48      | 0.063 [-0.042, 0.167] n=48     | outcome ties   | outcome ties         |
| held-out seeds | all      | reference − far-off  | 0.030 [0.004, 0.057] n=48 ✓    | 0.066 [0.023, 0.120] n=48 ✓    | 0.081 [-0.033, 0.190] n=48     | -0.061 [-0.107, -0.019] n=48 ✗ | -10.227 [-20.545, -2.200] n=48 ✗ | 0.250 [0.083, 0.417] n=48 ✓    | outcome ties   | outcome ties         |
| held-out seeds | all      | idle − random        | -0.162 [-0.214, -0.103] n=48 ✗ | -0.071 [-0.105, -0.039] n=48 ✗ | -0.112 [-0.191, -0.033] n=48 ✗ | 0.185 [0.118, 0.262] n=48 ✓    | 18.575 [-2.919, 41.735] n=48     | -0.104 [-0.188, -0.021] n=48 ✗ | required ✓     | required ✓           |

## Calibration

y = 1 when the graded outcome over the next 60 s exceeds 0.02. An isotonic map from score to P(y) is fitted on seeds 1-12 of the non-held scenarios (the v4 head and `helms10` are mapped the same way) and checked on fresh seeds and the held-out scenario. ECE over 10 equal-count bins and Brier skill against the fit base rate, 95% CI over seeds.

| variant    | set               | scenario    | n     | ECE [CI]             | Brier skill [CI]       |
| ---------- | ----------------- | ----------- | ----- | -------------------- | ---------------------- |
| helms      | held-out seeds    | all         | 43932 | 0.037 [0.019, 0.060] | 0.115 [0.077, 0.145]   |
| helms      | held-out seeds    | T0          | 7776  | 0.294 [0.249, 0.315] | 0.231 [0.170, 0.267]   |
| helms      | held-out seeds    | T1          | 12340 | 0.039 [0.043, 0.089] | 0.092 [0.031, 0.179]   |
| helms      | held-out seeds    | T1-MK2      | 10057 | 0.051 [0.038, 0.087] | 0.065 [0.007, 0.130]   |
| helms      | held-out seeds    | T1-lite     | 5949  | 0.092 [0.057, 0.169] | 0.131 [0.082, 0.187]   |
| helms      | held-out seeds    | W-multi     | 7810  | 0.135 [0.105, 0.176] | 0.031 [-0.039, 0.102]  |
| helms      | held-out scenario | T1-predator | 33600 | 0.163 [0.143, 0.184] | 0.196 [0.169, 0.227]   |
| helms10-v3 | held-out seeds    | all         | 46318 | 0.082 [0.034, 0.078] | 0.078 [0.052, 0.099]   |
| helms10-v3 | held-out seeds    | T0          | 9084  | 0.268 [0.211, 0.277] | 0.219 [0.201, 0.235]   |
| helms10-v3 | held-out seeds    | T1          | 12284 | 0.147 [0.100, 0.167] | -0.052 [-0.132, 0.028] |
| helms10-v3 | held-out seeds    | T1-MK2      | 10000 | 0.082 [0.046, 0.111] | 0.074 [0.008, 0.132]   |
| helms10-v3 | held-out seeds    | T1-lite     | 7196  | 0.068 [0.055, 0.127] | 0.171 [0.116, 0.222]   |
| helms10-v3 | held-out seeds    | W-multi     | 7754  | 0.162 [0.127, 0.209] | -0.019 [-0.103, 0.045] |
| helms10-v3 | held-out scenario | T1-predator | 33460 | 0.195 [0.175, 0.206] | 0.049 [-0.001, 0.129]  |
| helms-head | held-out seeds    | all         | 46318 | 0.036 [0.020, 0.051] | 0.221 [0.167, 0.259]   |
| helms-head | held-out seeds    | T0          | 9084  | 0.182 [0.157, 0.217] | 0.530 [0.460, 0.569]   |
| helms-head | held-out seeds    | T1          | 12284 | 0.084 [0.040, 0.102] | 0.126 [0.023, 0.236]   |
| helms-head | held-out seeds    | T1-MK2      | 10000 | 0.052 [0.032, 0.100] | 0.095 [0.043, 0.156]   |
| helms-head | held-out seeds    | T1-lite     | 7196  | 0.068 [0.044, 0.118] | 0.304 [0.215, 0.372]   |
| helms-head | held-out seeds    | W-multi     | 7754  | 0.176 [0.135, 0.226] | -0.059 [-0.199, 0.078] |
| helms-head | held-out scenario | T1-predator | 33460 | 0.113 [0.092, 0.126] | 0.194 [0.153, 0.245]   |

INFERENCE: calibrated overall (ECE 0.04, Brier skill 0.22 for the head), poorly on W-multi (skill below 0) and T0 (ECE 0.19: the outcome is almost always positive there). The raw rule score is not a probability: on the fit seeds its bins run from 0.00 to 0.97 for observed rates of 0.15 to 0.57.

## Predictive validity (within-moment, fresh seeds)

Frame score and 60 s graded outcome, each minus its mean over the policies of the same scenario, seed and second; Pearson r [95% CI over seeds].

| set            | scenario    | rule                 | position only        | evasion only         | helms10 v3           | v4 head              | tactical opportunity |
| -------------- | ----------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- |
| held-out seeds | T0          | 0.58 [0.52, 0.62]    | 0.57 [0.52, 0.62]    | –                    | 0.39 [0.33, 0.46]    | 0.58 [0.50, 0.64]    | 0.55 [0.51, 0.60]    |
| held-out seeds | T1          | 0.36 [0.28, 0.44]    | 0.31 [0.24, 0.40]    | 0.34 [0.19, 0.45]    | 0.20 [-0.03, 0.42]   | 0.42 [0.35, 0.51]    | 0.43 [0.35, 0.53]    |
| held-out seeds | T1-MK2      | 0.24 [0.18, 0.32]    | 0.24 [0.19, 0.30]    | 0.13 [0.02, 0.24]    | 0.34 [0.29, 0.39]    | 0.32 [0.26, 0.38]    | 0.33 [0.27, 0.40]    |
| held-out seeds | T1-lite     | 0.31 [0.21, 0.43]    | 0.34 [0.24, 0.46]    | -0.10 [-0.26, 0.07]  | 0.26 [0.16, 0.37]    | 0.32 [0.21, 0.46]    | 0.34 [0.23, 0.46]    |
| held-out seeds | T1-predator | -0.03 [-0.15, 0.08]  | 0.02 [-0.11, 0.15]   | -0.09 [-0.16, -0.00] | 0.05 [-0.10, 0.19]   | -0.00 [-0.14, 0.14]  | -0.00 [-0.13, 0.14]  |
| held-out seeds | W-multi     | -0.15 [-0.27, -0.05] | -0.19 [-0.29, -0.10] | 0.23 [0.11, 0.36]    | -0.23 [-0.39, -0.09] | -0.16 [-0.29, -0.05] | -0.10 [-0.24, 0.02]  |
| held-out seeds | all         | 0.28 [0.24, 0.33]    | 0.26 [0.22, 0.30]    | 0.14 [0.09, 0.20]    | 0.19 [0.12, 0.26]    | 0.34 [0.29, 0.39]    | 0.34 [0.30, 0.39]    |

The head predicts the next 60 s about as well as the tactical opportunity (0.33 against 0.34) and better than `helms10` (0.19). On T1-predator nothing predicts it (all r near 0): no policy kills there (0 kills in the 84 design runs), so the graded gaps are small and mostly noise. INFERENCE: that is why every score is unreliable there, and why `helms10` ranking policies well on it (0.73) is not read as evidence for it.

## Leave one scenario out (design set)

The evasion weight and scale refit on the other scenarios' fit seeds; the held scenario scored on its held-out seeds.

| held out | refit evasion weight / fire scale | ranking validity (held-out seeds, refit) | with the all-scenario weight |
| -------- | --------------------------------- | ---------------------------------------- | ---------------------------- |
| T0       | 1 / 30                            | 0.82 [0.60, 0.92] / 0.87                 | 0.82 [0.60, 0.92] / 0.87     |
| T1       | 1 / 30                            | 0.83 [0.66, 0.95] / 0.83                 | 0.83 [0.66, 0.95] / 0.83     |
| T1-MK2   | 2 / 30                            | 0.69 [0.21, 0.83] / 0.70                 | 0.71 [0.29, 0.83] / 0.71     |
| T1-lite  | 1 / 30                            | 0.69 [0.65, 0.75] / 0.78                 | 0.69 [0.65, 0.75] / 0.78     |
| W-multi  | 1 / 30                            | 0.54 [0.48, 0.59] / 0.67                 | 0.54 [0.48, 0.59] / 0.67     |

## What could be wrong

- The graded outcome (hostile integrity dealt minus own integrity lost, a kill counts 1) is my yardstick, not a game rule, and the same yardstick fitted two constants. The tactical opportunity head ranks higher against it, which suggests the yardstick rewards firing solutions; the standoff rule was withdrawn but no band setting made far-off rank right on W-multi design seeds (reference - far-off -0.10 [-0.20, -0.02] on seeds 1-8, the outcome favours far-off there): the cause is not the band.
- Seven scripted policies and one hand-written reference: ranking validity measures agreement with the game across them, not across Jev or human helms.
- 8 fresh seeds per scenario; per-scenario CIs are wide (T1-lite, T1-predator).
- `evasion` needs the sidecar's `shot` and `blast_hit` events (recorded since 2026-10-03) and counts shells only; missiles are ignored.
- The head does not transfer to an unseen scenario (leave-one-scenario-out) and its helm-policy variation comes only from the 504 design runs.
- `collision`, `waypoint` and `warp` are unvalidated.
- What would change the verdict: a scenario where a standoff policy wins and the score ranks it lower, or a human or Jev helm ranked against the scripted ones.

## Reproduce

```bash
npm --prefix modules/ai run train -- --scenario T1 --seeds 12 --workers 2 --crew crews/helms-reference.json --crew crews/helms-idle.json --crew crews/helms-close-in.json --crew crews/helms-no-weave.json --crew crews/helms-far-off.json --crew crews/helms-charge.json --crew crews/helms-random.json --out <dir>/T1
npm --prefix modules/ai run score:helms -- --runs <dir>/T1 ... --fit-max-seed 8 --held-scenario T1-predator   # design: fit and held-out seeds
npm --prefix modules/ai run score:helms -- --runs <design dirs> --runs <fresh dirs> --fit-max-seed 12 --held-scenario T1-predator --evasion-weight 1 --fire-half 30 --head v4
npm --prefix modules/ai run score:dataset -- --days 2026-10-02,2026-10-03,2026-10-07 --exclude helms-score-fresh/ --out <archive>/datasets/snapshots-2026-10-07-v4.csv
modules/ai/ml/.venv/Scripts/python modules/ai/ml/train.py --dataset snapshots-2026-10-07-v4.csv --version v4 --baseline v1 --compare v1 --compare v2 --compare v3 --inherit v3 --train helms_score30 --date 2026-10-07
```
