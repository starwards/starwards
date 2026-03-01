# ADR: ShipRooms for NPC Ships

## Status
Accepted

## Context
The GM needs full visibility and control over NPC ships — subsystem inspection, idle strategy, design state, armor, etc. Previously NPC ships had no ShipRooms, so the GM tweak panel couldn't show ShipState-dependent controls (currentTask, idleStrategy, systems, armor, design). The GM only had SpaceRoom-level controls (drag, rotate, right-click orders).

## Options Considered

| # | Option | Summary | Rejected Because |
|---|--------|---------|-----------------|
| A | SpaceRoom commands | Route NPC commands through SpaceRoom | Requires duplicating all ShipState command handlers; doesn't expose ShipState to client |
| B | Mirrored fields | Copy ShipState fields onto SpaceObject | Bloats SpaceObject schema; dual-write maintenance burden |
| C | Read-only driver | Create a read-only ShipDriver without a room | ShipDriver assumes a Colyseus room connection; large refactor |
| D | Singleton NPC room | One room for all NPC ships | Complex multiplexing; doesn't fit Colyseus room-per-entity model |
| **E** | **Per-NPC ShipRooms** | **Create a ShipRoom for every ship, PC or NPC** | **Selected** |

## Decision
**Option E: Per-NPC ShipRooms.** Every ship (PC and NPC) gets a ShipRoom. The only distinction is whether the ship ID appears in `playerShipIds`.

## Rationale
- Minimal code change: widen `ShipRoom.onCreate` type, unify the room-creation branch
- Reuses existing ShipDriver/ShipRoom infrastructure with zero new abstractions
- GM gets full NPC inspection and control for free
- Consistent architecture: all ships are equal at the room level

## Changes
1. `ShipRoom.onCreate` accepts `ShipManager` (abstract base) instead of `ShipManagerPc`
2. `GameManager.initShipManagerAndRoom` creates rooms for all ships, not just player ships
3. `tweakWidget` removes the `isPlayerShip` guard gating ShipDriver controls
4. `convertShipType` bookkeeping simplified (no special NPC else-branch for `shipIds`)

## Known Issue: Eager GM Widget Loop
`gm.ts:109` iterates `getUniqueShipIds()` (returns `shipIds`) and eagerly connects + registers ~17 widgets per ship. With NPCs now in `shipIds`, the GM connects to all NPC ShipRooms on startup. This increases baseline resource usage proportional to NPC count.

**Impact:** Acceptable for current game sizes (< 20 ships total). Should be addressed in a follow-up with lazy connection or a separate NPC summary widget if ship counts grow significantly.

## Date
2025-06
