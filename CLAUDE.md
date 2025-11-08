# CLAUDE.md

AI assistant guide for Starwards codebase.

## Quick Commands

```bash
# Setup & Build
npm ci                      # Install deps
npm run build              # Build all
npm test                   # Run tests
npm run test:e2e           # E2E tests

# Development (3 terminals)
cd modules/core && npm run build:watch     # Terminal 1
cd modules/browser && npm start             # Terminal 2  
node -r ts-node/register/transpile-only ./modules/server/src/dev.ts  # Terminal 3

# Common Patterns
state.getAll('Spaceship')  # ✅ Correct
state.ships                # ❌ Wrong
ship.position.x            # ✅ Correct
ship.x                     # ❌ Wrong
```

## Docs
- [`docs/DESIGN_PHILOSOPHY.md`](docs/DESIGN_PHILOSOPHY.md) - Core design principles, LARP needs
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System design
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - Endpoints & events
- [`docs/TECHNICAL_REFERENCE.md`](docs/TECHNICAL_REFERENCE.md) - @gameField, JSON Pointer, Input Config
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) - Dev setup
- [`docs/testing/README.md`](docs/testing/README.md) - Testing guide

## Custom Commands

- `/design-clarify` - Transform vague requirements into complete design specs via interactive Q&A
  - See: [`.claude/commands/README.md`](.claude/commands/README.md)
  - Guide: [`docs/guides/DESIGN_CLARIFICATION_GUIDE.md`](docs/guides/DESIGN_CLARIFICATION_GUIDE.md)

## Project
- **Stack**: Colyseus multiplayer, PixiJS graphics, React UI, XState, TypeScript
- **Monorepo**: `modules/` folder with npm workspaces
- **Modules**: browser, core, server, node-red, e2e

## Architecture

### State Flow
SpaceState → ShipState → Subsystems → Client sync via Colyseus

### Rooms
- **AdminRoom**: Game management
- **SpaceRoom**: Main gameplay  
- **ShipRoom**: Individual ship control (roomId = shipId)

### Key Classes
- `SpaceState`: Root container
- `ShipState`: Ship + subsystems
- `SpaceManager`: Physics engine
- `GameManager`: Orchestrator

## Development

### URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:8080

### Testing
- **Unit**: Jest, `*.spec.ts` files
- **E2E**: Playwright
- **Update snapshots**: `npm run test:e2e -- --update-snapshots`
- **UI Testing**: Use semantic `data-id` selectors for Tweakpane panels

## Critical Patterns

### State Updates
```typescript
@gameField('float32') speed = 0;  // Auto-syncs to clients
```

### Commands
- Typed: `room.send(command)`
- JSON Pointer: `/Spaceship/${id}/property`

### System Effectiveness
`power * coolantFactor * (1 - hacked)`

### Common Issues
- Float precision: use `toBeCloseTo()` in tests
- Angles: use `toPositiveDegreesDelta()`
- Zero checks: use `XY.isZero(velocity, threshold)`
- Tweakpane panels: Always use `createPane({ title, container })` not `new Pane()`
- E2E tests: Use `page.locator('[data-id="Panel Name"]')` for panel selectors
- Multiple labels: Use `getPropertyValue(page, 'label', 'PanelTitle')` to scope search

## Extension Points
1. **New Objects**: Extend `SpaceObjectBase`
2. **New Systems**: Extend `SystemState`
3. **New Widgets**: Use `createPane({ title, container })` for Tweakpane panels

## Node Requirements
Node.js >= 20.19.5, npm >= 10.2.4

## Additional Documentation

**Core Documentation:**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System architecture, component relationships
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - API endpoints, commands, events
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) - Development setup, Docker, VSCode, debugging
- [`docs/PATTERNS.md`](docs/PATTERNS.md) - Code patterns, gotchas, best practices
- [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md) - Quick-start, key insights, extension points

**Technical Reference:**
- [`docs/SUBSYSTEMS.md`](docs/SUBSYSTEMS.md) - Ship systems, formulas, bot AI, pilot controls
- [`docs/PHYSICS.md`](docs/PHYSICS.md) - Physics engine, collision detection, damage system
- [`docs/TECHNICAL_REFERENCE.md`](docs/TECHNICAL_REFERENCE.md) - @gameField, JSON Pointer, build tools
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) - Version pins, rationale, upgrade guide

**Testing:**
- [`docs/testing/README.md`](docs/testing/README.md) - Testing guide, workflows, best practices
- [`docs/testing/UTILITIES.md`](docs/testing/UTILITIES.md) - ShipTestHarness, Multi-Client Driver, Test Factories

**Integration:**
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) - Node-RED, external integrations
