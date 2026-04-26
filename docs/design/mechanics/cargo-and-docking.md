# Cargo & Docking

## Docking (Designed — [#539](https://github.com/starwards/starwards/issues/539))

Ship-in-ship docking is mandatory for LARP events (space stations are ships; players need to dock for repairs and resupply).

**Mechanics:**
- Docking capability matrix (which ships can dock where)
- Compound movement (docked ship follows parent's position and rotation)
- Velocity synchronization
- Pilot-initiated docking command
- Position/angle preservation after undocking

**Related:** Dock Master functionality ([#538](https://github.com/starwards/starwards/issues/538)) — station-side docking management, blocked on docking.

## Cargo (Deferred — [#548](https://github.com/starwards/starwards/issues/548))

Cargo system explicitly deferred to post-first-event. Stakeholder decision: not critical for LARP gameplay in the initial scenario. EE has cargo (transfer between docks, supply drops, goods trading), but Starwards will skip this for now.

## Why docking matters for LARP

Armor is only repairable at stations → combat creates a need to dock → docking is a narrative beat (seeking repairs, resupply, player interaction at stations). This cycle drives LARP storytelling.
