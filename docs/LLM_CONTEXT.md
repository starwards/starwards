---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship/system.ts
  - modules/core/src/space/space-state.ts
  - modules/core/src/ship/ship-state.ts
related:
  - ARCHITECTURE.md
  - API_REFERENCE.md
  - PATTERNS.md
  - AUTHORING.md
last_verified: 2026-06-13
---

# LLM Context Guide

**Quick reference for AI assistants working with Starwards codebase.** Writing or editing
docs? Follow [AUTHORING.md](AUTHORING.md) (no line numbers, versions live in DEPENDENCIES.md).

## Project

**Starwards:** Multiplayer space/starship simulator for LARPs

**Stack:** Colyseus · TypeScript (strict) · PixiJS · React · XState · Node-RED — versions in [DEPENDENCIES.md](DEPENDENCIES.md)

**Type:** Monorepo (npm workspaces); repo-relative paths throughout

## Task → Docs & Skills

Route by what you're doing. Skills (invoked via the Skill tool) carry the step-by-step
workflow; docs carry the reference detail. Don't duplicate skill content into docs.

| Task | Start here | Skill |
|------|-----------|-------|
| Add a ship system / subsystem | §Add Ship System below · [SUBSYSTEMS.md](SUBSYSTEMS.md) · [specs/SHIP_SYSTEMS_SPEC.md](specs/SHIP_SYSTEMS_SPEC.md) | `starwards-tdd` |
| Add/modify a station screen or widget | [specs/WIDGET_SYSTEM_SPEC.md](specs/WIDGET_SYSTEM_SPEC.md) · [UI_SPECIFICATION.md](UI_SPECIFICATION.md) | `starwards-station-ui` |
| State not syncing / `@gameField` issue | [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md) · [specs/STATE_MANAGEMENT_SPEC.md](specs/STATE_MANAGEMENT_SPEC.md) | `starwards-colyseus` |
| Add a command | [API_REFERENCE.md](API_REFERENCE.md) · [specs/COMMAND_SYSTEM_SPEC.md](specs/COMMAND_SYSTEM_SPEC.md) | — |
| Fix a bug / "X is broken" | [PATTERNS.md](PATTERNS.md) | `starwards-debugging` |
| Build/import errors | [DEPENDENCIES.md](DEPENDENCIES.md) | `starwards-monorepo` |
| Confirm work is done | [testing/README.md](testing/README.md) | `starwards-verification` |
| Write or edit docs | [AUTHORING.md](AUTHORING.md) | — |

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
@tweakable({ type: 'enum', enum: Faction }) faction = Faction.NONE;

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

**Properties:** `id|position|velocity|angle|radius|destroyed|freeze|faction` (on SpaceObjectBase); `health` is not on the base — it exists only on `Projectile` and `Asteroid`.

**Type guard:** `Spaceship.isInstance(o): o is Spaceship`

### State Classes

| Class | Location | Key Properties |
|-------|----------|----------------|
| SpaceState | `space/space-state.ts` | `Spaceship\|Projectile\|Explosion\|Asteroid\|Waypoint: MapSchema<T>` |
| ShipState | `ship/ship-state.ts` | `reactor\|thrusters\|chainGun\|radar\|armor\|tubes\|warp` |
| AdminState | `admin/index.ts` | `gameStatus\|shipIds\|playerShipIds\|speed` |

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

**Effectiveness:** `broken ? 0 : power × hacked` (`hacked` is a HackLevel multiplier: OK=1, COMPROMISED=0.5, DISABLED=0; `coolantFactor` affects heat dissipation, not effectiveness — see `SystemState.effectiveness` in `modules/core/src/ship/system.ts`)

## Common Agent Mistakes & Recovery

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Wrote to `ship.state.angle` / `.position` / `.faction` | Change is silently overwritten every tick | These are read-only mirrors. Modify the `spaceObject` in `SpaceManager` (the source of truth); `syncShipProperties()` copies it back. |
| Accessed `state.ships` / `state.projectiles` | Undefined / private MapSchema | Use `state.getAll('Spaceship')`, `state.getShip(id)`, or `state.get(id)`. |
| Put `@gameField` last but above `@range`/`@tweakable` | Decorator metadata missing or wrong | `@gameField` must be the **innermost** (bottom) decorator. Order: `@range` → `@tweakable` → `@commandable` → `@gameField`. |
| Cited a `file.ts:NNN` line number in a doc | Doc rots on next refactor | Cite a greppable symbol + path instead (see [AUTHORING.md](AUTHORING.md)). |
| Claimed "tests pass" without running them | False completion | Run the real command; see `starwards-verification`. Evidence before claims. |

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
- `Faction: NONE=-1|Gravitas=0|Raiders=1|FACTION_COUNT=2`
- `Order: NONE|MOVE|ATTACK|FOLLOW`
- `PowerLevel: SHUTDOWN=0|LOW=0.25|NORMAL=0.5|HIGH=0.75|MAX=1`
- `IdleStrategy: PLAY_DEAD|ROAM|STAND_GROUND`

**Utils:**
- `XY.lengthOf(v)|angleOf(v)|normalize(v)|rotate(v, deg)|add(a, b)|scale(v, s)`
- `toDegreesDelta(deg)` → [-180, 180]
- `toPositiveDegreesDelta(deg)` → [0, 360]
- `capToRange(min, max, value)`

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md) | [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md)
