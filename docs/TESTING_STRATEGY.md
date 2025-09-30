# Starwards Testing Infrastructure Enhancement Guide

## Executive Summary

This guide provides practical strategies for enhancing Starwards' existing testing infrastructure. The codebase already benefits from sophisticated testing utilities including advanced property-based testing, a feature-rich ship simulation harness, and comprehensive test drivers.

**Current State:** 19 test files with sophisticated infrastructure (ShipTestHarness, property-based testing, test drivers), Playwright E2E tests, mature CI/CD pipeline.

**Objective:** Build on existing strengths to add multi-client testing capability, expand E2E coverage, and enhance debugging utilities.

---

## 1. Current State Assessment

### 1.1 Existing Testing Infrastructure

**Unit Testing (19 test files):**
- Jest with multi-project setup (core, server, node-red)
- 12 files in `modules/core/test/` - physics, state management, formulas
- 4 files in `modules/node-red/` - integration nodes
- 2 files in `modules/server/` - API, serialization
- 1 file in `modules/e2e/` - Playwright integration

**Sophisticated Infrastructure:**

**ShipTestHarness** ([`modules/core/test/ship-test-harness.ts`](../modules/core/test/ship-test-harness.ts)):
- Full physics simulation with time-stepping
- PlotlyGraphBuilder for visualization
- MockDie for deterministic randomness
- Metrics tracking (MovementTestMetrics, SpeedTestMetrics, TimedTestMetrics)
- Graph annotation and analysis

**Property-Based Testing** with fast-check:
- Custom arbitraries: `orderedDegreesTuple4()`, `differentSignTuple2()`, `safeFloat()`
- 200+ lines of property tests in `formulas.spec.ts`
- Validates mathematical properties automatically

**Test Drivers:**
- `modules/core/test/driver.ts` - Core utilities
- `modules/server/src/test/driver.ts` - Server lifecycle, network control, state assertions

**E2E Testing:**
- Playwright (Chromium)
- Visual regression snapshots
- Docker-based Linux snapshots
- Integration with game state

**CI/CD Pipeline:**
- `.github/workflows/ci-cd.yml` with 4 jobs: Test-Static, Test-Units, Test-E2e, Build
- Container-based E2E
- Artifact storage

### 1.2 What Already Works Well

1. **Physics Testing Excellence** - Property-based tests validate math, custom arbitraries cover edge cases
2. **Integrated Test Drivers** - Complete lifecycle control, socket management, direct state access
3. **Visualization** - PlotlyGraphBuilder helps debug complex interactions
4. **Mature CI/CD** - Separate stages prevent false positives
5. **Test Organization** - Flat structure works well at current scale (19 files)

### 1.3 Testing Opportunities

**High Value:**
- Multi-client state synchronization testing (biggest gap)
- Concurrent command processing validation
- Network failure/recovery scenarios
- Cross-browser E2E validation
- Performance regression detection

**Medium Value:**
- Extended E2E workflow coverage
- Combat scenario test builders
- Enhanced debugging utilities
- Test result trending

**Nice to Have:**
- Optional coverage tooling
- Automated performance benchmarking
- Visual diff tools

---

## 2. Testing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  E2E Tests (~5%)    │ Visual regression, critical workflows │
├─────────────────────────────────────────────────────────────┤
│  Integration (~15%) │ Multi-client sync (NEW), client-server│
├─────────────────────────────────────────────────────────────┤
│  Unit Tests (~80%)  │ Physics, formulas, ship systems       │
└─────────────────────────────────────────────────────────────┘
```

**Strategy:** Continue unit/integration focus for fast feedback. Add multi-client capability. Selective E2E for critical paths.

---

## 3. Unit Testing Enhancements

### 3.1 Critical Path Priorities

**Physics Engine (Already Strong):**
- ✅ Collision detection, movement calculations, spatial math
- **Add:** Raycast edge cases, multi-object collisions, physics invariants

**State Management (Good Coverage):**
- ✅ Schema serialization, range capping, system effectiveness
- **Add:** Decorator edge cases, JSON Pointer validation, concurrent updates

**Ship Systems (Integration Tests Exist):**
- ✅ Thruster integration, ship manager, heat/power
- **Add:** Multi-system chains, failure cascades, smart pilot transitions

**Space Objects:**
- ✅ Basic lifecycle
- **Add:** Collision response, attachment system, property inheritance

### 3.2 Test Structure Evolution (Optional)

**Current (works well):** Flat structure with 19 files
**Future (when >50 files):** Hierarchical organization with unit/integration/utils folders
**Migration:** Gradual, only when finding tests becomes difficult

### 3.3 Extending Test Utilities

**ShipTestHarness Additions:**
- `createCombatScenario(shipCount)` - Multi-ship setup
- `assertPhysicsInvariant(predicate, message)` - Invariant checking
- `enableStateHistory()` / `getStateAt(time)` - State debugging
- State history recording during simulation

**Property-Based Testing Extensions:**
- Ship state arbitraries
- State transition sequences
- Command commutativity tests
- Serialization round-trip validation

**Test Factories (new file: `modules/core/test/test-factories.ts`):**
- `createTestShip(overrides)` - Ship creation with defaults
- `createTestShipState(id, config, overrides)` - State creation
- `createCombatScenario(shipCount)` - Combat positioning

### 3.4 Coverage Guidance (Optional)

**Philosophy:** Coverage is diagnostic, not a success metric. Focus on critical paths regardless of percentage.

**Setup (optional):**
```javascript
// jest.config.js
collectCoverage: false, // Enable via --coverage flag
coverageDirectory: 'coverage',
collectCoverageFrom: ['modules/*/src/**/*.ts', '!modules/browser/**']
```

**What matters:** All critical physics tested, state sync validated, known edge cases covered.

---

## 4. Integration Testing

### 4.1 Multi-Client Testing Infrastructure (NEW - Biggest Gap)

**Missing Capability:** Cannot test state synchronization, concurrent commands, or multi-player scenarios.

**Implementation:**
- Create `modules/server/src/test/multi-client-driver.ts`
- Extend existing driver to create multiple Colyseus clients
- TestClient interface with `waitForSync()` and `sendCommand()` helpers
- `waitForConsistency()` to ensure all clients see same state
- Proper cleanup in afterEach

**Test Scenarios:**
- All clients see same initial state
- State changes propagate to all clients
- Concurrent commands from multiple clients
- Client joining mid-game
- Network interruption simulation

**Integration Points:**
- Build on existing `modules/server/src/test/driver.ts`
- Use existing `makeSocketsControls()` for network simulation
- Leverage existing state assertion helpers

### 4.2 Client-Server Communication Tests

**Prerequisites:** Multi-client infrastructure above

**Key Tests:**
- Client receives initial state after joining
- Client receives state updates
- Rapid state updates handled correctly
- Concurrent system updates
- JSON Pointer command validation
- Invalid command rejection
- Command queue processing

### 4.3 Room Lifecycle Tests

- Ship room creation/cleanup
- Client disconnection handling
- Room state persistence
- Multiple room management

---

## 5. E2E Testing Expansion

### 5.1 Core Workflows to Test

**Priority 1 (Partially Covered):**
- ✅ Game start/stop, tactical radar, GM view
- **Add:** Ship movement controls, weapon firing, multi-ship combat, system power allocation

**Priority 2:**
- Screen layout customization, widget drag-and-drop, real-time monitoring, damage visualization

**Priority 3:**
- Smart pilot modes, warp drive, docking, cross-browser (Firefox, Safari)

### 5.2 Visual Regression

**Current:** Playwright snapshots, Chromium only, Docker-based Linux generation

**Add:**
- Damage report visualization
- System status with multiple states
- Radar with multiple ships/projectiles
- Cross-browser testing (when ready)

### 5.3 Performance Benchmarks

**E2E Performance Tests:**
- Frame rate during combat (target >20 FPS)
- Initial page load time (<5s)
- Memory stability (growth <50MB over 30s)

---

## 6. Infrastructure Enhancements

### 6.1 CI/CD Enhancements

**Existing:** 4 jobs (Test-Static, Test-Units, Test-E2e, Build), container E2E, artifact storage

**Proposed:**
1. **Parallel Jest** - Add `--maxWorkers=4` to unit tests
2. **Test Trending** - Add jest-junit reporter, publish results action
3. **Performance Tracking** - New job for performance.spec.ts, store metrics
4. **Flaky Detection** - Already configured with retries in Playwright
5. **Coverage (Optional)** - PR-only job with Codecov upload

### 6.2 Test Documentation

**Create: `docs/testing/README.md`**

**Contents:**
- Running tests (npm commands)
- Writing tests (patterns for unit, property-based, integration)
- Using test utilities (ShipTestHarness, test drivers)
- Debugging tests (specific file, pattern matching, watch mode)
- Test organization
- Best practices

---

## 7. Implementation Priorities

**No timeline - implement based on need and value.**

### Priority 1: Multi-Client Testing (Highest Value)
**Why:** Biggest gap - cannot test multi-player scenarios
**Effort:** Large (3-4 developer-weeks)
**Deliverables:** Multi-client driver, sync tests, concurrent command tests, network simulation

### Priority 2: Extended E2E Coverage (High Value)
**Why:** Need movement, combat, system management coverage
**Effort:** Medium (2-3 developer-weeks)
**Deliverables:** Movement controls, weapon firing, multi-ship combat, power allocation tests

### Priority 3: Enhanced ShipTestHarness (Medium Value)
**Why:** Make physics tests easier, enable complex scenarios
**Effort:** Small (1 developer-week)
**Deliverables:** Combat scenario creator, physics invariants, state history

### Priority 4: Property-Based Testing Expansion (Medium Value)
**Why:** Expand beyond formulas to state transitions
**Effort:** Small (1 developer-week)
**Deliverables:** State arbitraries, commutativity tests, serialization tests

### Priority 5: CI/CD Enhancements (Nice to Have)
**Why:** Better visibility into test health
**Effort:** Small (1 developer-week)
**Deliverables:** Test trending, performance tracking, flake reporting

### Priority 6: Coverage Tooling (Optional)
**Why:** Diagnostic tool for finding gaps
**Effort:** Small (0.5 developer-weeks)
**Deliverables:** Jest coverage config, CI reports

---

## 8. Quality Indicators

**Focus on these instead of coverage percentages:**

### Test Execution Speed
- All Jest tests: < 30s (current: ~15s ✅)
- E2E tests: < 5 min (current: ~2 min ✅)
- Full CI: < 15 min (current: ~10 min ✅)

### Test Reliability
- Flake rate: < 1% of runs
- False positives: < 1 per month
- False negatives: 0 (critical)

### Developer Experience
- Time to write test: < 30 min
- Time to debug failure: < 15 min
- New contributor comprehension: < 1 hour

### Critical Path Validation
- ✅ Physics calculations (strong coverage)
- ✅ State synchronization (basic coverage, needs multi-client)
- ✅ Command handling (basic coverage, needs validation)
- ⚠️ Multi-client scenarios (missing - Priority 1)
- ✅ Serialization (basic coverage)

### Performance Characteristics
- Frame rate: > 20 FPS during combat (target 30)
- Memory: < 100MB per ship
- State sync latency: < 100ms
- Test execution: Parallel where possible

---

## 9. Risk Assessment

### Technical Risks

**Multi-client tests may be flaky:**
- Mitigation: Start simple, add retry logic, deterministic data, proper cleanup

**Property-based tests may find hard-to-fix edge cases:**
- Mitigation: Document known cases, explicit regression tests, use test.failing()

**E2E tests may become slow:**
- Mitigation: Parallel execution, test fixtures, full suite in CI only

**Colyseus updates may break tests:**
- Mitigation: Pin versions, test compatibility, modular infrastructure

### Implementation Risks

**Test infrastructure over-engineering:**
- Mitigation: Incremental build, prefer simple solutions, regular refactoring

**Breaking existing tests:**
- Mitigation: Backward compatibility, add alongside existing, thorough testing

**Test maintenance burden:**
- Mitigation: Simple/focused tests, good docs, regular review, delete obsolete

**Team adoption:**
- Mitigation: Clear docs/examples, make new patterns easier, gradual adoption

---

## Conclusion

This guide provides practical strategies for building on Starwards' strong testing foundation. Current infrastructure (ShipTestHarness, property-based testing, test drivers, CI/CD) is sophisticated and works well.

**Key Enhancements:**
1. Multi-client testing infrastructure (biggest gap, highest priority)
2. Extended E2E coverage (critical workflows)
3. Enhanced test utilities (faster test writing)
4. Property-based testing expansion (automatic edge case discovery)
5. CI/CD improvements (better visibility)

**Philosophy:**
- Build on existing strengths, don't replace what works
- Focus on critical paths, not coverage percentages
- Fast feedback > comprehensive coverage
- Simple solutions > perfect solutions
- Incremental improvement > big rewrites

**Success Indicators:**
- Multi-client scenarios testable
- Critical workflows have E2E tests
- Tests remain fast and maintainable
- Efficient test writing/debugging
- Clear CI feedback

Start with highest-value additions (multi-client testing) and expand based on actual needs and team capacity.
