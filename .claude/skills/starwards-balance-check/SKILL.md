---
name: starwards-balance-check
description: Measure a gameplay balance question with the headless harness instead of guessing -- use when a core change touches damage, energy, capsule, AI or weapons, when asked about time-to-kill, fighter half-life or wave-defence difficulty, or when harness pins (fighter half-life, wave-1 kill) need re-measuring
version: 2026-09-28
related_skills:
    - starwards-recording-analysis (why a single run went the way it did)
    - starwards-verification (evidence before assertions)
---

# Balance check

Balance claims need numbers from `modules/server/src/test/` (headless harness, see `training/README.md`). A single seed is an anecdote; a result is a median over seeds, compared against a baseline on the same seeds.

## Preflight

1. `npm run build:core`. The server runs the built `modules/core/cjs`: a stale build measures the old core.
2. Baseline = the same measurement on `origin/master` (own worktree, own core build). Never compare against a number from memory or an old KB entry: harness numbers move with any core change that creates objects or draws random numbers (ids key die rolls; rng draw order).

## Pick the instrument

| Question                  | Instrument                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship-vs-ship time to kill | `npm --prefix modules/server run training -- --scenario <rung> --seeds 64 --timeout 300 --interval 0` (flags: `--first-seed`, `--hz`, `--out`). Rungs: `T0` (target plays dead), `T1` (dragonfly-MK1 attacks the GVTS), `T2` (two of them at once), `T1-MK2`, `T1-predator`, `T1-noweave` (calibration only). Prints a markdown report.                                                                                                                                                                                               |
| Why one run went that way | Re-run that seed with `--seeds 1 --first-seed <n> --interval 1 --out <dir>`, then use `starwards-recording-analysis` (`npm --prefix modules/server run analyze -- summary --recording <file>`).                                                                                                                                                                                                                                                                                                                                       |
| Fighter half-life         | `describeFighterHalfLife` in `training/fighter-half-life.ts` (its own `timeToKill` loop, not the training runner).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Wave defence              | No CLI on master. Write a throwaway `ts-node` script (scratchpad, not committed) calling `runWaveDefence({ seed, tuning, maxSimSeconds, hz, proxy })` and, for a tuning grid, `sweepToMarkdown(cells, maxSimSeconds, hz)` from `wave-defence-balance-harness.ts`. Proxy `nearest-station` = GVTS on NPC automation; `standoff-missiles` = crewed GVTS with an engineer on the real reactor -- the only one that says anything about play. Tuning levers: `WaveDefenceTuning` (`budgetExponent`, `hullScores`, `waveIntervalSeconds`). |
| Missiles / tubes          | No rung on master. Say so; do not stand chain-gun rungs in for missile balance.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Calibration only

The README's "Calibration only" table lists flags and caps that isolate one variable (T0 speed cap, `labNoCombatWeave`, `MockDie`, GVTS on NPC automation). A number measured with one on is not a balance number for play -- label it as such when reporting. An NPC-driven GVTS draws no energy.

## Method

- Acceptance: seeds 1-64 at 60 Hz (`SERVER_TICK_HZ`). 16-seed blocks spread 0.7-1.45x the 64-seed value, so a 16-seed difference under ~50% is noise.
- Report: instrument + exact args, commit of each side, seeds, median (or half-life), kills / seeds, and before -> after. Mark which numbers are calibration-only.
- A 64-seed run takes minutes; run baseline and variant in parallel (separate worktrees), bounded, output to a file.

## Re-pinning harness specs

A core change that legitimately moves the numbers fails the pinned specs:

- `training/fighter-half-life-mk1.spec.ts` / `-mk2.spec.ts`: pinned seconds passed to `describeFighterHalfLife`; CI runs seeds 1-16 within `TOLERANCE` (0.5).
- `wave-defence-balance.spec.ts` wave-1 kill spec: seeded kill count and one seed's kill time, with a dated comment.

To re-pin: re-measure on seeds 1-64 with the same loop the spec uses, update the pin and its dated measurement comment, keep the tolerance unless the 16-seed spread changed. State the old -> new values and the cause in the commit. Full local suite is ~40 min (the half-life specs dominate).

## Recording the result

Rulings and evidence live in starwards-design `product/backlog.md`, section "Simulation harness": date, starwards commit, instrument + args, seeds, before -> after, ruling. The KB is single-writer: `git pull` first, commit, do not push unless asked.

## Known gaps on master

Don't hunt for these; build them in scratch or salvage from branch `training-harness` if the question needs them: a wave-defence runner / sweep grid, a missile (T1-missile) rung, the script that re-records `training/analysis/__fixtures__/t0-seed1-parity.json`.
