# Architecture Documentation - Starwards

**System architecture and component relationships**

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Component Architecture](#component-architecture)
- [Module Dependencies](#module-dependencies)
- [Data Flow](#data-flow)
- [State Synchronization](#state-synchronization)
- [Build System](#build-system)

## High-Level Overview

Starwards uses a **client-server architecture** with real-time state synchronization via WebSocket.

```
┌─────────────────────────────────────────────────────────────┐
│                        STARWARDS                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐  │
│  │   Browser    │◄────►│    Server    │◄────►│ Node-RED │  │
│  │   Client     │ WS   │   (Colyseus) │ WS   │  Nodes   │  │
│  └──────────────┘      └──────────────┘      └──────────┘  │
│         │                      │                    │        │
│         │                      │                    │        │
│    ┌────▼────┐           ┌────▼────┐         ┌────▼────┐   │
│    │  Core   │           │  Core   │         │  Core   │   │
│    │ (shared)│           │ (shared)│         │ (shared)│   │
│    └─────────┘           └─────────┘         └─────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Server-Authoritative:** All game logic runs on server
2. **Real-Time Sync:** State changes propagate automatically
3. **Shared Core:** Common logic in `@starwards/core`
4. **Modular Design:** Independent modules with clear boundaries

## Component Architecture

### Monorepo Structure

```
starwards/
├── modules/
│   ├── core/           # Shared game logic & schemas
│   ├── server/         # Colyseus game server
│   ├── browser/        # Web client (PixiJS + React)
│   ├── node-red/       # Node-RED integration
│   └── e2e/            # End-to-end tests
├── docker/             # Docker Compose setup
├── scripts/            # Build utilities
└── static/             # Static assets
```

### Core Module

**Purpose:** Shared game logic, state schemas, physics

**Key Components:**

```
core/src/
├── space/              # Space objects & state
│   ├── space-state.ts      # Root space container
│   ├── spaceship.ts        # Ship objects
│   ├── projectile.ts       # Projectiles
│   ├── explosion.ts        # Explosions
│   └── asteroid.ts         # Asteroids
├── ship/               # Ship systems & state
│   ├── ship-state.ts       # Ship state schema
│   ├── reactor.ts          # Energy system
│   ├── thruster.ts         # Propulsion
│   ├── radar.ts            # Detection
│   └── [other systems]
├── logic/              # Game logic
│   ├── space-manager.ts    # Physics engine
│   ├── xy.ts               # Vector math
│   └── formulas.ts         # Game formulas
├── client/             # Client drivers
│   ├── connection-manager.ts  # Connection state
│   ├── driver.ts           # Base driver
│   └── ship.ts             # Ship driver
└── [decorators & utils]
```

**Exports:** `@starwards/core`

### Server Module

**Purpose:** Colyseus game server, room management, API

**Key Components:**

```
server/src/
├── admin/
│   ├── game-manager.ts     # Game lifecycle
│   ├── room.ts             # Admin room
│   └── map-helper.ts       # Map loading
├── ship/
│   └── room.ts             # Ship room
├── space/
│   └── room.ts             # Space room
├── serialization/
│   └── game-state-protocol.ts  # State serialization
└── server.ts               # Express + Colyseus setup
```

**Rooms:**
- **AdminRoom** - Game management (single instance)
- **SpaceRoom** - Space simulation (single instance)
- **ShipRoom** - Individual ships (one per ship)

### Browser Module

**Purpose:** Web client with 3D graphics and UI

**Key Components:**

```
browser/src/
├── radar/              # PixiJS rendering
│   ├── camera-view.ts      # Base renderer
│   ├── sprite-layer.ts     # Object sprites
│   ├── grid-layer.ts       # Background grid
│   └── blips/              # Type-specific renderers
├── widgets/            # UI widgets
│   ├── dashboard.ts        # Widget system
│   ├── tactical-radar.ts   # Main radar
│   ├── system-status.ts    # System health
│   └── [other widgets]
├── screens/            # Screen layouts
│   ├── ship.ts             # Main ship screen
│   ├── pilot.ts            # Pilot station
│   └── weapons.ts          # Weapons station
├── input/              # Input handling
│   └── input-manager.ts    # Keyboard/gamepad
└── components/         # React components
    └── lobby.tsx           # Game lobby
```

**UI Stack:**
- PixiJS v7 (Canvas rendering)
- React 17 (UI components)
- Golden Layout (Panel system)
- Arwes (Sci-fi styling)

### Node-RED Module

**Purpose:** External integration via Node-RED

**Key Components:**

```
node-red/src/
├── starwards-config/       # Connection config node
├── ship-read/              # Read ship state
└── ship-write/             # Write ship state
```

**Integration Flow:**
```
Node-RED Flow → ship-write → WebSocket → Server
Server → WebSocket → ship-read → Node-RED Flow
```

## Module Dependencies

### Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Browser  │───►│   Core   │◄───│  Server  │     │
│  └──────────┘    └──────────┘    └──────────┘     │
│                         ▲                           │
│                         │                           │
│                   ┌─────┴──────┐                    │
│                   │  Node-RED  │                    │
│                   └────────────┘                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Build Order

1. **Core** - Must build first (dependency for all)
2. **Server, Browser, Node-RED** - Can build in parallel

### Path Aliases

All modules use TypeScript path aliases:

```typescript
// tsconfig.json
{
  "paths": {
    "@starwards/*": ["modules/*/src", "modules/*/cjs"]
  }
}
```

**Usage:**
```typescript
import { SpaceState, ShipState } from '@starwards/core';
```

## Data Flow

### Client → Server → Client

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT ACTION                          │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  room.send(command, data)                                 │
│  Example: room.send('/Spaceship/ship-1/rotation', 0.5)   │
└────────────────────┬─────────────────────────────────────┘
                     │ WebSocket
                     ▼
┌──────────────────────────────────────────────────────────┐
│  SERVER: Room.onMessage(client, type, message)            │
│  - Validate command                                       │
│  - Process logic                                          │
│  - Update state                                           │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  STATE UPDATE                                             │
│  state.property = newValue  // Triggers Colyseus sync    │
└────────────────────┬─────────────────────────────────────┘
                     │ Delta Compression
                     ▼
┌──────────────────────────────────────────────────────────┐
│  ALL CLIENTS: state.onChange()                            │
│  - Automatic state update                                 │
│  - UI re-renders                                          │
│  - Listeners notified                                     │
└──────────────────────────────────────────────────────────┘
```

### Game Loop Flow

```
┌─────────────────────────────────────────────────────────┐
│  AdminRoom.setSimulationInterval(deltaMs => ...)         │
│  Fixed timestep: ~60 FPS                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GameManager.update(deltaSeconds)                        │
│  - Process commands                                      │
│  - Update all managers                                   │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Space   │  │   Ship   │  │   Ship   │
│ Manager  │  │ Manager  │  │ Manager  │
│          │  │   (PC)   │  │  (NPC)   │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     │  Physics    │  Systems    │  AI
     │  Collisions │  Energy     │  Orders
     │  Movement   │  Heat       │  Combat
     │             │             │
     └─────────────┴─────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  State Changes → Colyseus Sync → All Clients             │
└─────────────────────────────────────────────────────────┘
```

### Command Processing

**JSON Pointer Commands:**
```
Client: room.send('/path/to/property', { value: newValue })
   ↓
Server: handleJsonPointerCommand(message, type, root)
   ↓
Validate: tryGetRange(root, pointer) → check bounds
   ↓
Update: pointer.set(root, cappedValue)
   ↓
Sync: Colyseus auto-syncs to all clients
```

**Typed Commands:**
```
Client: room.send('commandName', { value, path })
   ↓
Server: cmdReceiver(manager, command)
   ↓
Execute: command.setValue(state, value, path)
   ↓
Sync: Colyseus auto-syncs to all clients
```

## State Synchronization

### Colyseus Schema System

**How It Works:**

1. **Define Schema:**
```typescript
class ShipState extends Schema {
    @gameField('float32') rotation = 0;
    @gameField(Reactor) reactor!: Reactor;
}
```

2. **Server Updates:**
```typescript
ship.rotation = 45;  // Triggers sync
```

3. **Client Receives:**
```typescript
ship.onChange(() => {
    console.log('Ship changed');
});

ship.listen('rotation', (value) => {
    console.log('Rotation:', value);
});
```

### State Tree Structure

```
AdminState
├── space: SpaceState
│   ├── Spaceship: MapSchema<Spaceship>
│   │   └── [shipId]: Spaceship
│   │       ├── position: Vec2
│   │       ├── velocity: Vec2
│   │       └── ...
│   ├── Projectile: MapSchema<Projectile>
│   ├── Explosion: MapSchema<Explosion>
│   ├── Asteroid: MapSchema<Asteroid>
│   └── Waypoint: MapSchema<Waypoint>
└── [game metadata]

ShipState (per ship)
├── reactor: Reactor
├── thrusters: ArraySchema<Thruster>
├── tubes: ArraySchema<Tube>
├── radar: Radar
├── armor: Armor
├── weaponsTarget: Targeting
└── [other systems]
```

### Synchronization Patterns

**Full Sync:**
- Initial connection
- Room join
- Complete state snapshot

**Delta Sync:**
- Property changes
- Array/Map modifications
- Nested object updates

**Optimization:**
- Delta compression
- Batched updates
- Change detection

## Build System

### Build Tools by Module

| Module | Tool | Config | Output |
|--------|------|--------|--------|
| Core | tsup | [`tsup.config.js`](../modules/core/tsup.config.js) | `cjs/` |
| Server | tsc | [`tsconfig.json`](../modules/server/tsconfig.json) | `dist/` |
| Browser | Webpack | [`webpack.common.js`](../modules/browser/webpack.common.js) | `dist/` |
| Node-RED | Rollup + tsc | [`rollup.config.editor.mjs`](../modules/node-red/rollup.config.editor.mjs) | `dist/` |

### Build Process

```
┌─────────────────────────────────────────────────────────┐
│  npm run build                                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  1. Build Core (tsup)                                    │
│     modules/core/src → modules/core/cjs                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  2. Build Others in Parallel                             │
│     ├─ Server (tsc)                                      │
│     ├─ Browser (webpack)                                 │
│     └─ Node-RED (rollup + tsc)                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  3. Post-Build (scripts/post-build.js)                   │
│     Copy artifacts to ./dist/                            │
└─────────────────────────────────────────────────────────┘
```

### Development Build

**Three-Process Setup:**

```
Terminal 1: Core Watch
cd modules/core && npm run build:watch
   ↓
Watches src/ → Rebuilds on change

Terminal 2: Webpack Dev Server
cd modules/browser && npm start
   ↓
Hot reload + Proxy to server

Terminal 3: API Server
node -r ts-node/register/transpile-only modules/server/src/dev.ts
   ↓
Game server with debug mode
```

### Production Build

```bash
npm run build          # Build all modules
npm run postbuild      # Copy to ./dist
npm run pkg            # Create native executable
```

**Output:**
```
dist/
├── starwards-linux    # Linux executable
├── starwards-macos    # macOS executable
├── starwards-win.exe  # Windows executable
└── [static assets]
```

## Network Architecture

### WebSocket Communication

```
┌──────────────┐                    ┌──────────────┐
│   Browser    │◄──────────────────►│    Server    │
│   Client     │   WebSocket (WS)   │  (Colyseus)  │
└──────────────┘                    └──────────────┘
       │                                    │
       │  1. Connect                        │
       ├───────────────────────────────────►│
       │                                    │
       │  2. Join Room                      │
       ├───────────────────────────────────►│
       │                                    │
       │  3. Initial State                  │
       │◄───────────────────────────────────┤
       │                                    │
       │  4. Commands                       │
       ├───────────────────────────────────►│
       │                                    │
       │  5. State Deltas                   │
       │◄───────────────────────────────────┤
       │                                    │
```

### Connection Management

**XState Machine:** [`connection-manager.ts`](../modules/core/src/client/connection-manager.ts)

```
┌─────────────┐
│ Disconnected│
└──────┬──────┘
       │ CONNECT
       ▼
┌─────────────┐
│ Connecting  │──────► Error (timeout)
└──────┬──────┘
       │ CONNECTED
       ▼
┌─────────────┐
│  Connected  │◄────── Reconnect
└──────┬──────┘
       │ ERROR/DISCONNECT
       ▼
┌─────────────┐
│    Error    │──────► Retry (exponential backoff)
└─────────────┘
```

**Features:**
- Automatic reconnection
- Exponential backoff
- Connection state events
- Error handling

## Deployment Architecture

### Docker Compose Setup

```yaml
services:
  mqtt:
    image: eclipse-mosquitto:1.6.10
    ports: ["1883:1883"]
    
  node-red:
    image: nodered/node-red:3.0.2
    ports: ["1880:1880"]
    volumes: ["./node-red-data:/data"]
```

**Integration:**
```
Starwards Server ◄──► MQTT ◄──► Node-RED ◄──► External Systems
                                    │
                                    ├──► DMX Lights
                                    ├──► Sound Systems
                                    └──► Custom Hardware
```

### Scaling Considerations

**Current Architecture:**
- Single server instance
- Multiple client connections
- One SpaceRoom per game
- One ShipRoom per ship

**Limitations:**
- No horizontal scaling
- Single point of failure
- Memory-bound by ship count

**Future Improvements:**
- Room-based sharding
- Redis state adapter
- Load balancing

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development guide
- [INTEGRATION.md](INTEGRATION.md) - Integration guide