# Development Guide - Starwards

**Development workflows, setup, and common tasks**

## Table of Contents

- [Setup Instructions](#setup-instructions)
- [Build Process](#build-process)
- [Development Workflow](#development-workflow)
- [Testing Strategy](#testing-strategy)
- [Debugging Tips](#debugging-tips)
- [Common Development Tasks](#common-development-tasks)

## Setup Instructions

### Prerequisites

**Required:**
- Node.js >= 20.19.5
- npm >= 10.2.4
- Git

**Optional:**
- Docker (for E2E snapshot updates)
- VSCode (recommended IDE)

### Initial Setup

1. **Clone repository:**
```bash
git clone https://github.com/starwards/starwards.git
cd starwards
```

2. **Install dependencies:**
```bash
npm ci
```

3. **Build all modules:**
```bash
npm run build
```

4. **Verify installation:**
```bash
npm run test:types    # TypeScript type checking
npm run test:format   # Code formatting check
npm run test          # Unit tests
```

### VSCode Setup

**Recommended Extensions:**
- ESLint
- Prettier
- TypeScript and JavaScript Language Features

**Workspace Settings:**
Pre-configured in [`.vscode/settings.json`](../.vscode/settings.json)

**Tasks:**
Pre-configured in [`.vscode/tasks.json`](../.vscode/tasks.json)
- `build:core` - Build core module with watch
- `webpack:dev server` - Start webpack dev server
- `run server` - Start API server

**Debug Configurations:**
Pre-configured in [`.vscode/launch.json`](../.vscode/launch.json)

## Build Process

### Build Commands

**Full Build:**
```bash
npm run build          # Build all modules
npm run build:core     # Build core only
npm run build:browser  # Build browser only
npm run build:server   # Build server only
npm run build:node-red # Build node-red only
```

**Clean:**
```bash
npm run clean          # Remove all build artifacts
```

**Watch Mode:**
```bash
cd modules/core && npm run build:watch
```

### Build Order

**Critical:** Core must build before other modules

```
1. Core (tsup)
   ↓
2. Server, Browser, Node-RED (parallel)
   ↓
3. Post-build (copy to ./dist)
```

### Build Outputs

| Module | Tool | Output Directory | Format |
|--------|------|------------------|--------|
| Core | tsup | `modules/core/cjs/` | CommonJS |
| Server | tsc | `modules/server/dist/` | CommonJS |
| Browser | Webpack | `modules/browser/dist/` | Bundle |
| Node-RED | Rollup + tsc | `modules/node-red/dist/` | CommonJS |

### Path Aliases

All modules use `@starwards/*` aliases:

```typescript
// Resolves to modules/*/src or modules/*/cjs
import { SpaceState } from '@starwards/core';
```

**Configuration:**
- [`tsconfig.json`](../tsconfig.json) - TypeScript
- [`jest.config.js`](../jest.config.js) - Jest
- [`webpack.common.js`](../modules/browser/webpack.common.js) - Webpack

## Development Workflow

### Three-Process Development

**Required for full development environment:**

**Terminal 1: Core Watch**
```bash
cd modules/core
npm run build:watch
```
- Watches `src/` for changes
- Rebuilds automatically
- Keep running in background

**Terminal 2: Webpack Dev Server**
```bash
cd modules/browser
npm start

# Node 17+ may require:
NODE_OPTIONS=--openssl-legacy-provider npm start
```
- Hot reload for client code
- Proxies API requests to server
- Serves on http://localhost/

**Terminal 3: API Server**
```bash
node -r ts-node/register/transpile-only ./modules/server/src/dev.ts
```
- Game server with debug mode
- Restart manually for server changes
- Runs on http://localhost:2567

**VSCode Users:**
Use status bar buttons and debug panel instead of manual terminal commands.

### Development Cycle

1. **Make changes** to code
2. **Core changes:** Auto-rebuild (Terminal 1)
3. **Browser changes:** Auto-reload (Terminal 2)
4. **Server changes:** Restart server (Terminal 3)
5. **Test** in browser at http://localhost/

### Hot Reload Behavior

**Auto-reload:**
- Browser client code
- React components
- CSS/styles
- Static assets

**Manual restart required:**
- Server code
- Core module (after rebuild)
- Configuration files

## Testing Strategy

### Unit Tests

**Run tests:**
```bash
npm run test           # All unit tests
npm run test:core      # Core tests only
npm run test:server    # Server tests only
npm run test:node-red  # Node-RED tests only
```

**Watch mode:**
```bash
npm run test -- --watch
```

**Coverage:**
```bash
npm run test -- --coverage
```

**Test Framework:**
- Jest with [@jgoz/jest-esbuild](../jest.config.js:7)
- Fast TypeScript transpilation
- No separate build step needed

**Test Files:**
- Pattern: `*.spec.ts`
- Location: `modules/*/test/`

**Example:**
```typescript
// modules/core/test/space-manager.spec.ts
describe('SpaceManager', () => {
    it('should detect collisions', () => {
        const manager = new SpaceManager();
        // Test implementation
    });
});
```

### E2E Tests

**Run E2E tests:**
```bash
npm run test:e2e
```

**Prerequisites:**
- Development environment running (3 processes)
- Browser client accessible at http://localhost/

**Update snapshots (local):**
```bash
npm run test:e2e -- --update-snapshots
```

**Update snapshots (CI/Linux):**
```bash
npm run snapshots:ci
```
- Requires Docker
- Very slow (runs in container)
- Use for CI snapshot updates

**Test Framework:**
- Playwright
- Chromium only
- Visual regression testing

**Test Files:**
- Location: `modules/e2e/test/`
- Pattern: `*.spec.ts`

### Type Checking

**Check types:**
```bash
npm run test:types
```

**Watch mode:**
```bash
npm run test:types -- --watch
```

### Format Checking

**Check formatting:**
```bash
npm run test:format
```

**Auto-fix:**
```bash
npm run lint:fix      # ESLint
npm run prettify      # Prettier
```

### Pre-commit Hooks

**Husky + lint-staged:**
- Runs on `git commit`
- Auto-formats staged files
- Auto-fixes ESLint issues

**Manual trigger:**
```bash
npm run prepare       # Install hooks
```

## Debugging Tips

### VSCode Debugging

**Debug Server:**
1. Start core watch (Terminal 1)
2. Start webpack dev (Terminal 2)
3. Press F5 or use Debug panel
4. Select "Run Server" configuration
5. Set breakpoints in server code

**Debug Tests:**
1. Open test file
2. Set breakpoints
3. Press F5
4. Select "Jest Current File"

### Browser Debugging

**Chrome DevTools:**
1. Open http://localhost/
2. Press F12
3. Source maps enabled automatically
4. Set breakpoints in TypeScript source

**Console Logging:**
```typescript
// Client
console.log('Ship state:', ship.state);

// Server
console.log('Handling command:', type, message);
```

### Network Debugging

**Colyseus Monitor:**
- URL: http://localhost:2567/colyseus-monitor
- Username: `admin`
- Password: `admin`
- View rooms, clients, state

**WebSocket Inspector:**
- Chrome DevTools → Network → WS
- View WebSocket messages
- Monitor state updates

### Common Issues

**Issue: Webpack dev server fails (Node 17+)**
```bash
# Solution: Use legacy OpenSSL provider
NODE_OPTIONS=--openssl-legacy-provider npm start
```

**Issue: Core changes not reflected**
```bash
# Solution: Ensure core watch is running
cd modules/core && npm run build:watch
```

**Issue: Port already in use**
```bash
# Solution: Kill process on port
lsof -ti:2567 | xargs kill -9  # Server
lsof -ti:80 | xargs kill -9    # Webpack
```

**Issue: Type errors after dependency update**
```bash
# Solution: Clean and rebuild
npm run clean
npm ci
npm run build
```

## Common Development Tasks

### Task 1: Add New Ship System

**Steps:**

1. **Create system state:**
```bash
# Create file
touch modules/core/src/ship/shield.ts
```

```typescript
// modules/core/src/ship/shield.ts
import { SystemState, DesignState } from './system';
import { gameField } from '../game-field';
import { range } from '../range';

class ShieldDesignState extends DesignState {
    @gameField('float32') maxStrength = 1000;
    @gameField('float32') rechargeRate = 10;
}

export class Shield extends SystemState {
    readonly name = 'Shield';
    readonly broken = false;
    
    @gameField(ShieldDesignState)
    design = new ShieldDesignState();
    
    @gameField('float32')
    @range((t: Shield) => [0, t.design.maxStrength])
    strength = 1000;
}
```

2. **Add to ShipState:**
```typescript
// modules/core/src/ship/ship-state.ts
import { Shield } from './shield';

export class ShipState extends Spaceship {
    // ... existing systems
    
    @gameField(Shield)
    shield!: Shield;
}
```

3. **Create manager:**
```typescript
// modules/core/src/ship/shield-manager.ts
export class ShieldManager {
    constructor(private state: ShipState) {}
    
    update(deltaSeconds: number) {
        if (!this.state.shield.broken) {
            this.state.shield.strength = Math.min(
                this.state.shield.design.maxStrength,
                this.state.shield.strength + 
                this.state.shield.design.rechargeRate * deltaSeconds
            );
        }
    }
}
```

4. **Add to ship manager:**
```typescript
// modules/core/src/ship/ship-manager.ts
import { ShieldManager } from './shield-manager';

export class ShipManagerPc extends ShipManager {
    private shieldManager: ShieldManager;
    
    constructor(...) {
        super(...);
        this.shieldManager = new ShieldManager(this.state);
    }
    
    update(id: IterationData) {
        super.update(id);
        this.shieldManager.update(id);
    }
}
```

5. **Create widget:**
```typescript
// modules/browser/src/widgets/shield.ts
import { createWidget } from './create';

export const shield = createWidget({
    name: 'shield',
    render: (ship) => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div>Shield: ${ship.state.shield.strength}</div>
        `;
        return container;
    }
});
```

6. **Register widget:**
```typescript
// modules/browser/src/widgets/dashboard.ts
import { shield } from './shield';

registerWidget(shield);
```

7. **Test:**
```bash
# Rebuild core
cd modules/core && npm run build

# Restart server (Terminal 3)
# Reload browser (Terminal 2 auto-reloads)
```

### Task 2: Add New Command

**Steps:**

1. **Define command:**
```typescript
// modules/core/src/ship/shield-commands.ts
import { StateCommand } from '../commands';
import { ShipState } from './ship-state';

export const setShieldPower: StateCommand<number, ShipState, void> = {
    cmdName: 'setShieldPower',
    setValue: (state, value) => {
        state.shield.power = value;
    }
};
```

2. **Register in room:**
```typescript
// modules/server/src/ship/room.ts
import { setShieldPower } from '@starwards/core/ship/shield-commands';
import { cmdReceiver } from '@starwards/core';

export class ShipRoom extends Room<ShipState> {
    onCreate() {
        this.onMessage(
            setShieldPower.cmdName,
            cmdReceiver(this.manager, setShieldPower)
        );
    }
}
```

3. **Use from client:**
```typescript
// Client code
import { cmdSender } from '@starwards/core';
import { setShieldPower } from '@starwards/core/ship/shield-commands';

const sendShieldPower = cmdSender(room, setShieldPower, undefined);
sendShieldPower(0.5);
```

### Task 3: Add New Widget

**Steps:**

1. **Create widget file:**
```typescript
// modules/browser/src/widgets/my-widget.ts
import { createWidget } from './create';
import type { ShipDriver } from '@starwards/core';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        
        // Build UI
        container.innerHTML = `
            <h2>My Widget</h2>
            <div id="content"></div>
        `;
        
        // Update on state change
        ship.state.onChange(() => {
            const content = container.querySelector('#content');
            if (content) {
                content.textContent = `Value: ${ship.state.someValue}`;
            }
        });
        
        return container;
    }
});
```

2. **Register widget:**
```typescript
// modules/browser/src/widgets/dashboard.ts
import { myWidget } from './my-widget';

registerWidget(myWidget);
```

3. **Add to screen:**
```typescript
// modules/browser/src/screens/ship.ts
export const shipScreen = {
    content: [
        {
            type: 'row',
            content: [
                { type: 'component', componentName: 'my-widget' },
                // ... other widgets
            ]
        }
    ]
};
```

### Task 4: Update Dependencies

**Steps:**

1. **Check for updates:**
```bash
npm outdated
```

2. **Update specific package:**
```bash
npm update package-name
```

3. **Update all packages:**
```bash
npm update
```

4. **Verify:**
```bash
npm run clean
npm ci
npm run build
npm run test
npm run test:e2e
```

### Task 5: Create Production Build

**Steps:**

1. **Clean previous builds:**
```bash
npm run clean
```

2. **Install dependencies:**
```bash
npm ci
```

3. **Build all modules:**
```bash
npm run build
```

4. **Run post-build:**
```bash
npm run postbuild
```

5. **Create executables:**
```bash
npm run pkg
```

6. **Output:**
```
dist/
├── starwards-linux
├── starwards-macos
├── starwards-win.exe
└── [static assets]
```

### Task 6: Run Production Server

**Steps:**

1. **Build production:**
```bash
npm run build
```

2. **Start server:**
```bash
npm run start
```

3. **Access:**
- Game: http://localhost:2567
- Monitor: http://localhost:2567/colyseus-monitor

### Task 7: Host Internet Game

**Using ngrok:**

1. **Download ngrok:**
```bash
# Download from https://ngrok.com/
# Or install via package manager
```

2. **Start local server:**
```bash
npm run start
```

3. **Create tunnel:**
```bash
./ngrok http 2567
```

4. **Share URL:**
```
Forwarding: https://abc123.ngrok.io -> http://localhost:2567
```

5. **Players connect to:**
```
https://abc123.ngrok.io
```

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns
- [INTEGRATION.md](INTEGRATION.md) - Integration guide
- [CLAUDE.md](../CLAUDE.md) - Original developer guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines