# Code Patterns Guide - Starwards

**Code patterns, conventions, and best practices**

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [TypeScript Patterns](#typescript-patterns)
- [State Management Patterns](#state-management-patterns)
- [Error Handling](#error-handling)
- [Testing Patterns](#testing-patterns)
- [File Organization](#file-organization)

## Naming Conventions

### Files

**Pattern:** kebab-case

```
✓ ship-state.ts
✓ space-manager.ts
✓ connection-manager.ts

✗ ShipState.ts
✗ spaceManager.ts
```

**Suffixes:**
- `.spec.ts` - Unit tests
- `.tsx` - React components
- `.d.ts` - Type definitions
- `.html` - Templates

**Examples:**
```
modules/core/src/ship/ship-state.ts
modules/core/test/ship-manager.spec.ts
modules/browser/src/components/lobby.tsx
custom-typings/pixi__core/index.d.ts
```

### Classes

**Pattern:** PascalCase

```typescript
✓ class SpaceState extends Schema { }
✓ class ShipManager { }
✓ class ConnectionManager { }

✗ class spaceState { }
✗ class ship_manager { }
```

**Common Suffixes:**
- `*State` - Colyseus schema classes
- `*Manager` - Business logic managers
- `*Room` - Colyseus room classes
- `*Driver` - Client connection drivers
- `*Design` - Design/configuration classes

**Examples:**
```typescript
class SpaceState extends Schema { }
class ShipManager implements Updateable { }
class AdminRoom extends Room<AdminState> { }
class ShipDriver { }
class ReactorDesignState extends DesignState { }
```

### Functions & Methods

**Pattern:** camelCase

```typescript
✓ function handleCollision() { }
✓ function updateVelocity() { }
✓ function getRange() { }

✗ function HandleCollision() { }
✗ function update_velocity() { }
```

**Common Prefixes:**
- `get*` - Retrieve value
- `set*` - Update value
- `is*` - Boolean check
- `has*` - Existence check
- `handle*` - Event handler
- `calc*` - Calculate value
- `update*` - Update state
- `create*` - Factory function

**Examples:**
```typescript
function getRange(root: Schema, pointer: JsonPointer): RTuple2
function setVelocity(id: string, velocity: XY): void
function isSpaceObject(k: unknown): k is SpaceObject
function hasTarget(ship: ShipState): boolean
function handleCollision(response: SWResponse): void
function calcDamage(amount: number): number
function updatePhysics(deltaSeconds: number): void
function createWidget(config: WidgetConfig): Widget
```

### Variables & Properties

**Pattern:** camelCase

```typescript
✓ const spaceManager = new SpaceManager();
✓ let currentSpeed = 0;
✓ this.energyPerMinute = 100;

✗ const SpaceManager = new SpaceManager();
✗ let current_speed = 0;
```

**Boolean Prefixes:**
```typescript
✓ isPlayerShip: boolean
✓ hasTarget: boolean
✓ canFire: boolean
✓ shouldUpdate: boolean

✗ playerShip: boolean  // Ambiguous
✗ target: boolean      // Unclear
```

### Constants

**Pattern:** SCREAMING_SNAKE_CASE

```typescript
✓ const MAX_SYSTEM_HEAT = 100;
✓ const ZERO_VELOCITY_THRESHOLD = 0;
✓ const GC_TIMEOUT = 5;

✗ const maxSystemHeat = 100;
✗ const MaxSystemHeat = 100;
```

**Examples:**
```typescript
const MAX_SYSTEM_HEAT = 100;
const ZERO_VELOCITY_THRESHOLD = 0;
const GC_TIMEOUT = 5;
const MAX_WARP_LVL = 9;
```

### Enums

**Pattern:** PascalCase for enum, SCREAMING_SNAKE_CASE for values

```typescript
✓ enum Faction {
    NONE,
    PLAYER,
    ENEMY
}

✗ enum faction {
    none,
    player,
    enemy
}
```

**Examples:**
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

### Interfaces & Types

**Pattern:** PascalCase

```typescript
✓ interface SpaceObject { }
✓ type XY = { x: number; y: number };
✓ type EventMap = Record<string, unknown>;

✗ interface spaceObject { }
✗ type xy = { x: number; y: number };
```

**Prefixes:**
- `I*` - NOT used (TypeScript convention)
- `T*` - NOT used

**Examples:**
```typescript
interface SpaceObject {
    id: string;
    position: Vec2;
}

type XY = { x: number; y: number };
type EventMap = Record<string, unknown>;
type Range<T> = [number, number] | ((target: T) => [number, number]);
```

## TypeScript Patterns

### Strict Mode Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Type Guards

**Pattern:** Static method with type predicate

```typescript
class Spaceship extends SpaceObjectBase {
    readonly type = 'Spaceship' as const;
    
    static isInstance(o: unknown): o is Spaceship {
        return (o as Spaceship)?.type === 'Spaceship';
    }
}

// Usage
if (Spaceship.isInstance(object)) {
    // TypeScript knows object is Spaceship
    console.log(object.radarRange);
}
```

**Common Pattern:**
```typescript
function isSpaceObject(k: SpaceObject | undefined): k is SpaceObject {
    return !!k;
}

// Usage
const objects = ids.map(id => state.get(id)).filter(isSpaceObject);
// objects is SpaceObject[], not (SpaceObject | undefined)[]
```

### Discriminated Unions

**Pattern:** Use `type` property for discrimination

```typescript
type SpaceObject = Spaceship | Asteroid | Projectile | Explosion | Waypoint;

// Each has unique 'type' property
class Spaceship {
    readonly type = 'Spaceship' as const;
}

class Asteroid {
    readonly type = 'Asteroid' as const;
}

// TypeScript can narrow based on type
function handleObject(obj: SpaceObject) {
    switch (obj.type) {
        case 'Spaceship':
            // obj is Spaceship
            break;
        case 'Asteroid':
            // obj is Asteroid
            break;
    }
}
```

### Readonly Properties

**Pattern:** Use `readonly` for immutable properties

```typescript
class SpaceObjectBase {
    abstract readonly type: keyof SpaceObjects;
    readonly faction: Faction = Faction.NONE;
    readonly radarRange: number = 0;
}

// Cannot be reassigned
// object.type = 'Other';  // Error
```

### Optional vs Nullable

**Pattern:** Use `| null` for explicit absence, `?` for optional

```typescript
// Nullable - value can be explicitly null
@gameField('string')
targetId: string | null = null;

// Optional - property may not exist
interface Config {
    name?: string;
}

// Both
interface Options {
    target?: string | null;
}
```

### Generic Constraints

**Pattern:** Constrain generics with `extends`

```typescript
function range<T extends Schema>(
    r: Range<T> | SchemaRanges
): PropertyDecorator {
    // T must be a Schema
}

function cmdReceiver<T, S extends Schema, P>(
    manager: Stateful<S>,
    p: StateCommand<T, S, P>
): CmdReceiver {
    // S must be a Schema
}
```

### Utility Types

**Common Patterns:**

```typescript
// DeepReadonly
import { DeepReadonly } from 'ts-essentials';
function process(data: DeepReadonly<SpaceState>) {
    // data and all nested properties are readonly
}

// Partial
function update(changes: Partial<ShipState>) {
    // All properties optional
}

// Pick
type ShipPosition = Pick<ShipState, 'position' | 'velocity'>;

// Omit
type ShipWithoutSystems = Omit<ShipState, 'reactor' | 'thrusters'>;

// Record
type SystemMap = Record<string, SystemState>;
```

### Decorator Stacking

**Pattern:** Stack decorators in specific order

```typescript
// Correct order: @range, @tweakable, @gameField
@range([0, 1])
@tweakable('number')
@gameField('float32')
power = 1.0;

// Also valid: @defectible, @range, @tweakable, @gameField
@defectible({ normal: 1, name: 'efficiency' })
@range([0, 1])
@tweakable('number')
@gameField('float32')
efficiency = 1.0;
```

**Why:** Decorators execute bottom-to-top, so `@gameField` must be last to properly register the property.

## State Management Patterns

### Colyseus Schema Pattern

**Pattern:** Extend Schema, use @gameField decorator

```typescript
import { Schema } from '@colyseus/schema';
import { gameField } from '../game-field';

class MyState extends Schema {
    @gameField('float32')
    value = 0;
    
    @gameField(NestedState)
    nested!: NestedState;
    
    @gameField([ItemState])
    items = new ArraySchema<ItemState>();
    
    @gameField({ map: ObjectState })
    objects = new MapSchema<ObjectState>();
}
```

### State Update Pattern

**Pattern:** Direct assignment triggers sync

```typescript
// ✓ Correct - triggers sync
state.rotation = 45;
state.velocity.x = 10;
state.velocity.y = 20;

// ✗ Wrong - doesn't trigger sync
const newVelocity = { x: 10, y: 20 };
state.velocity = newVelocity;  // Won't sync!

// ✓ Correct - use setValue
state.velocity.setValue({ x: 10, y: 20 });
```

### Computed Properties Pattern

**Pattern:** Use getters for derived values

```typescript
class ShipState extends Spaceship {
    @gameField('float32')
    @range([0, 1])
    afterBurner = 0;
    
    // Computed - not synced
    get maxSpeed(): number {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    
    getMaxSpeedForAfterburner(afterBurner: number): number {
        return this.smartPilot.design.maxSpeed + 
               afterBurner * this.smartPilot.design.maxSpeedFromAfterBurner;
    }
}
```

### Manager Pattern

**Pattern:** Separate state from logic

```typescript
// State - pure data
class ReactorState extends SystemState {
    @gameField('float32')
    energy = 1000;
}

// Manager - business logic
class EnergyManager {
    constructor(private state: ShipState) {}
    
    update(deltaSeconds: number) {
        this.state.reactor.energy += 
            this.state.reactor.design.energyPerSecond * deltaSeconds;
    }
    
    trySpendEnergy(amount: number): boolean {
        if (this.state.reactor.energy >= amount) {
            this.state.reactor.energy -= amount;
            return true;
        }
        return false;
    }
}
```

### Command Pattern

**Pattern:** Commands modify state, not managers

```typescript
// ✓ Correct - command modifies state
room.onMessage('rotate', (client, { value }) => {
    ship.rotation = capToRange(-1, 1, value);
});

// ✗ Wrong - don't call manager methods from commands
room.onMessage('rotate', (client, { value }) => {
    shipManager.rotate(value);  // Avoid this
});
```

### Updateable Pattern

**Pattern:** Implement Updateable interface for game loop

```typescript
interface Updateable {
    update(data: IterationData): void;
}

interface IterationData {
    deltaSeconds: number;
    totalSeconds: number;
}

class SpaceManager implements Updateable {
    update({ deltaSeconds }: IterationData) {
        this.applyPhysics(deltaSeconds);
        this.handleCollisions(deltaSeconds);
    }
}
```

## Error Handling

### Console Logging Pattern

**Pattern:** Use console.error with context

```typescript
// ✓ Good - includes context
console.error(`Error setting value ${String(value)} in ${type}: ${printError(e)}`);

// ✓ Good - structured context
console.error(`object leak! ${object.id} has no extra data`);

// ✗ Poor - no context
console.error(e);
```

### Try-Catch Pattern

**Pattern:** Minimal try-catch, mostly at boundaries

```typescript
// Command handlers
room.onMessage(type, (client, message) => {
    try {
        handleJsonPointerCommand(message, type, state);
    } catch (e) {
        console.error(`Error handling command ${type}:`, printError(e));
    }
});

// Don't wrap everything
function updatePhysics(deltaSeconds: number) {
    // No try-catch here - let errors bubble
    for (const object of this.state) {
        object.position.x += object.velocity.x * deltaSeconds;
    }
}
```

### Validation Pattern

**Pattern:** Validate at boundaries, trust internally

```typescript
// ✓ Validate inputs
function setVelocity(id: string, velocity: XY) {
    if (isNaN(velocity.x) || isNaN(velocity.y)) {
        console.warn(`trying to set "NaN" in velocity of ${id}`);
        return;
    }
    const [subject] = this.getObjectPtr(id);
    if (subject) {
        subject.velocity.setValue(velocity);
    }
}

// ✓ Trust internal calls
private applyPhysics(deltaSeconds: number) {
    // No validation - we control the inputs
    for (const subject of this.state) {
        const positionDelta = XY.scale(subject.velocity, deltaSeconds);
        subject.position.setValue(XY.add(subject.position, positionDelta));
    }
}
```

### Range Capping Pattern

**Pattern:** Cap values to valid ranges

```typescript
import { capToRange } from '@starwards/core';

// ✓ Always cap user inputs
function setPower(value: number) {
    this.power = capToRange(0, 1, value);
}

// ✓ Use @range decorator for automatic capping
@range([0, 1])
@gameField('float32')
power = 1.0;
```

## Testing Patterns

### Test File Organization

**Pattern:** Co-locate tests with source

```
modules/core/
├── src/
│   ├── ship/
│   │   └── ship-state.ts
│   └── logic/
│       └── space-manager.ts
└── test/
    ├── ship-manager.spec.ts
    └── space-manager.spec.ts
```

### Test Structure

**Pattern:** Describe-it blocks with clear names

```typescript
describe('SpaceManager', () => {
    describe('collision detection', () => {
        it('should detect ship-asteroid collision', () => {
            // Arrange
            const manager = new SpaceManager();
            const ship = createTestShip();
            const asteroid = createTestAsteroid();
            
            // Act
            manager.insert(ship);
            manager.insert(asteroid);
            manager.update({ deltaSeconds: 0.016 });
            
            // Assert
            expect(ship.health).toBeLessThan(100);
        });
    });
});
```

### Test Harness Pattern

**Pattern:** Create reusable test utilities

```typescript
// ship-test-harness.ts
export function createTestShip(overrides?: Partial<ShipState>): ShipState {
    const ship = new ShipState();
    ship.id = 'test-ship';
    ship.position = new Vec2(0, 0);
    // ... set defaults
    Object.assign(ship, overrides);
    return ship;
}

// Usage in tests
it('should move ship', () => {
    const ship = createTestShip({ position: new Vec2(10, 10) });
    // ...
});
```

### Mock Pattern

**Pattern:** Create minimal mocks for dependencies

```typescript
// Mock driver
class MockDriver implements ShipDriver {
    state = createTestShip();
    events = new EventEmitter();
    
    send(command: string, data: unknown) {
        // Track calls for assertions
    }
}
```

## File Organization

### Module Structure

**Pattern:** Group by feature, not by type

```
✓ Good - feature-based
modules/core/src/
├── ship/              # All ship-related code
│   ├── ship-state.ts
│   ├── ship-manager.ts
│   ├── reactor.ts
│   └── thruster.ts
└── space/             # All space-related code
    ├── space-state.ts
    ├── space-manager.ts
    └── spaceship.ts

✗ Poor - type-based
modules/core/src/
├── states/
│   ├── ship-state.ts
│   └── space-state.ts
├── managers/
│   ├── ship-manager.ts
│   └── space-manager.ts
└── models/
    ├── reactor.ts
    └── spaceship.ts
```

### Import Organization

**Pattern:** Group imports by source

```typescript
// 1. External dependencies
import { Schema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';

// 2. Internal absolute imports
import { SpaceState, ShipState } from '@starwards/core';

// 3. Relative imports
import { gameField } from '../game-field';
import { Reactor } from './reactor';

// 4. Type-only imports (if needed)
import type { XY } from '../logic/xy';
```

### Export Pattern

**Pattern:** Named exports, index files for public API

```typescript
// reactor.ts
export class Reactor extends SystemState {
    // ...
}

export class ReactorDesignState extends DesignState {
    // ...
}

// ship/index.ts
export { Reactor, ReactorDesignState } from './reactor';
export { Thruster, ThrusterDesignState } from './thruster';
export { ShipState } from './ship-state';
export { ShipManager } from './ship-manager';

// Usage
import { Reactor, ShipState } from '@starwards/core/ship';
```

### Barrel Exports

**Pattern:** Use index.ts for module exports

```typescript
// modules/core/src/index.ts
export * from './space';
export * from './ship';
export * from './logic';
export * from './client';
export * from './commands';
export * from './events';

// Allows clean imports
import { SpaceState, ShipState, XY } from '@starwards/core';
```

## Best Practices Summary

### DO

✓ Use TypeScript strict mode
✓ Use decorators for Colyseus schemas
✓ Validate inputs at boundaries
✓ Cap values to valid ranges
✓ Use type guards for narrowing
✓ Separate state from logic (managers)
✓ Use computed properties for derived values
✓ Log errors with context
✓ Group code by feature
✓ Use named exports

### DON'T

✗ Bypass Colyseus state updates
✗ Use try-catch everywhere
✗ Ignore TypeScript errors
✗ Mix state and logic in one class
✗ Use default exports
✗ Group code by type
✗ Mutate readonly properties
✗ Use `any` type
✗ Skip input validation
✗ Log without context

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
- [INTEGRATION.md](INTEGRATION.md) - Integration guide