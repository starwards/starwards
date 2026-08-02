# Decision: system mounting (`isInternal`) and electronics vulnerability (`isElectronics`) are per-ship, per-model design properties

**Date:** 2026-07
**Status:** Accepted

## Context

`isInternal`/`isElectronics` landed as `SystemState` properties in
[006](006-damage-profile-unification.md): `isInternal` decides whether a system is protected
from surface-effect scrape and from `hitsInternal: false` damage profiles (Frag), and
`isElectronics` decides whether Elec hits reach it. Both were hardcoded class constants —
every ship built from the same system class (e.g. every `Reactor`) got the same mounting and
electronics classification, regardless of ship design.

That conflated two different questions with a third: `isElectronics`/`isInternal` describe
properties of a specific *model* of a system (an armored cruiser could bury its radar behind
plating; a stripped-down interceptor could not; a shielded thruster housing could be built
non-electronic where a bare one is not) — they are config data, not code.

A first pass at this (see git history) moved `isInternal` onto a synced `DesignState` field but
still defaulted it in `make-ship-state.ts` (hardcoded `design.isInternal = true` per system,
invisible from the ship config itself) and pinned `Thruster.isInternal` in code, and left
`isElectronics` untouched as a class constant. That placement was wrong: a config author looking
at `demo-ship.ts` could not tell which systems were internal/external or electronics
without also reading `make-ship-state.ts` and the system classes.

## Decision

1. `DesignState` (the base class every system's design state extends) carries two synced
   booleans, `isInternal` and `isElectronics`, both defaulting to `false`.
   `SystemState.isInternal` and `SystemState.isElectronics` are getters reading
   `this.design.isInternal` / `this.design.isElectronics` instead of per-class `readonly`
   overrides or constants.
2. Every `*Design` type (`ThrusterDesign`, `RadarDesign`, `ChaingunDesign`, `ReactorDesign`,
   `WarpDesign`, `MagazineDesign`, `SmartPilotDesign`, `DockingDesign`, `SignalsDesign`,
   `ManeuveringDesign`) declares `isInternal: boolean` and `isElectronics: boolean` as
   **required** fields — every ship config must state both explicitly per system (and, for
   thrusters and tubes, per instance in the array), so the mounting and electronics
   classification of every system is readable directly from `demo-ship.ts` without
   cross-referencing `make-ship-state.ts` or the system class.
3. `make-ship-state.ts` no longer defaults either flag — each `make*` function does a plain
   `design.assign(design)`. The values in `demoShip` reproduce the previous hardcoded
   behavior exactly (reactor/warp/magazine/maneuvering/smart-pilot internal; everything else
   external; every electronics system flagged `isElectronics: true` as it was before).
4. **Thrusters are no longer pinned in code.** `Thruster.isInternal` is gone; mounting comes
   from `this.design.isInternal` like every other system. `demoShip`'s thrusters are
   configured `isInternal: false` (matching prior behavior), but because `thrusters` is an
   array of `[ShipDirectionConfig, ThrusterDesign]` pairs, a ship config can give individual
   thruster instances different mounting — e.g. one shielded thruster model mounted internal
   next to bare external ones. This trades away the previous guarantee that Frag/Cluster always
   reach thrusters on every ship; ship designers who rely on that mobility-kill role must keep
   thrusters external in their own config.
5. Mounting/electronics carry no mechanical cost today. Whether internal mounting should trade
   off mass, volume, or build cost is left to designer discretion for a future decision.

## Consequences

- Ship designers express "this armored cruiser buries its radar behind plating" or "this
  thruster housing is non-electronic" as a one-line config change, fully visible in the ship's
  config file — no code change and no need to read `make-ship-state.ts`.
- Because the fields live on `DesignState`, they are automatically writable through the GM
  design-state panel (see `isCommandable` in `game-field.ts`) — useful for prototyping mounting
  choices live, at the cost of a player-reachable knob with no in-fiction gate (same accepted
  limitation as every other `DesignState` field).
- Default ship behavior (`demoShip`) is unchanged: the internal/external and
  electronics/non-electronics split existing players are used to is preserved exactly, verified
  by the existing `damage-manager-matrix.spec.ts` system-scoping regressions.
- Removing the code-level thruster pin means a future ship config *could* make Frag/Cluster
  missiles unable to mobility-kill it by mounting every thruster internal — accepted as a
  ship-design tradeoff rather than an engine-enforced invariant.
