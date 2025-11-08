# Development Guide

## Setup

**Requirements:** Node.js ≥ 20.19.5, npm ≥ 10.2.4, Git

```bash
git clone https://github.com/starwards/starwards.git && cd starwards
npm ci                     # Install deps
npm run build              # Build all
npm test                   # Verify
```

## Build

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all modules |
| `npm run build:core` | Core only |
| `npm run clean` | Remove artifacts |
| `npm run pkg` | Native executables (Linux/macOS/Win) |

**Build order:** core → (server, browser, node-red in parallel)

**Outputs:**
- core: `modules/core/cjs/`
- server: `modules/server/dist/`
- browser: `modules/browser/dist/`
- node-red: `modules/node-red/dist/`

## Development Workflow (3 Terminals)

**Terminal 1: Core Watch**
```bash
cd modules/core && npm run build:watch
```

**Terminal 2: Webpack Dev Server**
```bash
cd modules/browser && npm start
# Node 17+: NODE_OPTIONS=--openssl-legacy-provider npm start
# Serves http://localhost:3000
```

**Terminal 3: API Server**
```bash
node -r ts-node/register/transpile-only modules/server/src/dev.ts
# Runs on http://localhost:8080
```

**Hot reload:** Browser client auto-reloads | Server requires manual restart

## Testing

| Command | Purpose |
|---------|---------|
| `npm test` | All unit tests (~15s) |
| `npm test -- --testNamePattern="name"` | Specific tests |
| `npm test -- --watch` | Watch mode |
| `npm run test:e2e` | E2E tests (~2 min) |
| `npm run test:e2e -- --headed` | With visible browser |
| `npm run test:e2e -- --update-snapshots` | Update snapshots |
| `npm run test:types` | Type checking |
| `npm run test:format` | Format checking |
| `npm run lint:fix` | Auto-fix linting |

**Status:** 28 files, 200+ tests, all passing ✅

**See:** [testing/README.md](testing/README.md) for comprehensive guide

## Common Tasks

### Add New Ship System

1. **Create:** `modules/core/src/ship/shield.ts`
```typescript
import { SystemState, DesignState } from './system';
import { gameField } from '../game-field';
import { range } from '../range';

class ShieldDesign extends DesignState {
    @gameField('float32') maxStrength = 1000;
}

export class Shield extends SystemState {
    @gameField(ShieldDesign) design = new ShieldDesign();
    @gameField('float32') @range((t: Shield) => [0, t.design.maxStrength]) strength = 1000;
}
```

2. **Add to ShipState:** `modules/core/src/ship/ship-state.ts`
```typescript
@gameField(Shield) shield!: Shield;
```

3. **Create manager:** `modules/core/src/ship/shield-manager.ts`
```typescript
export class ShieldManager {
    update(dt: number) {
        this.state.shield.strength += this.state.shield.design.rechargeRate * dt;
    }
}
```

4. **Add to ShipManager update loop**

5. **Create widget:** `modules/browser/src/widgets/shield.ts`

6. **Test:** Rebuild core → restart server → reload browser

### Add New Command

```typescript
// Define
export const setShieldPower: StateCommand<number, ShipState, void> = {
    cmdName: 'setShieldPower',
    setValue: (state, value) => { state.shield.power = value; }
};

// Register (server)
this.onMessage(setShieldPower.cmdName, cmdReceiver(this.manager, setShieldPower));

// Use (client)
const send = cmdSender(room, setShieldPower, undefined);
send(0.5);
```

### Add New Widget

```typescript
// Create: modules/browser/src/widgets/my-widget.ts
export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        ship.state.onChange(() => { /* update UI */ });
        return container;
    }
});

// Register: modules/browser/src/widgets/dashboard.ts
registerWidget(myWidget);
```

### Create Production Build

```bash
npm run clean
npm ci
npm run build
npm run pkg      # → dist/starwards-{linux,macos,win.exe}
```

## Docker

**Services:** MQTT (1883), Node-RED (1880)

```bash
cd docker && docker-compose up -d     # Start
docker-compose logs -f [service]      # View logs
docker-compose down                    # Stop
```

## Debugging

### VSCode
- **Debug server:** F5 → "Run Server"
- **Debug tests:** F5 → "Jest Current File"

### Browser
- Chrome DevTools (F12), source maps enabled
- `console.log()` for client debugging

### Network
- Colyseus Monitor: http://localhost:2567/colyseus-monitor (admin/admin)
- WebSocket: Chrome DevTools → Network → WS

## Common Issues

| Issue | Solution |
|-------|----------|
| Webpack fails (Node 17+) | `NODE_OPTIONS=--openssl-legacy-provider npm start` |
| Core changes not reflected | Ensure `npm run build:watch` running |
| Port in use | `lsof -ti:2567 \| xargs kill -9` |
| Type errors after update | `npm run clean && npm ci && npm run build` |
| Webpack overlay shows `[object Object]` | **Known Issue:** Webpack dev server error overlay displays `[object Object]` instead of actual error message when errors are wrapped. Check browser console (F12) for the actual error message and stack trace. Enhanced logging is configured in `webpack.dev.js:42` |

## VSCode Config

**Extensions:** ESLint, Prettier, TypeScript

**Tasks (Ctrl+Shift+P → Tasks: Run Task):**
- `build:core` - Core watch
- `webpack:dev server` - Dev server
- `run server` - API server

**Settings:** Auto-format on save, ESLint auto-fix (pre-configured in `.vscode/`)

## Node Requirements

**Node.js ≥ 20.19.5, npm ≥ 10.2.4**

**Check:** `node --version && npm --version`

## Development Methodology

### Lean Approach
**MVP per milestone:** Achieve minimal viable product, then advance. Avoid tunnel vision on single features.

### Milestone Selection Criteria
1. **Primary mechanic** - Repeated player activity
2. **Team grasp** - Solid understanding of desired feel
3. **Independent** - Not dependent on undesigned mechanisms
4. **Foundation** - Enables other feature derivations
5. **Packageable** - Complete testable experience

**Example:** Dogfight milestone drove steering, maneuvering, aiming, ballistics - branching later to complex combat, larger ships, GM tools.

## Path Aliases

`@starwards/*` → `modules/*/src` or `modules/*/cjs`

**Configured in:** `tsconfig.json`, `jest.config.js`, `webpack.common.js`

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md) | [PATTERNS.md](PATTERNS.md) | [testing/README.md](testing/README.md)
