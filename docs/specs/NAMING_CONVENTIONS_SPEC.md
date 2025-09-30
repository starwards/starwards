# Naming Conventions Specification

@category: code-standards
@stability: stable
@source: docs/PATTERNS.md

## Quick Reference Table

| Element | Convention | Example | Counter-Example |
|---------|-----------|---------|-----------------|
| Files | kebab-case | `ship-state.ts` | `ShipState.ts` |
| Classes | PascalCase | `SpaceManager` | `spaceManager` |
| Functions | camelCase | `updateVelocity` | `UpdateVelocity` |
| Variables | camelCase | `currentSpeed` | `current_speed` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SYSTEM_HEAT` | `maxSystemHeat` |
| Enums | PascalCase | `Faction` | `faction` |
| Enum Values | SCREAMING_SNAKE_CASE | `PLAYER` | `player` |
| Interfaces | PascalCase | `SpaceObject` | `ISpaceObject` |
| Types | PascalCase | `EventMap` | `TEventMap` |

---

# File Naming
@pattern: kebab-case
@stability: stable

-> applies-to: all-source-files
-> excludes: configuration-files
:: naming-convention

## Pattern
```
kebab-case.extension
```

## Rules
- All lowercase
- Words separated by hyphens
- Descriptive names
- Match primary export

## Examples

### ✅ Correct
```
ship-state.ts
space-manager.ts
connection-manager.ts
game-field.ts
tactical-radar.ts
damage-report.tsx
```

### ❌ Wrong
```
ShipState.ts          // PascalCase
spaceManager.ts       // camelCase
connection_manager.ts // snake_case
gameField.TS          // Wrong case
TacticalRadar.tsx     // PascalCase
```

## File Suffixes

### Source Files
```
.ts     - TypeScript source
.tsx    - React/JSX components
.js     - JavaScript source
.jsx    - React/JSX (legacy)
```

### Test Files
```
.spec.ts    - Unit tests
.test.ts    - Integration tests
.e2e.ts     - End-to-end tests
```

### Type Definitions
```
.d.ts       - Type declarations
```

### Templates
```
.html       - HTML templates
```

### Configuration
```
.json       - JSON config
.yml/.yaml  - YAML config
.config.js  - JS config
```

## File Naming Patterns

### State Classes
```
ship-state.ts       → class ShipState
space-state.ts      → class SpaceState
reactor-state.ts    → class ReactorState
```

### Managers
```
space-manager.ts        → class SpaceManager
energy-manager.ts       → class EnergyManager
connection-manager.ts   → class ConnectionManager
```

### Components
```
lobby.tsx               → Lobby component
save-load-game.tsx      → SaveLoadGame component
damage-report.tsx       → DamageReport component
```

### Utilities
```
async-utils.ts      → Async utilities
collision-utils.ts  → Collision utilities
```

---

# Class Naming
@pattern: PascalCase
@stability: stable

-> applies-to: classes-interfaces-types
-> excludes: none
:: naming-convention

## Pattern
```
PascalCase
```

## Rules
- First letter uppercase
- Each word capitalized
- No separators
- Descriptive names

## Examples

### ✅ Correct
```typescript
class SpaceState extends Schema { }
class ShipManager { }
class ConnectionManager { }
class ReactorDesignState { }
```

### ❌ Wrong
```typescript
class spaceState { }        // camelCase
class ship_manager { }      // snake_case
class connectionmanager { } // no separation
class SPACE_STATE { }       // SCREAMING_SNAKE_CASE
```

## Common Suffixes

### State Classes
```typescript
class SpaceState extends Schema { }
class ShipState extends Spaceship { }
class AdminState extends Schema { }
class ReactorState extends SystemState { }
```

### Manager Classes
```typescript
class SpaceManager implements Updateable { }
class EnergyManager implements Updateable { }
class HeatManager implements Updateable { }
class DamageManager { }
```

### Room Classes
```typescript
class AdminRoom extends Room<AdminState> { }
class ShipRoom extends Room<ShipState> { }
class SpaceRoom extends Room<SpaceState> { }
```

### Driver Classes
```typescript
class ShipDriver { }
class SpaceDriver { }
class AdminDriver { }
```

### Design Classes
```typescript
class ReactorDesignState extends DesignState { }
class ThrusterDesignState extends DesignState { }
class RadarDesignState extends DesignState { }
```

---

# Function & Method Naming
@pattern: camelCase
@stability: stable

-> applies-to: functions-methods
-> excludes: constructors
:: naming-convention

## Pattern
```
camelCase
```

## Rules
- First letter lowercase
- Subsequent words capitalized
- Verb-based names
- Descriptive action

## Examples

### ✅ Correct
```typescript
function handleCollision() { }
function updateVelocity() { }
function getRange() { }
function setVelocity() { }
function isSpaceObject() { }
```

### ❌ Wrong
```typescript
function HandleCollision() { }  // PascalCase
function update_velocity() { }  // snake_case
function GETRANGE() { }         // SCREAMING_SNAKE_CASE
function range() { }            // Not descriptive
```

## Common Prefixes

### Getters
```typescript
function getRange(root: Schema, pointer: JsonPointer): RTuple2
function getEnergy(): number
function getMaxSpeed(): number
function getSystems(root: Schema): System[]
```

### Setters
```typescript
function setVelocity(id: string, velocity: XY): void
function setPower(value: number): void
function setTarget(targetId: string): void
function setValue(value: unknown): void
```

### Boolean Checks
```typescript
function isSpaceObject(k: unknown): k is SpaceObject
function isValid(value: unknown): boolean
function hasTarget(ship: ShipState): boolean
function canFire(): boolean
function shouldUpdate(): boolean
```

### Event Handlers
```typescript
function handleCollision(response: SWResponse): void
function handleCommand(message: unknown): void
function handleError(error: Error): void
function handleClick(event: MouseEvent): void
```

### Calculations
```typescript
function calcDamage(amount: number): number
function calculateThrust(thruster: Thruster): number
function computeDistance(a: XY, b: XY): number
```

### Updates
```typescript
function updatePhysics(deltaSeconds: number): void
function updateEnergy(deltaSeconds: number): void
function updateHeat(deltaSeconds: number): void
```

### Factories
```typescript
function createWidget(config: WidgetConfig): Widget
function createAsteroid(position: Vec2): Asteroid
function makeId(): string
```

---

# Variable & Property Naming
@pattern: camelCase
@stability: stable

-> applies-to: variables-properties
-> excludes: constants
:: naming-convention

## Pattern
```
camelCase
```

## Rules
- First letter lowercase
- Subsequent words capitalized
- Descriptive names
- Noun-based

## Examples

### ✅ Correct
```typescript
const spaceManager = new SpaceManager();
let currentSpeed = 0;
this.energyPerMinute = 100;
const targetId = 'ship-1';
```

### ❌ Wrong
```typescript
const SpaceManager = new SpaceManager();  // PascalCase
let current_speed = 0;                    // snake_case
this.EnergyPerMinute = 100;               // PascalCase
const target_id = 'ship-1';               // snake_case
```

## Boolean Naming

### Prefixes
```typescript
// is* - State check
isPlayerShip: boolean
isDestroyed: boolean
isCorporal: boolean

// has* - Possession check
hasTarget: boolean
hasEnergy: boolean
hasAmmo: boolean

// can* - Capability check
canFire: boolean
canMove: boolean
canWarp: boolean

// should* - Conditional check
shouldUpdate: boolean
shouldRender: boolean
shouldSync: boolean
```

### ❌ Ambiguous Boolean Names
```typescript
// Avoid these - unclear if boolean
playerShip: boolean    // Use isPlayerShip
target: boolean        // Use hasTarget
fire: boolean          // Use canFire
update: boolean        // Use shouldUpdate
```

## Collection Naming

### Arrays
```typescript
const ships: Spaceship[] = [];
const projectiles: Projectile[] = [];
const systems: SystemState[] = [];
```

### Maps
```typescript
const shipsById: Map<string, Spaceship> = new Map();
const objectsByType: Record<string, SpaceObject[]> = {};
```

### Sets
```typescript
const activeIds: Set<string> = new Set();
const visitedNodes: Set<Node> = new Set();
```

---

# Constant Naming
@pattern: SCREAMING_SNAKE_CASE
@stability: stable

-> applies-to: constants-only
-> excludes: variables
:: naming-convention

## Pattern
```
SCREAMING_SNAKE_CASE
```

## Rules
- All uppercase
- Words separated by underscores
- Truly constant values
- Module-level scope

## Examples

### ✅ Correct
```typescript
const MAX_SYSTEM_HEAT = 100;
const ZERO_VELOCITY_THRESHOLD = 0;
const GC_TIMEOUT = 5;
const MAX_WARP_LVL = 9;
const DEFAULT_RADIUS = 0.05;
```

### ❌ Wrong
```typescript
const maxSystemHeat = 100;      // camelCase
const MaxSystemHeat = 100;      // PascalCase
const max_system_heat = 100;    // lowercase snake_case
```

## When to Use

### ✅ Use for Constants
```typescript
// Configuration values
const MAX_ENERGY = 10000;
const DEFAULT_SPEED = 100;

// Thresholds
const COLLISION_THRESHOLD = 0.1;
const HEAT_WARNING_LEVEL = 75;

// Timeouts
const CONNECTION_TIMEOUT = 5000;
const RETRY_DELAY = 1000;

// Magic numbers
const DEGREES_IN_CIRCLE = 360;
const RADIANS_TO_DEGREES = 180 / Math.PI;
```

### ❌ Don't Use for Variables
```typescript
// These change - use camelCase
let currentEnergy = 1000;      // Not CURRENT_ENERGY
let playerCount = 0;           // Not PLAYER_COUNT
const ship = new Ship();       // Not SHIP
```

---

# Enum Naming
@pattern: PascalCase-for-enum-SCREAMING_SNAKE_CASE-for-values
@stability: stable

-> applies-to: enums
-> values: SCREAMING_SNAKE_CASE
:: naming-convention

## Pattern
```typescript
enum EnumName {
    VALUE_ONE,
    VALUE_TWO
}
```

## Examples

### ✅ Correct
```typescript
enum Faction {
    NONE,
    PLAYER,
    ENEMY,
    NEUTRAL
}

enum Order {
    NONE,
    MOVE,
    ATTACK,
    FOLLOW
}

enum PowerLevel {
    SHUTDOWN = 0,
    LOW = 0.25,
    MID = 0.5,
    HIGH = 0.75,
    MAX = 1
}
```

### ❌ Wrong
```typescript
enum faction {              // lowercase
    none,                   // lowercase
    player,                 // lowercase
    enemy                   // lowercase
}

enum FACTION {              // SCREAMING_SNAKE_CASE
    NONE,
    PLAYER,
    ENEMY
}

enum Faction {
    None,                   // PascalCase
    Player,                 // PascalCase
    Enemy                   // PascalCase
}
```

## Usage
```typescript
// Enum name: PascalCase
enum Faction { }

// Enum values: SCREAMING_SNAKE_CASE
Faction.PLAYER
Faction.ENEMY

// Variable: camelCase
let currentFaction: Faction = Faction.PLAYER;
```

---

# Interface & Type Naming
@pattern: PascalCase
@stability: stable

-> applies-to: interfaces-types
-> excludes: prefixes
:: naming-convention

## Pattern
```
PascalCase
```

## Rules
- First letter uppercase
- Each word capitalized
- No prefixes (I*, T*)
- Descriptive names

## Examples

### ✅ Correct
```typescript
interface SpaceObject {
    id: string;
    position: Vec2;
}

type XY = { x: number; y: number };
type EventMap = Record<string, unknown>;
type Range<T> = [number, number] | ((target: T) => [number, number]);
```

### ❌ Wrong
```typescript
interface ISpaceObject { }      // I prefix
interface spaceObject { }       // camelCase
type TXY = { };                 // T prefix
type xy = { };                  // lowercase
```

## Common Patterns

### Interfaces
```typescript
interface SpaceObject {
    id: string;
    position: Vec2;
}

interface Updateable {
    update(data: IterationData): void;
}

interface WidgetConfig {
    name: string;
    type: string;
}
```

### Type Aliases
```typescript
type XY = { x: number; y: number };
type EventMap = Record<string, unknown>;
type SpaceObjects = {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
};
```

### Generic Types
```typescript
type Range<T> = [number, number] | ((target: T) => [number, number]);
type StateCommand<T, S, P> = {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
};
```

### Union Types
```typescript
type SpaceObject = Spaceship | Asteroid | Projectile | Explosion | Waypoint;
type CommandType = 'rotate' | 'fire' | 'warp';
```

---

# Special Cases

## Private Members
@pattern: camelCase-with-underscore-prefix
@optional: true

```typescript
class MyClass {
    // Optional underscore prefix for private
    private _internalState: number = 0;
    
    // Or without prefix (preferred)
    private internalState: number = 0;
}
```

## Protected Members
@pattern: camelCase
@no-prefix: true

```typescript
class BaseClass {
    protected sharedState: number = 0;
}
```

## Static Members
@pattern: same-as-instance

```typescript
class Spaceship {
    // Static constant
    public static radius = 50;
    
    // Static method
    public static isInstance(o: unknown): o is Spaceship {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    }
}
```

## Acronyms
@pattern: treat-as-word

```typescript
// ✅ Correct - treat as word
class HttpClient { }
class XmlParser { }
class ApiEndpoint { }

// ❌ Wrong - all caps
class HTTPClient { }
class XMLParser { }
class APIEndpoint { }
```

---

# Naming Anti-Patterns

## Avoid

### Single Letter Names
```typescript
// ❌ Avoid (except in loops/lambdas)
const x = getValue();
const a = new Array();

// ✅ Better
const value = getValue();
const items = new Array();

// ✅ OK in limited scope
for (let i = 0; i < 10; i++) { }
items.map(x => x * 2);
```

### Abbreviations
```typescript
// ❌ Avoid unclear abbreviations
const mgr = new Manager();
const cfg = getConfig();
const tmp = calculate();

// ✅ Use full words
const manager = new Manager();
const config = getConfig();
const temporary = calculate();

// ✅ OK for well-known abbreviations
const id = 'ship-1';
const max = 100;
const min = 0;
```

### Hungarian Notation
```typescript
// ❌ Avoid type prefixes
const strName = 'ship';
const nCount = 10;
const bIsActive = true;

// ✅ Use TypeScript types
const name: string = 'ship';
const count: number = 10;
const isActive: boolean = true;
```

### Redundant Names
```typescript
// ❌ Redundant
class ShipClass { }
interface IShipInterface { }
type TShipType = { };

// ✅ Clean
class Ship { }
interface Ship { }
type Ship = { };
```

---

# Consistency Rules

## File-Class Matching
```typescript
// ship-state.ts
export class ShipState { }

// space-manager.ts
export class SpaceManager { }

// connection-manager.ts
export class ConnectionManager { }
```

## Import Naming
```typescript
// Match exported name
import { SpaceState } from './space-state';
import { ShipManager } from './ship-manager';

// Alias if needed
import { SpaceState as SS } from './space-state';
```

## Destructuring
```typescript
// Maintain original names
const { position, velocity } = object;
const { x, y } = position;

// Rename if needed
const { position: pos, velocity: vel } = object;
```

---

# Quick Decision Tree

```
Is it a file?
  → kebab-case.ts

Is it a class/interface/type?
  → PascalCase

Is it a function/method?
  → camelCase (verb-based)

Is it a variable/property?
  → Is it constant?
    → Yes: SCREAMING_SNAKE_CASE
    → No: camelCase (noun-based)

Is it an enum?
  → Enum name: PascalCase
  → Enum values: SCREAMING_SNAKE_CASE

Is it boolean?
  → Use is*/has*/can*/should* prefix
```

---

# Related Specifications

-> see: [FILE_ORGANIZATION_SPEC.md](FILE_ORGANIZATION_SPEC.md)
-> see: [PATTERNS.md](../PATTERNS.md)