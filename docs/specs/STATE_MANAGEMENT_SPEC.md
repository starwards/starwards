# State Management Specification

@category: core-architecture
@stability: stable
@framework: colyseus-v0.15

## Quick Reference

| Concept | Purpose | Key Pattern |
|---------|---------|-------------|
| Schema | State container | Extend Schema + @gameField |
| State Classes | Root state objects | SpaceState, ShipState, AdminState |
| Synchronization | Auto client-server sync | Direct property assignment |
| Updates | Trigger sync | `property = value` or `setValue()` |
| Computed | Derived values | Getters (not synced) |
| Managers | Business logic | Separate from state |

---

# Colyseus Schema Pattern
@pattern: state-synchronization
@framework: @colyseus/schema
@stability: stable

-> enables: automatic-replication
-> uses: delta-compression
-> requires: @gameField decorator
:: class-pattern

## Core Concept
@principle: separation-of-concerns

**State = Data Only**
- Pure data containers
- Extend `Schema` class
- Use `@gameField` decorators
- No business logic

**Managers = Logic Only**
- Business logic handlers
- Reference state objects
- Implement `Updateable` interface
- No state storage

## Schema Class Structure

### Basic Schema
```typescript
import { Schema } from '@colyseus/schema';
import { gameField } from '@starwards/core';

class MyState extends Schema {
    @gameField('float32')
    value: number = 0;
    
    @gameField('string')
    name: string = '';
}
```

### Nested Schema
```typescript
class NestedState extends Schema {
    @gameField('float32')
    x: number = 0;
}

class ParentState extends Schema {
    @gameField(NestedState)
    nested!: NestedState;  // Use ! for required objects
    
    constructor() {
        super();
        this.nested = new NestedState();
    }
}
```

### Collections
```typescript
import { ArraySchema, MapSchema } from '@colyseus/schema';

class CollectionState extends Schema {
    @gameField([ItemState])
    items = new ArraySchema<ItemState>();
    
    @gameField({ map: ObjectState })
    objects = new MapSchema<ObjectState>();
}
```

---

# State Classes
@category: root-state-objects
@location: modules/core/src

## SpaceState
@file: modules/core/src/space/space-state.ts
@purpose: space-simulation-root
@room: SpaceRoom

-> contains: space-objects
-> manages: physics-simulation
-> updates: via SpaceManager

### Structure
```typescript
class SpaceState extends Schema {
    @gameField({ map: Spaceship })
    ships = new MapSchema<Spaceship>();
    
    @gameField({ map: Projectile })
    projectiles = new MapSchema<Projectile>();
    
    @gameField({ map: Asteroid })
    asteroids = new MapSchema<Asteroid>();
    
    @gameField({ map: Explosion })
    explosions = new MapSchema<Explosion>();
    
    @gameField({ map: Waypoint })
    waypoints = new MapSchema<Waypoint>();
}
```

### Access Pattern
```typescript
// Server
const ship = spaceState.ships.get('ship-1');

// Client
room.state.ships.forEach((ship, id) => {
    console.log(id, ship.position);
});
```

## ShipState
@file: modules/core/src/ship/ship-state.ts
@purpose: individual-ship-state
@room: ShipRoom

-> extends: Spaceship
-> contains: ship-systems
-> manages: ship-controls

### Structure
```typescript
class ShipState extends Spaceship {
    @gameField(Reactor)
    reactor!: Reactor;
    
    @gameField([Thruster])
    thrusters = new ArraySchema<Thruster>();
    
    @gameField(Radar)
    radar!: Radar;
    
    @gameField(ChainGun)
    chainGun!: ChainGun;
    
    @gameField(Warp)
    warp!: Warp;
    
    @range([-1, 1])
    @gameField('float32')
    rotation: number = 0;
    
    @range([0, 1])
    @gameField('float32')
    afterBurner: number = 0;
}
```

## AdminState
@file: modules/core/src/admin/index.ts
@purpose: game-management
@room: AdminRoom

-> contains: game-configuration
-> manages: game-lifecycle

### Structure
```typescript
class AdminState extends Schema {
    @gameField('boolean')
    paused: boolean = false;
    
    @gameField('float32')
    timeScale: number = 1.0;
    
    // Game configuration...
}
```

---

# Property Synchronization
@pattern: automatic-sync
@trigger: property-assignment

## Direct Assignment
@method: preferred
-> triggers: immediate-sync

### Primitive Properties
```typescript
// ✅ Correct - triggers sync
state.rotation = 45;
state.speed = 100;
state.name = 'Enterprise';
state.destroyed = true;
```

### Nested Properties
```typescript
// ✅ Correct - triggers sync
state.position.x = 10;
state.position.y = 20;
state.velocity.x = 5;
```

### Collections
```typescript
// ✅ Correct - triggers sync
state.ships.set('ship-1', new Spaceship());
state.ships.delete('ship-2');
state.items.push(new Item());
state.items.splice(0, 1);
```

## setValue() Method
@method: bulk-update
-> use-for: multiple-properties

```typescript
// ✅ Correct - updates multiple properties
state.position.setValue({ x: 10, y: 20 });

// Equivalent to:
state.position.x = 10;
state.position.y = 20;
```

## Common Mistakes

### ❌ Wrong: Object Replacement
```typescript
// Won't sync!
state.position = new Vec2(10, 20);
state.velocity = { x: 5, y: 10 };
```

### ✅ Correct: Property Updates
```typescript
state.position.setValue({ x: 10, y: 20 });
// Or
state.position.x = 10;
state.position.y = 20;
```

### ❌ Wrong: Native Arrays
```typescript
// Won't sync!
state.items = [new Item(), new Item()];
state.items.push(new Item());  // If items is native array
```

### ✅ Correct: ArraySchema
```typescript
state.items = new ArraySchema<Item>();
state.items.push(new Item());  // Now syncs
```

---

# Update Patterns
@category: state-modification

## Server-Side Updates
@location: room-handlers
@pattern: command-driven

### Command Handler Pattern
```typescript
room.onMessage('rotate', (client, { value }) => {
    const ship = getShipForClient(client);
    ship.rotation = capToRange(-1, 1, value);
    // Automatically syncs to all clients
});
```

### Manager Update Pattern
```typescript
class EnergyManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        // Direct state updates
        this.state.reactor.energy += 
            this.state.reactor.design.energyPerSecond * deltaSeconds;
        
        // Automatically syncs
    }
}
```

## Client-Side Updates
@location: client-code
@pattern: send-command

### Send Command
```typescript
import { sendJsonCmd } from '@starwards/core';

// JSON Pointer command
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);

// Typed command
room.send('rotate', { value: 0.5, path: undefined });
```

### Listen to Changes
```typescript
// Entire state
room.state.onChange(() => {
    console.log('State changed');
});

// Specific property
room.state.reactor.listen('energy', (value) => {
    console.log('Energy:', value);
});

// Collection changes
room.state.ships.onAdd((ship, id) => {
    console.log('Ship added:', id);
});

room.state.ships.onRemove((ship, id) => {
    console.log('Ship removed:', id);
});
```

---

# Computed Properties
@pattern: derived-values
@sync: not-synchronized

## Purpose
Calculate values from state without storing them.

## Pattern: Getters
```typescript
class ShipState extends Spaceship {
    @gameField('float32')
    @range([0, 1])
    afterBurner: number = 0;
    
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

## Pattern: Effectiveness
```typescript
class SystemState extends Schema {
    @gameField('float32')
    power: number = 1.0;
    
    @gameField('float32')
    hacked: number = 1.0;
    
    abstract readonly broken: boolean;
    
    // Computed effectiveness
    get effectiveness(): number {
        return this.broken ? 0 : this.power * this.hacked;
    }
}
```

## Usage
```typescript
// Server and client can both use
const speed = ship.maxSpeed;
const thrust = ship.thrusters[0].effectiveness;
```

## Do's and Don'ts

### DO
✓ Use getters for derived values
✓ Keep computation lightweight
✓ Access synced properties only
✓ Make deterministic calculations

### DON'T
✗ Store computed values in @gameField
✗ Perform heavy computation in getters
✗ Cause side effects in getters
✗ Access non-synced data

---

# Manager Pattern
@pattern: logic-separation
@principle: single-responsibility

## Purpose
Separate business logic from state storage.

## Structure

### State Class (Data)
```typescript
class ReactorState extends SystemState {
    readonly name = 'Reactor';
    readonly broken = false;
    
    @gameField(ReactorDesignState)
    design = new ReactorDesignState();
    
    @gameField('float32')
    energy: number = 1000;
}
```

### Manager Class (Logic)
```typescript
class EnergyManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        // Generate energy
        this.state.reactor.energy += 
            this.state.reactor.design.energyPerSecond * 
            this.state.reactor.effectiveness * 
            deltaSeconds;
        
        // Cap to max
        const max = this.state.reactor.design.maxEnergy;
        if (this.state.reactor.energy > max) {
            this.state.reactor.energy = max;
        }
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

## Integration

### Room Setup
```typescript
class ShipRoom extends Room<ShipState> {
    private energyManager!: EnergyManager;
    
    onCreate() {
        this.setState(new ShipState());
        this.energyManager = new EnergyManager(this.state);
    }
    
    onUpdate(deltaSeconds: number) {
        this.energyManager.update({ deltaSeconds, totalSeconds: 0 });
    }
}
```

## Common Patterns

### System Manager
```typescript
class SystemManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update(data: IterationData) {
        this.updateHeat(data.deltaSeconds);
        this.updatePower(data.deltaSeconds);
    }
    
    private updateHeat(deltaSeconds: number) {
        // Heat logic
    }
    
    private updatePower(deltaSeconds: number) {
        // Power logic
    }
}
```

### Space Manager
```typescript
class SpaceManager implements Updateable {
    constructor(private state: SpaceState) {}
    
    update({ deltaSeconds }: IterationData) {
        this.applyPhysics(deltaSeconds);
        this.handleCollisions(deltaSeconds);
        this.cleanupDestroyed();
    }
    
    insert(object: SpaceObjectBase) {
        const collection = this.getCollection(object.type);
        collection.set(object.id, object);
    }
}
```

---

# State Mutation Guidelines
@category: best-practices

## Direct Updates
@pattern: preferred-method

### DO: Update Properties Directly
```typescript
✓ state.rotation = 45;
✓ state.position.x = 10;
✓ state.ships.set('id', ship);
✓ state.items.push(item);
```

### DON'T: Replace Objects
```typescript
✗ state.position = new Vec2(10, 20);
✗ state.ships = new MapSchema();
✗ state.items = [item1, item2];
```

## Validation
@pattern: boundary-validation

### DO: Validate at Boundaries
```typescript
✓ room.onMessage('rotate', (client, { value }) => {
    ship.rotation = capToRange(-1, 1, value);
});

✓ function setVelocity(velocity: XY) {
    if (isNaN(velocity.x) || isNaN(velocity.y)) {
        console.warn('Invalid velocity');
        return;
    }
    this.velocity.setValue(velocity);
}
```

### DON'T: Skip Validation
```typescript
✗ room.onMessage('rotate', (client, { value }) => {
    ship.rotation = value;  // No validation!
});
```

## Batch Updates
@pattern: efficiency

### DO: Batch Related Updates
```typescript
✓ function moveShip(position: XY, velocity: XY) {
    this.position.setValue(position);
    this.velocity.setValue(velocity);
    // Both sync in same frame
}
```

### DON'T: Spread Updates
```typescript
✗ function moveShip(position: XY, velocity: XY) {
    setTimeout(() => this.position.setValue(position), 0);
    setTimeout(() => this.velocity.setValue(velocity), 100);
    // Unnecessary delays
}
```

---

# Common Pitfalls

## Pitfall 1: Bypassing Colyseus
@problem: manual-serialization

### ❌ Wrong
```typescript
// Manually sending state
room.broadcast('state-update', JSON.stringify(state));
```

### ✅ Correct
```typescript
// Let Colyseus handle it
state.property = value;  // Auto-syncs
```

## Pitfall 2: Storing Non-Synced Data
@problem: state-desync

### ❌ Wrong
```typescript
class ShipState extends Schema {
    // Not decorated - won't sync!
    private cache: Map<string, any> = new Map();
}
```

### ✅ Correct
```typescript
// Keep non-synced data in managers
class ShipManager {
    private cache: Map<string, any> = new Map();
    constructor(private state: ShipState) {}
}
```

## Pitfall 3: Heavy Getters
@problem: performance

### ❌ Wrong
```typescript
get nearbyShips(): Spaceship[] {
    // Expensive calculation every access!
    return Array.from(this.space.ships.values())
        .filter(ship => distance(this, ship) < 1000);
}
```

### ✅ Correct
```typescript
// Cache in manager, update periodically
class ProximityManager {
    private nearbyShips: Spaceship[] = [];
    
    update() {
        this.nearbyShips = this.calculateNearby();
    }
}
```

## Pitfall 4: Circular References
@problem: infinite-loops

### ❌ Wrong
```typescript
class ShipState extends Schema {
    @gameField(TargetState)
    target!: TargetState;
}

class TargetState extends Schema {
    @gameField(ShipState)
    targetedBy!: ShipState;  // Circular!
}
```

### ✅ Correct
```typescript
class ShipState extends Schema {
    @gameField('string')
    targetId: string | null = null;  // Reference by ID
}
```

---

# State Lifecycle

## Creation
```typescript
// Server
onCreate() {
    this.setState(new ShipState());
    this.state.reactor = new Reactor();
}
```

## Updates
```typescript
// Server - every frame
onUpdate(deltaSeconds: number) {
    this.manager.update({ deltaSeconds, totalSeconds: 0 });
}
```

## Cleanup
```typescript
// Server
onLeave(client: Client) {
    const ship = this.getShipForClient(client);
    ship.destroyed = true;
}

onDispose() {
    // Cleanup managers
    this.manager.dispose();
}
```

---

# Testing State

## Test Pattern
```typescript
describe('ShipState', () => {
    let state: ShipState;
    
    beforeEach(() => {
        state = new ShipState();
        state.reactor = new Reactor();
    });
    
    it('should update energy', () => {
        state.reactor.energy = 500;
        expect(state.reactor.energy).toBe(500);
    });
    
    it('should sync nested properties', () => {
        state.position.x = 10;
        state.position.y = 20;
        expect(state.position.x).toBe(10);
        expect(state.position.y).toBe(20);
    });
});
```

---

# Related Specifications

-> see: [DECORATORS_SPEC.md](DECORATORS_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)
-> see: [SHIP_SYSTEMS_SPEC.md](SHIP_SYSTEMS_SPEC.md)