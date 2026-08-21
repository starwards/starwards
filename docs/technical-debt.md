---
audience: both
depth: light
related:
    - testing/coverage-strategy.md
    - DEPENDENCIES.md
last_verified: 2026-08-18
---

# Technical debt and documentation gaps

Known weak spots in the codebase and in this KB. Everything here is a deliberate "not yet",
not a bug — bugs go to [issues](https://github.com/starwards/starwards/issues).

## Documentation gaps

- **JSDoc is sparse.** Public core APIs carry few `@param`/`@returns` tags, and nothing generates
  API docs from them — no typedoc or jsdoc tooling is configured.
- **Diagrams are ASCII only.** [`ARCHITECTURE.md`](ARCHITECTURE.md) has a system-overview and a
  state-tree diagram in text; there are no rendered graphics.
- **No game-mechanics guide for players.** [`guides/`](guides/FLIGHT_MECHANICS.md) covers flight
  only; the rest of the mechanics are documented as design reference, not as player-facing rules.
- **No ship-configuration guide.** Ship designs are TypeScript under
  [`modules/core/src/configurations/`](../modules/core/src/configurations/); nothing explains how
  to author a new one.
- **No map/scenario-creation guide.** Scenarios live in
  [`modules/server/src/maps.ts`](../modules/server/src/maps.ts); see
  [decision 005](design/decisions/005-typescript-scenarios.md) for why they are code.

## Technical debt

- **Coverage is gated but low.** The `coverage-core` CI job enforces thresholds set in the
  `test:coverage:core` script in the root `package.json`. Targets and the ratchet plan:
  [`testing/coverage-strategy.md`](testing/coverage-strategy.md).
- **No generated API documentation.** Follows from the sparse JSDoc above.
- **Webpack dev server needs the legacy OpenSSL flag.** `NODE_OPTIONS=--openssl-legacy-provider`
  is set in `.vscode/tasks.json`; the same workaround is in
  [`DEVELOPMENT.md`](DEVELOPMENT.md) under Common Issues.
- **A few bare `console.error()` calls** remain in the E2E harness
  (`modules/e2e/test/`), where a failure should surface as an assertion instead.

## Modernization options

Neither is scheduled; both are live options with a known cost.

- **React 19.** React 18 is pinned because Arwes (`@arwes/react`) is built against it — see
  [`DEPENDENCIES.md`](DEPENDENCIES.md) and the `react-version-migration` skill.
- **Vite instead of Webpack.** The browser build is still Webpack 5.
