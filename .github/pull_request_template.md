<!--
Thank you for contributing to Starwards.

This template exists because a wave of LLM-assisted contributions is being
merged with light human review. The checkboxes below correspond to invariants
that are NOT enforced by the type system. Unchecked boxes block review.

If you are an LLM contributor (Claude, Codex, Cursor, Aider, etc.), read
`CLAUDE.md` and `AGENTS.md` at the repo root before opening this PR.
-->

## Summary

<!-- 1-3 bullet points: what changed and why. -->

## MUST fill in (do not delete this section)

State sync invariants:

- [ ] I did NOT write directly to `*.state.position`, `*.state.velocity`,
      `*.state.angle`, `*.state.turnSpeed`, or `*.state.health` outside
      `syncShipProperties` (`modules/core/src/ship/ship-manager-abstract.ts`)
      or `space-manager.ts`. If I did, I have justified it below.

`@gameField` decorator order:

- [ ] Any new `@gameField` is the INNERMOST decorator (declared LAST, below
      `@tweakable`, `@range`, etc.). Decorator order is enforced by lint;
      see `docs/PATTERNS.md`.

Remote command surface:

- [ ] Any property a client must remotely write satisfies one of four
      admission clauses: `@commandable()` (leaf), `@commandable({ '/x': true })`
      on a parent property (nested Schema descendant), `@tweakable` (GM tweak
      panel), or `DesignState` subclass (GM design-state panel). Bare
      `@gameField`s outside those clauses are **always rejected** (no
      warn-only mode). See `docs/json-ptr.md`.

Public API:

- [ ] I did NOT add new exports to `modules/core/src/index.public.ts`
      without explicit reviewer approval. Internal symbols belong in
      `index.internal.ts` and are imported via `@starwards/core/internal`.

Local verification:

- [ ] I ran `npm run test:format && npm run test:types && npm test` locally and they pass.
- [ ] If I touched a station screen, I ran the relevant E2E spec under
      `modules/e2e/test/` locally.

Skill / docs hygiene:

- [ ] If I changed behavior documented in `.claude/skills/` or `docs/`,
      I updated the relevant skill / doc in the same PR.
- [ ] No new top-level singletons, unbounded caches, or globally mutable
      module state were introduced.

## Hotspot files touched

<!-- List any files under modules/core/src/{json-ptr,game-field,ship/ship-manager-abstract,space/space-manager}.ts or modules/server/src/ship/room.ts. Write "none" if not applicable. -->

## Tests added or updated

<!-- List the new/updated test files, or "none" with justification. -->

## Skills reviewed

<!-- List any .claude/skills/* you read while preparing this PR, or "none". -->
