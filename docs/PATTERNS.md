---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship/ship-manager-abstract.ts
  - modules/core/src/ship/system.ts
related:
  - ARCHITECTURE.md
  - API_REFERENCE.md
last_verified: 2026-06-13
---

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
**Location:** `modules/core/src/ship/ship-manager-abstract.ts`

```typescript
// mirrors: modules/core/src/ship/ship-manager-abstract.ts
protected syncShipProperties() {
    this.state.spaceship.position.x = this.spaceObject.position.x;
    this.state.spaceship.position.y = this.spaceObject.position.y;
    this.state.spaceship.velocity.x = this.spaceObject.velocity.x;
    this.state.spaceship.velocity.y = this.spaceObject.velocity.y;
    this.state.spaceship.turnSpeed = this.spaceObject.turnSpeed;
    this.state.spaceship.angle = this.spaceObject.angle;
    this.state.spaceship.faction = this.spaceObject.faction;
    this.state.spaceship.radius = this.spaceObject.radius;
    applyRadarSectors(this.state.spaceship.radarSectors, [...this.spaceObject.radarSectors]);
}
```

Note: `ShipState.position`/`velocity`/`angle`/`turnSpeed`/`faction`/`radius` are read-only getters delegating to `ship.spaceship` (`ship-state.ts`), so assigning to `this.state.angle`/`faction`/etc. directly would not compile.

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
// effectiveness = broken ? 0 : power × hacked
// (hacked is a HackLevel multiplier: DISABLED=0, COMPROMISED=0.5, OK=1; coolantFactor only affects heat reduction, not effectiveness)
```

### Damage Loops Must Be Iteration-Bounded
Test fixtures fire `Number.MAX_SAFE_INTEGER` damage (`modules/core/test/ship-manager.spec.ts`), so any loop that iterates proportionally to the damage amount (O(amount/step)) reads as an infinite hang. Bound such loops by iteration count — see `MAX_SPILLOVER_ROLLS` in `modules/core/src/ship/damage-manager.ts` (an overkill guard, not game balance).

### ShipDie Event Rolls Are Deterministic Per Id
`getRoll`/`getSuccess`/`getRollInRange` are pure hashes of (seed, id) — the same id returns the identical value forever (no time salt; drift rolls are the time-varying kind). Any repeated roll — per-tick explosion streams reusing one damage id, multiple rolls within one event — silently degenerates to a constant unless the key includes a counter or index (see the defect roll keys in `damageSystem`, `modules/core/src/ship/damage-manager.ts`). Details in the doc comment in `modules/core/src/ship/ship-die.ts`.

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
import { ShipTestHarness } from './ship-test-harness';
const harness = new ShipTestHarness();
harness.shipObj.position = new Vec2(10, 10);
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
- Current: BVH broadphase + SAT narrowphase via the `detect-collisions` library (`modules/core/src/logic/space-manager.ts`) → sub-O(n²) avg
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
