# API Reference - Starwards

**Complete API documentation for core systems**

## Table of Contents

- [Decorator System](#decorator-system)
- [State Classes](#state-classes)
- [Space Objects](#space-objects)
- [Ship Systems](#ship-systems)
- [Command System](#command-system)
- [Event System](#event-system)
- [Utility Functions](#utility-functions)

## Decorator System

### @gameField

**Location:** [`modules/core/src/game-field.ts`](../modules/core/src/game-field.ts:16)

**Purpose:** Marks properties for Colyseus schema synchronization

**Signature:**
```typescript
function gameField(dt: DefinitionType): PropertyDecorator
```

**Parameters:**
- `dt` - Colyseus definition type:
  - Primitives: `'string'`, `'number'`, `'boolean'`, `'int8'`, `'uint8'`, `'int16'`, `'uint16'`, `'int32'`, `'uint32'`, `'int64'`, `'uint64'`, `'float32'`, `'float64'`
  - Nested: `SchemaClass`
  - Arrays: `[SchemaClass]`
  - Maps: `{ map: SchemaClass }`

**Examples:**
```typescript
// Primitives
@gameField('float32') speed = 0;
@gameField('string') name = '';
@gameField('boolean') active = true;

// Nested objects
@gameField(Reactor) reactor!: Reactor;

// Arrays
@gameField([Thruster]) thrusters = new ArraySchema<Thruster>();

// Maps
@gameField({ map: Spaceship }) ships = new MapSchema<Spaceship>();
```

**Special Behavior:**
- `float32` values are rounded to 2 decimal places
- Triggers automatic client-server synchronization
- Must be used on Schema classes

### @tweakable

**Location:** [`modules/core/src/tweakable.ts`](../modules/core/src/tweakable.ts:38)

**Purpose:** Marks properties as runtime-adjustable via UI

**Signature:**
```typescript
function tweakable<T extends Schema>(
    config: TweakableConfig | ((target: T) => TweakableConfig)
): PropertyDecorator
```

**Config Types:**
```typescript
type TweakableConfig =
    | 'boolean'
    | 'number'
    | 'string'
    | 'shipId'
    | { type: 'enum'; enum: Record<string | number, string | number> }
    | { type: 'string enum'; enum: readonly string[] }
    | { type: 'number'; number?: { min?: number; max?: number } }
```

**Examples:**
```typescript
// Simple types
@tweakable('boolean') enabled = true;
@tweakable('number') power = 1.0;
@tweakable('string') name = 'Ship';

// Enums
@tweakable({ type: 'enum', enum: Faction })
faction = Faction.PLAYER;

// Number with constraints
@tweakable({ type: 'number', number: { min: 0, max: 100 } })
health = 100;

// Dynamic config
@tweakable((t: Ship) => t.isPlayer ? 'number' : 'boolean')
property = 0;
```

**Retrieval:**
```typescript
import { getTweakables } from '@starwards/core';

const tweakables = getTweakables(state);
// Returns: TweakableValue[]
```

### @range

**Location:** [`modules/core/src/range.ts`](../modules/core/src/range.ts:39)

**Purpose:** Defines value constraints for properties

**Signature:**
```typescript
function range<T extends Schema>(
    r: Range<T> | SchemaRanges
): PropertyDecorator

type Range<T> = [number, number] | ((target: T) => [number, number])
type SchemaRanges = { [pointer: string]: Range<Schema> }
```

**Examples:**
```typescript
// Static range
@range([0, 1])
@gameField('float32')
power = 1.0;

// Dynamic range
@range((t: Reactor) => [0, t.design.maxEnergy])
@gameField('float32')
energy = 1000;

// Nested property ranges
@range({ '/property': [0, 100] })
@gameField(NestedObject)
nested = new NestedObject();
```

**Class-level decorator:**
```typescript
@rangeSchema({
    '/turnSpeed': [-90, 90],
    '/angle': [0, 360]
})
class ShipState extends Spaceship { }
```

**Retrieval:**
```typescript
import { getRange, tryGetRange } from '@starwards/core';

const range = getRange(root, pointer);  // Throws if not found
const range = tryGetRange(root, pointer);  // Returns undefined if not found
```

### @defectible

**Location:** [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts:73)

**Purpose:** Marks system properties that can be damaged

**Signature:**
```typescript
function defectible(config: DefectibleConfig): PropertyDecorator

type DefectibleConfig = {
    normal: number;  // Normal/healthy value
    name: string;    // Display name
}
```

**Example:**
```typescript
@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'efficiency' })
efficiency = 1;
```

**Retrieval:**
```typescript
import { getSystems } from '@starwards/core';

const systems = getSystems(shipState);
// Returns: System[] with defectible properties
```

## State Classes

### SpaceState

**Location:** [`modules/core/src/space/space-state.ts`](../modules/core/src/space/space-state.ts:21)

**Purpose:** Root container for space simulation

**Properties:**
```typescript
class SpaceState extends Schema {
    @gameField({ map: Projectile })
    private readonly Projectile: MapSchema<Projectile>;
    
    @gameField({ map: Explosion })
    private readonly Explosion: MapSchema<Explosion>;
    
    @gameField({ map: Asteroid })
    private readonly Asteroid: MapSchema<Asteroid>;
    
    @gameField({ map: Spaceship })
    private readonly Spaceship: MapSchema<Spaceship>;
    
    @gameField({ map: Waypoint })
    private readonly Waypoint: MapSchema<Waypoint>;
}
```

**Methods:**

**`get(id: string): SpaceObject | undefined`**
- Returns space object by ID
- Searches all object types

**`getShip(id: string): Spaceship | undefined`**
- Returns spaceship by ID

**`getBatch(ids: string[]): SpaceObject[]`**
- Returns multiple objects by IDs

**`set(obj: SpaceObject): void`**
- Adds object to appropriate map

**`delete(obj: SpaceObject): void`**
- Removes object from map

**`getAll<T>(typeField: T): Iterable<SpaceObjects[T]>`**
- Returns all objects of specific type
- Example: `state.getAll('Spaceship')`

**`[Symbol.iterator](destroyed?: boolean): IterableIterator<SpaceObject>`**
- Iterates all objects
- `destroyed=true` returns destroyed objects

**Commands (server-only):**
```typescript
moveCommands: BulkMoveArg[]
botOrderCommands: BulkBotOrderArg[]
createAsteroidCommands: CreateAsteroidOrderArg[]
createExplosionCommands: CreateExplosionOrderArg[]
createWaypointCommands: CreateWaypointOrderArg[]
createSpaceshipCommands: CreateSpaceshipOrderArg[]
destroySpaceshipCommands: string[]
```

### ShipState

**Location:** [`modules/core/src/ship/ship-state.ts`](../modules/core/src/ship/ship-state.ts:52)

**Purpose:** Complete state for a single spaceship

**Properties:**

**Design:**
```typescript
@gameField(ShipPropertiesDesignState)
design: ShipPropertiesDesignState;
```

**AI Control:**
```typescript
@gameField('boolean')
isPlayerShip: boolean;

@gameField('int8')
@tweakable({ type: 'enum', enum: IdleStrategy })
idleStrategy: IdleStrategy;

@gameField('int8')
@tweakable({ type: 'enum', enum: Order })
order: Order;

@gameField('string')
@tweakable('string')
orderTargetId: string | null;

@gameField(Vec2)
orderPosition: Vec2;

@gameField('string')
currentTask: string;
```

**Systems:**
```typescript
@gameField([Thruster])
thrusters: ArraySchema<Thruster>;

@gameField([Tube])
tubes: ArraySchema<Tube>;

@gameField(ChainGun)
chainGun: ChainGun | null;

@gameField(Radar) radar: Radar;
@gameField(Reactor) reactor: Reactor;
@gameField(SmartPilot) smartPilot: SmartPilot;
@gameField(Armor) armor: Armor;
@gameField(Magazine) magazine: Magazine;
@gameField(Targeting) weaponsTarget: Targeting;
@gameField(Warp) warp: Warp;
@gameField(Docking) docking: Docking;
@gameField(Maneuvering) maneuvering: Maneuvering;
```

**Pilot Controls:**
```typescript
@gameField('float32')
@range([-1, 1])
rotation: number;  // -1 = left, 1 = right

@gameField('float32')
@range([-1, 1])
boost: number;  // -1 = reverse, 1 = forward

@gameField('float32')
@range([-1, 1])
strafe: number;  // -1 = left, 1 = right

@gameField('float32')
@range([0, 1])
antiDrift: number;  // 0 = off, 1 = full

@gameField('float32')
@range([0, 1])
breaks: number;  // 0 = off, 1 = full

@gameField('float32')
@range([0, 1])
afterBurner: number;  // 0 = off, 1 = full
```

**Status:**
```typescript
@gameField('int8')
targeted: TargetedStatus;

@gameField('boolean')
@tweakable('boolean')
ecrControl: boolean;
```

**Methods:**

**`angleThrusters(direction: ShipDirection): IterableIterator<Thruster>`**
- Returns thrusters pointing in direction

**`velocityCapacity(direction: ShipDirection): number`**
- Returns total thrust capacity in direction

**`getMaxSpeedForAfterburner(afterBurner: number): number`**
- Calculates max speed with afterburner

**`systems(): SystemState[]`**
- Returns all ship systems

**`systemsByAreas(area: ShipArea): SystemState[]`**
- Returns systems in specific area (front/rear)

**Computed Properties:**
```typescript
get velocityAngle(): number  // Current velocity direction
get speed(): number          // Current speed magnitude
get maxSpeed(): number       // Max speed with current afterburner
get maxMaxSpeed(): number    // Absolute max speed
get rotationCapacity(): number  // Max rotation speed
```

### AdminState

**Location:** [`modules/core/src/admin/index.ts`](../modules/core/src/admin/index.ts:11)

**Purpose:** Game management state

**Properties:**
```typescript
class AdminState extends Schema {
    @gameField(SpaceState)
    space: SpaceState;
    
    @gameField('string')
    mapName: string;
    
    @gameField('boolean')
    running: boolean;
}
```

## Space Objects

### SpaceObjectBase

**Location:** [`modules/core/src/space/space-object-base.ts`](../modules/core/src/space/space-object-base.ts:34)

**Purpose:** Base class for all space objects

**Properties:**
```typescript
abstract class SpaceObjectBase extends Schema {
    abstract readonly type: keyof SpaceObjects;
    
    @gameField('boolean')
    destroyed: boolean;
    
    @tweakable('boolean')
    @gameField('boolean')
    freeze: boolean;
    
    @tweakable('boolean')
    @gameField('boolean')
    expendable: boolean;
    
    @gameField('string')
    id: string;
    
    @gameField(Vec2)
    position: Vec2;
    
    @tweakable({ type: 'number', number: { min: 0.05 } })
    @gameField('float32')
    radius: number;
    
    @gameField(Vec2)
    velocity: Vec2;
    
    @tweakable('number')
    @range([0, 360])
    @gameField('float32')
    angle: number;
    
    @tweakable({ type: 'number' })
    @gameField('float32')
    turnSpeed: number;
    
    readonly faction: Faction;
    readonly radarRange: number;
    readonly collisionElasticity: number;
    readonly collisionDamage: number;
    readonly isCorporal: boolean;
}
```

**Methods:**

**`globalToLocal(global: XY): XY`**
- Converts global coordinates to local (relative to object)

**`localToGlobal(local: XY): XY`**
- Converts local coordinates to global

**`get directionAxis(): XY`**
- Returns unit vector in object's direction

### Spaceship

**Location:** [`modules/core/src/space/spaceship.ts`](../modules/core/src/space/spaceship.ts:14)

**Extends:** `SpaceObjectBase`

**Additional Properties:**
```typescript
@gameField('int8')
@tweakable({ type: 'enum', enum: Faction })
faction: Faction;

@gameField('float32')
radarRange: number;

@gameField('float32')
health: number;
```

**Type Guard:**
```typescript
static isInstance(o: unknown): o is Spaceship
```

### Projectile

**Location:** [`modules/core/src/space/projectile.ts`](../modules/core/src/space/projectile.ts:67)

**Extends:** `SpaceObjectBase`

**Properties:**
```typescript
@gameField(ProjectileDesignState)
design: ProjectileDesignState;

@gameField('float32')
secondsToLive: number;

@gameField('string')
targetId: string | null;

@gameField('string')
ownerId: string;

@gameField(Explosion)
_explosion: Explosion | null;
```

**Type Guard:**
```typescript
static isInstance(o: unknown): o is Projectile
```

### Explosion

**Location:** [`modules/core/src/space/explosion.ts`](../modules/core/src/space/explosion.ts:28)

**Extends:** `SpaceObjectBase`

**Properties:**
```typescript
@gameField('float32')
secondsToLive: number;

@gameField('float32')
expansionSpeed: number;

@gameField('float32')
damageFactor: number;

@gameField('float32')
blastFactor: number;
```

**Type Guard:**
```typescript
static isInstance(o: unknown): o is Explosion
```

### Asteroid

**Location:** [`modules/core/src/space/asteroid.ts`](../modules/core/src/space/asteroid.ts:11)

**Extends:** `SpaceObjectBase`

**Properties:**
```typescript
@gameField('float32')
health: number;
```

**Type Guard:**
```typescript
static isInstance(o: unknown): o is Asteroid
```

### Waypoint

**Location:** [`modules/core/src/space/waypoint.ts`](../modules/core/src/space/waypoint.ts:13)

**Extends:** `SpaceObjectBase`

**Properties:**
```typescript
@gameField('int8')
@tweakable({ type: 'enum', enum: Faction })
faction: Faction;

@gameField('uint32')
@tweakable('number')
@range([0x000000, 0xffffff])
color: number;  // RGB hex color
```

**Type Guard:**
```typescript
static isInstance(o: unknown): o is Waypoint
```

## Ship Systems

### SystemState

**Location:** [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts:36)

**Purpose:** Base class for all ship systems

**Properties:**
```typescript
abstract class SystemState extends Schema {
    abstract readonly name: string;
    abstract readonly design: DesignState;
    abstract readonly broken: boolean;
    
    @gameField('float32')
    energyPerMinute: number;
    
    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @gameField('float32')
    heat: number;
    
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    coolantFactor: number;
    
    @range([0, 1])
    @tweakable({ type: 'enum', enum: PowerLevel })
    @gameField('float32')
    power: PowerLevel;
    
    @range([0, 1])
    @tweakable({ type: 'enum', enum: HackLevel })
    @gameField('float32')
    hacked: HackLevel;
}
```

**Computed:**
```typescript
get effectiveness(): number {
    return this.broken ? 0 : this.power * this.hacked;
}
```

**Enums:**
```typescript
enum PowerLevel {
    SHUTDOWN = 0,
    LOW = 0.25,
    MID = 0.5,
    HIGH = 0.75,
    MAX = 1
}

enum HackLevel {
    DISABLED = 0,
    COMPROMISED = 0.5,
    OK = 1
}
```

### Reactor

**Location:** [`modules/core/src/ship/reactor.ts`](../modules/core/src/ship/reactor.ts:23)

**Purpose:** Energy generation system

**Design Properties:**
```typescript
class ReactorDesignState extends DesignState {
    @gameField('float32') energyPerSecond: number;
    @gameField('float32') maxEnergy: number;
    @gameField('float32') energyHeatEPMThreshold: number;
    @gameField('float32') energyHeat: number;
    @gameField('float32') damage50: number;
}
```

**State Properties:**
```typescript
@gameField('number')
@range((t: Reactor) => [0, t.design.maxEnergy])
@tweakable('number')
energy: number;

@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'efficiency' })
efficiencyFactor: number;
```

### Thruster

**Location:** [`modules/core/src/ship/thruster.ts`](../modules/core/src/ship/thruster.ts:23)

**Purpose:** Directional propulsion

**Design Properties:**
```typescript
class ThrusterDesignState extends DesignState {
    @gameField('float32') damage50: number;
    @gameField('float32') velocityCapacity: number;
    @gameField('float32') energyCost: number;
}
```

**State Properties:**
```typescript
@gameField('float32')
@range([0, 360])
angle: number;  // Direction thruster points

@gameField('float32')
@range([0, 1])
active: number;  // Activation level

@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'efficiency' })
efficiency: number;
```

**Methods:**
```typescript
getVelocityCapacity(ship: ShipState): number
```

### Radar

**Location:** [`modules/core/src/ship/radar.ts`](../modules/core/src/ship/radar.ts:29)

**Purpose:** Detection and scanning

**Design Properties:**
```typescript
class RadarDesignState extends DesignState {
    @gameField('float32') damage50: number;
    @gameField('float32') range: number;
    @gameField('float32') energyCost: number;
    @gameField('float32') rangeEaseFactor: number;
    @gameField('float32') malfunctionRange: number;
}
```

**State Properties:**
```typescript
@gameField('float32')
@defectible({ normal: 0, name: 'range fluctuation' })
@range((t: Radar) => [0, 1 - t.design.rangeEaseFactor * 2])
malfunctionRangeFactor: number;
```

**Computed:**
```typescript
get range(): number
```

### ChainGun

**Location:** [`modules/core/src/ship/chain-gun.ts`](../modules/core/src/ship/chain-gun.ts:116)

**Purpose:** Rapid-fire weapon

**Design Properties:**
```typescript
class ChainGunDesignState extends DesignState {
    @gameField('float32') damage50: number;
    @gameField('float32') energyCost: number;
    @gameField('float32') rateOfFire: number;
    @gameField('float32') ammoPerShot: number;
    @gameField('float32') projectileSpeed: number;
    @gameField('float32') projectileLifetime: number;
    @gameField('float32') projectileDamage: number;
}
```

**State Properties:**
```typescript
@tweakable('boolean')
@gameField('boolean')
isFiring: boolean;

@tweakable('boolean')
@gameField('boolean')
loadAmmo: boolean;

@gameField('float32')
@range([0, 1])
loading: number;

@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'rate of fire' })
rateOfFireFactor: number;
```

### Tube

**Location:** [`modules/core/src/ship/tube.ts`](../modules/core/src/ship/tube.ts:82)

**Purpose:** Missile launcher

**Design Properties:**
```typescript
class TubeDesignState extends DesignState {
    @gameField('float32') damage50: number;
    @gameField('float32') energyCost: number;
    @gameField('float32') loadTime: number;
    @gameField('float32') projectileSpeed: number;
    @gameField('float32') projectileLifetime: number;
    @gameField('float32') projectileDamage: number;
    @gameField(HomingDesignState) homing: HomingDesignState | null;
}
```

**State Properties:**
```typescript
@gameField('float32')
@range([0, 360])
angle: number;

@gameField('boolean')
loaded: boolean;

@gameField('float32')
@range([0, 1])
loading: number;

@gameField('float32')
@range([0, 1])
@defectible({ normal: 1, name: 'load time' })
loadTimeFactor: number;
```

**Commands (server-only):**
```typescript
fireCommand: boolean;
loadCommand: boolean;
```

### Targeting

**Location:** [`modules/core/src/ship/targeting.ts`](../modules/core/src/ship/targeting.ts:17)

**Purpose:** Weapon targeting system

**Design Properties:**
```typescript
class TargetingDesignState extends DesignState {
    @gameField('uint32') maxRange: number;
    @gameField('uint32') shortRange: number;
}
```

**State Properties:**
```typescript
@gameField('string')
@tweakable('string')
targetId: string | null;

@gameField('boolean')
@tweakable('boolean')
shipOnly: boolean;

@gameField('boolean')
@tweakable('boolean')
enemyOnly: boolean;

@gameField('boolean')
@tweakable('boolean')
shortRangeOnly: boolean;
```

**Commands (server-only):**
```typescript
nextTargetCommand: boolean;
prevTargetCommand: boolean;
clearTargetCommand: boolean;
```

**Computed:**
```typescript
get range(): number {
    return this.shortRangeOnly ? this.design.shortRange : this.design.maxRange;
}
```

### Warp

**Location:** [`modules/core/src/ship/warp.ts`](../modules/core/src/ship/warp.ts:40)

**Purpose:** FTL travel system

**Design Properties:**
```typescript
class WarpDesignState extends DesignState {
    @gameField('float32') damage50: number;
    @gameField('float32') maxProximity: number;
    @gameField('float32') chargeTime: number;
    @gameField('float32') dechargeTime: number;
    @gameField('float32') speedPerLevel: number;
    @gameField('float32') energyCostPerLevel: number;
    @gameField('float32') damagePerPhysicalSpeed: number;
    @gameField('float32') baseDamagePerWarpSpeedPerSecond: number;
    @gameField('float32') secondsToChangeFrequency: number;
}
```

**State Properties:**
```typescript
@gameField('float32')
@range([0, 1])
@defectible({ normal: 0, name: 'damage' })
damageFactor: number;

@gameField('float32')
@range([0, MAX_WARP_LVL])
@tweakable('number')
currentLevel: number;

@gameField('uint8')
@range([0, MAX_WARP_LVL])
@tweakable('number')
desiredLevel: number;

@gameField('int8')
@tweakable({ type: 'enum', enum: WarpFrequency })
currentFrequency: WarpFrequency;

@gameField('int8')
@tweakable({ type: 'enum', enum: WarpFrequency })
standbyFrequency: WarpFrequency;

@range([0, 1])
@gameField('float32')
frequencyChange: number;

@gameField('boolean')
changingFrequency: boolean;
```

**Enums:**
```typescript
enum WarpFrequency {
    W770HZ,
    W880HZ,
    W990HZ
}
```

## Command System

### sendJsonCmd

**Location:** [`modules/core/src/commands.ts`](../modules/core/src/commands.ts:19)

**Purpose:** Send JSON Pointer command to room

**Signature:**
```typescript
function sendJsonCmd(
    room: GameRoom<RoomName>,
    pointerStr: string,
    value: Primitive
): void
```

**Example:**
```typescript
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);
```

### handleJsonPointerCommand

**Location:** [`modules/core/src/commands.ts`](../modules/core/src/commands.ts:90)

**Purpose:** Server-side JSON Pointer command handler

**Signature:**
```typescript
function handleJsonPointerCommand(
    message: unknown,
    type: string | number,
    root: Schema
): boolean
```

**Behavior:**
- Validates pointer path
- Checks range constraints
- Caps value to range
- Updates state
- Returns true if handled

### StateCommand

**Location:** [`modules/core/src/commands.ts`](../modules/core/src/commands.ts:6)

**Purpose:** Type-safe command definition

**Interface:**
```typescript
interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}
```

**Example:**
```typescript
const rotateCmd: StateCommand<number, ShipState, void> = {
    cmdName: 'rotate',
    setValue: (state, value) => {
        state.rotation = value;
    }
};
```

### cmdSender

**Location:** [`modules/core/src/commands.ts`](../modules/core/src/commands.ts:29)

**Purpose:** Create command sender function

**Signature:**
```typescript
function cmdSender<T, R extends RoomName, P = void>(
    room: GameRoom<R>,
    p: { cmdName: string },
    path: P
): (value: T) => void
```

**Example:**
```typescript
const sendRotate = cmdSender(room, rotateCmd, undefined);
sendRotate(0.5);
```

### cmdReceiver

**Location:** [`modules/core/src/commands.ts`](../modules/core/src/commands.ts:71)

**Purpose:** Create command receiver for server

**Signature:**
```typescript
function cmdReceiver<T, S extends Schema, P>(
    manager: Stateful<S>,
    p: StateCommand<T, S, P>
): (client: unknown, m: { value: T; path: P }) => unknown
```

## Event System

### EventEmitter

**Location:** [`modules/core/src/events.ts`](../modules/core/src/events.ts:8)

**Purpose:** Type-safe event handling

**Interface:**
```typescript
interface EventEmitter<T extends EventMap> {
    on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    once<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    emit<K extends EventKey<T>>(eventName: K, params: T[K]): unknown;
}
```

**Example:**
```typescript
events.on('stateChange', (state) => {
    console.log('State changed:', state);
});

events.emit('stateChange', newState);
```

## Utility Functions

### XY (Vector Math)

**Location:** [`modules/core/src/logic/xy.ts`](../modules/core/src/logic/xy.ts)

**Type:**
```typescript
type XY = { x: number; y: number };
```

**Functions:**

**`XY.zero: XY`** - Zero vector (0, 0)

**`XY.one: XY`** - Unit vector (1, 1)

**`XY.lengthOf(v: XY): number`** - Vector magnitude

**`XY.angleOf(v: XY): number`** - Vector angle in degrees

**`XY.normalize(v: XY, length?: number): XY`** - Normalize to length

**`XY.rotate(v: XY, degrees: number): XY`** - Rotate vector

**`XY.add(a: XY, b: XY): XY`** - Add vectors

**`XY.difference(a: XY, b: XY): XY`** - Subtract vectors

**`XY.scale(v: XY, scalar: number): XY`** - Multiply by scalar

**`XY.negate(v: XY): XY`** - Negate vector

**`XY.isZero(v: XY, threshold?: number): boolean`** - Check if near zero

**`XY.clone(v: XY): XY`** - Deep copy

### Angle Utilities

**`toDegreesDelta(degrees: number): number`**
- Normalizes to [-180, 180] range

**`toPositiveDegreesDelta(degrees: number): number`**
- Normalizes to [0, 360] range

### Range Utilities

**`capToRange(min: number, max: number, value: number): number`**
- Clamps value to [min, max]

### ID Generation

**Location:** [`modules/core/src/id.ts