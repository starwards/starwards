# Weapons station and tactical score, phase 1 validation, 2026-10-03

Scores: `src/scoring/weapons-kpi.ts`. Validator: `npm run score:weapons`. Runs: 288 headless (T0, T0-wide, T1,
T1-MK2 × seeds 1–12 × 6 crews; helms reference throughout), made with `npm run score:weapons-runs` at `26e162b0`,
archived in `training-archive/2026-10-03/weapons-score/`. Scripted seats only; Jev spend $0. No snapshot model trained.

## Recording extensions

- `shot` per projectile `{shipId, ammo, warhead, targetId, x, y, vx, vy, ttl}`: diffed per tick; `targetId` is the
  shooter's weapons target for an unguided round.
- `projectile_end` `{reason}`: `impact` (a hit carries its id), `detonate` (a new blast of the same shooter within
  200 m, this or the next tick), `shotDown` (health ≤ 0), else `expire`.
- `damage` per weapon hit `{sourceId, shooterId, damageType, delivery, amount, plateLoss, defects}`, from
  `DamageManager.onDamage`.

## Design

- Incapacitation `I = 1 − (1 − kill)·cap`; `kill = ½·armor lost + ½·capsule lost` (1 when destroyed);
  `cap = gun·(½ + ½·mobility)`. A hit is valued by the change it makes to I, so system damage counts as much as
  plate damage.
- Threat `θ_j = dps·P_reach·ammoFrac·cap`, normalised over living enemies and averaged over the window.
- Credit `C = Σ θ̃·(1 + φ·held≥5 s)·ΔI⁺·ours − λ_ff·friendly`. `ours` is our share of the recorded hit weight
  between frames; when no hit is recorded, the loss is credited to nobody. `C_max = (1+φ)·Σ θ̃·min(1 − I₀, ρ·gun·W)`,
  with W = 45 s, φ = 1 and λ_ff = 2. ρ = 0.0272/s is fitted on the reference runs of seeds 1–8 (95th percentile of
  windowed ΔI per unit gun). Leave-one-scenario-out refits give 0.024–0.028.
- `T = C/C_max`. `O` is the threat-weighted share of 1 s frames with a firing solution. Gun: a shell along the
  gun's bearing, with the current fuze, passes within fuze + blast + hull radius while closing. Missile: a powered
  tube with missiles in the magazine and the target held at 1–20 km. The tube safety is ignored, because no seat
  can release it. `V = T/O`.
- `K_w = 1 − nosol − dominated − 2·friendly + ½·lockUptime`, with rates per round. `nosol` is checked against
  each shot's own position, velocity and fuze. A round is `dominated` when its analytic value on the target's
  current armor is below half of the best shell in the magazine. The weights are fixed by hand, not fitted.
- Helms residual `K_h` (sketch, not built): −(threat-weighted time inside enemy gun reach while O = 0) + standoff
  adherence (|distance − chosen standoff| over the gun's range).
- Engineer as covariate: our `gun` capability scales `C_max`. Reachability ignores thruster state (not built).

## Result (all seeds; held-out seeds 9–12 agree except where noted)

| required ordering                       | pooled Δ [95% CI]      | per scenario                                         |
| --------------------------------------- | ---------------------- | ---------------------------------------------------- |
| reference > idle on T                   | 0.604 [0.525, 0.686] ✓ | ✓ in all four                                        |
| reference > idle on V                   | 0.829 [0.736, 0.929] ✓ | ✓ in all four                                        |
| reference > spray-fire on K_w           | 0.401 [0.310, 0.493] ✓ | ✓ in all four (held-out T1-MK2: ✓)                   |
| reference > wrong-ammo on K_w           | 1.055 [1.021, 1.091] ✓ | ✓ in all four                                        |
| reference > wrong-ammo on V             | 0.422 [0.263, 0.576] ✓ | **T1-MK2 −0.159 [−0.447, 0.165], not separated**     |
| reference > no-lock on lock uptime      | 0.897 [0.835, 0.953] ✓ | ✓ in all four                                        |
| torpedo > reference on T, gun outranged | 0.100, n=2 windows     | **untestable: only 2 outranged windows in 288 runs** |
| torpedo vs reference on T, in range     | 0.033 [−0.082, 0.133]  | not separated (expected: no gain in range)           |

Spearman of window T with kill60: 0.394 pooled (T0 0.52, T0-wide 0.56, T1 0.21, T1-MK2 0.33). The persistence
baseline (ΔI in the previous window) gives 0.010; O alone gives 0.273.

## Findings and caveats

- EVIDENCE: idle has `K_w = 1.000`, because it fires no rounds, so no waste is charged. That exceeds the reference
  in T1 (1.029 vs 1.000, close to a tie). K_w ranks firing quality and must be read together with V.
- EVIDENCE: V exceeds 1 for spray-fire (1.06–1.61). Credit is earned outside the frames that O counts: the 1 s
  frames and the gun-bearing check miss the reach that spray fire gets from shell spread and from blasts flinging
  the target. INFERENCE: O is too narrow; sample it per tick, or widen it by `bulletDegreesDeviation`.
- EVIDENCE: `dominated` is binary in practice (reference 0.000, wrong-ammo 1.000). The ammo value constants are
  INFERENCE read from the rules, not measured. The first calibration (disarm weight 0.05 per external defect) called
  HiExp dominated once the plates were stripped, so it was lowered to 0.01 after looking at the validation data.
  That is a tuning step on the test data.
- EVIDENCE: the torpedo crew did not beat the reference in T1 (6/12 kills vs 9/12). INFERENCE: missile blasts fling
  the target away. Not investigated.
- The archived tactical-brain runs (`tactical-t0`, `split-h19-w17-t0`) were skipped. They predate the `shot` and
  `damage` events, so T, V and K_w cannot be computed for them.
- Scenarios have one enemy and no friendlies. θ normalisation, the friendly-fire penalty and the held-target bonus
  are therefore untested beyond the unit tests.

## Full validator output

runs 288; scenarios T0, T0-wide, T1, T1-MK2; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

weights: `{"phi":1,"lambdaFriendly":2,"windowSeconds":45,"rho":0.027222222089767472}` (ρ fitted on reference runs of the fit seeds: 95th percentile of windowed incapacitation rate per unit gun)

### Per-crew means

| scenario | crew              | kills | T     | O     | V     | Kw     | lock  | nosol | dominated | T_outranged | T_inrange | rounds |
| -------- | ----------------- | ----- | ----- | ----- | ----- | ------ | ----- | ----- | --------- | ----------- | --------- | ------ |
| T0       | reference         | 12/12 | 0.672 | 0.850 | 0.790 | 1.471  | 0.987 | 0.022 | 0.000     | –           | 0.672     | 246    |
| T0       | idle              | 0/12  | 0.000 | 0.481 | 0.000 | 1.000  | 0.000 | 0.000 | 0.000     | –           | 0.000     | 0      |
| T0       | spray-fire        | 11/12 | 0.686 | 0.640 | 1.055 | 1.078  | 0.853 | 0.348 | 0.000     | –           | 0.686     | 710    |
| T0       | wrong-ammo        | 0/12  | 0.072 | 0.714 | 0.100 | 0.491  | 0.997 | 0.008 | 1.000     | –           | 0.072     | 607    |
| T0       | no-lock           | 0/12  | 0.006 | 0.320 | 0.278 | 0.692  | 0.000 | 0.308 | 0.000     | 0.000       | 0.034     | 13     |
| T0       | torpedo-reference | 12/12 | 0.654 | 0.780 | 0.849 | 1.415  | 0.988 | 0.079 | 0.000     | –           | 0.654     | 239    |
| T0-wide  | reference         | 12/12 | 0.704 | 0.858 | 0.828 | 1.478  | 0.987 | 0.015 | 0.000     | 0.626       | 0.732     | 241    |
| T0-wide  | idle              | 0/12  | 0.000 | 0.289 | 0.000 | 1.000  | 0.000 | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T0-wide  | spray-fire        | 11/12 | 0.796 | 0.632 | 1.161 | 1.119  | 0.892 | 0.327 | 0.000     | 0.709       | 0.758     | 649    |
| T0-wide  | wrong-ammo        | 0/12  | 0.057 | 0.710 | 0.080 | 0.483  | 0.997 | 0.016 | 1.000     | 0.067       | 0.056     | 602    |
| T0-wide  | no-lock           | 0/12  | 0.003 | 0.208 | 0.124 | 0.774  | 0.000 | 0.226 | 0.000     | 0.000       | 0.010     | 9      |
| T0-wide  | torpedo-reference | 12/12 | 0.729 | 0.812 | 0.905 | 1.439  | 0.987 | 0.054 | 0.000     | 0.726       | 0.752     | 213    |
| T1       | reference         | 9/12  | 0.611 | 0.535 | 1.067 | 1.029  | 0.884 | 0.413 | 0.000     | –           | 0.611     | 659    |
| T1       | idle              | 0/12  | 0.000 | 0.157 | 0.000 | 1.000  | 0.000 | 0.000 | 0.000     | –           | 0.000     | 0      |
| T1       | spray-fire        | 2/12  | 0.356 | 0.229 | 1.612 | 0.540  | 0.495 | 0.708 | 0.000     | –           | 0.356     | 1143   |
| T1       | wrong-ammo        | 0/12  | 0.252 | 0.361 | 0.659 | -0.050 | 0.602 | 0.351 | 1.000     | –           | 0.252     | 653    |
| T1       | no-lock           | 0/12  | 0.055 | 0.102 | 0.661 | 0.443  | 0.000 | 0.557 | 0.000     | –           | 0.055     | 288    |
| T1       | torpedo-reference | 6/12  | 0.493 | 0.747 | 0.630 | 1.045  | 0.740 | 0.325 | 0.000     | 0.000       | 0.495     | 502    |
| T1-MK2   | reference         | 6/12  | 0.429 | 0.568 | 0.659 | 1.237  | 0.731 | 0.129 | 0.000     | 0.000       | 0.431     | 299    |
| T1-MK2   | idle              | 0/12  | 0.000 | 0.105 | 0.000 | 1.000  | 0.000 | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T1-MK2   | spray-fire        | 7/12  | 0.624 | 0.433 | 1.529 | 0.874  | 0.653 | 0.453 | 0.000     | 0.000       | 0.639     | 734    |
| T1-MK2   | wrong-ammo        | 0/12  | 0.217 | 0.266 | 0.818 | 0.073  | 0.354 | 0.104 | 1.000     | 0.000       | 0.224     | 325    |
| T1-MK2   | no-lock           | 0/12  | 0.047 | 0.085 | 0.594 | 0.477  | 0.000 | 0.523 | 0.000     | 0.000       | 0.050     | 190    |
| T1-MK2   | torpedo-reference | 9/12  | 0.675 | 0.831 | 0.791 | 1.238  | 0.849 | 0.186 | 0.000     | –           | 0.675     | 307    |

### All seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T_inrange) |
| -------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | ----------------------------------------- |
| T0       | 0.672 [0.611, 0.734] n=12 ✓ | 0.753 [0.681, 0.826] n=9 ✓  | 0.393 [0.264, 0.526] n=12 ✓ | 0.980 [0.963, 0.993] n=12 ✓ | 0.690 [0.618, 0.763] n=12 ✓ | 0.987 [0.985, 0.989] n=12 ✓ | –                                           | -0.018 [-0.087, 0.055] n=12               |
| T0-wide  | 0.704 [0.663, 0.747] n=12 ✓ | 0.813 [0.730, 0.896] n=7 ✓  | 0.359 [0.209, 0.529] n=12 ✓ | 0.996 [0.990, 1.002] n=12 ✓ | 0.747 [0.669, 0.823] n=12 ✓ | 0.987 [0.986, 0.989] n=12 ✓ | 0.100 [0.001, 0.200] n=2 ✓                  | 0.020 [-0.016, 0.058] n=12                |
| T1       | 0.611 [0.420, 0.810] n=12 ✓ | 1.067 [0.851, 1.289] n=12 ✓ | 0.489 [0.310, 0.675] n=12 ✓ | 1.079 [1.019, 1.142] n=12 ✓ | 0.408 [0.080, 0.756] n=12 ✓ | 0.884 [0.774, 0.970] n=12 ✓ | –                                           | -0.115 [-0.404, 0.166] n=12               |
| T1-MK2   | 0.429 [0.245, 0.644] n=12 ✓ | 0.659 [0.500, 0.850] n=12 ✓ | 0.363 [0.139, 0.586] n=12 ✓ | 1.164 [1.067, 1.253] n=12 ✓ | -0.159 [-0.447, 0.165] n=12 | 0.731 [0.558, 0.897] n=12 ✓ | –                                           | 0.245 [-0.043, 0.479] n=12                |
| all      | 0.604 [0.525, 0.686] n=48 ✓ | 0.829 [0.736, 0.929] n=40 ✓ | 0.401 [0.310, 0.493] n=48 ✓ | 1.055 [1.021, 1.091] n=48 ✓ | 0.422 [0.263, 0.576] n=48 ✓ | 0.897 [0.835, 0.953] n=48 ✓ | 0.100 [0.001, 0.200] n=2 ✓                  | 0.033 [-0.082, 0.133] n=48                |

### Held-out seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T_inrange) |
| -------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | ----------------------------------------- |
| T0       | 0.595 [0.503, 0.694] n=4 ✓  | 0.710 [0.613, 0.805] n=4 ✓  | 0.332 [0.136, 0.491] n=4 ✓  | 0.985 [0.966, 0.997] n=4 ✓  | 0.611 [0.543, 0.695] n=4 ✓  | 0.987 [0.984, 0.991] n=4 ✓  | –                                           | 0.072 [-0.048, 0.218] n=4                 |
| T0-wide  | 0.650 [0.608, 0.717] n=4 ✓  | 0.785 [0.684, 0.886] n=2 ✓  | 0.222 [0.056, 0.444] n=4 ✓  | 0.998 [0.987, 1.012] n=4 ✓  | 0.642 [0.571, 0.762] n=4 ✓  | 0.985 [0.982, 0.988] n=4 ✓  | –                                           | 0.021 [-0.009, 0.060] n=4                 |
| T1       | 0.857 [0.522, 1.192] n=4 ✓  | 1.416 [1.202, 1.601] n=4 ✓  | 0.583 [0.341, 0.826] n=4 ✓  | 1.083 [0.966, 1.180] n=4 ✓  | 0.832 [0.290, 1.312] n=4 ✓  | 0.906 [0.778, 0.993] n=4 ✓  | –                                           | -0.363 [-0.803, 0.066] n=4                |
| T1-MK2   | 0.503 [0.084, 0.997] n=4 ✓  | 0.782 [0.464, 1.214] n=4 ✓  | 0.427 [0.052, 0.802] n=4 ✓  | 1.187 [1.084, 1.259] n=4 ✓  | 0.121 [-0.744, 0.908] n=4   | 0.815 [0.483, 0.984] n=4 ✓  | –                                           | 0.069 [-0.682, 0.522] n=4                 |
| all      | 0.651 [0.507, 0.805] n=16 ✓ | 0.943 [0.760, 1.153] n=14 ✓ | 0.391 [0.245, 0.537] n=16 ✓ | 1.063 [1.012, 1.119] n=16 ✓ | 0.551 [0.276, 0.783] n=16 ✓ | 0.923 [0.824, 0.986] n=16 ✓ | –                                           | -0.050 [-0.288, 0.146] n=16               |

### Leave one scenario out (ρ refit on the other scenarios)

| held out | ρ      | reference − idle (T)        | reference − idle (V)        | reference − wrong-ammo (V)  |
| -------- | ------ | --------------------------- | --------------------------- | --------------------------- |
| T0       | 0.0279 | 0.672 [0.611, 0.734] n=12 ✓ | 0.753 [0.681, 0.826] n=9 ✓  | 0.690 [0.618, 0.763] n=12 ✓ |
| T0-wide  | 0.0279 | 0.704 [0.663, 0.747] n=12 ✓ | 0.813 [0.730, 0.896] n=7 ✓  | 0.747 [0.669, 0.823] n=12 ✓ |
| T1       | 0.0283 | 0.611 [0.420, 0.810] n=12 ✓ | 1.067 [0.851, 1.289] n=12 ✓ | 0.408 [0.080, 0.756] n=12 ✓ |
| T1-MK2   | 0.0244 | 0.429 [0.245, 0.644] n=12 ✓ | 0.659 [0.500, 0.850] n=12 ✓ | -0.159 [-0.447, 0.165] n=12 |

### Predictive validity

Spearman over windows (all crews) of window T with a kill in the next 60 s, against the persistence baseline: the incapacitation the enemy took in the previous window.

| scenario | windows | ρ_s(T, kill60) | ρ_s(persistence, kill60) | ρ_s(O, kill60) |
| -------- | ------- | -------------- | ------------------------ | -------------- |
| T0       | 321     | 0.516          | 0.320                    | 0.219          |
| T0-wide  | 318     | 0.561          | 0.411                    | 0.329          |
| T1       | 457     | 0.211          | -0.117                   | 0.177          |
| T1-MK2   | 391     | 0.326          | -0.129                   | 0.280          |
| all      | 1487    | 0.394          | 0.010                    | 0.273          |
