# Headless training harness

Runs game maps with no Colyseus and no wall clock (`../headless-game.ts`), records them, and measures combat. Evidence and rulings: starwards-design `product/backlog.md`, section "Simulation harness".

| Runner                                                                                                         | What it runs                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm --prefix modules/server run training -- --scenario T1 --seeds 64 --timeout 300 --interval 0`              | A training rung (`training-scenarios.ts`) across seeds, with a markdown report.           |
| `node -r ts-node/register/transpile-only run-t1-missile.ts --seeds 64 --ammo HiExpMissile`                     | T1-missile: tubes only, against a raider busy on a decoy.                                 |
| `node -r ts-node/register/transpile-only run-wave-defence.ts --seed 1 --proxy standoff-missiles --max-sim 960` | One wave-defence run with a player proxy (`../wave-defence-balance-harness.ts`), as JSON. |

`fighter-half-life-*.spec.ts` pin the fighter half-life on T1 and T1-MK2, the parity target for removing the capsule (see `fighter-half-life.ts`).

The server runs the built `@starwards/core` (`modules/core/cjs`). Run `npm run build:core` after a core change, or the harness measures the old core.

## Calibration only

These flags and caps exist only to isolate one variable in a measurement. No game map sets them, and a number measured with one of them on is not a balance number for play.

| Flag or cap                                            | Where                                           | Why                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T0 target speed capped to the GVTS's 450 m/s           | `scenarios/training.ts`, `T0_TARGET_MAX_SPEED`  | Blast knock-back would otherwise fling the thrustless target out of reach, so T0 would measure the chase instead of gunnery. |
| `noweave`: the target attacks without its combat weave | `ShipState.labNoCombatWeave`, rung `T1-noweave` | Measures what the weave costs the shooter.                                                                                   |
| Unlimited ammo, every other ammo type emptied          | `run-t1-missile.ts`                             | Measures missiles per kill past the real magazine.                                                                           |
| `MockDie`: every roll succeeds at roll 0               | `modules/core/test/ship-test-harness.ts`        | Bounds and threshold unit tests only. Time-to-kill runs use a seeded `ShipDie`.                                              |
| The GVTS on NPC automation (T0, T1, T1-missile)        | `HeadlessGame` without `crewedPlayer`           | Draws no energy and aims with NPC gunnery. The crewed wave-defence proxy (`crewedPlayer`) runs the real player ship.         |
