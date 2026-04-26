# Signals Station

> **See also:** [`docs/bridge-playtest/signals.md`](../../bridge-playtest/signals.md) — what shipped vs the full #1208 spec. [`docs/bridge-playtest/signals-design.md`](../../bridge-playtest/signals-design.md) — user-stated design intent that **shifts away from the queued-jobs model summarized below** toward an active mini-game framing for scan and cyber-attack. [`docs/MS3/SIGNALS_JOBS_DESIGN.md`](../../MS3/SIGNALS_JOBS_DESIGN.md) — detailed technical spec for the original queued-jobs design.

**Status:** Designed (not yet implemented)
**Crew role:** Intelligence Officer — scans, hacks, and tracks targets.
**Blocked by:** Scan levels mechanic, Signals jobs engine
**Issues:** [#1208](https://github.com/starwards/starwards/issues/1208), [#1206](https://github.com/starwards/starwards/issues/1206)

## What it does

The signals officer gathers intelligence on contacts and disrupts enemy systems. Three job types:

| Job | Duration | Success Rate | Effect |
|-----|----------|-------------|--------|
| **Scan** (Lvl0→1) | 15-30s | 70-90% | Reveals faction and ship model |
| **Scan** (Lvl1→2) | 30-60s | 70-90% | Reveals systems, damage, armor |
| **Hack** | 30-60s | 50-70% | 50% effectiveness reduction for 2-3 min |
| **Track** | Instant | 100% | Target visible beyond line-of-sight |

Job queue: max 9 jobs, sequential execution (FIFO). Malfunctions increase duration (+25%) and failure chance (+20%) per defect.

## Scan levels (3-tier progressive reveal)

| Level | What you see | What's hidden |
|-------|-------------|---------------|
| Lvl0 (UFO) | Distance, heading, speed | Everything else |
| Lvl1 (Basic) | + Faction, ship model | Systems, damage |
| Lvl2 (Advanced) | + Systems, damage, armor | Nothing |

Scan levels are persistent (no decay) and faction-shared (if one ship scans a target, all allied ships see the result).

## Widgets

- Long-range radar (extended range, zoom in/out)
- Target info panel (content varies by scan level)
- Job queue with progress bars
- Target filtering (unknown-only, enemy-only)

## Dependencies

1. Scan levels mechanic must be built first (state model, faction sharing)
2. Signals jobs engine (queue execution, success/failure calculation)
3. Then the station UI can be wired up
