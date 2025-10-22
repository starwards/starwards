# Testing Guide

## Status

**28 test files, 200+ tests, all passing ✅** (~15s unit, ~2min E2E)

| Category | Files | Tests | Location |
|----------|-------|-------|----------|
| Unit | 16 | ~90 | `modules/core/test/` |
| Multi-Client | 3 | 31 | `modules/server/src/test/` |
| E2E | 5 | 51 | `modules/e2e/test/` |
| Integration | 4 | ~15 | `modules/node-red/src/` |

**CI/CD:** Automated on every push, parallel execution (4 workers)

## Running Tests

```bash
# Unit tests
npm test                              # All (~15s)
npm test -- --testNamePattern="name"  # Specific
npm test -- --watch                   # Watch mode
npm test -- --coverage                # With coverage

# E2E tests
npm run test:e2e                      # All (~2min)
npm run test:e2e -- --headed          # Visible browser
npm run test:e2e -- --update-snapshots # Update snapshots

# Type & format
npm run test:types                    # TypeScript check
npm run test:format                   # Format check
npm run lint:fix                      # Auto-fix
```

## Writing Tests

### Unit Test
```typescript
import { expect } from 'chai';
import { Spaceship } from '../src';

describe('Spaceship', () => {
    it('initializes with defaults', () => {
        const ship = new Spaceship();
        expect(ship.x).to.equal(0);
    });
});
```

### Property-Based Test
```typescript
import fc from 'fast-check';
import { power } from './properties';

it('effectiveness ∈ [0,1]', () => {
    fc.assert(fc.property(power(), power(), power(), (p, cf, h) => {
        const eff = p * cf * (1 - h);
        expect(eff).to.be.at.least(0).and.at.most(1);
    }));
});
```

### E2E Test
```typescript
import { test, expect } from '@playwright/test';
import { makeDriver, waitForPropertyFloatValue } from './driver';

const gameDriver = makeDriver(test);

test('helm displays heading', async ({ page }) => {
    await gameDriver.gameManager.startGame(maps.test_map_1);
    await page.goto(`/pilot.html?ship=${maps.test_map_1.testShipId}`);

    // Get SpaceObject (source of truth - see PATTERNS.md)
    const spaceShip = gameDriver.gameManager.spaceManager.state.getShip(shipId);

    // Wait for Tweakpane property to display
    await waitForPropertyFloatValue(page, 'heading', spaceShip.angle);
});
```

**Tweakpane Testing:** Use `getPropertyValue()`, `waitForPropertyValue()`, and `waitForPropertyFloatValue()` helpers to test PropertyPanel displays. See [E2E Tweakpane Testing](UTILITIES.md#e2e-tweakpane-testing) for details.

#### UI Testing Best Practices

**✓ Use semantic selectors (data-id)**
```typescript
// ✓ Semantic - stable across Tweakpane versions
const panel = page.locator('[data-id="Targeting"]');

// ❌ Implementation detail - brittle
const panel = page.getByRole('button', { name: /Targeting/ });
```

**Why:** All Tweakpane panels created with `createPane({ title, container })` automatically get `data-id="title"` for semantic testing. This decouples tests from Tweakpane's internal DOM structure.

**✓ Test panel presence, not internals**
```typescript
// ✓ Test panel exists
await expect(page.locator('[data-id="Tubes Status"]')).toBeVisible();

// ✓ Test properties via helpers
const value = await getPropertyValue(page, 'auto load', 'Tube 0');
expect(value).toBe('on');

// ❌ Don't traverse Tweakpane DOM
const checkbox = panel.locator('.tp-ckbv_i');  // Brittle!
```

**Why:** Tweakpane's internal DOM structure can change between versions. Use test helpers that understand the abstraction layer.

**✓ Scope searches to panels**
```typescript
// ✓ When multiple panels have same label, scope to panel
const value = await getPropertyValue(page, 'power', 'Reactor');

// ❌ Global search fails with strict mode violations
const value = await getPropertyValue(page, 'power');  // Error: multiple matches
```

**Why:** `getPropertyValue(page, label, panelTitle)` uses `[data-id="panelTitle"]` to scope searches, preventing ambiguity.

**Key Insight:** Tweakpane creates multiple DOM elements per concept (folder button + labels). Always use semantic selectors (`data-id`) or scoped helpers (`panelTitle` parameter) to avoid strict mode violations.

#### E2E Anti-Patterns

**❌ Don't: Wait for arbitrary time**
```typescript
await page.keyboard.press('e');
await page.waitForTimeout(100);  // ❌ Non-deterministic
const value = await getPropertyValue(page, 'rotationCommand');
expect(parseFloat(value)).not.toBe(0);  // ❌ Vague assertion
```

**✓ Do: Wait for specific state change**
```typescript
await page.keyboard.press('e');
await waitForPropertyFloatValue(page, 'rotationCommand', 0.05);  // ✓ Deterministic + specific
```

### E2E Test Infrastructure

**Problem:** When E2E tests fail, they can cause a "domino effect" where subsequent tests hang or slow down significantly. This happens when page crashes, JavaScript errors, or broken WebSocket connections leave the page in a corrupted state.

**Solution:** Use the test infrastructure helpers from `modules/e2e/test/test-infrastructure.ts`:

```typescript
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';

test.describe('My Screen', () => {
    test.beforeEach(async ({ page }) => {
        // Set up error handlers for fail-fast behavior
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/my-screen.html?ship=${shipId}`);
        await waitForCriticalElement(page);
    });

    test.afterEach(async ({ page }) => {
        // Clean up page state to prevent test failures from cascading
        await cleanupPageState(page);
    });
});
```

**Features:**
- **setupPageErrorHandlers()** - Detects page crashes and errors early, failing fast instead of hanging
- **navigateToScreen()** - Navigates with proper timeout and error handling, detects ECONNREFUSED
- **cleanupPageState()** - Removes listeners, clears timers/intervals between tests
- **checkServerHealth()** - Verifies server is alive before starting test
- **waitForCriticalElement()** - Waits with crash detection (optional, more robust than standard waits)

**Configuration:**
```typescript
// playwright.config.ts
{
    timeout: 20000,              // 20s per test (setup + test + cleanup)
    expect: { timeout: 5000 },   // 5s for assertions
    use: {
        actionTimeout: 5000,     // 5s for actions
        navigationTimeout: 10000 // 10s for navigation (global)
    }
}

// test-infrastructure.ts defaults
navigateToScreen: 5000ms         // Navigation should be fast
waitForCriticalElement: 10000ms  // Critical elements
```

**Why This Matters:**
- Prevents 30-second timeouts from cascading across multiple tests
- Detects page crashes immediately instead of waiting for element timeouts
- Cleans up timers/intervals that could interfere with subsequent tests
- Logs console errors for debugging without failing tests
- Makes test failures fast and obvious, not slow and mysterious

### Server Crash Protection

**Problem:** When a test fails, `stopGame()` can crash the game server, causing ALL subsequent tests to hang waiting for connections that never succeed (ECONNREFUSED).

**Solution:** Multi-layered protection in `driver.ts` and test files:

1. **Defensive `stopGame()`** - Wrapped in try-catch with 5s timeout
2. **Server health check** - Tests check if server is alive before running
3. **Connection detection** - `navigateToScreen()` detects ECONNREFUSED immediately

**Example beforeEach:**
```typescript
test.beforeEach(async ({ page }) => {
    // Fail fast if server died in previous test
    const serverAlive = await checkServerHealth(gameDriver.port);
    if (!serverAlive) {
        throw new Error('Game server crashed in previous test');
    }

    setupPageErrorHandlers(page);
    await gameDriver.gameManager.startGame(single_ship);
    await navigateToScreen(page, `/screen.html?ship=${shipId}`);
});
```

**Result:** If server crashes, next test fails immediately with clear message instead of hanging for 20+ seconds.

**❌ Don't: Test name mismatch**
```typescript
test('keyboard rotation controls update heading', async ({ page }) => {
    // But test actually checks rotationCommand, not heading ❌
    expect(await getPropertyValue(page, 'rotationCommand')).not.toBe(0);
});
```

**✓ Do: Match test name to behavior**
```typescript
test('keyboard rotation controls update rotation command', async ({ page }) => {
    await page.keyboard.press('e');
    await waitForPropertyFloatValue(page, 'rotationCommand', 0.05);
});
```

**❌ Don't: Assume absolute values without checking config**
```typescript
test('keyboard thrust', async ({ page }) => {
    await page.keyboard.press('w');
    await waitForPropertyFloatValue(page, 'boostCommand', 1.0);  // ❌ Wrong! Assumes absolute value
});
```

**✓ Do: Use values from input-config.ts and document coupling**
```typescript
// NOTE: Coupled to step values in modules/browser/src/input/input-config.ts
// boostCommand uses KeysRangeConfig with step: 0.05
test('keyboard thrust', async ({ page }) => {
    await page.keyboard.press('w');
    await waitForPropertyFloatValue(page, 'boostCommand', 0.05);  // ✓ Correct step value
});
```

### Multi-Client Test
```typescript
import { makeMultiClientDriver } from './multi-client-driver';

describe('multi-client sync', () => {
    const driver = makeMultiClientDriver();

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer)
            .post('/start-game')
            .send({ mapName: 'two_vs_one' })
            .expect(200);
        driver.serverDriver.gameManager.state.speed = 0;  // Pause physics
    });

    it('clients see same state', async () => {
        const c1 = driver.createClient('c1');
        const c2 = driver.createClient('c2');
        const s1 = await c1.connectSpace();
        const s2 = await c2.connectSpace();

        await c1.waitForSync(s1, state => state.getAll('Spaceship').length > 0);
        await c2.waitForSync(s2, state => state.getAll('Spaceship').length > 0);

        expect(c1.getState(s1).toJSON()).toEqual(c2.getState(s2).toJSON());
    });
});
```

## Test Utilities

### ShipTestHarness
**Location:** `modules/core/test/ship-test-harness.ts`

**Features:** Physics simulation, graphing, metrics, state history, invariants

```typescript
import { ShipTestHarness } from '@starwards/core/test';

const harness = new ShipTestHarness();
harness.enableStateHistory();
harness.assertPhysicsInvariant(() => harness.shipObj.x >= 0, 'X non-negative');
harness.simulate(30, 100, () => harness.shipMgr.addForwardThrust());
const stateAt5s = harness.getStateAt(5);
```

### Test Factories
**Location:** `modules/core/test/test-factories.ts`

```typescript
import { createTestShip, createCombatScenario, createFormation } from './test-factories';

const ship = createTestShip({ position: new Vec2(10, 10) });
const { attackers, defenders } = createCombatScenario(mgr, { attackerCount: 2 });
const formation = createFormation(mgr, 5, 'v-formation', 100);
```

### Multi-Client Driver
**Location:** `modules/server/src/test/multi-client-driver.ts`

**Key methods:**
- `createClient(name)` - New test client
- `client.connectSpace()` - Connect to space room
- `client.waitForSync(room, predicate?)` - Wait for state (with optional condition)
- `driver.waitForConsistency()` - All clients consistent

## Debugging Tests

```bash
# Single test
npm test -- path/to/test.spec.ts

# Pattern match
npm test -- --testNamePattern="movement"

# Verbose
npm test -- --verbose

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest path/to/test.spec.ts

# Playwright debugging
npm run test:e2e -- --headed  # Visible browser
npm run test:e2e -- --debug   # Inspector
```

## Best Practices

### Unit Tests
- ✓ Test single units in isolation
- ✓ Keep fast (< 100ms each)
- ✓ Use `toBeCloseTo()` for floats (tolerance 0.1-0.2)

### Multi-Client Tests
- ✓ Pause physics: `gameManager.state.speed = 0`
- ✓ Use predicate-based `waitForSync()`
- ✓ Access state via `state.getAll('Spaceship')` (not `state.ships`)
- ✓ Clean up automatic (driver handles `afterEach`)

### E2E Tests
- ✓ Focus on critical user workflows
- ✓ **Wait for state changes, not arbitrary time** - use `waitForPropertyValue()` instead of `waitForTimeout()`
- ✓ **Test specific expected values** - check `rotationCommand === 0.05` not `!== 0`
- ✓ **Test names must match behavior** - "update rotation command" not "update heading" if testing rotationCommand
- ✓ **Document configuration coupling** - E2E tests may depend on config files (e.g., keyboard step values in `input-config.ts`)
- ✓ Use `waitForPropertyFloatValue()` for Tweakpane properties
- ✓ Modify SpaceObject for physics properties (angle, position, velocity)
- ✓ Extract common patterns into helpers (e.g., `waitForPilotRadar()`, `pressKey()`)
- ✓ Use snapshots for visual regression
- ✓ Don't E2E test everything (expensive)

### Property Tests
- ✓ Test mathematical invariants
- ✓ Use arbitraries from `properties.ts`
- ✓ Let fast-check find edge cases

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests hang during cleanup | Ensure sockets disconnect before room destroy |
| State comparison fails | Pause physics (`state.speed = 0`) + use `toBeCloseTo()` |
| Ship state changes revert | Modify SpaceObject not ship.state (see [PATTERNS.md](../PATTERNS.md#state-synchronization-architecture)) |
| Tweakpane properties not rendering | PropertyPanel race condition - ensure value exists before display |
| API access errors | Use driver's accessor, not public API |
| MaxListeners warnings | Expected for multi-client (harmless) |

**See:** [UTILITIES.md](UTILITIES.md) for detailed test utilities reference

**Related:** [DEVELOPMENT.md](../DEVELOPMENT.md) | [PATTERNS.md](../PATTERNS.md)
