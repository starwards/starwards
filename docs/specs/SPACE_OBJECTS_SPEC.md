# Space Objects Specification

@category: game-entities
@stability: stable
@location: modules/core/src/space

## Quick Reference

| Object Type | Purpose | Collision | Physics | Lifetime |
|-------------|---------|-----------|---------|----------|
| Spaceship | Player/NPC ships | Corporeal | Full | Persistent |
| Projectile | Bullets/missiles | Corporeal | Full | Time-limited |
| Explosion | Blast effects | Non-corporeal | None | Time-limited |
| Asteroid | Space debris | Corporeal | Full | Persistent |
| Waypoint | Navigation markers | Non-corporeal | None | Persistent |

---

# SpaceObjectBase Contract
@file: modules/core/src/space/space-object-base.ts
@pattern: abstract-base-class
@stability: stable

-> extends: Schema
-> requires: type-discrimination
-> implements: physics-properties
:: abstract-class

## Required Properties

### Type Discrimination
```typescript
abstract class SpaceObjectBase extends Schema {
    // Required: unique type identifier
    public abstract readonly type: keyof SpaceObjects;
}

// SpaceObjects type union
type SpaceObjects = {
    Spaceship: Spaceship;
    Projectile: Projectile;
    Explosion: Explosion;
    Asteroid: Asteroid;
    Waypoint: Waypoint;
};
```

### Core Properties
```typescript
@gameField('string')
public id: string = '';

@gameField(Vec2)
public position: Vec2 = new Vec2(0, 0);

@gameField(Vec2)
public velocity: Vec2 = new Vec2(0, 0);

@range([0, 360])
@gameField('float32')
public angle: number = 0;

@gameField('float32')
public radius: number = 0.05;

@gameField('boolean')
public destroyed: boolean = false;

@gameField('boolean')
public freeze: boolean = false;

@gameField('boolean')
public expendable: boolean = true;

@gameField('float32')
public turnSpeed: number = 0;
```

### Physics Properties
```typescript
// Faction (default: NONE)
public readonly faction: Faction = Faction.NONE;

// Radar range (default: 0)
public readonly radarRange: number = 0;

// Collision elasticity (0-1)
public readonly collisionElasticity: number = 0.05;

// Collision damage (0-1)
public readonly collisionDamage: number = 0.5;

// Physical collision enabled
public readonly isCorporal: boolean = true;
```

## Coordinate System Methods

### Global ↔ Local Conversion
```typescript
// Global to local coordinates
globalToLocal(global: XY): XY {
    return XY.rotate(global, -this.angle);
}

// Local to global coordinates
localToGlobal(local: XY): XY {
    return XY.rotate(local, this.angle);
}

// Direction axis (forward vector)
get directionAxis(): XY {
    return XY.rotate(XY.one, this.angle - 90);
}
```

---

# Object Type Discrimination
@pattern: discriminated-union
@stability: stable

## Type Property
```typescript
class Spaceship extends SpaceObjectBase {
    @gameField('string')
    public readonly type = 'Spaceship' as const;
}

class Asteroid extends SpaceObjectBase {
    @gameField('string')
    public readonly type = 'Asteroid' as const;
}
```

## Type Guards
```typescript
class Spaceship extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Spaceship => {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    };
}

// Usage
if (Spaceship.isInstance(object)) {
    // TypeScript knows object is Spaceship
    console.log(object.radarRange);
}
```

## Type Filtering
```typescript
enum TypeFilter {
    ALL = 0,
    OBJECTS,      // Exclude waypoints
    WAYPOINTS,    // Only waypoints
}

export const filterObject = (f: TypeFilter) => (o: SpaceObjectBase) => {
    switch (f) {
        case TypeFilter.ALL:
            return true;
        case TypeFilter.OBJECTS:
            return o.type !== 'Waypoint';
        case TypeFilter.WAYPOINTS:
            return o.type === 'Waypoint';
    }
};

// Usage
const objects = allObjects.filter(filterObject(TypeFilter.OBJECTS));
```

---

# Collision System Integration
@pattern: physics-integration
@manager: SpaceManager

## Collision Properties

### isCorporal
@property: collision-enabled
@default: true

```typescript
// Corporeal objects collide
public readonly isCorporal: boolean = true;

// Non-corporeal objects pass through
public readonly isCorporal: boolean = false;
```

### collisionElasticity
@property: bounce-factor
@range: [0, 1]
@default: 0.05

```typescript
// How much overlap converts to velocity
// 0 = no bounce, 1 = full elastic collision
public readonly collisionElasticity: number = 0.05;
```

### collisionDamage
@property: damage-factor
@range: [0, 1]
@default: 0.5

```typescript
// How much overlap converts to damage
// 0 = no damage, 1 = full damage
public readonly collisionDamage: number = 0.5;
```

## Collision Detection
@function: distanceSpaceObjects
@returns: distance-between-surfaces

```typescript
export function distanceSpaceObjects(
    a: SpaceObjectBase, 
    b: SpaceObjectBase
): number {
    return XY.lengthOf(XY.difference(a.position, b.position)) 
           - a.radius 
           - b.radius;
}

// Usage
const distance = distanceSpaceObjects(ship, asteroid);
if (distance < 0) {
    // Collision detected
    handleCollision(ship, asteroid, -distance);
}
```

---

# Physics Properties
@category: movement-rotation

## Position & Velocity
```typescript
@gameField(Vec2)
public position: Vec2 = new Vec2(0, 0);

@gameField(Vec2)
public velocity: Vec2 = new Vec2(0, 0);

// Update position
object.position.x += object.velocity.x * deltaSeconds;
object.position.y += object.velocity.y * deltaSeconds;
```

## Angle & Rotation
```typescript
@range([0, 360])
@gameField('float32')
public angle: number = 0;

@gameField('float32')
public turnSpeed: number = 0;

// Update angle
object.angle += object.turnSpeed * deltaSeconds;
object.angle = toPositiveDegreesDelta(object.angle);
```

## Freeze
@property: pause-physics
@default: false

```typescript
@gameField('boolean')
public freeze: boolean = false;

// Physics update
if (!object.freeze) {
    updatePhysics(object, deltaSeconds);
}
```

---

# Lifecycle Management

## Creation
```typescript
// Create object
const asteroid = new Asteroid().init(
    makeId(),                           // Unique ID
    Vec2.make({ x: 100, y: 200 }),     // Position
    5.0                                 // Radius
);

// Insert into space
spaceManager.insert(asteroid);
```

## Updates
```typescript
// Physics update (every frame)
if (!object.freeze) {
    object.position.x += object.velocity.x * deltaSeconds;
    object.position.y += object.velocity.y * deltaSeconds;
    object.angle += object.turnSpeed * deltaSeconds;
}
```

## Destruction
```typescript
// Mark for destruction
object.destroyed = true;

// Cleanup (next frame)
if (object.destroyed && object.expendable) {
    spaceState.asteroids.delete(object.id);
}
```

---

# Creating New Object Types

## Step-by-Step Guide

### 1. Define Object Class
```typescript
// modules/core/src/space/my-object.ts
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';

export class MyObject extends SpaceObjectBase {
    // Type guard
    public static isInstance = (o: unknown): o is MyObject => {
        return !!o && (o as SpaceObjectBase).type === 'MyObject';
    };
    
    // Type identifier
    @gameField('string')
    public readonly type = 'MyObject' as const;
    
    // Custom properties
    @gameField('float32')
    public customValue: number = 0;
    
    // Physics properties
    public readonly isCorporal: boolean = true;
    public readonly collisionElasticity: number = 0.1;
    public readonly collisionDamage: number = 0.3;
    
    // Initialization
    init(id: string, position: Vec2, customValue: number): this {
        this.id = id;
        this.position = position;
        this.customValue = customValue;
        this.radius = 10;
        return this;
    }
}
```

### 2. Add to SpaceObjects Type
```typescript
// modules/core/src/space/index.ts
export type SpaceObjects = {
    Spaceship: Spaceship;
    Projectile: Projectile;
    Explosion: Explosion;
    Asteroid: Asteroid;
    Waypoint: Waypoint;
    MyObject: MyObject;  // Add new type
};
```

### 3. Add MapSchema to SpaceState
```typescript
// modules/core/src/space/space-state.ts
import { MyObject } from './my-object';

class SpaceState extends Schema {
    @gameField({ map: MyObject })
    myObjects = new MapSchema<MyObject>();
}
```

### 4. Add Collision Handling
```typescript
// modules/core/src/logic/space-manager.ts
private handleCollisions(deltaSeconds: number) {
    // Add collision pairs
    this.checkCollisions(
        this.state.ships,
        this.state.myObjects,
        this.handleShipMyObjectCollision
    );
}

private handleShipMyObjectCollision(
    ship: Spaceship,
    myObject: MyObject,
    overlap: number
) {
    // Handle collision
    const damage = overlap * myObject.collisionDamage;
    ship.health -= damage;
    
    // Apply bounce
    const bounce = overlap * myObject.collisionElasticity;
    // ... apply velocity changes
}
```

### 5. Add Blip Renderer
```typescript
// modules/browser/src/radar/blips/blip-renderer.ts
import { MyObject } from '@starwards/core';

function renderMyObject(
    object: MyObject,
    graphics: Graphics,
    color: number
) {
    graphics.beginFill(color);
    graphics.drawCircle(0, 0, object.radius);
    graphics.endFill();
}

// Register renderer
export function renderBlip(object: SpaceObjectBase, ...) {
    if (MyObject.isInstance(object)) {
        renderMyObject(object, graphics, color);
    }
    // ... other types
}
```

### 6. Add Creation Command
```typescript
// modules/core/src/space/space-commands.ts
export const createMyObjectCmd: StateCommand<
    CreateMyObjectData,
    SpaceState,
    void
> = {
    cmdName: 'createMyObject',
    setValue: (state, data) => {
        const myObject = new MyObject().init(
            makeId(),
            Vec2.make(data.position),
            data.customValue
        );
        state.myObjects.set(myObject.id, myObject);
    }
};
```

---

# Object Type Patterns

## Spaceship Pattern
@file: modules/core/src/space/spaceship.ts
@type: player-npc-ships

```typescript
export class Spaceship extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Spaceship => {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    };
    
    public static radius = 50;
    
    @gameField('string')
    public readonly type = 'Spaceship';
    
    @gameField('int8')
    @tweakable({ type: 'enum', enum: Faction })
    public faction: Faction = Faction.NONE;
    
    @gameField('float32')
    public radarRange: number = 0;
    
    @gameField('string')
    @tweakable('string')
    public model: ShipModel | null = null;
    
    constructor() {
        super();
        this.radius = Spaceship.radius;
    }
    
    init(id: string, position: Vec2, shipModel: ShipModel, faction: Faction): this {
        this.id = id;
        this.position = position;
        this.model = shipModel;
        this.faction = faction;
        return this;
    }
}
```

## Projectile Pattern
@file: modules/core/src/space/projectile.ts
@type: bullets-missiles

```typescript
export class Projectile extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Projectile => {
        return !!o && (o as SpaceObjectBase).type === 'Projectile';
    };
    
    @gameField('string')
    public readonly type = 'Projectile';
    
    @gameField('string')
    public sourceId: string = '';
    
    @gameField('float32')
    public damage: number = 10;
    
    @gameField('float32')
    public timeToLive: number = 5.0;
    
    public readonly isCorporal: boolean = true;
    public readonly collisionDamage: number = 1.0;
    
    init(
        id: string,
        position: Vec2,
        velocity: Vec2,
        sourceId: string,
        damage: number
    ): this {
        this.id = id;
        this.position = position;
        this.velocity = velocity;
        this.sourceId = sourceId;
        this.damage = damage;
        this.radius = 2;
        return this;
    }
}
```

## Explosion Pattern
@file: modules/core/src/space/explosion.ts
@type: blast-effects

```typescript
export class Explosion extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Explosion => {
        return !!o && (o as SpaceObjectBase).type === 'Explosion';
    };
    
    @gameField('string')
    public readonly type = 'Explosion';
    
    @gameField('float32')
    public damageFactor: number = 1;
    
    @gameField('float32')
    public timeToLive: number = 1.0;
    
    // Non-corporeal (no collision)
    public readonly isCorporal: boolean = false;
    
    init(id: string, position: Vec2, damageFactor: number): this {
        this.id = id;
        this.position = position;
        this.damageFactor = damageFactor;
        this.radius = 50;
        return this;
    }
}
```

## Asteroid Pattern
@file: modules/core/src/space/asteroid.ts
@type: space-debris

```typescript
export class Asteroid extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Asteroid => {
        return !!o && (o as SpaceObjectBase).type === 'Asteroid';
    };
    
    public static maxSize = 50;
    
    @gameField('string')
    public readonly type = 'Asteroid';
    
    public readonly isCorporal: boolean = true;
    public readonly collisionElasticity: number = 0.2;
    public readonly collisionDamage: number = 0.8;
    
    init(id: string, position: Vec2, radius: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        return this;
    }
}
```

## Waypoint Pattern
@file: modules/core/src/space/waypoint.ts
@type: navigation-markers

```typescript
export class Waypoint extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Waypoint => {
        return !!o && (o as SpaceObjectBase).type === 'Waypoint';
    };
    
    @gameField('string')
    public readonly type = 'Waypoint';
    
    @gameField('string')
    public label: string = '';
    
    // Non-corporeal (no collision)
    public readonly isCorporal: boolean = false;
    
    init(id: string, position: Vec2, label: string): this {
        this.id = id;
        this.position = position;
        this.label = label;
        this.radius = 10;
        return this;
    }
}
```

---

# Utility Functions

## Distance Calculation
```typescript
export function distanceSpaceObjects(
    a: SpaceObjectBase, 
    b: SpaceObjectBase
): number {
    return XY.lengthOf(XY.difference(a.position, b.position)) 
           - a.radius 
           - b.radius;
}
```

## Comparison
```typescript
export function compareSpaceObjects(
    a: SpaceObjectBase, 
    b: SpaceObjectBase
): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}
```

## Type Checking
```typescript
function isSpaceObject(k: unknown): k is SpaceObjectBase {
    return !!k && k instanceof SpaceObjectBase;
}

// Usage
const objects = ids
    .map(id => state.get(id))
    .filter(isSpaceObject);
```

---

# Best Practices

## DO
✓ Extend SpaceObjectBase for all space objects
✓ Implement type guard (isInstance)
✓ Use const assertion for type property
✓ Initialize via init() method
✓ Set appropriate collision properties
✓ Use Vec2 for position/velocity
✓ Mark temporary objects as expendable
✓ Use freeze for paused objects

## DON'T
✗ Skip type discrimination
✗ Forget to add to SpaceObjects type
✗ Modify readonly properties
✗ Use native objects for position/velocity
✗ Skip collision property configuration
✗ Create objects without init()
✗ Forget to add MapSchema to SpaceState
✗ Skip blip renderer implementation

---

# Template: New Space Object

```typescript
// 1. Define class
export class MyObject extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is MyObject => {
        return !!o && (o as SpaceObjectBase).type === 'MyObject';
    };
    
    @gameField('string')
    public readonly type = 'MyObject' as const;
    
    // Custom properties
    @gameField('float32')
    public myProperty: number = 0;
    
    // Physics configuration
    public readonly isCorporal: boolean = true;
    public readonly collisionElasticity: number = 0.1;
    public readonly collisionDamage: number = 0.5;
    
    init(id: string, position: Vec2, myProperty: number): this {
        this.id = id;
        this.position = position;
        this.myProperty = myProperty;
        this.radius = 10;
        return this;
    }
}

// 2. Add to SpaceObjects type
export type SpaceObjects = {
    // ... existing types
    MyObject: MyObject;
};

// 3. Add to SpaceState
class SpaceState extends Schema {
    @gameField({ map: MyObject })
    myObjects = new MapSchema<MyObject>();
}

// 4. Add collision handling in SpaceManager
// 5. Add blip renderer
// 6. Add creation command
```

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [DECORATORS_SPEC.md](DECORATORS_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)