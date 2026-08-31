# Testing, server runtime and integrations

Techniques for proving the system works and running it — test strategy, server/deployment shape, and the Node-RED integration surface.

## Testing Strategies

1. **Property-Based Testing**
    - [`fast-check`](../../package.json) library
    - Generative testing
    - Edge case discovery
    - Invariant validation

2. **Test Harness**
    - [`ship-test-harness.ts`](../../modules/core/test/ship-test-harness.ts)
    - Reusable ship/space setup via `ShipTestHarness`
    - Consistent test setup
    - Reduced duplication

3. **Test Harnesses**
    - [`ship-test-harness.ts`](../../modules/core/test/ship-test-harness.ts)
    - Complex scenario setup
    - State verification helpers
    - Integration test support

4. **Playwright E2E**
    - [`@playwright/test`](../../package.json)
    - Browser automation
    - Visual regression testing
    - Multi-browser support

5. **Jest with ts-jest**
    - [`ts-jest`](../../package.json) (`^29.4.5`)
    - TypeScript transformation configured in [`jest.config.js`](../../jest.config.js) via the `transform` map (`ts-jest` for both `^.+\.tsx?$` and `^.+\.m?js$`)
    - Uses project `tsconfig.json`
    - Quick test iterations

6. **Jest JUnit Reporter**
    - [`jest-junit`](../../package.json)
    - CI/CD integration
    - Test result reporting
    - Jenkins/TeamCity support

## Server & Deployment

7. **Colyseus Server Framework**
    - [`colyseus`](../../modules/server/package.json) server
    - Room-based architecture
    - State synchronization
    - Multiplayer support

8. **Express Middleware**
    - [`express`](../../modules/server/package.json) server
    - Static file serving
    - API endpoints
    - Admin routes

9. **Express Basic Auth**
    - [`express-basic-auth`](../../modules/server/package.json)
    - Simple authentication
    - Admin protection
    - No complex auth setup

10. **Colyseus Monitor**
    - [`@colyseus/monitor`](../../modules/server/package.json)
    - Room inspection
    - Live player counts
    - Debug interface

11. **Development vs Production**
    - [`dev.ts`](../../modules/server/src/dev.ts) and [`prod.ts`](../../modules/server/src/prod.ts)
    - Different startup configurations
    - Hot reload in dev
    - Optimized production

12. **Load Testing Support**
    - [`@colyseus/loadtest`](../../package.json)
    - Bot simulation
    - Performance benchmarking
    - Scalability testing

## Node-RED Integration

13. **Custom Node-RED Nodes**
    - [`node-red`](../../modules/node-red/package.json) config
    - [`ship-read`](../../modules/node-red/package.json) node
    - IoT integration
    - Visual programming

14. **Rollup for Editor Components**
    - [`rollup`](../../modules/node-red/package.json) build
    - Separate editor and runtime
    - Browser-compatible editor code
    - Node-compatible runtime

15. **Node-RED Examples**
    - [`examples/`](../../modules/node-red/examples/) directory
    - Flow templates
    - Usage documentation
    - Quick start guide
