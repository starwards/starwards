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
# (testMatch lives in playwright.config.ts, so file filters work and it runs fine from PowerShell too)

# E2E snapshots
npm run test:e2e -- --update-snapshots   # Update snapshots locally
npm run snapshots:ci                     # Update CI (linux) snapshots via docker — very slow
npm run test:widgets                     # Gallery visual tests, headed chromium

# Development — one command (cross-platform: core watch + server + browser via concurrently)
npm run dev
# Zellij pane-grid variant: npm run dev:zellij

# Development (3 terminals)
cd modules/core && npm run build:watch     # Terminal 1: Core watch
cd modules/browser && npm start             # Terminal 2: Frontend (localhost:3000)
node -r ts-node/register/transpile-only ./modules/server/src/dev.ts  # Terminal 3: Backend (localhost:8080)

# UI Gallery (no server needed, just browser dev server)
# http://localhost:3000/gallery.html
# Scenes: ammo, armor, engineering-status, gm-radar, long-range-radar, pilot, tactical-radar, targeting, tubes-status, warp
# (scene list lives in modules/browser/src/gallery/scenes/index.ts)
# Direct link: http://localhost:3000/gallery.html?scene=tactical-radar

# Verification suite
npm run test:types         # TypeScript check
npm run test:format        # ESLint + Prettier
npm run lint:fix           # Auto-fix lint issues
npm run test:all           # format + types + unit + e2e
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

| Skill                    | Trigger                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `starwards-autonomous`   | Running as autonomous agent on agent-ready issues                                                                          |
| `starwards-workflow`     | Start of conversation - master index                                                                                       |
| `starwards-tdd`          | "Add X", "Implement Y", "Create Z"                                                                                         |
| `starwards-debugging`    | "Fix bug", "X is broken", "Not working"                                                                                    |
| `starwards-verification` | "Is it done?", "Does it work?"                                                                                             |
| `starwards-monorepo`     | Build fails, import errors                                                                                                 |
| `starwards-colyseus`     | State not syncing, @gameField issues                                                                                       |
| `starwards-ci-debugging` | GitHub Actions CI failures                                                                                                 |
| `starwards-station-ui`   | Station screen layout, widgets, input wiring, color system                                                                 |
| `osc-controllers`        | Open Stage Control layouts/custom modules, Node-RED OSC bridge, tablet controllers, Playwright tests driving O-S-C widgets |

## Custom Commands

- `/design-clarify` - Transform vague requirements into complete design specs via interactive Q&A

## Project

- **Stack**: Colyseus multiplayer, PixiJS v8 graphics, React UI, XState, TypeScript
- **Monorepo**: `modules/` folder with npm workspaces
- **Modules**: browser, core, server, node-red, e2e
- **Build order**: core → (server, browser, node-red in parallel)
- **Scenarios**: Defined in `modules/server/src/maps.ts`

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

### Layout Systems

Two systems — don't mix:

- **Fixed stations** (weapons.ts, pilot.ts, ecr.ts): `wrapRootWidgetContainer` + `subContainer()`
- **Customizable screens** (gm.ts, ship.ts): `Dashboard` (golden-layout wrapper)

### Color System

Import from `modules/browser/src/colors.ts`. Primary=cyan, Secondary=orange. ARWES components are lobby-only, not used in station screens.

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

`broken ? 0 : power * hacked` (`hacked` is a HackLevel multiplier: OK=1, COMPROMISED=0.5, DISABLED=0; `coolantFactor` governs heat dissipation, not effectiveness — see `SystemState.effectiveness` in `modules/core/src/ship/system.ts`)

## Common Issues

| Issue                    | Solution                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Float precision in tests | `toBeCloseTo(expected, 1)`                                                                                                                                                               |
| Angle wrapping           | `toPositiveDegreesDelta()`                                                                                                                                                               |
| Zero velocity check      | `XY.isZero(velocity, 0.01)`                                                                                                                                                              |
| Tweakpane panels         | `createPane({ title, container })` not `new Pane()`                                                                                                                                      |
| E2E panel selectors      | `page.locator('[data-id="Panel Name"]')`                                                                                                                                                 |
| Multiple same labels     | `getPropertyValue(page, 'label', 'PanelTitle')` to scope                                                                                                                                 |
| State not persisting     | Modify `spaceObject`, not `ship.state` (see sync pattern)                                                                                                                                |
| Port in use              | Dev server uses 8080 (override with `PORT` env). Unix: `lsof -ti:8080 \| xargs kill -9`; Windows: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |

## CI Rules

All CI jobs must pass. No disabling tests, no skipping jobs, no modifying CI scripts.

## Working Style

- Prefer a tool's own idiomatic mechanism over overriding it (e.g. Node-RED dependencies belong in its `data/package.json` manifest, not ad-hoc installs).
- When a claim is challenged, settle it with evidence (git history, logs, a live test) — not argument.
- Test after every change, including cosmetic refactors — exercise the affected flow end-to-end.
- Keep responses concise: answer first, minimal words, no preamble.

## No Tombstones

When something is removed or replaced, delete every mention of it — no "X was retired", "this used to be Y", no commented-out code. History lives in git, not in docs or comments. Delete any tombstone you encounter; never add new ones.

## GitHub Access

Use the `gh` CLI for all GitHub operations (issues, PRs, workflow runs) — it is the reliable path in headless/agent runs. Treat GitHub MCP tools as a fallback only.

## Commits & PRs

Follow [Conventional Commits](https://www.conventionalcommits.org/) for non-trivial changes (see CONTRIBUTING.md). For non-trivial features, open/link an issue first.

## Extension Points

1. **New Objects**: Extend `SpaceObjectBase`
2. **New Systems**: Extend `SystemState`, add `@gameField` to ShipState
3. **New Widgets**: Use `createPane({ title, container })` for Tweakpane panels
4. **New Commands**: Define `StateCommand`, register in room, create sender

## Node Requirements

Node.js >= 22.11.0, npm >= 10.9.0

## Documentation

**Start here (agents):**

- [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md) - Quick reference: patterns, gotchas, task→docs routing
- [`docs/AUTHORING.md`](docs/AUTHORING.md) - Rules for writing drift-resistant docs (read before editing docs)

**Product / PM:**

- [`docs/design/README.md`](docs/design/README.md) - Product hub: vision, roadmap, station specs, decisions
- [`docs/design/CLAUDE.md`](docs/design/CLAUDE.md) - Folder-scoped guide for the design KB

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
