# Headless training harness

Runs game maps with no Colyseus and no wall clock (`../headless-game.ts`), records them, and measures combat. Evidence and rulings: starwards-design `product/backlog.md`, section "Simulation harness".

| Runner                                                                                            | What it runs                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix modules/server run training -- --scenario T1 --seeds 64 --timeout 300 --interval 1` | A training rung (`training-scenarios.ts`) across seeds, with a markdown report. Each run is recorded to `--out`; `--interval 0` keeps no recording. |
| `npm --prefix modules/server run analyze -- summary --recording <dir>/T1_seed1.sgr`               | Questions about one recorded run, through a DuckDB store beside it (`analysis/`, skill `starwards-recording-analysis`).                             |

Rungs: `T0` (a target that plays dead), `T1` (a dragonfly-MK1 attacking the GVTS), `T1-MK2` and `T1-predator` (heavier hulls attacking), `T1-noweave` (T1 without the target's combat weave), `T1-lite` (calibration only: a dragonfly-MK1 that holds its ground and fires at the GVTS, its capsule 70% breached -- the middle rung between T0 and T1, where the reference crew kills 7/8 of seeds 1-8 within 180 s).

`fighter-half-life-*.spec.ts` pin the fighter half-life on T1 and T1-MK2 (see `fighter-half-life.ts`).

`../wave-defence-balance-harness.ts` runs `wave_defence` under a `WaveDefenceTuning` with a player proxy flying the GVTS, and tabulates a sweep of tunings as markdown (`sweepToMarkdown`); `../wave-defence-balance.spec.ts` drives it.

How to run a balance check end to end: skill `starwards-balance-check`.

The server runs the built `@starwards/core` (`modules/core/cjs`). Run `npm run build:core` after a core change, or the harness measures the old core.

`runTraining` options `crewedPlayer` (the GVTS gets `ShipManagerPc` and ignores the map's orders) and `beforeTick` (an async hook awaited before every tick) let another module seat its own crew on the GVTS.

The `<name>.events.jsonl` sidecar beside each recording takes any `HeadlessRecorder.record(kind, objectId, data)` event, and `analyze events --kind <kind>` returns it with `data` as its detail.

## Calibration only

These flags and caps exist only to isolate one variable in a measurement. No game map sets them, and a number measured with one of them on is not a balance number for play.

| Flag or cap                                                                                                                 | Where                                                                           | Why                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 target speed capped to the GVTS's 450 m/s                                                                                | `scenarios/training.ts`, `T0_TARGET_MAX_SPEED`                                  | Blast knock-back would otherwise fling the thrustless target out of reach, so T0 would measure the chase instead of gunnery.                                  |
| `noweave`: the target attacks without its combat weave                                                                      | `ShipState.labNoCombatWeave`, rung `T1-noweave`                                 | Measures what the weave costs the shooter.                                                                                                                    |
| `T1-lite`: the target holds its ground (`IdleStrategy.STAND_GROUND`, no order), capped to 450 m/s, capsule at 0.3 integrity | `createTrainingT1Map` options `standGround`, `capsuleIntegrity`; rung `T1-lite` | A rung between T0 (never fights) and T1 (unwinnable for every crew, the reference included), so crew changes show on a target that fights back.               |
| `MockDie`: every roll succeeds at roll 0                                                                                    | `modules/core/test/ship-test-harness.ts`                                        | Bounds and threshold unit tests only. Time-to-kill runs use a seeded `ShipDie`.                                                                               |
| The GVTS on NPC automation (rungs run without `crewedPlayer`, and the wave-defence `nearest-station` proxy)                 | `HeadlessGame` without `crewedPlayer`                                           | Draws no energy and aims with NPC gunnery. Crewed runs (`runTraining`'s `crewedPlayer`, the wave-defence `standoff-missiles` proxy) run the real player ship. |
