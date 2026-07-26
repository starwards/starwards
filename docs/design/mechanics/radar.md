# Radar & Scanning

> **See also:** [`docs/MS3/SCAN_LEVELS_DESIGN.md`](../../MS3/SCAN_LEVELS_DESIGN.md) and [`docs/MS3/SIGNALS_JOBS_DESIGN.md`](../../MS3/SIGNALS_JOBS_DESIGN.md) — detailed technical specs for scan levels and the signals jobs system summarized below.

## Radar System (Partial)

Multiple radar types serve different stations:
- **Tactical radar** (Weapons) — real-time contacts, target highlighting
- **Dradis radar** (Relay) — alternative display with probe coverage
- **Navigator radar** (Navigator) — warp topology overlay (designed, not built)
- **Long-range radar** (Signals) — extended range for intelligence (built; drives the Signals station's main radar view)

A ship's vision is the union of its radar **sectors**. Each radar contributes one wedge — `direction` (ship-relative), `arc`, and a derived `range` — synced to clients so server and stations compute the same field of view. The dragonfly carries an omnidirectional radar (arc pinned to 360°) plus a steerable "Lancet-20" scan beam (5°–90°) pointed from the Signals station (direction/arc sliders + hotkeys).

Each radar design sweeps a constant area (`area = range² · arc`): widening the arc shortens the reach and vice versa. Effectiveness scales the area, so reach scales with √effectiveness; malfunction blends toward a floor area, and an unpowered radar sees nothing at all.

All visibility gates (signals job queueing/progress, tier-1 promotion, weapons target retention) ask one field-of-view test — `SpaceManager.isVisible` — so nothing treats radar as a circle.

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

System malfunctions degrade job performance: +25% duration, +20% fail chance per defect. At 3+ defects, 50% chance of alerting the target on failure.

## Open Issues

- [#969](https://github.com/starwards/starwards/issues/969) — Radar improvements (mega-task)
- [#1001](https://github.com/starwards/starwards/issues/1001) — Emissions signature (WIP)
