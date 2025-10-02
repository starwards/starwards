# Architecture

**Client-server architecture with real-time WebSocket state sync**

## System Overview

```
Browser ←──WS──→ Server(Colyseus) ←──WS──→ Node-RED
   │                   │                      │
 Core(shared)      Core(shared)          Core(shared)
```

**Principles:** Server-authoritative | Real-time sync | Shared core | Modular

## Modules

| Module | Tool | Output | Purpose |
|--------|------|--------|---------|
| core | tsup | `cjs/` | Shared logic, schemas, physics |
| server | tsc | `dist/` | Colyseus rooms, game logic |
| browser | webpack | `dist/` | PixiJS + React UI |
| node-red | rollup+tsc | `dist/` | Integration nodes |
| e2e | playwright | - | E2E tests |

**Build order:** core → (server, browser, node-red in parallel)

**Path aliases:** `@starwards/*` → `modules/*/src` or `modules/*/cjs`

## Core Module Structure

```
core/src/
├── space/          # SpaceState, Spaceship, Projectile, Explosion, Asteroid, Waypoint
├── ship/           # ShipState, Reactor, Thruster, Radar, ChainGun, Tube, Armor, etc.
├── logic/          # SpaceManager(physics), XY(vectors), formulas
├── client/         # ConnectionManager, Driver, Ship
└── [decorators]    # @gameField, @tweakable, @range, @defectible
```

## Rooms

| Room | Instance | Purpose | Room ID |
|------|----------|---------|---------|
| AdminRoom | 1 | Game lifecycle mgmt | admin |
| SpaceRoom | 1 | Space simulation | space |
| ShipRoom | 1/ship | Individual ship control | shipId |

## Data Flow

**Client Action → Server:**
```
room.send(cmd, data) → onMessage() → validate → update state → auto-sync
```

**Game Loop (60 Hz):**
```
setSimulationInterval(dt =>
  GameManager.update(dt) →
    SpaceManager.update(dt): physics, collisions
    ShipManager.update(dt): systems, energy, heat
  → state changes → delta sync → all clients
)
```

**Commands:**
- **JSON Pointer:** `/Spaceship/${id}/rotation` (dynamic paths)
- **Typed:** `{type:'cmd', value}` (type-safe, optimized)

## State Tree

```
AdminState
└── space: SpaceState
    ├── Spaceship: MapSchema<Spaceship>
    │   └── [id]: {position, velocity, angle, ...}
    ├── Projectile: MapSchema<Projectile>
    ├── Explosion: MapSchema<Explosion>
    ├── Asteroid: MapSchema<Asteroid>
    └── Waypoint: MapSchema<Waypoint>

ShipState (per ship, separate room)
├── design: ShipPropertiesDesignState
├── reactor: Reactor
├── thrusters: ArraySchema<Thruster>
├── tubes: ArraySchema<Tube>
├── chainGun: ChainGun
├── radar: Radar
├── armor: Armor
├── targeting: Targeting
└── [other systems]
```

## Colyseus Sync

**How it works:**
1. Server: `state.property = value` (triggers sync)
2. Colyseus: Detects change, creates delta
3. All clients: Auto-receive update via WebSocket
4. Client: `state.onChange()/listen()` for reactivity

**Optimizations:** Delta compression (90-98% bandwidth reduction), batched updates

## Build System

| Task | Command | Notes |
|------|---------|-------|
| Full build | `npm run build` | Core first, then parallel |
| Core watch | `cd modules/core && npm run build:watch` | Required for dev |
| Clean | `npm run clean` | Remove all artifacts |
| Production | `npm run pkg` | Native executables (Linux/macOS/Win) |

**Dev workflow (3 terminals):**
1. `cd modules/core && npm run build:watch`
2. `cd modules/browser && npm start` (http://localhost:3000)
3. `node -r ts-node/register/transpile-only modules/server/src/dev.ts` (port 8080)

## Network

**WebSocket flow:**
```
1. Client: Connect to ws://host:2567
2. Client: joinRoom('space')
3. Server: Send initial state (full snapshot)
4. Loop:
   - Client: send(cmd)
   - Server: process → update state
   - Server: broadcast delta to all clients
   - Client: state auto-updates
```

**Connection mgmt:** XState machine (Disconnected → Connecting → Connected → Error w/ retry)

## Deployment

**Docker Compose:**
- MQTT: Eclipse Mosquitto 1.6.10 (port 1883)
- Node-RED: 3.0.2 (port 1880)

**Integration:** Starwards ↔ MQTT ↔ Node-RED ↔ External (DMX lights, IoT, dashboards)

**Scaling limitations:**
- Single server instance (no horizontal scaling)
- Memory-bound by ship count
- One SpaceRoom, multiple ShipRooms

**Related:** [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md) | [DEVELOPMENT.md](DEVELOPMENT.md)
