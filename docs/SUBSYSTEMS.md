---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship
related:
  - PHYSICS.md
  - API_REFERENCE.md
last_verified: 2026-08-01
---

# Ship Subsystems

## Base: SystemState
**Location:** `modules/core/src/ship/system.ts`

**Properties:** `name|design|broken|energyPerMinute|heat:[0,100]|coolantFactor:[0,1]|power:PowerLevel|hacked:HackLevel`

**Computed:** `effectiveness = broken ? 0 : power × hacked` (where HackLevel.OK=1, COMPROMISED=0.5, DISABLED=0; coolantFactor does not affect effectiveness)

**Enums:**
- `PowerLevel: SHUTDOWN=0|LOW=0.25|NORMAL=0.5|HIGH=0.75|MAX=1`
- `HackLevel: DISABLED=0|COMPROMISED=0.5|OK=1`

## Common Properties

| Property | Range | Purpose | Effect |
|----------|-------|---------|--------|
| power | [0,1] | Power allocation | Multiplies effectiveness |
| heat | [0,100] | Thermal load | Overheat damages system |
| coolantFactor | [0,1] | Cooling allocation | Increases heat dissipation |
| hacked | [0,1] | Cyber warfare | Reduces effectiveness |
| broken | boolean | Offline status | Zero effectiveness |

**Effectiveness:** Output = maxOutput × effectiveness, where `effectiveness = broken ? 0 : power × hacked` (see `SystemState.effectiveness` in modules/core/src/ship/system.ts). `hacked` is a HackLevel multiplier (OK=1, COMPROMISED=0.5, DISABLED=0), so it scales output directly — not as (1-hacked). coolantFactor does not affect output; it only governs heat dissipation in heat-manager.ts.

**Heat:**
- Accumulation: `heat += usageHeat * dt`
- Dissipation: `heat -= (coolantFactor × coolantPerFactor) * dt`
- Overheat: If `heat > 100` → damage → broken

## Subsystems Catalog

| System | Location | Key Properties | Notes |
|--------|----------|----------------|-------|
| **Reactor** | `reactor.ts` | energy, effeciencyFactor | Primary energy generation |
| **Maneuvering** | `maneuvering.ts` | afterBurnerFuel, efficiency (design: rotationCapacity, afterBurnerCharge) | Rotation + afterburner control |
| **Thrusters** | `thruster.ts` | fittedBearing, active, afterBurnerActive, availableCapacity, bearingSkew | Directional thrust (Fwd/Back/L/R array); bolted mounts (turnSpeed 0), so `fittedBearing` is what's fixed and `bearing` stays 0 |
| **Radar** | `radar.ts` | arc, bearing, malfunctionRangeFactor | One vision sector each; a ship carries a `radars` collection and sees their union |
| **Turret** | `turret.ts` | fittedBearing, bearing, bearingCommand, bearingSkew, turnSpeedFactor, bearingLimit, bearingLimitFactor | The rotating mount shared by radars, chain guns, tubes and thrusters. `turnSpeed = design.turnSpeed * effectiveness * turnSpeedFactor`; `turnSpeed: 0` is a fixed mount |
| **ChainGun** | `chain-gun.ts` | isFiring, loadAmmo, loading, rateOfFireFactor | Rapid-fire kinetic; ship-level fire trigger drives `isFiring` on every mount that can bear, no safety |
| **Tubes** | `tube.ts` | index, safetyLocked (inherits fittedBearing, loading, rateOfFireFactor, loadedProjectile from ChainGun) | Missile launchers (array); `ShipState.fireTubesCommand` fires every loaded, unlocked tube and re-locks each one that fires |
| **Magazine** | `magazine.ts` | capacity, missiles | Ammo storage |
| **Armor** | `armor.ts` | armorPlates[] (each: layers[] of health/maxHealth), layerDesigns[], numberOfHealthyPlates, numberOfPlates | Sectional damage, layered plate stacks |
| **Targeting** | `targeting.ts` | targetId, shipOnly, enemyOnly, shortRangeOnly | Weapon targeting |
| **Warp** | `warp.ts` | currentLevel, desiredLevel, velocityFactor, damageFactor | FTL travel |
| **Docking** | `docking.ts` | mode, targetId, rangesFactor | Ship-to-ship attach |
| **SmartPilot** | `smart-pilot.ts` | rotationMode, maneuveringMode, rotation, maneuvering | Autopilot |
| **Signals** | `signals.ts` (+ `signals-job.ts`, `signals-job-manager.ts`) | jobs[], jobSuccessFactor, jobSpeedFactor, currentMaxJobs | auto-managed scan job queue, scan levels |

## Pilot Controls
**Location:** `modules/core/src/ship/ship-state.ts`

| Control | Range | Effect |
|---------|-------|--------|
| rotation | [-1,1] | Turn left(-1)/right(1) |
| boost | [-1,1] | Reverse(-1)/forward(1) thrust |
| strafe | [-1,1] | Lateral movement |
| antiDrift | [0,1] | Opposes current velocity |
| breaks | [0,1] | Rapid deceleration |
| afterBurner | [0,1] | Rotation speed boost (high heat) |

**Input mapping:** Keyboard keys and gamepad controls map to these commands via `input-config.ts`. See [Input Configuration System](TECHNICAL_REFERENCE.md#input-configuration-system) for details on step-based keyboard input (0.05 increments) and gamepad axis mapping.

## Bot AI

### Gunnery (issue #2145) — independent of `order`, but not of hull heading

Every NPC fires on the nearest hostile in its own chain-gun's weapons range by default; whether
the gun *works* never depends on `order`. An `Order.ATTACK` target has priority whenever it's
structurally reachable (in range and within some mount's bearing coverage); only while it isn't
does a free opportunity shot at another hostile happen instead — never in preference to a
reachable ordered target.

A target no mount can currently bear on is *not* simply left alone: gunnery claims the hull
heading to bring a mount to bear, weighted by the ship's flight doctrine (`FlightDoctrine` —
`INTERCEPT` turns readily, `STANDOFF` mostly holds course, `SHADOW` never turns to shoot) and,
under a MOVE order, capped at `MAX_TRANSIT_HEADING_CONCESSION` degrees off the destination bearing
so a bolted-gun NPC takes beam shots without ever flying backwards to reach something behind it.
This never happens under ATTACK/FOLLOW, where the order's own doctrine-driven steering
(`FlightProfile.headingOffset`) already governs heading, and never while some mount can already
bear — the concession releases the instant it's no longer needed.

### Orders (priority: high → low)

| Order | Args | Behavior |
|-------|------|----------|
| NONE | - | Uses idle strategy |
| MOVE | position | Navigate to coords, stop when in tolerance |
| ATTACK | targetId | Pursue target, hold at optimal distance; that target has firing priority (see Gunnery above) |
| FOLLOW | targetId, distance | Formation position, match velocity |

### Idle Strategies

Consulted only while `order === Order.NONE`.

| Strategy | Behavior |
|----------|----------|
| PLAY_DEAD | Holds fire; no automated movement (the default) |
| ROAM | Fires on hostiles like every other idle strategy; wandering movement is **not yet implemented**, so this currently behaves exactly like STAND_GROUND |
| STAND_GROUND | Fires on hostiles; never translates, but will turn the hull to bring a mount to bear (see Gunnery above) |

**Task tracking:** `@gameField('string') currentTask` (human-readable status set by the automation manager, e.g., `"Go to 100,200"`, `"Attack <targetId>"`, `"Follow <targetId>"`, `"Dock at  <targetId>"`, `"Undock from  <targetId>"`; empty string `""` when idle)

## System Interactions

### Power Distribution
```typescript
const totalPower = reactor.output × reactor.effectiveness;
const requestedPower = systems.reduce((sum, sys) => sum + (sys.power × sys.maxPowerDraw), 0);

if (requestedPower > totalPower) {
    const scale = totalPower / requestedPower;
    systems.forEach(sys => sys.actualPower = sys.power × scale);
}
```

### Heat Management
```typescript
const totalCoolant = ship.design.totalCoolant;
const totalCoolantFactors = systems.reduce((sum, sys) => sum + sys.coolantFactor, 0);

systems.forEach(sys => {
    const coolant = (sys.coolantFactor / totalCoolantFactors) × totalCoolant;
    sys.heat -= coolant × dt;
});
```

### Damage Propagation
```typescript
// AttackResolutionManager.resolveWeaponAttack (modules/core/src/ship/attack-resolution-manager.ts)
// delivery + armor engagement + channel split — resolved before any system takes damage
for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {   // front / rear
    // walk armor layers outermost-in; per damage type each layer bypasses,
    // blocks, or engages (plates erode, damage leaks via max(penetration, brokenRatio))
    exposure = walkArmorLayers(damage, areaHitRange);   // 0..1 leak-through
}
// systemScope picks targets: single random system, all in area, or ship-wide electronics
const { hits, damagedExternals } = resolveWeaponAttack(damage);

// DamageManager.takeWeaponDamage (modules/core/src/ship/damage-manager.ts)
// → damageSystem(): amount × exposure walked off in damage50-sized steps,
//   each a probabilistic @defectible roll (capped at 50%) — no direct "broken = true"
for (const hit of hits) damageSystem(hit.system, hit.damage, hit.percentageOfBrokenPlates);
```

## Damage Philosophy

**Malfunction Over Destruction:** Ships don't explode from damage. Systems malfunction, creating handicaps that players must diagnose and mitigate.

- **Soft Problems:** Increase chance of future malfunctions without immediate performance impact
- **Hard Problems:** Directly hinder system performance (e.g., broken thruster causes drift)

**Armor Uniqueness:** Only repairable at shipyards (major LARP event opportunity). Absorbs orders of magnitude more damage than internal systems.

**Thruster Damage Protocol:** When thruster fails, ship experiences asymmetric thrust. Solution:
1. Switch to Direct mode (manual control)
2. Rotate 90° to align working thrusters
3. Return to Velocity mode to counter drift

**Related:** [PHYSICS.md](PHYSICS.md) | [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md)
