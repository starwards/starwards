# Testing Guide

## Status

**28 test files, 200+ tests, all passing ✅** (~15s unit, ~2min E2E)

| Category | Files | Tests | Location |
|----------|-------|-------|----------|
| Unit | 16 | ~90 | `modules/core/test/` |
| Multi-Client | 3 | 31 | `modules/server/src/test/` |
| E2E | 5 | 55 | `modules/e2e/test/` |
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
import { makeDriver } from './driver';

const gameDriver = makeDriver(test);

test('ship movement', async ({ page }) => {
    await gameDriver.gameManager.startGame(maps.test_map_1);
    await page.goto(`/ship.html?ship=${maps.test_map_1.testShipId}`);
    await expect(page.locator('[data-id="Helm"]')).toBeVisible();
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
- ✓ Wait for elements (avoid fixed timeouts)
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
| API access errors | Use driver's accessor, not public API |
| MaxListeners warnings | Expected for multi-client (harmless) |

**See:** [UTILITIES.md](UTILITIES.md) for detailed test utilities reference

**Related:** [DEVELOPMENT.md](../DEVELOPMENT.md) | [PATTERNS.md](../PATTERNS.md)
