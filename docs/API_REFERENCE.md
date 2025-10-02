# API Reference

## Decorators

### @gameField
**Location:** `modules/core/src/game-field.ts:16`

**Marks properties for Colyseus schema synchronization**

```typescript
@gameField('float32') speed = 0;                    // Primitives
@gameField(Radar) radar!: Radar;                    // Nested
@gameField([Thruster]) thrusters = new ArraySchema<Thruster>();  // Array
@gameField({ map: Spaceship }) ships = new MapSchema<Spaceship>(); // Map
```

**Types:** `'int8'|'int16'|'int32'|'float32'|'float64'|'boolean'|'string'` | Schema | `[Schema]` | `{map:Schema}`

**Note:** float32 rounds to 2 decimals, triggers auto-sync

### @tweakable
**Location:** `modules/core/src/tweakable.ts:38`

**Marks properties for GM/debug UI adjustment**

```typescript
@tweakable('boolean') enabled = true;
@tweakable('number') power = 1.0;
@tweakable({ type: 'enum', enum: Faction }) faction = Faction.PLAYER;
@tweakable({ type: 'number', number: { min: 0, max: 100 } }) health = 100;
```

**Retrieval:** `getTweakables(state) → TweakableValue[]`

### @range
**Location:** `modules/core/src/range.ts:39`

**Defines value constraints**

```typescript
@range([0, 1]) power = 1.0;                         // Static
@range((t: Reactor) => [0, t.design.maxEnergy]) energy = 1000;  // Dynamic
@range({ '/property': [0, 100] }) nested;           // Nested

// Class-level
@rangeSchema({'/turnSpeed': [-90, 90], '/angle': [0, 360]})
class ShipState { }
```

**Retrieval:** `getRange(root, pointer)` | `tryGetRange(root, pointer)`

### @defectible
**Location:** `modules/core/src/ship/system.ts:73`

**Marks damageable system properties**

```typescript
@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'efficiency' })
efficiency = 1;
```

**Retrieval:** `getSystems(shipState) → System[]`

## State Classes

### SpaceState
**Location:** `modules/core/src/space/space-state.ts:21`

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
**Location:** `modules/core/src/ship/ship-state.ts:52`

**Design:** `@gameField(ShipPropertiesDesignState) design`

**AI:** `isPlayerShip|idleStrategy|order|orderTargetId|orderPosition|currentTask`

**Systems:** `thrusters|tubes|chainGun|radar|reactor|smartPilot|armor|magazine|weaponsTarget|warp|docking|maneuvering`

**Controls:** `rotation:[-1,1]|boost:[-1,1]|strafe:[-1,1]|antiDrift:[0,1]|breaks:[0,1]|afterBurner:[0,1]`

**Methods:**
- `angleThrusters(dir): Iterator<Thruster>`
- `velocityCapacity(dir): number`
- `getMaxSpeedForAfterburner(ab): number`
- `systems(): SystemState[]`
- `systemsByAreas(area): SystemState[]`

**Computed:** `velocityAngle|speed|maxSpeed|maxMaxSpeed|rotationCapacity`

### AdminState
**Location:** `modules/core/src/admin/index.ts:11`

**Properties:** `@gameField(SpaceState) space | @gameField('string') mapName | @gameField('boolean') running`

## Space Objects

### SpaceObjectBase (abstract)
**Location:** `modules/core/src/space/space-object-base.ts:34`

**Properties:** `type|destroyed|freeze|expendable|id|position|velocity|radius|angle|turnSpeed|faction|radarRange|collisionElasticity|collisionDamage|isCorporal`

**Methods:**
- `globalToLocal(xy): XY` | `localToGlobal(xy): XY`
- `get directionAxis(): XY`

### Derived Types
- **Spaceship** (`spaceship.ts:14`): `+faction|radarRange|health`
- **Projectile** (`projectile.ts:67`): `+design|secondsToLive|targetId|ownerId|_explosion`
- **Explosion** (`explosion.ts:28`): `+secondsToLive|expansionSpeed|damageFactor|blastFactor`
- **Asteroid** (`asteroid.ts:11`): `+health`
- **Waypoint** (`waypoint.ts:13`): `+faction|color`

**Type guards:** `ClassName.isInstance(o): o is ClassName`

## Ship Systems

### SystemState (base)
**Location:** `modules/core/src/ship/system.ts:36`

**Properties:** `name|design|broken|energyPerMinute|heat:[0,100]|coolantFactor:[0,1]|power:PowerLevel|hacked:HackLevel`

**Computed:** `effectiveness = broken ? 0 : power * coolantFactor * (1-hacked)`

**Enums:**
- `PowerLevel: SHUTDOWN=0|LOW=0.25|MID=0.5|HIGH=0.75|MAX=1`
- `HackLevel: DISABLED=0|COMPROMISED=0.5|OK=1`

### Key Systems

| System | Location | Key Properties | Computed |
|--------|----------|----------------|----------|
| Reactor | `reactor.ts:23` | energy, efficiencyFactor | - |
| Thruster | `thruster.ts:23` | angle, active, efficiency | getVelocityCapacity() |
| Radar | `radar.ts:29` | malfunctionRangeFactor | range |
| ChainGun | `chain-gun.ts:116` | isFiring, loadAmmo, loading, rateOfFireFactor | - |
| Tube | `tube.ts:82` | angle, loaded, loading, loadTimeFactor | fireCommand, loadCommand |
| Targeting | `targeting.ts:17` | targetId, shipOnly, enemyOnly, shortRangeOnly | range, next/prev/clearTargetCommand |
| Warp | `warp.ts:40` | damageFactor, currentLevel, desiredLevel, currentFrequency | - |
| Armor | `armor.ts` | plates[], healthyPlates, totalHealth | - |

## Commands

### sendJsonCmd
**Location:** `modules/core/src/commands.ts:19`

```typescript
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);
```

### handleJsonPointerCommand (server)
**Location:** `modules/core/src/commands.ts:90`

**Flow:** Validate pointer → check range → cap value → update state → return success

### StateCommand
**Location:** `modules/core/src/commands.ts:6`

```typescript
interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}
```

### cmdSender / cmdReceiver
**Location:** `modules/core/src/commands.ts:29|71`

```typescript
const send = cmdSender(room, rotateCmd, undefined);
send(0.5);

// Server
onMessage(rotateCmd.cmdName, cmdReceiver(manager, rotateCmd));
```

## Events

### EventEmitter
**Location:** `modules/core/src/events.ts:8`

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
- `normalize(v, len?): XY` | `rotate(v, deg): XY`
- `add(a, b)|difference(a, b)|scale(v, s)|negate(v): XY`
- `isZero(v, threshold?): boolean` | `clone(v): XY`

### Angle Utils
- `toDegreesDelta(deg): number` - Normalize to [-180, 180]
- `toPositiveDegreesDelta(deg): number` - Normalize to [0, 360]

### Range Utils
- `capToRange(min, max, value): number` - Clamp to range

**Related:** [PATTERNS.md](PATTERNS.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [DEVELOPMENT.md](DEVELOPMENT.md)
