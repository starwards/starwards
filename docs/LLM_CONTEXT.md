# LLM Context Guide - Starwards

**Quick-start guide for LLMs working with the Starwards codebase**

## Project Overview

**Starwards** is a multiplayer space and starship simulator for LARPs (Live Action Role-Playing). Built with TypeScript, it features real-time state synchronization, browser-based 3D graphics, and extensive external integration capabilities.

**Key Technologies:**
- Colyseus v0.15 (multiplayer framework with WebSocket)
- TypeScript (strict mode)
- PixiJS v7 (2D/3D canvas rendering)
- React 17 + Arwes (sci-fi UI)
- XState v5 (state machines)
- Node-RED integration

**Project Type:** Monorepo (npm workspaces)

**Root Directory:** `/data/Workspace/helios/starwards`

## Critical Patterns

### 1. Decorator System

**[@gameField](modules/core/src/game-field.ts:16)** - Colyseus schema synchronization
```typescript
@gameField('float32') speed = 0;              // Primitive (auto-synced)
@gameField(Radar) radar!: Radar;              // Nested object
@gameField([Thruster]) thrusters!: ArraySchema<Thruster>;  // Array
@gameField({ map: Spaceship }) ships = new MapSchema<Spaceship>();  // Map
```
- Enables automatic client-server state sync
- Rounds float32 to 2 decimal places
- Required for all synced properties

**[@tweakable](modules/core/src/tweakable.ts:38)** - Runtime-adjustable properties
```typescript
@tweakable('boolean') enabled = true;
@tweakable('number') power = 1.0;
@tweakable({ type: 'enum', enum: IdleStrategy }) strategy = IdleStrategy.PLAY_DEAD;
```
- Used for GM controls and debugging
- Accessible via UI panels
- Retrieved with [`getTweakables(state)`](modules/core/src/tweakable.ts:44)

**[@range](modules/core/src/range.ts:39)** - Value constraints
```typescript
@range([0, 1]) power = 1.0;                   // Static range
@range((t: Reactor) => [0, t.design.maxEnergy]) energy = 1000;  // Dynamic range
```
- Enforces min/max bounds
- Supports static or computed ranges
- Used with JSON Pointer commands

### 2. State Synchronization

**Server → Client Flow:**
1. Server updates Colyseus schema property
2. Colyseus detects change
3. Delta compressed update sent to clients
4. Client schema automatically updated

**Client → Server Flow:**
1. Client calls `room.send(command, data)`
2. Server handler processes command
3. Server updates state
4. Changes auto-sync to all clients

**Key State Classes:**
- [`SpaceState`](modules/core/src/space/space-state.ts:21) - Space simulation (ships, projectiles, asteroids)
- [`ShipState`](modules/core/src/ship/ship-state.ts:52) - Individual ship (systems, controls)
- [`AdminState`](modules/core/src/admin/index.ts:11) - Game management

### 3. Command System

**JSON Pointer Commands** (RFC 6901):
```typescript
// Send command
room.send('/Spaceship/ship-1/rotation', { value: 0.5 });

// Server handles via handleJsonPointerCommand()
// Automatically validates ranges and updates state
```

**Typed Commands:**
```typescript
// Define command
const rotateCmd: StateCommand<number, ShipState, void> = {
    cmdName: 'rotate',
    setValue: (state, value) => state.rotation = value
};

// Send
room.send('rotate', { value: 0.5 });
```

### 4. Space Objects Hierarchy

**Base:** [`SpaceObjectBase`](modules/core/src/space/space-object-base.ts:34)

**Types:**
- [`Spaceship`](modules/core/src/space/spaceship.ts:14) - Player/NPC ships
- [`Projectile`](modules/core/src/space/projectile.ts:67) - Bullets, missiles
- [`Explosion`](modules/core/src/space/explosion.ts:28) - Blast effects
- [`Asteroid`](modules/core/src/space/asteroid.ts:11) - Space debris
- [`Waypoint`](modules/core/src/space/waypoint.ts:13) - Navigation markers

**Common Properties:**
```typescript
id: string                    // Unique identifier
position: Vec2                // X, Y coordinates
velocity: Vec2                // Movement vector
angle: number                 // Direction (0-360 degrees)
radius: number                // Collision radius
health: number                // Hit points
destroyed: boolean            // Marked for deletion
freeze: boolean               // Pause physics
```

## Common Tasks

### Task 1: Add New Ship System

**Example: Adding a Shield System**

1. **Create system state** ([`modules/core/src/ship/shield.ts`](modules/core/src/ship/)):
```typescript
import { SystemState, DesignState } from './system';
import { gameField } from '../game-field';
import { range } from '../range';

class ShieldDesignState extends DesignState {
    @gameField('float32') maxStrength = 1000;
    @gameField('float32') rechargeRate = 10;
}

export class Shield extends SystemState {
    readonly name = 'Shield';
    readonly broken = false;
    
    @gameField(ShieldDesignState)
    design = new ShieldDesignState();
    
    @gameField('float32')
    @range((t: Shield) => [0, t.design.maxStrength])
    strength = 1000;
}
```

2. **Add to ShipState** ([`modules/core/src/ship/ship-state.ts`](modules/core/src/ship/ship-state.ts:52)):
```typescript
@gameField(Shield)
shield!: Shield;
```

3. **Implement manager logic** ([`modules/core/src/ship/shield-manager.ts`](modules/core/src/ship/)):
```typescript
export class ShieldManager {
    update(deltaSeconds: number) {
        if (!this.state.shield.broken) {
            this.state.shield.strength += 
                this.state.shield.design.rechargeRate * deltaSeconds;
        }
    }
}
```

4. **Add UI widget** ([`modules/browser/src/widgets/shield.ts`](modules/browser/src/widgets/)):
```typescript
export const shield = createWidget({
    name: 'shield',
    render: (ship: ShipDriver) => {
        // Render shield status
    }
});
```

### Task 2: Send Command from Client

```typescript
import { sendJsonCmd } from '@starwards/core';

// In client code
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);

// Or typed command
room.send('rotate', { value: 0.5, path: undefined });
```

### Task 3: Listen to State Changes

```typescript
// In Node-RED or client
ship.state.onChange(() => {
    console.log('Ship state changed');
});

// Specific property
ship.state.reactor.listen('energy', (value) => {
    console.log('Energy:', value);
});
```

### Task 4: Create New Space Object

```typescript
// In SpaceManager or command handler
const asteroid = new Asteroid().init(
    makeId(),                    // Unique ID
    Vec2.make({ x: 100, y: 200 }),  // Position
    5.0                          // Radius
);
spaceManager.insert(asteroid);
```

### Task 5: Add New Widget

```typescript
import { createWidget } from './create';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        // Build UI
        return container;
    }
});

// Register in dashboard.ts
registerWidget(myWidget);
```

## File Navigation Guide

### Core Module ([`modules/core/src/`](modules/core/src/))

**State Management:**
- [`space/space-state.ts`](modules/core/src/space/space-state.ts) - Root space state
- [`ship/ship-state.ts`](modules/core/src/ship/ship-state.ts) - Ship state
- [`admin/index.ts`](modules/core/src/admin/index.ts) - Admin state

**Decorators:**
- [`game-field.ts`](modules/core/src/game-field.ts) - @gameField decorator
- [`tweakable.ts`](modules/core/src/tweakable.ts) - @tweakable decorator
- [`range.ts`](modules/core/src/range.ts) - @range decorator

**Ship Systems:**
- [`ship/reactor.ts`](modules/core/src/ship/reactor.ts) - Energy generation
- [`ship/thruster.ts`](modules/core/src/ship/thruster.ts) - Propulsion
- [`ship/radar.ts`](modules/core/src/ship/radar.ts) - Detection
- [`ship/chain-gun.ts`](modules/core/src/ship/chain-gun.ts) - Weapons
- [`ship/warp.ts`](modules/core/src/ship/warp.ts) - FTL travel

**Physics:**
- [`logic/space-manager.ts`](modules/core/src/logic/space-manager.ts) - Physics engine
- [`logic/xy.ts`](modules/core/src/logic/xy.ts) - 2D vector math
- [`logic/formulas.ts`](modules/core/src/logic/formulas.ts) - Game formulas

**Commands:**
- [`commands.ts`](modules/core/src/commands.ts) - Command system
- [`space/space-commands.ts`](modules/core/src/space/space-commands.ts) - Space commands

### Server Module ([`modules/server/src/`](modules/server/src/))

**Rooms:**
- [`admin/room.ts`](modules/server/src/admin/room.ts) - Admin room
- [`ship/room.ts`](modules/server/src/ship/room.ts) - Ship room
- [`space/room.ts`](modules/server/src/space/room.ts) - Space room

**Management:**
- [`admin/game-manager.ts`](modules/server/src/admin/game-manager.ts) - Game lifecycle
- [`server.ts`](modules/server/src/server.ts) - Express server

### Browser Module ([`modules/browser/src/`](modules/browser/src/))

**Rendering:**
- [`radar/camera-view.ts`](modules/browser/src/radar/camera-view.ts) - Base renderer
- [`radar/sprite-layer.ts`](modules/browser/src/radar/sprite-layer.ts) - Object sprites
- [`radar/blips/blip-renderer.ts`](modules/browser/src/radar/blips/blip-renderer.ts) - Type-specific rendering

**Widgets:**
- [`widgets/dashboard.ts`](modules/browser/src/widgets/dashboard.ts) - Widget system
- [`widgets/tactical-radar.ts`](modules/browser/src/widgets/tactical-radar.ts) - Main radar
- [`widgets/system-status.ts`](modules/browser/src/widgets/system-status.ts) - System health

**Screens:**
- [`screens/ship.ts`](modules/browser/src/screens/ship.ts) - Main ship screen
- [`screens/pilot.ts`](modules/browser/src/screens/pilot.ts) - Pilot station
- [`screens/weapons.ts`](modules/browser/src/screens/weapons.ts) - Weapons station

## Gotchas and Best Practices

### Gotchas

1. **Float Precision:** `@gameField('float32')` rounds to 2 decimals automatically
2. **Angle Wrapping:** Always use `toPositiveDegreesDelta()` for 0-360 range
3. **Velocity Zero Check:** Use `XY.isZero(velocity, threshold)` not `=== 0`
4. **System Effectiveness:** Multiply by `power * hacked * efficiency`
5. **Colyseus Schemas:** Must use `@gameField` for synced properties
6. **Array/Map Updates:** Use Colyseus `ArraySchema`/`MapSchema`, not native arrays
7. **Build Order:** Core module must build before others

### Best Practices

1. **State Updates:** Always update via Colyseus schemas, never bypass
2. **Commands:** Use JSON Pointer for dynamic updates, typed commands for structured
3. **Error Handling:** Log with context using `console.error()`
4. **Type Safety:** Use type guards (`Spaceship.isInstance(obj)`)
5. **Performance:** Batch state updates, avoid per-frame allocations
6. **Testing:** Manual testing required (limited test coverage)
7. **Decorators:** Stack in order: `@range`, `@tweakable`, `@gameField`

### Common Patterns

**Type Guard:**
```typescript
public static isInstance = (o: unknown): o is Spaceship => {
    return (o as Spaceship)?.type === 'Spaceship';
};
```

**Computed Property:**
```typescript
get effectiveness() {
    return this.broken ? 0 : this.power * this.hacked;
}
```

**Manager Pattern:**
```typescript
class SystemManager {
    constructor(private state: ShipState) {}
    
    update(deltaSeconds: number) {
        // Update logic
    }
}
```

## Extension Points

### Adding New Space Object Type

1. Extend [`SpaceObjectBase`](modules/core/src/space/space-object-base.ts)
2. Add to `SpaceObjects` type union
3. Add `MapSchema` to [`SpaceState`](modules/core/src/space/space-state.ts)
4. Implement collision handling in [`SpaceManager`](modules/core/src/logic/space-manager.ts)
5. Add blip renderer in [`blip-renderer.ts`](modules/browser/src/radar/blips/blip-renderer.ts)

### Adding New Ship System

1. Extend [`SystemState`](modules/core/src/ship/system.ts)
2. Add to [`ShipState`](modules/core/src/ship/ship-state.ts)
3. Create manager class
4. Add to [`ShipManager`](modules/core/src/ship/ship-manager.ts) update loop
5. Create UI widget

### Adding New Widget

1. Implement widget interface in [`widgets/`](modules/browser/src/widgets/)
2. Register with [`Dashboard`](modules/browser/src/widgets/dashboard.ts)
3. Add to screen layouts in [`screens/`](modules/browser/src/screens/)

### Adding New Command

1. Define command in appropriate module
2. Add handler in room's `onMessage()`
3. Register receiver with `cmdReceivers()`
4. Add client sender function

## Quick Reference

### Key Enums

```typescript
enum Faction { NONE, PLAYER, ENEMY, NEUTRAL }
enum Order { NONE, MOVE, ATTACK, FOLLOW }
enum IdleStrategy { PLAY_DEAD, ROAM, STAND_GROUND }
enum PowerLevel { SHUTDOWN = 0, LOW = 0.25, MID = 0.5, HIGH = 0.75, MAX = 1 }
```

### Important Constants

```typescript
MAX_SYSTEM_HEAT = 100
ZERO_VELOCITY_THRESHOLD = 0
GC_TIMEOUT = 5  // seconds
```

### Utility Functions

```typescript
XY.lengthOf(vector)           // Vector magnitude
XY.angleOf(vector)            // Vector angle (degrees)
XY.rotate(vector, angle)      // Rotate vector
toDegreesDelta(angle)         // Normalize to [-180, 180]
toPositiveDegreesDelta(angle) // Normalize to [0, 360]
capToRange(min, max, value)   // Clamp value
```

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture details
- [API_REFERENCE.md](API_REFERENCE.md) - Complete API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns and conventions
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
- [INTEGRATION.md](INTEGRATION.md) - External integrations
- [CLAUDE.md](../CLAUDE.md) - Original developer guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines