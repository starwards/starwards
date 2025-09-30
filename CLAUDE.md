# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Index

**For comprehensive details, refer to:**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System architecture, state management, physics engine
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - API endpoints, commands, event system
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) - Development setup, debugging, workflow
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) - Node-RED integration, external systems
- [`docs/PATTERNS.md`](docs/PATTERNS.md) - Code conventions, best practices, common patterns
- [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md) - Key insights, gotchas, extension points

## Specification Format Convention

**Files in `docs/specs/` follow a structured notation for token-efficient formal specifications:**

- **Concepts/Entities**: `#` headers for main concepts (e.g., `# Spaceship`, `# CollisionSystem`)
- **Properties/Attributes**: `##` subheaders for properties (e.g., `## velocity`, `## heat`, `## effectiveness`)
- **Relationships**: `->` denotes connections (e.g., `Ship -> Reactor`, `Command -> StateUpdate`)
- **Type Annotations**: `::` for type specifications (e.g., `velocity :: Vector2D`, `power :: [0,1]`)
- **Metadata/Tags**: `@` for annotations (e.g., `@invariant`, `@synchronized`, `@critical`)
- **Code Examples**: Fenced code blocks with language tags (```typescript, ```gherkin, etc.)
- **Hierarchical Structure**: Clear nested sections maintain readability

This lightweight notation balances token efficiency with formal reasoning about system behavior and test specifications.

## Project Overview

Starwards is a space and starship simulator designed for LARPs (Live Action Role-Playing games). It's a multiplayer browser-based game built on the Colyseus framework with a monorepo architecture using npm workspaces.

## Essential Commands

### Installation & Setup
```bash
npm ci                    # Install all dependencies
```

### Building
```bash
npm run build            # Build all modules (core first, then others in parallel)
npm run build:core       # Build only core module
npm run build:browser    # Build only browser client
npm run build:server     # Build only server
npm run build:node-red   # Build only node-red integration
npm run build:unity      # Generate C# schema for Unity integration
npm run clean            # Remove all build artifacts
```

### Testing
```bash
npm run test                # Run Jest unit tests (core, server, node-red)
npm run test:e2e            # Run Playwright E2E tests
npm run test:e2e -- --update-snapshots  # Update E2E snapshots locally
npm run snapshots:ci        # Update snapshots in CI environment (Docker, slow)
npm run test:types          # TypeScript type checking
npm run test:format         # Check formatting (prettier + eslint)
```

### Development
```bash
npm run lint                # Check linting issues
npm run lint:fix            # Auto-fix linting issues
npm run prettify            # Format all code
npm run start               # Start built server from ./dist
npm run browser             # Start webpack dev server
npm run node-red            # Start node-red development
```

### Packaging
```bash
npm run pkg                 # Generate native executables in ./dist
npm run release             # Full release process
```

## Repository Structure

### Monorepo with npm Workspaces

This is a monorepo where all sub-modules are in the `modules/` folder and managed via npm workspaces.

**Modules:**
- **browser** - Web client application (PixiJS 3D graphics, React UI, Golden Layout panels)
- **core** - Shared game logic and API objects (Colyseus schema, state management, game formulas)
- **server** - Colyseus game server (room management, game loop, Express API)
- **node-red** - Node-RED integration nodes for external integrations (MQTT, DMX, dashboards)
- **e2e** - End-to-End tests using Playwright

**Scripts:**
- `scripts/pkg.js` - Packages server into single native executable
- `scripts/post-build.js` - Copies artifacts to `./dist` folder

## Technology Stack

- **Multiplayer Framework**: Colyseus (v0.15) - WebSocket-based multiplayer server
- **State Synchronization**: @colyseus/schema - Automatic state sync between server/clients
- **State Machines**: XState v5 - Connection management and game state transitions
- **Graphics**: PixiJS v7 - Canvas-based 2D/3D rendering for space objects
- **UI Framework**: React 17 + Arwes (sci-fi UI components)
- **UI Layout**: Golden Layout - Draggable panel system for building custom station screens
- **Build Tools**: Webpack (browser), tsup (core), TypeScript compiler (server)
- **Testing**: Jest + @jgoz/jest-esbuild, Playwright

## Architecture

### State Management Flow

1. **SpaceState** ([`modules/core/src/space/space-state.ts`](modules/core/src/space/space-state.ts))
   - Root state container for the space simulation
   - Contains MapSchemas for: Spaceship, Projectile, Explosion, Asteroid, Waypoint
   - Manages space-wide commands (movement, bot orders, object creation)
   - Server-authoritative state synced to all clients via Colyseus

2. **ShipState** ([`modules/core/src/ship/ship-state.ts`](modules/core/src/ship/ship-state.ts))
   - Complete state for a single spaceship
   - Contains subsystems: Reactor, Maneuvering, Thruster, Radar, ChainGun, Tube, Magazine, Armor, Targeting, Warp, Docking, SmartPilot
   - Pilot controls: rotation, boost, strafe, antiDrift, breaks, afterBurner
   - Bot AI: order system (NONE, MOVE, ATTACK, FOLLOW), idle strategies (PLAY_DEAD, ROAM, STAND_GROUND)

3. **AdminState** ([`modules/core/src/admin/index.ts`](modules/core/src/admin/index.ts))
   - Game management state (game status, settings, configuration)
   - Accessed via AdminRoom for GM controls

4. **Colyseus Rooms** (modules/server/src)
   - **AdminRoom**: Game management (single instance, manages game loop)
   - **SpaceRoom**: Main gameplay room (manages SpaceState, handles movement/combat)
   - **ShipRoom**: Individual ship control (one per ship, roomId = shipId, JSON Pointer commands only)

5. **Game Manager** ([`modules/server/src/admin/game-manager.ts`](modules/server/src/admin/game-manager.ts))
   - Central orchestrator for game lifecycle (start/stop/save/load)
   - Ship creation/destruction coordination
   - Update loop management
   - Map initialization and room synchronization

6. **Client Connection** ([`modules/core/src/client/connection-manager.ts`](modules/core/src/client/connection-manager.ts))
   - XState v5 machine handling connection lifecycle
   - Automatic reconnection with exponential backoff
   - Room selection and state synchronization
   - Used by browser clients and Node-RED integration

### Game Field Decorators

The codebase uses `@gameField` decorators extensively for Colyseus schema definitions:
```typescript
@gameField('float32') speed = 0;
@gameField(Radar) radar!: Radar;
@gameField([Thruster]) thrusters!: ArraySchema<Thruster>;
```

These decorators enable automatic serialization and state synchronization between server and clients.

### Ship Subsystems

All ship systems extend [`SystemState`](modules/core/src/ship/system.ts) with common properties:
- `power` (0-1): Power allocation to the system
- `heat` (0-MAX_SYSTEM_HEAT): Thermal load from usage
- `coolantFactor` (0-1): Cooling efficiency
- `hacked` (0-1): Hacking status (reduces effectiveness)
- `broken`: System offline status
- `effectiveness`: Computed efficiency (power × coolantFactor × (1 - hacked))

**Key Subsystems:**
- **Reactor**: Energy generation for all systems
- **Maneuvering**: Rotation speed and afterburner
- **Thrusters**: Directional thrust (forward, backward, left, right)
- **Radar**: Detection range for other objects
- **ChainGun**: Rapid-fire kinetic weapons
- **Tubes**: Missile launchers with reload cycles
- **Magazine**: Ammunition storage and management
- **Armor**: Damage absorption and hit points
- **Targeting**: Weapon aiming computer
- **Warp**: FTL travel system
- **Docking**: Ship-to-ship docking mechanics
- **SmartPilot**: Autopilot modes (manual, auto-turn, auto-approach)

### Physics System

**[`SpaceManager`](modules/core/src/logic/space-manager.ts)** - Core physics engine:
- Circle-based collision detection via `detect-collisions` library
- Raycast for fast-moving projectiles
- Equation of motion for velocity/position updates
- Damage calculation and application
- Explosion propagation
- Attachment system for docked ships

**Helper Systems:**
- **Helm Assist**: [`modules/core/src/logic/helm-assist.ts`](modules/core/src/logic/helm-assist.ts) - Movement calculations
- **Gunner Assist**: [`modules/core/src/logic/gunner-assist.ts`](modules/core/src/logic/gunner-assist.ts) - Targeting predictions

### Module Path Mapping

TypeScript is configured with path aliases:
```typescript
import { SpaceState } from '@starwards/core';
import { SomeComponent } from '@starwards/browser';
```

Maps to `modules/*/src` or `modules/*/cjs` depending on build state. Jest and webpack are configured to resolve these paths.

## Development Workflow

### Three-Process Development Setup

Running a local development environment requires three concurrent processes:

1. **Core Module Build Watcher**
   ```bash
   cd ./modules/core && npm run build:watch
   ```
   Continuously rebuilds the core module when changes are detected. Keep running in background.

2. **Webpack Dev Server** (Frontend)
   ```bash
   cd ./modules/browser && npm start
   # Or on Node 17+:
   NODE_OPTIONS=--openssl-legacy-provider npm start
   ```
   Hot-reloading dev server on http://localhost/ (proxies API requests to backend).

3. **API Server** (Backend)
   ```bash
   node -r ts-node/register/transpile-only ./modules/server/src/dev.ts
   ```
   Game server with debug mode. Restart manually when server/core code changes.

**VSCode Users**: Tasks and debug configurations are pre-configured. Use the status bar buttons and debug panel.

### Testing Workflow

**Unit Tests**:
- Framework: Jest with `@jgoz/jest-esbuild` for fast TypeScript transpilation
- Config: [`jest.config.js`](jest.config.js) with three test projects (core, server, node-red)
- Pattern: `*.spec.ts` files co-located with source code
- Test utilities: [`ship-test-harness.ts`](modules/core/test/ship-test-harness.ts), [`test-driver.ts`](modules/server/src/test/driver.ts)
- Run: `npm run test`

**E2E Tests**:
- Framework: Playwright (Chromium only)
- Config: [`playwright.config.ts`](playwright.config.ts)
- Specs: [`modules/e2e/test/integration.spec.ts`](modules/e2e/test/integration.spec.ts)
- Visual regression: Snapshot testing for UI components

**Snapshot Management**:
1. Start dev environment (3 processes above)
2. Run `npm run test:e2e`
3. Update snapshots locally: `npm run test:e2e -- --update-snapshots`
4. Update snapshots for CI (Linux): `npm run snapshots:ci` (requires Docker)

**Coverage Note**: Test coverage is limited - manual testing required for most changes. Focus testing on physics, collision detection, and state synchronization.

### Node.js Version Note

- **Required**: Node.js >= 20.19.5, npm >= 10.2.4
- **Node 17 Issue**: Webpack dev server may require `NODE_OPTIONS=--openssl-legacy-provider` flag

## Special Features

### JSON Pointer Commands

The server accepts JSON Pointer (RFC 6901) commands for dynamic state updates:
```typescript
// In SpaceRoom
if (isJsonPointer(type)) {
  handleJsonPointerCommand(message, type, manager.state);
}
```

This allows clients to send targeted state updates using paths like `/Spaceship/${id}/rotation`.

### Bot AI System

Ships can be controlled by AI with configurable behaviors:
- **Orders**: NONE, MOVE (to position), ATTACK (target), FOLLOW (target)
- **Idle Strategies**: PLAY_DEAD, ROAM, STAND_GROUND
- Task system tracks current AI activity via `currentTask` string

### Tweakable System

Properties decorated with `@tweakable` can be dynamically adjusted via UI panels:
```typescript
@tweakable({ type: 'enum', enum: IdleStrategy })
idleStrategy = IdleStrategy.PLAY_DEAD;
```

Used for GM controls and debugging.

### Schema Code Generation

The game state can be exported to Unity via C# schema generation:
```bash
npm run build:unity
```

Generates C# classes in `./unity-schema/` from TypeScript Colyseus schemas.

## Docker Deployment

**Docker Compose Services:** [`docker/docker-compose.yml`](docker/docker-compose.yml)
- **mqtt** - Eclipse Mosquitto 1.6.10 (port 1883) - Message broker for external integrations
- **node-red** - Node-RED 3.0.2 (port 1880) - Visual programming for integrations

```bash
cd docker && docker-compose up -d     # Start services
docker-compose down                   # Stop services
```

## Key Patterns & Gotchas

### State Synchronization Rules
- All state changes MUST go through Colyseus schemas decorated with `@gameField`
- Direct property assignment triggers automatic network sync to all clients
- Server is authoritative - clients send commands, server updates state

### Common Gotchas
- **Float Precision**: `@gameField('float32')` automatically rounds to 2 decimals
- **Angle Wrapping**: Always use `toPositiveDegreesDelta()` for 0-360 degree range
- **Velocity Zero Check**: Use `XY.isZero(velocity, threshold)` instead of direct comparison
- **System Effectiveness**: Multiply by `power * (1 - hacked) * coolantFactor` for actual output
- **JSON Pointer Paths**: Format is `/Type/${id}/property` (e.g., `/Spaceship/ship-1/rotation`)

### Command Flow Pattern
```
Client → room.send(command) → Server Handler → State Update → Auto-sync to All Clients
```

**Two Command Types:**
1. **Typed Commands**: Type-safe, defined in `StateCommand` interface
2. **JSON Pointer Commands**: Dynamic paths for direct property updates (RFC 6901)

## Extension Points

### Adding New Space Objects
1. Extend [`SpaceObjectBase`](modules/core/src/space/space-object-base.ts)
2. Add to `SpaceObjects` discriminated union type
3. Add `MapSchema` property to [`SpaceState`](modules/core/src/space/space-state.ts)
4. Implement collision handling in [`SpaceManager`](modules/core/src/logic/space-manager.ts)
5. Add blip renderer in [`modules/browser/src/radar/blips/`](modules/browser/src/radar/blips/)

### Adding New Ship Subsystems
1. Extend [`SystemState`](modules/core/src/ship/system.ts) with `@gameField` decorators
2. Add property to [`ShipState`](modules/core/src/ship/ship-state.ts)
3. Implement update logic in [`ShipManager`](modules/core/src/ship/ship-manager.ts)
4. Create UI widget in [`modules/browser/src/widgets/`](modules/browser/src/widgets/)
5. Add widget to relevant screen layouts

### Adding New Widgets
1. Implement widget interface in [`modules/browser/src/widgets/`](modules/browser/src/widgets/)
2. Register with [`Dashboard`](modules/browser/src/widgets/dashboard.ts)
3. Add to screen layouts in [`modules/browser/src/screens/`](modules/browser/src/screens/)

## Performance Considerations

- **Collision Detection**: O(n²) complexity - consider spatial partitioning for large object counts
- **Rendering**: 30 FPS cap prevents GPU overheating on client browsers
- **Network**: Colyseus uses delta compression - only changed properties are transmitted
- **State Updates**: Batched per game loop tick (configurable via `setSimulationInterval`)

## Hosting Internet Games

Use [ngrok](https://ngrok.com/) to expose local server:
```bash
./ngrok http
```

Creates an HTTP tunnel for remote players to connect to your development server.

## Critical Dependencies

**Core Framework:**
- `colyseus` ^0.15.15 - Multiplayer server framework
- `@colyseus/schema` ^2.0.30 - State synchronization
- `colyseus.js` ^0.15.18 - Client library

**State & Logic:**
- `xstate` ^5.9.1 - State machines for connection management
- `detect-collisions` ^9.5.3 - Physics collision detection
- `json-ptr` ^3.1.1 - JSON Pointer (RFC 6901) command paths

**Browser Rendering:**
- `pixi.js` ^7.1.2 - Canvas-based 2D/3D graphics
- `react` ^17.0.2 - UI framework
- `golden-layout` ^1.5.9 - Draggable panel system
- `@arwes/core` 1.0.0-alpha.19 - Sci-fi UI components

**Development:**
- `typescript` ~5.4.3 - Type system
- `webpack` ^5.91.0 - Browser bundler
- `tsup` ^8.0.2 - Core module bundler
- `jest` ^29.7.0 + `@playwright/test` ^1.42.1 - Testing

## Coding Conventions

**File Naming**: kebab-case (e.g., `ship-state.ts`, `space-manager.ts`)

**Classes**: PascalCase with suffixes (`*State`, `*Manager`, `*Room`)

**Functions**: camelCase with prefixes (`get*`, `set*`, `handle*`, `calc*`)

**Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_SYSTEM_HEAT`)

**TypeScript**: Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`

**Type Guards**: Use static `isInstance` methods for type checking
```typescript
public static isInstance = (o: unknown): o is Spaceship => {
    return (o as Spaceship)?.type === 'Spaceship';
};
```

## Contribution Guidelines

- **Commit Messages**: Follow Conventional Commits specification for large/impactful changes
- **Code Style**: Run `npm run test:format` before committing
- **Pre-commit Hooks**: Husky runs `pretty-quick` and `eslint --fix` on staged files
- **Manual Testing**: Test coverage is limited - manually verify changes in affected areas
- **Architecture Review**: For major changes, consult [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PATTERNS.md`](docs/PATTERNS.md)
- **VSCode**: Project includes recommended extensions and workspace settings

## Additional Documentation

For comprehensive information beyond this quick reference:
- **Architecture Details**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **API Reference**: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- **Development Guide**: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- **Integration Guide**: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- **Code Patterns**: [`docs/PATTERNS.md`](docs/PATTERNS.md)
- **LLM Context**: [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md)
