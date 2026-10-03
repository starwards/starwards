# Weapons station and tactical score, phase 1 validation, 2026-10-03

Scores: `src/scoring/weapons-kpi.ts`. Validator: `npm run score:weapons`. Runs: 432 headless, 12 seeds × 6 crews per
scenario, all with the reference helms, made with `npm run score:weapons-runs`. T0, T0-wide, T1 and T1-MK2 were recorded
at `26e162b0`; W-multi and W-outranged at `465503bc`. Archived in `training-archive/2026-10-03/weapons-score/`. Scripted
seats only, Jev spend $0. No snapshot model was trained.

## Recording extensions

- `shot` for every projectile: `{shipId, ammo, warhead, targetId, x, y, vx, vy, ttl}`. `targetId` is the shooter's
  weapons target for an unguided round.
- `projectile_end` with `{reason}`:
    - `impact`: a recorded hit carries the projectile's id.
    - `detonate`: a new blast from the same shooter appears within 200 m, in this tick or the next.
    - `shotDown`: the projectile's health reached 0.
    - `expire`: anything else.
- `damage` for every weapon hit: `{sourceId, shooterId, damageType, delivery, amount, plateLoss, defects}`, from
  `DamageManager.onDamage`.

## Scenarios (calibration only)

- **W-multi**: three ships besides the GVTS.
    - The threat: a dragonfly-MK2 attacking the GVTS from 4–7 km.
    - A decoy: a PLAY_DEAD dragonfly-MK1 with an empty magazine, so its threat θ is 0.
    - An ally: a PLAY_DEAD dragonfly-MK1 of the GVTS faction, 600 m from where the threat starts, in the line of fire.
- **W-outranged**: a dragonfly-MK1 starts 10–14 km away and flees at the GVTS top speed, so the gun never comes in
  range.

## Design

- **Incapacitation** `I = 1 − (1 − kill)·cap`.
    - Kill progress: `kill = ½·armor lost + ½·capsule lost`, and 1 once destroyed.
    - Capability: `cap = gun·(½ + ½·mobility)`. A system that is broken or energy-starved counts as down.
- **Threat** `θ = dps·P_reach·ammoFrac·cap`, normalised over the living enemies.
- **Credit** `C = Σ θ̃·(1 + φ·held≥5 s)·ΔI⁺·ours − λ_ff·friendly`.
    - `ours` is our share of the recorded hits between frames.
    - `C_max = (1+φ)·Σ θ̃·min(1 − I₀, ρ·gun·W)`, with W = 45 s, φ = 1 and λ_ff = 2.
    - ρ = 0.0279/s is fitted on reference runs of seeds 1–8. Leave-one-scenario-out refits give 0.027–0.028.
- **Opportunity O**: the threat-weighted share of the 1 s intervals that had a firing solution. An interval counts
  if either:
    - at the frame, a shell along the gun bearing reaches the enemy, allowing 2σ of gun spread (σ = 1°); or
    - any round fired inside the interval reaches the enemy's path, timed from its `shot` event.
- **Tactical score** `T = min(C, O·C_max)/C_max`, so conversion `V = T/O ≤ 1` by construction.
- **Weapons station score** `K_w = 1 − nosol − dominated − 2·friendly + ½·lockUptime`, in rates per round.
    - K_w is **undefined when no round was fired**.
    - `dominated` is graded: each round's shortfall against the best shell in the magazine is `1 − value/best`.
    - A round's value is `ΔI = cap·Δkill + (1 − kill)·Δcap`. All of its constants are rule values: plate erosion from
      `armor-models.ts`, the capsule defect step 0.1, the surface factor 0.05, and the gun and thruster defect losses
      from `damage-manager.ts`. None of them is fitted.
- **Helms residual** `K_h`, sketch only: −(threat-weighted time inside enemy reach while O = 0) + standoff adherence.

## Result

Pooled Δ over all seeds. Held-out seeds 9–12 agree in sign throughout.

| required ordering                       | pooled Δ [95% CI]      | per scenario                                                   |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| reference > idle on T                   | 0.428 [0.358, 0.502] ✓ | ✓ in all five where any crew fires in range; W-outranged 0 = 0 |
| reference > idle on V                   | 0.672 [0.619, 0.726] ✓ | ✓ in all five                                                  |
| reference > spray-fire on K_w           | 0.354 [0.269, 0.443] ✓ | ✓ in all five                                                  |
| reference > wrong-ammo on K_w           | 0.910 [0.868, 0.950] ✓ | ✓ in all five                                                  |
| reference > wrong-ammo on V             | 0.340 [0.261, 0.423] ✓ | **T1-MK2 0.042 [−0.113, 0.230]: not separated**                |
| reference > no-lock on lock uptime      | 0.915 [0.868, 0.953] ✓ | ✓ in all six                                                   |
| torpedo > reference on T, gun outranged | 0.063 [0.039, 0.091] ✓ | W-outranged 0.057 [0.036, 0.075] ✓ (held-out ✓)                |
| torpedo vs reference on T, in range     | 0.057 [−0.024, 0.133]  | not separated, as expected                                     |

- Idle no longer ties or beats the reference on any report: its K_w is undefined, and its T and V are 0.
- Spearman of window T with kill60 is 0.391 pooled. The persistence baseline scores 0.080, and O alone 0.250.

## Torpedo crew in T1: 6/12 kills against the reference's 9/12

The evidence comes from the sidecars and the scorer caches, seeds 4, 10 and 1:

- The armorer fires all 12 HiExp missiles between t = 2.0 s and 12.2 s, every seed.
- After that, the `tubes-powered` engineer keeps the empty tubes at normal power.
- The GVTS is energy-starved in 111, 69 and 83 of 302 frames, starting at t ≈ 90–110 s. The reference crew is starved
  in 0 frames.
- From then on, shell fire collapses. On seed 4 it falls from 94 rounds in t = 60–90 s to 0 after t = 120 s, while the
  target sits at I = 0.98.
- The torpedo crew also takes far more hits: 293 against 49 on seed 4.

INFERENCE: the drain comes from tube power with an empty magazine, which starves the chain gun before the kill. The
cause is the scripted torpedo crew (all missiles at once, tubes never shut down), not the score. The earlier gun
capability ignored `energyStarved`; it now counts a starved system as down.

## Caveats

- EVIDENCE: the O·C_max cap binds in 13–53% of windows, highest for spray-fire. V ≤ 1 holds by construction, but O
  still misses some reach. INFERENCE: blast knock-back and late fuzes are not modelled.
- EVIDENCE: W-multi works as designed.
    - The reference crew spends 60% of its lock time on the top threat. The other crews spend 75–88%, because the
      reference target cycling locks the decoy or the ally first.
    - Friendly-hit share is 0.005–0.010.
    - Spray-fire scores higher T than the reference (0.557 against 0.365). INFERENCE: the reference helms and weapons
      lose time on the wrong target.
- EVIDENCE: W-outranged has no kills in any crew. The torpedo crew's 12 missiles reach T = 0.057. Spray-fire fires
  1,600 rounds out of range: nosol 1.0, K_w −0.026.
- The constants of the round-1 ammo value were tuned after viewing validation data. Round 2 replaces them with rule
  values and fits nothing beyond ρ, which comes from the fit seeds; the tables above report held-out seeds separately.
- W-multi runs end when the threat dies, so the decoy is never resolved.

## Full validator output

runs 432; scenarios T0, T0-wide, T1, T1-MK2, W-multi, W-outranged; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

weights: `{"phi":1,"lambdaFriendly":2,"windowSeconds":45,"rho":0.027877493096596224}` (ρ fitted on reference runs of the fit seeds: 95th percentile of windowed incapacitation rate per unit gun)

### Per-crew means

| scenario    | crew              | kills | T     | O     | V     | Kw     | lock  | lockThreat | friendly | clipped | nosol | dominated | T_outranged | T_inrange | rounds |
| ----------- | ----------------- | ----- | ----- | ----- | ----- | ------ | ----- | ---------- | -------- | ------- | ----- | --------- | ----------- | --------- | ------ |
| T0          | reference         | 12/12 | 0.654 | 0.880 | 0.742 | 1.397  | 0.987 | 1.000      | 0.000    | 0.208   | 0.022 | 0.074     | –           | 0.654     | 246    |
| T0          | idle              | 0/12  | 0.000 | 0.482 | 0.000 | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| T0          | spray-fire        | 11/12 | 0.630 | 0.747 | 0.804 | 0.998  | 0.853 | 1.000      | 0.000    | 0.375   | 0.348 | 0.081     | –           | 0.630     | 710    |
| T0          | wrong-ammo        | 0/12  | 0.072 | 0.740 | 0.096 | 0.518  | 0.997 | 1.000      | 0.000    | 0.000   | 0.008 | 0.973     | –           | 0.072     | 607    |
| T0          | no-lock           | 0/12  | 0.005 | 0.322 | 0.222 | 0.146  | 0.000 | 0.000      | 0.000    | 0.024   | 0.308 | 0.190     | 0.000       | 0.030     | 13     |
| T0          | torpedo-reference | 12/12 | 0.616 | 0.803 | 0.777 | 1.364  | 0.988 | 1.000      | 0.000    | 0.375   | 0.079 | 0.051     | –           | 0.616     | 239    |
| T0-wide     | reference         | 12/12 | 0.675 | 0.884 | 0.767 | 1.386  | 0.987 | 1.000      | 0.000    | 0.250   | 0.015 | 0.092     | 0.626       | 0.696     | 241    |
| T0-wide     | idle              | 0/12  | 0.000 | 0.292 | 0.000 | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T0-wide     | spray-fire        | 11/12 | 0.715 | 0.716 | 0.893 | 1.042  | 0.892 | 1.000      | 0.000    | 0.530   | 0.327 | 0.076     | 0.543       | 0.714     | 649    |
| T0-wide     | wrong-ammo        | 0/12  | 0.057 | 0.735 | 0.078 | 0.519  | 0.997 | 1.000      | 0.000    | 0.000   | 0.016 | 0.964     | 0.067       | 0.056     | 602    |
| T0-wide     | no-lock           | 0/12  | 0.003 | 0.211 | 0.092 | -0.002 | 0.000 | 0.000      | 0.000    | 0.000   | 0.226 | 0.108     | 0.000       | 0.010     | 9      |
| T0-wide     | torpedo-reference | 12/12 | 0.692 | 0.838 | 0.831 | 1.352  | 0.987 | 1.000      | 0.000    | 0.333   | 0.054 | 0.087     | 0.726       | 0.707     | 213    |
| T1          | reference         | 9/12  | 0.486 | 0.717 | 0.658 | 0.971  | 0.884 | 1.000      | 0.000    | 0.362   | 0.413 | 0.059     | –           | 0.486     | 659    |
| T1          | idle              | 0/12  | 0.000 | 0.234 | 0.000 | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| T1          | spray-fire        | 2/12  | 0.267 | 0.359 | 0.777 | 0.477  | 0.495 | 1.000      | 0.000    | 0.305   | 0.708 | 0.063     | –           | 0.267     | 1143   |
| T1          | wrong-ammo        | 0/12  | 0.168 | 0.459 | 0.354 | -0.021 | 0.602 | 1.000      | 0.000    | 0.131   | 0.351 | 0.971     | –           | 0.168     | 653    |
| T1          | no-lock           | 0/12  | 0.053 | 0.163 | 0.364 | 0.260  | 0.000 | 0.000      | 0.000    | 0.060   | 0.557 | 0.183     | –           | 0.053     | 288    |
| T1          | torpedo-reference | 6/12  | 0.418 | 0.762 | 0.529 | 1.006  | 0.740 | 1.000      | 0.000    | 0.168   | 0.325 | 0.039     | 0.000       | 0.420     | 502    |
| T1-MK2      | reference         | 6/12  | 0.388 | 0.606 | 0.549 | 1.104  | 0.731 | 1.000      | 0.000    | 0.190   | 0.129 | 0.133     | 0.000       | 0.390     | 299    |
| T1-MK2      | idle              | 0/12  | 0.000 | 0.164 | 0.000 | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T1-MK2      | spray-fire        | 7/12  | 0.509 | 0.518 | 0.907 | 0.787  | 0.653 | 1.000      | 0.000    | 0.405   | 0.453 | 0.087     | –           | 0.509     | 734    |
| T1-MK2      | wrong-ammo        | 0/12  | 0.144 | 0.290 | 0.507 | 0.128  | 0.354 | 1.000      | 0.000    | 0.167   | 0.104 | 0.945     | 0.000       | 0.149     | 325    |
| T1-MK2      | no-lock           | 0/12  | 0.039 | 0.135 | 0.294 | 0.215  | 0.000 | 0.000      | 0.000    | 0.048   | 0.523 | 0.263     | 0.000       | 0.041     | 190    |
| T1-MK2      | torpedo-reference | 9/12  | 0.556 | 0.838 | 0.641 | 1.162  | 0.849 | 1.000      | 0.000    | 0.273   | 0.186 | 0.077     | –           | 0.556     | 307    |
| W-multi     | reference         | 5/12  | 0.365 | 0.484 | 0.726 | 0.977  | 0.904 | 0.602      | 0.005    | 0.217   | 0.328 | 0.137     | 0.000       | 0.378     | 426    |
| W-multi     | idle              | 0/12  | 0.000 | 0.065 | 0.000 | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| W-multi     | spray-fire        | 7/12  | 0.557 | 0.629 | 0.925 | 0.761  | 0.857 | 0.793      | 0.007    | 0.512   | 0.542 | 0.112     | –           | 0.557     | 892    |
| W-multi     | wrong-ammo        | 0/12  | 0.142 | 0.375 | 0.365 | 0.142  | 0.725 | 0.749      | 0.010    | 0.119   | 0.243 | 0.957     | –           | 0.142     | 597    |
| W-multi     | no-lock           | 0/12  | 0.011 | 0.060 | 0.137 | -0.093 | 0.000 | 0.000      | 0.000    | 0.024   | 0.794 | 0.299     | –           | 0.011     | 79     |
| W-multi     | torpedo-reference | 10/12 | 0.590 | 0.862 | 0.663 | 1.120  | 0.972 | 0.877      | 0.009    | 0.206   | 0.286 | 0.062     | –           | 0.590     | 404    |
| W-outranged | reference         | 0/12  | 0.000 | 0.006 | 0.000 | –      | 0.997 | 1.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | idle              | 0/12  | 0.000 | 0.000 | –     | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | spray-fire        | 0/12  | 0.000 | 0.006 | 0.000 | -0.026 | 0.604 | 1.000      | 0.000    | 0.000   | 1.000 | 0.328     | 0.000       | –         | 1600   |
| W-outranged | wrong-ammo        | 0/12  | 0.000 | 0.006 | 0.000 | –      | 0.997 | 1.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | no-lock           | 0/12  | 0.000 | 0.000 | –     | –      | 0.000 | 0.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | torpedo-reference | 0/12  | 0.057 | 0.997 | 0.057 | 1.498  | 0.997 | 1.000      | 0.000    | 0.000   | 0.000 | 0.000     | 0.057       | –         | 12     |

### All seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario    | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T) | torpedo-reference − reference (T_inrange) |
| ----------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | --------------------------------- | ----------------------------------------- |
| T0          | 0.654 [0.600, 0.711] n=12 ✓ | 0.717 [0.654, 0.779] n=9 ✓  | 0.400 [0.275, 0.524] n=12 ✓ | 0.879 [0.844, 0.911] n=12 ✓ | 0.645 [0.586, 0.708] n=12 ✓ | 0.987 [0.985, 0.989] n=12 ✓ | –                                           | -0.037 [-0.101, 0.034] n=12       | -0.037 [-0.101, 0.034] n=12               |
| T0-wide     | 0.675 [0.645, 0.706] n=12 ✓ | 0.769 [0.709, 0.825] n=8 ✓  | 0.344 [0.197, 0.496] n=12 ✓ | 0.868 [0.842, 0.892] n=12 ✓ | 0.689 [0.631, 0.745] n=12 ✓ | 0.987 [0.986, 0.989] n=12 ✓ | 0.100 [0.001, 0.200] n=2 ✓                  | 0.017 [-0.009, 0.051] n=12        | 0.011 [-0.012, 0.038] n=12                |
| T1          | 0.486 [0.364, 0.614] n=12 ✓ | 0.658 [0.550, 0.775] n=12 ✓ | 0.493 [0.317, 0.674] n=12 ✓ | 0.992 [0.931, 1.057] n=12 ✓ | 0.304 [0.149, 0.469] n=12 ✓ | 0.884 [0.774, 0.970] n=12 ✓ | –                                           | -0.068 [-0.242, 0.097] n=12       | -0.066 [-0.239, 0.097] n=12               |
| T1-MK2      | 0.388 [0.221, 0.575] n=12 ✓ | 0.549 [0.423, 0.696] n=12 ✓ | 0.317 [0.107, 0.524] n=12 ✓ | 0.976 [0.870, 1.081] n=12 ✓ | 0.042 [-0.113, 0.230] n=12  | 0.731 [0.558, 0.897] n=12 ✓ | –                                           | 0.169 [-0.076, 0.370] n=12        | 0.166 [-0.077, 0.367] n=12                |
| W-multi     | 0.365 [0.219, 0.517] n=12 ✓ | 0.715 [0.606, 0.810] n=11 ✓ | 0.216 [0.018, 0.442] n=12 ✓ | 0.834 [0.706, 0.963] n=12 ✓ | 0.362 [0.206, 0.536] n=12 ✓ | 0.904 [0.802, 0.975] n=12 ✓ | –                                           | 0.225 [-0.028, 0.453] n=12        | 0.212 [-0.034, 0.438] n=12                |
| W-outranged | 0.000 [0.000, 0.000] n=12   | –                           | –                           | –                           | 0.000 [0.000, 0.000] n=12   | 0.997 [0.997, 0.997] n=12 ✓ | 0.057 [0.036, 0.075] n=12 ✓                 | 0.057 [0.036, 0.075] n=12 ✓       | –                                         |
| all         | 0.428 [0.358, 0.502] n=72 ✓ | 0.672 [0.619, 0.726] n=52 ✓ | 0.354 [0.269, 0.443] n=60 ✓ | 0.910 [0.868, 0.950] n=60 ✓ | 0.340 [0.261, 0.423] n=72 ✓ | 0.915 [0.868, 0.953] n=72 ✓ | 0.063 [0.039, 0.091] n=14 ✓                 | 0.060 [-0.006, 0.128] n=72        | 0.057 [-0.024, 0.133] n=60                |

### Held-out seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario    | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T) | torpedo-reference − reference (T_inrange) |
| ----------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | --------------------------------- | ----------------------------------------- |
| T0          | 0.585 [0.503, 0.665] n=4 ✓  | 0.672 [0.594, 0.746] n=4 ✓  | 0.344 [0.163, 0.488] n=4 ✓  | 0.908 [0.887, 0.942] n=4 ✓  | 0.575 [0.525, 0.633] n=4 ✓  | 0.987 [0.984, 0.991] n=4 ✓  | –                                           | 0.052 [-0.074, 0.202] n=4         | 0.052 [-0.074, 0.202] n=4                 |
| T0-wide     | 0.633 [0.608, 0.663] n=4 ✓  | 0.735 [0.668, 0.801] n=2 ✓  | 0.189 [0.019, 0.390] n=4 ✓  | 0.870 [0.828, 0.913] n=4 ✓  | 0.613 [0.559, 0.698] n=4 ✓  | 0.985 [0.982, 0.988] n=4 ✓  | –                                           | 0.015 [-0.009, 0.043] n=4         | 0.015 [-0.009, 0.043] n=4                 |
| T1          | 0.617 [0.405, 0.828] n=4 ✓  | 0.788 [0.616, 0.920] n=4 ✓  | 0.597 [0.380, 0.826] n=4 ✓  | 0.998 [0.884, 1.091] n=4 ✓  | 0.576 [0.336, 0.712] n=4 ✓  | 0.906 [0.778, 0.993] n=4 ✓  | –                                           | -0.137 [-0.405, 0.130] n=4        | -0.137 [-0.405, 0.130] n=4                |
| T1-MK2      | 0.442 [0.076, 0.837] n=4 ✓  | 0.647 [0.397, 0.949] n=4 ✓  | 0.352 [0.113, 0.591] n=4 ✓  | 0.959 [0.824, 1.095] n=4 ✓  | 0.158 [-0.352, 0.672] n=4   | 0.815 [0.483, 0.984] n=4 ✓  | –                                           | 0.055 [-0.594, 0.546] n=4         | 0.048 [-0.594, 0.526] n=4                 |
| W-multi     | 0.336 [0.163, 0.626] n=4 ✓  | 0.769 [0.711, 0.811] n=4 ✓  | 0.305 [0.161, 0.491] n=4 ✓  | 0.819 [0.685, 0.969] n=4 ✓  | 0.430 [0.224, 0.624] n=4 ✓  | 0.772 [0.565, 0.983] n=4 ✓  | –                                           | 0.285 [-0.034, 0.525] n=4         | 0.254 [-0.034, 0.452] n=4                 |
| W-outranged | 0.000 [0.000, 0.000] n=4    | –                           | –                           | –                           | 0.000 [0.000, 0.000] n=4    | 0.997 [0.997, 0.997] n=4 ✓  | 0.058 [0.019, 0.091] n=4 ✓                  | 0.058 [0.019, 0.091] n=4 ✓        | –                                         |
| all         | 0.435 [0.315, 0.559] n=24 ✓ | 0.721 [0.643, 0.797] n=18 ✓ | 0.358 [0.248, 0.467] n=20 ✓ | 0.911 [0.858, 0.965] n=20 ✓ | 0.392 [0.258, 0.519] n=24 ✓ | 0.910 [0.833, 0.973] n=24 ✓ | 0.058 [0.019, 0.091] n=4 ✓                  | 0.055 [-0.075, 0.175] n=24        | 0.047 [-0.100, 0.181] n=20                |

### Leave one scenario out (ρ refit on the other scenarios)

| held out    | ρ      | reference − idle (T)        | reference − idle (V)        | reference − wrong-ammo (V)  |
| ----------- | ------ | --------------------------- | --------------------------- | --------------------------- |
| T0          | 0.0279 | 0.654 [0.600, 0.711] n=12 ✓ | 0.717 [0.654, 0.779] n=9 ✓  | 0.645 [0.586, 0.708] n=12 ✓ |
| T0-wide     | 0.0279 | 0.675 [0.645, 0.706] n=12 ✓ | 0.769 [0.709, 0.825] n=8 ✓  | 0.689 [0.631, 0.745] n=12 ✓ |
| T1          | 0.0279 | 0.486 [0.364, 0.614] n=12 ✓ | 0.658 [0.550, 0.775] n=12 ✓ | 0.304 [0.149, 0.469] n=12 ✓ |
| T1-MK2      | 0.0272 | 0.388 [0.221, 0.575] n=12 ✓ | 0.549 [0.423, 0.696] n=12 ✓ | 0.042 [-0.113, 0.230] n=12  |
| W-multi     | 0.0272 | 0.365 [0.219, 0.517] n=12 ✓ | 0.715 [0.606, 0.810] n=11 ✓ | 0.362 [0.206, 0.536] n=12 ✓ |
| W-outranged | 0.0283 | 0.000 [0.000, 0.000] n=12   | –                           | 0.000 [0.000, 0.000] n=12   |

### Predictive validity

Spearman over windows (all crews) of window T with a kill in the next 60 s, against the persistence baseline: the incapacitation the enemy took in the previous window.

| scenario    | windows | ρ_s(T, kill60) | ρ_s(persistence, kill60) | ρ_s(O, kill60) |
| ----------- | ------- | -------------- | ------------------------ | -------------- |
| T0          | 321     | 0.516          | 0.320                    | 0.231          |
| T0-wide     | 318     | 0.560          | 0.411                    | 0.348          |
| T1          | 443     | 0.214          | -0.120                   | 0.176          |
| T1-MK2      | 385     | 0.332          | -0.132                   | 0.279          |
| W-multi     | 393     | 0.382          | 0.076                    | 0.276          |
| W-outranged | 504     | –              | –                        | –              |
| all         | 2364    | 0.391          | 0.080                    | 0.250          |
