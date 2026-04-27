# Scenarios & Map Loading

**Status:** Planned ([#870](https://github.com/starwards/starwards/issues/870))
**Priority:** Tier 2 — needed before first LARP event

## Current state

Maps and ship configurations are **inlined in the game code**. Every scenario change requires a code change, rebuild, and redeploy. This blocks organizers from authoring and iterating on scenarios independently.

## What's needed

- [ ] External scenario file loading — TypeScript files loaded from disk at startup
- [ ] Scenario API — programmatic access to what the GM tweakpane already does
- [ ] Ship model configuration — define ship types with different stats without code changes
- [ ] Hot-reload during prep — organizers iterate without full restarts

## Approach: TypeScript scenario files

The LARP organizers are programmers (or at least "vibe coders"). TypeScript is the natural choice — same language as the game, full type safety, IDE support.

### Phase 1: External scenario files (unblocks events)

A scenario is a TypeScript file that exports an `async setup(game: GameAPI)` function. The `GameAPI` exposes what the GM tweakpane already does:

```typescript
// scenarios/patrol-encounter.ts
export async function setup(game: GameAPI) {
  const station = game.spawn('space-station', { position: [0, 0], faction: 'federation' });
  const corvette = game.spawn('corvette', { position: [1000, 500], faction: 'player' });
  const patrol = game.spawn('fighter', { position: [3000, -200], faction: 'pirate', count: 3 });
  game.order(patrol, 'ROAM', { center: [3000, 0], radius: 2000 });
}
```

Server loads scenario from disk at startup or via GM command. Organizers write scenarios in their IDE.

### Phase 2: Runtime events (post-first-event)

Scenario registers event handlers for scripted encounters during play:
```typescript
export function events(game: GameAPI) {
  game.on('shipDocked', ({ ship, station }) => { /* reinforcements arrive */ });
  game.on('timer', { after: '20m' }, () => { /* distress signal */ });
}
```

Built on top of the colyseus-events bridge that already exists.

## EE comparison

EmptyEpsilon has a full Lua scripting engine. Starwards' TypeScript approach trades Lua's lightweight embedding for full type safety and IDE support — a better fit for organizers who already code in TypeScript.
