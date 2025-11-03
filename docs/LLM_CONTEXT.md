# LLM Context Guide

**Quick reference for AI assistants working with Starwards codebase**

## Project

**Starwards:** Multiplayer space/starship simulator for LARPs

**Stack:** Colyseus v0.15 | TypeScript (strict) | PixiJS v7 | React 17 | XState v5 | Node-RED

**Type:** Monorepo (npm workspaces) at `/data/Workspace/helios/starwards`

## Critical Patterns

### Decorators

```typescript
// @gameField - Colyseus sync (MUST be last decorator)
@gameField('float32') speed = 0;                    // Primitive
@gameField(Radar) radar!: Radar;                    // Nested
@gameField([Thruster]) thrusters = new ArraySchema<Thruster>();  // Array
@gameField({ map: Spaceship }) ships = new MapSchema<Spaceship>(); // Map

// @range - Value constraints
@range([0, 1]) power = 1.0;                         // Static
@range((t: Reactor) => [0, t.design.maxEnergy]) energy = 1000;  // Dynamic

// @tweakable - GM/debug UI
@tweakable('boolean') enabled = true;
@tweakable({ type: 'enum', enum: Faction }) faction = Faction.PLAYER;

// Stacking order
@range([0, 1])           // 1st
@tweakable('number')     // 2nd
@gameField('float32')    // 3rd (last)
power = 1.0;
```

### State Sync

**Server → Client:**
```typescript
state.property = value;  // Triggers auto-sync to all clients
```

**Client → Server:**
```typescript
room.send({type: '/Spaceship/ship-1/rotation', value: 0.5});  // JSON Pointer
room.send('commandName', {value: 0.5});                       // Typed command
```

### Space Objects

**Base:** `SpaceObjectBase` (abstract)

**Types:** `Spaceship|Projectile|Explosion|Asteroid|Waypoint`

**Properties:** `id|position|velocity|angle|radius|health|destroyed|freeze|faction`

**Type guard:** `Spaceship.isInstance(o): o is Spaceship`

### State Classes

| Class | Location | Key Properties |
|-------|----------|----------------|
| SpaceState | `space/space-state.ts:21` | `Spaceship\|Projectile\|Explosion\|Asteroid\|Waypoint: MapSchema<T>` |
| ShipState | `ship/ship-state.ts:52` | `reactor\|thrusters\|chainGun\|radar\|armor\|tubes\|warp` |
| AdminState | `admin/index.ts:11` | `space: SpaceState\|mapName\|running` |

## Common Tasks

### Add Ship System

```typescript
// 1. Create system
class Shield extends SystemState {
    @gameField(ShieldDesign) design = new ShieldDesign();
    @gameField('float32') @range([0, 1000]) strength = 1000;
}

// 2. Add to ShipState
@gameField(Shield) shield!: Shield;

// 3. Create manager
class ShieldManager {
    update(dt: number) {
        this.state.shield.strength += rate * dt;
    }
}
```

### Send Command

```typescript
// JSON Pointer (dynamic)
room.send({type: '/Spaceship/ship-1/reactor/power', value: 0.8});

// Typed command (optimized)
const send = cmdSender(room, rotateCmd, undefined);
send(0.5);
```

### Listen to State

```typescript
ship.state.onChange(() => console.log('Changed'));
ship.state.reactor.listen('energy', (v) => console.log('Energy:', v));
```

## Key Gotchas

| Issue | Wrong | Correct |
|-------|-------|---------|
| **Float precision** | `@gameField('float32') speed = 123.456789` → 123.46 | Use `toBeCloseTo()` in tests |
| **Angle wrapping** | `angle += delta` | `angle = toPositiveDegreesDelta(angle + delta)` |
| **Velocity zero** | `velocity.x === 0 && velocity.y === 0` | `XY.isZero(velocity, 0.01)` |
| **Effectiveness** | `thruster.maxThrust` | `thruster.maxThrust × thruster.effectiveness` |
| **State access** | `state.ships` (private) | `Array.from(state.getAll('Spaceship'))` |
| **State update** | `state.velocity = {x, y}` | `state.velocity.setValue({x, y})` |

**Effectiveness:** `broken ? 0 : power × coolantFactor × (1 - hacked)`

## File Navigation

```
core/src/
├── space/          SpaceState, Spaceship, Projectile, Explosion, Asteroid, Waypoint
├── ship/           ShipState, Reactor, Thruster, Radar, ChainGun, Armor, Tube, Warp
├── logic/          SpaceManager(physics), XY(vectors), formulas
├── client/         ConnectionManager, Driver
└── [decorators]    @gameField, @tweakable, @range, @defectible

server/src/
├── admin/room.ts   AdminRoom
├── space/room.ts   SpaceRoom
└── ship/room.ts    ShipRoom (JSON Pointer only)

browser/src/
├── radar/          CameraView, SpriteLayer, BlipRenderer
├── widgets/        Dashboard, TacticalRadar, SystemStatus
└── screens/        Ship, Pilot, Weapons
```

## Extension Points

### New Space Object
1. Extend `SpaceObjectBase`
2. Add to `SpaceObjects` union
3. Add `MapSchema` to `SpaceState`
4. Implement collision in `SpaceManager`
5. Add blip renderer

### New Ship System
1. Extend `SystemState`
2. Add to `ShipState`
3. Create manager
4. Add to `ShipManager.update()`
5. Create widget

### New Widget
1. Implement in `widgets/`
2. Register with `Dashboard`
3. Add to screen layouts

## Quick Reference

**Enums:**
- `Faction: NONE|PLAYER|ENEMY|NEUTRAL`
- `Order: NONE|MOVE|ATTACK|FOLLOW`
- `PowerLevel: SHUTDOWN=0|LOW=0.25|MID=0.5|HIGH=0.75|MAX=1`
- `IdleStrategy: PLAY_DEAD|ROAM|STAND_GROUND`

**Utils:**
- `XY.lengthOf(v)|angleOf(v)|normalize(v)|rotate(v, deg)|add(a, b)|scale(v, s)`
- `toDegreesDelta(deg)` → [-180, 180]
- `toPositiveDegreesDelta(deg)` → [0, 360]
- `capToRange(min, max, value)`

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md) | [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md)
