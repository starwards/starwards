# Decision: Ship a 4-station game first, expand later

**Date:** 2026-04
**Status:** Accepted

## Context

MS3 originally planned 6 new stations (Signals, Navigator, Relay + docking, repair, ship models) across 6 phases over ~6 months. For a 2-person team with day jobs relying on AI-assisted development, this is high risk for timeline overrun. The project has been in development since 2021 without running a LARP event on Starwards. EmptyEpsilon remains available as fallback.

The three existing stations (Pilot, Weapons, ECR) already form a playable bridge. The question is: how much more is needed before running the first event?

## Decision

Ship a 4-station bridge (Pilot, Weapons, ECR, Signals) + GM as the first playable event. Navigator and Relay are expansion content for subsequent events.

Signals was chosen as the fourth station because:
- Already in progress (#1206 signals jobs system)
- Adds intelligence/cyber warfare — a new gameplay dimension
- Scan levels enrich radar for *all* stations, not just Signals
- Navigator requires the most technically ambitious new mechanic (procedural warp topology)
- Relay depends on Navigator (routes) and probes (new mechanic) — two blockers

## Consequences

- **Faster to event.** Cuts the critical path significantly — no warp topology, no probes, no relay.
- **Real feedback sooner.** Playtest with actual crews reveals what's actually missing vs what we assume is needed.
- **Navigator/Relay may improve.** Designs can benefit from playtesting insights before implementation.
- **Smaller crew per ship.** 4 stations instead of 7 means 4-person crews, which is actually easier to organize for a first event.
- **Risk:** Players who expected the full vision may find 4 stations limiting. Mitigation: set expectations, frame it as "Season 1."
