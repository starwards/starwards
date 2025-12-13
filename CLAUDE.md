# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
# Setup & Build
npm ci                      # Install deps
npm run build              # Build all (core first, then others parallel)
npm test                   # Run unit tests
npm run test:e2e           # E2E tests (Playwright)

# Run single test
npm test -- --testNamePattern="test name"
npm run test:e2e -- modules/e2e/test/visual/specific.spec.ts

# Development (3 terminals)
cd modules/core && npm run build:watch     # Terminal 1: Core watch
cd modules/browser && npm start             # Terminal 2: Frontend (localhost:3000)
node -r ts-node/register/transpile-only ./modules/server/src/dev.ts  # Terminal 3: Backend (localhost:8080)

# Verification suite
npm run test:types         # TypeScript check
npm run test:format        # ESLint + Prettier
npm run lint:fix           # Auto-fix lint issues
```

## State Access Patterns

```typescript
state.getAll('Spaceship')  # ✅ Correct
state.ships                # ❌ Wrong (private MapSchema)

ship.position.x            # ✅ Correct
ship.x                     # ❌ Wrong

spaceObject.angle = 90     # ✅ Modify source of truth
ship.state.angle = 90      # ❌ Gets overwritten by sync
```

## Claude Skills

**MANDATORY:** Check for relevant skills before ANY task. Use the Skill tool to invoke them.

| Skill | Trigger |
|-------|---------|
| `starwards-workflow` | Start of conversation - master index |
| `starwards-tdd` | "Add X", "Implement Y", "Create Z" |
| `starwards-debugging` | "Fix bug", "X is broken", "Not working" |
| `starwards-verification` | "Is it done?", "Does it work?" |
| `starwards-monorepo` | Build fails, import errors |
| `starwards-colyseus` | State not syncing, @gameField issues |
| `starwards-ci-debugging` | GitHub Actions CI failures |

## Custom Commands

- `/design-clarify` - Transform vague requirements into complete design specs via interactive Q&A

## Project

- **Stack**: Colyseus multiplayer, PixiJS v8 graphics, React UI, XState, TypeScript
- **Monorepo**: `modules/` folder with npm workspaces
- **Modules**: browser, core, server, node-red, e2e
- **Build order**: core → (server, browser, node-red in parallel)

## Architecture

### State Flow
SpaceState → ShipState → Subsystems → Client sync via Colyseus

### Rooms
- **AdminRoom**: Game management
- **SpaceRoom**: Main gameplay
- **ShipRoom**: Individual ship control (roomId = shipId)

### Key Classes
- `SpaceState`: Root container with `getAll('Type')` accessor
- `ShipState`: Ship + subsystems
- `SpaceManager`: Physics engine
- `GameManager`: Orchestrator

### State Synchronization
SpaceObject (in SpaceRoom) is source of truth. ShipRoom.state is a read-only mirror synced every tick via `syncShipProperties()`. Modify `spaceObject` for position/velocity/angle, modify `ship.state` for subsystem properties.

## Critical Patterns

### State Updates
```typescript
@gameField('float32') speed = 0;  // Auto-syncs to clients

// Decorator order matters
@range([0, 1])           // 1st (outermost)
@tweakable('number')     // 2nd
@gameField('float32')    // 3rd (innermost, must be last)
power = 1.0;
```

### Commands
- Typed: `room.send(command)`
- JSON Pointer: `/Spaceship/${id}/property`

### System Effectiveness
`power * coolantFactor * (1 - hacked)`

## Common Issues

| Issue | Solution |
|-------|----------|
| Float precision in tests | `toBeCloseTo(expected, 1)` |
| Angle wrapping | `toPositiveDegreesDelta()` |
| Zero velocity check | `XY.isZero(velocity, 0.01)` |
| Tweakpane panels | `createPane({ title, container })` not `new Pane()` |
| E2E panel selectors | `page.locator('[data-id="Panel Name"]')` |
| Multiple same labels | `getPropertyValue(page, 'label', 'PanelTitle')` to scope |
| State not persisting | Modify `spaceObject`, not `ship.state` (see sync pattern) |
| Port in use | `lsof -ti:2567 \| xargs kill -9` |

## Extension Points
1. **New Objects**: Extend `SpaceObjectBase`
2. **New Systems**: Extend `SystemState`, add `@gameField` to ShipState
3. **New Widgets**: Use `createPane({ title, container })` for Tweakpane panels
4. **New Commands**: Define `StateCommand`, register in room, create sender

## Node Requirements
Node.js >= 22.11.0, npm >= 10.9.0

## Documentation

**Core:**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System design, component relationships
- [`docs/DESIGN_PHILOSOPHY.md`](docs/DESIGN_PHILOSOPHY.md) - Core principles, LARP needs
- [`docs/PATTERNS.md`](docs/PATTERNS.md) - Code patterns, gotchas, best practices
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) - Dev setup, Docker, debugging

**Technical:**
- [`docs/TECHNICAL_REFERENCE.md`](docs/TECHNICAL_REFERENCE.md) - @gameField, JSON Pointer, Input Config
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - Endpoints, commands, events
- [`docs/SUBSYSTEMS.md`](docs/SUBSYSTEMS.md) - Ship systems, formulas, bot AI
- [`docs/PHYSICS.md`](docs/PHYSICS.md) - Physics engine, collision, damage

**Testing:**
- [`docs/testing/README.md`](docs/testing/README.md) - Testing guide, workflows
- [`docs/testing/UTILITIES.md`](docs/testing/UTILITIES.md) - ShipTestHarness, Multi-Client Driver

**Integration:**
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) - Node-RED, external integrations
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) - Version pins, upgrade guide
