# Decision: TypeScript scenario files instead of visual editor or Lua

**Date:** 2026-04
**Status:** Accepted

## Context

Maps are currently inlined in game code. Organizers can't author scenarios without code changes, rebuilds, and redeployment. EmptyEpsilon uses Lua scripting. Starwards needed a scenario authoring approach.

Options considered:
1. Declarative format (JSON/YAML)
2. Node-RED flows
3. Lua scripting (match EE)
4. Visual scenario editor
5. TypeScript files

## Decision

TypeScript scenario files loaded from disk. A scenario exports an `async setup(game: GameAPI)` function. The LARP organizers are programmers (or "vibe coders"), and the game is already TypeScript — same language, full type safety, IDE support.

Phase 1 (pre-event): External scenario files define initial state.
Phase 2 (post-event): Runtime event handlers for scripted encounters.

## Consequences

- **Low implementation cost** — the GameAPI surface already exists (it's what tweakpane uses).
- **Organizers iterate in their IDE** — no new tools to learn.
- **AI-friendly** — TypeScript scenarios are easy to generate with AI assistance.
- **Trade-off:** Not visual. Non-programmers can't author scenarios. Acceptable for Helios team; may need revisiting for broader adoption.
