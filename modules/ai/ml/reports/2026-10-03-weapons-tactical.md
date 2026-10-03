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

## Round 3

### W-multi with a designated target

The scenario now starts the GVTS locked on the threat, as the captain's designation (`964e85ef`). EVIDENCE:

- The reference crew holds the designated lock 0.555 of fighting time. Idle holds it 0.773 and spray-fire 0.761.
- Spray-fire still beats the reference on T: 0.560 against 0.369. Pooled per-scenario T: torpedo-reference 0.509.
- The lock decays even for idle, which never presses a key. So the game drops it, and the reference target
  cycling then re-locks the nearest ship. That nearest ship is the decoy or the ally.
- INFERENCE: the reference `target` rule ("next" whenever no lock is held) sends it to the decoy. Fixing it is a
  change to the reference policy, not to the score. Not done.

### Fair torpedo crew

- The armorer now fires one missile every 10 s and unloads the tubes once the magazine is empty.
- The engineer shuts the tubes at ≤ 50% store.
- All 72 torpedo-reference runs were re-run at `964e85ef`. The old runs are in `weapons-score-superseded/`.
- Outcomes: T1 6/12 (reference 9/12), T1-MK2 10/12 (reference 6/12), W-multi 8/12 (reference 5/12), T0 and T0-wide
  12/12.
- EVIDENCE: in T1 the GVTS is still energy-starved in 6 of 12 seeds. Starvation now follows reactor damage, not tube
  drain:
    - Reactor defects: 17 by t ≈ 60 s for the torpedo crew against 2 and 11 for the reference (seeds 4 and 10).
    - Starvation starts at t ≈ 68–92 s.
- INFERENCE: the missile fight draws more return fire in T1. Not resolved.
- torpedo > reference on T while outranged: 0.043 [0.004, 0.077] ✓ pooled, held out 0.048 [0.000, 0.095].

### Hit geometry measured

`ml/blast_geometry.py` reads the `damage` and `defect` events: T0, T1 and T1-MK2, crews reference, spray-fire and
wrong-ammo. Single-hit ticks only. Fit on seeds 1–8 and frozen; seeds 9–12 held out.

| quantity                                   | rules         | fit 1–8       | held-out 9–12 |
| ------------------------------------------ | ------------- | ------------- | ------------- |
| plates a HiExp shell blast erodes          | 2             | 4.68          | 4.16          |
| capsule odds of a HiExp blast, plates gone | 0.5           | 0.90          | 0.99          |
| Frag defects per hit, gun / thrusters      | 0.025 / 0.13  | 0.026 / 0.12  | 0.027 / 0.11  |
| HiExp defects per hit, gun / thrusters     | 0.006 / 0.033 | 0.005 / 0.035 | 0.005 / 0.041 |

- Plates and capsule odds disagreed with the rules and were replaced by the measured values.
- The surface rules agree with measurement and are kept.
- No ArmPen round was fired, so impact geometry stays rule-read.
- With the new values, wrong-ammo's graded shortfall is 0.95–0.97. The reference crew's is 0.000.

### T1-MK2: wrong-ammo on V

EVIDENCE:

- End state of the enemy: wrong-ammo kill 0.00 and cap 0.68; the reference kill 0.85 and cap 0.69.
- Frag erodes no plates but disarms as much as HiExp does.
- T separates the crews: 0.144 against 0.388.
- V does not: 0.507 against 0.549. Wrong-ammo's opportunity O is half the reference's (0.290 against 0.606), along
  with its lock (0.354 against 0.731).

INFERENCE: this is a scoring property, not Frag being competitive. V divides out the lost opportunity, and the
disarm credit Frag earns per opportunity is close to the reference's mixed kill and disarm credit. The ordering is
carried by T and by K_w (dominated 0.965). A V that only credits kill progress would separate them, but I didn't
change the definition.

## Result after round 3 (pooled, all seeds; held-out agrees in sign)

- reference > idle, T: 0.429 [0.358, 0.503] ✓
- reference > idle, V: 0.676 ✓
- reference > spray-fire, K_w: 0.367 ✓
- reference > wrong-ammo, K_w: 1.023 ✓
- reference > wrong-ammo, V: 0.341 ✓ pooled; T1-MK2 not separated (see above)
- reference > no-lock, lock: 0.916 ✓
- torpedo > reference, T outranged: 0.043 [0.004, 0.077] ✓

## Full validator output

runs 432; scenarios T0, T0-wide, T1, T1-MK2, W-multi, W-outranged; fit seeds 1,2,3,4,5,6,7,8; held-out 9,10,11,12

weights: `{"phi":1,"lambdaFriendly":2,"windowSeconds":45,"rho":0.027877493096596224}` (ρ fitted on reference runs of the fit seeds: 95th percentile of windowed incapacitation rate per unit gun)

### Per-crew means

| scenario    | crew              | kills | T     | O     | V     | Kw     | lock  | lockThreat | lockDesignated | friendly | clipped | nosol | dominated | T_outranged | T_inrange | rounds |
| ----------- | ----------------- | ----- | ----- | ----- | ----- | ------ | ----- | ---------- | -------------- | -------- | ------- | ----- | --------- | ----------- | --------- | ------ |
| T0          | reference         | 12/12 | 0.654 | 0.880 | 0.742 | 1.471  | 0.987 | 1.000      | 0.987          | 0.000    | 0.208   | 0.022 | 0.000     | –           | 0.654     | 246    |
| T0          | idle              | 0/12  | 0.000 | 0.482 | 0.000 | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| T0          | spray-fire        | 11/12 | 0.630 | 0.747 | 0.804 | 1.078  | 0.853 | 1.000      | 0.853          | 0.000    | 0.375   | 0.348 | 0.000     | –           | 0.630     | 710    |
| T0          | wrong-ammo        | 0/12  | 0.072 | 0.740 | 0.096 | 0.508  | 0.997 | 1.000      | 0.997          | 0.000    | 0.000   | 0.008 | 0.982     | –           | 0.072     | 607    |
| T0          | no-lock           | 0/12  | 0.005 | 0.322 | 0.222 | 0.472  | 0.000 | 0.000      | 0.000          | 0.000    | 0.024   | 0.308 | 0.000     | 0.000       | 0.030     | 13     |
| T0          | torpedo-reference | 12/12 | 0.636 | 0.890 | 0.717 | 1.461  | 0.985 | 1.000      | 0.985          | 0.000    | 0.167   | 0.032 | 0.000     | –           | 0.636     | 220    |
| T0-wide     | reference         | 12/12 | 0.675 | 0.884 | 0.767 | 1.478  | 0.987 | 1.000      | 0.987          | 0.000    | 0.250   | 0.015 | 0.000     | 0.626       | 0.696     | 241    |
| T0-wide     | idle              | 0/12  | 0.000 | 0.292 | 0.000 | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T0-wide     | spray-fire        | 11/12 | 0.715 | 0.716 | 0.893 | 1.119  | 0.892 | 1.000      | 0.892          | 0.000    | 0.530   | 0.327 | 0.000     | 0.543       | 0.714     | 649    |
| T0-wide     | wrong-ammo        | 0/12  | 0.057 | 0.735 | 0.078 | 0.506  | 0.997 | 1.000      | 0.997          | 0.000    | 0.000   | 0.016 | 0.977     | 0.067       | 0.056     | 602    |
| T0-wide     | no-lock           | 0/12  | 0.003 | 0.211 | 0.092 | 0.321  | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.226 | 0.000     | 0.000       | 0.010     | 9      |
| T0-wide     | torpedo-reference | 12/12 | 0.681 | 0.886 | 0.769 | 1.460  | 0.988 | 1.000      | 0.988          | 0.000    | 0.333   | 0.033 | 0.000     | 0.553       | 0.694     | 237    |
| T1          | reference         | 9/12  | 0.486 | 0.717 | 0.658 | 1.029  | 0.884 | 1.000      | 0.884          | 0.000    | 0.362   | 0.413 | 0.000     | –           | 0.486     | 659    |
| T1          | idle              | 0/12  | 0.000 | 0.234 | 0.000 | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| T1          | spray-fire        | 2/12  | 0.267 | 0.359 | 0.777 | 0.540  | 0.495 | 1.000      | 0.495          | 0.000    | 0.305   | 0.708 | 0.000     | –           | 0.267     | 1143   |
| T1          | wrong-ammo        | 0/12  | 0.168 | 0.459 | 0.354 | -0.031 | 0.602 | 1.000      | 0.602          | 0.000    | 0.131   | 0.351 | 0.982     | –           | 0.168     | 653    |
| T1          | no-lock           | 0/12  | 0.053 | 0.163 | 0.364 | 0.443  | 0.000 | 0.000      | 0.000          | 0.000    | 0.060   | 0.557 | 0.000     | –           | 0.053     | 288    |
| T1          | torpedo-reference | 6/12  | 0.400 | 0.654 | 0.600 | 1.006  | 0.736 | 1.000      | 0.736          | 0.000    | 0.088   | 0.362 | 0.000     | –           | 0.400     | 437    |
| T1-MK2      | reference         | 6/12  | 0.388 | 0.606 | 0.549 | 1.237  | 0.731 | 1.000      | 0.731          | 0.000    | 0.190   | 0.129 | 0.000     | 0.000       | 0.390     | 299    |
| T1-MK2      | idle              | 0/12  | 0.000 | 0.164 | 0.000 | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | 0.000     | 0      |
| T1-MK2      | spray-fire        | 7/12  | 0.509 | 0.518 | 0.907 | 0.874  | 0.653 | 1.000      | 0.653          | 0.000    | 0.405   | 0.453 | 0.000     | –           | 0.509     | 734    |
| T1-MK2      | wrong-ammo        | 0/12  | 0.144 | 0.290 | 0.507 | 0.108  | 0.354 | 1.000      | 0.354          | 0.000    | 0.167   | 0.104 | 0.965     | 0.000       | 0.149     | 325    |
| T1-MK2      | no-lock           | 0/12  | 0.039 | 0.135 | 0.294 | 0.477  | 0.000 | 0.000      | 0.000          | 0.000    | 0.048   | 0.523 | 0.000     | 0.000       | 0.041     | 190    |
| T1-MK2      | torpedo-reference | 10/12 | 0.522 | 0.779 | 0.649 | 1.314  | 0.895 | 1.000      | 0.895          | 0.000    | 0.167   | 0.133 | 0.000     | –           | 0.522     | 314    |
| W-multi     | reference         | 5/12  | 0.369 | 0.489 | 0.728 | 1.117  | 0.911 | 0.604      | 0.555          | 0.005    | 0.217   | 0.328 | 0.000     | 0.000       | 0.383     | 426    |
| W-multi     | idle              | 0/12  | 0.000 | 0.814 | 0.000 | –      | 0.773 | 1.000      | 0.773          | 0.000    | 0.000   | 0.000 | 0.000     | –           | 0.000     | 0      |
| W-multi     | spray-fire        | 7/12  | 0.560 | 0.665 | 0.889 | 0.889  | 0.901 | 0.823      | 0.761          | 0.007    | 0.498   | 0.548 | 0.000     | –           | 0.560     | 945    |
| W-multi     | wrong-ammo        | 0/12  | 0.142 | 0.377 | 0.364 | 0.128  | 0.729 | 0.750      | 0.528          | 0.010    | 0.119   | 0.243 | 0.972     | –           | 0.142     | 597    |
| W-multi     | no-lock           | 0/12  | 0.011 | 0.062 | 0.125 | 0.208  | 0.003 | 1.000      | 0.003          | 0.000    | 0.024   | 0.794 | 0.000     | –           | 0.011     | 79     |
| W-multi     | torpedo-reference | 8/12  | 0.509 | 0.725 | 0.690 | 1.169  | 0.943 | 0.833      | 0.793          | 0.008    | 0.140   | 0.286 | 0.000     | 0.000       | 0.515     | 392    |
| W-outranged | reference         | 0/12  | 0.000 | 0.006 | 0.000 | –      | 0.997 | 1.000      | 0.997          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | idle              | 0/12  | 0.000 | 0.000 | –     | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | spray-fire        | 0/12  | 0.000 | 0.006 | 0.000 | 0.302  | 0.604 | 1.000      | 0.604          | 0.000    | 0.000   | 1.000 | 0.000     | 0.000       | –         | 1600   |
| W-outranged | wrong-ammo        | 0/12  | 0.000 | 0.006 | 0.000 | –      | 0.997 | 1.000      | 0.997          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | no-lock           | 0/12  | 0.000 | 0.000 | –     | –      | 0.000 | 0.000      | 0.000          | 0.000    | 0.000   | 0.000 | 0.000     | 0.000       | –         | 0      |
| W-outranged | torpedo-reference | 0/12  | 0.062 | 0.997 | 0.062 | 1.498  | 0.997 | 1.000      | 0.997          | 0.000    | 0.000   | 0.000 | 0.000     | 0.062       | –         | 12     |

### All seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario    | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T) | torpedo-reference − reference (T_inrange) |
| ----------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | --------------------------------- | ----------------------------------------- |
| T0          | 0.654 [0.600, 0.711] n=12 ✓ | 0.717 [0.654, 0.779] n=9 ✓  | 0.393 [0.264, 0.526] n=12 ✓ | 0.963 [0.946, 0.975] n=12 ✓ | 0.645 [0.586, 0.708] n=12 ✓ | 0.987 [0.985, 0.989] n=12 ✓ | –                                           | -0.018 [-0.125, 0.074] n=12       | -0.018 [-0.125, 0.074] n=12               |
| T0-wide     | 0.675 [0.645, 0.706] n=12 ✓ | 0.769 [0.709, 0.825] n=8 ✓  | 0.359 [0.209, 0.529] n=12 ✓ | 0.973 [0.967, 0.979] n=12 ✓ | 0.689 [0.631, 0.745] n=12 ✓ | 0.987 [0.986, 0.989] n=12 ✓ | -0.073 [-0.146, 0.000] n=2                  | 0.006 [-0.055, 0.049] n=12        | -0.002 [-0.087, 0.053] n=12               |
| T1          | 0.486 [0.364, 0.614] n=12 ✓ | 0.658 [0.550, 0.775] n=12 ✓ | 0.489 [0.310, 0.675] n=12 ✓ | 1.061 [1.001, 1.124] n=12 ✓ | 0.304 [0.149, 0.469] n=12 ✓ | 0.884 [0.774, 0.970] n=12 ✓ | –                                           | -0.087 [-0.283, 0.110] n=12       | -0.087 [-0.283, 0.110] n=12               |
| T1-MK2      | 0.388 [0.221, 0.575] n=12 ✓ | 0.549 [0.423, 0.696] n=12 ✓ | 0.363 [0.139, 0.586] n=12 ✓ | 1.129 [1.033, 1.219] n=12 ✓ | 0.042 [-0.113, 0.230] n=12  | 0.731 [0.558, 0.897] n=12 ✓ | –                                           | 0.134 [-0.111, 0.373] n=12        | 0.132 [-0.112, 0.371] n=12                |
| W-multi     | 0.369 [0.222, 0.522] n=12 ✓ | 0.728 [0.621, 0.822] n=12 ✓ | 0.228 [0.067, 0.414] n=12 ✓ | 0.989 [0.878, 1.099] n=12 ✓ | 0.364 [0.203, 0.542] n=12 ✓ | 0.907 [0.806, 0.980] n=12 ✓ | –                                           | 0.140 [-0.129, 0.382] n=12        | 0.132 [-0.123, 0.358] n=12                |
| W-outranged | 0.000 [0.000, 0.000] n=12   | –                           | –                           | –                           | 0.000 [0.000, 0.000] n=12   | 0.997 [0.997, 0.997] n=12 ✓ | 0.062 [0.034, 0.090] n=12 ✓                 | 0.062 [0.034, 0.090] n=12 ✓       | –                                         |
| all         | 0.429 [0.358, 0.503] n=72 ✓ | 0.676 [0.625, 0.728] n=53 ✓ | 0.367 [0.288, 0.452] n=60 ✓ | 1.023 [0.986, 1.058] n=60 ✓ | 0.341 [0.261, 0.423] n=72 ✓ | 0.916 [0.869, 0.954] n=72 ✓ | 0.043 [0.004, 0.077] n=14 ✓                 | 0.040 [-0.030, 0.112] n=72        | 0.032 [-0.052, 0.112] n=60                |

### Held-out seeds

Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.

| scenario    | reference − idle (T)        | reference − idle (V)        | reference − spray-fire (Kw) | reference − wrong-ammo (Kw) | reference − wrong-ammo (V)  | reference − no-lock (lock)  | torpedo-reference − reference (T_outranged) | torpedo-reference − reference (T) | torpedo-reference − reference (T_inrange) |
| ----------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ------------------------------------------- | --------------------------------- | ----------------------------------------- |
| T0          | 0.585 [0.503, 0.665] n=4 ✓  | 0.672 [0.594, 0.746] n=4 ✓  | 0.332 [0.136, 0.491] n=4 ✓  | 0.967 [0.948, 0.980] n=4 ✓  | 0.575 [0.525, 0.633] n=4 ✓  | 0.987 [0.984, 0.991] n=4 ✓  | –                                           | 0.024 [-0.236, 0.199] n=4         | 0.024 [-0.236, 0.199] n=4                 |
| T0-wide     | 0.633 [0.608, 0.663] n=4 ✓  | 0.735 [0.668, 0.801] n=2 ✓  | 0.222 [0.056, 0.444] n=4 ✓  | 0.972 [0.961, 0.986] n=4 ✓  | 0.613 [0.559, 0.698] n=4 ✓  | 0.985 [0.982, 0.988] n=4 ✓  | –                                           | 0.035 [-0.005, 0.076] n=4         | 0.035 [-0.005, 0.076] n=4                 |
| T1          | 0.617 [0.405, 0.828] n=4 ✓  | 0.788 [0.616, 0.920] n=4 ✓  | 0.583 [0.341, 0.826] n=4 ✓  | 1.065 [0.947, 1.162] n=4 ✓  | 0.576 [0.336, 0.712] n=4 ✓  | 0.906 [0.778, 0.993] n=4 ✓  | –                                           | -0.046 [-0.429, 0.364] n=4        | -0.046 [-0.429, 0.364] n=4                |
| T1-MK2      | 0.442 [0.076, 0.837] n=4 ✓  | 0.647 [0.397, 0.949] n=4 ✓  | 0.427 [0.052, 0.802] n=4 ✓  | 1.152 [1.050, 1.224] n=4 ✓  | 0.158 [-0.352, 0.672] n=4   | 0.815 [0.483, 0.984] n=4 ✓  | –                                           | 0.087 [-0.511, 0.646] n=4         | 0.080 [-0.511, 0.632] n=4                 |
| W-multi     | 0.347 [0.163, 0.643] n=4 ✓  | 0.785 [0.716, 0.850] n=4 ✓  | 0.299 [0.179, 0.470] n=4 ✓  | 0.984 [0.885, 1.083] n=4 ✓  | 0.448 [0.234, 0.663] n=4 ✓  | 0.775 [0.565, 0.986] n=4 ✓  | –                                           | 0.270 [-0.254, 0.634] n=4         | 0.238 [-0.267, 0.569] n=4                 |
| W-outranged | 0.000 [0.000, 0.000] n=4    | –                           | –                           | –                           | 0.000 [0.000, 0.000] n=4    | 0.997 [0.997, 0.997] n=4 ✓  | 0.048 [0.000, 0.095] n=4                    | 0.048 [0.000, 0.095] n=4          | –                                         |
| all         | 0.437 [0.318, 0.563] n=24 ✓ | 0.724 [0.647, 0.800] n=18 ✓ | 0.373 [0.252, 0.498] n=20 ✓ | 1.028 [0.982, 1.076] n=20 ✓ | 0.395 [0.261, 0.523] n=24 ✓ | 0.911 [0.833, 0.974] n=24 ✓ | 0.048 [0.000, 0.095] n=4                    | 0.070 [-0.077, 0.226] n=24        | 0.066 [-0.114, 0.242] n=20                |

### Leave one scenario out (ρ refit on the other scenarios)

| held out    | ρ      | reference − idle (T)        | reference − idle (V)        | reference − wrong-ammo (V)  |
| ----------- | ------ | --------------------------- | --------------------------- | --------------------------- |
| T0          | 0.0279 | 0.654 [0.600, 0.711] n=12 ✓ | 0.717 [0.654, 0.779] n=9 ✓  | 0.645 [0.586, 0.708] n=12 ✓ |
| T0-wide     | 0.0279 | 0.675 [0.645, 0.706] n=12 ✓ | 0.769 [0.709, 0.825] n=8 ✓  | 0.689 [0.631, 0.745] n=12 ✓ |
| T1          | 0.0279 | 0.486 [0.364, 0.614] n=12 ✓ | 0.658 [0.550, 0.775] n=12 ✓ | 0.304 [0.149, 0.469] n=12 ✓ |
| T1-MK2      | 0.0272 | 0.388 [0.221, 0.575] n=12 ✓ | 0.549 [0.423, 0.696] n=12 ✓ | 0.042 [-0.113, 0.230] n=12  |
| W-multi     | 0.0272 | 0.369 [0.222, 0.522] n=12 ✓ | 0.728 [0.621, 0.822] n=12 ✓ | 0.364 [0.203, 0.542] n=12 ✓ |
| W-outranged | 0.0283 | 0.000 [0.000, 0.000] n=12   | –                           | 0.000 [0.000, 0.000] n=12   |

### Predictive validity

Spearman over windows (all crews) of window T with a kill in the next 60 s, against the persistence baseline: the incapacitation the enemy took in the previous window.

| scenario    | windows | ρ_s(T, kill60) | ρ_s(persistence, kill60) | ρ_s(O, kill60) |
| ----------- | ------- | -------------- | ------------------------ | -------------- |
| T0          | 316     | 0.513          | 0.260                    | 0.241          |
| T0-wide     | 319     | 0.558          | 0.435                    | 0.340          |
| T1          | 428     | 0.253          | -0.111                   | 0.202          |
| T1-MK2      | 379     | 0.292          | -0.182                   | 0.272          |
| W-multi     | 409     | 0.370          | -0.010                   | 0.193          |
| W-outranged | 504     | –              | –                        | –              |
| all         | 2355    | 0.388          | 0.054                    | 0.235          |
