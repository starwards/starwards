// Internal API surface for @starwards/core.
//
// This entry point re-exports everything from the full barrel (index.ts),
// giving consumers access to implementation details that are NOT part of
// the public surface (index.public.ts).
//
// modules/server and modules/node-red import from here.
// modules/browser is forbidden from importing it (enforced by
// `.dependency-cruiser.cjs` rule `no-core-internal-from-browser`).

export * from './index';
