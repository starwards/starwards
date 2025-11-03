# Starwards Testing Infrastructure Enhancement Plan

## Executive Summary

This comprehensive testing strategy addresses the current limitations in Starwards' testing infrastructure to enable fast, confident LLM-driven development. The plan focuses on high-value testing that provides rapid feedback while ensuring reliability of critical game systems.

**Current State:** Limited Jest unit tests, minimal Playwright E2E tests, manual testing required for most changes, underutilized test harnesses.

**Objective:** Build automated validation pipeline supporting LLM-driven development with 80%+ coverage of critical paths.

---

## 1. Current State Assessment

### 1.1 Existing Testing Infrastructure

**Unit Testing:**
- Jest framework with multi-project setup (core, server, node-red)
- 15 test files in core module covering basic utilities
- Existing test harness: `ShipTestHarness` for physics simulation
- Property-based testing with fast-check for mathematical functions
- Mock implementations for dice rolling and drivers

**E2E Testing:**
- Playwright framework configured for Chromium only
- Single integration test with visual regression snapshots
- Docker-based test environment setup

**Test Infrastructure:**
- Module-based organization with path mapping
- Basic CI integration (GitHub Actions inferred)
- No automated API documentation testing

### 1.2 Critical Testing Gaps

**High Priority:**
- Physics calculations (movement, collision detection)
- State synchronization between clients
- Command handling and validation
- Ship system interactions
- Multi-client scenarios

**Medium Priority:**
- Room lifecycle management
- Error handling and edge cases
- Performance characteristics
- Cross-browser compatibility

**Low Priority:**
- Visual regression (UI styling)
- Complete API surface testing
- Node-RED integration flows

---

## 2. Testing Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Pyramid                              │
├─────────────────────────────────────────────────────────────────┤
│  E2E Tests (5%)     │ Visual regression, multi-client           │
│                     │ Critical user workflows                   │
├─────────────────────────────────────────────────────────────────┤
│  Integration Tests  │ Client-server communication               │
│  (15%)              │ State synchronization                     │
│                     │ Room lifecycle                            │
├─────────────────────────────────────────────────────────────────┤
│  Unit Tests (80%)   │ Core logic, utilities                     │
│                     │ Ship systems, physics                     │
│                     │ Command handlers                          │
└─────────────────────────────────────────────────────────────────┘
```

**Strategy:** Focus on unit and integration tests for LLM development speed, selective E2E for critical paths.

---

## 3. Unit Testing Enhancement

### 3.1 Critical Path Coverage Targets

**Physics Engine (Priority 1):**
- Collision detection algorithms
- Movement calculations (XY.equationOfMotion)
- Velocity/position updates
- Spatial indexing performance
- Edge cases: zero velocity, extreme values

**State Management (Priority 1):**
- Colyseus schema synchronization
- Decorator behavior (@gameField, @tweakable, @range)
- JSON Pointer command handling
- State validation and range capping

**Ship Systems (Priority 1):**
- System interactions (reactor → thrusters → movement)
- Heat management and cooling
- Power distribution
- Damage and repair mechanics
- Smart pilot modes

**Space Objects (Priority 2):**
- Object lifecycle (spawn/destroy)
- Collision response
- Property inheritance
- Serialization/deserialization

### 3.2 Test Structure Design

```
modules/core/test/
├── unit/
│   ├── physics/
│   │   ├── collision-detection.spec.ts
│   │   ├── movement-calculations.spec.ts
│   │   └── spatial-index.spec.ts
│   ├── state/
│   │   ├── schema-sync.spec.ts
│   │   ├── decorators.spec.ts
│   │   └── commands.spec.ts
│   ├── ship/
│   │   ├── system-interactions.spec.ts
│   │   ├── heat-management.spec.ts
│   │   └── smart-pilot.spec.ts
│   └── space/
│       ├── object-lifecycle.spec.ts
│       └── collision-response.spec.ts
├── integration/
│   ├── client-server-sync.spec.ts
│   └── multi-system-interaction.spec.ts
└── utils/
    ├── test-factories.ts
    ├── test-harness.ts
    └── mocks/
        ├── colyseus-room.ts
        └── ship-driver.ts
```

### 3.3 Test Utilities and Helpers

**Test Data Factories:**
```typescript
// Ship state factory
export const createShipState = (overrides: Partial<ShipState> = {}) => ({
  id: 'test-ship-1',
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  angle: 0,
  systems: {
    reactor: createReactorState(),
    maneuvering: createManeuveringState(),
    // ... other systems
  },
  ...overrides
});

// Space state factory
export const createSpaceState = (shipCount = 1) => {
  const space = new SpaceState();
  for (let i = 0; i < shipCount; i++) {
    const ship = new Spaceship();
    ship.id = `ship-${i}`;
    space.spaceships.set(ship.id, ship);
  }
  return space;
};
```

**Mock Implementations:**
```typescript
// Colyseus room mock
export class MockColyseusRoom {
  constructor(private state: any) {}

  send(client: any, message: any) {
    // Mock implementation
  }

  broadcast(message: any) {
    // Mock implementation
  }
}

// Ship manager mock
export class MockShipManager {
  constructor(private shipState: ShipState) {}

  update(deltaTime: number) {
    // Record calls for verification
    this.updateCalls.push(deltaTime);
  }
}
```

### 3.4 Coverage Strategy

**Target Coverage:**
- **Critical Paths:** 90%+ (physics, state sync, commands)
- **Core Logic:** 80%+ (ship systems, space objects)
- **Utilities:** 70%+ (helpers, calculations)

**Exclusion Strategy:**
- UI components (covered by E2E)
- Third-party integrations (Node-RED)
- Static configuration data
- Development utilities

---

## 4. Integration Testing Framework

### 4.1 Client-Server Communication Tests

**WebSocket Connection Lifecycle:**
```typescript
describe('Client-Server Communication', () => {
  let server: TestGameServer;
  let client: TestClient;

  beforeEach(async () => {
    server = await createTestServer();
    client = await createTestClient(server.url);
  });

  afterEach(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should maintain state synchronization', async () => {
    // Test state changes propagate correctly
    const shipState = await client.getShipState('ship-1');
    expect(shipState.position.x).toBe(0);

    await server.updateShipPosition('ship-1', { x: 100, y: 50 });
    await client.waitForStateSync();

    const updatedState = await client.getShipState('ship-1');
    expect(updatedState.position.x).toBe(100);
  });
});
```

**Multi-Client Scenarios:**
```typescript
describe('Multi-Client Synchronization', () => {
  let server: TestGameServer;
  let client1: TestClient;
  let client2: TestClient;

  beforeEach(async () => {
    server = await createTestServer();
    client1 = await createTestClient(server.url, 'client-1');
    client2 = await createTestClient(server.url, 'client-2');
  });

  it('should sync state changes across all clients', async () => {
    // Both clients see same initial state
    const state1 = await client1.getSpaceState();
    const state2 = await client2.getSpaceState();
    expect(state1.spaceships.size).toBe(state2.spaceships.size);

    // State change visible to both clients
    await client1.sendCommand('/spaceship/ship-1/position', { x: 100 });
    await client1.waitForStateSync();
    await client2.waitForStateSync();

    const updatedState1 = await client1.getSpaceState();
    const updatedState2 = await client2.getSpaceState();
    expect(updatedState1.spaceships.get('ship-1').position.x).toBe(100);
    expect(updatedState2.spaceships.get('ship-1').position.x).toBe(100);
  });
});
```

### 4.2 State Synchronization Validation

**Schema Sync Tests:**
```typescript
describe('State Synchronization', () => {
  it('should handle concurrent state updates', async () => {
    const promises = [
      client.updateShipSystem('ship-1', 'thruster', { power: 0.8 }),
      client.updateShipSystem('ship-1', 'reactor', { power: 0.9 }),
      client.updateShipSystem('ship-1', 'maneuvering', { rotation: 45 })
    ];

    await Promise.all(promises);
    await client.waitForStateSync();

    const shipState = await client.getShipState('ship-1');
    expect(shipState.systems.thruster.power).toBe(0.8);
    expect(shipState.systems.reactor.power).toBe(0.9);
    expect(shipState.systems.maneuvering.rotation).toBe(45);
  });
});
```

### 4.3 Command Flow Testing

**JSON Pointer Command Tests:**
```typescript
describe('Command Flow', () => {
  it('should validate and apply commands correctly', async () => {
    // Test valid command
    await client.sendCommand('/spaceship/ship-1/velocity', { x: 100, y: 50 });
    await client.waitForStateSync();

    const shipState = await client.getShipState('ship-1');
    expect(shipState.velocity.x).toBe(100);
    expect(shipState.velocity.y).toBe(50);

    // Test command validation
    await expect(
      client.sendCommand('/spaceship/ship-1/velocity', { x: 'invalid' })
    ).rejects.toThrow(ValidationError);
  });
});
```

### 4.4 Room Lifecycle Tests

**Room Management:**
```typescript
describe('Room Lifecycle', () => {
  it('should handle ship room creation and cleanup', async () => {
    const shipId = await server.createShip();
    expect(await server.getRoomCount()).toBe(2); // AdminRoom + ShipRoom

    await server.destroyShip(shipId);
    expect(await server.getRoomCount()).toBe(1); // Only AdminRoom
  });
});
```

---

## 5. E2E Testing Expansion

### 5.1 Key User Workflows to Test

**Priority 1 (Core Gameplay):**
- Ship movement and control
- Weapon firing and targeting
- Damage and repair systems
- Multi-ship combat scenarios
- Docking procedures

**Priority 2 (System Management):**
- Screen layout switching
- Widget interactions
- Real-time system monitoring
- Command input handling

**Priority 3 (Advanced Features):**
- Smart pilot automation
- Warp drive mechanics
- Radar range and detection
- Cross-browser compatibility

### 5.2 Visual Regression Strategy

**Snapshot Management:**
```typescript
// Playwright test with visual regression
test('tactical radar display', async ({ page }) => {
  await page.goto('/screens/ship');

  // Wait for radar to render
  await page.waitForSelector('[data-testid="tactical-radar"]');

  // Take snapshot of critical UI elements
  await expect(page.locator('[data-testid="tactical-radar"]'))
    .toHaveScreenshot('tactical-radar.png');

  // Test UI state changes
  await page.click('[data-testid="zoom-in"]');
  await expect(page.locator('[data-testid="tactical-radar"]'))
    .toHaveScreenshot('tactical-radar-zoomed.png');
});
```

**Cross-Browser Considerations:**
- Primary: Chromium (current setup)
- Secondary: Firefox (for layout differences)
- Mobile: iPhone/Android (touch interactions)

### 5.3 Performance Benchmarks

**Frame Rate Monitoring:**
```typescript
test('maintains 30 FPS during combat', async ({ page }) => {
  await page.goto('/screens/ship');

  const frameTimes = await page.evaluate(() => {
    const times: number[] = [];
    let lastTime = performance.now();

    const measureFrame = () => {
      const now = performance.now();
      times.push(now - lastTime);
      lastTime = now;

      if (times.length < 100) {
        requestAnimationFrame(measureFrame);
      }
    };

    requestAnimationFrame(measureFrame);
    return new Promise<number[]>(resolve =>
      setTimeout(() => resolve(times), 3000)
    );
  });

  const avgFrameTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
  const avgFPS = 1000 / avgFrameTime;
  expect(avgFPS).toBeGreaterThan(25); // Allow some variance from 30 FPS target
});
```

---

## 6. Test Infrastructure Improvements

### 6.1 Enhanced Test Harness

**Extended ShipTestHarness:**
```typescript
export class EnhancedShipTestHarness extends ShipTestHarness {
  constructor(options: TestHarnessOptions = {}) {
    super();
    this.options = options;
  }

  // Time manipulation
  advanceTime(seconds: number) {
    // Simulate time passage for testing time-dependent systems
  }

  // State inspection
  getSystemHistory(systemName: string): SystemState[] {
    return this.systemHistory[systemName] || [];
  }

  // Scenario builders
  createCombatScenario(shipCount: number): CombatTestScenario {
    // Set up multiple ships in combat configuration
  }

  createDockingScenario(): DockingTestScenario {
    // Set up ship docking scenario
  }
}
```

### 6.2 Shared Test Utilities

**Assertion Helpers:**
```typescript
export const TestAssertions = {
  // Physics assertions
  assertPosition(actual: XY, expected: XY, tolerance = 0.1) {
    expect(actual.x).toBeCloseTo(expected.x, tolerance);
    expect(actual.y).toBeCloseTo(expected.y, tolerance);
  },

  // State synchronization assertions
  async assertStateSync(client: TestClient, serverState: any) {
    await client.waitForStateSync();
    const clientState = await client.getCurrentState();
    expect(clientState).toEqual(serverState);
  },

  // Performance assertions
  assertPerformance(measurements: number[], threshold: number) {
    const avg = measurements.reduce((a, b) => a + b) / measurements.length;
    expect(avg).toBeLessThan(threshold);
  }
};
```

### 6.3 Mock Implementations

**Comprehensive Mocks:**
```typescript
// WebSocket mock for testing
export class MockWebSocket implements WebSocket {
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    // Simulate connection after delay
    setTimeout(() => this.onopen?.(new Event('open')), 10);
  }

  send(data: string) {
    // Mock send implementation
  }

  close() {
    setTimeout(() => this.onclose?.(new CloseEvent('close')), 5);
  }
}
```

### 6.4 CI/CD Integration

**Test Execution Pipeline:**
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit -- --coverage

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2, Effort: M)

**Priority:** Critical path unit tests for LLM development speed

1. **Enhanced Test Harness**
   - Extend existing ShipTestHarness with time manipulation
   - Add state history tracking
   - Create scenario builders for common test cases

2. **Physics Engine Tests**
   - Collision detection algorithms
   - Movement calculations (XY.equationOfMotion)
   - Edge cases and boundary conditions

3. **State Management Tests**
   - Colyseus schema synchronization
   - Decorator behavior validation
   - JSON Pointer command handling

**Success Metrics:**
- 80% coverage of physics calculations
- 90% coverage of state synchronization
- Test execution time < 30 seconds

### Phase 2: Core Systems (Week 3-4, Effort: L)

**Priority:** Ship systems and core game logic

1. **Ship System Integration Tests**
   - System interaction validation (reactor → thrusters → movement)
   - Heat and power management
   - Damage and repair mechanics

2. **Command System Tests**
   - JSON Pointer command validation
   - Range capping and error handling
   - Concurrent command processing

3. **Space Object Tests**
   - Object lifecycle management
   - Collision response testing
   - Serialization round-trips

**Success Metrics:**
- 80% coverage of ship systems
- 70% coverage of command handling
- Integration tests pass consistently

### Phase 3: Client-Server Integration (Week 5-6, Effort: L)

**Priority:** Multi-client scenarios and state sync

1. **Client-Server Communication Tests**
   - WebSocket connection lifecycle
   - State synchronization validation
   - Network error handling

2. **Multi-Client Scenarios**
   - Concurrent state updates
   - Room lifecycle management
   - Cross-client state consistency

3. **Performance Validation**
   - State update frequency
   - Memory usage patterns
   - Network message volume

**Success Metrics:**
- All integration tests pass
- State sync latency < 50ms
- Memory usage stable under load

### Phase 4: E2E Enhancement (Week 7-8, Effort: M)

**Priority:** Critical user workflows

1. **Core Gameplay E2E Tests**
   - Ship movement and control
   - Weapon firing mechanics
   - Multi-ship combat scenarios

2. **Visual Regression Setup**
   - Critical UI component snapshots
   - Cross-browser compatibility
   - Layout consistency validation

3. **Performance Benchmarks**
   - Frame rate monitoring
   - Load time measurement
   - Memory leak detection

**Success Metrics:**
- 5 core gameplay workflows tested
- Visual regression pipeline operational
- Performance benchmarks established

### Phase 5: Polish and Documentation (Week 9-10, Effort: S)

**Priority:** Developer experience and maintenance

1. **Test Documentation**
   - Testing guide for contributors
   - Test patterns and best practices
   - Debugging workflow documentation

2. **CI/CD Optimization**
   - Parallel test execution
   - Caching strategies
   - Failure analysis automation

3. **Maintenance Tools**
   - Test data generation utilities
   - Snapshot update workflows
   - Coverage reporting improvements

**Success Metrics:**
- Complete testing documentation
- CI/CD pipeline < 10 minutes
- 80%+ overall coverage maintained

---

## 8. Testing Documentation Strategy

### 8.1 Testing Guide for Contributors

**Structure:**
```markdown
# Testing Guide

## Quick Start
- [Running Tests](./docs/testing/running-tests.md)
- [Writing Unit Tests](./docs/testing/unit-tests.md)
- [Writing Integration Tests](./docs/testing/integration-tests.md)
- [Writing E2E Tests](./docs/testing/e2e-tests.md)

## Test Patterns
- [Test Data Factories](./docs/testing/test-factories.md)
- [Mock Implementations](./docs/testing/mocks.md)
- [Assertion Helpers](./docs/testing/assertions.md)

## Debugging
- [Debugging Test Failures](./docs/testing/debugging.md)
- [Performance Profiling](./docs/testing/performance.md)
- [Coverage Analysis](./docs/testing/coverage.md)
```

### 8.2 Test Patterns and Best Practices

**Unit Test Pattern:**
```typescript
describe('SystemName', () => {
  let harness: TestHarness;
  let systemUnderTest: SystemUnderTest;

  beforeEach(() => {
    harness = createTestHarness();
    systemUnderTest = harness.createSystem();
  });

  describe('when condition', () => {
    it('should expected behavior', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = systemUnderTest.process(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

**Integration Test Pattern:**
```typescript
describe('Component Integration', () => {
  let server: TestServer;
  let client: TestClient;

  beforeAll(async () => {
    server = await createTestServer();
    client = await createTestClient(server.url);
  });

  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should integrate correctly', async () => {
    // Test integration behavior
  });
});
```

### 8.3 Running Tests Locally and in CI

**Local Development:**
```bash
# Run all tests
npm test

# Run specific test project
npm run test:core

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run specific test file
npm run test -- modules/core/test/physics/collision-detection.spec.ts
```

**CI/CD Integration:**
```bash
# Parallel execution
npm run test:unit -- --maxWorkers=4

# Coverage reporting
npm run test:coverage -- --coverageReporters=json-lcov

# E2E with retries
npm run test:e2e -- --retries=3
```

---

## 9. Success Metrics and Monitoring

### 9.1 Coverage Targets

| Component | Target Coverage | Current Coverage | Priority |
|-----------|----------------|------------------|----------|
| Physics Engine | 90% | 30% | Critical |
| State Management | 90% | 20% | Critical |
| Ship Systems | 80% | 15% | High |
| Command System | 80% | 10% | High |
| Space Objects | 70% | 25% | Medium |
| Client Rendering | 60% | 5% | Low |

### 9.2 Performance Benchmarks

**Test Execution Speed:**
- Unit tests: < 30 seconds
- Integration tests: < 2 minutes
- E2E tests: < 5 minutes
- Full suite: < 10 minutes

**Runtime Performance:**
- State sync latency: < 50ms
- Frame rate: > 25 FPS during combat
- Memory usage: < 100MB per ship
- Network messages: < 1000/second peak

### 9.3 Quality Gates

**Pre-merge Requirements:**
- All unit tests pass
- Integration tests pass
- Coverage doesn't decrease by > 2%
- No new console.error() statements
- Performance benchmarks maintained

**Release Requirements:**
- All tests pass (unit, integration, E2E)
- Coverage > 70% for critical paths
- Visual regression tests pass
- Performance benchmarks met

---

## 10. Risk Assessment and Mitigation

### 10.1 Technical Risks

**Risk:** Colyseus schema changes break tests
- **Mitigation:** Version pinning, comprehensive schema sync tests

**Risk:** Physics calculations are complex to test
- **Mitigation:** Property-based testing, edge case analysis

**Risk:** Multi-client scenarios are flaky
- **Mitigation:** Deterministic test data, retry mechanisms

### 10.2 Implementation Risks

**Risk:** Test maintenance becomes burdensome
- **Mitigation:** Simple test patterns, good documentation

**Risk:** Coverage goals are unrealistic
- **Mitigation:** Focus on critical paths, pragmatic targets

**Risk:** Performance impact on development speed
- **Mitigation:** Parallel execution, fast feedback loops

---

## Conclusion

This testing strategy provides a comprehensive roadmap for enhancing Starwards' testing infrastructure while maintaining focus on LLM-driven development needs. By prioritizing critical paths and implementing fast, reliable tests, the project can achieve confident automated validation without sacrificing development velocity.

**Key Success Factors:**
1. **Focus on Critical Paths:** Physics, state sync, commands
2. **Fast Feedback:** Unit tests < 30s, integration < 2min
3. **Maintainable Tests:** Simple patterns, good documentation
4. **Pragmatic Coverage:** 80%+ for critical paths, realistic goals
5. **Developer Experience:** Easy to write, run, and debug tests

The implementation follows a phased approach allowing for incremental improvement while providing immediate value for LLM-driven development workflows.