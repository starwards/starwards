# Curriculum lessons

What training taught, one entry per lesson, so the next level starts from it instead of rediscovering
it. Every lesson carries its evidence (brain versions, run, numbers) and a **reuse** note: what to do
by default on the next level or station. Ladder: [`ladder.json`](ladder.json); procedure: the
`starwards-brain-training` skill; results and harness: [`docs/integration/ai-crew.md`](../../../docs/integration/ai-crew.md).

A lesson without numbers says so. Seed noise at 8 seeds is about ±1 kill near 8/8 and ±2 near 6/8;
at 16 seeds about ±3 near 12/16 (the suite's regression rule, `src/suite/regression.ts`).

## Wording

### Option descriptions plus "choose this when" make Jev act

- **Evidence:** helms on T0 seeds 1–4, 120 s: v1 generic wording 0 kills; v2 exact conditions on data
  paths 0/4; v3 option descriptions only 0/4 (flies closer, almost never fires); v4 option descriptions
  plus "choose this when" clauses 3/4, median 87.7 s, $0.23.
- **Reuse:** every new control starts with a description per option and a "choose this when" clause
  per option. Never conditions on raw data paths.

### Read the display out as sentences (verbal UI)

- **Evidence:** commit `96ac1edc` (helms and weapons v5 on `view: verbal`); weapons v8 on the verbal
  view scored 133.5 on `weapons-range` against v5's 54.5 and the reference's 65, and killed T0 with a
  median of 42 s (commit `ed72f1e2`). Jev compares raw numbers poorly (bearing against heading, this
  distance against the last).
- **Reuse:** a new station or panel gets a verbal template before its brain is tuned; the brain keeps
  only the judgement.

### Skip controls that only add noise

- **Evidence:** engineer v2–v10 skip 11–12 controls, helms v2 skips 6 (brain files, `"skip": true`).
  No ablation with and without the skips was recorded.
- **Reuse:** a control that is not needed on the level is skipped, not worded; un-skip it on the level
  that needs it. Record an ablation the first time a skip is in doubt.

### Changing what old brains read is a regression risk

- **Evidence:** radar reading changes (commit `0a4ef9b0`: contact motion, slant, shell blips summarised)
  and policies receiving the raw display (`9d992e95`) change the request of every recorded version, so
  an old version's earlier numbers no longer describe it. No before/after numbers for an old version
  were recorded.
- **Reuse:** after any change to readers, templates or catalogue, rerun the suite for the
  recommended crew against its baseline before trusting older results; that is what the regression
  suite is for.

## Crew talk

### Callouts must carry what the listener cannot see

- **Evidence:** T1-lite seeds 1–16, 180 s: silent `jev-h11-w8-e6-s3` 11/16, median 36 s; complementary
  `jev-complement-h16-w15-e10-s3` 14/16, median 45 s (same run). On T0 1–8 both 8/8, median 78 s vs
  100 s. Earlier talk that repeated the listener's own display (helms "on its tail" on ~80% of
  decisions) added nothing: talking `jev-talk-h13-w12-e7-s7` 12/16 vs silent 12/16.
- **Reuse:** audit a new callout against the "what each seat shows that another does not" table
  before writing it; listen per decision (`hears` on the one control that acts on it).

### Per-decision triggers, tight `when`

- **Evidence:** helms v13 "on its tail" only on arriving behind the target: from ~80% of decisions to
  8%; a phrase said every decision is suppressed by the channel.
- **Reuse:** a callout's `when` names an event (arrival, lock, scan done), not a state.

### More talk is not more kills

- **Evidence:** far-contact callout `jev-farcall-h17-w15-e10-s8` vs recommended, T1-lite 1–8: 5/8 vs 6/8,
  signals chose `far_contact` on 608 of 909 decisions, $0.57 vs $0.42. Callouts-only crew 14/16 vs
  listening crew 12/16 at 16 seeds: within noise.
- **Reuse:** a callout earns its place on the level where the listener has an action for it: a far
  contact gives helms something to do only once its wording says to close on a ship it cannot see.

## Rungs

### Add a rung once `reference` wins it

- **Evidence:** `reference` won T1 5/16 with an engineer seat (2026-10-03) and 10/16 once the engineer
  backs the gun off while hot (2026-10-09); `idle` 0/16. T1-lite stays the rung where it wins 13/16.
- **Reuse:** a rung joins the ladder only once `reference` wins it, so a failure there says something
  about the brain; read a brain's result against the reference's, not against 16/16.

### Results at 8 seeds do not hold at 16

- **Evidence:** talking crew 8/8 on T1-lite seeds 1–8, then 12/16 on seeds 1–16; silent crew 12/16 and
  11/16 on two 16-seed runs of the same rung.
- **Reuse:** decide on 16 seeds for rungs below ~90% kill rate; quote the suite's noise bound with the
  claim.

## Station radar reach

### A seat must act on a target only another seat can see

- **Evidence:** each seat's radar is cut to its screen range (commit `10897201`: helms 5 km, tactical
  10 km); T0 and T1-lite spawn the target 2–8 km away. `reference` fell to T0 5/8 and T1-lite 0/16: on
  T0 seeds 5, 7, 8 (target 6.3–8 km) weapons held the lock, helms' radar listed nothing for 180 s and
  the ship never moved (1 shell fired per run; `rotationMode` press 5 of 2077 decisions over the eight
  seeds). The Jev crew fails the same way:
  T0 seed 7 and T1-lite seeds 5, 7, 15 (target 6.3–8 km on the weapons radar all run), helms v16
  `boost` hold 360/360 and `rotationMode` wait 360/360, `rotation` left/right about evenly while
  weapons said "need you N°" on 336 of 360 decisions. Its wording ties every press to "the console
  lists an enemy ship".
- **Fix (reference, commit `8c61521a`):** press the rotation-mode key while the helms radar is empty
  (refused without a lock, accepted once weapons holds one); in rotation TARGET with nothing on the
  radar, boost forward. T0 5/8 → 7/8, T1-lite 0/16 → 15/16.
- **Reuse:** word a control for the case where its own display is empty but another seat's state shows
  through a shared key or a callout: "press it anyway, a refused press changes nothing" and "the nose
  is on the target: fly forward until it shows". The next helms version starts from these two clauses.

### A dead target flung at top speed needs the afterburner

- **Evidence:** `reference` T0 seed 1 after the fix above: from 30 s to 180 s it sat 540–580 m behind
  a target moving at 450 m/s, its own top speed, with 822 shells fired and target health 0.84. Burning
  afterburner when the target moves faster than 0.9 of top speed and is beyond the 500 m standoff:
  T0 7/8 → 8/8 (median 86.6 s → 83.7 s). Same rule on T1-lite: 15/16 → 13/16; on seeds 4 and 14 the
  ship is at 0 of 16 armor plates when its radar empties, the lock drops, the modes fall to manual
  rotation and direct maneuvering and it drifts at 620–770 m/s (that the radar itself broke is
  inferred, not read from the recording).
- **Reuse:** a chase rule tuned on a dead target changes the flight path under fire; check it on the
  threat rung before keeping it. Open: the reference does not recover from direct maneuvering mode.

## Per-level entries

### L0–L2 — `reference` after the radar reach cut (2026-10-02)

- **Change:** `reference-policy.ts`: rotation-mode press and forward boost with an empty helms radar,
  afterburner on a flung target (commit `8c61521a`).
- **Level:** L0 T0 8/8, median 83.7 s (baseline before: 5/8, 106.9 s); L0b T0-wide 16/16, median
  99.7 s; L1 T1-lite 13/16, median 63.9 s (before: 0/16); L2 T0-constrained 4/8, median 104.6 s.
  Suite report: `training-archive/2026-10-02/suite/reference-075308/`; diagnosis runs in
  `suite/reference-diagnosis-*`.
- **Regression suite:** every L0 benchmark ok (helms-tag 0.827, helms-hold 0.784 unchanged;
  helms-intercept 0.547 → 0.693; weapons-range 46.8 → 71.1).
- **Decision:** accepted as the positive control; baseline `baselines/reference.json` (commit `f8bebe30`).
- **Lesson:** the two entries under "Station radar reach".
- **Reuse:** L2's 4/8 is the reference's own ceiling there (the four losses fired 250–419 shells
  without a kill); read a brain's L2 result against 4/8, not 8/8.

### L0, L1 — `recommended` after the radar reach cut (2026-10-02)

- **Change:** none: helms v16, weapons v15, engineer v10, signals v3, first suite baseline.
- **Level:** L0 T0 7/8, median 132.6 s (same crew before the cut: 8/8, 100 s): accept needs a median
  ≤ 120 s, not met. L1 T1-lite 10/16, median 61.6 s (before the cut: 14/16, 45 s): accept needs 75%,
  not met; three of the six losses are the never-moved seeds 5, 7, 15, the other three (2, 9, 13)
  locked and lost under fire. Suite reports: `training-archive/2026-10-02/suite/recommended-081501/`
  (L0) and `recommended-083320/` (L1). L0b and L2 not played: $2.40 of the $3.00 budget was spent
  (L0 $1.35, L1 $1.05) and either level costs more than the rest.
- **Regression suite:** against the earlier numbers by the suite's rule, T0 kills are within noise and
  the median is 33% slower (limit 25%); T1-lite 10/16 is below the 11.3 bound from 14/16.
- **Decision:** baseline saved as the measured state (`baselines/recommended.json`), not as an
  accepted level. Plateau: L0 0 of 2 (no candidate since the cut); L1 1 of 2
  (`jev-farcall-h17-w15-e10-s8`, 5/8 against 6/8 on seeds 1–8, no gain). No repair version was
  written: a candidate plus its regression suite costs about $2.40.
- **Lesson:** the radar cut costs the Jev crew the far-spawn seeds, as it did the reference; telling
  helms where the contact is (far-contact callout) did not help because helms v17 heard it on
  `rotation` only and still had no wording to close in.
- **Reuse:** helms v18 = v16 plus the two clauses from "A seat must act on a target only another seat
  can see" on `rotationMode` and `boost`; `reask` it on the T0 seed 7 and T1-lite seeds 5, 7, 15
  recordings before a paid run.

### L0–L2 — `reference` determinism and fresh seeds (2026-10-02)

- **Change:** none; a rerun of the accepted reference and a held-out seed check.
- **Level:** rerun of L0, L0b, L1, L2 on the baseline seeds: every rung identical seed by seed
  (killed, seconds, shells) to `reference-075308`, every benchmark score identical, every verdict ok.
  Fresh seeds 17–48, 180 s: T0 30/32, median 99.2 s (losses seeds 23, 45); T1-lite 29/32, median
  53.1 s (losses 20, 34, 39). Archive: `training-archive/2026-10-02/suite/reference-determinism-rerun/`
  and `reference-fresh-seeds-17-48/`.
- **Regression suite:** all ok. T1-lite 29/32 lies above 13/16's lower bound at 32 seeds (21.6 kills
  by the suite's rule) and within noise of it two-sided (z 1.6).
- **Decision:** the harness is deterministic at $0; the reference is not fitted to seeds 1–16.
- **Lesson:** a reference result on the ladder's seeds holds on unseen seeds; a rerun is free proof
  that a change in numbers comes from code, not chance.
- **Reuse:** after a core or harness change, rerun the reference suite first: any per-seed
  difference is a code change to explain before any brain is judged.

### L0 benchmarks, L1 — what-if forecasts, helms v19 and weapons v17 (2026-10-02)

- **Change:** helms v19 and weapons v17 read options annotated with a coded forecast of each
  option's consequence (`src/whatif/`); see "What-if forecasts" in `docs/integration/ai-crew.md`.
- **Level:** benchmarks, seeds 1–6: `helms-tag` 0.77 → 0.88, `helms-hold` 0.57 → 0.82,
  `helms-intercept` 0.65 → 0.71 (helms v16 → v19); `weapons-range` 89.7 → 135.9 (weapons v15 → v17).
  Crew `jev-whatif-h19-w17-e10-s3` on T1-lite seeds 1–6: 3/6 kills, $0.48; seeds 7–8 not played.
- **Regression suite:** not run.
- **Decision:** inconclusive at six seeds; recommended crew unchanged.
- **Lesson:** a forecast written into each option lifts every single-seat benchmark; a seat benchmark
  gain does not by itself show on a crew rung.
- **Reuse:** test a what-if brain per seat by paired test against the reference on the same seeds.

### L0, L1 — weapons seat, Jev weapons v17 against the reference (2026-10-03)

- **Change:** crew `jev-weapons-w17-ref-helms`: reference helms, Jev weapons v17 (chosen over v15 on
  `weapons-range` 135.9 vs 89.7); paired with `reference` on the same seeds, 180 s.
- **Level:** L1 T1-lite seeds 17–48: 28/32, median 51.7 s, run value 0.765 (reference 29/32, 53.1 s,
  0.777). Kills Jev-only on seeds 20, 34; reference-only on 22, 24, 46; both lost 39. Run value up/down
  15/16/1, sign p 1.00; kills 2/3/27, sign p 1.00. L0 T0 seeds 1–8: 7/8, median 77.7 s, run value 0.727
  (reference 8/8, 83.7 s, 0.795), lost seed 2; run value sign p 0.73. Cost $0.285 (T0 $0.083, T1-lite
  $0.202). Archive: `training-archive/2026-10-02/weapons-seat-paired/`.
- **Regression suite:** L0 T0 within noise on every paired metric.
- **Decision:** rejected for the seat: no paired win; the reference keeps weapons.
- **Lesson:** a 50% gain on the single-seat `weapons-range` benchmark does not move kills or run value
  in a crew with reference helms (shells 2737 vs 2766 on T1-lite).
- **Reuse:** a weapons brain must beat the reference on a crew metric the helms does not bound (shells
  per kill, kill time under fire) before another paired run.

### T1 — reference with engineer seat (2026-10-03)

- **Lesson:** T1 0/16 was a perception and tactics gap, not balance (NPC calibration 12/16).
  Unscanned shells look like ships unless filtered by blip radius. The enemy-only filter blocks locks
  without Signals. Without an engineer the gun is never cooled. Within about 2 km the fighter breaks
  the reactor and the crew runs out of energy. Range of 3.5–4 km plus an engineer seat gets 4–6/16;
  final reference 5/16.

### Scoring — snapshot scorer v2 (2026-10-04)

- **Lesson:** the scorer's per-seat scores are now tactical T/O/V and the engineer score, validated on
  matched-seed runs (the model's out-of-fold scores keep every pooled policy ordering the labels hold,
  `modules/ai/ml/reports/2026-10-04-v2.md`). `stations.helms` is unvalidated, signals has no score. A
  rate over actions (K_w) is computed from events, not predicted: a frame barely shows a habit.
  Backwards rule for a new scorer version: v2 replaces v1 unless a scenario regresses beyond noise: Δ loss (v2 − v1, 95% bootstrap CI over runs) counts as a regression only when the whole CI lies above a noise floor (0.002 logloss for `kill60`, 0.0005 mse for `damage30`; the calibration floor alone costs up to 0.001 logloss) on at least 5 runs. A CI above the floor on fewer runs is reported as insufficient evidence.
- **Lesson:** a game-mechanics change (#2306: energy draw ∝ (power / NORMAL)²) invalidates the labels
  that encode it. Engineer labels come only from runs recorded after it (split by `codeCommit`); the
  other heads pool both and report loss per mechanics. Under the new mechanics all-max drains the store
  (0.01–0.05) and loses to reference on kills in T0-constrained, T1 and T1-MK2.
- **Reuse:** compare crews on `tactical.opportunity` (helms), `tactical.conversion` and
  `RunScore.weapons` (weapons) before `stations.helms`. Before reusing scorer labels across a mechanics
  change, re-record the matched-seed validation runs and re-validate the label against outcomes.

### L3 — `reference`, chain gun power backoff (2026-10-09)

- **Change:** the reference engineer drops the chain gun to low power at heat 60 and back to normal
  below 40, the NPC automation's hysteresis (`reference-engineer.ts`, `powerGoal`).
- **Level:** T1 seeds 1–16: 10/16, median 131.7 s, run value 0.249 (before: 5/16, 138.5 s, 0.228).
  Fresh seeds 17–48: 19/32, run value 0.264 (before: 10/32, 0.200). Suite report:
  `training-archive/2026-10-09/suite/reference-210935/`; `idle` 0/16 (`idle-211042/`); diagnosis runs
  and rejected variants in `training-archive/2026-10-09/t1-tactics/` (README lists each).
- **Regression suite:** every earlier level and benchmark ok. Faster kills on L0 T0 (80.6 → 74.1 s,
  run value +0.038, 7 up / 1 down), L0b (80.6 → 65.1 s, 14 up / 2 down, sign p 0.004) and L1
  (46.9 → 37.8 s); L2 7/8 (was 6/8); `engineer-power-budget` 0.644 → 0.775 (8 of 8 seeds up).
- **Decision:** accepted; baselines `reference` (L0–L3) and `idle` (L3) saved. Plateau on L3: 0 of 2.
- **Lesson:** under fire the gun was the binding resource, not position. The NPC GVTS holds its gun at
  heat 45–58 at low power; the reference held it at 85–90 at normal power, waiting at the hold line.
  Low power halves the rate of fire but quarters the heat per second, so a heat-bound gun fires more
  shells. Variants that did not beat 10/16 beyond noise (seeds 1–16): constant low power 8/16
  (17/32 fresh); armed standoff 2 km 4/16 (without backoff), 3 km 6/16, 5 km 8/16; weapons hold heat
  95 9/16; repairing engineer 9/16; earlier jump-start (25% / 40% store) 9/16 / 7/16; reactor repair
  on a reactor defect: power-train reset 10/16, containment-field tuning 12/16 but 17/32 fresh;
  switching ammo when the loaded type runs out never fired; a signals seat changes nothing (identical
  runs: the blip-radius filter already keeps shells out of the lock).
- **Reuse:** before tuning a seat's tactics, check which resource binds (gun heat, energy, ammo) in
  the recording; the NPC automation (`automation-manager.ts`) is a ready list of resource rules.

### Balance issue draft: the NPC GVTS draws free energy (2026-10-09)

Not filed. Draft text:

> **T1 calibration overstates what a crew can do: NPC ships draw free energy.** `ShipManagerNpc`
> replaces `drawEnergy` with `() => 1` (#2208), so the uncrewed GVTS that calibrates T1 never spends
> its store. In `training-archive/2026-10-03/t1/npc-calibration/` its store stays at 1000 on all 16
> seeds, including seeds where hits cut reactor efficiency to 0.4 (seed 3) and 0.1 (seed 4). The
> crewed `reference` (2026-10-09, same seeds) loses reactor efficiency to 0 on 11/16 seeds and runs
> the store below 250 on 8/16 (to 0 on seeds 2 and 9). Result: NPC 12/16, median 73 s; crew 10/16,
> median 131.7 s. The NPC GVTS's health also never fell below 1 on any seed while the crew's fell to
> 0.51–0.88 on 11/16 (cause not traced). Either calibrate T1 with a player-ship GVTS flown by the
> automation, or give NPC energy a finite budget, before reading the NPC figure as a crew target.
>
> The NPC figure holds after the energy-scaling change (#2306): a rerun on master `f408e9b6`
> (2026-10-10, `training-archive/2026-10-10/t1/npc-calibration/`) gives identical per-seed results
> (12/16, median TTK 73 s, median 102 blast hits). Free energy makes the NPC insensitive to the change.

### L4 — `reference`, reactor repair and thruster shutdown (2026-10-10)

- **Level:** `T2`, two T1 dragonfly-MK1s attacking at once (each 2–8 km, 45–180° apart), 300 s; a run
  is a kill only when both die. Calibration, seeds 1–16: uncrewed NPC GVTS 0/16 (enemies 0/32),
  `idle` 0/16, `reference` before 0/16 (enemies 6/32; seeds 17–48: 1/32, 13/64).
- **Change:** the reference engineer queues a field repair for a reactor defect (store above 30%), and
  while the damage report shows a reactor defect shuts the thrusters down below 40% of the store, back
  on above 50% (`reference-engineer.ts`, `REFERENCE_ENGINEER`, `powerGoal`).
- **Level result:** seeds 1–16: 2/16, median 237.3 s, enemies 9/32, run value 0.043 (before 0.006);
  seeds 17–48: 0/32, enemies 23/64. Enemies killed per seed over seeds 1–48: 18 up / 6 down, sign
  p 0.023. Suite report: `training-archive/2026-10-10/suite/reference-015256/`; `idle` 0/16
  (`idle-015811/`); diagnosis runs and rejected variants in `training-archive/2026-10-10/l4/` (README
  lists each).
- **Regression suite:** every earlier level and benchmark ok. L3 `T1` 10/16 → 12/16 (seeds 17–48:
  19/32 → 23/32); L2 7/8 → 6/8 (within noise); L1 13/16, L0, L0b unchanged.
- **Decision:** accepted; baselines `reference` (L0–L4) and `idle` (L4) saved. L4 accept (25%) not met.
- **Lesson:** two attackers break the reactor early (efficiency 0 at 17–183 s) and the store runs dry
  (below 50 at 102–251 s); the thrusters draw about 85% of the energy (460 of 550 per minute in
  seed 1), so the gun starves before the second kill. Repairing alone (9/32 enemies) or shutting the
  thrusters alone (11/32) does not separate; together the store holds the 30% a repair needs. Repairing
  every system costs L1 (13/16 → 11/16); the reactor alone does not. Shutting the thrusters on a low
  store without a reactor defect costs L2 (7/8 → 2/8: the ship starts short and must fly). Variants that
  did not beat the baseline beyond noise: weapons switching to the nearest ship, helms parking on the
  ship the nose holds, parking beyond the target away from the other, armed standoff 5 or 6 km, no weave
  (2/16 but 12/64 fresh), holding still (0/32), a 600 s timeout (6/32: attrition, not time, binds).
- **Walls:**
    - **Wrecks look like ships.** A destroyed dragonfly leaves a derelict hull of the same radius under a
      new id; unscanned, the radar cannot tell it from the live attacker, and weapons locked it after the
      first kill on 3 of 6 seeds. Cycling targets visits every corporal object (shells too) in insertion
      order, so pressing `next` or `clear` then `next` lands on shells or the wreck long before the
      second attacker. A wreck marker (a new blip where a hull vanished) did not help (6/32) because of
      that cycling. The ships-only filter needs a BASIC scan; with the reference signals seat it changed
      nothing (5/32): its beam goes to the nearest unscanned blip, often the wreck.
    - **Seats aim at different ships.** Helms parks on the nearest ship; weapons holds whatever its cycle
      locked. Helms cannot read the lock (no `targeting-status` on its console); inferring it from the
      ship nearest the nose did not separate (6/32). A seat that names the target for both (a captain)
      is the missing piece, as is a target-designation command weapons could use without cycling.
    - **Contacts flicker.** With three ships firing, shells crowd the 200-contact radar list (nearest
      first), so the far attacker drops off a seat's display for seconds at a time.
    - **NPC calibration does not transfer.** The uncrewed GVTS chases its ordered target, which flies
      ahead out of shell reach, while its forward gun only has the other attacker, behind it, as an
      opportunity target: it never fires (0/16), unlike T1 (12/16). An NPC figure for L4 needs automation
      that switches its order to a reachable hostile.
- **Reuse:** on a multi-enemy level, read the energy series before tactics: the second kill is
  energy-bound. Fix target selection through a designation path (captain seat or signals-backed
  ships-only lock), not by cycling.

### L4 — `reference` re-measure after the radar fixes, and `lock-nearest` (2026-10-11)

- **Level:** `T2` as above, on master with #2347 (cycling skips wrecks and shells) and #2344 (capped radar keeps ships).
- **Level result:** `reference` seeds 1–16: 2/16 (enemies ~10/32), median 211.8 s, run value +0.017 vs the
  c039e482 baseline (4 up / 0 down, sign p 0.125); seeds 17–48: 1/32 (enemies 24/64; baseline 0/32, 23/64).
  L0–L3 unchanged (L3 13/16). `idle` 0/16; uncrewed NPC 0/16.
- **Candidate:** weapons `lock-nearest` (re-cycle until the lock holds the nearest ship, 1 km hysteresis),
  `crews/weapons-lock-nearest.json`. Seeds 1–48: 6/48, enemies 37/96 vs `reference` 33/96, 8 up / 5 down,
  sign p 0.58. **Decision:** rejected (does not separate).
- **Walls, re-read on the new recordings (seeds 1–16):**
    - **Wrecks and the radar cap no longer bind:** weapons locked a wreck on 0/16 seeds (was 3/6); no attacker
      dropped off a capped contact list. The far attacker still leaves helms' list on every seed (2–38 s):
      range or field of view, not the cap (inference).
    - **Energy no longer binds:** with reactor repair and thruster shutdown the store never fell below 14%
      (seed minima 0.14–0.45) and no energy request went short on any seed. The "energy-bound second kill"
      lesson of 2026-10-10 is superseded.
    - **The gun works, the target does not die:** weapons is firing ~70% of decisions, on a lock 70–84% of
      them, the lock inside 2° and 8 km almost always (median range 1.8–4.5 km). The first attacker takes
      41–167 damage events per run; on 7/16 seeds the second attacker takes none at all, because the first
      never dies. Kills are bound by the dragonfly's durability to HiExp shells, which matches the #2334
      benchmark (median 41 ideal missiles; the capsule survives ~10 post-breach defects).
- **Reuse:** before more crew tactics on L4, re-run it after the armour retune (starwards-design card M4.7)
  and the ammo retune (#1968); count damage events per attacker, not only kills.

### L4 — `reference` with tubes: missiles through the console (2026-10-12)

- **Level:** `T2`, on top of #2381 (round concentration: 2-4 ideal Gravitas missiles kill a dragonfly-MK1)
  and #2382 (tube safety through the console; the reference weapons fires a loaded tube at a locked ship
  1-20 km away within 100 deg of the tube, at most every 10 s).
- **Change:** the reference engineer powers the tubes at normal while the ship is in a fight (a plate lost or
  a defect reported) and the store holds more than half; otherwise they stay shut (`TUBE_STORE`, `engaged`).
- **Level result:** seeds 1-16: 16/16 (enemies 32/32), median 79.0 s, run value 0.735 (baseline 2/16,
  0.060); seeds 17-48: 32/32 (64/64; baseline 1/32). Accept (25%) met.
- **Regression suite:** every level and benchmark ok. L1 13/16 to 16/16, L3 13/16 to 16/16, L2 7/8,
  engineer-power-budget 0.775 (unchanged). Tubes powered from the start instead (`tubes-powered`
  engineer) also wins L4 16/16 but costs engineer-power-budget 0.775 to 0.665 (0 up / 8 down, p 0.008):
  that benchmark has no enemy, so powered tubes are waste.
- **Lesson:** L4 was bound by the gun's kill cost, not by tactics: missiles that hit hard enough break it at
  once. The gun-only reference (tubes shut) stays at 1/16 on the same build.
- **Reuse:** the next rung (M3.34) should add a complexity axis that missiles alone do not solve, e.g.
  limited missile stock, heavier targets or more attackers than tubes. Runs:
  `training-archive/2026-10-12/l4-missiles/`.

### L5 — `reference` and `idle` baselines on `T2-constrained` (2026-10-15)

- **Level:** new, axis `internal` (ruling M3.34): the `T2` attackers with the GVTS starting as on
  `T0-constrained` (10-30% energy, 250-450 shells per type, chain guns at heat 40-70), seeds 1-16, 300 s.
  The former placeholders L5-L7 are now L6-L8.
- **Level result:** `reference` 16/16 (enemies 32/32), median 87.1 s (p10 63.0, p90 167.7), run value 0.669,
  mean 304 shells per run; `idle` 0/16 (0/32). Against unconstrained `T2` (16/16, 76.0 s, 0.741) the
  constraints cost about 11 s of median and 0.07 run value, not kills.
- **Threshold:** accept 75% (12/16). The reference's 16/16 has a 95% lower bound near 81%, so 75% sits just
  under what a working crew shows with room for seed noise; the gun-only reference reached 1/16 on `T2`,
  so the bar still demands missile use from a starved store. A rate pinned to 100% would reject a crew on a
  single unlucky seed.
- **Regression suite** (reference vs its baseline, L0-L4): every rung ok (L2 7/8, L3 16/16, L4 16/16).
  `weapons-acquire` reads regressed (38.5 vs 53.8, 0 up / 8 down) and `helms-intercept` crashes ("helms
  benchmark ships are missing"); both reproduce identically on origin/master without this change, so they
  predate it.
- **Lesson:** the internal axis does not bind the reference on two attackers: missiles carry the kills, so a
  starved store and short magazine only slow it (inference from kills and median; the energy and shell series
  were not read).
- **Reuse:** to make L5 discriminate, tighten what missiles depend on (missile stock, tube power with a low
  store) rather than shells or gun heat.

### L0 — `reference` benchmark faults after delayed missile launch (2026-10-16)

- **Cause:** both faults bisect to #2375 (delayed missile launch, ac4ddbd1); 72af6a88 just before it
  reproduces the old baseline exactly. Missiles leave the tube inert and arm 2 s later, so the one HiExp
  missile the reference weapons seat launches lands at a different time.
- **`helms-intercept` crash:** on seed 5 that missile now kills the quarry before helms reaches its tail,
  and the scorer throws "helms benchmark ships are missing". The helms benchmarks meant both ships unarmed
  but emptied only the shell stocks; they now empty every magazine stock. Score 0.768 (was 0.770): the
  missile barely moved the course score.
- **`weapons-acquire` 53.8 -> 38.5:** a legitimate consequence, re-baselined. With tube launches held,
  scores are identical before and after #2375 on all 8 seeds, so the whole drop is the missile's changed
  flight, not the gun, the lock or the scorer.
- **Re-baseline:** L0 saved from this branch; the other L0 items moved by seed noise only (T0 run value
  0.881 -> 0.862, 0/8 up, also from #2375; `weapons-range` 64.5 -> 61.3, within noise).

### L5 — missile stock cap on `T2-constrained` (2026-10-17, M3.42)

- **Change:** `T2-constrained` now also starts every missile stock at 3-6 (`T0Lab.playerMissiles`); accept 75% -> 62.5%.
  Measured on master after #2398 (chain-gun heat) and #2401 (benchmark faults).
- **Before (no cap):** `reference` 16/16 (enemies 32/32), median 89.0 s (p10 60.5, p90 235.5), run value 0.629;
  `idle` 0/16. **After:** `reference` 6/16 (enemies 22/32), median 73.4 s (p10 44.1, p90 144.4), run value 0.307;
  `idle` 0/16 (0/32). Seeds 1-16, 300 s.
- **Sweep** (reference, the same n in every stock): n=1 0/16 (3/32), 2 0/16 (12/32), 3 3/16 (19/32), 4 5/16 (21/32),
  5 10/16 (26/32), 6 15/16 (31/32), full 16/16. The reference never changes tube ammo (`changeTubeAmmo` "wait" on
  every decision) and fires tube 1 twice in 16 runs, so it spends one stock; a crew that switches stocks has 15-30.
- **Threshold:** accept 62.5% (10/16): the reference's 6/16 plus 4, past the ±3 seed noise at 16 seeds, so the
  reference fails L5 and a passing crew must spend missiles better than it; one stock of 6 already gives 15/16,
  so the bar is reachable (inference).
- **Regression suite:** reference L0-L4 all ok against the committed baseline (`training-archive/2026-10-17/suite/reference-012205/`);
  `helms-intercept` and `weapons-acquire` no longer fail as on 2026-10-15. L5 baseline re-saved.
- **Lesson:** the internal axis binds two attackers through the missile stock, not shells: kills fall steeply
  between 6 and 3 missiles a stock.
- **Reuse:** a candidate on L5 starts with a weapons rule to change tube ammo when the loaded stock is empty or
  low; read missiles left per stock in the display before tuning anything else.

### Missile deadly range — one GVTS missile vs a dragonfly-MK1, by target aspect (2026-10-18, after the projectile hit-check fix)

- **Instrument:** `npm --prefix modules/server run missile-range -- --ammo <ammo> --motion <motion> --ranges <km> --seeds 8`
  (`modules/server/src/test/training/missile-range.ts`), seeds 1-8 per cell, launches 2-70 km. One missile from GVTS
  tube 0; the lock rides on the scan beam narrowed to 5° (70.7 km at normal power; the omni radar reaches 6 km). The target holds
  still until the missile leaves the tube, then holds still, flies straight at the launcher, runs straight away,
  or crosses the launch line square, at 600 m/s (afterburner off) or 1200 m/s (afterburner on), with no ramp-up.
  Calibration only: it never turns, jams or shoots back.
- **Result:** P(kill) is 0.00 in every cell: one missile never kills a dragonfly (3-4 do, #2334).

HiExp missile, P(hit):

| launch km | approach 1200 | approach 600 | still | cross 600 | cross 1200 | flee 600 | flee 1200 |
| --------: | ------------: | -----------: | ----: | --------: | ---------: | -------: | --------: |
|         2 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         3 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|         4 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|         5 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|         6 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|         8 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        10 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        15 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        20 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        25 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        30 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        35 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        40 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        45 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        50 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        55 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        60 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        65 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        70 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |

ArmPen missile, P(hit):

| launch km | approach 1200 | approach 600 | still | cross 600 | cross 1200 | flee 600 | flee 1200 |
| --------: | ------------: | -----------: | ----: | --------: | ---------: | -------: | --------: |
|         2 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         3 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         4 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         5 |          1.00 |         1.00 |  1.00 |      1.00 |       1.00 |     1.00 |      0.00 |
|         6 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|         8 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        10 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        15 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        20 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        25 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        30 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        35 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        40 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        45 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        50 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        55 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        60 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        65 |          1.00 |         1.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        70 |          1.00 |         0.00 |  0.00 |      0.00 |       0.00 |     0.00 |      0.00 |

Elec missile, P(hit):

| launch km | approach 1200 | approach 600 | still | cross 600 | cross 1200 | flee 600 | flee 1200 |
| --------: | ------------: | -----------: | ----: | --------: | ---------: | -------: | --------: |
|         2 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         3 |          1.00 |         1.00 |  1.00 |      1.00 |       0.50 |     1.00 |      0.00 |
|         4 |          1.00 |         1.00 |  1.00 |      1.00 |       0.38 |     1.00 |      0.00 |
|         5 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|         6 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|         8 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        10 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        15 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     1.00 |      0.00 |
|        20 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        25 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        30 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        35 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        40 |          1.00 |         1.00 |  1.00 |      1.00 |       0.00 |     0.00 |      0.00 |
|        45 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        50 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        55 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        60 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        65 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |
|        70 |          1.00 |         1.00 |  1.00 |      0.00 |       0.00 |     0.00 |      0.00 |

- **Terms:** Rmax is the farthest launch with P(hit) ≥ 0.8 against a target that holds its course and speed, by
  aspect; Rne (no-escape) is Rmax against a target running away. Envelope (km; closing speed + toward us, − away):

    | ammo   | +1200 | +600 | 0 (still) | −600 (Rne) | −1200 | crossing 600 | crossing 1200 |
    | ------ | ----: | ---: | --------: | ---------: | ----: | -----------: | ------------: |
    | HiExp  |   70+ |  70+ |        45 |          4 |  none |           10 |          none |
    | ArmPen |   70+ |   65 |        40 |         15 |  none |           30 |          none |
    | Elec   |   70+ |  70+ |       70+ |         15 |  none |           40 |          none |

    70+ is the sweep's edge (the scan beam's reach). Rne against an afterburner run is none: a dragonfly at 1200 m/s
    outruns every missile from 2 km.

- **Changed:** `missileLaunchRange(ammo, closing, crossing)` (bots `brain/missile-envelope.ts`) holds this table and is the
  one source for the reference weapons' launch (per tube ammo), the reference captain's `close_to` range (HiExp
  envelope less 2 km, closing speed read off two dradis fixes) and `engage`, the weapons KPI's firing solution and
  the `missile_beyond_own_radar` check (a launch beyond the tactical reach counts only inside the envelope). Between
  measured closing speeds it takes the shorter neighbour; crossing speed shortens the range linearly, since a
  stepped crossing table cut every HiExp launch from a moving GVTS to 10 km (T3-directed seeds 5, 6, 8: launches
  only inside 8 km).
- **Lesson:** a missile's reach is set by the target's aspect, not the missile: 45-70 km at a still or oncoming
  target, 4-15 km at one running at cruise, none at afterburner. HiExp is the still- or oncoming-target missile;
  ArmPen and Elec are the ones that catch a cruising runner.
- **Reuse:** re-run the sweep after any change to missile speed, `MISSILE_LAUNCH`, `TERMINAL_SPRINT` or the
  projectile raycast, and copy the result into `missile-envelope.ts`.

### L5b — captain-reference, rule mined from the Jev captain (2026-10-18)

- **Oracle:** `crews/jev-captain-c1-ref.json` (Jev captain v1, reference signals, helms, weapons and engineer) on
  T3-directed seeds 1-16: kills 15/16, median 98.3 s, `missile_beyond_own_radar` 16/16; Jev spend $0.023 over three
  runs. Archive: `training-archive/2026-10-18/missile-envelope/`.
- **Mined:** the Jev captain says `engage` once the target is inside the launch envelope, then `close_to` again
  (seed 1: engage at 25 s, close_to at 30 s with the target 40.5 km out; launches from 36 s; kill 102.9 s), so
  the ship flies in while the missiles fly. The reference captain held the ship and re-said `engage` (seed 1: 12
  launches from 40 km, kill 171.7 s).
- **Change:** reference captain says `close_to` gun range (2 km) once it has ordered the enemy inside the envelope
  engaged (`reference-orders.ts`, `closeRange` in `engagement.ts`).
- **Level:** captain-reference kills 16/16, median 70.7 s, `missile_beyond_own_radar` 16/16 (before: 16/16, median
  128.4 s); `reference` without a captain 16/16, median 220.3 s, 0/16; idle 0/16. Suite reports:
  `training-archive/2026-10-18/suite/captain-reference-144112/`, `reference-144452/`, `idle-144443/`.
- **Decision:** L5b built; captain-reference baseline saved. The captain-free reference fails it on the check.
- **Lesson:** the envelope lets missiles start the fight from the fleet's picture, but the kill comes faster when
  the ship closes during their flight: missiles and the gun finish together.
- **Reuse:** a candidate captain on L5b starts from engage-then-close; read the launch range per run
  (`missile_beyond_own_radar` detail) before tuning wording.

### Launch envelope off the target's own motion (2026-10-18)

- **Cause:** Jev captain T3-directed seed 6 timed out. `launchRange` took closing speed from the range rate, which
  carries the own ship's motion: flying in, the HiExp envelope read 45 km; backing off, 4 km. `close_to` alternated
  43 km and 2 km, and helms turned an ordered range beyond the current distance into a point behind the ship: a
  20 s oscillation netting about 0.4 km per cycle.
- **Change:** closing and crossing speeds come from the target's own motion along and across the line of sight
  (`engagement.ts`, and the same in `missile_beyond_own_radar` and the weapons KPI); a `close_to` whose run is not
  positive holds the ship (`reference-orders.ts`).
- **Level:** L5b captain-reference 16/16, median 69.4 s, check 16/16 (before: 16/16, 70.7 s); Jev captain 16/16,
  median 72.5 s, check 13/16 (seed 6 kills at 70.1 s). Archive: `training-archive/2026-10-18/envelope-fix/`.
- **Lesson:** a missile does not inherit the launcher's approach in the measured envelope; read the target, not the
  range rate.

### L5c — T3-incoming, captain-reference unchanged (2026-10-18)

- **Oracle:** Jev captain (`crews/jev-captain-c1-ref.json`) on T3-incoming seeds 1-8, then 9-16: 16/16, median
  72.3 s, `missile_oncoming_beyond_radar` 15/16; Jev $0.010.
- **Mined:** nothing that beats the reference. Paired with captain-reference on seeds 1-16: run value +0.000
  [−0.004, +0.004], 8 up / 8 down; first oncoming launch median 47 s (Jev) vs 50 s, farthest launch median 31.8 vs
  32.1 km. Jev says `engage` later (seed 1: 35 s at 41 km, the reference at 15 s at 55 km) and kills at the same time:
  the kill is set by the attacker's run in, not by the first launch.
- **Change:** none to the captain rules; the level stands on the envelope fix above.
- **Level:** captain-reference 16/16, median 73.2 s, check 16/16; `reference` without a captain 15/16, median
  339.6 s, 0/16 (gun only); idle 0/16. Suite reports: `training-archive/2026-10-18/suite/captain-reference-163414/`,
  `reference-162632/`, `idle-172908/`; L5c added to the three baselines from those runs.
- **Regression suite:** captain-reference L5b ok. `reference` regressed on L0b (14/16, seeds 11 and 13: one shell,
  GVTS stopped) and L4 (14/16, seeds 9 and 12); the same four seeds lose with the envelope change reverted, so the
  cause predates it (baseline 234b0dd9; suspect the master merge 25c6b8c8). Idle ok.
- **Decision:** L5c built.
- **Lesson:** the attacker's combat weave holds its closing speed at 520-590 m/s and crossing at 90-320 m/s, so the
  HiExp envelope reads the still-target 45 km and launches leave from 20-42 km; the measured 70 km band (closing
  ≥ 600 m/s, straight run) is not reached against the NPC attack AI.
- **Reuse:** a two-raider T3-incoming is the next variance step; a longer reach needs ArmPen or Elec in the tubes or
  an envelope measured against a weaving attacker.

### Captain branching — what other captain orders would have done (2026-10-18)

- **Change:** none to any crew. `npm run branch` replays `captain-reference` runs from their seeds,
  leaves them at decision points and plays other orders: strategic (one order-board slot or a stance),
  tactical (the captain's call held 30 s, or another target) and button (one control at one decision).
- **Level:** archive `training-archive/2026-10-18/branching-v2/` (current order model) and
  `branching/` (first model).
    - T3-directed, 400 branches, 0 diverged: nothing beats the reference captain. `hold_position` costs
      21 of 29 kills, `dock_for_repair` 12, the `defensive` stance −0.10 run value.
    - T2-dock, first model, 320 strategic branches: a dock order at first contact turns 7/16 wins into
      13/16.
    - T2-dock, 160 tactical branches: with armor below 75%, `close_to` beats `engage` (21 up / 8 down,
      sign p 0.024).
- **Regression suite:** not run (no crew changed).
- **Decision:** none; proposals for the reference captain are in SPEC-0009's results.
- **Lesson:** replay is exact as long as the recording was made on the same code. A corpus branched
  from runs recorded before a behaviour change diverges on every branch, so re-record first. The CLI
  now exits 1 on any diverged branch.
- **Reuse:** before tuning a captain rule, branch the baseline at the moments the rule would act and
  keep only alternatives that beat the recorded play beyond noise. Then test the rule as a crew on the
  same seeds: a branch changes one decision once, not a policy.

### Order board synced, command-driven, with doctrine (2026-10-18)

- **Change:** the order board moved from the crew process into `ShipState.orderBoard`, written only
  through `crewOrderCommands`; the reference helms and weapons read orders from the board instead of
  the radio; crews may run doctrine (`"doctrine": true`).
- **Level:** T3-directed 1–16, `captain-reference` 16/16, median 86.4 s (before: 16/16, 90.5 s). An
  order now lands at the ship's next tick, and helms recomputes the `close_to` spot from where the ship
  is at each decision instead of from where it was when it heard the call. Ladder: no board 16/16,
  245.7 s; doctrine 16/16, 106.8 s; captain 16/16, 86.4 s.
- **Regression suite:** not run.
- **Decision:** accepted (owner ruling: synced, command-driven, recorded; doctrine as the floor a
  captain must beat).
- **Lesson:** a command lands a tick later than a direct write. A wrapper that checks the board for an
  order it just sent (the branched captain's `keepToBranchOrders`) must also remember the order in
  flight, or the next call cancels it before it lands.
- **Reuse:** accept a seat brain on a level both with and without a captain, paired on the same seeds;
  a captain earns its seat only by beating doctrine.

### Captain curriculum on the order board (2026-10-18)

- **Change:** captain-curriculum merged onto the synced order board: the reference captain's
  engage-then-close rule reads the engaged ship from the board's active `engage` order, and
  `captainOrdersFromBoard` holds on a `close_to` whose range is beyond the current distance.
- **Level:** `captain-reference` L5b 16/16, median 69.4 s (baseline 70.7 s, ok); L5c 16/16, median
  80.3 s (baseline 73.2 s; run value −0.014 [−0.018, −0.010], 15 of 16 seeds slower). `doctrine-reference`
  L5b 16/16, 109.8 s; L5c 16/16, 112.4 s. `reference` L5b 16/16, 241.1 s; L5c 15/16, 339.6 s.
- **Regression suite:** `reference` L0b and L4 14/16 against 16/16 baselines last measured 2026-10-12,
  before the omni shrink (#2425). The two L0b misses (seeds 11, 13) spawn 5.1 and 5.6 km out, beyond the
  4.2 km omni: the GVTS never sees, locks or moves. captain-curriculum's head gives the same 14/16.
- **Decision:** accepted as the integration base for wave defence.
- **Lesson:** not yet isolated: the L5c slowdown is likely the board's one-tick landing and helms
  recomputing the `close_to` spot each decision, against the remembered radio call it replaced.
- **Reuse:** the wave-defence push starts here.

### L5b-L5d — captain-reference with status callouts, salvo and focus (2026-10-19)

- **Change:** weapons.v19 and signals.v10 say status callouts (lock, envelope, salvo away, lost or
  destroyed target, lost contact); captain.v7 hears them, orders `salvo 2` after engaging and a `focus`
  once two or more enemies are in sight.
- **Level:** L5b 16/16, median 87.4 s (before 69.4 s); L5c 16/16, median 87.8 s (before 80.3 s);
  L5d (new, W-waves, 8 seeds) passed 7/8, stations lost 0.13 per run. Without the focus call
  (captain.v6) W-waves passed 1/8, 1.50 stations lost per run. Missiles fired over 16 seeds: L5b 90 -> 33,
  L5c 65 -> 44.
- **Regression suite:** L5b and L5c ok by the suite's rule (slowdown under 25%) but every seed slower
  (sign p 0.000 / 0.001): the salvo holds the tubes while two missiles fly.
- **Decision:** accepted as captain-reference's baseline for wave defence, where missiles are the
  binding resource; the T3 slowdown is the price.
- **Lesson:** on a single target the first launches carry the kill and the rest only speed it; fire
  discipline pays only once the magazine must last several targets. Target priority is what holds
  stations: the focus on the raider nearest the threatened station.
- **Reuse:** wave-defence candidates start from captain.v7; signals beam bearing beyond the radar's
  bearing range is refused on W-waves (pre-existing, also without these changes).

### L5b-L5d — captain.v8, chase to gun range after engaging (2026-10-19)

- **Change:** captain.v8 replaces close_to with chase_target (run the enemy down to gun range with a
  fresh fix whenever nothing more urgent is said), so the ship never parks at the missile range.
- **Level:** L5b 16/16, median 81.8 s (captain.v7 87.4 s); L5c 16/16, median 71.6 s (v7 87.8 s); L5d
  W-waves 0/8 passed, 2.38 stations lost per run (v7 7/8, 0.13).
- **Regression suite:** not run: rejected on L5d.
- **Decision:** rejected; captain-reference stays on captain.v7. Chasing before engaging was tried
  too: L5b 86.9 s, L5c 73.5 s, worse than engaging first (the first missile at t=5 matters).
- **Lesson:** pressing in wins a lone duel but in wave defence it drags the ship after one raider,
  away from the stations the others shell; a press-in order needs a leash to the defended station.
- **Reuse:** chase_target as the press-in call where no station is defended.

### L5d — W-waves calibration; Jev captain short of the bar (2026-10-19)

- **Change:** rung `W-waves` (wave_defence map, the map's own wave timing, pass = 3 waves survived with
  every station alive, 1500 s) and `W-waves-endless` (calibration). Branch outcomes on a wave rung now
  read the wave tracker.
- **Level:** seeds 1-16: `captain-reference` 9/16, `captain-doctrine-reference` 5/16, `doctrine-reference`
  0/16, `signals-reference` 0/16, `idle` 0/16. Median waves survived 3 / 2 / 2 / 1 / 1. Seeds 1-8, Jev
  captain v1 2/8 against `captain-reference` 5/8; Jev $0.46. Archive:
  `training-archive/2026-10-19/waves/`.
- **Regression suite:** not run (no seat brain or reference rule changed).
- **Decision:** N = 3, the bar L5d uses. These are the captain.v1 reference seats; the focus-rule
  `captain-reference` (captain.v7, signals.v10, weapons.v19) passes 9/16 at HEAD f5fb4f41 (seeds 1-8
  5/8, 9-16 4/8; stations lost 1.00 per run), not the 7/8 on seeds 1-8 its L5d entry records, and wins
  other seeds (1, 4, 5, 7 against v1's 2, 4, 5, 6, 7). Archive
  `training-archive/2026-10-19/waves/captain-reference-v7-s1-16/`.
- **Lesson:** with several raiders the reference captain's "nearest enemy" is the raider shadowing the
  ship, not the one reaching a station; the stations fall while the GVTS fights 40-100 km away. Doctrine
  alone moves the ship only to what signals reports and saves no station past wave 2. A Jev captain
  with a dock order docks between waves and is late for the next one.
- **Reuse:** branch `captain-reference` W-waves runs at the tactical level (`engage@<enemy>` alternatives,
  $0) to test "engage the raider nearest a station" before writing it as a reference rule; a wave run is
  15 min at 8 workers, so budget the corpus by seed shards.

### L5d — captain-reference-guard-park, helms parks on the engaged enemy (2026-10-22)

- **Change:** helms.v22 (`parkOnEngaged`): the reference helms parks on the enemy the captain's focus or
  engage order names, not on the nearest enemy; otherwise `captain-reference-guard`.
- **Level:** W-waves seeds 1-64: 46/64 passed (`captain-reference-guard` 46/64; discordant 8/8, exact
  McNemar p 1.00); holdSeconds −13.9 s [−45.7, +17.9], stationArmorLost −0.01 [−0.20, +0.18], raiders
  killed −0.08 [−0.27, +0.11]: within noise. Archive `2026-10-22/mac1/fight-park64`.
- **Regression suite:** not run (no gain on L5d).
- **Decision:** rejected; recorded failure.
- **Lesson:** in the 13 W-waves seeds the guard crew reached the wave-3 station in time and still lost,
  the GVTS killed 0-1 of 5-7 raiders and dealt at most 2 k damage while the station took 30-63 k; the
  reference crew's passes on the same seeds kill no more (two passed firing no shell at all). Helms
  parking on the nearest raider while weapons holds the focus target (lock and nearest differ in 54-96%
  of the fight) pulls the gun off arc and out of range, and a raider holding 1 km off the ship drags it
  up to 50 km from the station. Parking on the engaged enemy cut that mismatch (seed 2: 76% to 33%,
  gun clear to fire 45% to 75%) but kills did not follow, and passes churned 8 each way: a wave-3 pass
  is a race between the station's hull and the wave-4 clock, not the GVTS's fight. By wave 3 the
  magazine is dry or nearly (HiExp shells out before or during the fight in 11 of 13).
- **Reuse:** a wave-3 lever must change raider damage on the station (kills before arrival, drawing
  aggro, a restocked magazine), not gun uptime alone.

### L5d — guard baseline, closed levers and screen power (2026-10-23)

- **Change:** none accepted; `captain-reference-guard` frozen as baseline (23/32 on seeds 65-96).
- **Level:** closed on 32-seed screens: intercept 2000 (160 cluster seeds, p 0.77), timed restock dock
  600/640/660 (15/19/18; rescues 4-5 FAIL seeds, loses 8-12 PASS seeds), engineer.v13 (19/32),
  HE_RESERVE, close-stop scalars, scan levers. Lever 3 (per-action branch labels, 4 rollouts) interim:
  9% decisive states, learners 17-21 pts under always-hold LOSO, oracle gain ~ winner's curse.
- **Decision:** rejected; lever 3 sweep killed.
- **Lesson:** a 32-seed pass/fail screen has ~15% power for +3/32 (~150-260 paired seeds needed), and
  32 rollouts resolve only per-state gains >= .35. The closed levers are unproven, not disproven; screen
  with a control variate, a validated continuous surrogate and group-sequential looks
  (`helios/noise-eval-2026-10-23/PLAN.md`). Any fork/rule claim needs 16-32+ rollouts on decisive states
  before fitting. All 34/34 guard FAILs lose `station-small` in wave 3 (18 within 30 s of passing);
  lost magazine capacity permanently deletes missiles; continuous refill reaches 62/64 while 1.5x start
  stock adds +7: missile timing beats quantity (`helios/missile-tactics-2026-10-23/PLAN.md`).
- **Reuse:** oracle tests T1 (+8 HE at 900 s), T2 (no capacity damage), T3 (true station-attacker
  target), T6 (AP fallback) before a CMA-ES search over surviving tactic knobs; balance ceiling if they miss.

Copy this block for every candidate run on a level.

```markdown
### <level id> — <candidate crew> (<date>)

- **Change:** the one thing that changed against the accepted crew (brain file and field).
- **Level:** kills k/n, median s (accepted crew: k/n, median s). Suite report: <archive path>.
- **Regression suite:** every earlier level and benchmark ok / regressed (which, by how much).
- **Decision:** accepted / rejected; plateau count on this level (n of `plateau.versions`).
- **Lesson:** what generalises, or "none".
- **Reuse:** what the next level or station starts from.
```
