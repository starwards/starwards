# Radar & Scanning

> **See also:** [`docs/MS3/SCAN_LEVELS_DESIGN.md`](../../MS3/SCAN_LEVELS_DESIGN.md) and [`docs/MS3/SIGNALS_JOBS_DESIGN.md`](../../MS3/SIGNALS_JOBS_DESIGN.md) — detailed technical specs for scan levels and the signals jobs system summarized below.

## Radar System (Partial)

Multiple radar types serve different stations:
- **Tactical radar** (Weapons) — real-time contacts, target highlighting
- **Dradis radar** (Relay) — alternative display with probe coverage
- **Navigator radar** (Navigator) — warp topology overlay (designed, not built)
- **Long-range radar** (Signals) — extended range for intelligence (designed, not built)

Radar range = `maxRange x effectiveness`. Unpowered radar shows nothing.

## Scan Levels (Partial)

3-tier progressive reveal system. All contacts start as unknowns. The Signals officer actively scans to reveal information.

| Level | Label | What you see |
|-------|-------|-------------|
| 0 | UFO | Distance, heading, relative speed (physics only) |
| 1 | Basic | + Faction, ship model |
| 2 | Advanced | + All systems, damage, armor status |

**Properties:**
- Persistent — once scanned, stays scanned (no decay)
- Faction-shared — one ship's scan benefits all allies
- Progressive — can't skip from 0 to 2

## Signals Jobs (Partial — [#1206](https://github.com/starwards/starwards/issues/1206))

The Signals station operates through a job queue (max 9 jobs, FIFO execution):

**Scan:** Upgrade target scan level. 15-30s (Lvl0→1) or 30-60s (Lvl1→2). 70-90% success rate.

**Hack:** Reduce target system effectiveness by 50% for 2-3 minutes. Requires Lvl2 scan. 30-60s duration. 50-70% success rate. 1-minute cooldown per target system.

**Track:** Maintain visibility on a target beyond line-of-sight. Instant, 100% success. Max 3 tracked targets.

System malfunctions degrade job performance: +25% duration, +20% fail chance per defect. At 3+ defects, 50% chance of alerting the target on failure.

## Open Issues

- [#969](https://github.com/starwards/starwards/issues/969) — Radar improvements (mega-task)
- [#1001](https://github.com/starwards/starwards/issues/1001) — Emissions signature (WIP)
