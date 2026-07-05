# AGENTS.md

This file is the canonical entry point for AI coding agents (Claude Code,
Codex, Cursor, Aider, Continue, etc.) working on Starwards. It is kept
intentionally short so it stays in sync; the real content lives in
`CLAUDE.md` and the per-task skills under `.claude/skills/`.

## Read these first

1. **`CLAUDE.md`** at the repo root — quick commands, state access patterns,
   architecture overview, common pitfalls.
2. **`.claude/skills/`** — task-specific playbooks. Start with
   `starwards-workflow` (master index), then load the skill that matches
   your task (e.g. `starwards-tdd`, `starwards-debugging`,
   `starwards-colyseus`, `starwards-station-ui`,
   `starwards-verification`).
3. **`docs/PATTERNS.md`** and **`docs/ARCHITECTURE.md`** — gotchas and
   system design.
4. **`docs/json-ptr.md`** — the remote command surface and the
   `@commandable` whitelist (PR bodies are checked for compliance).

## Hard rules

- **Source of truth.** For ship position / velocity / angle, modify the
  `SpaceObject` in `SpaceManager`, NOT `ship.state.*`. Writes to
  `ship.state.position/velocity/angle` are silently overwritten by
  `syncShipProperties` every tick. This is enforced by an ESLint rule.
- **`@gameField` is the innermost decorator.** Order is `@range →
@tweakable → @commandable → @gameField` (top to bottom). Reordering
  silently breaks Colyseus type setup. Enforced by an ESLint rule.
- **Remote-writable properties must satisfy one of four admission clauses**
  (see `docs/json-ptr.md`):
    1. `@commandable()` — explicit player command surface.
    2. `@commandable({ '/x': true, '/y': true })` on a parent property — admits
       specific sub-pointers on a nested Schema type (e.g., Vec2 components).
       Use `@commandableSchema({ '/prop/x': true })` at the class level for the
       same effect. Both mirror the `@range` / `@rangeSchema` pattern.
    3. `@tweakable` — implicitly commandable; the GM tweak panel writes it.
    4. `DesignState` subclass — all fields implicitly commandable; the GM
       design-state panel writes every field.
       A bare `@gameField` that satisfies none of these is broadcast to clients
       but **rejected** (throws) by the JSON Pointer setter.
- **Do not add exports to `modules/core/src/index.public.ts`** without
  explicit reviewer approval. Internal symbols live in `index.internal.ts`
  and are reached via `@starwards/core/internal` (see
  `modules/core/package.json` `exports`).
- **No skipping hooks, no disabling tests, no editing CI workflows** to
  make a red build go green. Fix the underlying issue.

## Verification before opening a PR

Run locally and paste the output in the PR description:

```bash
npm run test:static          # types + format
npm test                     # unit tests
# If you touched a station screen:
npm run test:e2e -- modules/e2e/test/visual/<the-spec>.spec.ts
```

Fill in the PR template (`.github/pull_request_template.md`): a summary
and the tests you added or ran. There is no checkbox attestation — the
invariants listed above are enforced mechanically by the `local/*` lint
rules in `eslint.config.mjs`, the runtime `@commandable` whitelist, and
the CI test jobs.
