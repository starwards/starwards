# Test Utilities Reference - Starwards

**Comprehensive API reference for testing utilities**

## Table of Contents

- [Test Distribution](#test-distribution)
- [ShipTestHarness](#shiptestharness)
- [Multi-Client Driver](#multi-client-driver)
- [Test Factories](#test-factories)
- [Property-Based Testing](#property-based-testing)
- [Best Practices](#best-practices)
- [Known Limitations](#known-limitations)

## Test Distribution

**Current Status** (as of 2025-10-01):
- **28 test files**, **200+ tests passing**, **23/23 suites passing**
- Test execution time: ~15-20 seconds (unit), ~2 minutes (E2E)

### Breakdown by Category

```
Unit Tests (16 files - modules/core/test/):
  ├─ Physics & Math: formulas, xy, helm-assist, space-manager
  ├─ State Management: space-state, ship-manager, system
  ├─ Property Tests: state-properties, command-serialization-properties
  └─ Integration: ship-areas, range, traverse, thruster-ship-integration

Multi-Client Tests (3 files - modules/server/src/test/):
  ├─ multi-client-sync.spec.ts (10 tests) - State synchronization
  ├─ multi-client-concurrent.spec.ts (10 tests) - Concurrent commands
  └─ multi-client-network.spec.ts (11 tests) - Network failures/recovery

E2E Tests (5 files - modules/e2e/test/):
  ├─ integration.spec.ts (4 tests) - Core workflows
  ├─ movement-controls.spec.ts (11 tests) - Helm UI & navigation
  ├─ weapon-controls.spec.ts (13 tests) - Gunner UI & combat
  ├─ multi-ship-combat.spec.ts (12 tests) - Multi-ship scenarios
  └─ power-management.spec.ts (15 tests) - Reactor & power systems

Node-RED Tests (4 files - modules/node-red/src/):
  └─ Integration nodes: ship-read, ship-write, starwards-config, ship-node
```

## ShipTestHarness

**Location**: [`modules/core/test/ship-test-harness.ts`](../../modules/core/test/ship-test-harness.ts)

Full physics simulation harness with time-stepping, visualization, and metrics tracking.

### Core Features

- **Physics simulation** with configurable time steps
- **Plotly graph generation** for visualization
- **State history recording** for time-travel debugging
- **Physics invariant checking** for automated validation
- **Combat scenario creation** for multi-ship testing
- **Metrics tracking** (movement, speed, timing)

### API Reference

#### State History

```typescript
// Enable state history recording
harness.enableStateHistory();

// Get state snapshot at specific time
const stateAt5s = harness.getStateAt(5.0);
console.log('Position at 5s:', stateAt5s.position);
```

**Use cases:**
- Time-travel debugging
- Replay specific moments
- Verify state transitions

#### Physics Invariants

```typescript
// Add physics invariant that must hold throughout simulation
harness.assertPhysicsInvariant(
    () => harness.shipObj.x >= 0,
    'X position must be non-negative'
);

// Invariant checked automatically during simulation
harness.simulate(10, 100, () => {
    harness.shipMgr.addForwardThrust();
});
```

**Use cases:**
- Continuous validation
- Catch violations immediately
- Document physics constraints

#### Combat Scenarios

```typescript
// Create multi-ship combat scenario
const enemies = harness.createCombatScenario({
    shipCount: 3,
    distance: 1000,
    faction: 'hostile'
});

// Ships positioned in formation around test ship
// Ready for combat testing
```

**Configuration:**
- `shipCount`: Number of enemy ships
- `distance`: Distance from test ship
- `faction`: Enemy faction (optional)
- `formation`: Formation pattern (optional)

#### Graph Visualization

```typescript
// Initialize graph with metrics to plot
harness.initGraph({
    x: () => harness.shipObj.x,
    velocity: () => harness.shipObj.velocity.x,
    thrust: () => harness.shipMgr.thrust
});

// Run simulation (automatically updates graph)
harness.simulate(metrics.timeToReach, metrics.iterations, () => {
    harness.shipMgr.addForwardThrust();
});

// Graph saved to file or displayed in HTML
```

#### Metrics Tracking

```typescript
// Movement metrics
const metrics = new MovementTestMetrics(
    timeToReach: 30,    // Target time
    distance: 1000,     // Target distance
    errorMargin: 50     // Acceptable error
);

// Speed metrics
const speedMetrics = new SpeedTestMetrics(
    targetSpeed: 100,
    tolerance: 5
);

// Timed metrics
const timedMetrics = new TimedTestMetrics(
    duration: 10,
    samples: 100
);
```

### Complete Example

```typescript
import { ShipTestHarness, MovementTestMetrics } from '@starwards/core/test';

describe('Ship acceleration', () => {
    it('reaches target distance', () => {
        const harness = new ShipTestHarness();
        const metrics = new MovementTestMetrics(30, 1000, 50);

        // Enable features
        harness.enableStateHistory();
        harness.assertPhysicsInvariant(
            () => harness.shipObj.velocity.x >= 0,
            'Velocity must be positive during acceleration'
        );

        // Create combat scenario
        const enemies = harness.createCombatScenario({ shipCount: 2 });

        // Initialize graph
        harness.initGraph({
            x: () => harness.shipObj.x,
            velocity: () => harness.shipObj.velocity.x
        });

        // Run simulation
        harness.simulate(metrics.timeToReach, metrics.iterations, () => {
            harness.shipMgr.addForwardThrust();
        });

        // Verify results
        expect(harness.shipObj.x).to.be.closeTo(1000, metrics.errorMargin);

        // Access history
        const midpoint = harness.getStateAt(15);
        expect(midpoint.x).to.be.closeTo(500, 100);
    });
});
```

## Sleep Helper

**Location**: [`modules/core/src/utils.ts`](../../modules/core/src/utils.ts)

Simple async sleep function for test setup/teardown delays.

### Usage

```typescript
import { sleep } from '@starwards/core';

// Wait for a fixed duration
await sleep(300); // Wait 300ms
```

**When to use**:
- Test setup/teardown cleanup delays
- Small sequencing delays between operations (e.g., `sleep(50)`)
- Only when predicate-based waiting is not possible

**Prefer instead**:
- `waitForShipProperty()` for ship state changes
- `waitForSubsystemProperty()` for subsystem changes
- `waitForSync()` with predicates for complex conditions
- `waitFor()` for polling with conditions
- `waitForConsistency()` for multi-client state sync

**Example anti-pattern**:
```typescript
// ❌ Bad: Fixed delay after command
await client.sendCommand(room, '/ship/angle', { value: 90 });
await sleep(300);

// ❌ Still verbose: Manual predicate with waitForSync
await client.sendCommand(room, '/ship/angle', { value: 90 });
await client.waitForSync(room, state => {
    const ship = state.getShip(shipId);
    return ship && Math.abs(ship.angle - 90) < 1;
});

// ✅ Best: Specialized helper
await client.sendCommand(room, '/ship/angle', { value: 90 });
await client.waitForShipProperty(room, shipId, 'angle', 90, 1);
```

## Multi-Client Driver

**Location**: [`modules/server/src/test/multi-client-driver.ts`](../../modules/server/src/test/multi-client-driver.ts)

Test state synchronization across multiple concurrent clients with predicate-based waiting.

### Core Features

- **Multiple concurrent clients** (unlimited connections)
- **Predicate-based sync waiting** (no race conditions)
- **Consistency checking** across all clients
- **Network interruption simulation**
- **Automatic cleanup** in afterEach hooks

### API Reference

#### Creating Clients

```typescript
const driver = makeMultiClientDriver();

// Create named clients
const client1 = driver.createClient('client1');
const client2 = driver.createClient('client2');
const gm = driver.createClient('gm');

// Connect to rooms
const space1 = await client1.connectSpace();
const space2 = await client2.connectSpace();
const admin = await gm.connectAdmin();
```

#### Specialized Property Waiting

**Ship Properties** - Wait for ship property value changes:

```typescript
// Wait for ship angle (with tolerance)
await client.waitForShipProperty(spaceRoom, shipId, 'angle', 90, 1);
// Waits for ship.angle ≈ 90 ± 1

// Wait for nested property
await client.waitForShipProperty(spaceRoom, shipId, 'position.x', 500, 0.01);
// Waits for ship.position.x ≈ 500 ± 0.01

// Custom tolerance (default: 0.01)
await client.waitForShipProperty(spaceRoom, shipId, 'velocity.x', 10, 0.5);
```

**Subsystem Properties** - Wait for ship subsystem changes:

```typescript
// Wait for reactor power change
await client.waitForSubsystemProperty(shipRoom, 'reactor', 'power', PowerLevel.HIGH);
// Waits for shipState.reactor.power ≈ PowerLevel.HIGH ± 0.1

// Wait for radar power (custom tolerance)
await client.waitForSubsystemProperty(shipRoom, 'radar', 'power', 0.5, 0.05);
```

**Generic Sync Waiting** - For complex conditions:

```typescript
// Wait for state to sync with predicate
await client1.waitForSync(space1, state =>
    Array.from(state.getAll('Spaceship')).length > 0
);

// Wait without predicate (simple sync)
await client1.waitForSync(space1);

// Wait for consistency across ALL clients
await driver.waitForConsistency();
```

**When to use which:**
- `waitForShipProperty()` - Single ship numeric property (angle, position.x, etc.)
- `waitForSubsystemProperty()` - Ship subsystem property (reactor.power, radar.power)
- `waitForSync()` - Complex predicates, collections, boolean conditions
- `waitForConsistency()` - Verify all clients have identical state

#### State Access

```typescript
// Get current state from room
const state = client1.getState(space1);

// Access objects via public API
const ships = Array.from(state.getAll('Spaceship'));
const projectiles = Array.from(state.getAll('Projectile'));

// ✅ Correct
const ship = ships.find(s => s.id === 'ship-1');
const x = ship.position.x;
const angle = ship.angle;

// ❌ Wrong
const x = ship.x;           // Property doesn't exist
const ships = state.ships;  // Private property
```

#### Network Simulation

```typescript
// Simulate network interruption
await driver.simulateDisconnect(client1, 1000); // 1s disconnect

// Verify reconnection and state sync
await client1.waitForSync(space1);

// Check state consistency after reconnection
await driver.waitForConsistency();
```

### Complete Example

```typescript
import { makeMultiClientDriver } from './multi-client-driver';
import supertest from 'supertest';

describe('Multi-client state sync', () => {
    const driver = makeMultiClientDriver();

    beforeEach(async () => {
        // Start game
        await supertest(driver.serverDriver.httpServer)
            .post('/start-game')
            .send({ mapName: 'two_vs_one' })
            .expect(200);

        // Pause physics for deterministic tests
        driver.serverDriver.gameManager.state.speed = 0;
    });

    it('all clients see same ship positions', async () => {
        const client1 = driver.createClient('client1');
        const client2 = driver.createClient('client2');

        const space1 = await client1.connectSpace();
        const space2 = await client2.connectSpace();

        // Wait for state to populate
        await client1.waitForSync(space1, state =>
            Array.from(state.getAll('Spaceship')).length > 0
        );
        await client2.waitForSync(space2, state =>
            Array.from(state.getAll('Spaceship')).length > 0
        );

        // Get states
        const state1 = client1.getState(space1);
        const state2 = client2.getState(space2);

        // Compare ships
        const ships1 = Array.from(state1.getAll('Spaceship'));
        const ships2 = Array.from(state2.getAll('Spaceship'));

        expect(ships1.length).toBe(ships2.length);

        // Compare positions (use toBeCloseTo for floats)
        for (let i = 0; i < ships1.length; i++) {
            expect(ships1[i].position.x).toBeCloseTo(ships2[i].position.x, 1);
            expect(ships1[i].position.y).toBeCloseTo(ships2[i].position.y, 1);
            expect(ships1[i].angle).toBeCloseTo(ships2[i].angle, 1);
        }
    });

    it('handles network interruptions', async () => {
        const client = driver.createClient('client');
        const space = await client.connectSpace();

        // Simulate disconnect
        await driver.simulateDisconnect(client, 1000);

        // Verify reconnection
        await client.waitForSync(space);

        // State should still be valid
        const state = client.getState(space);
        expect(Array.from(state.getAll('Spaceship')).length).toBeGreaterThan(0);
    });
});
```

## Test Factories

**Location**: [`modules/core/test/test-factories.ts`](../../modules/core/test/test-factories.ts)

Factory functions for quickly creating test objects with sensible defaults.

### API Reference

#### Ship Creation

```typescript
// Create ship with defaults
const ship = createTestShip();

// Override specific properties
const fastShip = createTestShip({
    velocity: { x: 100, y: 0 },
    angle: 45
});

// Create ship with specific faction
const enemy = createTestShip({
    faction: 'hostile',
    position: { x: 1000, y: 500 }
});
```

#### Combat Scenarios

```typescript
// Create multi-ship battle
const { attacker, defenders } = createCombatScenario(spaceManager, {
    shipCount: 3,
    distance: 500,
    formation: 'line'
});

// Access ships
attacker.weapons.fire();
defenders.forEach(d => d.shields.raise());
```

**Formations:**
- `'line'` - Ships in horizontal line
- `'circle'` - Ships in circle around center
- `'V'` - V-formation
- `'random'` - Random positions

#### Ship Formations

```typescript
// Create formation
const squadron = createFormation(spaceManager, {
    count: 5,
    type: 'V',
    spacing: 200,
    leader: leaderShip
});

// Ships positioned relative to leader
squadron.forEach(ship => {
    ship.follow(leaderShip);
});
```

#### Damaged Ships

```typescript
// Create ship with damage
const damaged = createDamagedShip(spaceManager, {
    damageLevel: 0.5,  // 50% damage
    systems: ['reactor', 'shields']  // Specific systems damaged
});

// Useful for testing repair mechanics
expect(damaged.reactor.health).toBeLessThan(damaged.reactor.maxHealth);
```

### Complete Example

```typescript
import {
    createTestShip,
    createCombatScenario,
    createFormation
} from '@starwards/core/test';

describe('Fleet combat', () => {
    it('squadron engages enemy formation', () => {
        const spaceManager = new SpaceManager(spaceState);

        // Create player squadron
        const leader = createTestShip({ faction: 'player' });
        const squadron = createFormation(spaceManager, {
            count: 4,
            type: 'V',
            spacing: 150,
            leader
        });

        // Create enemy combat scenario
        const { defenders } = createCombatScenario(spaceManager, {
            shipCount: 3,
            distance: 1000,
            formation: 'line'
        });

        // Run combat simulation
        spaceManager.update({ deltaSeconds: 0.1, serverTime: 0 });

        // Verify engagement
        squadron.forEach(ship => {
            const target = ship.targeting.currentTarget;
            expect(defenders).toContain(target);
        });
    });
});
```

## Property-Based Testing

**Framework**: [fast-check](https://fast-check.dev/)

Property-based testing automatically generates test cases to find edge cases.

### Custom Arbitraries

**Location**: [`modules/core/test/properties.ts`](../../modules/core/test/properties.ts)

```typescript
import { power, heat, coolantFactor, velocity } from './properties';

// Generate random power values (0-1)
fc.assert(
    fc.property(power(), (p) => {
        expect(p).to.be.at.least(0);
        expect(p).to.be.at.most(1);
    })
);

// Generate random heat values (0-MAX_SYSTEM_HEAT)
fc.assert(
    fc.property(heat(), (h) => {
        expect(h).to.be.at.least(0);
        expect(h).to.be.at.most(MAX_SYSTEM_HEAT);
    })
);

// Generate velocity vectors
fc.assert(
    fc.property(velocity(), (v) => {
        const speed = Math.sqrt(v.x * v.x + v.y * v.y);
        expect(speed).to.be.finite;
    })
);
```

### Testing Mathematical Invariants

**27 property tests** validate game formulas:

```typescript
describe('System effectiveness invariants', () => {
    it('effectiveness is always between 0 and 1', () => {
        fc.assert(
            fc.property(
                power(),
                coolantFactor(),
                hacked(),
                (p, cf, h) => {
                    const effectiveness = p * cf * (1 - h);
                    expect(effectiveness).to.be.at.least(0);
                    expect(effectiveness).to.be.at.most(1);
                }
            )
        );
    });

    it('effectiveness increases with power', () => {
        fc.assert(
            fc.property(
                power(),
                power(),
                coolantFactor(),
                hacked(),
                (p1, p2, cf, h) => {
                    fc.pre(p1 < p2);  // Precondition

                    const eff1 = p1 * cf * (1 - h);
                    const eff2 = p2 * cf * (1 - h);

                    expect(eff2).to.be.greaterThan(eff1);
                }
            )
        );
    });
});
```

### Automatic Edge Case Discovery

Fast-check automatically finds edge cases:

```typescript
it('damage calculation never goes negative', () => {
    fc.assert(
        fc.property(
            fc.float({ min: 0, max: 1000 }),  // Armor
            fc.float({ min: 0, max: 1000 }),  // Damage
            (armor, damage) => {
                const remaining = Math.max(0, armor - damage);
                expect(remaining).to.be.at.least(0);
            }
        ),
        { numRuns: 1000 }  // Run 1000 random cases
    );
});
```

**Shrinking:** When a test fails, fast-check automatically finds the minimal failing case.

## Best Practices

### Physics Testing

```typescript
// ✅ Pause physics during assertions
beforeEach(() => {
    gameManager.state.speed = 0;
});

// ✅ Use appropriate tolerances for floats
expect(ship.position.x).toBeCloseTo(1000, 1);  // ±0.1 tolerance

// ❌ Direct float comparison
expect(ship.position.x).toBe(1000);  // Will fail due to float precision
```

### State Access

```typescript
// ✅ Use public API
const ships = Array.from(state.getAll('Spaceship'));
const ship = ships.find(s => s.id === 'ship-1');
const x = ship.position.x;
const angle = ship.angle;

// ❌ Private properties
const ships = state.ships;          // Private MapSchema
const x = ship.x;                   // Property doesn't exist
const rotation = ship.rotation;     // Wrong name (use 'angle')
```

### Multi-Client Tests

```typescript
// ✅ Always use predicates for collection data
await client.waitForSync(space, state =>
    Array.from(state.getAll('Spaceship')).length > 0
);

// ❌ Wait without predicate (race condition)
await client.waitForSync(space);
const ships = Array.from(state.getAll('Spaceship'));
expect(ships.length).toBeGreaterThan(0);  // May fail

// ✅ Cleanup is automatic
// Driver handles afterEach hook

// ❌ Manual cleanup (not needed)
afterEach(async () => {
    await driver.cleanup();  // Already done automatically
});
```

### Float Precision

```typescript
// ✅ Use toBeCloseTo with appropriate tolerance
expect(value).toBeCloseTo(expected, 1);  // ±0.1
expect(value).toBeCloseTo(expected, 2);  // ±0.01

// Float32 precision: 2 decimals
// Recommended tolerance: 0.1-0.2

// ❌ Exact comparison
expect(value).toBe(expected);  // Will fail for floats
```

## Known Limitations

### E2E FPS Measurement

**Issue**: FPS measurement in `modules/e2e/test/multi-ship-combat.spec.ts:296-300` uses hardcoded placeholder:

```typescript
const fps = await page.evaluate(() => {
    // Placeholder - doesn't measure actual FPS
    return Math.round(60);
});
```

**Impact**: Performance test doesn't validate actual frame rate.

**Workaround**: Manual performance testing, browser DevTools profiling.

### Property Test Formulas

**Issue**: Heat dissipation in `modules/core/test/state-properties.spec.ts:193-202` uses simplified formula:

```typescript
const coolingRate = cf * 10;  // Invented constant
```

**Actual Formula** (from `heat-manager.ts`):
```typescript
const coolantPerFactor = totalCoolant / totalCoolantFactors;
const coolingRate = coolantFactor * coolantPerFactor;
```

**Impact**: Property test doesn't validate actual game behavior.

**Workaround**: Use integration tests with full HeatManager for cooling validation.

### Visual Regression Snapshots

**Issue**: E2E snapshots require manual updates after UI changes.

**Process**:
```bash
# Update locally
npm run test:e2e -- --update-snapshots

# Update for CI (Linux, Docker)
npm run snapshots:ci
```

**Impact**: UI changes require extra snapshot update step.

### Multi-Client Warnings

**Issue**: Harmless MaxListenersExceeded warnings in multi-client tests:

```
(node:12345) MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 disconnect listeners added. Use emitter.setMaxListeners() to increase limit
```

**Cause**: Multiple concurrent connections expected in multi-client tests.

**Impact**: None - warnings are harmless and expected.

**Workaround**: Ignore warnings or increase listener limit if needed.

---

**See Also:**
- [Testing Guide](README.md) - General testing documentation
- [Testing Strategy](TESTING_STRATEGY.md) - Strategic approach to testing
- [Best Practices](README.md#best-practices) - Testing best practices
