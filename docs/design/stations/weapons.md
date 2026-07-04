# Weapons Station

> **See also:** [`docs/bridge-playtest/weapons.md`](../../bridge-playtest/weapons.md) — code-grounded gap analysis from the 2026-04-25 bridge playtest session.

**Status:** Done
**Crew role:** Weapons Officer — targets enemies and fires weapons.

## What it does

Three engagement circles define combat:
1. **Close range (< 1000m):** ChainGun — rapid-fire kinetic, effective vs fighters/torpedoes
2. **Medium range (1000-4000m):** Railgun (planned) — charge time prevents close use, dodgeable at long range
3. **Long range (4000m+):** Torpedoes — self-propelled homing missiles, 720°/s tracking, 60s flight time, 100m proximity detonation

## What's built

- ChainGun with rate-of-fire control and ammo management (magazine caps: 3600 cannon shells, 2000 blast cannon shells)
- Torpedo tubes with loading mechanics
- Magazine system (finite ammunition)
- Targeting system with filters (ship-only, enemy-only, short-range-only)
- Projectile raycast (prevents bullet tunneling)
- Armor damage application at hit angle
- Chain reaction explosions and blast force propagation

## Open issues

- [#1002](https://github.com/starwards/starwards/issues/1002) — cannon shells not shown on tactical radar
- [#968](https://github.com/starwards/starwards/issues/968) — armor adjustments needed
- [#833](https://github.com/starwards/starwards/issues/833) — combine armor plates with tactical radar for single-pilot

## What's planned

- Railgun implementation (medium-range engagement circle)
- Targeting assists (lead calculation, firing solution display)
