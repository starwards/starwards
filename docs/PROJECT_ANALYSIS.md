# Starwards Project Analysis - Comprehensive Report

## Executive Summary

**Starwards** is a sophisticated multiplayer space and starship simulator designed for LARPs (Live Action Role-Playing games). Built on the Colyseus framework, it features a monorepo architecture with real-time state synchronization, browser-based 3D graphics, and extensive external integration capabilities.

**Key Technologies:**
- Colyseus v0.15 (multiplayer framework)
- TypeScript (strict mode)
- PixiJS v7 (2D/3D rendering)
- React 17 + Arwes (sci-fi UI)
- XState v5 (state machines)
- Node-RED integration
- Docker deployment

---

## 1. Project Architecture

### 1.1 Monorepo Structure

**Root:** `/data/Workspace/helios/starwards`

**Modules (npm workspaces):**
- [`modules/core/`](modules/core/) - Shared game logic, Colyseus schemas, state management
- [`modules/browser/`](modules/browser/) - Web client (PixiJS graphics, React UI, Golden Layout)
- [`modules/server/`](modules/server/) - Colyseus game server (Express API, room management)
- [`modules/node-red/`](modules/node-red/) - Node-RED integration nodes
- [`modules/e2e/`](modules/e2e/) - Playwright end-to-end tests

**Supporting Directories:**
- [`docker/`](docker/) - Docker Compose setup (MQTT, Node-RED)
- [`scripts/`](scripts/) - Build utilities (pkg.js, post-build.js)
- [`custom-typings/`](custom-typings/) - Custom TypeScript definitions
- [`static/`](static/) - Static assets served by server

### 1.2 Build System

**Build Tools:**
- **Core:** tsup (fast TypeScript bundler)
- **Browser:** Webpack 5 (dev server + production builds)
- **Server:** TypeScript compiler (tsc)
- **Node-RED:** Rollup (editor) + tsc (runtime)

**Build Order:** Core must build first (dependency for all other modules)

**Path Aliases:** [`tsconfig.json:41-42`](tsconfig.json:41-42)
```typescript
"@starwards/*": ["modules/*/src", "modules/*/cjs"]
```

**Key Commands:**
- `npm run build` - Build all modules (core first, then parallel)
- `npm run build:watch` - Watch mode for core module
- `npm run clean` - Remove all build artifacts

---

## 2. Core Module Architecture

### 2.1 State Management System

**Root State Classes:**
- [`SpaceState`](modules/core/src/space/space-state.ts:21) - Space simulation container
- [`ShipState`](modules/core/src/ship/ship-state.ts:52) - Individual ship state
- [`AdminState`](modules/core/src/admin/index.ts:11) - Game management state

**State Synchronization:** Colyseus `@colyseus/schema` with automatic client sync

### 2.2 Decorator System

**[@gameField](modules/core/src/game-field.ts:16)** - Colyseus schema field decorator
```typescript
@gameField('float32') speed = 0;
@gameField(Radar) radar!: Radar;
@gameField([Thruster]) thrusters!: ArraySchema<Thruster>;
```
- Enables automatic serialization
- Rounds float32 to 2 decimal places
- Supports primitives, nested schemas, arrays, maps

**[@tweakable](modules/core/src/tweakable.ts:38)** - Runtime-adjustable properties
```typescript
@tweakable({ type: 'enum', enum: IdleStrategy })
idleStrategy = IdleStrategy.PLAY_DEAD;
```
- Used for GM controls and debugging
- Supports: boolean, number, string, enums, shipId
- Dynamic configuration via [`getTweakables()`](modules/core/src/tweakable.ts:44)

**[@range](modules/core/src/range.ts)** - Value range constraints
```typescript
@range([0, 1])
@gameField('float32')
public power = PowerLevel.MAX;
```

### 2.3 Space Objects Hierarchy

**Base:** [`SpaceObjectBase`](modules/core/src/space/space-object-base.ts)

**Types:**
- [`Spaceship`](modules/core/src/space/spaceship.ts:14) - Player/NPC ships
- [`Projectile`](modules/core/src/space/projectile.ts:67) - Bullets, missiles
- [`Explosion`](modules/core/src/space/explosion.ts:28) - Blast effects
- [`Asteroid`](modules/core/src/space/asteroid.ts:11) - Space debris
- [`Waypoint`](modules/core/src/waypoint.ts:13) - Navigation markers

**Common Properties:**
- `id`, `position`, `velocity`, `angle`, `radius`
- `health`, `destroyed`, `freeze`
- `collisionDamage`, `collisionElasticity`

### 2.4 Ship Subsystems

**Ship Systems (all extend [`SystemState`](modules/core/src/ship/system.ts:36)):**
- [`Reactor`](modules/core/src/ship/reactor.ts:23) - Energy generation
- [`Maneuvering`](modules/core/src/ship/maneuvering.ts:24) - Rotation, afterburner
- [`Thruster`](modules/core/src/ship/thruster.ts) - Directional thrust
- [`Radar`](modules/core/src/ship/radar.ts:29) - Detection range
- [`ChainGun`](modules/core/src/ship/chain-gun.ts:116) - Rapid-fire weapons
- [`Tube`](modules/core/src/ship/tube.ts) - Missile launchers
- [`Magazine`](modules/core/src/ship/magazine.ts:27) - Ammunition storage
- [`Armor`](modules/core/src/ship/armor.ts:21) - Damage absorption
- [`Targeting`](modules/core/src/ship/targeting.ts:20) - Weapon targeting
- [`Warp`](modules/core/src/ship/warp.ts:40) - FTL travel
- [`Docking`](modules/core/src/ship/docking.ts:33) - Ship docking
- [`SmartPilot`](modules/core/src/ship/smart-pilot.ts:29) - Autopilot

**System Properties:**
- `power` (0-1) - Power allocation
- `heat` (0-MAX_SYSTEM_HEAT) - Thermal load
- `coolantFactor` (0-1) - Cooling efficiency
- `hacked` (0-1) - Hacking status
- `broken` - System offline status
- `effectiveness` - Combined efficiency

### 2.5 Physics & Collision System

**Collision Detection:** [`detect-collisions`](modules/core/package.json:42) library

**[SpaceManager](modules/core/src/logic/space-manager.ts)** - Core physics engine:
- Circle-based collision detection
- Raycast for projectiles
- Velocity/position updates
- Damage calculation
- Explosion handling
- Attachment system (docking)

**Movement Calculations:**
- Equation of motion: [`XY.equasionOfMotion()`](modules/core/src/logic/xy.ts:39)
- Helm assist: [`modules/core/src/logic/helm-assist.ts`](modules/core/src/logic/helm-assist.ts)
- Gunner assist: [`modules/core/src/logic/gunner-assist.ts`](modules/core/src/logic/gunner-assist.ts)

### 2.6 Command System

**JSON Pointer Commands:** [`handleJsonPointerCommand()`](modules/core/src/commands.ts:90)
- RFC 6901 JSON Pointer paths
- Direct state updates via paths like `/Spaceship/${id}/rotation`
- Range validation and capping

**Typed Commands:** [`StateCommand`](modules/core/src/commands.ts:6) interface
- Type-safe command definitions
- Automatic receiver generation
- Used for space-wide operations

### 2.7 Event System

**[EventEmitter](modules/core/src/events.ts:8)** - Type-safe event handling
- Based on `colyseus-events`
- Room-level event propagation
- State change notifications

---

## 3. Server Architecture

### 3.1 Colyseus Rooms

**[AdminRoom](modules/server/src/admin/room.ts:5)** - Game management
- Single instance (autoDispose: false)
- Manages [`AdminState`](modules/core/src/admin/index.ts:11)
- Game loop via `setSimulationInterval()`

**[SpaceRoom](modules/server/src/space/room.ts:13)** - Space simulation
- Single instance per game
- Manages [`SpaceState`](modules/core/src/space/space-state.ts:21)
- Handles movement/bot commands
- JSON Pointer command support

**[ShipRoom](modules/server/src/ship/room.ts:5)** - Individual ships
- One room per ship (roomId = shipId)
- Manages [`ShipState`](modules/core/src/ship/ship-state.ts:52)
- JSON Pointer commands only
- Realtime listing enabled

### 3.2 Game Manager

**[GameManager](modules/server/src/admin/game-manager.ts:25)** - Central orchestrator:
- Game lifecycle (start/stop/save/load)
- Ship creation/destruction
- Update loop coordination
- Map initialization
- Room synchronization

**Game States:**
- `STOPPED` - No active game
- `STARTING` - Initializing
- `RUNNING` - Active gameplay
- `STOPPING` - Cleanup in progress

### 3.3 Ship Managers

**[ShipManagerPc](modules/core/src/ship/ship-manager.ts)** - Player ships:
- Energy management
- Heat management
- Movement control
- Weapon systems
- Smart pilot modes

**[ShipManagerNpc](modules/core/src/ship/ship-manager-npc.ts)** - AI ships:
- Bot orders (MOVE, ATTACK, FOLLOW)
- Idle strategies (PLAY_DEAD, ROAM, STAND_GROUND)
- Automated combat

### 3.4 API Endpoints

**Express Routes:** [`modules/server/src/server.ts`](modules/server/src/server.ts)
- `POST /start-game` - Start game with map
- `POST /stop-game` - Stop current game
- `POST /save-game` - Serialize game state
- `POST /load-game` - Restore game state
- `/colyseus-monitor` - Admin dashboard (basic auth)

---

## 4. Browser Client Architecture

### 4.1 Rendering System

**[PixiJS v7](modules/browser/package.json:33)** - Canvas rendering:
- [`CameraView`](modules/browser/src/radar/camera-view.ts:18) - Base renderer
- 30 FPS cap to prevent overheating
- Automatic resize handling
- Context menu disabled

**Radar Layers:**
- [`GridLayer`](modules/browser/src/radar/grid-layer.ts) - Background grid
- [`SpriteLayer`](modules/browser/src/radar/sprite-layer.ts) - Object sprites
- [`LineLayer`](modules/browser/src/radar/line-layer.ts) - Connections
- [`MovementAnchorLayer`](modules/browser/src/radar/movement-anchor-layer.ts) - Navigation aids
- [`InteractiveLayer`](modules/browser/src/radar/interactive-layer.ts) - User interaction

**Blip Renderers:** [`modules/browser/src/radar/blips/blip-renderer.ts`](modules/browser/src/radar/blips/blip-renderer.ts)
- Type-specific rendering (ships, projectiles, explosions, waypoints)
- Selection indicators
- Radar range visualization
- Field-of-view filtering

### 4.2 UI Framework

**[Golden Layout](modules/browser/package.json:29)** - Panel system:
- Draggable/resizable panels
- Persistent layouts
- Custom station configurations

**[Arwes](modules/browser/package.json:15-18)** - Sci-fi UI components:
- Futuristic styling
- Sound effects
- Animations

**[Tweakpane](modules/browser/package.json:38)** - Control panels:
- Real-time value editing
- System monitoring
- Debug controls

### 4.3 Widget System

**[Dashboard](modules/browser/src/widgets/dashboard.ts)** - Widget container:
- Widget registration
- Layout management
- Props handling

**Core Widgets:**
- [`tactical-radar`](modules/browser/src/widgets/tactical-radar.ts:28) - Main tactical view
- [`pilot-radar`](modules/browser/src/widgets/pilot-radar.ts:29) - Pilot perspective
- [`target-radar`](modules/browser/src/widgets/target-radar.ts:88) - Target tracking
- [`radar`](modules/browser/src/widgets/radar.ts:91) - General radar
- [`system-status`](modules/browser/src/widgets/system-status.ts) - System health
- [`damage-report`](modules/browser/src/widgets/damage-report.tsx:90) - Damage visualization
- [`ammo`](modules/browser/src/widgets/ammo.ts:9) - Ammunition status
- [`targeting`](modules/browser/src/widgets/targeting.ts:9) - Weapon targeting
- [`pilot`](modules/browser/src/widgets/pilot.ts:8) - Pilot controls
- [`warp`](modules/browser/src/widgets/warp.ts) - Warp drive
- [`docking`](modules/browser/src/widgets/docking.ts) - Docking interface

### 4.4 Screen Layouts

**Predefined Screens:**
- [`ship`](modules/browser/src/screens/ship.ts) - Main ship control
- [`pilot`](modules/browser/src/screens/pilot.ts) - Pilot station
- [`weapons`](modules/browser/src/screens/weapons.ts) - Weapons station
- [`ecr`](modules/browser/src/screens/ecr.ts) - Engineering station
- [`gm`](modules/browser/src/screens/gm.ts) - Game Master view

### 4.5 Input System

**[InputManager](modules/browser/src/input/input-manager.ts)** - Input handling:
- Keyboard bindings
- Gamepad support ([@maulingmonkey/gamepad](modules/browser/package.json:19))
- Hotkeys ([hotkeys-js](modules/browser/package.json:30))
- Command mapping

---

## 5. Node-RED Integration

### 5.1 Custom Nodes

**[starwards-config](modules/node-red/src/starwards-config/starwards-config.ts:12)** - Connection config:
- Server URL configuration
- Driver instance management
- Shared across ship nodes

**[ship-read](modules/node-red/src/ship-read/ship-read.ts:13)** - Read ship state:
- Listen to state changes (pattern matching)
- Query specific properties
- Output: `{topic: pointer, payload: value}`

**[ship-write](modules/node-red/src/ship-write/ship-write.ts:10)** - Write ship state:
- Send commands to ship
- Input: `{topic: pointer, payload: value}`
- JSON Pointer paths

### 5.2 Integration Architecture

**[Driver](modules/core/src/client/)** - Client connection:
- WebSocket connection management
- Room joining
- State synchronization
- Automatic reconnection

**Node Lifecycle:**
- Config node creates Driver
- Ship nodes get ShipDriver from config
- Status indicators (red/green/yellow)
- Cleanup on node close

---

## 6. Code Patterns & Conventions

### 6.1 Naming Conventions

**Files:**
- kebab-case: `ship-state.ts`, `space-manager.ts`
- Component suffix: `.spec.ts` (tests), `.tsx` (React)

**Classes:**
- PascalCase: `SpaceState`, `ShipManager`
- Suffix patterns: `*State`, `*Manager`, `*Room`

**Functions:**
- camelCase: `handleCollision()`, `updateVelocity()`
- Prefix patterns: `get*`, `set*`, `handle*`, `calc*`

**Constants:**
- SCREAMING_SNAKE_CASE: `MAX_SYSTEM_HEAT`, `ZERO_VELOCITY_THRESHOLD`

### 6.2 TypeScript Patterns

**Strict Mode:** [`tsconfig.json:24`](tsconfig.json:24)
```typescript
"strict": true
"noUnusedLocals": true
"noUnusedParameters": true
"noImplicitReturns": true
```

**Decorators:** [`tsconfig.json:64`](tsconfig.json:64)
```typescript
"experimentalDecorators": true
```

**Type Guards:**
```typescript
public static isInstance = (o: unknown): o is Spaceship => {
    return (o as Spaceship)?.type === 'Spaceship';
};
```

**Discriminated Unions:**
```typescript
type SpaceObject = Spaceship | Asteroid | Projectile | Explosion | Waypoint;
// Discriminated by 'type' property
```

### 6.3 Error Handling

**Console Errors:** Extensive use of `console.error()` with context
**Try-Catch:** Minimal - mostly in command handlers
**Validation:** Range capping, type checking at boundaries

### 6.4 State Management Patterns

**Immutability:** Colyseus schemas are mutable (by design)
**Updates:** Direct property assignment triggers sync
**Computed Properties:** Getters for derived values
**Side Effects:** Managers handle state changes

---

## 7. Testing Infrastructure

### 7.1 Unit Tests

**Framework:** Jest with [@jgoz/jest-esbuild](jest.config.js:7)
**Config:** [`jest.config.js`](jest.config.js)

**Test Projects:**
- `core` - Core logic tests
- `server` - Server tests
- `node-red` - Node-RED integration tests

**Test Patterns:**
- `*.spec.ts` files
- Test harnesses: [`ship-test-harness.ts`](modules/core/test/ship-test-harness.ts)
- Mock drivers: [`test-driver.ts`](modules/server/src/test/driver.ts)

### 7.2 E2E Tests

**Framework:** Playwright
**Config:** [`playwright.config.ts`](playwright.config.ts)

**Test Specs:**
- [`integration.spec.ts`](modules/e2e/test/integration.spec.ts)
- Visual regression (snapshots)
- Browser: Chromium only

**Snapshot Management:**
- Local: `npm run test:e2e -- --update-snapshots`
- CI (Linux): `npm run snapshots:ci` (Docker)

### 7.3 Test Coverage

**Coverage:** Limited (per [`CONTRIBUTING.md:111`](CONTRIBUTING.md:111))
**Manual Testing:** Required for affected areas
**Critical Paths:** Physics, collision, state sync

---

## 8. Build & Deployment

### 8.1 Development Workflow

**Three-Process Setup:**
1. Core watch: `cd modules/core && npm run build:watch`
2. Webpack dev: `cd modules/browser && npm start`
3. API server: `node -r ts-node/register/transpile-only modules/server/src/dev.ts`

**VSCode Integration:**
- Pre-configured tasks
- Debug configurations
- Status bar buttons

### 8.2 Production Build

**Build Process:**
```bash
npm run build          # Build all modules
npm run postbuild      # Copy to ./dist
npm run pkg            # Create native executables
```

**Packaging:** [pkg](package.json:90) - Single executable
**Output:** `./dist/` directory

### 8.3 Docker Deployment

**[docker-compose.yml](docker/docker-compose.yml:1):**
- **mqtt** - Eclipse Mosquitto 1.6.10 (port 1883)
- **node-red** - Node-RED 3.0.2 (port 1880)

**Volumes:**
- MQTT: config, data, logs
- Node-RED: `/data` directory

### 8.4 CI/CD

**Pre-commit Hooks:** Husky + lint-staged
- `pretty-quick` - Format staged files
- `eslint --fix` - Auto-fix linting

**GitHub Actions:** (inferred from CI checks)
- Type checking: `npm run test:types`
- Format checking: `npm run test:format`
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`

---

## 9. Dependencies Analysis

### 9.1 Core Dependencies

**Multiplayer:**
- `colyseus` ^0.15.15
- `@colyseus/schema` ^2.0.30
- `colyseus.js` ^0.15.18

**State Management:**
- `xstate` ^5.9.1
- `eventemitter2` ^6.4.9
- `eventemitter3` ^5.0.1

**Physics:**
- `detect-collisions` ^9.5.3

**Utilities:**
- `json-ptr` ^3.1.1 (JSON Pointer)
- `reflect-metadata` ^0.2.2 (decorators)
- `ts-essentials` ^9.4.1 (TypeScript utilities)

### 9.2 Browser Dependencies

**Graphics:**
- `pixi.js` ^7.1.2
- `@pixi/graphics-extras` ^7.1.2

**UI:**
- `react` ^17.0.2
- `react-dom` ^17.0.2
- `@arwes/core` 1.0.0-alpha.19
- `golden-layout` ^1.5.9
- `tweakpane` ^3.1.10

**Visualization:**
- `d3` ^7.9.0

**Input:**
- `@maulingmonkey/gamepad` ^0.0.5
- `hotkeys-js` ^3.13.7

### 9.3 Development Dependencies

**Build Tools:**
- `webpack` ^5.91.0
- `tsup` ^8.0.2
- `typescript` ~5.4.3
- `esbuild` ^0.20.2

**Testing:**
- `jest` ^29.7.0
- `@playwright/test` ^1.42.1
- `@jgoz/jest-esbuild` ^1.0.5

**Linting:**
- `eslint` ^8.57.0
- `prettier` ^3.2.5
- `@typescript-eslint/eslint-plugin` ^7.5.0

---

## 10. Key Insights for LLM Context

### 10.1 Critical Patterns

**State Synchronization:**
- All state changes must go through Colyseus schemas
- Use `@gameField` decorator for synced properties
- Direct property assignment triggers network sync

**Command Flow:**
- Client → Room.send() → Server handler → State update → Auto-sync to clients
- JSON Pointer commands for dynamic updates
- Typed commands for structured operations

**Physics Updates:**
- Server-authoritative
- Fixed timestep in game loop
- Collision detection per frame
- Position/velocity updates batched

### 10.2 Common Gotchas

**Float Precision:** [`game-field.ts:12`](modules/core/src/game-field.ts:12) rounds to 2 decimals
**Angle Wrapping:** Use `toPositiveDegreesDelta()` for 0-360 range
**Velocity Zero:** Check with `XY.isZero(velocity, threshold)`
**System Effectiveness:** Multiply by `power * hacked * efficiency`

### 10.3 Extension Points

**New Space Objects:**
1. Extend `SpaceObjectBase`
2. Add to `SpaceObjects` type
3. Add MapSchema to `SpaceState`
4. Implement collision handling

**New Ship Systems:**
1. Extend `SystemState`
2. Add to `ShipState`
3. Implement manager logic
4. Add UI widgets

**New Widgets:**
1. Implement widget interface
2. Register with Dashboard
3. Add to screen layouts

### 10.4 Performance Considerations

**Collision Detection:** O(n²) - use spatial indexing
**State Updates:** Batched per frame
**Rendering:** 30 FPS cap prevents GPU overload
**Network:** Delta compression via Colyseus

---

## 11. Documentation Gaps

**Missing/Incomplete:**
- API documentation (JSDoc sparse)
- Architecture diagrams
- Game mechanics documentation
- Ship configuration guide
- Map creation guide
- Node-RED flow examples

**Well-Documented:**
- [`CLAUDE.md`](CLAUDE.md) - Excellent developer guide
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - Clear contribution process
- Code is generally self-documenting

---

## 12. Technical Debt & Opportunities

**Identified Issues:**
- Limited test coverage (manual testing required)
- No automated API documentation
- Webpack dev server requires legacy OpenSSL flag (Node 17+)
- Some console.error() instead of proper error handling

**Modernization Opportunities:**
- Upgrade to React 18
- Consider Vite instead of Webpack
- Add API documentation generation
- Improve test coverage
- Add architecture diagrams

---

## Conclusion

Starwards is a well-architected, feature-rich multiplayer space simulator with:
- **Strong separation of concerns** (core/browser/server)
- **Robust state synchronization** (Colyseus schemas)
- **Flexible UI system** (Golden Layout + widgets)
- **Extensive integration options** (Node-RED, MQTT)
- **Active development** (modern TypeScript, recent dependencies)

The codebase is LLM-friendly with clear patterns, consistent naming, and logical organization. The decorator-based state management and command system provide excellent extension points for new features.

**Primary Use Cases:**
1. LARP space combat scenarios
2. Bridge simulator experiences
3. Multi-station ship operations
4. External hardware integration (via Node-RED)

**Target Audience:** LARP organizers, game masters, developers building custom space simulation experiences.