# Line of Fire

Status: **Partial** — NPC hold-fire and the `lineOfFireBlocked` flag are built; weapons UI is Designed (ruling 2026-09-22, [#2268](https://github.com/starwards/starwards/issues/2268)).

## Rule

Friendly fire stays: a shell that meets a friendly hull detonates on it and damages it.

What changes is that shooters get told when a friendly is in the way:

- **Weapons UI**: a mount whose firing line is blocked by a friendly solid shows **BLOCKED**. The player can still fire.
- **NPC gunnery** (Done): a mount whose firing line is blocked holds fire (`isFiring = false`) for as long as it stays blocked.

## Firing line

The firing line is the segment the next shell will travel, from the muzzle to its detonation point:

- Start: the muzzle, `ship.position + ship.radius` along the mount's global bearing (the same origin `getShellExplosionLocation` uses in `modules/core/src/logic/gunner-assist.ts`).
- End: `getShellExplosionLocation(ship, chainGun)`, the point where the current fuze setting detonates the shell.
- Width: the shell's radius. A proximity fuze never arms on a friendly ship (see `SpaceManager` proximity-fuze handling in `modules/core/src/logic/space-manager.ts`), so only physical contact with the shell counts.

A mount is **blocked** when that segment, widened by the shell radius, intersects the body circle of any **friendly solid**, meaning a non-destroyed `Spaceship` of the shooter's faction other than the shooter itself. Stations are included, since they are `Spaceship`s. Neutral (`Faction.NONE`) is no faction, as everywhere else in core, so a neutral shooter is never blocked.

## Scope

- Every mount: chain guns, turrets and tubes. A tube's firing line is its launch line, `overrideSecondsToLive` × launch speed along its fitted bearing. A homing round leaves that line once it steers; this check covers only the launch.
- Asteroids have no faction, so they never block.
- `isLineOfFireBlocked` in `modules/core/src/logic/gunner-assist.ts` is the predicate. `ChainGunManager` evaluates it after the mount swings and the fuze is set, publishes `ChainGun.lineOfFireBlocked` and, for non-player ships, clears `isFiring`. Player ships evaluate it every tick (the flag feeds their weapons UI); NPC mounts only while firing, since a mount that isn't firing has nothing to hold. Tubes run on `ChainGunManager` too (their fuze is `overrideSecondsToLive`, so the tested segment is the launch line), and turret mounts are chain guns (`ChainGun` extends `Turret`).
- Weapons UI wiring is not built yet (Designed).

## Why

The headless wave-defence harness measured a GVTS guarding station-large from the far side of the station. It fired steadily while its own fire control reported the target in the kill zone 99% of the time, yet every one of its blasts in that run detonated on the station's surface and none hit a raider (the numbers are in the `training-harness` branch measurements).
