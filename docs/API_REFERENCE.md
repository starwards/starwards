---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/game-field.ts
  - modules/core/src/commands.ts
  - modules/core/src/ship/system.ts
related:
  - TECHNICAL_REFERENCE.md
  - LLM_CONTEXT.md
last_verified: 2026-07-20
---

# API Reference

## Decorators

Defined once in [`specs/DECORATORS_SPEC.md`](specs/DECORATORS_SPEC.md) — syntax, stacking order,
retrieval helpers and worked examples.

| Decorator | Purpose | Retrieval |
|---|---|---|
| `@gameField` | Colyseus schema sync (innermost, must be last) | — |
| `@commandable` | JSON Pointer remote-write surface | — |
| `@tweakable` | GM/debug UI control | `getTweakables(state)` |
| `@range` | Value constraints, static or dynamic | `getRange(root, pointer)` / `tryGetRange` |
| `@defectible` | Damageable system property | `getSystems(shipState)` |

## State Classes

### SpaceState
**Location:** `modules/core/src/space/space-state.ts`

**Properties:** `Projectile|Explosion|Asteroid|Spaceship|Waypoint: MapSchema<T>`

**Methods:**
- `get(id): SpaceObject|undefined` - Find by ID
- `getShip(id): Spaceship|undefined`
- `getBatch(ids[]): SpaceObject[]`
- `set(obj)` | `delete(obj)` - Add/remove
- `getAll(type): Iterable<T>` - Get all of type
- `[Symbol.iterator](destroyed?): Iterator` - Iterate all

**Commands (server):** `moveCommands|botOrderCommands|createAsteroidCommands|destroySpaceshipCommands`

### ShipState
**Location:** `modules/core/src/ship/ship-state.ts`

**Design:** `@gameField(ShipPropertiesDesignState) design`

**AI:** `isPlayerShip|idleStrategy|order|orderTargetId|orderPosition|currentTask`

**Systems:** `thrusters|tubes|chainGun|radar|reactor|smartPilot|armor|magazine|weaponsTarget|warp|docking|maneuvering|signals`

**Controls:** `rotation:[-1,1]|boost:[-1,1]|strafe:[-1,1]|antiDrift:[0,1]|breaks:[0,1]|afterBurner:[0,1]`

**Methods:**
- `angleThrusters(dir): Iterator<Thruster>`
- `velocityCapacity(dir): number`
- `getMaxSpeedForAfterburner(ab): number`
- `systems(): SystemState[]`
- `systemsByAreas(area): SystemState[]`

**Computed:** `velocityAngle|speed|maxSpeed|maxMaxSpeed|rotationCapacity`

### AdminState
**Location:** `modules/core/src/admin/index.ts`

**Properties:** `@gameField('int8') gameStatus | @gameField(['string']) shipIds | @gameField(['string']) playerShipIds | @gameField('float32') speed` (getter `isGameRunning`)

## Space Objects

### SpaceObjectBase (abstract)
**Location:** `modules/core/src/space/space-object-base.ts`

**Properties:** `type|destroyed|freeze|expendable|id|position|velocity|radius|angle|turnSpeed|faction|radarSectors|collisionElasticity|collisionDamage|isCorporal`

**Methods:**
- `globalToLocal(xy): XY` | `localToGlobal(xy): XY`
- `get directionAxis(): XY`

### Derived Types
- **Spaceship** (`spaceship.ts`): `+faction|radarSectors|model|callsign`
- **Projectile** (`projectile.ts`): `+design|secondsToLive|health|shipId|targetId|model|_explosion`
- **Explosion** (`explosion.ts`): `+secondsToLive|expansionSpeed|damageFactor|blastFactor`
- **Asteroid** (`asteroid.ts`): `+health`
- **Waypoint** (`waypoint.ts`): `+faction|color`

**Type guards:** `ClassName.isInstance(o): o is ClassName`

## Ship Systems

### SystemState (base)
**Location:** `modules/core/src/ship/system.ts`

**Properties:** `name|design|broken|energyPerMinute|heat:[0,100]|coolantFactor:[0,1]|power:PowerLevel|hacked:HackLevel`

**Computed:** `effectiveness = broken ? 0 : power * hacked`

**Enums:**
- `PowerLevel: SHUTDOWN=0|LOW=0.25|NORMAL=0.5|HIGH=0.75|MAX=1`
- `HackLevel: DISABLED=0|COMPROMISED=0.5|OK=1`

### Key Systems

| System | Location | Key Properties | Computed |
|--------|----------|----------------|----------|
| Reactor | `reactor.ts` | energy, effeciencyFactor | energyPerSecond |
| Thruster | `thruster.ts` | fittedBearing, active, availableCapacity | getVelocityCapacity() |
| Radar | `radar.ts` | arc, malfunctionRangeFactor (turret: bearing, bearingCommand, turnSpeedFactor) | range, broken |
| ChainGun | `chain-gun.ts` | isFiring, loadAmmo, loading, rateOfFireFactor | - |
| Tube | `tube.ts` | index (extends ChainGun/Turret: fittedBearing, isFiring, loadAmmo, loading, loadedProjectile) | (none; firing/loading handled by chain-gun-manager) |
| Targeting | `targeting.ts` | targetId, shipOnly, enemyOnly, shortRangeOnly | range, next/prev/clearTargetCommand |
| Warp | `warp.ts` | damageFactor, currentLevel, desiredLevel, currentFrequency | - |
| Armor | `armor.ts` | armorPlates[], design | numberOfPlates, numberOfHealthyPlates, degreesPerPlate |

## Commands

### sendJsonCmd
**Location:** `modules/core/src/commands.ts`

```typescript
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);
```

### handleJsonPointerCommand (server)
**Location:** `modules/core/src/commands.ts`

**Flow:** Validate pointer → check range → cap value → update state → return success

### StateCommand
**Location:** `modules/core/src/commands.ts`

```typescript
interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}
```

### cmdSender / cmdReceiver
**Location:** `modules/core/src/commands.ts`

```typescript
const send = cmdSender(room, rotateCmd, undefined);
send(0.5);

// Server
onMessage(rotateCmd.cmdName, cmdReceiver(manager, rotateCmd));
```

## Events

### EventEmitter
**Location:** `modules/core/src/events.ts`

```typescript
interface EventEmitter<T extends EventMap> {
    on<K>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    once<K>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    off<K>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    emit<K>(eventName: K, params: T[K]): unknown;
}
```

## Utilities

### XY (Vector Math)
**Location:** `modules/core/src/logic/xy.ts`

**Type:** `{x: number, y: number}`

**Static:**
- `zero|one: XY` - Constants
- `lengthOf(v): number` | `angleOf(v): number`
- `normalize(v): XY` | `rotate(v, deg): XY`
- `add(a, b)|difference(a, b)|scale(v, s)|negate(v): XY`
- `isZero(v, threshold?): boolean` | `clone(v): XY`

### Angle Utils
- `toDegreesDelta(deg): number` - Normalize to [-180, 180]
- `toPositiveDegreesDelta(deg): number` - Normalize to [0, 360]

### Range Utils
- `capToRange(min, max, value): number` - Clamp to range

**Related:** [PATTERNS.md](PATTERNS.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [DEVELOPMENT.md](DEVELOPMENT.md)
