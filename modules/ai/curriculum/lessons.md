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

### T1 is unwinnable; use T1-lite

- **Evidence:** every crew including `reference` loses T1; `reference` 13/16 on T1-lite (180 s).
- **Reuse:** never read a T1 loss as a brain result. Add a rung to the ladder only once `reference`
  wins it, so a failure there says something about the brain.

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
