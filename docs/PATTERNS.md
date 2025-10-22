# Code Patterns

## Naming Conventions

| Element | Pattern | Examples |
|---------|---------|----------|
| Files | kebab-case | `ship-state.ts`, `space-manager.ts` |
| Classes | PascalCase | `SpaceState`, `ShipManager` |
| Functions | camelCase | `handleCollision()`, `getRange()` |
| Variables | camelCase | `spaceManager`, `currentSpeed` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_SYSTEM_HEAT`, `ZERO_VELOCITY_THRESHOLD` |
| Booleans | is/has/can/should prefix | `isPlayerShip`, `hasTarget` |

**Class suffixes:** `*State` (schema), `*Manager` (logic), `*Room` (Colyseus), `*Driver` (client), `*Design` (config)

**Function prefixes:** `get*`, `set*`, `is*`, `has*`, `handle*`, `calc*`, `update*`, `create*`

## TypeScript Patterns

### Type Guards
```typescript
class Spaceship {
    static isInstance(o: unknown): o is Spaceship {
        return (o as Spaceship)?.type === 'Spaceship';
    }
}
```

### Discriminated Unions
```typescript
type SpaceObject = Spaceship | Asteroid | Projectile;
// Each has unique readonly type property for narrowing
```

### Decorator Stacking
```typescript
@range([0, 1])           // 1st (outermost)
@tweakable('number')     // 2nd
@gameField('float32')    // 3rd (innermost, must be last)
power = 1.0;
```

### Generic Constraints
```typescript
function range<T extends Schema>(r: Range<T>): PropertyDecorator
```

## State Management

### Schema Pattern
```typescript
class MyState extends Schema {
    @gameField('float32') value = 0;
    @gameField(NestedState) nested!: NestedState;
    @gameField([Item]) items = new ArraySchema<Item>();
    @gameField({ map: Obj }) objects = new MapSchema<Obj>();
}
```

### State Updates
```typescript
// ✓ Correct
state.rotation = 45;
state.velocity.x = 10;
state.velocity.setValue({ x: 10, y: 20 });

// ✗ Wrong - won't sync
state.velocity = { x: 10, y: 20 };
```

### Computed Properties
```typescript
get maxSpeed(): number {
    return this.getMaxSpeedForAfterburner(this.afterBurner);
}
```

### Manager Pattern
```typescript
class ReactorManager {
    constructor(private state: ShipState) {}
    update(deltaSeconds: number) {
        this.state.reactor.energy += rate * deltaSeconds;
    }
}
```

### State Synchronization Architecture

**Critical for testing:** SpaceObject properties sync **one-way** to ShipRoom state.

#### Data Flow
```
SpaceObject (SpaceRoom)         ShipRoom.state
   ↓ source of truth              ↓ read-only mirror
   ├── position                    ├── position (synced)
   ├── velocity                    ├── velocity (synced)
   ├── angle                       ├── angle (synced)
   ├── turnSpeed                   ├── turnSpeed (synced)
   └── faction                     └── faction (synced)

syncShipProperties() runs every tick
```

#### Implementation
**Location:** `modules/core/src/ship/ship-manager-abstract.ts:272-283`

```typescript
protected syncShipProperties() {
    // Only sync data that should be exposed to room clients
    this.state.position.x = this.spaceObject.position.x;
    this.state.position.y = this.spaceObject.position.y;
    this.state.velocity.x = this.spaceObject.velocity.x;
    this.state.velocity.y = this.spaceObject.velocity.y;
    this.state.turnSpeed = this.spaceObject.turnSpeed;
    this.state.angle = this.spaceObject.angle;  // ← READ-ONLY!
    this.state.faction = this.spaceObject.faction;
    this.state.radius = this.spaceObject.radius;
    this.state.radarRange = this.spaceObject.radarRange;
}
```

Called from `update()` method at start of every physics tick:
```typescript
update(id: IterationData) {
    // Sync relevant ship props, BEFORE any other calculation
    this.syncShipProperties();  // ← Overwrites ShipRoom.state
    // ... rest of update logic
}
```

#### Testing Implications

```typescript
// ✗ Wrong - Will be overwritten next tick!
ship.state.angle = 90;
await page.waitForTimeout(100);  // Angle reverts to spaceObject.angle

// ✓ Correct - Modify source of truth
const spaceObject = gameManager.spaceManager.state.getShip(shipId);
spaceObject.angle = 90;
await waitForPropertyFloatValue(page, 'heading', 90);  // ✓ Persists
```

**When to use each:**
- **Modify `spaceObject`**: Position, velocity, angle, faction changes
- **Modify `ship.state`**: Subsystem properties (reactor.power, shields.health)
- **Read either**: Both reflect current state (after sync)

**Example from E2E test:**
```typescript
// Get SpaceObject (source of truth)
const spaceShip = gameDriver.gameManager.spaceManager.state.getShip(shipId);

// Change angle on SpaceObject
const newAngle = (spaceShip.angle + 45) % 360;
spaceShip.angle = newAngle;

// Wait for UI to reflect change
await waitForPropertyFloatValue(page, 'heading', newAngle);
```

## Common Gotchas

### Float Precision
```typescript
@gameField('float32') speed = 123.456789;  // Rounds to 123.46
expect(value).toBeCloseTo(expected, 1);    // Use tolerance in tests
```

### Angle Wrapping
```typescript
// ✗ Wrong
ship.angle += rotationSpeed * deltaSeconds;

// ✓ Correct
ship.angle = toPositiveDegreesDelta(ship.angle + rotationSpeed * deltaSeconds);
```

### Velocity Zero Check
```typescript
// ✗ Wrong
if (ship.velocity.x === 0 && ship.velocity.y === 0)

// ✓ Correct
if (XY.isZero(ship.velocity, 0.01))
```

### System Effectiveness
```typescript
// ✗ Wrong
const thrust = thruster.maxThrust;

// ✓ Correct
const thrust = thruster.maxThrust * thruster.effectiveness;
// effectiveness = power × coolantFactor × (1 - hacked)
```

### JSON Pointer Paths
```typescript
// ✗ Wrong
`/Spaceship-${id}/rotation`  // Wrong separator
`/spaceships/${id}/rotation` // Wrong type name

// ✓ Correct
`/Spaceship/${id}/rotation`
`/Spaceship/${id}/reactor/power`
```

### State Access
```typescript
// ✗ Wrong
const ships = state.ships;  // Private MapSchema

// ✓ Correct
const ships = Array.from(state.getAll('Spaceship'));
```

## Error Handling

### Logging
```typescript
// ✓ Good - includes context
console.error(`Error setting ${value} in ${type}: ${printError(e)}`);

// ✗ Poor - no context
console.error(e);
```

### Validation
```typescript
// Validate at boundaries only
function setVelocity(id: string, velocity: XY) {
    if (isNaN(velocity.x) || isNaN(velocity.y)) {
        console.warn(`NaN in velocity of ${id}`);
        return;
    }
    subject.velocity.setValue(velocity);
}

// Trust internal calls
private applyPhysics(dt: number) {
    subject.position.setValue(XY.add(subject.position, positionDelta));
}
```

### Range Capping
```typescript
@range([0, 1]) @gameField('float32') power = 1.0;  // Auto-caps
this.power = capToRange(0, 1, value);              // Manual
```

## Testing

### Structure
```typescript
describe('SpaceManager', () => {
    describe('collision detection', () => {
        it('should detect ship-asteroid collision', () => {
            // Arrange
            const manager = new SpaceManager();
            // Act
            manager.update({ deltaSeconds: 0.016 });
            // Assert
            expect(ship.health).toBeLessThan(100);
        });
    });
});
```

### Harness
```typescript
import { createTestShip } from './test-factories';
const ship = createTestShip({ position: new Vec2(10, 10) });
```

## File Organization

### Feature-Based (✓)
```
core/src/
├── ship/      # All ship code
│   ├── ship-state.ts
│   ├── ship-manager.ts
│   ├── reactor.ts
│   └── thruster.ts
└── space/     # All space code
```

### Type-Based (✗)
```
core/src/
├── states/    # Avoid
├── managers/
└── models/
```

### Imports
```typescript
// 1. External
import { Schema } from '@colyseus/schema';
// 2. Internal absolute
import { SpaceState } from '@starwards/core';
// 3. Relative
import { gameField } from '../game-field';
```

### Exports
```typescript
// Named exports only
export class Reactor extends SystemState { }
export class ReactorDesignState extends DesignState { }

// Barrel exports
export * from './reactor';
export * from './thruster';
```

## Performance

### Collision O(n²)
- Current: Spatial hashing → O(n log n) avg
- Future: Quadtree if >300 objects

### Rendering: 30 FPS Cap
```typescript
const TARGET_FPS = 30;
const FRAME_TIME = 1000 / TARGET_FPS;
if (delta >= FRAME_TIME) updateGraphics();
```

### Network: Delta Compression
- Only changed properties transmitted
- 90-98% bandwidth reduction

### State Updates: Batched
```typescript
setSimulationInterval((dt) => {
    // All changes batched into single message
}, 1000/60);
```

## Commands

### Two Types

**Typed (for common operations):**
```typescript
interface SetPowerCommand { type: 'SET_POWER'; value: number; }
```
- ✓ Type-safe, optimized
- ✗ Fixed structure

**JSON Pointer (for dynamic control):**
```typescript
{type: `/Spaceship/${id}/reactor/power`, value: 0.8}
```
- ✓ Dynamic, scriptable
- ✗ No compile-time validation

**ShipRoom:** JSON Pointer only (external control)

## Best Practices

### DO
- ✓ Use TypeScript strict mode
- ✓ Use decorators for schemas
- ✓ Validate inputs at boundaries
- ✓ Cap values to ranges
- ✓ Separate state from logic (managers)
- ✓ Use type guards for narrowing
- ✓ Log errors with context
- ✓ Group code by feature

### DON'T
- ✗ Bypass Colyseus state updates
- ✗ Use try-catch everywhere
- ✗ Ignore TypeScript errors
- ✗ Mix state and logic
- ✗ Use default exports
- ✗ Use `any` type
- ✗ Skip input validation

**Related:** [API_REFERENCE.md](API_REFERENCE.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [DEVELOPMENT.md](DEVELOPMENT.md)
