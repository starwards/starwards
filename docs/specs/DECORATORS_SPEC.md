# Decorator System Specification

@category: core-infrastructure
@stability: stable
@module: modules/core/src

## Quick Reference

| Decorator | Purpose | Required On | Stacking Order |
|-----------|---------|-------------|----------------|
| [`@gameField`](../../modules/core/src/game-field.ts:16) | Network sync | Schema properties | Last (bottom) |
| [`@tweakable`](../../modules/core/src/tweakable.ts:38) | Runtime UI control | Any property | Before @gameField |
| [`@range`](../../modules/core/src/range.ts:39) | Value constraints | Numeric properties | Before @tweakable |
| [`@defectible`](../../modules/core/src/ship/system.ts:73) | Damage tracking | SystemState properties | Before @range |

---

# @gameField
@file: modules/core/src/game-field.ts
@category: state-synchronization
@stability: stable

-> enables: automatic-network-sync
-> requires: @colyseus/schema
-> triggers: client-server-replication
:: decorator-function

## Purpose
Marks properties for automatic Colyseus state synchronization between server and clients.

## Signature
```typescript
gameField(dt: DefinitionType): PropertyDecorator
```

## Type Options

### Primitive Types
```typescript
@gameField('int8')    // -128 to 127
@gameField('uint8')   // 0 to 255
@gameField('int16')   // -32768 to 32767
@gameField('uint16')  // 0 to 65535
@gameField('int32')   // -2147483648 to 2147483647
@gameField('uint32')  // 0 to 4294967295
@gameField('float32') // 32-bit float (auto-rounds to 2 decimals)
@gameField('float64') // 64-bit float
@gameField('string')  // UTF-8 string
@gameField('boolean') // true/false
```

### Complex Types
```typescript
@gameField(NestedSchema)              // Nested schema object
@gameField([ItemSchema])              // Array of schemas
@gameField({ map: ObjectSchema })     // Map of schemas
```

## Behavior

### Float32 Precision
@behavior: automatic-rounding
-> applies-to: float32 type only

```typescript
@gameField('float32')
speed: number = 0;

// Automatically rounds to 2 decimal places
// 1.23456 → 1.23
// 0.999 → 1.00
```

**Implementation:**
```typescript
// From game-field.ts:11-12
definition.descriptors[field].set = function (this: Schema, value: number) {
    oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
};
```

### Network Synchronization
@pattern: delta-compression
-> triggers: on-property-change
-> sends: binary-delta

**Flow:**
1. Property assigned on server
2. Colyseus detects change
3. Delta compressed to binary
4. Sent to all clients
5. Client schema auto-updates

## Usage Examples

### Basic Property
```typescript
class ShipState extends Schema {
    @gameField('float32')
    speed: number = 0;
    
    @gameField('string')
    name: string = '';
    
    @gameField('boolean')
    destroyed: boolean = false;
}
```

### Nested Object
```typescript
class ShipState extends Schema {
    @gameField(Reactor)
    reactor!: Reactor;  // Use ! for required nested objects
}
```

### Array
```typescript
import { ArraySchema } from '@colyseus/schema';

class ShipState extends Schema {
    @gameField([Thruster])
    thrusters = new ArraySchema<Thruster>();
}

// Usage
ship.thrusters.push(new Thruster());
```

### Map
```typescript
import { MapSchema } from '@colyseus/schema';

class SpaceState extends Schema {
    @gameField({ map: Spaceship })
    ships = new MapSchema<Spaceship>();
}

// Usage
state.ships.set('ship-1', new Spaceship());
```

## Common Mistakes

### ❌ Wrong: Missing @gameField
```typescript
class ShipState extends Schema {
    speed: number = 0;  // Won't sync!
}
```

### ❌ Wrong: Using native arrays
```typescript
@gameField([Thruster])
thrusters: Thruster[] = [];  // Wrong type!
```

### ✅ Correct: Use ArraySchema
```typescript
@gameField([Thruster])
thrusters = new ArraySchema<Thruster>();
```

### ❌ Wrong: Direct object assignment
```typescript
@gameField(Vec2)
position!: Vec2;

// Later...
this.position = new Vec2(10, 20);  // Won't sync!
```

### ✅ Correct: Use setValue
```typescript
this.position.setValue({ x: 10, y: 20 });
// Or update properties directly
this.position.x = 10;
this.position.y = 20;
```

## Do's and Don'ts

### DO
✓ Use @gameField on all synced properties
✓ Use float32 for most numeric values
✓ Use ArraySchema/MapSchema for collections
✓ Place @gameField last in decorator stack
✓ Initialize nested objects with `!` or in constructor

### DON'T
✗ Forget @gameField on synced properties
✗ Use native arrays/objects
✗ Bypass Colyseus setters
✗ Use float64 unless precision needed
✗ Stack @gameField before other decorators

---

# @tweakable
@file: modules/core/src/tweakable.ts
@category: runtime-configuration
@stability: stable

-> enables: runtime-ui-control
-> generates: tweakpane-ui
-> accessible-via: getTweakables()
:: decorator-function

## Purpose
Marks properties as runtime-adjustable via UI panels (Tweakpane). Used for GM controls and debugging.

## Signature
```typescript
tweakable<T extends Schema>(
    config: TweakableConfig | ((target: T) => TweakableConfig)
): PropertyDecorator
```

## Type Options

### Simple Types
```typescript
@tweakable('boolean')  // Checkbox
@tweakable('number')   // Number input
@tweakable('string')   // Text input
@tweakable('shipId')   // Ship ID selector
```

### Enum Types
```typescript
// Numeric enum
@tweakable({ type: 'enum', enum: Faction })
faction: Faction = Faction.NONE;

// String enum
@tweakable({ type: 'string enum', enum: ['red', 'blue', 'green'] })
color: string = 'red';
```

### Number with Constraints
```typescript
@tweakable({ 
    type: 'number', 
    number: { min: 0, max: 100 } 
})
health: number = 100;
```

### Dynamic Configuration
```typescript
@tweakable((target: Reactor) => ({
    type: 'number',
    number: { min: 0, max: target.design.maxEnergy }
}))
energy: number = 1000;
```

## UI Generation
@pattern: automatic-ui-generation
-> creates: tweakpane-controls
-> location: property-panel

**Retrieval:**
```typescript
import { getTweakables } from '@starwards/core';

const tweakables = getTweakables(shipState);
// Returns: TweakableValue[]
```

## Usage Examples

### Boolean Toggle
```typescript
class SystemState extends Schema {
    @tweakable('boolean')
    @gameField('boolean')
    enabled: boolean = true;
}
```

### Numeric Input
```typescript
class Reactor extends SystemState {
    @tweakable('number')
    @gameField('float32')
    power: number = 1.0;
}
```

### Enum Dropdown
```typescript
import { Faction } from './faction';

class Spaceship extends SpaceObjectBase {
    @tweakable({ type: 'enum', enum: Faction })
    @gameField('int8')
    faction: Faction = Faction.NONE;
}
```

### Constrained Number
```typescript
class Shield extends SystemState {
    @tweakable({ 
        type: 'number', 
        number: { min: 0.05 } 
    })
    @gameField('float32')
    radius: number = 0.05;
}
```

### Dynamic Range
```typescript
class Reactor extends SystemState {
    @gameField(ReactorDesignState)
    design = new ReactorDesignState();
    
    @tweakable((t: Reactor) => ({
        type: 'number',
        number: { min: 0, max: t.design.maxEnergy }
    }))
    @gameField('float32')
    energy: number = 1000;
}
```

## Common Mistakes

### ❌ Wrong: Tweakable without gameField
```typescript
@tweakable('number')
speed: number = 0;  // Won't sync to clients!
```

### ✅ Correct: Stack with gameField
```typescript
@tweakable('number')
@gameField('float32')
speed: number = 0;
```

### ❌ Wrong: Wrong enum type
```typescript
@tweakable({ type: 'enum', enum: ['red', 'blue'] })  // Wrong!
color: string = 'red';
```

### ✅ Correct: Use string enum
```typescript
@tweakable({ type: 'string enum', enum: ['red', 'blue'] })
color: string = 'red';
```

## Do's and Don'ts

### DO
✓ Use for GM-adjustable properties
✓ Stack before @gameField
✓ Use enum types for dropdowns
✓ Add constraints for number inputs
✓ Use dynamic config when needed

### DON'T
✗ Use on non-Schema classes
✗ Forget @gameField for synced properties
✗ Mix enum types incorrectly
✗ Over-expose internal properties

---

# @range
@file: modules/core/src/range.ts
@category: validation
@stability: stable

-> enables: value-constraints
-> enforces: min-max-bounds
-> used-by: json-pointer-commands
:: decorator-function

## Purpose
Enforces min/max constraints on numeric properties. Automatically caps values in JSON Pointer commands.

## Signature
```typescript
range<T extends Schema>(
    r: Range<T> | SchemaRanges
): PropertyDecorator

type Range<T> = [number, number] | ((target: T) => [number, number])
```

## Range Types

### Static Range
```typescript
@range([0, 1])
@gameField('float32')
power: number = 1.0;
```

### Dynamic Range
```typescript
@range((t: Reactor) => [0, t.design.maxEnergy])
@gameField('float32')
energy: number = 1000;
```

### Nested Property Ranges
```typescript
@range({
    '/design/maxSpeed': [0, 1000],
    '/design/turnRate': [0, 360]
})
@gameField(ShipDesign)
design!: ShipDesign;
```

## Validation Behavior
@pattern: automatic-capping
-> applies-to: json-pointer-commands
-> uses: capToRange()

**Flow:**
1. Command received with value
2. Range retrieved via `getRange()`
3. Value capped: `capToRange(min, max, value)`
4. Capped value applied to property

**Implementation:**
```typescript
// From commands.ts:96-100
if (typeof value === 'number') {
    const range = tryGetRange(root, pointer);
    if (range) {
        value = capToRange(range[0], range[1], value);
    }
}
```

## Usage Examples

### Basic Range
```typescript
class SystemState extends Schema {
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    power: number = 1.0;
}
```

### Angle Range
```typescript
class SpaceObjectBase extends Schema {
    @range([0, 360])
    @gameField('float32')
    angle: number = 0;
}
```

### Dynamic Range from Design
```typescript
class Reactor extends SystemState {
    @gameField(ReactorDesignState)
    design = new ReactorDesignState();
    
    @range((t: Reactor) => [0, t.design.maxEnergy])
    @gameField('float32')
    energy: number = 1000;
}
```

### Heat Range
```typescript
import { MAX_SYSTEM_HEAT } from './heat-manager';

class SystemState extends Schema {
    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @gameField('float32')
    heat: number = 0;
}
```

### Schema-level Ranges
```typescript
@rangeSchema({
    '/reactor/energy': [0, 10000],
    '/thrusters/0/power': [0, 1],
    '/thrusters/1/power': [0, 1]
})
class ShipState extends Schema {
    // ...
}
```

## Range Retrieval
@function: getRange
-> returns: [number, number]
-> throws: Error if no range

```typescript
import { getRange, tryGetRange } from '@starwards/core';

// Throws if no range
const [min, max] = getRange(root, pointer);

// Returns undefined if no range
const range = tryGetRange(root, pointer);
if (range) {
    const [min, max] = range;
}
```

## Common Mistakes

### ❌ Wrong: Range without numeric type
```typescript
@range([0, 1])
@gameField('string')  // Wrong type!
name: string = '';
```

### ✅ Correct: Use with numeric types
```typescript
@range([0, 1])
@gameField('float32')
power: number = 1.0;
```

### ❌ Wrong: Invalid range order
```typescript
@range([100, 0])  // Max < Min!
value: number = 50;
```

### ✅ Correct: Min before max
```typescript
@range([0, 100])
value: number = 50;
```

## Do's and Don'ts

### DO
✓ Use for all bounded numeric properties
✓ Stack before @tweakable and @gameField
✓ Use dynamic ranges when needed
✓ Define ranges for command-controlled properties
✓ Use constants for common ranges

### DON'T
✗ Use on non-numeric properties
✗ Forget ranges on user-controlled values
✗ Use inverted ranges (max < min)
✗ Skip validation in manual setters

---

# @defectible
@file: modules/core/src/ship/system.ts
@category: damage-system
@stability: stable

-> enables: damage-tracking
-> integrates-with: damage-report
-> applies-to: SystemState properties
:: decorator-function

## Purpose
Marks SystemState properties as damageable. Tracked by damage system for repair/status display.

## Signature
```typescript
defectible(config: DefectibleConfig): PropertyDecorator

type DefectibleConfig = {
    normal: number;  // Normal/undamaged value
    name: string;    // Display name
}
```

## Damage Integration
@pattern: defectible-tracking
-> tracked-by: getSystems()
-> displayed-in: damage-report-widget

**System Status:**
- `DISABLED` - System broken
- `DAMAGED` - Defectible value ≠ normal
- `OK` - All defectibles at normal values

## Usage Examples

### Basic Defectible
```typescript
class Reactor extends SystemState {
    @defectible({ normal: 1, name: 'efficiency' })
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    efficiency: number = 1.0;
}
```

### Multiple Defectibles
```typescript
class Thruster extends SystemState {
    @defectible({ normal: 1, name: 'thrust efficiency' })
    @range([0, 1])
    @gameField('float32')
    thrustEfficiency: number = 1.0;
    
    @defectible({ normal: 1, name: 'turn efficiency' })
    @range([0, 1])
    @gameField('float32')
    turnEfficiency: number = 1.0;
}
```

### Retrieving Defectibles
```typescript
import { getSystems } from '@starwards/core';

const systems = getSystems(shipState);
for (const system of systems) {
    console.log(system.state.name);
    console.log(system.getStatus());  // 'OK' | 'DAMAGED' | 'DISABLED'
    
    for (const defectible of system.defectibles) {
        console.log(defectible.name, defectible.value, defectible.normal);
    }
}
```

## Damage Detection
@pattern: status-calculation
-> compares: current-value vs normal-value

```typescript
// From system.ts:93-105
getStatus: () => {
    if (state.broken) {
        return 'DISABLED';
    }
    if (defectibles.some((d) => {
        const currentValue = state[d.field] as number;
        return currentValue !== d.normal;
    })) {
        return 'DAMAGED';
    }
    return 'OK';
}
```

## Common Mistakes

### ❌ Wrong: Defectible on non-SystemState
```typescript
class SpaceObject extends Schema {
    @defectible({ normal: 100, name: 'health' })  // Wrong class!
    health: number = 100;
}
```

### ✅ Correct: Use on SystemState
```typescript
class Shield extends SystemState {
    @defectible({ normal: 1000, name: 'strength' })
    strength: number = 1000;
}
```

### ❌ Wrong: Missing normal value
```typescript
@defectible({ name: 'efficiency' })  // Missing normal!
efficiency: number = 1.0;
```

### ✅ Correct: Include normal value
```typescript
@defectible({ normal: 1, name: 'efficiency' })
efficiency: number = 1.0;
```

## Do's and Don'ts

### DO
✓ Use on SystemState properties only
✓ Provide meaningful display names
✓ Set normal to undamaged value
✓ Stack before @range
✓ Use for repairable properties

### DON'T
✗ Use on non-SystemState classes
✗ Forget normal value
✗ Use generic names
✗ Mark non-repairable properties

---

# Decorator Stacking

## Correct Order
@pattern: decorator-execution-order
-> executes: bottom-to-top

```typescript
@defectible({ normal: 1, name: 'efficiency' })  // 4th (optional)
@range([0, 1])                                   // 3rd (optional)
@tweakable('number')                             // 2nd (optional)
@gameField('float32')                            // 1st (required)
propertyName: number = 1.0;
```

## Why This Order?
@reason: decorator-execution-sequence

Decorators execute **bottom-to-top**:
1. `@gameField` - Registers with Colyseus (must be first)
2. `@tweakable` - Adds UI metadata (needs registered property)
3. `@range` - Adds validation metadata (needs property)
4. `@defectible` - Adds damage metadata (needs property)

## Common Patterns

### Synced Property
```typescript
@gameField('float32')
speed: number = 0;
```

### Tweakable Synced Property
```typescript
@tweakable('number')
@gameField('float32')
power: number = 1.0;
```

### Constrained Tweakable Property
```typescript
@range([0, 1])
@tweakable('number')
@gameField('float32')
power: number = 1.0;
```

### Full Stack (System Property)
```typescript
@defectible({ normal: 1, name: 'efficiency' })
@range([0, 1])
@tweakable('number')
@gameField('float32')
efficiency: number = 1.0;
```

## Template: New System Property

```typescript
class MySystem extends SystemState {
    readonly name = 'MySystem';
    readonly broken = false;
    
    @gameField(MySystemDesignState)
    design = new MySystemDesignState();
    
    // Damageable property with full stack
    @defectible({ normal: 1, name: 'my property' })
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    myProperty: number = 1.0;
    
    // Simple synced property
    @gameField('float32')
    internalValue: number = 0;
    
    // Computed property (not synced)
    get effectiveness(): number {
        return this.broken ? 0 : this.power * this.myProperty;
    }
}
```

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)
-> see: [SHIP_SYSTEMS_SPEC.md](SHIP_SYSTEMS_SPEC.md)