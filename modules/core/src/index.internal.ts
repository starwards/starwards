// Internal API surface for @starwards/core.
//
// This entry point exists so consumers (modules/server, modules/node-red,
// internal tests) can reach implementation details that should NOT be part
// of the public surface, while modules/browser is forbidden from importing
// it (enforced by `.dependency-cruiser.cjs` rule
// `no-core-internal-from-browser`).
//
// Today this re-exports the same set as `index.ts`, so PR4 is a no-op for
// runtime behavior. The point is to land the entry point and the
// dependency-cruiser fence first; subsequent PRs can move symbols out of
// `index.ts` (the public surface) without breaking server / node-red,
// because they will already be importing internals via this path.
//
// To migrate a consumer:
//
//     // Before:
//     import { SpaceManager } from '@starwards/core';
//     // After (if SpaceManager becomes internal-only):
//     import { SpaceManager } from '@starwards/core/internal';
//
// See `docs/maintainers.md` and the PR template checklist.

export * from './index';
