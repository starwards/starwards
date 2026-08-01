# Radar & Scanning

> **Historical context:** [`docs/MS3/SCAN_LEVELS_DESIGN.md`](../../MS3/SCAN_LEVELS_DESIGN.md) and [`docs/MS3/SIGNALS_JOBS_DESIGN.md`](../../MS3/SIGNALS_JOBS_DESIGN.md) are the Nov-2025 design corpus these mechanics grew out of. They describe an earlier model; this page is the live summary.

## Radar System (Partial)

Multiple radar types serve different stations:
- **Tactical radar** (Weapons) — real-time contacts, target highlighting
- **Dradis radar** (Relay) — alternative display with probe coverage
- **Navigator radar** (Navigator) — warp topology overlay (designed, not built)
- **Long-range radar** (Signals) — extended range for intelligence (built; drives the Signals station's main radar view)

A ship's vision is the union of its radar **sectors**. Each radar contributes one wedge — `direction` (ship-relative), `arc`, and a derived `range` — synced to clients so server and stations compute the same field of view. The dragonfly carries an omnidirectional radar (arc pinned to 360°) plus a steerable "Lancet-20" scan beam (5°–90°) pointed from the Signals station (direction/arc sliders + hotkeys).

Each radar design sweeps a constant area (`area = range² · arc`): widening the arc shortens the reach and vice versa. Effectiveness scales the area, so reach scales with √effectiveness; malfunction blends toward a floor area, and an unpowered radar sees nothing at all.

All visibility gates (signals job queueing/progress, scan promotion and demotion, weapons target retention) ask one field-of-view test — `SpaceManager.isVisible` — so nothing treats radar as a circle.

## Scan Levels (Partial)

4-tier progressive reveal system. All contacts start as unknowns, and sustained line of sight reveals them.

| Level | Label | What you see |
|-------|-------|-------------|
| 0 | UFO | Distance, heading, relative speed (physics only) |
| 1 | Basic | + Faction, ship model |
| 2 | Snapshot | + All systems, damage, armor status — frozen at the moment line of sight was lost |
| 3 | Full | The same intel, live |

**Properties:**
- Faction-shared — one ship's scan benefits all allies
- Progressive — can't skip tiers
- Levels 0→1 and 1→3 are earned by holding line of sight; level 2 is only ever reached by demotion
- Levels 2 and 3 cycle with line of sight: losing sight of a level-3 contact demotes it to the level-2 snapshot, regaining sight re-promotes it. Levels 0 and 1, once reached, do not decay

## Signals Jobs (Partial — [#1206](https://github.com/starwards/starwards/issues/1206))

The Signals station operates through a job queue (up to `maxJobs`, 9 on the dragonfly). Execution is **first workable wins**, not FIFO: each tick the station works the first job whose target it can currently see and still has something to reveal, skipping the rest. Losing the working slot resets that job's progress to zero.

The station's lever is order, not submission. Prioritizing a job moves it to the front of the queue and marks it, so trimming under damage evicts unprioritized jobs first.

**Scan:** Upgrade target scan level. Auto-managed — every object in the ship's field of view below the top tier gets a scan job appended, so the station prioritizes rather than submits. Deterministic: no die roll. One tier per `scanBaseDuration` (5s) of unbroken line of sight, divided by signals effectiveness, so a half-powered station takes 10s per tier. Losing sight of the target resets its progress.

**Hack:** Halve a target system's effectiveness (`HackLevel.COMPROMISED`) for `hackEffectDuration` (150s). Requires Snapshot or better on the target. `hackBaseDuration` 45s, `hackBaseSuccessRate` 0.6 scaled by the attacker's own signals effectiveness — so a hacked signals station hacks worse — and `hackCooldown` 60s per target system. Expiry is tracked by the victim, so it lifts even if the attacker is gone.

Hack is the only job type meant to be submitted by hand, but **no client currently writes the submission command**, so the path is unreachable in play.

Two defectibles degrade the station, both normally 1: `jobSpeedFactor` scales progress per tick, and `jobSuccessFactor` scales the hack roll. The system counts as `broken` once `jobSpeedFactor` reaches 0, and damage also shrinks `currentMaxJobs` (9 → 3 → 1), so a damaged station tracks fewer contacts at once. Scans are unaffected by `jobSuccessFactor` — promotion is deterministic.

## Open Issues

- [#969](https://github.com/starwards/starwards/issues/969) — Radar improvements (mega-task)
- [#1001](https://github.com/starwards/starwards/issues/1001) — Emissions signature (WIP)
