# Ship Subsystems

## Base: SystemState
**Location:** `modules/core/src/ship/system.ts:36`

**Properties:** `name|design|broken|energyPerMinute|heat:[0,100]|coolantFactor:[0,1]|power:PowerLevel|hacked:HackLevel`

**Computed:** `effectiveness = broken ? 0 : power × coolantFactor × (1 - hacked)`

**Enums:**
- `PowerLevel: SHUTDOWN=0|LOW=0.25|MID=0.5|HIGH=0.75|MAX=1`
- `HackLevel: DISABLED=0|COMPROMISED=0.5|OK=1`

## Common Properties

| Property | Range | Purpose | Effect |
|----------|-------|---------|--------|
| power | [0,1] | Power allocation | Multiplies effectiveness |
| heat | [0,100] | Thermal load | Overheat damages system |
| coolantFactor | [0,1] | Cooling allocation | Increases heat dissipation |
| hacked | [0,1] | Cyber warfare | Reduces effectiveness |
| broken | boolean | Offline status | Zero effectiveness |

**Effectiveness:** Output = maxOutput × (power × coolantFactor × (1-hacked))

**Heat:**
- Accumulation: `heat += usageHeat * dt`
- Dissipation: `heat -= (coolantFactor × coolantPerFactor) * dt`
- Overheat: If `heat > 100` → damage → broken

## Subsystems Catalog

| System | Location | Key Properties | Notes |
|--------|----------|----------------|-------|
| **Reactor** | `reactor.ts:23` | energy, efficiencyFactor | Primary energy generation |
| **Maneuvering** | `maneuvering.ts` | rotationSpeed, afterburnerBoost | Rotation + afterburner control |
| **Thrusters** | `thruster.ts:23` | angle, active, efficiency | Directional thrust (Fwd/Back/L/R array) |
| **Radar** | `radar.ts:29` | range, malfunctionRangeFactor | Detection range |
| **ChainGun** | `chain-gun.ts:116` | isFiring, loadAmmo, loading, rateOfFireFactor | Rapid-fire kinetic |
| **Tubes** | `tube.ts:82` | angle, loaded, loading, loadTimeFactor | Missile launchers (array) |
| **Magazine** | `magazine.ts` | capacity, missiles | Ammo storage |
| **Armor** | `armor.ts` | plates[], healthyPlates, totalHealth | Sectional damage |
| **Targeting** | `targeting.ts:17` | targetId, shipOnly, enemyOnly, shortRangeOnly | Weapon targeting |
| **Warp** | `warp.ts:40` | chargeLevel, currentLevel, desiredLevel | FTL travel |
| **Docking** | `docking.ts` | docked, dockedTo, dockingRange | Ship-to-ship attach |
| **SmartPilot** | `smartpilot.ts` | mode, targetAngle, targetPosition | Autopilot |

## Pilot Controls
**Location:** `modules/core/src/ship/ship-state.ts:52`

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

### Orders (priority: high → low)

| Order | Args | Behavior |
|-------|------|----------|
| NONE | - | Uses idle strategy |
| MOVE | position | Navigate to coords, stop when in tolerance |
| ATTACK | targetId | Pursue target, fire when in range, maintain optimal distance |
| FOLLOW | targetId, distance | Formation position, match velocity |

### Idle Strategies

| Strategy | Behavior |
|----------|----------|
| PLAY_DEAD | No movement, minimal power, appears inactive |
| ROAM | Random patrol, scan threats, engage on detection |
| STAND_GROUND | Hold position, track threats, fire on approach, don't pursue |

**Task tracking:** `@gameField('string') currentTask` (e.g., `"idle:play_dead"`, `"order:move"`, `"order:attack"`)

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
armor.takeDamage(damage, hitAngle);

if (armor.isBroken(hitAngle)) {
    const internalDamage = damage × ARMOR_PENETRATION_FACTOR;
    randomSystem.broken = true;
}
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
