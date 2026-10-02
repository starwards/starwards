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
- **Reuse:** a callout earns its place on the level where the listener has an action for it; on T1-lite
  every enemy spawns inside every radar's reach.

## Rungs

### T1 is unwinnable; use T1-lite

- **Evidence:** every crew including `reference` loses T1; `reference` 7/8 on T1-lite (180 s).
- **Reuse:** never read a T1 loss as a brain result. Add a rung to the ladder only once `reference`
  wins it, so a failure there says something about the brain.

### Results at 8 seeds do not hold at 16

- **Evidence:** talking crew 8/8 on T1-lite seeds 1–8, then 12/16 on seeds 1–16; silent crew 12/16 and
  11/16 on two 16-seed runs of the same rung.
- **Reuse:** decide on 16 seeds for rungs below ~90% kill rate; quote the suite's noise bound with the
  claim.

## Per-level entries

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
