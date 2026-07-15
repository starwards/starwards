# Decision: system mounting (`isInternal`) is a per-ship design property

**Date:** 2026-07
**Status:** Accepted

## Context

`isInternal`/`isElectronics` landed as `SystemState` properties in
[006](006-damage-profile-unification.md): `isInternal` decides whether a system is protected
from surface-effect scrape and from `hitsInternal: false` damage profiles (Frag), and
`isElectronics` decides whether Elec hits reach it. Both were hardcoded class constants —
every ship built from the same system class (e.g. every `Reactor`) got the same mounting,
regardless of ship design.

That conflated two different questions: `isElectronics` describes what a system *is*
(its physical nature never changes between ships), while `isInternal` describes where a
*specific ship* mounts it (a design choice — an armored cruiser could bury its radar behind
plating; a stripped-down interceptor could not).

## Decision

1. `DesignState` (the base class every system's design state extends) gains a synced
   `isInternal` boolean, defaulting to `false`. `SystemState.isInternal` becomes a getter
   reading `this.design.isInternal` instead of a per-class `readonly` override.
2. `isElectronics` stays a class constant — unaffected by this change.
3. The five systems that were hardcoded internal (reactor, warp, magazine, maneuvering,
   smart pilot) get their default restored in `make-ship-state.ts`: each `make*` function sets
   `design.isInternal = true` before `design.assign(design)`, so existing ship configs are
   unaffected but can still override it (`assign` only touches keys present in the config
   object). Every `*Design` type gained an optional `isInternal?: boolean` field so ship
   configs can opt into a different mounting per system.
4. **Thrusters are the one exception, pinned external in code**: `Thruster.isInternal` is
   overridden to always return `false`, ignoring `design.isInternal` entirely. Frag/Cluster's
   mobility-kill role and pilot-felt damage depend on thrusters always being exposed — no ship
   config may change this.
5. Mounting carries no mechanical cost today. Whether internal mounting should trade off mass,
   volume, or build cost is left to designer discretion for a future decision.

## Consequences

- Ship designers can now express "this armored cruiser buries its radar/chain-gun behind
  plating" as a one-line config override instead of a code change.
- Because the field lives on `DesignState`, it is automatically writable through the GM
  design-state panel (see `isCommandable` in `game-field.ts`) — useful for prototyping mounting
  choices live, at the cost of a player-reachable knob with no in-fiction gate (same accepted
  limitation as every other `DesignState` field).
- Default ship behavior (`dragonflySF22`) is unchanged: the internal/external split existing
  players are used to is preserved exactly, verified by the existing
  `damage-manager-matrix.spec.ts` system-scoping regressions.
